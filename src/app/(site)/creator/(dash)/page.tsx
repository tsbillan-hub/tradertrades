import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { absoluteUrl, features } from "@/lib/env";
import { requireCreator } from "@/server/dal";
import { balances } from "@/server/commerce/balance";
import { CopyButton } from "@/components/ui/client";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { FEE_SHORT } from "@/lib/fees";
import { shareLink } from "@/lib/paths";
import { cn, daysFromNow, formatDate, money, orderNumber, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Creator dashboard" };

export default async function CreatorOverviewPage() {
  const user = await requireCreator();
  const since = daysFromNow(-30);
  const [recent, agg30, products, members, followers, ownBuyers, bal] = await Promise.all([
    db.order.findMany({
      where: { sellerId: user.id, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] } },
      include: { buyer: { select: { displayName: true, username: true } }, product: { select: { title: true } } },
      orderBy: { paidAt: "desc" },
      take: 6,
    }),
    db.order.aggregate({
      where: { sellerId: user.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: { gte: since }, amountCents: { gt: 0 } },
      _sum: { amountCents: true, sellerNetCents: true, platformFeeCents: true, processingFeeCents: true },
      _count: true,
    }),
    db.product.findMany({ where: { creatorId: user.id, status: { not: "ARCHIVED" } }, select: { id: true, status: true } }),
    db.subscription.count({ where: { sellerId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } }),
    db.follow.count({ where: { followingId: user.id } }),
    db.buyerRelation.count({ where: { sellerId: user.id, source: "OWN_AUDIENCE" } }),
    balances(user.id),
  ]);

  const link = absoluteUrl(shareLink(user.username));
  const steps = [
    { done: Boolean(user.avatarUrl), label: "Add a profile photo", href: "/settings" },
    { done: products.length > 0, label: "Create your first product", href: "/creator/products/new" },
    { done: features.stripe ? user.creator.stripeChargesEnabled : user.creator.testPayoutsReady, label: "Set up payouts", href: "/creator/payouts" },
    { done: products.some((p) => p.status === "PUBLISHED"), label: "Publish it", href: "/creator/products" },
    { done: ownBuyers > 0, label: "Share your link and get your first buyer", href: "#share" },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi ${user.displayName.split(" ")[0]}`}
        description="Your sales, members and what to do next."
        actions={
          <Link href="/creator/products/new" className="btn btn-primary">
            <Plus /> New product
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Sales, last 30 days" value={agg30._count} sub={money(agg30._sum.amountCents ?? 0)} />
        <Stat label="You kept, last 30 days" value={money(agg30._sum.sellerNetCents ?? 0)} sub={`After ${money(agg30._sum.platformFeeCents ?? 0, { exact: true })} in our fees and ${money(agg30._sum.processingFeeCents ?? 0, { exact: true })} card costs`} />
        <Stat label="Active members" value={members} sub="Communities and alert rooms" />
        <Stat label="Followers" value={followers} sub={`${plural(ownBuyers, "buyer")} from your own link`} />
      </div>

      {!allDone ? (
        <Panel title="Get your first sale" description="Five steps. Most creators finish them in under 15 minutes.">
          <ol className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className={cn("flex items-center gap-3 text-sm", s.done ? "text-muted line-through" : "font-medium text-ink hover:underline")}>
                  {s.done ? <CheckCircle2 className="size-5 text-up" /> : <Circle className="size-5 text-line-strong" />}
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <div id="share" className="card scroll-mt-24 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[17px]">Your link</h2>
            <p className="mt-1 text-sm text-muted">Put it in your bio and videos. Anyone who buys after coming through it is your buyer: you pay 0% on them, for good.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input readOnly value={link} className="input min-w-0 flex-1" aria-label="Your link" />
          <CopyButton value={link} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Recent sales"
          action={
            <Link href="/creator/sales" className="text-sm font-semibold hover:underline">
              All sales
            </Link>
          }
        >
          {recent.length ? (
            <ul className="-my-2 divide-y divide-line">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.product?.title ?? o.description}</div>
                    <div className="truncate text-xs text-muted">
                      {o.buyer.displayName} · {formatDate(o.paidAt)} · <span className="num">{orderNumber(o.number)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num font-semibold">{o.amountCents ? money(o.amountCents, { exact: true }) : "Free"}</div>
                    <div className="text-xs text-muted">
                      {o.status === "REFUNDED" ? "Refunded" : o.status === "PARTIALLY_REFUNDED" ? "Part refunded" : o.status === "DISPUTED" ? "Disputed" : FEE_SHORT[o.feeType]}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No sales yet. Share your link to get the first one.</p>
          )}
        </Panel>

        <Panel title="Balance" action={<Link href="/creator/payouts" className="text-sm font-semibold hover:underline">Payouts</Link>}>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">On hold</dt>
              <dd className="num font-semibold">{money(bal.pendingCents, { exact: true })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Ready to pay out</dt>
              <dd className="num font-semibold">{money(bal.availableCents, { exact: true })}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3">
              <dt className="text-muted">Paid out so far</dt>
              <dd className="num font-semibold">{money(bal.paidOutCents, { exact: true })}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
