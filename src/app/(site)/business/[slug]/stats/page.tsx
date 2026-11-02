import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/server/dal";
import { featuredPlaceLabel } from "@/server/business";
import { RANGES, bestDay, businessStats, columnPoints, parseRange } from "@/server/stats";
import { ColumnChart } from "@/components/charts/column-chart";
import { RankedBars } from "@/components/charts/bars";
import { Delta } from "@/components/charts/delta";
import { LinkTabs, PageHeader, Stat } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { formatDate, money, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Stats" };

function pct(part: number, whole: number) {
  if (!whole) return "–";
  const p = (part / whole) * 100;
  return `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;
}

export default async function BusinessStatsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ days?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const days = parseRange(sp.days);
  const { company } = await requireBusiness(slug);
  const base = `/business/${company.slug}`;
  const s = await businessStats(company.id, days);
  const bestVisits = bestDay(s.days, s.visits.daily);
  const bestClicks = bestDay(s.days, s.clicks.daily);
  const spent = s.spend.featured + s.spend.campaigns;

  return (
    <div className="space-y-6">
      <PageHeader title="Stats" description={`Visits to your listing, clicks through to your website, and what you spent on TraderTrades.`} />

      <LinkTabs active={String(days)} tabs={RANGES.map((d) => ({ key: String(d), href: d === 30 ? `${base}/stats` : `${base}/stats?days=${d}`, label: `Last ${d} days` }))} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Visits to your listing" value={s.visits.total.toLocaleString("en-US")} sub={<Delta now={s.visits.total} before={s.visits.prev} days={days} />} />
        <Stat label="Clicks to your website" value={s.clicks.total.toLocaleString("en-US")} sub={<Delta now={s.clicks.total} before={s.clicks.prev} days={days} />} />
        <Stat label="Visits that clicked" value={pct(s.clicks.total, s.visits.total)} sub="Clicks from any page, over listing visits" />
        <Stat label="New reviews" value={s.reviews.total.toLocaleString("en-US")} sub={<Delta now={s.reviews.total} before={s.reviews.prev} days={days} />} />
        <Stat
          label="Spent on TraderTrades"
          value={money(spent, { exact: true })}
          sub={`${money(s.spend.featured, { exact: true })} Sponsored · ${money(s.spend.campaigns, { exact: true })} campaigns`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Visits to your listing by day" description={bestVisits ? `Best day: ${bestVisits.label}, with ${plural(bestVisits.value, "visit")}.` : "Each person once a day."}>
          <ColumnChart points={columnPoints(s.days, s.visits.daily)} format="count" unit={["visit", "visits"]} label="Visits to your listing by day" valueHeading="Visits" emptyText="No visits in this period yet." />
        </Panel>
        <Panel title="Clicks to your website by day" description={bestClicks ? `Best day: ${bestClicks.label}, with ${plural(bestClicks.value, "click")}.` : "Visit website buttons, offers and Sponsored spots."}>
          <ColumnChart points={columnPoints(s.days, s.clicks.daily)} format="count" unit={["click", "clicks"]} label="Clicks to your website by day" valueHeading="Clicks" emptyText="No clicks in this period yet." />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Where visitors came from" description="The site or page each visit to your listing started from.">
          <RankedBars items={s.sources} unit={["visit", "visits"]} emptyText="No visits in this period yet." />
        </Panel>
        <Panel title="Where the clicks happened" description="The page on TraderTrades each click to your website came from.">
          <RankedBars items={s.clickSources} unit={["click", "clicks"]} emptyText="No clicks in this period yet." />
        </Panel>
      </div>

      <Panel
        title="Sponsored spots in this period"
        action={
          <Link href={`${base}/featured`} className="text-sm font-semibold hover:underline">
            Book a spot
          </Link>
        }
      >
        {s.slots.length ? (
          <ul className="-my-2 divide-y divide-line text-sm">
            {s.slots.map((slot) => (
              <li key={slot.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{featuredPlaceLabel(slot.placement, slot.category)}</span>
                  <span className="block text-xs text-muted">
                    {formatDate(slot.startsAt, { month: "short", day: "numeric" })} to {formatDate(new Date(slot.endsAt.getTime() - 1), { month: "short", day: "numeric", year: "numeric" })}
                    {slot.status === "ACTIVE" ? " · showing now" : ""}
                  </span>
                </span>
                <span className="num font-semibold">{plural(slot.clicks, "click")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No Sponsored spots ran in this period. A spot puts your listing at the top of your category, or on the home page, for a week.</p>
        )}
      </Panel>

      <p className="text-xs text-muted">
        Each person counts once a day on your listing, however many times they open it. Your team&apos;s visits, ours and bots don&apos;t count. Days run midnight to midnight UTC.
      </p>
    </div>
  );
}
