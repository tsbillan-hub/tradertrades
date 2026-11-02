import type { Metadata } from "next";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { socialLabel } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { VerificationDecisionForm } from "@/components/admin/forms";
import { PrivateFile } from "@/components/admin/private-file";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "ID and socials" };

const userSelect = { id: true, username: true, displayName: true, avatarUrl: true, createdAt: true, socialLinks: { orderBy: { platform: "asc" as const } } };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "socials" ? "socials" : sp.tab === "done" ? "done" : "id";
  const [idCount, socialsCount] = await Promise.all([
    db.verificationRequest.count({ where: { status: "PENDING", kind: "IDENTITY" } }),
    db.verificationRequest.count({ where: { status: "PENDING", kind: "SOCIALS" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="ID and socials"
        description="Both badges are optional. Anyone can sell without them; they just tell buyers a little more about who they're buying from."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "id", href: "/admin/verification", label: "ID checks", count: idCount },
          { key: "socials", href: "/admin/verification?tab=socials", label: "Socials checks", count: socialsCount },
          { key: "done", href: "/admin/verification?tab=done", label: "Done" },
        ]}
      />
      {tab === "id" ? <IdChecks /> : tab === "socials" ? <SocialsChecks /> : <Done />}
    </div>
  );
}

async function IdChecks() {
  const rows = await db.verificationRequest.findMany({
    where: { status: "PENDING", kind: "IDENTITY" },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: { user: { select: userSelect } },
  });
  if (!rows.length) return <EmptyState icon={<BadgeCheck />} title="No ID checks waiting" />;
  const files = await db.media.findMany({ where: { id: { in: rows.flatMap((r) => r.mediaIds) } }, select: { id: true, mimeType: true, originalName: true } });
  return (
    <div className="space-y-4">
      <Notice tone="plain" title="What to check">
        The name on the ID matches the legal name they typed, the photo is clear, and the ID isn&apos;t expired. The photos are deleted as soon as you decide, either way.
      </Notice>
      {rows.map((r) => {
        const data = (r.data as { legalName?: string } | null) ?? {};
        return (
          <article key={r.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-4">
              <UserChip user={r.user} sub={`joined ${formatDate(r.user.createdAt)}`} />
              <dl className="grid gap-1 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-muted">Legal name</dt>
                <dd className="font-semibold">{data.legalName ?? "Not given"}</dd>
                <dt className="text-muted">Sent</dt>
                <dd>{timeAgo(r.createdAt)}</dd>
                {r.note ? (
                  <>
                    <dt className="text-muted">Their note</dt>
                    <dd className="whitespace-pre-line">{r.note}</dd>
                  </>
                ) : null}
              </dl>
              <div className="flex flex-wrap gap-3">
                {r.mediaIds.map((m) => (
                  <PrivateFile key={m} file={files.find((f) => f.id === m)} />
                ))}
              </div>
            </div>
            <div className="lg:border-l lg:border-line lg:pl-5">
              <VerificationDecisionForm requestId={r.id} kind="IDENTITY" />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function SocialsChecks() {
  const rows = await db.verificationRequest.findMany({
    where: { status: "PENDING", kind: "SOCIALS" },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: { user: { select: userSelect } },
  });
  if (!rows.length) return <EmptyState icon={<BadgeCheck />} title="No socials checks waiting" />;
  return (
    <div className="space-y-4">
      <Notice tone="plain" title="What to check">
        Open each account and look for their code in the bio. Approve only if the code is on the accounts, so we know they run them.
      </Notice>
      {rows.map((r) => {
        const data = (r.data as { code?: string; submittedAt?: string } | null) ?? {};
        return (
          <article key={r.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-4">
              <UserChip user={r.user} sub={`joined ${formatDate(r.user.createdAt)}`} />
              <div>
                <div className="text-sm text-muted">Their code</div>
                <div className="num mt-0.5 text-xl font-bold tracking-wide">{data.code ?? "?"}</div>
                {data.submittedAt ? <div className="text-xs text-muted">Sent {timeAgo(data.submittedAt)}</div> : null}
              </div>
              {r.user.socialLinks.length ? (
                <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Their accounts">
                  {r.user.socialLinks.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold">{socialLabel(l.platform)}</span>
                        <span className="ml-2 truncate text-muted">{l.handle ?? l.url}</span>
                      </span>
                      <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary btn-sm shrink-0">
                        Open <ExternalLink />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <Notice tone="warn">They removed all their social links, so there&apos;s nothing to check. Turn it down.</Notice>
              )}
            </div>
            <div className="lg:border-l lg:border-line lg:pl-5">
              <VerificationDecisionForm requestId={r.id} kind="SOCIALS" />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Done() {
  const rows = await db.verificationRequest.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] }, kind: { in: ["IDENTITY", "SOCIALS"] } },
    orderBy: { reviewedAt: "desc" },
    take: 50,
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  if (!rows.length) return <EmptyState icon={<BadgeCheck />} title="Nothing decided yet" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Decided checks">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <UserChip user={r.user} sub={r.kind === "IDENTITY" ? "ID" : "Socials"} />
          <div className="flex min-w-0 items-center gap-3 text-sm sm:justify-end">
            {r.reviewNote ? <span className="truncate text-muted">{r.reviewNote}</span> : null}
            <span className={r.status === "APPROVED" ? "badge badge-ok" : "badge badge-bad"}>{r.status === "APPROVED" ? "Approved" : "Turned down"}</span>
            <span className="shrink-0 text-xs text-muted">{r.reviewedAt ? timeAgo(r.reviewedAt) : null}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
