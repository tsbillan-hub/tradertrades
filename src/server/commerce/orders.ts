import "server-only";
import type { BillingInterval, FeeType, PaymentProvider } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { FEE_BPS, holdDaysFor, processingFee } from "@/lib/fees";
import { INTERVAL_LABEL, productTypeInfo } from "@/lib/constants";
import { formatDate, money, orderNumber } from "@/lib/utils";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { attributionFor } from "@/server/commerce/attribution";

export const MIN_CHARGE_CENTS = 50;

export function computeAmounts(listCents: number, discountCents: number, feeType: FeeType) {
  const amountCents = Math.max(0, listCents - discountCents);
  const feeBps = amountCents > 0 ? FEE_BPS[feeType] : 0;
  const platformFeeCents = Math.round((amountCents * feeBps) / 10000);
  const processingFeeCents = processingFee(amountCents);
  return {
    amountCents,
    feeBps,
    platformFeeCents,
    processingFeeCents,
    sellerNetCents: Math.max(0, amountCents - platformFeeCents - processingFeeCents),
  };
}

export function couponDiscount(coupon: { percentOff: number | null; amountOffCents: number | null } | null | undefined, listCents: number) {
  if (!coupon || listCents <= 0) return 0;
  if (coupon.percentOff) return Math.min(listCents, Math.round((listCents * coupon.percentOff) / 100));
  if (coupon.amountOffCents) return Math.min(listCents, coupon.amountOffCents);
  return 0;
}

export function addInterval(from: Date, interval: BillingInterval, count = 1) {
  const d = new Date(from);
  if (interval === "MONTH") d.setMonth(d.getMonth() + count);
  else if (interval === "YEAR") d.setFullYear(d.getFullYear() + count);
  return d;
}

/** Finds a usable coupon for this product, or explains why not. */
export async function findCoupon(code: string | null | undefined, product: { id: string; creatorId: string }) {
  const clean = code?.trim().toUpperCase();
  if (!clean) return { coupon: null, error: null };
  const coupon = await db.coupon.findUnique({ where: { creatorId_code: { creatorId: product.creatorId, code: clean } } });
  if (!coupon || !coupon.active) return { coupon: null, error: "That code doesn't work." };
  if (coupon.productId && coupon.productId !== product.id) return { coupon: null, error: "That code is for a different product." };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { coupon: null, error: "That code has expired." };
  if (coupon.maxRedemptions != null && coupon.redemptions >= coupon.maxRedemptions) return { coupon: null, error: "That code has been used up." };
  return { coupon, error: null };
}

type PendingInput = {
  buyerId: string;
  product: { id: string; title: string; creatorId: string };
  price: { id: string; label: string; amountCents: number; interval: BillingInterval };
  couponId?: string | null;
  discountCents: number;
  feeType: FeeType;
  provider: PaymentProvider;
  refTag?: string | null;
  kind?: "PURCHASE" | "RENEWAL";
  subscriptionId?: string | null;
  /** Free trial start: nothing is charged now. */
  trial?: boolean;
  /** Set up front for renewals so the same Stripe invoice can never make two orders. */
  stripeInvoiceId?: string | null;
};

export async function createPendingOrder(input: PendingInput) {
  const listCents = input.trial ? 0 : input.price.amountCents;
  const discountCents = input.trial ? 0 : Math.min(Math.max(0, input.discountCents), listCents);
  const a = computeAmounts(listCents, discountCents, input.feeType);
  const interval = input.price.interval === "ONE_TIME" ? "" : ` (${INTERVAL_LABEL[input.price.interval]})`;
  const suffix = input.trial ? ", free trial" : input.kind === "RENEWAL" ? ", renewal" : "";
  return db.order.create({
    data: {
      kind: input.kind ?? "PURCHASE",
      buyerId: input.buyerId,
      sellerId: input.product.creatorId,
      productId: input.product.id,
      priceId: input.price.id,
      couponId: input.couponId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      description: `${input.product.title}: ${input.price.label}${interval}${suffix}`,
      listCents,
      discountCents,
      amountCents: a.amountCents,
      feeType: input.feeType,
      feeBps: a.feeBps,
      platformFeeCents: a.platformFeeCents,
      processingFeeCents: a.processingFeeCents,
      sellerNetCents: a.sellerNetCents,
      provider: input.provider,
      refTag: input.refTag ?? null,
      stripeInvoiceId: input.stripeInvoiceId ?? null,
    },
  });
}

/** True for the $0 order that starts a free trial (not a 100% off code). */
export function isTrialOrder(order: { listCents: number; kind: string }, price: { amountCents: number; interval: BillingInterval } | null | undefined) {
  return order.kind === "PURCHASE" && order.listCents === 0 && Boolean(price && price.amountCents > 0 && price.interval !== "ONE_TIME");
}

type CompleteInfo = {
  paidAt?: Date;
  stripePaymentIntentId?: string | null;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId?: string | null;
  /** End of the paid period (subscriptions). Worked out from the price when not given. */
  periodEnd?: Date | null;
  /** Free trial end (first order of a subscription with a trial). */
  trialEnd?: Date | null;
};

/**
 * Marks an order paid and does everything that follows: ledger entries, access, subscription,
 * who-brought-the-buyer, counters, receipt and sale notice. Safe to call twice.
 */
export async function completeOrder(orderId: string, info: CompleteInfo = {}) {
  const paidAt = info.paidAt ?? new Date();
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { product: true, price: true, seller: { include: { creator: true } }, buyer: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status === "PAID") return order;
  if (order.status !== "PENDING") throw new Error(`Order is ${order.status.toLowerCase()}`);

  const holdDays = holdDaysFor(order.seller?.creator?.approvedAt);
  const availableAt = new Date(paidAt.getTime() + holdDays * 86400_000);

  // Claim the order first so two webhooks can't both complete it.
  const claimed = await db.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt,
      availableAt,
      stripePaymentIntentId: info.stripePaymentIntentId ?? undefined,
      stripeInvoiceId: info.stripeInvoiceId ?? undefined,
    },
  });
  if (claimed.count === 0) return order;

  const product = order.product;
  const price = order.price;
  const sellerId = order.sellerId;

  await db.$transaction(async (tx) => {
    // Money owed to the seller, held until availableAt.
    if (sellerId && order.amountCents > 0) {
      const ref = orderNumber(order.number);
      await tx.ledgerEntry.createMany({
        data: [
          { userId: sellerId, orderId: order.id, type: "SALE", amountCents: order.amountCents, description: `Sale ${ref}`, availableAt },
          ...(order.platformFeeCents
            ? [{ userId: sellerId, orderId: order.id, type: "PLATFORM_FEE" as const, amountCents: -order.platformFeeCents, description: `TraderTrades fee ${ref}`, availableAt }]
            : []),
          ...(order.processingFeeCents
            ? [{ userId: sellerId, orderId: order.id, type: "PROCESSING_FEE" as const, amountCents: -order.processingFeeCents, description: `Card processing ${ref}`, availableAt }]
            : []),
        ],
      });
    }

    // First touch is remembered for good.
    if (sellerId) {
      const existing = await tx.buyerRelation.findUnique({ where: { buyerId_sellerId: { buyerId: order.buyerId, sellerId } } });
      if (!existing) {
        await tx.buyerRelation.create({
          data: { buyerId: order.buyerId, sellerId, source: order.feeType === "OWN_AUDIENCE" ? "OWN_AUDIENCE" : "MARKETPLACE", firstOrderId: order.id },
        });
      }
    }

    if (!product || !price) return;

    if (price.interval === "ONE_TIME") {
      const existing = await tx.entitlement.findUnique({ where: { userId_productId: { userId: order.buyerId, productId: product.id } } });
      const sessions = product.type === "MENTORING" ? (price.sessions ?? 1) : null;
      if (existing) {
        const stillActive = existing.status === "ACTIVE";
        await tx.entitlement.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            source: "PURCHASE",
            orderId: order.id,
            priceId: price.id,
            endsAt: null,
            sessionsTotal: sessions == null ? existing.sessionsTotal : (stillActive ? (existing.sessionsTotal ?? 0) : 0) + sessions,
            sessionsUsed: sessions != null && !stillActive ? 0 : undefined,
          },
        });
      } else {
        await tx.entitlement.create({
          data: { userId: order.buyerId, productId: product.id, priceId: price.id, source: "PURCHASE", orderId: order.id, sessionsTotal: sessions },
        });
      }
    } else if (order.kind === "RENEWAL" && order.subscriptionId) {
      const sub = await tx.subscription.findUnique({ where: { id: order.subscriptionId } });
      if (sub) {
        const start = sub.currentPeriodEnd > paidAt ? sub.currentPeriodEnd : paidAt;
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: info.periodEnd ?? addInterval(start, price.interval) },
        });
        await tx.entitlement.updateMany({ where: { userId: order.buyerId, productId: product.id }, data: { status: "ACTIVE", endsAt: null } });
      }
    } else {
      const trialing = Boolean(info.trialEnd) || (isTrialOrder(order, price) && price.trialDays > 0);
      const periodEnd =
        info.trialEnd ?? info.periodEnd ?? (trialing ? new Date(paidAt.getTime() + price.trialDays * 86400_000) : addInterval(paidAt, price.interval));
      // Replace any old ended subscription for the same product.
      const sub = await tx.subscription.create({
        data: {
          buyerId: order.buyerId,
          sellerId: product.creatorId,
          productId: product.id,
          priceId: price.id,
          status: trialing ? "TRIALING" : "ACTIVE",
          attribution: order.feeType === "OWN_AUDIENCE" ? "OWN_AUDIENCE" : "MARKETPLACE",
          provider: order.provider,
          stripeSubscriptionId: info.stripeSubscriptionId ?? null,
          currentPeriodStart: paidAt,
          currentPeriodEnd: periodEnd,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { subscriptionId: sub.id } });
      await tx.entitlement.upsert({
        where: { userId_productId: { userId: order.buyerId, productId: product.id } },
        create: { userId: order.buyerId, productId: product.id, priceId: price.id, source: "SUBSCRIPTION", subscriptionId: sub.id, orderId: order.id },
        update: { status: "ACTIVE", source: "SUBSCRIPTION", subscriptionId: sub.id, priceId: price.id, orderId: order.id, endsAt: null },
      });
    }

    if (order.kind === "PURCHASE") await tx.product.update({ where: { id: product.id }, data: { salesCount: { increment: 1 } } });
    if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { redemptions: { increment: 1 } } });
  });

  // Notices after the money is recorded. Failures here never undo a sale.
  try {
    const ref = orderNumber(order.number);
    const info2 = product ? productTypeInfo(product.type) : null;
    if (sellerId && product) {
      const free = order.amountCents === 0;
      await notify(sellerId, {
        type: free ? "order.claim" : order.kind === "RENEWAL" ? "order.renewal" : "order.sale",
        title: free ? `${order.buyer.displayName} joined ${product.title}` : order.kind === "RENEWAL" ? `Renewal: ${product.title}` : `New sale: ${product.title}`,
        body: free ? "Free signup." : `${money(order.amountCents, { exact: true })} paid. You get ${money(order.sellerNetCents, { exact: true })} after fees.`,
        url: "/creator/sales",
        email: free ? undefined : "orders",
      });
    }
    if (product && order.kind === "PURCHASE") {
      await sendEmail(
        order.buyer.email,
        emails.generic({
          subject: order.amountCents ? `Your receipt for ${product.title}` : `You're in: ${product.title}`,
          heading: order.amountCents ? "Thanks for your purchase" : "You're in",
          body: [
            `Hi ${order.buyer.displayName.split(" ")[0]}, ${product.title} is now in your library.`,
            order.amountCents && product.refundDays
              ? `You can ask for a refund until ${formatDate(new Date(paidAt.getTime() + product.refundDays * 86400_000))} from your purchases page.`
              : "",
          ].filter(Boolean),
          rows: [
            ["Order", ref],
            ["Product", `${product.title} (${info2?.label ?? "Product"})`],
            ["Paid", order.amountCents ? money(order.amountCents, { exact: true }) : "Free"],
            ...(order.discountCents ? ([["Discount", `-${money(order.discountCents, { exact: true })}`]] as [string, string][]) : []),
          ],
          cta: { label: "Open your library", url: absoluteUrl("/library") },
        }),
        { template: "receipt", userId: order.buyerId },
      );
    }
    if (product && order.kind === "RENEWAL" && order.amountCents > 0) {
      await sendEmail(
        order.buyer.email,
        emails.generic({
          subject: `Your ${product.title} membership renewed`,
          heading: "Membership renewed",
          body: [`Hi ${order.buyer.displayName.split(" ")[0]}, your membership to ${product.title} renewed. You can cancel any time from your purchases page.`],
          rows: [
            ["Order", ref],
            ["Paid", money(order.amountCents, { exact: true })],
          ],
          cta: { label: "Manage membership", url: absoluteUrl("/settings/billing") },
        }),
        { template: "renewal", userId: order.buyerId },
      );
    }
    await audit(order.buyerId, "order.paid", { type: "order", id: order.id }, { amount: order.amountCents, feeType: order.feeType });
  } catch (err) {
    console.error("[orders] notice failed", err);
  }
  return order;
}

/** Ends access for subscriptions whose paid time ran out, and renews test-mode ones. Run daily. */
export async function runSubscriptionUpkeep(now = new Date()) {
  const due = await db.subscription.findMany({
    where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, currentPeriodEnd: { lte: now } },
    include: { price: true, product: { include: { creator: { select: { id: true, username: true } } } } },
    take: 500,
  });
  let renewed = 0;
  let ended = 0;
  for (const sub of due) {
    // Stripe subscriptions are renewed by Stripe; we only end ones Stripe says are canceled.
    if (sub.provider === "STRIPE" && !sub.cancelAtPeriodEnd) continue;
    if (sub.cancelAtPeriodEnd) {
      await endSubscription(sub.id, now);
      ended++;
      continue;
    }
    const attr = await attributionFor(sub.buyerId, sub.product.creator, null);
    const order = await createPendingOrder({
      buyerId: sub.buyerId,
      product: { id: sub.productId, title: sub.product.title, creatorId: sub.sellerId },
      price: sub.price,
      discountCents: 0,
      feeType: attr.feeType,
      provider: "TEST",
      kind: "RENEWAL",
      subscriptionId: sub.id,
    });
    await completeOrder(order.id, { paidAt: now });
    renewed++;
  }
  return { renewed, ended };
}

export async function endSubscription(subscriptionId: string, at = new Date()) {
  const sub = await db.subscription.update({ where: { id: subscriptionId }, data: { status: "CANCELED", canceledAt: at, cancelAtPeriodEnd: false } });
  await db.entitlement.updateMany({
    where: { userId: sub.buyerId, productId: sub.productId, subscriptionId: sub.id, status: "ACTIVE" },
    data: { status: "EXPIRED", endsAt: at },
  });
  return sub;
}
