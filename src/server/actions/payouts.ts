"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { HOLD_DAYS, NEW_SELLER_HOLD_DAYS, NEW_SELLER_PERIOD_DAYS } from "@/lib/fees";
import { fail, formObject, invalid, success, type ActionState } from "@/lib/forms";
import { money, msSince } from "@/lib/utils";
import { requireAdmin } from "@/server/dal";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { runTestPayouts } from "@/server/commerce/payouts";
import { sendCredit, setStripePayoutsPaused } from "@/server/stripe";

const id = z.string().min(1).max(60);

async function done(message: string) {
  await flash(message);
  refresh();
  return success(message);
}

function holdDaysFor(approvedAt: Date | null) {
  return !approvedAt || msSince(approvedAt) < NEW_SELLER_PERIOD_DAYS * 86_400_000 ? NEW_SELLER_HOLD_DAYS : HOLD_DAYS;
}

/** Stops money going to a creator's bank (sales keep coming in) until staff restart it. */
export async function pauseCreatorPayouts(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ userId: id, reason: z.string().trim().min(5, "Say why in a few words").max(300, "300 characters at most") })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { userId, reason } = parsed.data;
  const c = await db.creatorProfile.findUnique({ where: { userId }, select: { stripeAccountId: true, approvedAt: true, payoutsPausedAt: true } });
  if (!c) return fail("That account isn't a creator.");
  if (c.payoutsPausedAt) return fail("Payouts are already paused for this creator.");
  if (features.stripe && c.stripeAccountId) {
    try {
      await setStripePayoutsPaused(c.stripeAccountId, true, holdDaysFor(c.approvedAt));
    } catch (err) {
      console.error("[payouts] pause at Stripe", err);
      return fail("Stripe didn't accept the change, so nothing was paused. Try again in a minute.");
    }
  }
  await db.creatorProfile.update({ where: { userId }, data: { payoutsPausedAt: new Date(), payoutsPausedReason: reason } });
  await audit(admin.id, "payouts.pause", { type: "user", id: userId }, { reason });
  await notify(userId, {
    type: "payout.paused",
    title: "Your payouts are paused",
    body: `${reason} Your sales still come in and your balance is safe. Nothing is sent to your bank until we restart payouts.`,
    url: "/creator/payouts",
    email: "orders",
  });
  return done("Payouts paused. The creator was told why.");
}

export async function resumeCreatorPayouts(formData: FormData) {
  const admin = await requireAdmin();
  const userId = id.safeParse(formData.get("userId"));
  if (!userId.success) return;
  const c = await db.creatorProfile.findUnique({ where: { userId: userId.data }, select: { stripeAccountId: true, approvedAt: true, payoutsPausedAt: true } });
  if (!c?.payoutsPausedAt) {
    await flash("Payouts weren't paused.", "info");
    refresh();
    return;
  }
  if (features.stripe && c.stripeAccountId) {
    try {
      await setStripePayoutsPaused(c.stripeAccountId, false, holdDaysFor(c.approvedAt));
    } catch (err) {
      console.error("[payouts] resume at Stripe", err);
      await flash("Stripe didn't accept the change, so payouts are still paused. Try again in a minute.", "error");
      refresh();
      return;
    }
  }
  await db.creatorProfile.update({ where: { userId: userId.data }, data: { payoutsPausedAt: null, payoutsPausedReason: null } });
  await audit(admin.id, "payouts.resume", { type: "user", id: userId.data });
  await notify(userId.data, {
    type: "payout.resumed",
    title: "Your payouts are back on",
    body: "Money that's ready goes out with the next Monday payout.",
    url: "/creator/payouts",
    email: "orders",
  });
  await flash("Payouts restarted.");
  refresh();
}

/**
 * Adds money to (or, in preview mode, takes money off) a creator's balance, with a reason they see.
 * With Stripe connected, a credit is sent to their Stripe account straight away; money is taken back by refunding orders instead.
 */
export async function adjustBalance(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      userId: id,
      amount: z.coerce
        .number({ error: "Enter an amount" })
        .refine((n) => Number.isFinite(n) && n !== 0, "Enter an amount that isn't zero")
        .refine((n) => Math.abs(n) <= 10_000, "Up to $10,000 at a time"),
      reason: z.string().trim().min(5, "Say why in a few words").max(200, "200 characters at most"),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { userId, reason } = parsed.data;
  const cents = Math.round(parsed.data.amount * 100);
  const c = await db.creatorProfile.findUnique({ where: { userId }, select: { stripeAccountId: true } });
  if (!c) return fail("That account isn't a creator.", formData);
  if (features.stripe && cents < 0) return fail("With Stripe connected, take money back by refunding the order it came from.", formData);
  if (features.stripe && !c.stripeAccountId) return fail("This creator hasn't set up payouts with Stripe yet, so there's nowhere to send a credit.", formData);

  const entry = await db.ledgerEntry.create({
    data: { userId, type: "ADJUSTMENT", amountCents: cents, description: `From the TraderTrades team: ${reason}`, availableAt: new Date() },
  });
  if (features.stripe && c.stripeAccountId) {
    try {
      const t = await sendCredit({ destination: c.stripeAccountId, amountCents: cents, ledgerId: entry.id, description: reason });
      // The credit goes straight to their Stripe balance, so it counts as paid out from here.
      const payout = await db.payout.create({ data: { userId, amountCents: cents, provider: "STRIPE", status: "PAID", paidAt: new Date(), stripeTransferId: t.id } });
      await db.ledgerEntry.update({ where: { id: entry.id }, data: { payoutId: payout.id } });
    } catch (err) {
      console.error("[payouts] credit at Stripe", err);
      await db.ledgerEntry.delete({ where: { id: entry.id } });
      return fail("Stripe didn't accept the transfer, so nothing changed. Check the TraderTrades Stripe balance and try again.", formData);
    }
  }
  const shown = money(Math.abs(cents), { exact: true });
  await audit(admin.id, "payouts.adjust", { type: "user", id: userId }, { amount: cents, reason });
  await notify(userId, {
    type: "payout.adjusted",
    title: cents > 0 ? `We added ${shown} to your balance` : `We took ${shown} off your balance`,
    body: reason,
    url: "/creator/payouts",
    email: "orders",
  });
  return done(cents > 0 ? `Added ${shown} to their balance.` : `Took ${shown} off their balance.`);
}

/** Preview mode: runs the Monday payout now, for everyone who's due. */
export async function runPayoutsNow() {
  const admin = await requireAdmin();
  if (features.stripe) {
    await flash("Stripe pays creators on its own weekly schedule.", "info");
    refresh();
    return;
  }
  const r = await runTestPayouts();
  await audit(admin.id, "payouts.run", undefined, r);
  await flash(r.payouts ? `Paid ${r.payouts === 1 ? "1 creator" : `${r.payouts} creators`} ${money(r.cents, { exact: true })} (test).` : "Nobody had money ready to pay out.");
  refresh();
}
