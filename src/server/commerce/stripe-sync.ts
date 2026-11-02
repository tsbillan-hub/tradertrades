import "server-only";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { orderNumber } from "@/lib/utils";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { attributionFor } from "@/server/commerce/attribution";
import { completeOrder, createPendingOrder, endSubscription } from "@/server/commerce/orders";
import { recordRefund } from "@/server/commerce/refunds";
import { setSubscriptionFee, stripe } from "@/server/stripe";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/** Finishes our order from a completed Checkout Session. Used by the webhook and the success page. */
export async function completeFromCheckoutSession(s: Stripe.Checkout.Session) {
  const orderId = s.metadata?.orderId ?? s.client_reference_id;
  if (!orderId) return null;
  if (s.status !== "complete") return null;
  if (s.mode === "payment" && s.payment_status !== "paid") return null;

  let subId: string | null = null;
  let trialEnd: Date | null = null;
  let periodEnd: Date | null = null;
  if (s.subscription) {
    const sub = typeof s.subscription === "string" ? await stripe().subscriptions.retrieve(s.subscription) : s.subscription;
    subId = sub.id;
    if (sub.status === "trialing" && sub.trial_end) trialEnd = new Date(sub.trial_end * 1000);
    const end = sub.items.data[0]?.current_period_end;
    if (end) periodEnd = new Date(end * 1000);
  }

  const order = await completeOrder(orderId, {
    stripePaymentIntentId: idOf(s.payment_intent),
    stripeInvoiceId: idOf(s.invoice),
    stripeSubscriptionId: subId,
    periodEnd,
    trialEnd,
  });

  // After a first paid month from a buyer we found, the rest are repeat purchases (5%).
  if (subId && order && order.amountCents > 0 && order.feeType === "MARKETPLACE_FIRST") {
    const price = order.priceId ? await db.price.findUnique({ where: { id: order.priceId } }) : null;
    if (price) await setSubscriptionFee(subId, "MARKETPLACE_REPEAT", price.amountCents).catch((e) => console.error("[stripe] fee update", e));
  }
  return order;
}

function subscriptionIdFromInvoice(inv: Stripe.Invoice) {
  return idOf(inv.parent?.subscription_details?.subscription ?? null);
}

/** A membership renewal was paid at Stripe: record it as a renewal order. */
export async function recordStripeRenewal(inv: Stripe.Invoice) {
  if (inv.billing_reason === "subscription_create") return null; // the first payment comes through checkout
  const stripeSubId = subscriptionIdFromInvoice(inv);
  if (!stripeSubId) return null;
  const sub = await db.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubId },
    include: { price: true, product: { include: { creator: { select: { id: true, username: true } } } } },
  });
  if (!sub) return null;
  if (await db.order.findUnique({ where: { stripeInvoiceId: inv.id } })) return null;

  const attr = await attributionFor(sub.buyerId, sub.product.creator, null);
  let orderId: string;
  try {
    const order = await createPendingOrder({
      buyerId: sub.buyerId,
      product: { id: sub.productId, title: sub.product.title, creatorId: sub.sellerId },
      price: { ...sub.price, amountCents: inv.amount_paid },
      discountCents: 0,
      feeType: attr.feeType,
      provider: "STRIPE",
      kind: "RENEWAL",
      subscriptionId: sub.id,
      stripeInvoiceId: inv.id,
    });
    orderId = order.id;
  } catch (err) {
    // Unique invoice id: another delivery of the same event got here first.
    if (String(err).includes("Unique constraint")) return null;
    throw err;
  }
  const line = inv.lines.data[0];
  const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : new Date();
  const order = await completeOrder(orderId, {
    paidAt,
    stripeInvoiceId: inv.id,
    periodEnd: line?.period?.end ? new Date(line.period.end * 1000) : null,
  });
  if (attr.feeType === "MARKETPLACE_FIRST" && inv.amount_paid > 0) {
    await setSubscriptionFee(stripeSubId, "MARKETPLACE_REPEAT", sub.price.amountCents).catch((e) => console.error("[stripe] fee update", e));
  }
  return order;
}

const STATUS: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  paused: "PAST_DUE",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  canceled: "CANCELED",
};

export async function syncStripeSubscription(s: Stripe.Subscription) {
  const sub = await db.subscription.findUnique({ where: { stripeSubscriptionId: s.id } });
  if (!sub) return null;
  const status = STATUS[s.status] ?? sub.status;
  if (status === "CANCELED") return endSubscription(sub.id);
  const item = s.items.data[0];
  return db.subscription.update({
    where: { id: sub.id },
    data: {
      status,
      cancelAtPeriodEnd: Boolean(s.cancel_at_period_end || s.cancel_at),
      currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : undefined,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : undefined,
    },
  });
}

export async function markPaymentFailed(inv: Stripe.Invoice) {
  const stripeSubId = subscriptionIdFromInvoice(inv);
  if (!stripeSubId) return;
  const sub = await db.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId }, include: { product: true } });
  if (!sub) return;
  await db.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
  await notify(sub.buyerId, {
    type: "billing.failed",
    title: `Payment failed: ${sub.product.title}`,
    body: "Your card didn't go through. Stripe will try again over the next few days. Update your card from the link in Stripe's email to keep your access.",
    url: "/settings/billing",
    email: "orders",
  });
}

/** Refunds made straight in the Stripe dashboard. Ours are recorded when we make them. */
export async function recordOutsideRefund(r: Stripe.Refund) {
  if (r.metadata?.source === "tradertrades") return;
  if (r.status === "failed" || r.status === "canceled") return;
  const pi = idOf(r.payment_intent);
  const orderId = r.metadata?.orderId;
  const order = orderId
    ? await db.order.findUnique({ where: { id: orderId } })
    : pi
      ? await db.order.findFirst({ where: { stripePaymentIntentId: pi } })
      : null;
  if (!order) return;
  await recordRefund(order.id, Math.min(r.amount, order.amountCents - order.refundedCents), 0, { note: "Refunded in Stripe" });
  await audit(null, "refund.outside", { type: "order", id: order.id }, { amount: r.amount });
}

export async function markDisputed(d: Stripe.Dispute) {
  const pi = idOf(d.payment_intent);
  if (!pi) return;
  const order = await db.order.findFirst({ where: { stripePaymentIntentId: pi }, include: { product: true } });
  if (!order) return;
  await db.order.update({ where: { id: order.id }, data: { status: "DISPUTED" } });
  if (order.sellerId) {
    await notify(order.sellerId, {
      type: "order.disputed",
      title: `Payment disputed: ${order.product?.title ?? orderNumber(order.number)}`,
      body: "The buyer's bank opened a dispute. Our team will contact you if we need evidence, like proof of access.",
      url: "/creator/sales",
      email: "orders",
    });
  }
  const admins = await db.user.findMany({ where: { OR: [{ isAdmin: true }, { email: { in: env.adminEmails } }] }, select: { id: true } });
  for (const a of admins) await notify(a.id, { type: "admin.dispute", title: `Dispute on ${orderNumber(order.number)}`, url: "/admin/orders" });
}

export async function syncConnectedAccount(a: Stripe.Account) {
  await db.creatorProfile.updateMany({
    where: { stripeAccountId: a.id },
    data: { stripeChargesEnabled: Boolean(a.charges_enabled), stripePayoutsEnabled: Boolean(a.payouts_enabled) },
  });
}
