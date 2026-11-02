"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { dollars, fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { money } from "@/lib/utils";
import { companyRole, requireCreator, requireVerifiedUser } from "@/server/dal";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { notifyAdmins } from "@/server/admin";
import { checkText } from "@/server/moderation";
import { rateLimit } from "@/server/rate-limit";
import { DEAL_APPROVE_DAYS, refundDeal } from "@/server/business";

const id = z.string().min(1).max(60);

async function tellTeam(companyId: string, n: { type: string; title: string; body?: string; url: string; ctaLabel?: string }) {
  const team = await db.businessMember.findMany({ where: { companyId }, select: { userId: true } });
  for (const m of team) await notify(m.userId, { ...n, email: "business" });
}

// ───────────────────────────── Applying ─────────────────────────────

const applySchema = z.object({
  campaignId: id,
  price: dollars({ min: 1000, max: 10_000_000 }),
  pitch: z.string().trim().min(20, "Say why you're a good fit (at least 20 characters)").max(1500, "1,500 characters at most"),
});

/** A creator applies to an open campaign with their price and a short pitch. */
export async function applyToCampaign(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  const parsed = applySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const campaign = await db.campaign.findUnique({ where: { id: d.campaignId }, include: { company: true } });
  if (!campaign || campaign.status !== "OPEN" || campaign.company.status !== "PUBLISHED") return fail("This campaign isn't taking applications any more.", formData);
  if (campaign.deadline && campaign.deadline < new Date(new Date().setHours(0, 0, 0, 0))) return fail("The live-by date for this campaign has passed.", formData);
  if (await companyRole(campaign.companyId, { id: user.id, isAdmin: false })) return fail("You're on this company's team, so you can't apply to its campaigns.", formData);
  const existing = await db.deal.findUnique({ where: { campaignId_creatorId: { campaignId: campaign.id, creatorId: user.id } } });
  if (existing?.status === "INVITED") redirect(`/deals/${existing.id}`);
  if (existing?.status === "DECLINED") return fail(`${campaign.company.name} already answered on this campaign. Look out for the next one.`, formData);
  if (existing && existing.status !== "CANCELED") redirect(`/deals/${existing.id}`);
  const check = await checkText(d.pitch, null);
  if (check.blocked) return fail(check.message, formData);
  const rl = await rateLimit(`apply:${user.id}`, 30, 86400);
  if (!rl.ok) return fail("That's a lot of applications today. Try again tomorrow.", formData);

  const fields = { status: "APPLIED" as const, priceCents: d.price, pitch: d.pitch, invitedAt: null, acceptedAt: null, canceledAt: null, companyId: campaign.companyId };
  const deal = existing
    ? await db.deal.update({ where: { id: existing.id }, data: fields })
    : await db.deal.create({ data: { ...fields, campaignId: campaign.id, creatorId: user.id } });
  await audit(user.id, "deal.apply", { type: "deal", id: deal.id }, { price: d.price });
  await tellTeam(campaign.companyId, {
    type: "deal.applied",
    title: `${user.displayName} applied to "${campaign.title}"`,
    body: `Their price: ${money(d.price, { exact: true })}. ${d.pitch.slice(0, 200)}`,
    url: `/business/${campaign.company.slug}/campaigns/${campaign.id}`,
    ctaLabel: "See the application",
  });
  await flash(`Applied. ${campaign.company.name} will answer here.`);
  redirect(`/deals/${deal.id}`);
}

async function myDeal(formData: FormData) {
  const user = await requireVerifiedUser();
  const deal = await db.deal.findUnique({ where: { id: String(formData.get("dealId") ?? "") }, include: { campaign: true, company: true } });
  if (!deal || deal.creatorId !== user.id) return null;
  return { user, deal };
}

export async function withdrawApplication(formData: FormData) {
  const r = await myDeal(formData);
  if (!r) return;
  if (r.deal.status !== "APPLIED") {
    await flash("This application was already answered.", "error");
    return refresh();
  }
  await db.deal.update({ where: { id: r.deal.id }, data: { status: "CANCELED", canceledAt: new Date() } });
  await audit(r.user.id, "deal.withdraw", { type: "deal", id: r.deal.id });
  await flash("Application withdrawn.");
  refresh();
}

/** A creator answers a company's invite. Saying yes agrees the price; the company then pays in. */
export async function answerInvite(_: ActionState, formData: FormData): Promise<ActionState> {
  const r = await myDeal(formData);
  if (!r) return fail("Deal not found.");
  const { deal, user } = r;
  const accept = formData.get("decision") === "accept";
  if (deal.status !== "INVITED") return fail("This invite was already answered.");
  if (accept) {
    if (user.creator?.status !== "APPROVED" || user.status !== "ACTIVE") return fail("Your account can't take deals right now.");
    if (deal.campaign.status === "REMOVED") return fail("Our team took this campaign down, so it can't go ahead.");
  }
  await db.deal.update({ where: { id: deal.id }, data: accept ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "DECLINED" } });
  await audit(user.id, accept ? "deal.invite_accept" : "deal.invite_decline", { type: "deal", id: deal.id });
  await tellTeam(deal.companyId, {
    type: accept ? "deal.accepted" : "deal.declined",
    title: accept ? `${user.displayName} said yes to "${deal.campaign.title}"` : `${user.displayName} passed on "${deal.campaign.title}"`,
    body: accept ? `Pay ${money(deal.priceCents, { exact: true })} plus our 10% into the deal so they can start.` : undefined,
    url: `/deals/${deal.id}`,
    ctaLabel: accept ? "Pay into the deal" : undefined,
  });
  await flash(accept ? `You're in. We'll tell you when ${deal.company.name} pays in, then you can start.` : "Invite declined.");
  refresh();
  return success(accept ? "Accepted." : "Declined.");
}

// ───────────────────────────── Doing the work ─────────────────────────────

const workSchema = z.object({
  dealId: id,
  links: z
    .array(
      z
        .string()
        .trim()
        .max(500)
        .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
        .pipe(z.url({ protocol: /^https$/, error: "Links have to start with https://" })),
    )
    .min(1, "Add a link to what you made")
    .max(5, "5 links at most"),
  note: optionalText(1500),
});

/** The creator sends links to the finished work. The company approves it (or it's approved for them after a week). */
export async function submitDealWork(_: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData, ["links"]);
  const links = (raw.links as string[] | undefined)?.map((l) => l.trim()).filter(Boolean) ?? [];
  const parsed = workSchema.safeParse({ ...raw, links });
  if (!parsed.success) return invalid(parsed.error, formData);
  const r = await myDeal(formData);
  if (!r) return fail("Deal not found.");
  const { deal, user } = r;
  if (deal.status !== "FUNDED") return fail(deal.status === "SUBMITTED" ? "You already sent the work. Wait for their answer." : "This deal isn't paid in yet, so there's nothing to send.");
  if (parsed.data.note) {
    const check = await checkText(parsed.data.note, null);
    if (check.blocked) return fail(check.message, formData);
  }
  const again = Boolean(deal.submittedAt);
  await db.deal.update({
    where: { id: deal.id },
    data: { status: "SUBMITTED", submissionUrl: parsed.data.links.join("\n"), submissionNote: parsed.data.note ?? null, submittedAt: new Date(), changesNote: null },
  });
  await audit(user.id, "deal.submit", { type: "deal", id: deal.id }, { links: parsed.data.links.length });
  await tellTeam(deal.companyId, {
    type: "deal.submitted",
    title: `${user.displayName} ${again ? "sent the updated work" : "sent the work"} for "${deal.campaign.title}"`,
    body: `Approve it or ask for changes. If nobody answers within ${DEAL_APPROVE_DAYS} days, it's approved and the creator is paid.`,
    url: `/deals/${deal.id}`,
    ctaLabel: "Check the work",
  });
  // The form goes away once the page refreshes, so the confirmation travels as a flash message.
  const sent = `Sent. ${deal.company.name} has ${DEAL_APPROVE_DAYS} days to approve it or ask for changes.`;
  await flash(sent);
  refresh();
  return success(sent);
}

/** The creator pulls out. Before money moves it just ends; after, the company gets everything back. */
export async function cancelDealAsCreator(formData: FormData) {
  const r = await myDeal(formData);
  if (!r) return;
  const { deal, user } = r;
  if (deal.status === "ACCEPTED") {
    await db.$transaction([
      db.deal.update({ where: { id: deal.id }, data: { status: "CANCELED", canceledAt: new Date() } }),
      db.order.updateMany({ where: { dealId: deal.id, status: "PENDING" }, data: { status: "CANCELED" } }),
    ]);
    await audit(user.id, "deal.cancel", { type: "deal", id: deal.id });
    await tellTeam(deal.companyId, { type: "deal.canceled", title: `${user.displayName} pulled out of "${deal.campaign.title}"`, body: "No money had moved yet.", url: `/deals/${deal.id}` });
    await flash("Deal canceled.");
    return refresh();
  }
  if (deal.status === "FUNDED") {
    try {
      const ok = await refundDeal(deal.id, user.id, `${user.displayName} canceled the deal.`, "creator");
      await flash(ok ? `Deal canceled. ${deal.company.name} gets its money back.` : "This deal was already handled.", ok ? "success" : "error");
    } catch (err) {
      console.error("[deals] creator cancel", err);
      await flash("The refund didn't go through, so the deal is still on. Try again, or ask our team.", "error");
    }
    return refresh();
  }
  await flash(deal.status === "SUBMITTED" ? "You've sent the work, so it can't be canceled now. If something's wrong, ask our team to step in." : "This deal can't be canceled.", "error");
  refresh();
}

// ───────────────────────────── Disagreements ─────────────────────────────

/** Either side asks our team to decide. Automatic approval waits while we look. */
export async function disputeDeal(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = z
    .object({ dealId: id, note: z.string().trim().min(20, "Tell us what went wrong (at least 20 characters)").max(2000, "2,000 characters at most") })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const deal = await db.deal.findUnique({ where: { id: parsed.data.dealId }, include: { campaign: true, company: true, creator: true } });
  if (!deal) return fail("Deal not found.");
  const isCreator = deal.creatorId === user.id;
  const isTeam = !isCreator && Boolean(await companyRole(deal.companyId, { id: user.id, isAdmin: false }));
  if (!isCreator && !isTeam) return fail("Deal not found.");
  if (deal.status !== "FUNDED" && deal.status !== "SUBMITTED") return fail("Our team can only step in while the money is held in the deal.");
  if (deal.disputedAt && !deal.resolvedAt) return fail("Our team is already looking at this deal.");
  const rl = await rateLimit(`deal-dispute:${user.id}`, 5, 86400);
  if (!rl.ok) return fail("Too many requests today. Our team will be in touch.");

  await db.deal.update({
    where: { id: deal.id },
    data: { disputedAt: new Date(), disputedById: user.id, disputeNote: parsed.data.note, resolvedAt: null, resolvedById: null, resolutionNote: null },
  });
  await audit(user.id, "deal.dispute", { type: "deal", id: deal.id });
  await notifyAdmins({ type: "deal.dispute", title: `Deal dispute: "${deal.campaign.title}"`, body: `${deal.company.name} and @${deal.creator.username}. ${parsed.data.note.slice(0, 200)}`, url: "/admin/deals" });
  const other = { type: "deal.dispute", title: `Our team is looking at "${deal.campaign.title}"`, body: `${isCreator ? deal.creator.displayName : deal.company.name} asked us to step in: ${parsed.data.note.slice(0, 200)}`, url: `/deals/${deal.id}` };
  if (isCreator) await tellTeam(deal.companyId, other);
  else await notify(deal.creatorId, { ...other, email: "business" });
  const sent = "Sent to our team. We'll look at both sides and usually decide within 2 working days. The money stays held until then.";
  await flash(sent);
  refresh();
  return success(sent);
}
