import "server-only";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { money } from "@/lib/utils";
import { attributionFor, type Attribution } from "@/server/commerce/attribution";
import { MIN_CHARGE_CENTS, computeAmounts, couponDiscount, findCoupon } from "@/server/commerce/orders";

export const checkoutProductInclude = {
  creator: { include: { creator: true } },
  prices: { where: { active: true }, orderBy: [{ position: "asc" as const }, { amountCents: "asc" as const }] },
};

export async function loadCheckoutProduct(productId: string) {
  return db.product.findUnique({ where: { id: productId }, include: checkoutProductInclude });
}

type CheckoutProduct = NonNullable<Awaited<ReturnType<typeof loadCheckoutProduct>>>;

export type Quote = {
  product: CheckoutProduct;
  price: CheckoutProduct["prices"][number];
  coupon: Awaited<ReturnType<typeof findCoupon>>["coupon"];
  couponError: string | null;
  trial: boolean;
  attribution: Attribution;
  listCents: number;
  discountCents: number;
  amountCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  /** Mentoring: buying more calls on top of ones you have. */
  topUp: boolean;
};

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: string; product?: CheckoutProduct; ownsIt?: boolean };

export function isPublicProduct(p: { status: string; creator: { status: string; creator: { status: string } | null } }) {
  return p.status === "PUBLISHED" && p.creator.status === "ACTIVE" && p.creator.creator?.status === "APPROVED";
}

/** Everything checkout needs to know, worked out the same way for the page and for the payment. */
export async function quoteCheckout(
  buyer: { id: string; status: string },
  productId: string,
  priceId?: string | null,
  code?: string | null,
): Promise<QuoteResult> {
  const product = await loadCheckoutProduct(productId);
  if (!product || !isPublicProduct(product)) return { ok: false, error: "This product isn't available right now." };
  if (buyer.status !== "ACTIVE") return { ok: false, error: "Your account can't make purchases right now. Contact support.", product };
  if (product.creatorId === buyer.id) return { ok: false, error: "This is your own product. You already have full access.", product };
  if (product.launchState === "WAITLIST") return { ok: false, error: "This isn't open yet. Join the waitlist to hear the moment it opens.", product };

  const blocked = await db.block.findFirst({ where: { blockerId: product.creatorId, blockedId: buyer.id } });
  if (blocked) return { ok: false, error: "You can't buy from this seller.", product };

  const price = product.prices.find((p) => p.id === priceId) ?? product.prices[0];
  if (!price) return { ok: false, error: "This product isn't on sale right now.", product };

  const owned = await db.entitlement.findUnique({ where: { userId_productId: { userId: buyer.id, productId: product.id } } });
  const ownsIt = owned?.status === "ACTIVE";
  if (ownsIt && product.type !== "MENTORING") {
    return { ok: false, error: price.interval === "ONE_TIME" ? "You already have this. Open it from your library." : "You're already a member.", product, ownsIt: true };
  }
  if (!ownsIt && product.memberLimit) {
    const members = await db.entitlement.count({ where: { productId: product.id, status: "ACTIVE" } });
    if (members >= product.memberLimit) return { ok: false, error: "This is full right now. Check back later.", product };
  }

  // Free trial: only for memberships, and only the first time.
  let trial = false;
  if (price.interval !== "ONE_TIME" && price.trialDays > 0 && price.amountCents > 0) {
    const before = await db.subscription.count({ where: { buyerId: buyer.id, productId: product.id } });
    trial = before === 0;
  }

  let coupon: Quote["coupon"] = null;
  let couponError: string | null = null;
  if (code?.trim()) {
    if (trial) couponError = "This plan starts with a free trial, so codes don't apply.";
    else {
      const found = await findCoupon(code, product);
      coupon = found.coupon;
      couponError = found.error;
    }
  }

  const attribution = await attributionFor(buyer.id, { id: product.creatorId, username: product.creator.username });
  const listCents = trial ? 0 : price.amountCents;
  const discountCents = trial ? 0 : couponDiscount(coupon, price.amountCents);
  const a = computeAmounts(listCents, discountCents, attribution.feeType);
  if (a.amountCents > 0 && a.amountCents < MIN_CHARGE_CENTS) {
    return { ok: false, error: `Card payments need to be at least ${money(MIN_CHARGE_CENTS, { exact: true })}. Try without the code.`, product };
  }

  return {
    ok: true,
    quote: {
      product,
      price,
      coupon,
      couponError,
      trial,
      attribution,
      listCents,
      discountCents,
      amountCents: a.amountCents,
      platformFeeCents: a.platformFeeCents,
      processingFeeCents: a.processingFeeCents,
      topUp: ownsIt && product.type === "MENTORING",
    },
  };
}

/** How this order gets paid. */
export function paymentPath(q: Quote): "free" | "stripe" | "test" | "off" {
  const needsCardLater = q.price.interval !== "ONE_TIME";
  if (q.amountCents === 0 && !(needsCardLater && features.stripe)) return "free";
  if (features.stripe) return "stripe";
  return env.demoMode ? "test" : "off";
}

export function sellerCanTakeCards(creator: { stripeAccountId: string | null; stripeChargesEnabled: boolean } | null | undefined) {
  return Boolean(creator?.stripeAccountId && creator.stripeChargesEnabled);
}
