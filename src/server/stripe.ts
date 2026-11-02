import "server-only";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { absoluteUrl, env, features } from "@/lib/env";
import { CARD_FEE, FEE_BPS, HOLD_DAYS, NEW_SELLER_HOLD_DAYS } from "@/lib/fees";
import type { FeeType } from "@/generated/prisma/enums";

let client: Stripe | null = null;

export function stripe() {
  if (!features.stripe || !env.stripeSecret) throw new Error("Stripe is not set up");
  client ??= new Stripe(env.stripeSecret);
  return client;
}

/** Creates (once) and returns the creator's Stripe Express account, then a link to finish setup. */
export async function payoutOnboardingLink(user: { id: string; email: string; creator: { id: string; stripeAccountId: string | null } }) {
  const s = stripe();
  let accountId = user.creator.stripeAccountId;
  if (!accountId) {
    const account = await s.accounts.create({
      type: "express",
      email: user.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { product_description: "Trading education sold on TraderTrades" },
      // Sales wait 14 days before payout for new sellers (7 after their first 60 days), to cover refunds.
      settings: { payouts: { schedule: { interval: "daily", delay_days: NEW_SELLER_HOLD_DAYS } } },
      metadata: { userId: user.id },
    });
    accountId = account.id;
    await db.creatorProfile.update({ where: { id: user.creator.id }, data: { stripeAccountId: accountId } });
  }
  const link = await s.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: absoluteUrl("/creator/payouts?refresh=1"),
    return_url: absoluteUrl("/creator/payouts?connected=1"),
  });
  return link.url;
}

export async function payoutDashboardLink(accountId: string) {
  const link = await stripe().accounts.createLoginLink(accountId);
  return link.url;
}

export async function syncAccount(accountId: string) {
  const a = await stripe().accounts.retrieve(accountId);
  await db.creatorProfile.updateMany({
    where: { stripeAccountId: accountId },
    data: { stripeChargesEnabled: Boolean(a.charges_enabled), stripePayoutsEnabled: Boolean(a.payouts_enabled) },
  });
  return a;
}

/** After a seller's first 60 days, payouts come a week sooner. */
export async function shortenPayoutHold(accountId: string) {
  await stripe().accounts.update(accountId, { settings: { payouts: { schedule: { interval: "daily", delay_days: HOLD_DAYS } } } });
}

/** Percent fee for subscriptions (Stripe takes a percent there): our cut plus the card fee estimate. */
export function subscriptionFeePercent(feeType: FeeType, amountCents: number) {
  if (amountCents <= 0) return 0;
  const card = (CARD_FEE.bps / 100) + (CARD_FEE.fixedCents / amountCents) * 100;
  return Math.min(100, Math.round((FEE_BPS[feeType] / 100 + card) * 100) / 100);
}

type CheckoutInput = {
  orderId: string;
  buyerEmail: string;
  sellerAccountId: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  amountCents: number;
  listCents: number;
  interval: "ONE_TIME" | "MONTH" | "YEAR";
  trialDays: number;
  feeType: FeeType;
  applicationFeeCents: number;
  cancelPath: string;
  metadata: Record<string, string>;
};

export async function createCheckoutSession(input: CheckoutInput) {
  const s = stripe();
  const productData = {
    name: input.title,
    description: input.description?.slice(0, 300) || undefined,
    images: input.imageUrl && input.imageUrl.startsWith("https://") ? [input.imageUrl] : undefined,
  };
  const common = {
    customer_email: input.buyerEmail,
    client_reference_id: input.orderId,
    metadata: { ...input.metadata, orderId: input.orderId },
    success_url: absoluteUrl(`/checkout/success?order=${input.orderId}`),
    cancel_url: absoluteUrl(input.cancelPath),
  };
  if (input.interval === "ONE_TIME") {
    return s.checkout.sessions.create({
      ...common,
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: productData } }],
      payment_intent_data: {
        application_fee_amount: input.applicationFeeCents,
        transfer_data: { destination: input.sellerAccountId },
        metadata: { orderId: input.orderId },
      },
    });
  }
  // Subscriptions: a one-off coupon covers any first-payment discount.
  let discounts: { coupon: string }[] | undefined;
  if (input.listCents > input.amountCents && !input.trialDays) {
    const coupon = await s.coupons.create({ amount_off: input.listCents - input.amountCents, currency: "usd", duration: "once", max_redemptions: 1 });
    discounts = [{ coupon: coupon.id }];
  }
  return s.checkout.sessions.create({
    ...common,
    mode: "subscription",
    discounts,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.listCents,
          recurring: { interval: input.interval === "YEAR" ? "year" : "month" },
          product_data: productData,
        },
      },
    ],
    subscription_data: {
      application_fee_percent: subscriptionFeePercent(input.feeType, input.listCents),
      transfer_data: { destination: input.sellerAccountId },
      trial_period_days: input.trialDays > 0 ? input.trialDays : undefined,
      metadata: { ...input.metadata, orderId: input.orderId },
    },
  });
}

export async function setSubscriptionFee(stripeSubscriptionId: string, feeType: FeeType, amountCents: number) {
  await stripe().subscriptions.update(stripeSubscriptionId, { application_fee_percent: subscriptionFeePercent(feeType, amountCents) });
}

export async function cancelStripeSubscription(stripeSubscriptionId: string, atPeriodEnd: boolean) {
  await stripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: atPeriodEnd });
}

/** The PaymentIntent behind an order, for refunds. Renewals look it up through the invoice. */
export async function paymentIntentFor(order: { stripePaymentIntentId: string | null; stripeInvoiceId: string | null }) {
  if (order.stripePaymentIntentId) return order.stripePaymentIntentId;
  if (!order.stripeInvoiceId) return null;
  const payments = await stripe().invoicePayments.list({ invoice: order.stripeInvoiceId, limit: 1 });
  const pi = payments.data[0]?.payment?.payment_intent;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

/**
 * Refunds a card payment. The buyer gets `amountCents` back. The money comes back out of the seller's
 * Stripe balance (transfer reversed), and our platform fee for that part goes back to the seller.
 * Card processing isn't returned by Stripe, so it isn't returned here either.
 */
export async function refundPayment(input: { paymentIntentId: string; amountCents: number; platformFeeRefundCents: number; orderId: string }) {
  const s = stripe();
  const refund = await s.refunds.create({
    payment_intent: input.paymentIntentId,
    amount: input.amountCents,
    reverse_transfer: true,
    refund_application_fee: false,
    metadata: { orderId: input.orderId, source: "tradertrades" },
  });
  if (input.platformFeeRefundCents > 0) {
    const intent = await s.paymentIntents.retrieve(input.paymentIntentId, { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const fee = charge?.application_fee;
    const feeId = typeof fee === "string" ? fee : (fee?.id ?? null);
    if (feeId) await s.applicationFees.createRefund(feeId, { amount: input.platformFeeRefundCents, metadata: { orderId: input.orderId } });
  }
  return refund;
}

/** Looks up a Checkout Session, for the success page when the webhook hasn't arrived yet. */
export async function retrieveCheckout(sessionId: string) {
  return stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
}

/**
 * Business payments (Sponsored spots, money paid into a campaign deal) are charged to TraderTrades itself.
 * Deal money is moved to the creator later, when the company approves the work.
 */
export async function createPlatformCheckoutSession(input: { orderId: string; buyerEmail: string; title: string; description?: string | null; amountCents: number; successPath: string; cancelPath: string; metadata: Record<string, string> }) {
  return stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: input.buyerEmail,
    client_reference_id: input.orderId,
    metadata: { ...input.metadata, orderId: input.orderId },
    success_url: absoluteUrl(input.successPath),
    cancel_url: absoluteUrl(input.cancelPath),
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: input.title, description: input.description?.slice(0, 300) || undefined } } }],
    payment_intent_data: { metadata: { orderId: input.orderId }, transfer_group: input.orderId },
  });
}

/** Refunds a payment that was charged to TraderTrades (no creator transfer to undo). */
export async function refundPlatformPayment(input: { paymentIntentId: string; amountCents: number; orderId: string }) {
  return stripe().refunds.create({ payment_intent: input.paymentIntentId, amount: input.amountCents, metadata: { orderId: input.orderId, source: "tradertrades" } });
}

/** Sends a creator their share of an approved deal, tied to the original charge so it can go before the charge settles. */
export async function transferToCreator(input: { paymentIntentId: string; amountCents: number; destination: string; orderId: string }) {
  const s = stripe();
  const intent = await s.paymentIntents.retrieve(input.paymentIntentId);
  const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : (intent.latest_charge?.id ?? undefined);
  return s.transfers.create(
    { amount: input.amountCents, currency: "usd", destination: input.destination, transfer_group: input.orderId, source_transaction: charge, metadata: { orderId: input.orderId } },
    { idempotencyKey: `deal-transfer-${input.orderId}` },
  );
}
