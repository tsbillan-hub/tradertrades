import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { db } from "@/lib/db";
import { FEE_SHORT } from "@/lib/fees";
import { productPath } from "@/lib/paths";
import { formatDate, money, orderNumber, timeAgo } from "@/lib/utils";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { DisputeDecisionForm } from "@/components/admin/forms";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "Refund reviews" };

const person = { select: { id: true, username: true, displayName: true, avatarUrl: true } } as const;
const DAY = 86_400_000;

export default async function RefundReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "open";
  const waiting = await db.refund.count({ where: { status: "REQUESTED", escalatedAt: { not: null } } });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Refund reviews"
        description="Refund requests come here when the buyer disagrees with the creator's answer, or the creator doesn't answer within 3 days. Your decision is final."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "open", href: "/admin/refunds", label: "Waiting", count: waiting },
          { key: "done", href: "/admin/refunds?tab=done", label: "Decided" },
        ]}
      />
      {tab === "open" ? <Waiting /> : <Decided />}
    </div>
  );
}

async function Waiting() {
  const rows = await db.refund.findMany({
    where: { status: "REQUESTED", escalatedAt: { not: null } },
    orderBy: { escalatedAt: "asc" },
    take: 30,
    include: {
      requester: person,
      order: { include: { seller: person, product: { select: { title: true, slug: true, refundDays: true, type: true, creator: { select: { username: true } } } } } },
    },
  });
  if (!rows.length) return <EmptyState icon={<RotateCcw />} title="No refunds to review" description="Most refunds are settled between the buyer and the creator." />;
  return (
    <div className="space-y-4">
      <Notice tone="plain" title="How to decide">
        Check the listing&apos;s refund window and what the buyer says against what the listing promised. Refund if the product wasn&apos;t as described, didn&apos;t work, or the request is inside the
        window. You can message either side first from their page.
      </Notice>
      {rows.map((r) => {
        const o = r.order;
        const creatorSaidNo = Boolean(r.decidedById && r.decidedById === o.sellerId && r.decisionNote);
        const paidAt = o.paidAt ?? o.createdAt;
        const daysAfter = Math.max(0, Math.floor((r.createdAt.getTime() - paidAt.getTime()) / DAY));
        const window = o.product?.refundDays ?? 0;
        return (
          <article key={r.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg">
                  {money(r.amountCents)} refund on{" "}
                  {o.product ? (
                    <Link href={productPath(o.product.creator.username, o.product.slug)} target="_blank" className="hover:underline">
                      {o.product.title}
                    </Link>
                  ) : (
                    o.description
                  )}
                </h2>
                <Link href={`/admin/orders?q=${orderNumber(o.number)}`} className="num text-sm text-muted hover:text-ink">
                  {orderNumber(o.number)}
                </Link>
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[150px_1fr]">
                <dt className="text-muted">Paid</dt>
                <dd>
                  {money(o.amountCents)} on {formatDate(paidAt)} · {FEE_SHORT[o.feeType]}
                </dd>
                <dt className="text-muted">Asked</dt>
                <dd>
                  {daysAfter === 0 ? "The same day" : `${daysAfter} ${daysAfter === 1 ? "day" : "days"} after buying`}
                  {o.product ? (
                    <span className={daysAfter <= window ? "text-up" : "text-warn"}>
                      {" "}
                      ({window ? `${daysAfter <= window ? "inside" : "outside"} the ${window} day refund window` : "the listing has no refund window"})
                    </span>
                  ) : null}
                </dd>
                <dt className="text-muted">Sent to us</dt>
                <dd>{r.escalatedAt ? timeAgo(r.escalatedAt) : null}</dd>
              </dl>
              <div className="rounded-lg bg-sunk/60 px-3 py-2.5 text-sm">
                <div className="font-semibold">Buyer: {r.reason}</div>
                {r.details ? <p className="mt-1 whitespace-pre-line text-ink-2">{r.details}</p> : null}
              </div>
              <div className="rounded-lg bg-sunk/60 px-3 py-2.5 text-sm">
                {creatorSaidNo ? (
                  <>
                    <div className="font-semibold">Creator said no</div>
                    <p className="mt-1 whitespace-pre-line text-ink-2">{r.decisionNote}</p>
                  </>
                ) : (
                  <div className="font-semibold">The creator didn&apos;t answer within 3 days</div>
                )}
              </div>
              <div className="flex flex-wrap gap-6">
                <div>
                  <div className="mb-1 text-xs text-muted">Buyer</div>
                  <UserChip user={r.requester} />
                </div>
                {o.seller ? (
                  <div>
                    <div className="mb-1 text-xs text-muted">Creator</div>
                    <UserChip user={o.seller} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="lg:border-l lg:border-line lg:pl-5">
              <DisputeDecisionForm refundId={r.id} amount={money(Math.min(r.amountCents, o.amountCents - o.refundedCents))} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Decided() {
  const rows = await db.refund.findMany({
    where: { escalatedAt: { not: null }, status: { not: "REQUESTED" } },
    orderBy: { decidedAt: { sort: "desc", nulls: "last" } },
    take: 50,
    include: { order: { select: { number: true, description: true, product: { select: { title: true } } } } },
  });
  if (!rows.length) return <EmptyState icon={<RotateCcw />} title="Nothing decided yet" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Decided refunds">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <div className="min-w-0">
            <div className="truncate font-semibold">
              {money(r.amountCents)} · {r.order.product?.title ?? r.order.description}
            </div>
            <div className="truncate text-muted">{r.decisionNote}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={r.status === "PROCESSED" || r.status === "APPROVED" ? "badge badge-ok" : "badge badge-outline"}>
              {r.status === "PROCESSED" || r.status === "APPROVED" ? "Refunded" : "No refund"}
            </span>
            <span className="num text-xs text-muted">{orderNumber(r.order.number)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
