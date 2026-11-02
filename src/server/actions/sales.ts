"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { fail, formObject, invalid, success, type ActionState } from "@/lib/forms";
import { requireCreator } from "@/server/dal";
import { flash } from "@/server/flash";
import { audit } from "@/server/audit";
import { denyRefund, processRefund } from "@/server/commerce/refunds";
import { payoutDashboardLink, payoutOnboardingLink, syncAccount } from "@/server/stripe";
import { payOutAvailable, payoutBlocker } from "@/server/commerce/payouts";

async function sellerRefund(refundId: string) {
  const user = await requireCreator();
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { order: true } });
  if (!refund || refund.order.sellerId !== user.id) return { user, refund: null };
  return { user, refund };
}

export async function approveRefund(formData: FormData) {
  const { user, refund } = await sellerRefund(String(formData.get("refundId") ?? ""));
  if (!refund) return;
  if (refund.escalatedAt) {
    await flash("Our team is deciding this one now.", "info");
    return;
  }
  try {
    await processRefund(refund.id, user.id, "Approved by the creator");
    await flash("Refunded. The buyer has been told.");
  } catch (err) {
    console.error("[sales] refund failed", err);
    await flash(err instanceof Error ? err.message : "The refund didn't go through. Try again.", "error");
  }
  refresh();
}

const denySchema = z.object({
  refundId: z.string().min(1),
  note: z.string().trim().min(10, "Tell the buyer why, in a sentence or two").max(1000),
});

export async function declineRefund(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = denySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { user, refund } = await sellerRefund(parsed.data.refundId);
  if (!refund) return fail("Request not found.");
  if (refund.escalatedAt) return fail("Our team is deciding this one now.");
  try {
    await denyRefund(refund.id, user.id, parsed.data.note);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't save that.");
  }
  refresh();
  return success("Sent. If the buyer disagrees, our team will look at it.");
}

/** Stripe Connect onboarding, or (preview mode) a one click test setup. */
export async function setUpPayouts() {
  const user = await requireCreator();
  if (!features.stripe) {
    await db.creatorProfile.update({ where: { userId: user.id }, data: { testPayoutsReady: true } });
    await audit(user.id, "payouts.test_setup");
    await flash("Payouts are set up in preview mode. You can publish paid products now.");
    refresh();
    return;
  }
  let url: string;
  try {
    url = await payoutOnboardingLink({ id: user.id, email: user.email, creator: { id: user.creator.id, stripeAccountId: user.creator.stripeAccountId } });
  } catch (err) {
    console.error("[payouts] onboarding", err);
    await flash("We couldn't reach Stripe. Try again in a minute.", "error");
    return;
  }
  redirect(url);
}

export async function openPayoutDashboard() {
  const user = await requireCreator();
  if (!features.stripe || !user.creator.stripeAccountId) return;
  let url: string;
  try {
    await syncAccount(user.creator.stripeAccountId);
    url = await payoutDashboardLink(user.creator.stripeAccountId);
  } catch (err) {
    console.error("[payouts] dashboard", err);
    await flash("Finish setting up payouts first.", "error");
    return;
  }
  redirect(url);
}

/** Preview mode: pays out the available balance on paper, so the whole flow can be tried. */
export async function requestTestPayout() {
  const user = await requireCreator();
  if (features.stripe) return;
  const blocked = await payoutBlocker(user.id);
  if (blocked) {
    await flash(blocked, "info");
    return;
  }
  const payout = await payOutAvailable(user.id);
  if (!payout) {
    await flash("Nothing is available to pay out yet. Sales become available after the hold period.", "info");
    return;
  }
  await audit(user.id, "payout.test", { type: "payout", id: payout.id }, { amount: payout.amountCents });
  await flash("Test payout recorded. With Stripe connected this lands in your bank.");
  refresh();
}
