"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { requireUser, requireVerifiedUser } from "@/server/dal";
import { checkText } from "@/server/moderation";
import { notify } from "@/server/notify";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { productPath } from "@/lib/paths";
import { refreshRating } from "@/server/commerce/ratings";

const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number({ error: "Pick a star rating" }).int().min(1, "Pick a star rating").max(5),
  title: optionalText(80),
  body: z.string().trim().min(20, "Write at least 20 characters so it helps other traders").max(2000, "2,000 characters at most"),
});

/** Only people who bought (or joined) can review, and never the seller. */
async function canReview(userId: string, productId: string) {
  const ent = await db.entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
  if (ent && (ent.source === "PURCHASE" || ent.source === "SUBSCRIPTION")) return true;
  const paid = await db.order.count({ where: { buyerId: userId, productId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } });
  return paid > 0;
}

export async function submitProductReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = reviewSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { productId, rating, title, body } = parsed.data;

  const product = await db.product.findUnique({ where: { id: productId }, include: { creator: { select: { id: true, username: true } } } });
  if (!product) return fail("Product not found.");
  if (product.creatorId === user.id) return fail("You can't review your own product.");
  if (!(await canReview(user.id, product.id))) return fail("Only people who bought this can review it.");

  const rl = await rateLimit(`review:${user.id}`, 10, 3600);
  if (!rl.ok) return fail("Too many reviews in a short time. Try again later.");

  const order = await db.order.findFirst({ where: { buyerId: user.id, productId, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }, orderBy: { paidAt: "asc" } });
  const existing = await db.productReview.findUnique({ where: { productId_userId: { productId, userId: user.id } } });
  const review = await db.productReview.upsert({
    where: { productId_userId: { productId, userId: user.id } },
    create: { productId, userId: user.id, sellerId: product.creatorId, orderId: order?.id ?? null, rating, title: title ?? null, body },
    update: { rating, title: title ?? null, body, status: existing?.status === "REMOVED" ? "REMOVED" : "PUBLISHED" },
  });
  await checkText(`${title ?? ""}\n${body}`, { type: "PRODUCT_REVIEW", id: review.id }, { block: false });
  await refreshRating(productId);

  if (!existing) {
    await notify(product.creatorId, {
      type: "review.new",
      title: `New ${rating} star review on ${product.title}`,
      body: body.length > 160 ? `${body.slice(0, 157)}...` : body,
      url: `${productPath(product.creator.username, product.slug)}#reviews`,
      email: "reviews",
      ctaLabel: "Read and reply",
    });
  }
  await audit(user.id, existing ? "review.update" : "review.create", { type: "product_review", id: review.id }, { rating });
  refresh();
  return success(existing ? "Review updated." : "Thanks, your review is up.");
}

export async function deleteMyReview(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("reviewId") ?? "");
  const review = await db.productReview.findUnique({ where: { id } });
  if (!review || review.userId !== user.id) return;
  await db.productReview.delete({ where: { id } });
  await refreshRating(review.productId);
  refresh();
}

const replySchema = z.object({
  reviewId: z.string().min(1),
  reply: z.string().trim().max(1000, "1,000 characters at most"),
});

/** The seller's public reply under a review. Empty text removes the reply. */
export async function replyToReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = replySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const review = await db.productReview.findUnique({ where: { id: parsed.data.reviewId }, include: { product: true } });
  if (!review || review.sellerId !== user.id) return fail("Review not found.");
  const reply = parsed.data.reply || null;
  if (reply) {
    const check = await checkText(reply, { type: "PRODUCT_REVIEW", id: review.id });
    if (check.blocked) return fail(check.message, formData);
  }
  await db.productReview.update({ where: { id: review.id }, data: { reply, repliedAt: reply ? new Date() : null } });
  if (reply) {
    await notify(review.userId, {
      type: "review.reply",
      title: `The creator replied to your review of ${review.product.title}`,
      body: reply.length > 160 ? `${reply.slice(0, 157)}...` : reply,
      url: "/library",
    });
  }
  refresh();
  return success(reply ? "Reply posted." : "Reply removed.");
}
