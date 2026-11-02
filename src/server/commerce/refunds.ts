import "server-only";
import { db } from "@/lib/db";
import { formatDate, money, orderNumber } from "@/lib/utils";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { paymentIntentFor, refundPayment, stripe } from "@/server/stripe";
import { cancelFutureBookings } from "@/server/bookings";
import { notifyAdmins } from "@/server/admin";

/** Creators have this long to answer a refund request before our team decides. */
export const REFUND_ANSWER_DAYS = 3;

export const REFUND_REASONS = [
  "It wasn't what was described",
  "I didn't get access or it didn't work",
  "It broke the marketplace rules",
  "I bought it by mistake",
  "I changed my mind",
  "Something else",
] as const;

type OrderLike = {
  id: string;
  kind: string;
  status: string;
  paidAt: Date | null;
  amountCents: number;
  refundedCents: number;
  subscriptionId: string | null;
};

/** Can the buyer still ask for a refund on this order? Memberships: the first payment only. */
export async function refundWindow(order: OrderLike, product: { refundDays: number } | null) {
  const none = { open: false as const, until: null as Date | null };
  if (!product || !order.paidAt || order.amountCents <= 0) return none;
  if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") return none;
  if (order.refundedCents >= order.amountCents) return none;
  if (order.kind !== "PURCHASE" && order.kind !== "RENEWAL") return none;
  if (order.kind === "RENEWAL") {
    // Only the first paid payment of a membership (for example the first one after a free trial).
    const earlier = await db.order.count({
      where: { subscriptionId: order.subscriptionId, amountCents: { gt: 0 }, paidAt: { lt: order.paidAt }, id: { not: order.id } },
    });
    if (earlier > 0) return none;
  }
  const until = new Date(order.paidAt.getTime() + product.refundDays * 86400_000);
  if (product.refundDays <= 0 || until < new Date()) return { open: false as const, until };
  return { open: true as const, until };
}

export async function requestRefund(input: { orderId: string; buyerId: string; reason: string; details?: string | null }) {
  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { product: true, buyer: true, refunds: true } });
  if (!order || order.buyerId !== input.buyerId) return { error: "Order not found." };
  if (order.refunds.some((r) => r.status === "REQUESTED" || r.status === "APPROVED")) return { error: "You already asked for a refund on this order." };
  const window = await refundWindow(order, order.product);
  if (!window.open) return { error: window.until ? `The refund window closed on ${formatDate(window.until)}. Contact support if something went wrong.` : "This order can't be refunded here. Contact support if something went wrong." };

  const refund = await db.refund.create({
    data: {
      orderId: order.id,
      requesterId: input.buyerId,
      amountCents: order.amountCents - order.refundedCents,
      reason: input.reason,
      details: input.details ?? null,
    },
  });
  const due = new Date(Date.now() + REFUND_ANSWER_DAYS * 86400_000);
  if (order.sellerId) {
    await notify(order.sellerId, {
      type: "refund.requested",
      title: `Refund request: ${order.product?.title ?? orderNumber(order.number)}`,
      body: `${order.buyer.displayName} asked for a ${money(refund.amountCents, { exact: true })} refund. Reason: ${input.reason}. Please answer by ${formatDate(due)}, or our team will decide.`,
      url: "/creator/sales?tab=refunds",
      email: "orders",
      ctaLabel: "Answer the request",
    });
  }
  await audit(input.buyerId, "refund.request", { type: "order", id: order.id }, { reason: input.reason });
  return { refund };
}

/**
 * Sends the money back and records it. Our platform fee for the refunded part goes back to the seller;
 * card processing isn't returned (Stripe keeps it), so the seller covers that small part.
 */
export async function processRefund(refundId: string, actorId: string | null, note?: string | null) {
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { order: { include: { product: true } } } });
  if (!refund) throw new Error("Refund not found");
  if (refund.status === "PROCESSED") return refund;
  const order = refund.order;
  const amount = Math.min(refund.amountCents, order.amountCents - order.refundedCents);
  if (amount <= 0) throw new Error("Nothing left to refund on this order");
  const feeBack = order.amountCents ? Math.round((order.platformFeeCents * amount) / order.amountCents) : 0;

  // Claim it first so a double click can't refund twice.
  const claimed = await db.refund.updateMany({
    where: { id: refund.id, status: { in: ["REQUESTED", "DENIED"] } },
    data: { status: "APPROVED", decidedById: actorId, decidedAt: new Date(), decisionNote: note ?? null },
  });
  if (claimed.count === 0) throw new Error("This refund was already handled");

  let stripeRefundId: string | null = null;
  try {
    if (order.provider === "STRIPE") {
      const pi = await paymentIntentFor(order);
      if (!pi) throw new Error("We couldn't find this payment at Stripe");
      const r = await refundPayment({ paymentIntentId: pi, amountCents: amount, platformFeeRefundCents: feeBack, orderId: order.id });
      stripeRefundId = r.id;
    }
  } catch (err) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "REQUESTED", decidedById: null, decidedAt: null } });
    throw err;
  }

  await recordRefund(order.id, amount, feeBack, { refundId: refund.id, stripeRefundId });
  await audit(actorId, "refund.process", { type: "order", id: order.id }, { amount });
  return refund;
}

/** Books a refund in our records: order totals, the seller's ledger, access, and notices. */
export async function recordRefund(
  orderId: string,
  amountCents: number,
  feeBackCents: number,
  opts: { refundId?: string | null; stripeRefundId?: string | null; note?: string } = {},
) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { product: true, subscription: true } });
  if (!order) return;
  const refunded = Math.min(order.amountCents, order.refundedCents + amountCents);
  const full = refunded >= order.amountCents;
  const now = new Date();
  const ref = orderNumber(order.number);

  // While the sale is still on hold, the refund comes out of the held money (same release date),
  // so it never shows up as a negative "ready to pay out" balance.
  const sale = order.sellerId
    ? await db.ledgerEntry.findFirst({ where: { orderId: order.id, userId: order.sellerId, type: "SALE" }, select: { availableAt: true } })
    : null;
  const availableAt = sale && sale.availableAt > now ? sale.availableAt : now;

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { refundedCents: refunded, status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    if (order.sellerId) {
      await tx.ledgerEntry.create({
        data: { userId: order.sellerId, orderId: order.id, type: "REFUND", amountCents: -amountCents, description: `Refund ${ref}`, availableAt },
      });
      if (feeBackCents > 0) {
        await tx.ledgerEntry.create({
          data: { userId: order.sellerId, orderId: order.id, type: "PLATFORM_FEE", amountCents: feeBackCents, description: `Fee returned for refund ${ref}`, availableAt },
        });
      }
    }
    if (opts.refundId) {
      await tx.refund.update({ where: { id: opts.refundId }, data: { status: "PROCESSED", processedAt: now, stripeRefundId: opts.stripeRefundId ?? null } });
    }
    if (full && order.productId) {
      await tx.entitlement.updateMany({
        where: { userId: order.buyerId, productId: order.productId, status: "ACTIVE" },
        data: { status: "REFUNDED", endsAt: now },
      });
      if (order.kind === "PURCHASE") await tx.product.update({ where: { id: order.productId }, data: { salesCount: { decrement: 1 } } });
      if (order.subscription && order.subscription.status !== "CANCELED") {
        await tx.subscription.update({ where: { id: order.subscription.id }, data: { status: "CANCELED", canceledAt: now, cancelAtPeriodEnd: false } });
      }
    }
  });

  // Refunded mentoring: calls still to come are canceled and the mentor is told.
  if (full && order.productId) {
    await cancelFutureBookings(order.buyerId, order.productId, "The buyer was refunded, so this call was canceled.");
  }

  // A refunded membership stops renewing.
  if (full && order.subscription?.stripeSubscriptionId && order.subscription.status !== "CANCELED") {
    try {
      await stripe().subscriptions.cancel(order.subscription.stripeSubscriptionId);
    } catch (err) {
      console.error("[refunds] couldn't cancel Stripe subscription", err);
    }
  }

  try {
    const title = order.product?.title ?? ref;
    await notify(order.buyerId, {
      type: "refund.processed",
      title: `Refund sent: ${title}`,
      body: `${money(amountCents, { exact: true })} is on its way back to your card. It usually shows up in 5 to 10 working days.${full ? " Access to the product has ended." : ""}`,
      url: "/settings/billing",
      email: "orders",
    });
    if (order.sellerId) {
      await notify(order.sellerId, {
        type: "refund.processed",
        title: `Refunded: ${title}`,
        body: `${money(amountCents, { exact: true })} was refunded on ${ref}.${feeBackCents ? ` Our ${money(feeBackCents, { exact: true })} fee for it came back to you.` : ""}`,
        url: "/creator/sales",
      });
    }
  } catch (err) {
    console.error("[refunds] notice failed", err);
  }
}

export async function denyRefund(refundId: string, actorId: string, note: string) {
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { order: { include: { product: true } } } });
  if (!refund || refund.status !== "REQUESTED") throw new Error("This refund was already handled");
  await db.refund.update({ where: { id: refund.id }, data: { status: "DENIED", decidedById: actorId, decidedAt: new Date(), decisionNote: note } });
  await notify(refund.requesterId, {
    type: "refund.denied",
    title: `Refund not approved: ${refund.order.product?.title ?? orderNumber(refund.order.number)}`,
    body: `The creator said: "${note}". If you disagree, you can ask the TraderTrades team to review it from your purchases page.`,
    url: "/settings/billing",
    email: "orders",
  });
  await audit(actorId, "refund.deny", { type: "refund", id: refund.id });
}

/** Hands a refund to our team: the buyer disagreed, or the creator didn't answer in time. */
export async function escalateRefund(refundId: string, by: "buyer" | "timeout") {
  const refund = await db.refund.findUnique({ where: { id: refundId } });
  if (!refund || refund.escalatedAt || refund.status === "PROCESSED" || refund.status === "APPROVED") return null;
  const updated = await db.refund.update({ where: { id: refund.id }, data: { escalatedAt: new Date(), status: "REQUESTED" } });
  await notifyAdmins({
    type: "admin.refund",
    title: by === "buyer" ? "A buyer asked us to review a refund" : "A refund request wasn't answered in time",
    url: "/admin/refunds",
  });
  await audit(null, "refund.escalate", { type: "refund", id: refund.id }, { by });
  return updated;
}

/** Daily: requests the creator didn't answer within 3 days go to our team. */
export async function escalateOverdueRefunds(now = new Date()) {
  const cutoff = new Date(now.getTime() - REFUND_ANSWER_DAYS * 86400_000);
  const overdue = await db.refund.findMany({ where: { status: "REQUESTED", escalatedAt: null, createdAt: { lte: cutoff } }, select: { id: true }, take: 200 });
  for (const r of overdue) await escalateRefund(r.id, "timeout");
  return overdue.length;
}
