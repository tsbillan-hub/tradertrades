"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { absoluteUrl, env } from "@/lib/env";
import { emailRule, fail, success, type ActionState } from "@/lib/forms";
import { REF_COOKIE, hasRef } from "@/lib/ref";
import { getViewer, requireUser } from "@/server/dal";
import { rateLimit } from "@/server/rate-limit";
import { requestMeta } from "@/server/auth/session";
import { paymentPath, quoteCheckout, sellerCanTakeCards } from "@/server/commerce/checkout";
import { completeOrder, createPendingOrder } from "@/server/commerce/orders";
import { createCheckoutSession } from "@/server/stripe";
import { audit } from "@/server/audit";

/** The "Pay" button on the checkout page. */
export async function payNow(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const productId = String(formData.get("productId") ?? "");
  const priceId = String(formData.get("priceId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  const rl = await rateLimit(`checkout:${user.id}`, 20, 600);
  if (!rl.ok) return fail("Too many tries. Wait a few minutes and try again.");

  const res = await quoteCheckout(user, productId, priceId, code);
  if (!res.ok) return fail(res.error);
  const q = res.quote;
  if (q.couponError) return fail(q.couponError, formData, { code: [q.couponError] });

  const path = paymentPath(q);
  if (path === "off") return fail("Card payments aren't switched on yet. Please try again soon.");
  const seller = q.product.creator;
  if (path === "stripe" && !sellerCanTakeCards(seller.creator)) {
    return fail("This creator hasn't finished setting up payouts, so they can't take card payments yet. Try again later.");
  }

  const refRaw = (await cookies()).get(REF_COOKIE)?.value;
  const refTag = hasRef(refRaw, seller.username) ? seller.username : null;

  const order = await createPendingOrder({
    buyerId: user.id,
    product: { id: q.product.id, title: q.product.title, creatorId: q.product.creatorId },
    price: q.price,
    couponId: q.coupon?.id ?? null,
    discountCents: q.discountCents,
    feeType: q.attribution.feeType,
    provider: path === "stripe" ? "STRIPE" : "TEST",
    refTag,
    trial: q.trial,
  });

  if (path === "free") {
    await completeOrder(order.id);
    redirect(`/checkout/success?order=${order.id}`);
  }
  if (path === "test") redirect(`/checkout/test/${order.id}`);

  let url: string | null = null;
  try {
    const cover = q.product.coverUrl ? (q.product.coverUrl.startsWith("/") ? absoluteUrl(q.product.coverUrl) : q.product.coverUrl) : null;
    const session = await createCheckoutSession({
      orderId: order.id,
      buyerEmail: user.email,
      sellerAccountId: seller.creator!.stripeAccountId!,
      title: q.product.title,
      description: q.product.subtitle,
      imageUrl: cover,
      amountCents: order.amountCents,
      listCents: q.price.amountCents,
      interval: q.price.interval,
      trialDays: q.trial ? q.price.trialDays : 0,
      feeType: order.feeType,
      applicationFeeCents: order.platformFeeCents + order.processingFeeCents,
      cancelPath: `/checkout?p=${q.product.id}&price=${q.price.id}`,
      metadata: { productId: q.product.id, priceId: q.price.id, buyerId: user.id },
    });
    await db.order.update({ where: { id: order.id }, data: { stripeCheckoutId: session.id } });
    url = session.url;
  } catch (err) {
    console.error("[checkout] couldn't start Stripe checkout", err);
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  }
  if (!url) return fail("We couldn't start the payment. Please try again in a minute.");
  redirect(url);
}

/** Preview mode only: the fake card form "pays" the order. */
export async function payTestOrder(formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== user.id || order.provider !== "TEST" || !env.demoMode) redirect("/library");
  if (order.status === "PENDING") {
    await completeOrder(order.id);
    await audit(user.id, "order.test_payment", { type: "order", id: order.id });
  }
  redirect(`/checkout/success?order=${order.id}`);
}

export async function cancelPendingOrder(formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const back = String(formData.get("back") ?? "/marketplace");
  const canceled = await db.order.updateMany({ where: { id: orderId, buyerId: user.id, status: "PENDING" }, data: { status: "CANCELED" } });
  if (canceled.count) {
    // An unpaid Sponsored spot holds its place for a while; let it go straight away so others can book it.
    const order = await db.order.findUnique({ where: { id: orderId }, select: { featuredSlotId: true } });
    if (order?.featuredSlotId) await db.featuredSlot.updateMany({ where: { id: order.featuredSlotId, status: "PENDING_PAYMENT" }, data: { status: "CANCELED" } });
  }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/marketplace");
}

const waitlistSchema = z.object({ productId: z.string().min(1), email: emailRule.optional() });

export async function joinWaitlist(_: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  const parsed = waitlistSchema.safeParse({
    productId: formData.get("productId"),
    email: viewer ? undefined : String(formData.get("email") ?? ""),
  });
  if (!parsed.success) return fail("Enter a valid email.", formData, { email: ["Enter a valid email"] });
  const email = viewer?.email ?? parsed.data.email;
  if (!email) return fail("Enter a valid email.", formData, { email: ["Enter a valid email"] });

  const { ip } = await requestMeta();
  const rl = await rateLimit(`waitlist:${viewer?.id ?? ip ?? "anon"}`, 10, 3600);
  if (!rl.ok) return fail("Too many tries. Try again later.");

  const product = await db.product.findUnique({ where: { id: parsed.data.productId }, select: { id: true, status: true, creatorId: true, title: true } });
  if (!product || product.status !== "PUBLISHED") return fail("This product isn't available.");
  if (viewer?.id === product.creatorId) return fail("This is your own product.");

  await db.waitlistEntry.upsert({
    where: { productId_email: { productId: product.id, email } },
    create: { productId: product.id, email, userId: viewer?.id ?? null },
    update: {},
  });
  return success("You're on the list. We'll email you the moment it opens.");
}
