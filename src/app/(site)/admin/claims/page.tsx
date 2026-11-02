import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, hostname, timeAgo } from "@/lib/utils";
import { workEmailMatches } from "@/server/business";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { ClaimDecisionForm } from "@/components/admin/forms";
import { PrivateFile } from "@/components/admin/private-file";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "Listing claims" };

const userSelect = { id: true, username: true, displayName: true, avatarUrl: true, createdAt: true, email: true } as const;

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "waiting";
  const waiting = await db.companyClaim.count({ where: { status: "PENDING", documentIds: { isEmpty: false } } });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Listing claims"
        description="Most companies claim their listing with a code sent to a work email, which needs nobody here. These ones couldn't, so they sent documents instead."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "waiting", href: "/admin/claims", label: "Waiting", count: waiting },
          { key: "done", href: "/admin/claims?tab=done", label: "Done" },
        ]}
      />
      {tab === "waiting" ? <Waiting /> : <Done />}
    </div>
  );
}

async function Waiting() {
  const rows = await db.companyClaim.findMany({
    where: { status: "PENDING", documentIds: { isEmpty: false } },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: { user: { select: userSelect }, company: { include: { members: { include: { user: { select: { username: true } } } } } } },
  });
  if (!rows.length) return <EmptyState icon={<KeyRound />} title="No claims waiting" description="Claims sent with documents show up here." />;
  const files = await db.media.findMany({ where: { id: { in: rows.flatMap((r) => r.documentIds) } }, select: { id: true, mimeType: true, originalName: true } });
  return (
    <div className="space-y-4">
      <Notice tone="plain" title="What to check">
        The documents show this person works at the company (a letter on company paper, a business registration with their name, a payslip with the amounts covered). Approve
        only when you&apos;re sure: they&apos;ll be able to edit the listing and answer reviews in the company&apos;s name. The documents are deleted once you decide.
      </Notice>
      {rows.map((r) => {
        const matches = workEmailMatches(r.workEmail, r.company.website);
        return (
          <article key={r.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/directory/c/${r.company.slug}`} className="text-lg font-bold hover:underline">
                  {r.company.name}
                </Link>
                <a href={r.company.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
                  {hostname(r.company.website)} <ExternalLink className="size-3.5" />
                </a>
                {r.company.members.length ? (
                  <span className="badge badge-warn">Already run by {r.company.members.map((m) => `@${m.user.username}`).join(", ")}</span>
                ) : (
                  <span className="badge badge-outline">Not claimed yet</span>
                )}
              </div>
              <UserChip user={r.user} sub={`joined ${formatDate(r.user.createdAt)}`} />
              <dl className="grid gap-1 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="text-muted">Job title</dt>
                <dd className="font-semibold">{r.jobTitle}</dd>
                <dt className="text-muted">Email</dt>
                <dd className="min-w-0 break-words">
                  {r.workEmail}{" "}
                  {matches ? <span className="badge badge-ok ml-1">Same domain as the website</span> : <span className="badge badge-outline ml-1">Not the company&apos;s domain</span>}
                </dd>
                <dt className="text-muted">Sent</dt>
                <dd>{timeAgo(r.createdAt)}</dd>
                {r.message ? (
                  <>
                    <dt className="text-muted">Their note</dt>
                    <dd className="whitespace-pre-line">{r.message}</dd>
                  </>
                ) : null}
              </dl>
              <div className="flex flex-wrap gap-3">
                {r.documentIds.map((m) => (
                  <PrivateFile key={m} file={files.find((f) => f.id === m)} />
                ))}
              </div>
            </div>
            <div className="lg:border-l lg:border-line lg:pl-5">
              <ClaimDecisionForm claimId={r.id} company={r.company.name} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Done() {
  const rows = await db.companyClaim.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    orderBy: { reviewedAt: "desc" },
    take: 50,
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }, company: { select: { name: true, slug: true } } },
  });
  if (!rows.length) return <EmptyState icon={<KeyRound />} title="No claims yet" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Decided claims">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <UserChip user={r.user} sub={r.company.name} />
          </div>
          <div className="flex min-w-0 items-center gap-3 text-sm sm:justify-end">
            {r.reviewNote ? <span className="min-w-0 truncate text-muted">{r.reviewNote}</span> : null}
            <span className={r.status === "APPROVED" ? "badge badge-ok" : "badge badge-bad"}>
              {r.status === "REJECTED" ? "Turned down" : r.workEmailVerifiedAt ? "Work email code" : "Approved by staff"}
            </span>
            <span className="shrink-0 text-xs text-muted">{r.reviewedAt ? timeAgo(r.reviewedAt) : null}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
