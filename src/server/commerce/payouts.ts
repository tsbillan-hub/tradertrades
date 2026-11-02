import "server-only";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { money } from "@/lib/utils";
import { notify } from "@/server/notify";
import type { PayoutStatus } from "@/generated/prisma/enums";

/** Payouts go out once a week, on Mondays (UTC), for money whose hold has ended. */
export const PAYOUT_WEEKDAY = 1;

/** The next Monday payouts run (today, if it's Monday and the morning run hasn't happened yet). */
export function nextPayoutDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7));
  let add = (PAYOUT_WEEKDAY - d.getUTCDay() + 7) % 7;
  if (add === 0 && now >= d) add = 7;
  return new Date(d.getTime() + add * 86_400_000);
}

/**
 * Preview mode: moves everything that's ready into one pretend payout. Locked per creator, so two clicks
 * (or a click during the weekly run) can't pay the same money twice.
 */
export async function payOutAvailable(userId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${userId}`}))::text`;
    const now = new Date();
    const entries = await tx.ledgerEntry.findMany({ where: { userId, payoutId: null, availableAt: { lte: now } }, select: { id: true, amountCents: true } });
    const total = entries.reduce((s, e) => s + e.amountCents, 0);
    if (total <= 0) return null;
    const payout = await tx.payout.create({ data: { userId, amountCents: total, provider: "TEST", status: "PAID", paidAt: now, arrivalDate: now } });
    await tx.ledgerEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { payoutId: payout.id } });
    return payout;
  });
}

/** Why a creator can't be paid out right now, in words, or null when they can. */
export async function payoutBlocker(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, creator: { select: { payoutsPausedAt: true, testPayoutsReady: true, stripePayoutsEnabled: true } } } });
  if (!user?.creator) return "You don't have a creator account.";
  if (user.status !== "ACTIVE") return "Your account is on hold, so payouts are paused.";
  if (user.creator.payoutsPausedAt) return "Our team paused your payouts. We'll email you about it.";
  if (!features.stripe && !user.creator.testPayoutsReady) return "Set up payouts first.";
  return null;
}

/** The weekly run in preview mode: every creator with money ready, payouts set up and nothing paused gets paid. */
export async function runTestPayouts() {
  if (features.stripe) return { payouts: 0, cents: 0 };
  const now = new Date();
  const due = await db.ledgerEntry.groupBy({ by: ["userId"], where: { payoutId: null, availableAt: { lte: now } }, _sum: { amountCents: true } });
  const owed = due.filter((d) => (d._sum.amountCents ?? 0) > 0).map((d) => d.userId);
  if (!owed.length) return { payouts: 0, cents: 0 };
  const ready = await db.creatorProfile.findMany({
    where: { userId: { in: owed }, testPayoutsReady: true, payoutsPausedAt: null, user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  let payouts = 0;
  let cents = 0;
  for (const r of ready) {
    try {
      const p = await payOutAvailable(r.userId);
      if (!p) continue;
      payouts++;
      cents += p.amountCents;
      await notify(r.userId, {
        type: "payout.paid",
        title: `Payout sent: ${money(p.amountCents, { exact: true })}`,
        body: "This week's payout is on its way to your bank. (Preview mode: no real money moved.)",
        url: "/creator/payouts",
        email: "orders",
      });
    } catch (err) {
      console.error("[payouts] weekly run", r.userId, err);
    }
  }
  return { payouts, cents };
}

/**
 * Stripe paid a creator out from their own Stripe balance. Marks the oldest ready sales in our ledger as
 * paid, a whole order at a time, up to the payout's amount, so "ready to pay out" here matches Stripe.
 */
async function linkEntriesToPayout(userId: string, payoutId: string, amountCents: number, before: Date) {
  const entries = await db.ledgerEntry.findMany({
    where: { userId, payoutId: null, availableAt: { lte: before } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, amountCents: true, orderId: true },
  });
  const groups = new Map<string, { ids: string[]; sum: number }>();
  for (const e of entries) {
    const key = e.orderId ?? e.id;
    const g = groups.get(key) ?? { ids: [], sum: 0 };
    g.ids.push(e.id);
    g.sum += e.amountCents;
    groups.set(key, g);
  }
  let total = 0;
  const ids: string[] = [];
  for (const g of groups.values()) {
    if (total + g.sum > amountCents + 1) break;
    total += g.sum;
    ids.push(...g.ids);
  }
  if (ids.length) await db.ledgerEntry.updateMany({ where: { id: { in: ids } }, data: { payoutId } });
}

const STRIPE_STATUS: Record<string, PayoutStatus> = { pending: "PENDING", in_transit: "IN_TRANSIT", paid: "PAID", failed: "FAILED", canceled: "FAILED" };

/** Keeps our copy of a payout Stripe made to a creator's bank, and tells them when it's sent or fails. */
export async function recordStripePayout(accountId: string, p: { id: string; amount: number; status: string; arrival_date: number; created: number; failure_message: string | null; failure_code: string | null }) {
  const creator = await db.creatorProfile.findUnique({ where: { stripeAccountId: accountId }, select: { userId: true } });
  if (!creator) return;
  const status = STRIPE_STATUS[p.status] ?? "PENDING";
  const existing = await db.payout.findUnique({ where: { stripePayoutId: p.id } });
  const data = {
    amountCents: p.amount,
    status,
    arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
    failureReason: status === "FAILED" ? (p.failure_message ?? p.failure_code ?? "The bank didn't accept it.") : null,
    paidAt: status === "PAID" ? (existing?.paidAt ?? new Date()) : null,
  };
  const payout = existing
    ? await db.payout.update({ where: { id: existing.id }, data })
    : await db.payout.create({ data: { ...data, userId: creator.userId, provider: "STRIPE", stripePayoutId: p.id, createdAt: new Date(p.created * 1000) } });

  if (status === "PAID" && existing?.status !== "PAID") {
    await linkEntriesToPayout(creator.userId, payout.id, p.amount, new Date(p.created * 1000));
    await notify(creator.userId, {
      type: "payout.paid",
      title: `Payout sent: ${money(p.amount, { exact: true })}`,
      body: data.arrivalDate ? `It should reach your bank by ${data.arrivalDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : "It's on its way to your bank.",
      url: "/creator/payouts",
      email: "orders",
    });
  }
  if (status === "FAILED" && existing?.status !== "FAILED") {
    // Stripe puts the money back on the creator's balance, so it's ready to pay out again.
    await db.ledgerEntry.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null } });
    await notify(creator.userId, {
      type: "payout.failed",
      title: `A payout of ${money(p.amount, { exact: true })} failed`,
      body: `${data.failureReason} Check your bank details in your Stripe dashboard. The money stays in your balance until it can be sent.`,
      url: "/creator/payouts",
      email: "orders",
    });
  }
}
