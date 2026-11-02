import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Handshake } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, hostname, money, timeAgo } from "@/lib/utils";
import { DEAL_STATUS, dealTotals } from "@/server/business";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { DealDisputeForm } from "@/components/admin/forms";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "Deal disputes" };

const chip = { id: true, username: true, displayName: true, avatarUrl: true } as const;

export default async function DealsAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "disputes";
  const open = await db.deal.count({ where: { disputedAt: { not: null }, resolvedAt: null, status: { in: ["FUNDED", "SUBMITTED"] } } });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Deal disputes"
        description="A company and a creator disagree on a paid campaign deal. The money is held until you decide, and automatic approval waits."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "disputes", href: "/admin/deals", label: "Waiting", count: open },
          { key: "all", href: "/admin/deals?tab=all", label: "All deals" },
        ]}
      />
      {tab === "disputes" ? <Disputes /> : <AllDeals />}
    </div>
  );
}

async function Disputes() {
  const rows = await db.deal.findMany({
    where: { disputedAt: { not: null }, resolvedAt: null, status: { in: ["FUNDED", "SUBMITTED"] } },
    orderBy: { disputedAt: "asc" },
    take: 30,
    include: { campaign: true, company: { select: { name: true, slug: true } }, creator: { select: chip } },
  });
  if (!rows.length) return <EmptyState icon={<Handshake />} title="No disputes waiting" description="When either side of a paid deal asks us to step in, it shows up here." />;
  const raisers = await db.user.findMany({ where: { id: { in: rows.map((r) => r.disputedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, username: true } });
  return (
    <div className="space-y-4">
      <Notice tone="plain" title="How to decide">
        Read the brief and what was agreed, open the links the creator sent, and message both sides if you need more. Pay the creator if they delivered what was agreed. Refund the
        company if they didn&apos;t. If they just need to talk it through, let it carry on: work already sent gets a fresh week for the company to answer.
      </Notice>
      {rows.map((d) => {
        const t = dealTotals(d.priceCents);
        const links = d.submissionUrl?.split("\n").filter(Boolean) ?? [];
        const raiser = raisers.find((u) => u.id === d.disputedById);
        const byCreator = d.disputedById === d.creatorId;
        return (
          <article key={d.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <div>
                <div className="text-sm text-muted">{d.company.name}</div>
                <Link href={`/deals/${d.id}`} className="text-lg font-bold hover:underline">
                  {d.campaign.title}
                </Link>
              </div>
              <UserChip user={d.creator} sub="creator" />
              <dl className="grid gap-1 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
                <dt className="text-muted">Agreed price</dt>
                <dd className="num font-semibold">
                  {money(d.priceCents, { exact: true })} <span className="font-normal text-muted">(company paid {money(t.totalCents, { exact: true })})</span>
                </dd>
                <dt className="text-muted">Status</dt>
                <dd>{DEAL_STATUS[d.status]?.label}</dd>
                <dt className="text-muted">Paid in</dt>
                <dd>{d.fundedAt ? formatDate(d.fundedAt) : "?"}</dd>
                <dt className="text-muted">Work sent</dt>
                <dd>{d.submittedAt ? formatDate(d.submittedAt) : "Not yet"}</dd>
                {d.changesNote ? (
                  <>
                    <dt className="text-muted">Changes asked for</dt>
                    <dd className="whitespace-pre-line">{d.changesNote}</dd>
                  </>
                ) : null}
              </dl>
              {links.length ? (
                <ul className="space-y-1.5" aria-label="Links the creator sent">
                  {links.map((l) => (
                    <li key={l}>
                      <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold hover:underline">
                        <span className="truncate">{hostname(l)}</span> <ExternalLink className="size-3.5 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
                <div className="font-semibold">
                  {byCreator ? "The creator" : "The company"} asked us to step in{raiser ? ` (@${raiser.username})` : ""}, {d.disputedAt ? timeAgo(d.disputedAt) : ""}
                </div>
                <p className="mt-1 whitespace-pre-line text-ink-2">{d.disputeNote}</p>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">The brief</summary>
                <p className="mt-2 whitespace-pre-line text-ink-2">{d.campaign.brief}</p>
                <ul className="mt-2 list-disc pl-5 text-ink-2">
                  {d.campaign.deliverables.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </details>
            </div>
            <div className="lg:border-l lg:border-line lg:pl-5">
              <DealDisputeForm dealId={d.id} price={money(d.priceCents, { exact: true })} total={money(t.totalCents, { exact: true })} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function AllDeals() {
  const rows = await db.deal.findMany({
    where: { status: { notIn: ["APPLIED", "INVITED", "DECLINED"] } },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: { campaign: { select: { title: true } }, company: { select: { name: true } }, creator: { select: chip } },
  });
  if (!rows.length) return <EmptyState icon={<Handshake />} title="No deals yet" description="Deals show up here once a company and a creator agree a price." />;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Deal</th>
            <th className="px-4 py-2.5 font-medium">Creator</th>
            <th className="px-4 py-2.5 text-right font-medium">Price</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="max-w-[260px] px-4 py-2.5">
                <Link href={`/deals/${d.id}`} className="block truncate font-semibold hover:underline">
                  {d.campaign.title}
                </Link>
                <div className="truncate text-xs text-muted">{d.company.name}</div>
              </td>
              <td className="px-4 py-2.5">
                <UserChip user={d.creator} />
              </td>
              <td className="num px-4 py-2.5 text-right">{money(d.priceCents)}</td>
              <td className="px-4 py-2.5">
                <span className={`badge ${DEAL_STATUS[d.status]?.tone ?? "badge-outline"}`}>{DEAL_STATUS[d.status]?.label ?? d.status}</span>
                {d.disputedAt && !d.resolvedAt ? <span className="badge badge-bad ml-1">Disputed</span> : null}
              </td>
              <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted">{timeAgo(d.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
