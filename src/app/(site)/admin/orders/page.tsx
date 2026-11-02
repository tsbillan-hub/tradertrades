import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { FEE_SHORT } from "@/lib/fees";
import { formatDate, money, orderNumber } from "@/lib/utils";
import { pageParam } from "@/server/queries/admin";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { AdminRefundButton } from "@/components/admin/forms";
import { OrderStatusBadge } from "@/components/admin/status-badge";

export const metadata: Metadata = { title: "Orders" };

const PER_PAGE = 30;

/** "TT-10023", "#10023" or "10023" all find order 23. */
function numberFrom(q: string) {
  const m = /^(?:tt-?|#)?(\d{1,9})$/i.exec(q.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 10000 ? n - 10000 : n;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = pageParam(sp.page);
  const refundable = sp.status === "paid";
  const n = q ? numberFrom(q) : null;
  const term = q.replace(/^@/, "");
  const person = (field: "buyer" | "seller") => ({
    [field]: { OR: [{ username: { contains: term, mode: "insensitive" as const } }, { email: { contains: term, mode: "insensitive" as const } }] },
  });
  const where: Prisma.OrderWhereInput = {
    status: refundable ? { in: ["PAID", "PARTIALLY_REFUNDED"] } : { not: "PENDING" },
    ...(q
      ? {
          OR: [
            ...(n !== null ? [{ number: n }] : []),
            { id: q },
            { description: { contains: q, mode: "insensitive" as const } },
            person("buyer"),
            person("seller"),
          ],
        }
      : {}),
  };
  const [total, rows, sums] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        buyer: { select: { id: true, username: true } },
        seller: { select: { id: true, username: true } },
        company: { select: { name: true } },
        deal: { select: { id: true, status: true, creator: { select: { id: true, username: true } } } },
      },
    }),
    db.order.aggregate({ where, _sum: { amountCents: true, platformFeeCents: true, refundedCents: true } }),
  ]);
  const hrefFor = (p: number) => `/admin/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(refundable ? { status: "paid" } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${total.toLocaleString()} ${total === 1 ? "order" : "orders"} · ${money(sums._sum.amountCents ?? 0)} paid · ${money(sums._sum.platformFeeCents ?? 0)} our fees · ${money(sums._sum.refundedCents ?? 0)} refunded`}
      />
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="order-q">
          Search orders
        </label>
        <input id="order-q" name="q" defaultValue={q} className="input flex-1" placeholder="Order number, what was bought, buyer or seller" />
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="status" value="paid" defaultChecked={refundable} className="checkbox" /> Can still be refunded
        </label>
        <button className="btn btn-secondary">
          <Search /> Search
        </button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">What</th>
                <th className="px-4 py-2.5 font-medium">Buyer</th>
                <th className="px-4 py-2.5 font-medium">Seller</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5 font-medium">Our fee</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((o) => {
                const left = o.amountCents - o.refundedCents;
                // Once a deal's work is approved the creator has the money, so it can't be pulled back from here.
                const dealPaidOut = o.kind === "CAMPAIGN" && o.deal?.status !== "FUNDED" && o.deal?.status !== "SUBMITTED";
                const canRefund = (o.status === "PAID" || o.status === "PARTIALLY_REFUNDED") && left > 0 && !dealPaidOut;
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="num font-semibold">{orderNumber(o.number)}</div>
                      <div className="text-xs text-muted">{formatDate(o.paidAt ?? o.createdAt)}</div>
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <div className="truncate">{o.description}</div>
                      {o.provider === "TEST" ? <div className="text-xs text-warn">Test payment</div> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/users/${o.buyer.id}`} className="hover:underline">
                        @{o.buyer.username}
                      </Link>
                      {o.company ? <div className="text-xs text-muted">for {o.company.name}</div> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {o.deal ? (
                        <>
                          <Link href={`/admin/users/${o.deal.creator.id}`} className="hover:underline">
                            @{o.deal.creator.username}
                          </Link>
                          <div className="text-xs text-muted">
                            <Link href={`/deals/${o.deal.id}`} className="hover:underline">
                              Campaign deal
                            </Link>
                          </div>
                        </>
                      ) : o.seller ? (
                        <Link href={`/admin/users/${o.seller.id}`} className="hover:underline">
                          @{o.seller.username}
                        </Link>
                      ) : (
                        <span className="text-muted">TraderTrades</span>
                      )}
                    </td>
                    <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                      {money(o.amountCents)}
                      {o.refundedCents ? <div className="text-xs text-down">−{money(o.refundedCents)}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="num">{money(o.platformFeeCents)}</span>
                      <div className="text-xs text-muted">{FEE_SHORT[o.feeType]}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">{canRefund ? <AdminRefundButton orderId={o.id} left={money(left)} label={orderNumber(o.number)} kind={o.kind} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Receipt />} title={q ? "No orders match" : "No orders yet"} />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={hrefFor} />
    </div>
  );
}
