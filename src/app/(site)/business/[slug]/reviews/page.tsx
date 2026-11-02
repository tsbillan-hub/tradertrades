import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, MessageSquareReply } from "lucide-react";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { pageParam } from "@/server/queries/admin";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, LinkTabs, Notice, PageHeader, Pagination, SampleBadge, Stars } from "@/components/ui/misc";
import { CompanyReplyButton } from "@/components/directory/reply-button";
import { ReportButton } from "@/components/report-button";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 20;

export default async function BusinessReviewsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company, staffView } = await requireBusiness(slug);
  const tab = sp.tab === "all" ? "all" : "waiting";
  const page = pageParam(sp.page);
  const base = { companyId: company.id, status: "PUBLISHED" as const };
  const where = tab === "waiting" ? { ...base, reply: null, isSample: false } : base;
  const [waiting, all, rows] = await Promise.all([
    db.companyReview.count({ where: { ...base, reply: null, isSample: false } }),
    db.companyReview.count({ where: base }),
    db.companyReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { user: { select: { username: true, displayName: true, avatarUrl: true } } },
    }),
  ]);
  const total = tab === "waiting" ? waiting : all;
  const href = (p: number) => `/business/${company.slug}/reviews?${new URLSearchParams({ ...(tab === "all" ? { tab } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" description="Reply in public as your company. Traders read replies as closely as the reviews themselves." />
      <Notice tone="plain">
        You can&apos;t edit or remove reviews. If one is fake, about a different company, or breaks the{" "}
        <Link href="/guidelines" className="underline underline-offset-2">
          guidelines
        </Link>
        , report it and a person checks it.
      </Notice>
      <LinkTabs
        active={tab}
        tabs={[
          { key: "waiting", href: `/business/${company.slug}/reviews`, label: "Waiting for a reply", count: waiting },
          { key: "all", href: `/business/${company.slug}/reviews?tab=all`, label: "All reviews", count: all },
        ]}
      />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={r.user.avatarUrl} name={r.user.displayName} size={34} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.user.displayName}</div>
                    <div className="text-xs text-muted">
                      {timeAgo(r.createdAt)}
                      {r.usedFor ? ` · Used it ${r.usedFor.toLowerCase()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {r.isSample ? <SampleBadge /> : null}
                  {r.proofStatus === "VERIFIED" ? (
                    <span className="badge badge-ok">
                      <ClipboardCheck /> Proof of use
                    </span>
                  ) : null}
                  <Stars value={r.rating} />
                </div>
              </div>
              <div className="mt-3 font-semibold">{r.title}</div>
              <p className="mt-1.5 text-[15px] whitespace-pre-line text-ink-2">{r.body}</p>
              {r.reply ? (
                <div className="mt-4 rounded-lg border-l-2 border-ink bg-sunk px-4 py-3">
                  <div className="text-xs font-semibold text-muted">
                    Your reply{r.repliedAt ? ` · ${timeAgo(r.repliedAt)}` : ""}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-line">{r.reply}</p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {!staffView ? <CompanyReplyButton reviewId={r.id} companyName={company.name} reply={r.reply} /> : null}
                <Link href={`/directory/c/${company.slug}#r-${r.id}`} className="btn btn-ghost btn-sm">
                  See it on your listing
                </Link>
                {!r.isSample ? <ReportButton targetType="COMPANY_REVIEW" targetId={r.id} label="Report" /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<MessageSquareReply />}
          title={tab === "waiting" ? "Every review has a reply" : "No reviews yet"}
          description={tab === "waiting" ? "New reviews show up here until you answer them." : "Reviews show up here as traders share how it went."}
        />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={href} />
    </div>
  );
}
