"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { CompanyCategory, FeaturedPlacement, MemberRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { CATEGORIES, MARKETS, SOCIALS } from "@/lib/constants";
import { emailRule, fail, formObject, invalid, optionalText, success, type ActionState, dollars } from "@/lib/forms";
import { formatDate, money, toEmbedUrl, youtubeThumb } from "@/lib/utils";
import { processingFee } from "@/lib/fees";
import { companyRole, requireVerifiedUser } from "@/server/dal";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { notifyAdmins } from "@/server/admin";
import { checkText } from "@/server/moderation";
import { rateLimit } from "@/server/rate-limit";
import { consumeCode, issueCode } from "@/server/auth/tokens";
import { sendEmail } from "@/server/email/send";
import { emails } from "@/server/email/templates";
import { mediaUrl, removeMedia } from "@/server/storage";
import { createPlatformCheckoutSession } from "@/server/stripe";
import {
  approveClaim,
  approveDeal,
  businessPaymentPath,
  claimDomain,
  dealTotals,
  featuredPlaceLabel,
  featuredWeeks,
  workEmailMatches,
} from "@/server/business";

const id = z.string().min(1).max(60);
const MARKET_VALUES = MARKETS.map((m) => m.value) as [string, ...string[]];
const SOCIAL_VALUES = SOCIALS.map((s) => s.value) as [string, ...string[]];
const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [string, ...string[]];

/** The signed in user and their role at the company, or an error to show. Accounts on hold can't act for a company. */
async function teamMember(companyId: string, roles: MemberRole[] = ["OWNER", "ADMIN", "MEMBER"]) {
  const user = await requireVerifiedUser();
  const role = await companyRole(companyId, user);
  if (!role || !roles.includes(role)) return { user, error: roles.length < 3 ? "Only the company's owner or admins can do that." : "You're not on this company's team." };
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) return { user, error: "Company not found." };
  return { user, role, company, error: null };
}

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.url({ protocol: /^https$/, error: "Links have to start with https://" }));

// ───────────────────────────── Claiming a listing ─────────────────────────────

async function sendClaimCode(userId: string, claimId: string, workEmail: string, companyName: string) {
  const code = await issueCode(userId, "VERIFY_WORK_EMAIL", { claimId });
  await sendEmail(
    workEmail,
    emails.generic({
      subject: `${code} is your TraderTrades code for ${companyName}`,
      heading: "Confirm you work here",
      body: [
        `Someone asked to run ${companyName}'s listing on TraderTrades using this email address. If that was you, enter this code on the claim page:`,
        code,
        "The code works for one hour. If it wasn't you, ignore this email and nothing changes.",
      ],
    }),
    { template: "claim-code", userId },
  );
}

const startSchema = z.object({
  companyId: id,
  workEmail: emailRule,
  jobTitle: z.string().trim().min(2, "Add your job title").max(80),
});

/** Step one of claiming: a work email on the company's domain gets a code. */
export async function startClaim(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = startSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const company = await db.company.findUnique({ where: { id: d.companyId } });
  if (!company || company.status !== "PUBLISHED") return fail("That company isn't in the directory.", formData);
  if (await companyRole(company.id, { id: user.id, isAdmin: false })) redirect(`/business/${company.slug}`);

  const domain = claimDomain(company.website);
  if (!workEmailMatches(d.workEmail, company.website)) {
    return fail(
      domain ? `Use an email address at ${domain}, or send documents instead.` : "This company's website can't be checked by email, so send documents instead.",
      formData,
      { workEmail: [domain ? `Has to end in @${domain}` : "Send documents instead"] },
    );
  }
  const rl = await rateLimit(`claim-send:${user.id}`, 6, 3600);
  if (!rl.ok) return fail("Too many codes sent. Try again in an hour.", formData);

  const open = await db.companyClaim.findFirst({ where: { companyId: company.id, userId: user.id, status: "PENDING", documentIds: { isEmpty: true } } });
  const claim = open
    ? await db.companyClaim.update({ where: { id: open.id }, data: { workEmail: d.workEmail, jobTitle: d.jobTitle } })
    : await db.companyClaim.create({ data: { companyId: company.id, userId: user.id, workEmail: d.workEmail, jobTitle: d.jobTitle } });
  await sendClaimCode(user.id, claim.id, d.workEmail, company.name);
  await audit(user.id, "claim.start", { type: "company", id: company.id }, { claimId: claim.id });
  redirect(`/business/claim/${claim.id}`);
}

export async function verifyClaimCode(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const claimId = String(formData.get("claimId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const claim = await db.companyClaim.findUnique({ where: { id: claimId }, include: { company: true } });
  if (!claim || claim.userId !== user.id) return fail("Claim not found.");
  if (claim.status !== "PENDING") redirect(claim.status === "APPROVED" ? `/business/${claim.company.slug}` : "/business/claim");
  if (code.length !== 6) return fail("Enter the 6 digit code from the email.", formData, { code: ["6 digits"] });
  const rl = await rateLimit(`claim-code:${claim.id}`, 6, 1800);
  if (!rl.ok) return fail("Too many wrong codes. Wait 30 minutes, then send a new code.");
  const row = await consumeCode(user.id, "VERIFY_WORK_EMAIL", code);
  const data = row?.data as { claimId?: string } | null | undefined;
  if (!row || data?.claimId !== claim.id) return fail("That code doesn't match, or it ran out. Check the email or send a new one.", formData, { code: ["Wrong or old code"] });
  const res = await approveClaim(claim.id, user.id, "email");
  if (!res) return fail("This claim was already handled.");
  await flash(res.role === "OWNER" ? `You now run ${claim.company.name} on TraderTrades.` : `You joined ${claim.company.name}'s team.`);
  redirect(`/business/${claim.company.slug}`);
}

export async function resendClaimCode(formData: FormData) {
  const user = await requireVerifiedUser();
  const claim = await db.companyClaim.findUnique({ where: { id: String(formData.get("claimId") ?? "") }, include: { company: true } });
  if (!claim || claim.userId !== user.id || claim.status !== "PENDING" || claim.documentIds.length) return;
  const rl = await rateLimit(`claim-send:${user.id}`, 6, 3600);
  if (!rl.ok) {
    await flash("Too many codes sent. Try again in an hour.", "error");
    return refresh();
  }
  await sendClaimCode(user.id, claim.id, claim.workEmail, claim.company.name);
  await flash(`New code sent to ${claim.workEmail}.`);
  refresh();
}

const docsSchema = z.object({
  companyId: id,
  workEmail: z.union([z.literal(""), emailRule]).optional(),
  jobTitle: z.string().trim().min(2, "Add your job title").max(80),
  message: z.string().trim().min(20, "Say how you're connected to the company (at least 20 characters)").max(1500),
  documentIds: z.array(z.string().max(40)).min(1, "Add at least one document").max(5, "5 files at most"),
});

/** No email on the company's domain: send documents and our team checks them. */
export async function submitClaimDocuments(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = docsSchema.safeParse(formObject(formData, ["documentIds"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const company = await db.company.findUnique({ where: { id: d.companyId } });
  if (!company || company.status !== "PUBLISHED") return fail("That company isn't in the directory.", formData);
  if (await companyRole(company.id, { id: user.id, isAdmin: false })) redirect(`/business/${company.slug}`);
  const waiting = await db.companyClaim.findFirst({ where: { companyId: company.id, userId: user.id, status: "PENDING", documentIds: { isEmpty: false } } });
  if (waiting) redirect(`/business/claim/${waiting.id}`);
  const rl = await rateLimit(`claim-docs:${user.id}`, 5, 86400);
  if (!rl.ok) return fail("You've sent a lot of claims today. Try again tomorrow.", formData);
  const docs = await db.media.findMany({ where: { id: { in: d.documentIds }, ownerId: user.id, purpose: "document" }, select: { id: true } });
  if (docs.length !== d.documentIds.length) return fail("A file didn't upload properly. Remove it and add it again.", formData);

  const claim = await db.companyClaim.create({
    data: { companyId: company.id, userId: user.id, workEmail: d.workEmail || user.email, jobTitle: d.jobTitle, message: d.message, documentIds: docs.map((x) => x.id) },
  });
  await audit(user.id, "claim.documents", { type: "company", id: company.id }, { claimId: claim.id });
  await notifyAdmins({ type: "claim.review", title: `Listing claim to check: ${company.name}`, body: `@${user.username}, ${d.jobTitle}`, url: "/admin/claims" });
  await flash("Sent. Our team usually answers within 2 working days.");
  redirect(`/business/claim/${claim.id}`);
}

export async function cancelClaim(formData: FormData) {
  const user = await requireVerifiedUser();
  const claim = await db.companyClaim.findUnique({ where: { id: String(formData.get("claimId") ?? "") }, include: { company: true } });
  if (!claim || claim.userId !== user.id || claim.status !== "PENDING") return;
  await db.companyClaim.delete({ where: { id: claim.id } });
  for (const m of claim.documentIds) await removeMedia(m).catch(() => undefined);
  await flash("Claim canceled.");
  redirect(`/business/claim?company=${claim.company.slug}`);
}

// ───────────────────────────── The listing ─────────────────────────────

const listingSchema = z.object({
  companyId: id,
  tagline: optionalText(120),
  description: optionalText(4000),
  markets: z.array(z.enum(MARKET_VALUES)).max(5),
  platforms: optionalText(300),
  foundedYear: z.union([z.literal(""), z.coerce.number().int().min(1900, "Check the year").max(new Date().getFullYear(), "Check the year")]).optional(),
  headquarters: optionalText(80),
  logoUrl: optionalText(500),
});

function ownUploadUrl(url: string) {
  return url.startsWith("/api/media/") || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url);
}

/** What a claimed company can change itself. Name, web address and categories go through our team. */
export async function saveListing(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = listingSchema.safeParse(formObject(formData, ["markets"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const t = await teamMember(d.companyId);
  if (t.error) return fail(t.error, formData);
  if (d.logoUrl && !ownUploadUrl(d.logoUrl)) return fail("Upload the logo here.", formData);
  const check = await checkText(`${d.tagline ?? ""}\n${d.description ?? ""}`, { type: "COMPANY", id: d.companyId });
  if (check.blocked) return fail(check.message, formData);
  await db.company.update({
    where: { id: d.companyId },
    data: {
      tagline: d.tagline ?? null,
      description: d.description ?? null,
      markets: d.markets as (typeof MARKETS)[number]["value"][],
      platforms: (d.platforms ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 20),
      foundedYear: typeof d.foundedYear === "number" ? d.foundedYear : null,
      headquarters: d.headquarters ?? null,
      logoUrl: d.logoUrl ?? null,
    },
  });
  await audit(t.user.id, "company.edit_by_team", { type: "company", id: d.companyId });
  refresh();
  return success("Listing saved. It's live on your page.");
}

// ───────────────────────────── Offers ─────────────────────────────

const offerSchema = z.object({
  companyId: id,
  offerId: optionalText(60),
  title: z.string().trim().min(3, "Say what the offer is").max(80),
  description: optionalText(300),
  code: optionalText(40),
  url: z.union([z.literal(""), httpsUrl]).optional(),
  expiresAt: z.union([z.literal(""), z.iso.date()]).optional(),
});

export async function saveBusinessOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = offerSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const t = await teamMember(d.companyId);
  if (t.error) return fail(t.error, formData);
  if (!d.code && !d.url) return fail("Add a code, a link, or both.", formData, { code: ["Add a code or a link"] });
  const check = await checkText(`${d.title}\n${d.description ?? ""}`, null);
  if (check.blocked) return fail(check.message, formData);
  const data = {
    title: d.title,
    description: d.description ?? null,
    code: d.code ? d.code.toUpperCase() : null,
    url: d.url ? d.url : null,
    expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59Z`) : null,
  };
  if (d.offerId) await db.companyOffer.updateMany({ where: { id: d.offerId, companyId: d.companyId }, data });
  else await db.companyOffer.create({ data: { ...data, companyId: d.companyId, active: true } });
  await audit(t.user.id, d.offerId ? "offer.update" : "offer.create", { type: "company", id: d.companyId });
  await flash(d.offerId ? "Offer saved." : "Offer added. It shows on your listing and the offers page.");
  refresh();
  return success(d.offerId ? "Offer saved." : "Offer added.");
}

async function ownOffer(formData: FormData) {
  const offer = await db.companyOffer.findUnique({ where: { id: String(formData.get("offerId") ?? "") } });
  if (!offer) return null;
  const t = await teamMember(offer.companyId);
  return t.error ? null : { offer, user: t.user };
}

export async function toggleBusinessOffer(formData: FormData) {
  const o = await ownOffer(formData);
  if (!o) return;
  await db.companyOffer.update({ where: { id: o.offer.id }, data: { active: !o.offer.active } });
  await audit(o.user.id, o.offer.active ? "offer.off" : "offer.on", { type: "company", id: o.offer.companyId });
  await flash(o.offer.active ? "Offer turned off." : "Offer turned on.");
  refresh();
}

export async function deleteBusinessOffer(formData: FormData) {
  const o = await ownOffer(formData);
  if (!o) return;
  await db.companyOffer.delete({ where: { id: o.offer.id } });
  await audit(o.user.id, "offer.delete", { type: "company", id: o.offer.companyId });
  await flash("Offer deleted.");
  refresh();
}

// ───────────────────────────── Team ─────────────────────────────

export async function removeTeamMember(formData: FormData) {
  const user = await requireVerifiedUser();
  const member = await db.businessMember.findUnique({ where: { id: String(formData.get("memberId") ?? "") }, include: { company: true, user: true } });
  if (!member) return;
  const self = member.userId === user.id;
  const myRole = await companyRole(member.companyId, user);
  if (!self && myRole !== "OWNER" && myRole !== "ADMIN") return;
  if (!self && member.role === "OWNER" && myRole !== "OWNER") return;
  if (member.role === "OWNER") {
    const owners = await db.businessMember.count({ where: { companyId: member.companyId, role: "OWNER" } });
    if (owners <= 1) {
      await flash("A company needs an owner. Make someone else the owner first.", "error");
      return refresh();
    }
  }
  await db.businessMember.delete({ where: { id: member.id } });
  await audit(user.id, self ? "team.leave" : "team.remove", { type: "company", id: member.companyId }, { userId: member.userId });
  if (!self) {
    await notify(member.userId, { type: "team.removed", title: `You were removed from ${member.company.name}'s team`, url: "/business" });
    await flash(`${member.user.displayName} was removed.`);
    return refresh();
  }
  await flash(`You left ${member.company.name}'s team.`);
  redirect("/business");
}

export async function setTeamRole(formData: FormData) {
  const user = await requireVerifiedUser();
  const role = String(formData.get("role") ?? "") as MemberRole;
  if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) return;
  const member = await db.businessMember.findUnique({ where: { id: String(formData.get("memberId") ?? "") } });
  if (!member || member.userId === user.id) return;
  if ((await companyRole(member.companyId, user)) !== "OWNER") return;
  await db.businessMember.update({ where: { id: member.id }, data: { role } });
  await audit(user.id, "team.role", { type: "company", id: member.companyId }, { userId: member.userId, role });
  await flash("Role changed.");
  refresh();
}

// ───────────────────────────── Videos on the listing ─────────────────────────────

/** Walkthroughs and explainers shown on the company's page. Same claim rules as everything else. */
export async function saveCompanyVideo(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      companyId: id,
      videoId: optionalText(60),
      title: z.string().trim().min(3, "At least 3 characters").max(120, "120 characters at most"),
      description: optionalText(3000),
      mediaId: optionalText(40),
      embedUrl: z.union([z.literal(""), httpsUrl]).optional(),
      posterMediaId: optionalText(40),
      aspect: z.enum(["auto", "16:9", "9:16", "1:1"]).default("auto"),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const t = await teamMember(d.companyId);
  if (t.error) return fail(t.error, formData);
  const existing = d.videoId ? await db.videoPost.findFirst({ where: { id: d.videoId, companyId: d.companyId } }) : null;
  if (d.videoId && !existing) return fail("Video not found.");
  if (existing?.status === "REMOVED") return fail("Our team took this video down, so it can't be changed.");
  if (!existing) {
    const rl = await rateLimit(`company-video:${d.companyId}`, 20, 86400);
    if (!rl.ok) return fail("That's a lot of videos today. Try again tomorrow.");
  }
  const media = d.mediaId ? await db.media.findFirst({ where: { id: d.mediaId, ownerId: t.user.id, purpose: "video" } }) : null;
  if (d.mediaId && !media) return fail("That video didn't upload properly. Try again.", formData);
  if (d.embedUrl && !toEmbedUrl(d.embedUrl)) return fail("Links can be YouTube, Vimeo or Loom.", formData, { embedUrl: ["Use a YouTube, Vimeo or Loom link"] });
  if (!media && !d.embedUrl && !existing?.mediaId && !existing?.embedUrl) return fail("Upload a video or paste a link.", formData, { embedUrl: ["Add a video"] });
  const poster = d.posterMediaId ? await db.media.findFirst({ where: { id: d.posterMediaId, ownerId: t.user.id, purpose: "poster" } }) : null;
  const check = await checkText(`${d.title}\n${d.description ?? ""}`, existing ? { type: "VIDEO", id: existing.id } : null);
  if (check.blocked) return fail(check.message, formData);

  const shape = (w?: number | null, h?: number | null) => (!w || !h ? "16:9" : w / h < 0.8 ? "9:16" : w / h < 1.2 ? "1:1" : "16:9");
  const aspect = d.aspect !== "auto" ? d.aspect : media ? shape(media.width, media.height) : d.embedUrl?.includes("/shorts/") ? "9:16" : (existing?.aspect ?? "16:9");
  const source = media ? { mediaId: media.id, embedUrl: null, durationSec: media.durationSec } : d.embedUrl ? { mediaId: null, embedUrl: d.embedUrl, durationSec: null } : {};
  const posterUrl = poster ? mediaUrl(poster) : !media && d.embedUrl ? youtubeThumb(d.embedUrl) : undefined;

  if (existing) {
    const replaced = existing.mediaId && (media ? existing.mediaId !== media.id : Boolean(d.embedUrl)) ? existing.mediaId : null;
    await db.videoPost.update({ where: { id: existing.id }, data: { title: d.title, description: d.description ?? null, aspect, ...source, ...(posterUrl ? { posterUrl } : {}) } });
    if (replaced) await removeMedia(replaced);
    refresh();
    return success("Video saved.");
  }
  const video = await db.videoPost.create({
    // Company videos belong to the company, not to whoever posted them (the audit log keeps who).
    data: { companyId: d.companyId, authorId: null, title: d.title, description: d.description ?? null, aspect, posterUrl: posterUrl ?? null, mediaId: media?.id ?? null, embedUrl: media ? null : (d.embedUrl ?? null), durationSec: media?.durationSec ?? null, status: "PUBLISHED" },
  });
  await audit(t.user.id, "video.create", { type: "video", id: video.id }, { companyId: d.companyId });
  await flash("Video posted. It's on your listing now.");
  redirect(`/business/${t.company!.slug}/videos`);
}

async function ownCompanyVideo(formData: FormData) {
  const video = await db.videoPost.findUnique({ where: { id: String(formData.get("videoId") ?? "") } });
  if (!video?.companyId) return null;
  const t = await teamMember(video.companyId);
  return t.error ? null : { video, user: t.user };
}

export async function deleteCompanyVideo(formData: FormData) {
  const v = await ownCompanyVideo(formData);
  if (!v) return;
  await db.videoPost.delete({ where: { id: v.video.id } });
  if (v.video.mediaId) await removeMedia(v.video.mediaId);
  await flash("Video deleted.");
  refresh();
}

export async function toggleCompanyVideo(formData: FormData) {
  const v = await ownCompanyVideo(formData);
  if (!v) return;
  if (v.video.status === "REMOVED") {
    await flash("Our team took this video down, so it can't go back up.", "error");
    return refresh();
  }
  const hide = v.video.status === "PUBLISHED";
  await db.videoPost.update({ where: { id: v.video.id }, data: { status: hide ? "HIDDEN" : "PUBLISHED" } });
  await flash(hide ? "Hidden from your listing." : "Back on your listing.");
  refresh();
}

// ───────────────────────────── Sponsored spots ─────────────────────────────

const bookSchema = z.object({
  companyId: id,
  placement: z.enum(["HOME", "CATEGORY"]),
  category: z.union([z.literal(""), z.enum(CATEGORY_VALUES)]).optional(),
  week: z.coerce.number().int().min(0).max(8),
});

export async function bookFeatured(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = bookSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const t = await teamMember(d.companyId);
  if (t.error || !t.company) return fail(t.error ?? "Company not found.", formData);
  const company = t.company;
  if (company.status !== "PUBLISHED") return fail("Your listing is hidden, so it can't be Sponsored right now. Contact us.");
  const placement = d.placement as FeaturedPlacement;
  const category = placement === "CATEGORY" ? ((d.category || company.primaryCategory) as CompanyCategory) : null;
  if (category && !company.categories.includes(category) && company.primaryCategory !== category) return fail("Pick one of your listing's own categories.", formData);

  const path = businessPaymentPath();
  if (path === "off") return fail("Card payments aren't switched on yet. Please try again soon.");
  const rl = await rateLimit(`featured:${t.user.id}`, 20, 3600);
  if (!rl.ok) return fail("Too many tries. Wait a few minutes and try again.");

  const weeks = await featuredWeeks(placement, category, company.id);
  const week = weeks[d.week];
  if (!week) return fail("Pick a week.", formData);
  if (week.mine) return fail("You already have this spot that week.", formData);
  if (week.taken >= week.limit) return fail("That week is full. Pick another one.", formData);

  const place = featuredPlaceLabel(placement, category);
  // Unpaid bookings by this person for the same spot are replaced, so a back button never leaves two.
  await db.featuredSlot.updateMany({ where: { companyId: company.id, createdById: t.user.id, status: "PENDING_PAYMENT", placement, category }, data: { status: "CANCELED" } });
  const slot = await db.featuredSlot.create({
    data: { companyId: company.id, placement, category, startsAt: week.start, endsAt: week.end, priceCents: week.priceCents, createdById: t.user.id },
  });
  const order = await db.order.create({
    data: {
      kind: "FEATURED",
      buyerId: t.user.id,
      companyId: company.id,
      featuredSlotId: slot.id,
      description: `Sponsored spot: ${place}, ${week.partial ? "rest of this week" : `week of ${formatDate(week.start)}`} (${company.name})`,
      listCents: week.priceCents,
      amountCents: week.priceCents,
      feeType: "FEATURED",
      feeBps: 0,
      platformFeeCents: 0,
      processingFeeCents: processingFee(week.priceCents),
      sellerNetCents: 0,
      provider: path === "stripe" ? "STRIPE" : "TEST",
    },
  });
  await audit(t.user.id, "featured.start", { type: "company", id: company.id }, { slotId: slot.id });
  if (path === "test") redirect(`/checkout/test/${order.id}`);
  let url: string | null = null;
  try {
    const session = await createPlatformCheckoutSession({
      orderId: order.id,
      buyerEmail: t.user.email,
      title: `Sponsored spot: ${place}`,
      description: order.description,
      amountCents: order.amountCents,
      successPath: `/checkout/success?order=${order.id}`,
      cancelPath: `/business/${company.slug}/featured`,
      metadata: { kind: "FEATURED", slotId: slot.id },
    });
    await db.order.update({ where: { id: order.id }, data: { stripeCheckoutId: session.id } });
    url = session.url;
  } catch (err) {
    console.error("[featured] checkout", err);
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.featuredSlot.update({ where: { id: slot.id }, data: { status: "CANCELED" } });
  }
  if (!url) return fail("We couldn't start the payment. Please try again in a minute.");
  redirect(url);
}

// ───────────────────────────── Campaigns ─────────────────────────────

const campaignSchema = z.object({
  companyId: id,
  campaignId: optionalText(60),
  title: z.string().trim().min(5, "At least 5 characters").max(100, "100 characters at most"),
  brief: z.string().trim().min(50, "Say what you want in at least 50 characters").max(4000, "4,000 characters at most"),
  deliverables: z.string().trim().min(3, "List what the creator makes").max(1500),
  markets: z.array(z.enum(MARKET_VALUES)).max(5),
  platforms: z.array(z.enum(SOCIAL_VALUES)).max(8),
  budget: dollars({ min: 5000, max: 10_000_000 }),
  creatorsWanted: z.coerce.number().int().min(1, "At least 1").max(50, "50 at most"),
  minAudience: z.union([z.literal(""), z.coerce.number().int().min(0).max(1_000_000_000)]).optional(),
  deadline: z.union([z.literal(""), z.iso.date()]).optional(),
  intent: z.enum(["publish", "draft"]).default("publish"),
});

export async function saveCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = campaignSchema.safeParse(formObject(formData, ["markets", "platforms"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const t = await teamMember(d.companyId);
  if (t.error || !t.company) return fail(t.error ?? "Company not found.", formData);
  const deliverables = d.deliverables
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]+\s*|\d+[.)]\s+)/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!deliverables.length) return fail("List at least one thing the creator makes.", formData, { deliverables: ["One per line"] });
  const deadline = d.deadline ? new Date(`${d.deadline}T23:59:59Z`) : null;
  const existing = d.campaignId ? await db.campaign.findFirst({ where: { id: d.campaignId, companyId: d.companyId } }) : null;
  if (d.campaignId && !existing) return fail("Campaign not found.");
  if (existing?.status === "REMOVED") return fail("Our team closed this campaign, so it can't be changed.");
  if (deadline && deadline < new Date() && !existing) return fail("Pick a date in the future.", formData, { deadline: ["In the future"] });

  const check = await checkText(`${d.title}\n${d.brief}\n${deliverables.join("\n")}`, existing ? { type: "CAMPAIGN", id: existing.id } : null);
  if (check.blocked) return fail(check.message, formData);

  const data = {
    title: d.title,
    brief: d.brief,
    deliverables,
    markets: d.markets as (typeof MARKETS)[number]["value"][],
    platforms: d.platforms as (typeof SOCIALS)[number]["value"][],
    budgetCents: d.budget,
    creatorsWanted: d.creatorsWanted,
    minAudience: typeof d.minAudience === "number" ? d.minAudience : null,
    deadline,
  };
  if (existing) {
    const publish = existing.status === "DRAFT" && d.intent === "publish";
    await db.campaign.update({ where: { id: existing.id }, data: { ...data, ...(publish ? { status: "OPEN" } : {}) } });
    await audit(t.user.id, publish ? "campaign.publish" : "campaign.update", { type: "campaign", id: existing.id });
    await flash(publish ? "Campaign is live. Creators can apply now." : "Campaign saved.");
    redirect(`/business/${t.company.slug}/campaigns/${existing.id}`);
  }
  const rl = await rateLimit(`campaign:${d.companyId}`, 20, 86400);
  if (!rl.ok) return fail("That's a lot of campaigns today. Try again tomorrow.");
  const campaign = await db.campaign.create({ data: { ...data, companyId: d.companyId, createdById: t.user.id, status: d.intent === "publish" ? "OPEN" : "DRAFT" } });
  if (check.hits.length) await checkText(`${d.title}\n${d.brief}\n${deliverables.join("\n")}`, { type: "CAMPAIGN", id: campaign.id });
  await audit(t.user.id, "campaign.create", { type: "campaign", id: campaign.id }, { status: campaign.status });
  await flash(campaign.status === "OPEN" ? "Campaign is live. Creators can apply now, or invite them yourself." : "Saved as a draft.");
  redirect(`/business/${t.company.slug}/campaigns/${campaign.id}`);
}

export async function setCampaignStatus(formData: FormData) {
  const campaign = await db.campaign.findUnique({ where: { id: String(formData.get("campaignId") ?? "") } });
  if (!campaign) return;
  const t = await teamMember(campaign.companyId);
  if (t.error) return;
  const to = String(formData.get("status") ?? "");
  if (campaign.status === "REMOVED" || !["OPEN", "CLOSED"].includes(to)) return;
  await db.campaign.update({ where: { id: campaign.id }, data: { status: to as "OPEN" | "CLOSED" } });
  await audit(t.user.id, to === "OPEN" ? "campaign.open" : "campaign.close", { type: "campaign", id: campaign.id });
  await flash(to === "OPEN" ? "Campaign is open. Creators can apply." : "Campaign closed. No new applications, and deals already agreed carry on.");
  refresh();
}

// ───────────────────────────── Deals, the company's side ─────────────────────────────

const inviteSchema = z.object({
  campaignId: id,
  creatorId: id,
  price: dollars({ min: 1000, max: 10_000_000 }),
  message: z.string().trim().min(10, "Say a few words about what you'd like").max(1500),
});

export async function inviteCreator(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = inviteSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const campaign = await db.campaign.findUnique({ where: { id: d.campaignId }, include: { company: true } });
  if (!campaign) return fail("Campaign not found.", formData);
  const t = await teamMember(campaign.companyId);
  if (t.error) return fail(t.error, formData);
  if (campaign.status !== "OPEN") return fail("Open the campaign first. Drafts and closed campaigns can't take new creators.", formData);
  const creator = await db.user.findUnique({ where: { id: d.creatorId }, include: { creator: true } });
  if (!creator || creator.status !== "ACTIVE" || creator.creator?.status !== "APPROVED") return fail("That creator can't take deals right now.", formData);
  if (!creator.creator.acceptsCampaigns) return fail(`${creator.displayName} isn't taking campaigns right now.`, formData);
  if (creator.id === t.user.id) return fail("You can't invite yourself.", formData);
  const check = await checkText(d.message, null);
  if (check.blocked) return fail(check.message, formData);
  const rl = await rateLimit(`invite:${campaign.companyId}`, 40, 86400);
  if (!rl.ok) return fail("That's a lot of invites today. Try again tomorrow.", formData);

  const existing = await db.deal.findUnique({ where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: creator.id } } });
  if (existing && existing.status === "APPLIED") return fail(`${creator.displayName} already applied. Accept their application instead.`, formData);
  if (existing && !["DECLINED", "CANCELED"].includes(existing.status)) return fail(`${creator.displayName} is already on this campaign.`, formData);
  const now = new Date();
  const fields = { status: "INVITED" as const, priceCents: d.price, pitch: d.message, invitedAt: now, acceptedAt: null, canceledAt: null, companyId: campaign.companyId };
  const deal = existing
    ? await db.deal.update({ where: { id: existing.id }, data: fields })
    : await db.deal.create({ data: { ...fields, campaignId: campaign.id, creatorId: creator.id } });
  await audit(t.user.id, "deal.invite", { type: "deal", id: deal.id }, { price: d.price });
  await notify(creator.id, {
    type: "deal.invited",
    title: `${campaign.company.name} invited you to "${campaign.title}"`,
    body: `They offer ${money(d.price, { exact: true })}. ${d.message.slice(0, 200)}`,
    url: `/deals/${deal.id}`,
    email: "business",
    ctaLabel: "See the invite",
  });
  return success(`Invite sent to ${creator.displayName}.`);
}

async function dealForTeam(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { campaign: true, company: true, creator: true } });
  if (!deal) return { error: "Deal not found." as string, deal: null, user: null };
  const t = await teamMember(deal.companyId);
  if (t.error) return { error: t.error, deal: null, user: null };
  return { error: null, deal, user: t.user };
}

export async function decideApplication(_: ActionState, formData: FormData): Promise<ActionState> {
  const r = await dealForTeam(String(formData.get("dealId") ?? ""));
  if (r.error || !r.deal) return fail(r.error ?? "Deal not found.");
  const { deal, user } = r;
  const accept = formData.get("decision") === "accept";
  if (deal.status !== "APPLIED") return fail("This application was already answered.");
  if (accept && deal.campaign.status !== "OPEN") return fail("Open the campaign again to accept new creators.");
  await db.deal.update({ where: { id: deal.id }, data: accept ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "DECLINED" } });
  await audit(user!.id, accept ? "deal.accept" : "deal.decline", { type: "deal", id: deal.id });
  await notify(deal.creatorId, {
    type: accept ? "deal.accepted" : "deal.declined",
    title: accept ? `${deal.company.name} accepted you for "${deal.campaign.title}"` : `${deal.company.name} passed on your application`,
    body: accept ? `Your price was ${money(deal.priceCents, { exact: true })}. You'll hear from us when they pay in, then you can start.` : "Thanks for applying. Keep an eye out for other campaigns.",
    url: `/deals/${deal.id}`,
    email: "business",
  });
  if (accept) redirect(`/deals/${deal.id}`);
  await flash("Application declined.");
  refresh();
  return success("Application declined.");
}

/** The company pays the agreed price plus our 10% into the deal. The creator gets it once the work is approved. */
export async function payDeal(_: ActionState, formData: FormData): Promise<ActionState> {
  const r = await dealForTeam(String(formData.get("dealId") ?? ""));
  if (r.error || !r.deal) return fail(r.error ?? "Deal not found.");
  const { deal, user } = r;
  if (deal.status !== "ACCEPTED") return fail(deal.status === "FUNDED" || deal.status === "SUBMITTED" ? "This deal is already paid." : "This deal isn't ready to pay.");
  const path = businessPaymentPath();
  if (path === "off") return fail("Card payments aren't switched on yet. Please try again soon.");
  const rl = await rateLimit(`checkout:${user!.id}`, 20, 600);
  if (!rl.ok) return fail("Too many tries. Wait a few minutes and try again.");
  const totals = dealTotals(deal.priceCents);
  await db.order.updateMany({ where: { dealId: deal.id, status: "PENDING" }, data: { status: "CANCELED" } });
  const order = await db.order.create({
    data: {
      kind: "CAMPAIGN",
      buyerId: user!.id,
      companyId: deal.companyId,
      dealId: deal.id,
      description: `Campaign deal: ${deal.campaign.title}, with ${deal.creator.displayName}`,
      listCents: deal.priceCents,
      amountCents: totals.totalCents,
      feeType: "CAMPAIGN",
      feeBps: 1000,
      platformFeeCents: totals.feeCents,
      processingFeeCents: totals.processingCents,
      sellerNetCents: totals.creatorNetCents,
      provider: path === "stripe" ? "STRIPE" : "TEST",
    },
  });
  await audit(user!.id, "deal.pay_start", { type: "deal", id: deal.id }, { order: order.id });
  if (path === "test") redirect(`/checkout/test/${order.id}`);
  let url: string | null = null;
  try {
    const session = await createPlatformCheckoutSession({
      orderId: order.id,
      buyerEmail: user!.email,
      title: `Campaign deal with ${deal.creator.displayName}`,
      description: deal.campaign.title,
      amountCents: order.amountCents,
      successPath: `/checkout/success?order=${order.id}`,
      cancelPath: `/deals/${deal.id}`,
      metadata: { kind: "CAMPAIGN", dealId: deal.id },
    });
    await db.order.update({ where: { id: order.id }, data: { stripeCheckoutId: session.id } });
    url = session.url;
  } catch (err) {
    console.error("[deals] checkout", err);
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  }
  if (!url) return fail("We couldn't start the payment. Please try again in a minute.");
  redirect(url);
}

export async function approveDealWork(formData: FormData) {
  const r = await dealForTeam(String(formData.get("dealId") ?? ""));
  if (r.error || !r.deal) return;
  if (r.deal.status !== "SUBMITTED") {
    await flash("There's no work waiting for approval.", "error");
    return refresh();
  }
  const ok = await approveDeal(r.deal.id, r.user!.id, "company");
  await flash(ok ? `Approved. ${r.deal.creator.displayName} gets paid.` : "This deal was already handled.", ok ? "success" : "error");
  refresh();
}

export async function requestChanges(_: ActionState, formData: FormData): Promise<ActionState> {
  const r = await dealForTeam(String(formData.get("dealId") ?? ""));
  if (r.error || !r.deal) return fail(r.error ?? "Deal not found.");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 10) return fail("Say what needs to change (at least 10 characters).", formData, { note: ["At least 10 characters"] });
  if (r.deal.status !== "SUBMITTED") return fail("There's no work waiting for approval.");
  await db.deal.update({ where: { id: r.deal.id }, data: { status: "FUNDED", changesNote: note.slice(0, 1500) } });
  await audit(r.user!.id, "deal.changes", { type: "deal", id: r.deal.id });
  await notify(r.deal.creatorId, {
    type: "deal.changes",
    title: `${r.deal.company.name} asked for changes on "${r.deal.campaign.title}"`,
    body: note.slice(0, 300),
    url: `/deals/${r.deal.id}`,
    email: "business",
  });
  await flash("Sent. The creator can update the work and send it again.");
  refresh();
  return success("Sent.");
}

/** Before any money moves, either side can call it off. */
export async function cancelDealAsCompany(formData: FormData) {
  const r = await dealForTeam(String(formData.get("dealId") ?? ""));
  if (r.error || !r.deal) return;
  const deal = r.deal;
  if (!["INVITED", "ACCEPTED"].includes(deal.status)) {
    await flash(deal.status === "FUNDED" || deal.status === "SUBMITTED" ? "This deal is paid. Ask our team if something went wrong." : "This deal can't be canceled.", "error");
    return refresh();
  }
  await db.$transaction([
    db.deal.update({ where: { id: deal.id }, data: { status: "CANCELED", canceledAt: new Date() } }),
    db.order.updateMany({ where: { dealId: deal.id, status: "PENDING" }, data: { status: "CANCELED" } }),
  ]);
  await audit(r.user!.id, "deal.cancel", { type: "deal", id: deal.id });
  await notify(deal.creatorId, { type: "deal.canceled", title: `${deal.company.name} called off "${deal.campaign.title}"`, body: "No money had moved yet.", url: `/deals/${deal.id}` });
  await flash(deal.status === "INVITED" ? "Invite withdrawn." : "Deal canceled.");
  refresh();
}

