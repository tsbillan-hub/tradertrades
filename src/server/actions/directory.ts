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
import { removeMedia } from "@/server/storage";
import { refreshCompanyRating } from "@/server/queries/directory";
import { CATEGORIES, REVIEW_USED_FOR } from "@/lib/constants";
import { notifyAdmins } from "@/server/admin";
import { flash } from "@/server/flash";

const reviewSchema = z.object({
  companyId: z.string().min(1),
  rating: z.coerce.number({ error: "Pick a star rating" }).int().min(1, "Pick a star rating").max(5),
  title: z.string().trim().min(3, "Give it a short title").max(80, "80 characters at most"),
  body: z.string().trim().min(30, "Write at least 30 characters so it helps other traders").max(3000, "3,000 characters at most"),
  pros: optionalText(500),
  cons: optionalText(500),
  usedFor: z.enum(REVIEW_USED_FOR).optional().or(z.literal("").transform(() => undefined)),
  proofMediaId: z.string().max(40).optional(),
});

/** Write or update your review of a company. One per person per company. */
export async function saveCompanyReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (user.status !== "ACTIVE") return fail("Your account can't post reviews right now.");
  const parsed = reviewSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const company = await db.company.findUnique({ where: { id: d.companyId }, include: { members: { select: { userId: true } } } });
  if (!company || company.status !== "PUBLISHED") return fail("Company not found.");
  if (company.members.some((m) => m.userId === user.id)) return fail("You can't review a company you work for.");

  const existing = await db.companyReview.findUnique({ where: { companyId_userId: { companyId: company.id, userId: user.id } } });
  if (!existing) {
    const rl = await rateLimit(`company-review:${user.id}`, 6, 3600);
    if (!rl.ok) return fail("That's a lot of reviews in a short time. Try again later.", formData);
  }

  let proofMediaId = existing?.proofMediaId ?? null;
  let proofStatus = existing?.proofStatus ?? "NONE";
  if (d.proofMediaId && d.proofMediaId !== existing?.proofMediaId) {
    const media = await db.media.findFirst({ where: { id: d.proofMediaId, ownerId: user.id, purpose: "proof" } });
    if (!media) return fail("The proof didn't upload properly. Try again.", formData);
    if (existing?.proofMediaId) await removeMedia(existing.proofMediaId);
    proofMediaId = media.id;
    proofStatus = "PENDING";
  }

  const data = {
    rating: d.rating,
    title: d.title,
    body: d.body,
    pros: d.pros ?? null,
    cons: d.cons ?? null,
    usedFor: d.usedFor ?? null,
    proofMediaId,
    proofStatus,
  };
  const review = existing
    ? await db.companyReview.update({ where: { id: existing.id }, data: { ...data, status: existing.status === "REMOVED" ? "REMOVED" : "PUBLISHED" } })
    : await db.companyReview.create({ data: { ...data, companyId: company.id, userId: user.id } });

  // Reviews stay up; anything that looks like a problem goes to the team.
  await checkText(`${d.title}\n${d.body}\n${d.pros ?? ""}\n${d.cons ?? ""}`, { type: "COMPANY_REVIEW", id: review.id }, { block: false });
  await refreshCompanyRating(company.id);

  if (!existing && company.members.length) {
    for (const m of company.members) {
      await notify(m.userId, {
        type: "review.company",
        title: `New ${d.rating} star review of ${company.name}`,
        body: d.title,
        url: `/directory/c/${company.slug}#r-${review.id}`,
        email: "business",
        ctaLabel: "Read and reply",
      });
    }
  }
  if (proofStatus === "PENDING" && proofMediaId !== existing?.proofMediaId) {
    await notifyAdmins({ type: "admin.proof", title: `Proof to check: review of ${company.name}`, url: "/admin/proof" });
  }
  await audit(user.id, existing ? "company_review.update" : "company_review.create", { type: "company_review", id: review.id }, { rating: d.rating });
  refresh();
  return success(existing ? "Review updated." : "Thanks, your review is up.");
}

export async function deleteCompanyReview(formData: FormData) {
  const user = await requireUser();
  const review = await db.companyReview.findUnique({ where: { id: String(formData.get("reviewId") ?? "") } });
  if (!review || review.userId !== user.id) return;
  // A review our team removed stays on record, so it can't be deleted and posted again.
  if (review.status === "REMOVED") {
    await flash("Our team removed this review, so it can't be changed. Contact support if you think that's a mistake.", "error");
    return;
  }
  await db.companyReview.delete({ where: { id: review.id } });
  if (review.proofMediaId) await removeMedia(review.proofMediaId);
  await refreshCompanyRating(review.companyId);
  refresh();
}

/** "Helpful" on someone else's review. Pressing again takes it back. */
export async function toggleHelpful(formData: FormData) {
  const user = await requireUser();
  const review = await db.companyReview.findUnique({ where: { id: String(formData.get("reviewId") ?? "") }, select: { id: true, userId: true } });
  if (!review || review.userId === user.id) return;
  const rl = await rateLimit(`helpful:${user.id}`, 60, 600);
  if (!rl.ok) return;
  const existing = await db.reviewVote.findUnique({ where: { reviewId_userId: { reviewId: review.id, userId: user.id } } });
  if (existing) {
    await db.$transaction([
      db.reviewVote.delete({ where: { id: existing.id } }),
      db.companyReview.update({ where: { id: review.id }, data: { helpfulCount: { decrement: 1 } } }),
    ]);
  } else {
    await db.$transaction([
      db.reviewVote.create({ data: { reviewId: review.id, userId: user.id } }),
      db.companyReview.update({ where: { id: review.id }, data: { helpfulCount: { increment: 1 } } }),
    ]);
  }
  refresh();
}

/** The company's public reply to a review. Only people on the company's team can reply. */
export async function replyToCompanyReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = z
    .object({ reviewId: z.string().min(1), reply: z.string().trim().max(2000, "2,000 characters at most") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const review = await db.companyReview.findUnique({
    where: { id: parsed.data.reviewId },
    include: { company: { select: { id: true, name: true, slug: true, members: { select: { userId: true } } } } },
  });
  if (!review) return fail("Review not found.");
  if (!review.company.members.some((m) => m.userId === user.id)) return fail("Only the company's team can reply.");
  if (parsed.data.reply) {
    const check = await checkText(parsed.data.reply, null, { block: true });
    if (check.blocked) return fail(check.message, formData);
  }
  const reply = parsed.data.reply || null;
  await db.companyReview.update({ where: { id: review.id }, data: { reply, repliedAt: reply ? new Date() : null, repliedById: reply ? user.id : null } });
  if (reply && !review.reply) {
    await notify(review.userId, {
      type: "review.reply",
      title: `${review.company.name} replied to your review`,
      body: reply.slice(0, 160),
      url: `/directory/c/${review.company.slug}#r-${review.id}`,
      email: "reviews",
    });
  }
  refresh();
  return success(reply ? "Reply posted." : "Reply removed.");
}

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [string, ...string[]];

/** "Can't find a company? Add it." Goes to our team to check before it's listed. */
export async function suggestCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Enter the company's name").max(80),
      website: z
        .string()
        .trim()
        .max(300)
        .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
        .pipe(z.url({ protocol: /^https?$/, error: "Enter the company's website" })),
      category: z.enum(CATEGORY_VALUES, { error: "Pick a category" }),
      note: optionalText(1000),
      worksThere: z.literal("on").optional(),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const rl = await rateLimit(`suggest:${user.id}`, 10, 86400);
  if (!rl.ok) return fail("You've sent a lot of suggestions today. Thanks! Try again tomorrow.", formData);

  const host = new URL(d.website).hostname.replace(/^www\./, "");
  const already = await db.company.findFirst({
    where: { OR: [{ name: { equals: d.name, mode: "insensitive" } }, { website: { contains: host, mode: "insensitive" } }] },
    select: { slug: true, name: true },
  });
  if (already) return fail(`${already.name} is already listed. You can find it at /directory/c/${already.slug}.`, formData);

  await db.companySuggestion.create({
    data: {
      userId: user.id,
      name: d.name,
      website: d.website,
      category: d.category as (typeof CATEGORIES)[number]["value"],
      note: d.note ?? null,
      worksThere: d.worksThere === "on",
    },
  });
  await notifyAdmins({ type: "admin.suggestion", title: `Directory suggestion: ${d.name}`, url: "/admin/suggestions" });
  refresh();
  return success(
    d.worksThere === "on"
      ? "Thanks. We'll check it and add it within a few days, then you can claim the listing for free."
      : "Thanks. We'll check it and add it within a few days.",
  );
}
