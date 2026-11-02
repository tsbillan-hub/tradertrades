import type Stripe from "stripe";
import { env, features } from "@/lib/env";
import { stripe } from "@/server/stripe";
import {
  completeFromCheckoutSession,
  markDisputed,
  markPaymentFailed,
  recordOutsideRefund,
  recordStripeRenewal,
  syncConnectedAccount,
  syncStripeSubscription,
} from "@/server/commerce/stripe-sync";
import { recordStripePayout } from "@/server/commerce/payouts";

export const runtime = "nodejs";

/** One endpoint for both "your account" events and connected account events (two signing secrets). */
function verify(body: string, signature: string): Stripe.Event | null {
  const secrets = [env.stripeWebhookSecret, process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      return stripe().webhooks.constructEvent(body, signature, secret);
    } catch {
      /* try the next secret */
    }
  }
  return null;
}

export async function POST(request: Request) {
  if (!features.stripe || !env.stripeWebhookSecret) return new Response("Stripe isn't set up", { status: 404 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const body = await request.text();
  const event = verify(body, signature);
  if (!event) return new Response("Bad signature", { status: 400 });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await completeFromCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await recordStripeRenewal(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await markPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      case "refund.created":
        await recordOutsideRefund(event.data.object as Stripe.Refund);
        break;
      case "charge.dispute.created":
        await markDisputed(event.data.object as Stripe.Dispute);
        break;
      case "account.updated":
        await syncConnectedAccount(event.data.object as Stripe.Account);
        break;
      // Payouts from a creator's own Stripe balance to their bank (connected account events).
      case "payout.created":
      case "payout.updated":
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled":
        if (event.account) await recordStripePayout(event.account, event.data.object as Stripe.Payout);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe] ${event.type} failed`, err);
    return new Response("Handler failed", { status: 500 });
  }
  return Response.json({ received: true });
}
