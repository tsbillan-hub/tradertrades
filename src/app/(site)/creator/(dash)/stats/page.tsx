import type { Metadata } from "next";
import Link from "next/link";
import { requireCreator } from "@/server/dal";
import { RANGES, bestDay, columnPoints, creatorStats, parseRange } from "@/server/stats";
import { ColumnChart } from "@/components/charts/column-chart";
import { RankedBars, SplitBar, Swatch } from "@/components/charts/bars";
import { Delta } from "@/components/charts/delta";
import { KeyValue, LinkTabs, PageHeader, Stat } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { productPath, shareLink } from "@/lib/paths";
import { absoluteUrl } from "@/lib/env";
import { cn, money, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Stats" };

const SPLIT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

function pct(part: number, whole: number) {
  if (!whole) return "–";
  const p = (part / whole) * 100;
  return `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;
}

export default async function CreatorStatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = parseRange(sp.days);
  const user = await requireCreator();
  const s = await creatorStats(user.id, days);

  const bestVisits = bestDay(s.days, s.visits.daily);
  const bestSales = bestDay(s.days, s.sales.daily);
  const buyerTotal = s.buyers.reduce((n, b) => n + b.cents, 0);
  const moneyRows = [
    { label: "Sales", cents: s.money.sales },
    { label: "Brand deals", cents: s.money.campaigns },
    { label: "Refunds", cents: s.money.refunds },
    { label: "TraderTrades fees", cents: s.money.platformFees },
    { label: "Card processing", cents: s.money.processing },
    { label: "Adjustments by our team", cents: s.money.adjustments },
  ].filter((r) => r.cents !== 0 || r.label === "Sales");

  return (
    <div className="space-y-6">
      <PageHeader title="Stats" description="Visits to your pages, clicks on your link, sales, and where your buyers come from." />

      <LinkTabs
        active={String(days)}
        tabs={RANGES.map((d) => ({ key: String(d), href: d === 30 ? "/creator/stats" : `/creator/stats?days=${d}`, label: `Last ${d} days` }))}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Visits" value={s.visits.total.toLocaleString("en-US")} sub={<Delta now={s.visits.total} before={s.visits.prev} days={days} />} />
        <Stat label="Clicks on your link" value={s.linkClicks.total.toLocaleString("en-US")} sub={<Delta now={s.linkClicks.total} before={s.linkClicks.prev} days={days} />} />
        <Stat label="Sales" value={s.sales.count.toLocaleString("en-US")} sub={<Delta now={s.sales.count} before={s.sales.prevCount} days={days} />} />
        <Stat label="You kept" value={money(s.kept.total, { exact: true })} sub={<Delta now={s.kept.total} before={s.kept.prev} days={days} />} />
        <Stat label="Visits that bought" value={pct(s.sales.purchases, s.visits.total)} sub={`${plural(s.sales.purchases, "purchase")} from ${plural(s.visits.total, "visit")}`} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Visits by day"
          description={bestVisits ? `Best day: ${bestVisits.label}, with ${plural(bestVisits.value, "visit")}.` : "Your profile and product pages, each person once a day."}
        >
          <ColumnChart
            points={columnPoints(s.days, s.visits.daily)}
            format="count"
            unit={["visit", "visits"]}
            label="Visits by day"
            valueHeading="Visits"
            emptyText="No visits in this period yet."
          />
        </Panel>
        <Panel title="Sales by day" description={bestSales ? `Best day: ${bestSales.label}, with ${money(bestSales.value, { exact: true })} in sales.` : "What buyers paid, before fees."}>
          <ColumnChart points={columnPoints(s.days, s.sales.daily)} format="money" label="Sales by day" valueHeading="Sales" emptyText="No sales in this period yet." />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Where visitors came from" description="The site or page each visit started from.">
          <RankedBars items={s.sources} unit={["visit", "visits"]} emptyText="No visits in this period yet. Share your link to get some." />
        </Panel>

        <Panel title="Where buyers came from" description="Who brought each buyer decides the fee on that sale.">
          {buyerTotal ? (
            <SplitBar
              label="Sales by where the buyer came from"
              parts={s.buyers.map((b, i) => ({ key: b.key, label: b.label, value: b.cents, display: money(b.cents, { exact: true }), color: SPLIT_COLORS[i] }))}
            />
          ) : null}
          <ul className={cn("divide-y divide-line", buyerTotal && "mt-4")}>
            {s.buyers.map((b, i) => (
              <li key={b.key} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-1">
                    <Swatch color={SPLIT_COLORS[i]} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ink-2">{b.label}</span>
                    <span className="block text-xs text-muted">
                      {b.fee} · {plural(b.count, "sale")}
                      {b.feeCents ? ` · ${money(b.feeCents, { exact: true })} in fees` : ""}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block font-semibold text-ink">{money(b.cents, { exact: true })}</span>
                  <span className="num block text-xs text-muted">{pct(b.cents, buyerTotal)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Buyers who come through <Link href="#share-link" className="font-semibold text-ink underline-offset-2 hover:underline">your link</Link> cost you 0%, for good.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="What you kept" description={`Money that came in during the last ${days} days, after fees and refunds.`}>
          <KeyValue
            items={[
              ...moneyRows.map((r) => ({
                label: r.label,
                value: (
                  <span className={cn("num", r.cents < 0 && "text-ink-2")}>
                    {r.cents < 0 ? "-" : ""}
                    {money(Math.abs(r.cents), { exact: true })}
                  </span>
                ),
              })),
              { label: <span className="font-semibold text-ink">You kept</span>, value: <span className="num font-semibold">{money(s.kept.total, { exact: true })}</span> },
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            Sales are held before payout to cover refunds. See <Link href="/creator/payouts" className="font-semibold text-ink underline-offset-2 hover:underline">Payouts</Link> for when it reaches your bank.
          </p>
        </Panel>

        <Panel title="Products" description="Visits to each product page, checkouts started and sales.">
          {s.products.length ? (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-5 py-2 font-semibold sm:px-6">Product</th>
                    <th className="px-2 py-2 text-right font-semibold">Visits</th>
                    <th className="px-2 py-2 text-right font-semibold">Checkouts</th>
                    <th className="px-2 py-2 text-right font-semibold">Sales</th>
                    <th className="px-2 py-2 text-right font-semibold">Bought</th>
                    <th className="px-5 py-2 text-right font-semibold sm:px-6">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.products.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-[220px] px-5 py-2.5 sm:px-6">
                        <Link href={productPath(user.username, p.slug)} className="block truncate font-medium text-ink hover:underline">
                          {p.title}
                        </Link>
                        {p.status !== "PUBLISHED" ? <span className="text-xs text-muted">Not published</span> : null}
                      </td>
                      <td className="num px-2 py-2.5 text-right">{p.views.toLocaleString("en-US")}</td>
                      <td className="num px-2 py-2.5 text-right">{p.checkouts.toLocaleString("en-US")}</td>
                      <td className="num px-2 py-2.5 text-right">{p.sales.toLocaleString("en-US")}</td>
                      <td className="num px-2 py-2.5 text-right text-muted">{pct(p.sales, p.views)}</td>
                      <td className="num px-5 py-2.5 text-right font-semibold sm:px-6">{money(p.cents, { exact: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No products yet. <Link href="/creator/products/new" className="font-semibold text-ink hover:underline">Create one</Link>.
            </p>
          )}
        </Panel>
      </div>

      <div id="share-link" className="card scroll-mt-24 p-5 text-sm sm:p-6">
        <h2 className="text-[17px]">How visits are counted</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Each person counts once a day on each page, however many times they open it. Days run midnight to midnight UTC.</li>
          <li>Your own visits, our team&apos;s and bots don&apos;t count.</li>
          <li>
            Clicks on your link count people who opened <span className="num break-all text-ink">{absoluteUrl(shareLink(user.username))}</span>. Put it in your bio and video descriptions.
          </li>
          <li>&ldquo;Typed in or no referrer&rdquo; covers visits where the app or browser didn&apos;t say where the person came from.</li>
        </ul>
      </div>
    </div>
  );
}
