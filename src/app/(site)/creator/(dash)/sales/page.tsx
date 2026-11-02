import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { REFUND_ANSWER_DAYS } from "@/server/commerce/refunds";
import { approveRefund, declineRefund } from "@/server/actions/sales";
import { ActionButton, ActionForm, Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import { EmptyState, LinkTabs, PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { FEE_SHORT } from "@/lib/fees";
import { cn, formatDate, money, orderNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales" };

const PER_PAGE = 30;

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { tab = "orders", page: pageRaw } = await searchParams;
  const user = await requireCreator();
  const page = Math.max(1, Number(pageRaw) || 1);
  const paidStatuses = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] as const;

  const [total, orders, refunds, totals] = await Promise.all([
    db.order.count({ where: { sellerId: user.id, status: { in: [...paidStatuses] } } }),
    tab === "orders"
      ? db.order.findMany({
          where: { sellerId: user.id, status: { in: [...paidStatuses] } },
          include: { buyer: { select: { displayName: true, username: true } }, product: { select: { title: true } }, coupon: { select: { code: true } } },
          orderBy: { paidAt: "desc" },
          skip: (page - 1) * PER_PAGE,
          take: PER_PAGE,
        })
      : [],
    db.refund.findMany({
      where: { order: { sellerId: user.id } },
      include: { order: { include: { product: { select: { title: true } } } }, requester: { select: { displayName: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.order.aggregate({
      where: { sellerId: user.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, amountCents: { gt: 0 } },
      _sum: { amountCents: true, sellerNetCents: true, platformFeeCents: true, refundedCents: true },
      _count: true,
    }),
  ]);
  const open = refunds.filter((r) => r.status === "REQUESTED" && !r.escalatedAt);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      <PageHeader title="Sales" description="Every order, what you kept after fees, and refund requests to answer." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Paid orders" value={totals._count} />
        <Stat label="Sales" value={money(totals._sum.amountCents ?? 0, { exact: true })} />
        <Stat label="You kept" value={money(totals._sum.sellerNetCents ?? 0, { exact: true })} sub="Before refunds" />
        <Stat label="Our fees" value={money(totals._sum.platformFeeCents ?? 0, { exact: true })} sub="0% on your own buyers" />
      </div>
      <LinkTabs
        active={tab}
        tabs={[
          { key: "orders", href: "/creator/sales", label: "Orders", count: total },
          { key: "refunds", href: "/creator/sales?tab=refunds", label: "Refund requests", count: open.length },
        ]}
      />

      {tab === "refunds" ? (
        refunds.length ? (
          <ul className="card divide-y divide-line">
            {refunds.map((r) => {
              const due = new Date(r.createdAt.getTime() + REFUND_ANSWER_DAYS * 86400_000);
              const waiting = r.status === "REQUESTED" && !r.escalatedAt;
              return (
                <li key={r.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{r.order.product?.title ?? r.order.description}</div>
                      <div className="mt-0.5 text-sm text-muted">
                        {r.requester.displayName} · <span className="num">{orderNumber(r.order.number)}</span> · asked {formatDate(r.createdAt)}
                      </div>
                    </div>
                    <div className="num font-semibold">{money(r.amountCents, { exact: true })}</div>
                  </div>
                  <div className="mt-3 rounded-lg bg-sunk px-4 py-3 text-sm">
                    <div className="font-medium">{r.reason}</div>
                    {r.details ? <p className="mt-1 whitespace-pre-line text-ink-2">{r.details}</p> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {waiting ? (
                      <>
                        <span className={cn("mr-auto", due < new Date() ? "text-down" : "text-muted")}>
                          {due < new Date() ? "Overdue: our team will decide soon." : `Please answer by ${formatDate(due)}.`}
                        </span>
                        <ActionButton action={approveRefund} fields={{ refundId: r.id }} variant="primary" confirm={`Refund ${money(r.amountCents, { exact: true })} to ${r.requester.displayName}?`}>
                          Approve refund
                        </ActionButton>
                        <ModalButton label="Decline" title="Decline this refund" className="btn-sm">
                          <ActionForm action={declineRefund} className="space-y-4" refreshOnSuccess>
                            <input type="hidden" name="refundId" value={r.id} />
                            <p className="text-sm text-muted">
                              Tell the buyer why. If they disagree, our team reviews it, and we always refund when a product wasn&apos;t delivered, was very
                              different from its description, or broke the rules.
                            </p>
                            <Field label="Your reason" name="note">
                              <Textarea name="note" rows={4} maxLength={1000} />
                            </Field>
                            <FormMessage />
                            <SubmitButton variant="danger">Decline refund</SubmitButton>
                          </ActionForm>
                        </ModalButton>
                      </>
                    ) : (
                      <span className="text-muted">
                        {r.status === "PROCESSED"
                          ? `Refunded ${formatDate(r.processedAt)}`
                          : r.escalatedAt
                            ? "With the TraderTrades team"
                            : r.status === "DENIED"
                              ? `You declined: "${r.decisionNote}"`
                              : r.status.toLowerCase()}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No refund requests" description={`When a buyer asks for one, it shows up here. You have ${REFUND_ANSWER_DAYS} days to answer.`} />
        )
      ) : orders.length ? (
        <>
          <div className="card overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Product</th>
                  <th>Where they came from</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">You get</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="num font-medium">{orderNumber(o.number)}</div>
                      <div className="text-xs text-muted">{formatDate(o.paidAt)}</div>
                    </td>
                    <td>
                      <Link href={`/@${o.buyer.username}`} className="hover:underline">
                        {o.buyer.displayName}
                      </Link>
                    </td>
                    <td className="max-w-[220px]">
                      <div className="truncate">{o.product?.title ?? o.description}</div>
                      <div className="text-xs text-muted">
                        {o.kind === "RENEWAL" ? "Renewal" : "Purchase"}
                        {o.coupon ? ` · code ${o.coupon.code}` : ""}
                        {o.status !== "PAID" ? ` · ${o.status.toLowerCase().replace("_", " ")}` : ""}
                      </div>
                    </td>
                    <td>
                      <span className={cn("badge", o.feeType === "OWN_AUDIENCE" ? "badge-ok" : "badge-outline")}>{FEE_SHORT[o.feeType]}</span>
                    </td>
                    <td className="num text-right">{o.amountCents ? money(o.amountCents, { exact: true }) : "Free"}</td>
                    <td className="num text-right text-muted">{o.amountCents ? `-${money(o.platformFeeCents + o.processingFeeCents, { exact: true })}` : "–"}</td>
                    <td className="num text-right font-semibold">
                      {money(o.sellerNetCents, { exact: true })}
                      {o.refundedCents ? <div className="text-xs font-normal text-down">-{money(o.refundedCents, { exact: true })} refunded</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} hrefFor={(n) => (n > 1 ? `/creator/sales?page=${n}` : "/creator/sales")} />
        </>
      ) : (
        <EmptyState icon={<Receipt />} title="No sales yet" description="Share your link to get the first one." />
      )}
    </div>
  );
}
