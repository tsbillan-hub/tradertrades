import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { plural, timeAgo } from "@/lib/utils";
import { TAKEDOWN_LABEL, TARGET_LABEL, targetPreview } from "@/server/admin";
import { RULES } from "@/server/moderation";
import { groupByTarget, pageParam } from "@/server/queries/admin";
import { EmptyState, LinkTabs, Notice, PageHeader, Pagination } from "@/components/ui/misc";
import { TargetCard } from "@/components/admin/target-card";
import { ResolveFlagForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Flagged words" };

type FlagRow = Prisma.ModerationFlagGetPayload<object>;
const ruleLabel = (id: string) => RULES.find((r) => r.id === id)?.label ?? id.replace(/_/g, " ");
const PER_PAGE = 30;

export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "closed" ? "closed" : "open";
  const [openRows, closedCount] = await Promise.all([
    db.moderationFlag.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 500 }),
    db.moderationFlag.count({ where: { status: { not: "OPEN" } } }),
  ]);
  const groups = groupByTarget(openRows);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flagged words"
        description="Our word check stops clear rule breaks (guaranteed profits, account management and so on) before they're posted. Softer claims, like income or win rate numbers, go up but land here for a person to read."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "open", href: "/admin/flags", label: "To read", count: groups.length },
          { key: "closed", href: "/admin/flags?tab=closed", label: "Done", count: closedCount },
        ]}
      />
      {tab === "open" ? <OpenFlags groups={groups.slice(0, 25)} total={groups.length} /> : <ClosedFlags page={pageParam(sp.page)} total={closedCount} />}
    </div>
  );
}

async function OpenFlags({ groups, total }: { groups: ReturnType<typeof groupByTarget<FlagRow>>; total: number }) {
  if (!groups.length) return <EmptyState icon={<ShieldAlert />} title="Nothing flagged" description="Posts, listings, reviews and comments with claims worth a second look show up here." />;
  const previews = await Promise.all(groups.map((g) => targetPreview(g.targetType, g.targetId)));
  return (
    <div className="space-y-4">
      <Notice tone="plain">Buyers&apos; reviews are never blocked, since they may quote a seller&apos;s claims, so strong matches in reviews land here too.</Notice>
      {groups.map((g, i) => (
        <TargetCard
          key={`${g.targetType}:${g.targetId}`}
          type={g.targetType}
          preview={previews[i]}
          meta={`${plural(g.rows.length, "match", "matches")} · ${timeAgo(g.rows[0].createdAt)}`}
          form={<ResolveFlagForm flagId={g.rows[0].id} takedownLabel={TAKEDOWN_LABEL[g.targetType]} gone={previews[i].gone} />}
        >
          <ul className="space-y-2" aria-label="What the check found">
            {g.rows.map((f) => (
              <li key={f.id} className="rounded-lg bg-sunk/60 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {ruleLabel(f.rule)}
                  {f.severity === "high" ? <span className="badge badge-bad">Strong match</span> : <span className="badge badge-warn">Check</span>}
                </div>
                <p className="mt-0.5 text-ink-2">&ldquo;{f.excerpt}&rdquo;</p>
              </li>
            ))}
          </ul>
        </TargetCard>
      ))}
      {total > groups.length ? <p className="text-center text-sm text-muted">Showing the oldest {groups.length} of {total}.</p> : null}
    </div>
  );
}

async function ClosedFlags({ page, total }: { page: number; total: number }) {
  const rows = await db.moderationFlag.findMany({ where: { status: { not: "OPEN" } }, orderBy: { resolvedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE });
  if (!rows.length) return <EmptyState icon={<ShieldAlert />} title="Nothing done yet" />;
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Handled flags">
        {rows.map((f) => (
          <li key={f.id} className="flex items-start justify-between gap-6 px-5 py-3.5 text-sm">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={f.status === "ACTIONED" ? "badge badge-bad" : "badge badge-ok"}>{f.status === "ACTIONED" ? "Taken down" : "Fine"}</span>
                <span className="font-medium">{TARGET_LABEL[f.targetType]}</span>
                <span className="text-muted">{ruleLabel(f.rule)}</span>
              </div>
              <p className="mt-1 truncate text-muted">&ldquo;{f.excerpt}&rdquo;</p>
            </div>
            <span className="shrink-0 text-xs text-muted">{f.resolvedAt ? timeAgo(f.resolvedAt) : null}</span>
          </li>
        ))}
      </ul>
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => `/admin/flags?tab=closed&page=${p}`} />
    </>
  );
}
