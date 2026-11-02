import type { Metadata } from "next";
import Link from "next/link";
import type { FeeType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CARD_FEE, FEATURED_LIMITS, FEATURED_PRICES, FEE_BPS, FEE_LABEL, HOLD_DAYS, NEW_SELLER_HOLD_DAYS, NEW_SELLER_PERIOD_DAYS } from "@/lib/fees";
import { money, plural } from "@/lib/utils";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Fees" };

const WHEN: Record<FeeType, string> = {
  OWN_AUDIENCE: "The buyer came from the creator's own link, page or audience.",
  MARKETPLACE_FIRST: "We found the buyer (search, browse, the directory), first purchase from that creator.",
  MARKETPLACE_REPEAT: "A buyer we found buys from the same creator again.",
  CAMPAIGN: "A business pays a creator through a campaign deal. The business pays it on top.",
  FEATURED: "A Sponsored spot. We keep the whole price.",
  NONE: "Free things, test orders.",
};
const ORDER: FeeType[] = ["OWN_AUDIENCE", "MARKETPLACE_FIRST", "MARKETPLACE_REPEAT", "CAMPAIGN", "FEATURED", "NONE"];
const DAY = 86_400_000;
const pct = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

export default async function FeesAdminPage() {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const paid: Prisma.OrderWhereInput = { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } };
  const sums = { amountCents: true, platformFeeCents: true, refundedCents: true } as const;
  const [allTime, month, returnedAll, returnedMonth] = await Promise.all([
    db.order.groupBy({ by: ["feeType"], where: paid, _sum: sums, _count: true }),
    db.order.groupBy({ by: ["feeType"], where: { ...paid, paidAt: { gte: since } }, _sum: sums, _count: true }),
    // Our share of the fee goes back to the seller when a sale is refunded.
    db.ledgerEntry.aggregate({ where: { type: "PLATFORM_FEE", amountCents: { gt: 0 } }, _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { type: "PLATFORM_FEE", amountCents: { gt: 0 }, createdAt: { gte: since } }, _sum: { amountCents: true } }),
  ]);
  type Row = (typeof month)[number];
  // Sponsored spots are ours outright, so the whole price (less refunds) is income.
  const income = (r: Row | undefined) =>
    !r ? 0 : r.feeType === "FEATURED" ? (r._sum.amountCents ?? 0) - (r._sum.refundedCents ?? 0) : (r._sum.platformFeeCents ?? 0);
  const net = (rows: Row[], returned: number) => rows.reduce((s, r) => s + income(r), 0) - returned;
  const back = { month: returnedMonth._sum.amountCents ?? 0, all: returnedAll._sum.amountCents ?? 0 };

  return (
    <div className="space-y-6">
      <PageHeader title="Fees" description="What TraderTrades earns, and what we've earned so far." />
      <Notice tone="plain" title="Changing a fee">
        Fees are written into the terms, the fees page and every listing, and sellers have to be told before they change. So they aren&apos;t a switch here: ask for the change and it&apos;s made
        everywhere at once.
      </Notice>

      <Panel title="Sales fees">
        <div className="-mx-5 -my-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium sm:px-6">Fee</th>
                <th className="px-5 py-2.5 text-right font-medium">Rate</th>
                <th className="px-5 py-2.5 text-right font-medium">Last 30 days</th>
                <th className="px-5 py-2.5 text-right font-medium sm:pr-6">All time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ORDER.map((t) => {
                const m = month.find((r) => r.feeType === t);
                const a = allTime.find((r) => r.feeType === t);
                return (
                  <tr key={t}>
                    <td className="px-5 py-3 sm:px-6">
                      <div className="font-medium">{FEE_LABEL[t]}</div>
                      <div className="text-xs text-muted">{WHEN[t]}</div>
                    </td>
                    <td className="num px-5 py-3 text-right">{t === "FEATURED" ? "Full price" : pct(FEE_BPS[t])}</td>
                    <td className="num px-5 py-3 text-right">
                      {money(income(m))}
                      <div className="text-xs text-muted">{plural(m?._count ?? 0, "order")}</div>
                    </td>
                    <td className="num px-5 py-3 text-right sm:pr-6">
                      {money(income(a))}
                      <div className="text-xs text-muted">on {money(a?._sum.amountCents ?? 0)}</div>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="px-5 py-3 sm:px-6">
                  <div className="font-medium">Given back on refunds</div>
                  <div className="text-xs text-muted">Our share of the fee goes back to the seller when a sale is refunded.</div>
                </td>
                <td />
                <td className="num px-5 py-3 text-right text-down">−{money(back.month)}</td>
                <td className="num px-5 py-3 text-right text-down sm:pr-6">−{money(back.all)}</td>
              </tr>
            </tbody>
            <tfoot className="border-t border-line-strong font-semibold">
              <tr>
                <td className="px-5 py-3 sm:px-6">What we kept</td>
                <td />
                <td className="num px-5 py-3 text-right">{money(net(month, back.month))}</td>
                <td className="num px-5 py-3 text-right sm:pr-6">{money(net(allTime, back.all))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sponsored spots">
          <dl className="-my-2 divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Top of a directory category</dt>
              <dd className="font-medium">
                {money(FEATURED_PRICES.CATEGORY)} a week · {FEATURED_LIMITS.CATEGORY} per category
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Home page</dt>
              <dd className="font-medium">
                {money(FEATURED_PRICES.HOME)} a week · {FEATURED_LIMITS.HOME} at a time
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Payouts and card fees">
          <dl className="-my-2 divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Card processing</dt>
              <dd className="font-medium">
                {pct(CARD_FEE.bps)} + {money(CARD_FEE.fixedCents, { exact: true })}, Stripe&apos;s price
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Money held before payout</dt>
              <dd className="font-medium">
                {NEW_SELLER_HOLD_DAYS} days for a seller&apos;s first {NEW_SELLER_PERIOD_DAYS} days, then {HOLD_DAYS}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
      <p className="text-sm text-muted">
        Buyers and sellers see these on the public{" "}
        <Link href="/fees" className="underline underline-offset-2">
          fees page
        </Link>
        .
      </p>
    </div>
  );
}
