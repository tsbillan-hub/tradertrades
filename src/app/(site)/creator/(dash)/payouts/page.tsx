import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CheckCircle2, FlaskConical } from "lucide-react";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { requireCreator } from "@/server/dal";
import { balances } from "@/server/commerce/balance";
import { nextPayoutDate } from "@/server/commerce/payouts";
import { syncAccount } from "@/server/stripe";
import { openPayoutDashboard, requestTestPayout, setUpPayouts } from "@/server/actions/sales";
import { ActionButton } from "@/components/ui/form";
import { Notice, PageHeader, Stat } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { HOLD_DAYS, NEW_SELLER_HOLD_DAYS, NEW_SELLER_PERIOD_DAYS } from "@/lib/fees";
import { cn, formatDate, money, msSince } from "@/lib/utils";

export const metadata: Metadata = { title: "Payouts" };

const PAYOUT_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Starting", tone: "badge-outline" },
  IN_TRANSIT: { label: "On its way", tone: "badge-info" },
  PAID: { label: "Sent", tone: "badge-ok" },
  FAILED: { label: "Failed", tone: "badge-bad" },
};

const TYPE_LABEL: Record<string, string> = {
  SALE: "Sale",
  PLATFORM_FEE: "TraderTrades fee",
  PROCESSING_FEE: "Card processing",
  REFUND: "Refund",
  PAYOUT: "Payout",
  ADJUSTMENT: "Adjustment",
  CAMPAIGN: "Campaign",
};

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ connected?: string; refresh?: string }> }) {
  const sp = await searchParams;
  const user = await requireCreator();
  let c = user.creator;
  // Coming back from Stripe: refresh what Stripe says about the account.
  if (features.stripe && c.stripeAccountId && (sp.connected || sp.refresh || !c.stripeChargesEnabled)) {
    try {
      await syncAccount(c.stripeAccountId);
      c = (await db.creatorProfile.findUnique({ where: { userId: user.id } })) ?? c;
    } catch (err) {
      console.error("[payouts] sync", err);
    }
  }
  const [bal, payouts, entries] = await Promise.all([
    balances(user.id),
    db.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const ready = features.stripe ? c.stripeChargesEnabled : c.testPayoutsReady;
  const newSeller = !c.approvedAt || msSince(c.approvedAt) < NEW_SELLER_PERIOD_DAYS * 86400_000;
  const paused = Boolean(c.payoutsPausedAt) || user.status !== "ACTIVE";
  const next = nextPayoutDate();
  const nextLabel = next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" description="How your money gets to your bank." />

      {!features.stripe ? (
        <Notice tone="warn" title="Preview mode">
          Stripe isn&apos;t connected yet, so payouts here are a test: no real money moves. Once Stripe is connected, this page links your bank through
          Stripe and payouts are automatic.
        </Notice>
      ) : null}

      {paused ? (
        <Notice tone="warn" title="Payouts are paused">
          {c.payoutsPausedReason ?? (user.status !== "ACTIVE" ? "Your account is on hold." : "Our team is looking at something on your account.")} Sales still come in and
          your balance is safe; nothing is sent to your bank until this is cleared. Questions?{" "}
          <Link href="/help#contact" className="underline underline-offset-2">
            Contact us
          </Link>
          .
        </Notice>
      ) : null}

      <Panel
        title={ready ? "Payouts are set up" : "Set up payouts"}
        description={
          features.stripe
            ? "Payments go through Stripe, straight to your own Stripe account. Stripe pays out to your bank automatically."
            : "One click in preview mode. With Stripe connected, this is where you add your bank details."
        }
      >
        {ready ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-up">
              <CheckCircle2 className="size-5" /> {features.stripe ? (c.stripePayoutsEnabled ? "Ready to take payments and pay out" : "Ready to take payments. Stripe still needs a few details for payouts.") : "Ready (test)"}
            </span>
            {features.stripe ? (
              <ActionButton action={openPayoutDashboard} variant="secondary" size="md">
                Open Stripe dashboard
              </ActionButton>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {features.stripe && c.stripeAccountId ? <p className="text-sm text-muted">You started setting up. Finish the last steps on Stripe.</p> : null}
            <ActionButton action={setUpPayouts} variant="primary" size="lg">
              {features.stripe ? (c.stripeAccountId ? "Finish setup on Stripe" : "Set up payouts with Stripe") : (
                <>
                  <FlaskConical /> Set up test payouts
                </>
              )}
            </ActionButton>
            <p className="text-xs text-muted">Stripe asks for your details and bank account. Under 18? Stripe may need a parent or guardian to help, depending on your country.</p>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="On hold" value={money(bal.pendingCents, { exact: true })} sub={`Sales wait ${newSeller ? NEW_SELLER_HOLD_DAYS : HOLD_DAYS} days to cover refunds`} />
        <Stat
          label="Ready to pay out"
          value={money(bal.availableCents, { exact: true })}
          sub={
            bal.availableCents < 0
              ? "From a refund after a payout. It comes out of your next sales"
              : paused
                ? "Paused"
                : ready
                  ? `Next payout ${nextLabel}`
                  : "Set up payouts to get paid"
          }
        />
        <Stat label="Paid out so far" value={money(bal.paidOutCents, { exact: true })} />
      </div>
      <p className="-mt-3 text-xs text-muted">
        Payouts go out every Monday. New sellers&apos; sales are held {NEW_SELLER_HOLD_DAYS} days for their first {NEW_SELLER_PERIOD_DAYS} days, then {HOLD_DAYS} days.
      </p>

      {!features.stripe && ready && !paused ? (
        <Panel title="Test payout" description="Moves your available balance into a pretend payout now, instead of waiting for Monday, so you can see the whole flow.">
          {bal.availableCents > 0 ? (
            <ActionButton action={requestTestPayout} variant="secondary" size="md">
              <Banknote /> Pay out {money(bal.availableCents, { exact: true })} (test)
            </ActionButton>
          ) : (
            <p className="text-sm text-muted">Nothing is ready yet. Sales show up here once their hold ends.</p>
          )}
        </Panel>
      ) : null}

      {payouts.length ? (
        <Panel title="Payouts">
          <ul className="-my-2 divide-y divide-line text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {formatDate(p.paidAt ?? p.createdAt)}
                    <span className={cn("badge", PAYOUT_STATUS[p.status]?.tone)}>{PAYOUT_STATUS[p.status]?.label ?? p.status}</span>
                    {p.provider === "TEST" ? <span className="badge badge-warn">Test</span> : null}
                  </span>
                  {p.status === "FAILED" && p.failureReason ? <span className="mt-0.5 block text-xs text-down">{p.failureReason}</span> : null}
                  {p.status === "IN_TRANSIT" && p.arrivalDate ? <span className="mt-0.5 block text-xs text-muted">Expected by {formatDate(p.arrivalDate)}</span> : null}
                </span>
                <span className="num shrink-0 font-semibold">{money(p.amountCents, { exact: true })}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Activity" description="Every sale, fee and refund on your balance.">
        {entries.length ? (
          <ul className="-my-2 divide-y divide-line text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate">{e.description}</div>
                  <div className="text-xs text-muted">
                    {TYPE_LABEL[e.type] ?? e.type} · {formatDate(e.createdAt)}
                    {e.availableAt > new Date() ? ` · on hold until ${formatDate(e.availableAt)}` : ""}
                  </div>
                </div>
                <span className={cn("num shrink-0 font-semibold", e.amountCents < 0 ? "text-down" : "text-up")}>
                  {e.amountCents < 0 ? "-" : "+"}
                  {money(Math.abs(e.amountCents), { exact: true })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </Panel>
    </div>
  );
}
