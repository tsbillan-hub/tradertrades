import type { Metadata } from "next";
import { Flag } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/constants";
import { formatDateTime, plural, timeAgo } from "@/lib/utils";
import { TAKEDOWN_LABEL, TARGET_LABEL, targetPreview } from "@/server/admin";
import { groupByTarget, pageParam } from "@/server/queries/admin";
import { EmptyState, LinkTabs, PageHeader, Pagination } from "@/components/ui/misc";
import { TargetCard } from "@/components/admin/target-card";
import { ResolveReportForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Reports" };

type OpenReport = Prisma.ReportGetPayload<{ include: { reporter: { select: { id: true; username: true } } } }>;
type Group = ReturnType<typeof groupByTarget<OpenReport>>[number];

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;
const PER_PAGE = 30;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "closed" ? "closed" : "open";
  const [openRows, closedCount] = await Promise.all([
    db.report.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: { reporter: { select: { id: true, username: true } } },
    }),
    db.report.count({ where: { status: { not: "OPEN" } } }),
  ]);
  const groups = groupByTarget(openRows);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Things people reported. Every report on the same thing is handled together, oldest first." />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "open", href: "/admin/reports", label: "Open", count: groups.length },
          { key: "closed", href: "/admin/reports?tab=closed", label: "Closed", count: closedCount },
        ]}
      />
      {tab === "open" ? <OpenReports groups={groups.slice(0, 25)} total={groups.length} /> : <ClosedReports page={pageParam(sp.page)} total={closedCount} />}
    </div>
  );
}

async function OpenReports({ groups, total }: { groups: Group[]; total: number }) {
  if (!groups.length) return <EmptyState icon={<Flag />} title="No open reports" description="When someone reports a listing, review, post, message, video or account, it shows up here." />;
  const previews = await Promise.all(groups.map((g) => targetPreview(g.targetType, g.targetId)));
  return (
    <div className="space-y-4">
      {groups.map((g, i) => {
        const first = g.rows[0];
        return (
          <TargetCard
            key={`${g.targetType}:${g.targetId}`}
            type={g.targetType}
            preview={previews[i]}
            meta={`${plural(g.rows.length, "report")} · first ${timeAgo(first.createdAt)}`}
            form={<ResolveReportForm reportId={first.id} takedownLabel={TAKEDOWN_LABEL[g.targetType]} gone={previews[i].gone} count={g.rows.length} />}
          >
            <ul className="space-y-2" aria-label="Reports">
              {g.rows.map((r) => (
                <li key={r.id} className="rounded-lg bg-sunk/60 px-3 py-2 text-sm">
                  <div className="font-medium">{reasonLabel(r.reason)}</div>
                  {r.details ? <p className="mt-0.5 whitespace-pre-line text-ink-2">{r.details}</p> : null}
                  <div className="mt-1 text-xs text-muted">
                    From @{r.reporter.username} · <span title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </TargetCard>
        );
      })}
      {total > groups.length ? <p className="text-center text-sm text-muted">Showing the oldest {groups.length} of {total}. Handle these to see more.</p> : null}
    </div>
  );
}

async function ClosedReports({ page, total }: { page: number; total: number }) {
  const rows = await db.report.findMany({
    where: { status: { not: "OPEN" } },
    orderBy: { resolvedAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    include: { reporter: { select: { username: true } } },
  });
  if (!rows.length) return <EmptyState icon={<Flag />} title="Nothing closed yet" />;
  const resolvers = await db.user.findMany({ where: { id: { in: rows.map((r) => r.resolvedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, username: true } });
  const previews = await Promise.all(rows.map((r) => targetPreview(r.targetType, r.targetId)));
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Closed reports">
        {rows.map((r, i) => (
          <li key={r.id} className="flex flex-col gap-1 px-5 py-3.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={r.status === "ACTIONED" ? "badge badge-bad" : "badge badge-outline"}>{r.status === "ACTIONED" ? "Taken down" : "Dismissed"}</span>
                <span className="font-medium">{TARGET_LABEL[r.targetType]}</span>
                <span className="truncate text-muted">{previews[i].title}</span>
              </div>
              <div className="mt-1 text-muted">
                {reasonLabel(r.reason)} · from @{r.reporter.username}
                {r.resolution ? <span className="block text-ink-2">Note: {r.resolution}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-xs text-muted sm:text-right">
              {r.resolvedAt ? timeAgo(r.resolvedAt) : null}
              {r.resolvedById ? <div>by @{resolvers.find((u) => u.id === r.resolvedById)?.username ?? "staff"}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `/admin/reports?tab=closed&page=${p}`} />
    </>
  );
}
