"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { CATEGORIES, REPORT_REASONS } from "@/lib/constants";
import { fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { money, orderNumber, slugify } from "@/lib/utils";
import { requireAdmin } from "@/server/dal";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { TAKEDOWN_LABEL, takeDown } from "@/server/admin";
import { processRefund } from "@/server/commerce/refunds";
import { approveClaim, approveDeal, cancelFeaturedSlot, refundDeal, refundFeaturedOrder, rejectClaim } from "@/server/business";
import { removeMedia } from "@/server/storage";
import { flash } from "@/server/flash";

const id = z.string().min(1).max(60);
const note = (max = 1000) => optionalText(max);

/** Queue items vanish once handled, so the confirmation rides on a one-time toast instead of the form. */
async function done(message: string) {
  await flash(message);
  refresh();
  return success(message);
}

// ───────────────────────────── Reports and flags ─────────────────────────────

/** Close a report: dismiss it, or take the reported thing down. Every open report on the same thing closes with it. */
export async function resolveReport(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ reportId: id, outcome: z.enum(["dismiss", "takedown"]), note: note() }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { reportId, outcome } = parsed.data;
  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!report || report.status !== "OPEN") return fail("Someone already handled this report.");
  const reasonLabel = REPORT_REASONS.find((r) => r.value === report.reason)?.label ?? "It broke the marketplace rules";
  const why = parsed.data.note ?? `${reasonLabel}. This breaks the marketplace rules.`;
  let changed = false;
  if (outcome === "takedown") changed = await takeDown(report.targetType, report.targetId, why);
  const now = new Date();
  const status = outcome === "takedown" ? "ACTIONED" : "DISMISSED";
  const open = await db.report.findMany({ where: { targetType: report.targetType, targetId: report.targetId, status: "OPEN" }, select: { id: true, reporterId: true } });
  await db.report.updateMany({
    where: { id: { in: open.map((r) => r.id) } },
    data: { status, resolvedById: admin.id, resolvedAt: now, resolution: parsed.data.note ?? null },
  });
  if (outcome === "takedown") {
    await db.moderationFlag.updateMany({
      where: { targetType: report.targetType, targetId: report.targetId, status: "OPEN" },
      data: { status: "ACTIONED", resolvedById: admin.id, resolvedAt: now },
    });
    for (const reporterId of new Set(open.map((r) => r.reporterId))) {
      await notify(reporterId, { type: "report.actioned", title: "Thanks for your report. We took action.", body: "We don't share the details, but what you reported broke our rules." });
    }
  }
  await audit(admin.id, `report.${outcome}`, { type: report.targetType.toLowerCase(), id: report.targetId }, { reports: open.length, changed });
  if (outcome === "dismiss") return done(open.length > 1 ? `Dismissed ${open.length} reports.` : "Report dismissed.");
  return done(changed ? `Done: ${TAKEDOWN_LABEL[report.targetType].toLowerCase()}.` : "Closed. It was already down.");
}

/** Clear an automatic flag (it's fine) or take the flagged thing down. */
export async function resolveFlag(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ flagId: id, outcome: z.enum(["clear", "takedown"]), note: note() }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const flag = await db.moderationFlag.findUnique({ where: { id: parsed.data.flagId } });
  if (!flag || flag.status !== "OPEN") return fail("Someone already handled this.");
  const now = new Date();
  if (parsed.data.outcome === "clear") {
    await db.moderationFlag.updateMany({
      where: { targetType: flag.targetType, targetId: flag.targetId, status: "OPEN" },
      data: { status: "CLEARED", resolvedById: admin.id, resolvedAt: now },
    });
    await audit(admin.id, "flag.clear", { type: flag.targetType.toLowerCase(), id: flag.targetId });
    return done("Cleared. It stays up.");
  }
  const why = parsed.data.note ?? `It broke the marketplace rules (${flag.rule.replace(/_/g, " ")}).`;
  const changed = await takeDown(flag.targetType, flag.targetId, why);
  await db.moderationFlag.updateMany({
    where: { targetType: flag.targetType, targetId: flag.targetId, status: "OPEN" },
    data: { status: "ACTIONED", resolvedById: admin.id, resolvedAt: now },
  });
  await db.report.updateMany({
    where: { targetType: flag.targetType, targetId: flag.targetId, status: "OPEN" },
    data: { status: "ACTIONED", resolvedById: admin.id, resolvedAt: now, resolution: why },
  });
  await audit(admin.id, "flag.takedown", { type: flag.targetType.toLowerCase(), id: flag.targetId }, { changed });
  return done(changed ? `Done: ${TAKEDOWN_LABEL[flag.targetType].toLowerCase()}.` : "Closed. It was already down.");
}

// ───────────────────────────── Verification ─────────────────────────────

/** Approve or turn down an ID or socials check. ID photos are deleted either way, as promised to the person. */
export async function decideVerification(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ requestId: id, decision: z.enum(["approve", "reject"]), note: note(500) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { decision } = parsed.data;
  const req = await db.verificationRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!req || req.status !== "PENDING") return fail("Someone already handled this check.");
  if (decision === "reject" && !parsed.data.note) return fail("Say what went wrong, so they can fix it and try again.", formData, { note: ["Add a short reason"] });
  const now = new Date();
  await db.verificationRequest.update({
    where: { id: req.id },
    data: { status: decision === "approve" ? "APPROVED" : "REJECTED", reviewNote: parsed.data.note ?? null, reviewedById: admin.id, reviewedAt: now, mediaIds: [] },
  });
  for (const m of req.mediaIds) await removeMedia(m);

  const what = req.kind === "IDENTITY" ? "ID" : req.kind === "SOCIALS" ? "social accounts" : req.kind.toLowerCase();
  if (decision === "approve") {
    if (req.kind === "IDENTITY") await db.user.update({ where: { id: req.userId }, data: { idVerifiedAt: now } });
    if (req.kind === "SOCIALS") {
      await db.$transaction([
        db.user.update({ where: { id: req.userId }, data: { socialsVerifiedAt: now } }),
        db.socialLink.updateMany({ where: { userId: req.userId }, data: { verifiedAt: now } }),
      ]);
    }
    await notify(req.userId, {
      type: "verification.approved",
      title: req.kind === "IDENTITY" ? "Your ID is verified" : "Your social accounts are verified",
      body: req.kind === "IDENTITY" ? "Your profile now shows the ID verified badge. Your ID photo has been deleted." : "Your profile now shows the socials verified badge. You can take the code out of your bios.",
      url: "/settings/verification",
      email: "orders",
    });
  } else {
    await notify(req.userId, {
      type: "verification.rejected",
      title: `Your ${what} check didn't go through`,
      body: `${parsed.data.note}${req.kind === "IDENTITY" ? " Your ID photo has been deleted. You can send a new one any time." : " You can try again any time."}`,
      url: "/settings/verification",
      email: "orders",
    });
  }
  await audit(admin.id, `verification.${decision}`, { type: "verification", id: req.id }, { kind: req.kind, userId: req.userId });
  return done(decision === "approve" ? `Approved. ${what === "ID" ? "The ID photo is deleted." : ""}`.trim() : "Turned down. They've been told why.");
}

/** Take a badge away (for example if an account changed hands). */
export async function revokeBadge(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const badge = String(formData.get("badge") ?? "");
  if (badge !== "id" && badge !== "socials") return;
  if (badge === "id") await db.user.update({ where: { id: userId }, data: { idVerifiedAt: null } });
  else {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { socialsVerifiedAt: null } }),
      db.socialLink.updateMany({ where: { userId }, data: { verifiedAt: null } }),
    ]);
  }
  await audit(admin.id, `verification.revoke_${badge}`, { type: "user", id: userId });
  await flash(badge === "id" ? "ID badge removed." : "Socials badge removed.");
  refresh();
}

// ───────────────────────────── Directory suggestions and review proof ─────────────────────────────

async function uniqueCompanySlug(name: string, exceptId?: string) {
  const base = slugify(name) || "company";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const taken = await db.company.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Add a suggested company (listed as "Not checked yet" until you check its details), link it to one we have, or say no. */
export async function decideSuggestion(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ suggestionId: id, decision: z.enum(["add", "exists", "reject"]), existing: optionalText(200), note: note(500) })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const s = await db.companySuggestion.findUnique({ where: { id: parsed.data.suggestionId } });
  if (!s || s.status !== "PENDING") return fail("Someone already handled this suggestion.");
  const now = new Date();

  if (parsed.data.decision === "add") {
    const company = await db.company.create({
      data: {
        slug: await uniqueCompanySlug(s.name),
        name: s.name,
        website: s.website,
        primaryCategory: s.category,
        categories: [s.category],
        status: "PUBLISHED",
      },
    });
    await db.companySuggestion.update({ where: { id: s.id }, data: { status: "ADDED", companyId: company.id, reviewedAt: now, reviewNote: parsed.data.note ?? null } });
    await notify(s.userId, {
      type: "suggestion.added",
      title: `We added ${company.name} to the directory`,
      body: s.worksThere ? "Thanks for the suggestion. You can claim the listing for free from its page." : "Thanks for the suggestion. You can be the first to review it.",
      url: `/directory/c/${company.slug}`,
    });
    await audit(admin.id, "suggestion.add", { type: "company", id: company.id }, { suggestionId: s.id });
    redirect(`/admin/directory/${company.id}?added=1`);
  }

  if (parsed.data.decision === "exists") {
    const ref = (parsed.data.existing ?? "").trim().replace(/^.*\/directory\/c\//, "").replace(/[/?#].*$/, "");
    const company = ref ? await db.company.findUnique({ where: { slug: ref } }) : null;
    if (!company) return fail("Pick the company it matches.", formData, { existing: ["Not found. Paste its page address or its slug"] });
    await db.companySuggestion.update({ where: { id: s.id }, data: { status: "ADDED", companyId: company.id, reviewedAt: now, reviewNote: parsed.data.note ?? "Already listed" } });
    await notify(s.userId, { type: "suggestion.exists", title: `${company.name} is already in the directory`, body: "Thanks for the suggestion.", url: `/directory/c/${company.slug}` });
    await audit(admin.id, "suggestion.exists", { type: "company", id: company.id }, { suggestionId: s.id });
    return done(`Linked to ${company.name}.`);
  }

  if (!parsed.data.note) return fail("Say why, so they know.", formData, { note: ["Add a short reason"] });
  await db.companySuggestion.update({ where: { id: s.id }, data: { status: "REJECTED", reviewedAt: now, reviewNote: parsed.data.note } });
  await notify(s.userId, { type: "suggestion.rejected", title: `We didn't add ${s.name}`, body: parsed.data.note, url: "/directory/suggest" });
  await audit(admin.id, "suggestion.reject", { type: "suggestion", id: s.id });
  return done("Turned down. They've been told why.");
}

/** Confirm a reviewer's proof of use (the review gets the badge) or not. The file is deleted once decided. */
export async function decideProof(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ reviewId: id, decision: z.enum(["verify", "reject"]), note: note(300) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const r = await db.companyReview.findUnique({ where: { id: parsed.data.reviewId }, include: { company: { select: { name: true, slug: true } } } });
  if (!r || r.proofStatus !== "PENDING") return fail("Someone already checked this.");
  const ok = parsed.data.decision === "verify";
  await db.companyReview.update({ where: { id: r.id }, data: { proofStatus: ok ? "VERIFIED" : "REJECTED", proofMediaId: null } });
  if (r.proofMediaId) await removeMedia(r.proofMediaId);
  await notify(r.userId, {
    type: ok ? "review.proof_ok" : "review.proof_no",
    title: ok ? `Your review of ${r.company.name} now shows "Proof of use"` : `We couldn't confirm the proof on your review of ${r.company.name}`,
    body: ok ? "Thanks for adding proof. The file has been deleted." : `${parsed.data.note ?? "The file didn't show you used this company."} Your review stays up without the badge, and the file has been deleted.`,
    url: `/directory/c/${r.company.slug}#r-${r.id}`,
  });
  await audit(admin.id, `review.proof_${parsed.data.decision}`, { type: "company_review", id: r.id });
  return done(ok ? "Proof confirmed. The file is deleted." : "Not confirmed. The file is deleted.");
}

// ───────────────────────────── Refund disputes and orders ─────────────────────────────

/** A refund the buyer asked us to review (or the creator didn't answer): refund it, or let the creator's answer stand. */
export async function decideDispute(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ refundId: id, decision: z.enum(["refund", "deny"]), note: note(800) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const refund = await db.refund.findUnique({ where: { id: parsed.data.refundId }, include: { order: { include: { product: { select: { title: true } } } } } });
  if (!refund || !refund.escalatedAt || refund.status !== "REQUESTED") return fail("Someone already handled this.");
  if (!parsed.data.note) return fail("Write a short note. Both sides see it.", formData, { note: ["Add a note"] });
  const title = refund.order.product?.title ?? orderNumber(refund.order.number);
  if (parsed.data.decision === "refund") {
    try {
      await processRefund(refund.id, admin.id, parsed.data.note);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
    }
    if (refund.order.sellerId) {
      await notify(refund.order.sellerId, { type: "refund.admin", title: `We refunded an order of ${title}`, body: parsed.data.note, url: "/creator/sales", email: "orders" });
    }
    return done("Refunded. The buyer and the creator have been told.");
  }
  await db.refund.update({ where: { id: refund.id }, data: { status: "DENIED", decidedById: admin.id, decidedAt: new Date(), decisionNote: parsed.data.note } });
  await notify(refund.requesterId, { type: "refund.admin_denied", title: `We reviewed your refund request for ${title}`, body: `We didn't approve it. ${parsed.data.note}`, url: "/settings/billing", email: "orders" });
  if (refund.order.sellerId) {
    await notify(refund.order.sellerId, { type: "refund.admin_denied", title: `We reviewed a refund request for ${title}`, body: `No refund. ${parsed.data.note}`, url: "/creator/sales" });
  }
  await audit(admin.id, "refund.admin_deny", { type: "refund", id: refund.id });
  return done("Decided: no refund. Both sides have been told.");
}

/** Refund what's left of an order, from our side (for example a scam the buyer reported). */
export async function refundOrderAsAdmin(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ orderId: id, note: z.string().trim().min(3, "Say why").max(500) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, include: { deal: { select: { id: true, status: true } } } });
  if (!order || (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")) return fail("Only paid orders can be refunded.");
  const left = order.amountCents - order.refundedCents;
  if (left <= 0) return fail("Nothing left to refund.");
  // Business payments are charged to us, not to a creator, so they have their own refund paths.
  if (order.kind === "CAMPAIGN") {
    if (!order.deal || (order.deal.status !== "FUNDED" && order.deal.status !== "SUBMITTED")) {
      return fail("The creator was already paid for this deal, so it can't be refunded from here.");
    }
    try {
      const ok = await refundDeal(order.deal.id, admin.id, parsed.data.note, "staff");
      if (!ok) return fail("This deal was already handled.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
    }
    return done("Refunded in full. The deal is canceled and both sides have been told.");
  }
  if (order.kind === "FEATURED") {
    try {
      const r = await refundFeaturedOrder(order.id, admin.id, parsed.data.note);
      if (!r) return fail("This order was already handled.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
    }
    return done("Refunded in full. The Sponsored spot has ended and the company has been told.");
  }
  const open = await db.refund.findFirst({ where: { orderId: order.id, status: "REQUESTED" } });
  const refund =
    open ??
    (await db.refund.create({ data: { orderId: order.id, requesterId: order.buyerId, amountCents: left, reason: "Refunded by TraderTrades", details: parsed.data.note } }));
  try {
    await processRefund(refund.id, admin.id, parsed.data.note);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
  }
  return done("Refunded in full.");
}

// ───────────────────────────── Listings and accounts ─────────────────────────────

export async function markListingChecked(formData: FormData) {
  const admin = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  await db.product.updateMany({ where: { id: productId }, data: { checkedAt: new Date() } });
  await audit(admin.id, "product.checked", { type: "product", id: productId });
  await flash("Marked as checked.");
  refresh();
}

export async function takeDownListing(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ productId: id, reason: z.string().trim().min(5, "Tell the creator why, in a sentence").max(800) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const changed = await takeDown("PRODUCT", parsed.data.productId, parsed.data.reason);
  if (!changed) return fail("It's already down.");
  await db.product.update({ where: { id: parsed.data.productId }, data: { checkedAt: new Date() } });
  await db.report.updateMany({
    where: { targetType: "PRODUCT", targetId: parsed.data.productId, status: "OPEN" },
    data: { status: "ACTIONED", resolvedById: admin.id, resolvedAt: new Date(), resolution: parsed.data.reason },
  });
  await audit(admin.id, "product.takedown", { type: "product", id: parsed.data.productId });
  return done("Taken down. The creator has been told why.");
}

export async function restoreListing(formData: FormData) {
  const admin = await requireAdmin();
  const p = await db.product.findUnique({ where: { id: String(formData.get("productId") ?? "") } });
  if (!p || p.status !== "SUSPENDED") return;
  await db.product.update({ where: { id: p.id }, data: { status: p.publishedAt ? "PUBLISHED" : "DRAFT", reviewNote: null } });
  await notify(p.creatorId, { type: "product.restored", title: `"${p.title}" is back up`, url: `/creator/products/${p.id}`, email: "orders" });
  await audit(admin.id, "product.restore", { type: "product", id: p.id });
  await flash("It's back up. The creator has been told.");
  refresh();
}

/** Put an account on hold, ban it, or make it active again. Admin accounts can't be changed from here. */
export async function setAccountStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ userId: id, status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]), reason: optionalText(800) })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { userId, status } = parsed.data;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "DELETED") return fail("Account not found.");
  if (user.id === admin.id || user.isAdmin) return fail("Admin accounts can't be changed here.");
  if (status !== "ACTIVE" && !parsed.data.reason) return fail("Say why. They see this.", formData, { reason: ["Add a reason"] });
  await db.user.update({ where: { id: userId }, data: { status, statusReason: status === "ACTIVE" ? null : parsed.data.reason } });
  if (status === "BANNED") await db.session.deleteMany({ where: { userId } });
  if (status === "SUSPENDED") {
    await notify(userId, { type: "account.suspended", title: "Your account is on hold", body: parsed.data.reason, url: "/suspended", email: "orders" });
  }
  if (status === "ACTIVE" && user.status !== "ACTIVE") {
    await notify(userId, { type: "account.restored", title: "Your account is active again", url: "/", email: "orders" });
  }
  await audit(admin.id, `user.${status.toLowerCase()}`, { type: "user", id: userId }, { reason: parsed.data.reason ?? null });
  return done(status === "ACTIVE" ? "Account is active." : status === "SUSPENDED" ? "Account on hold." : "Account banned and signed out everywhere.");
}

// ───────────────────────────── Directory editor ─────────────────────────────

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [string, ...string[]];
const httpsUrl = (msg: string) =>
  z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .pipe(z.url({ protocol: /^https$/, error: msg }));

const companySchema = z.object({
  companyId: optionalText(60),
  name: z.string().trim().min(2, "Enter the name").max(80),
  slug: optionalText(80),
  primaryCategory: z.enum(CATEGORY_VALUES, { error: "Pick the main category" }),
  categories: z.array(z.enum(CATEGORY_VALUES)).max(6).default([]),
  tagline: optionalText(140),
  description: optionalText(4000),
  website: httpsUrl("Enter the website, starting with https://"),
  affiliateUrl: z.union([z.literal(""), httpsUrl("Affiliate links have to start with https://")]).optional(),
  markets: z.array(z.enum(["FUTURES", "FOREX", "CRYPTO", "STOCKS", "OPTIONS"])).default([]),
  platforms: optionalText(400),
  foundedYear: z.union([z.literal(""), z.coerce.number().int().min(1800).max(2100)]).optional(),
  headquarters: optionalText(80),
  status: z.enum(["PUBLISHED", "HIDDEN"]),
  checked: z.literal("on").optional(),
});

/**
 * Deletes an example account (like @tris) with everything on it, which frees its username.
 * Only sample accounts with no orders can be removed this way. The example isn't added back on the next deploy.
 */
export async function removeSampleAccount(formData: FormData) {
  const admin = await requireAdmin();
  const userId = id.safeParse(formData.get("userId"));
  if (!userId.success) return;
  const user = await db.user.findUnique({
    where: { id: userId.data },
    select: {
      id: true,
      username: true,
      isSample: true,
      _count: { select: { ordersBought: true, ordersSold: true, subscriptions: true, subscribers: true, campaignsCreated: true } },
    },
  });
  if (!user?.isSample) {
    await flash("Only sample accounts can be removed here.", "error");
    refresh();
    return;
  }
  if (Object.values(user._count).some((n) => n > 0)) {
    await flash("This sample account has orders or campaigns, so it can't be removed. Put it on hold instead.", "error");
    refresh();
    return;
  }
  const media = await db.media.findMany({ where: { ownerId: user.id }, select: { id: true } });
  for (const m of media) await removeMedia(m.id);
  await db.user.delete({ where: { id: user.id } });
  await audit(admin.id, "sample.removed", { type: "user", id: user.id }, { username: user.username });
  await flash(`Removed the sample account @${user.username}. The username is free now.`);
  redirect("/admin/users");
}

/** Create or edit a directory company. "Details checked" stamps today's date on the listing. */
export async function saveCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = companySchema.safeParse(formObject(formData, ["categories", "markets"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const existing = d.companyId ? await db.company.findUnique({ where: { id: d.companyId } }) : null;
  if (d.companyId && !existing) return fail("Company not found.");
  const slug = d.slug ? slugify(d.slug) : existing?.slug;
  if (slug) {
    const clash = await db.company.findUnique({ where: { slug }, select: { id: true } });
    if (clash && clash.id !== existing?.id) return fail("Another company uses that address.", formData, { slug: ["Pick another one"] });
  }
  const categories = Array.from(new Set([d.primaryCategory, ...d.categories])) as typeof d.categories;
  const data = {
    name: d.name,
    primaryCategory: d.primaryCategory as (typeof CATEGORIES)[number]["value"],
    categories: categories as (typeof CATEGORIES)[number]["value"][],
    tagline: d.tagline ?? null,
    description: d.description ?? null,
    website: d.website,
    affiliateUrl: d.affiliateUrl ? d.affiliateUrl : null,
    markets: d.markets,
    platforms: (d.platforms ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 20),
    foundedYear: typeof d.foundedYear === "number" ? d.foundedYear : null,
    headquarters: d.headquarters ?? null,
    status: d.status,
    ...(d.checked ? { lastCheckedAt: new Date() } : {}),
  };
  if (existing) {
    await db.company.update({ where: { id: existing.id }, data: { ...data, slug: slug ?? existing.slug } });
    await audit(admin.id, "company.update", { type: "company", id: existing.id }, { checked: Boolean(d.checked) });
    return done(d.checked ? "Saved, and marked as checked today." : "Saved.");
  }
  const company = await db.company.create({ data: { ...data, slug: slug ?? (await uniqueCompanySlug(d.name)) } });
  await audit(admin.id, "company.create", { type: "company", id: company.id });
  redirect(`/admin/directory/${company.id}?added=1`);
}

const offerSchema = z.object({
  companyId: id,
  offerId: optionalText(60),
  title: z.string().trim().min(3, "Say what the offer is").max(80),
  description: optionalText(300),
  code: optionalText(40),
  url: z.union([z.literal(""), httpsUrl("Links have to start with https://")]).optional(),
  expiresAt: z.union([z.literal(""), z.iso.date()]).optional(),
});

/** Offers show on the company page and the offers page. Only add ones the company really runs. */
export async function saveOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = offerSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  if (!d.code && !d.url) return fail("Add a code, a link, or both.", formData, { code: ["Add a code or a link"] });
  const data = {
    title: d.title,
    description: d.description ?? null,
    code: d.code ? d.code.toUpperCase() : null,
    url: d.url ? d.url : null,
    expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59Z`) : null,
  };
  if (d.offerId) {
    await db.companyOffer.updateMany({ where: { id: d.offerId, companyId: d.companyId }, data });
  } else {
    await db.companyOffer.create({ data: { ...data, companyId: d.companyId, active: true } });
  }
  await audit(admin.id, d.offerId ? "offer.update" : "offer.create", { type: "company", id: d.companyId });
  return done(d.offerId ? "Offer saved." : "Offer added.");
}

export async function toggleOffer(formData: FormData) {
  const admin = await requireAdmin();
  const offer = await db.companyOffer.findUnique({ where: { id: String(formData.get("offerId") ?? "") } });
  if (!offer) return;
  await db.companyOffer.update({ where: { id: offer.id }, data: { active: !offer.active } });
  await audit(admin.id, offer.active ? "offer.off" : "offer.on", { type: "company", id: offer.companyId });
  await flash(offer.active ? "Offer turned off." : "Offer turned on.");
  refresh();
}

export async function deleteOffer(formData: FormData) {
  const admin = await requireAdmin();
  const offer = await db.companyOffer.findUnique({ where: { id: String(formData.get("offerId") ?? "") } });
  if (!offer) return;
  await db.companyOffer.delete({ where: { id: offer.id } });
  await audit(admin.id, "offer.delete", { type: "company", id: offer.companyId });
  await flash("Offer deleted.");
  refresh();
}

// ───────────────────────────── Business: claims, deals, Sponsored spots ─────────────────────────────

/** A claim sent with documents: let them run the listing, or say no with a reason they'll see. */
export async function decideClaim(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ claimId: id, decision: z.enum(["approve", "reject"]), note: note(800) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const claim = await db.companyClaim.findUnique({ where: { id: parsed.data.claimId } });
  if (!claim || claim.status !== "PENDING") return fail("Someone already handled this.");
  if (parsed.data.decision === "reject") {
    if (!parsed.data.note) return fail("Say why, so they know what to send next time.", formData, { note: ["Add a reason"] });
    await rejectClaim(claim.id, admin.id, parsed.data.note);
  } else {
    const res = await approveClaim(claim.id, admin.id, "staff");
    if (!res) return fail("Someone already handled this.");
  }
  // The documents were only needed for this check.
  await db.companyClaim.update({ where: { id: claim.id }, data: { documentIds: [] } });
  for (const m of claim.documentIds) await removeMedia(m).catch(() => undefined);
  return done(parsed.data.decision === "approve" ? "Approved. They run the listing now." : "Turned down. They've been told why.");
}

/** A disagreement on a deal: pay the creator, give the company its money back, or let the deal carry on. */
export async function resolveDealDispute(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ dealId: id, decision: z.enum(["pay", "refund", "continue"]), note: z.string().trim().min(10, "Explain the decision. Both sides see it.").max(1000) })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const deal = await db.deal.findUnique({ where: { id: d.dealId }, include: { campaign: true, company: true } });
  if (!deal || !deal.disputedAt || deal.resolvedAt) return fail("Someone already handled this.");
  if (deal.status !== "FUNDED" && deal.status !== "SUBMITTED") return fail("This deal already ended.");
  if (d.decision === "pay") {
    const ok = await approveDeal(deal.id, admin.id, "staff", d.note);
    if (!ok) return fail("The payment for this deal couldn't be found. Check the order first.");
    return done("Decided: the creator gets paid. Both sides have been told.");
  }
  if (d.decision === "refund") {
    try {
      const ok = await refundDeal(deal.id, admin.id, d.note, "staff");
      if (!ok) return fail("This deal was already handled.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
    }
    return done("Decided: the company gets its money back. Both sides have been told.");
  }
  // Carry on: the deal stays as it is. Work already sent gets a fresh week for the company to answer.
  const now = new Date();
  await db.deal.update({
    where: { id: deal.id },
    data: { resolvedAt: now, resolvedById: admin.id, resolutionNote: d.note, ...(deal.status === "SUBMITTED" ? { submittedAt: now } : {}) },
  });
  await audit(admin.id, "deal.dispute_closed", { type: "deal", id: deal.id });
  const team = await db.businessMember.findMany({ where: { companyId: deal.companyId }, select: { userId: true } });
  for (const uid of [deal.creatorId, ...team.map((m) => m.userId)]) {
    await notify(uid, { type: "deal.dispute_closed", title: `Our team looked at "${deal.campaign.title}"`, body: `The deal carries on. ${d.note}`, url: `/deals/${deal.id}`, email: "business" });
  }
  return done("Closed. The deal carries on and both sides have been told.");
}

/** Ends a Sponsored spot early, with or without a refund for the days not used. */
export async function cancelFeatured(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ slotId: id, reason: z.string().trim().min(5, "Tell the company why, in a sentence").max(800), refund: z.string().optional() })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    const r = await cancelFeaturedSlot(parsed.data.slotId, admin.id, parsed.data.reason, parsed.data.refund === "on");
    if (!r) return fail("This spot already ended.");
    return done(r.refunded ? `Ended. ${money(r.refunded, { exact: true })} is going back to the company.` : "Ended. The company has been told.");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
  }
}
