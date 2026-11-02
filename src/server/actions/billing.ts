"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { formatDate } from "@/lib/utils";
import { requireUser } from "@/server/dal";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/rate-limit";
import { cancelStripeSubscription } from "@/server/stripe";
import { REFUND_REASONS, escalateRefund, requestRefund } from "@/server/commerce/refunds";

async function ownSubscription(userId: string, formData: FormData) {
  const id = String(formData.get("subscriptionId") ?? "");
  return db.subscription.findFirst({ where: { id, buyerId: userId }, include: { product: true } });
}

/** Cancels at the end of the paid period: access stays until then. */
export async function cancelSubscription(formData: FormData) {
  const user = await requireUser();
  const sub = await ownSubscription(user.id, formData);
  if (!sub || sub.status === "CANCELED" || sub.cancelAtPeriodEnd) return;
  if (sub.provider === "STRIPE" && sub.stripeSubscriptionId) {
    try {
      await cancelStripeSubscription(sub.stripeSubscriptionId, true);
    } catch (err) {
      console.error("[billing] stripe cancel", err);
      await flash("We couldn't reach the payment provider. Try again in a minute.", "error");
      return;
    }
  }
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
  await notify(sub.sellerId, {
    type: "subscription.canceled",
    title: `${user.displayName} canceled ${sub.product.title}`,
    body: `Their access ends on ${formatDate(sub.currentPeriodEnd)}.`,
    url: "/creator/customers",
  });
  await audit(user.id, "subscription.cancel", { type: "subscription", id: sub.id });
  await flash(`Canceled. You keep access until ${formatDate(sub.currentPeriodEnd)}.`);
  refresh();
}

export async function resumeSubscription(formData: FormData) {
  const user = await requireUser();
  const sub = await ownSubscription(user.id, formData);
  if (!sub || sub.status === "CANCELED" || !sub.cancelAtPeriodEnd || sub.currentPeriodEnd < new Date()) return;
  if (sub.provider === "STRIPE" && sub.stripeSubscriptionId) {
    try {
      await cancelStripeSubscription(sub.stripeSubscriptionId, false);
    } catch (err) {
      console.error("[billing] stripe resume", err);
      await flash("We couldn't reach the payment provider. Try again in a minute.", "error");
      return;
    }
  }
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false } });
  await audit(user.id, "subscription.resume", { type: "subscription", id: sub.id });
  await flash("Your membership will keep going.");
  refresh();
}

const refundSchema = z.object({
  orderId: z.string().min(1),
  reason: z.enum(REFUND_REASONS, { error: "Pick a reason" }),
  details: optionalText(2000),
});

export async function askForRefund(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = refundSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const rl = await rateLimit(`refund:${user.id}`, 10, 3600);
  if (!rl.ok) return fail("Too many requests. Try again later.");
  const res = await requestRefund({ orderId: parsed.data.orderId, buyerId: user.id, reason: parsed.data.reason, details: parsed.data.details ?? null });
  if ("error" in res) return fail(res.error ?? "Something went wrong.", formData);
  refresh();
  return success("Sent. The creator has 3 days to answer, then our team steps in if needed.");
}

/** The buyer disagrees with the creator's answer (or got none): our team decides. */
export async function askTeamToReview(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("refundId") ?? "");
  const refund = await db.refund.findUnique({ where: { id } });
  if (!refund || refund.requesterId !== user.id) return;
  const overdue = refund.status === "REQUESTED" && refund.createdAt.getTime() < Date.now() - 3 * 86400_000;
  if (refund.status !== "DENIED" && !overdue) return;
  await escalateRefund(refund.id, "buyer");
  await flash("Sent to the TraderTrades team. We'll email you our decision.");
  refresh();
}
