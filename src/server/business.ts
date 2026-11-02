import "server-only";
import type { CampaignStatus, CompanyCategory, FeaturedPlacement, MemberRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { absoluteUrl, env, features } from "@/lib/env";
import { categoryInfo } from "@/lib/constants";
import { FEATURED_LIMITS, FEATURED_PRICES, FEE_BPS, holdDaysFor, processingFee } from "@/lib/fees";
import { formatDate, money, orderNumber } from "@/lib/utils";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { notifyAdmins } from "@/server/admin";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { paymentIntentFor, refundPlatformPayment, transferToCreator } from "@/server/stripe";

const DAY = 86_400_000;

// ───────────────────────────── Work email checks ─────────────────────────────

/** Two-part endings where the company's own name sits one label further left (bigfirm.co.uk). */
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ltd.uk", "plc.uk", "com.au", "net.au", "co.nz", "co.za", "com.br", "com.mx", "co.jp", "com.sg", "com.hk",
  "com.cy", "com.tr", "co.in", "com.ar", "com.cn", "com.tw", "co.il", "com.my", "com.ph", "co.id", "com.vn", "com.ua", "com.pl",
]);

/** Hosts many unrelated sites share. A site on one of these can't be proven by an email address. */
const SHARED_HOSTS = [
  "vercel.app", "netlify.app", "github.io", "webflow.io", "wixsite.com", "squarespace.com", "carrd.co", "notion.site", "substack.com",
  "linktr.ee", "beehiiv.com", "framer.website", "framer.ai", "herokuapp.com", "pages.dev", "web.app", "firebaseapp.com", "myshopify.com",
];

/** Email providers anyone can sign up to, so they never prove where someone works. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de", "gmx.net", "mail.com",
  "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "tutanota.com", "tuta.io", "fastmail.com", "hey.com", "mail.ru",
  "web.de", "t-online.de", "orange.fr", "libero.it", "duck.com", "skiff.com",
]);

/** The part of a host name a company actually owns: "app.bigfirm.com" and "bigfirm.com" both give "bigfirm.com". */
export function ownedDomain(host: string) {
  const h = host.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export function emailDomain(email: string) {
  return email.split("@")[1]?.trim().toLowerCase() ?? "";
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** True when the email is on the same domain as the company's website, which proves the person works there. */
export function workEmailMatches(email: string, website: string) {
  const domain = emailDomain(email);
  const host = hostOf(website);
  if (!domain || !host || FREE_EMAIL_DOMAINS.has(domain)) return false;
  if (SHARED_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) return false;
  return ownedDomain(domain) === ownedDomain(host);
}

/** "bigfirm.com", for telling people which email address works. Empty when no email can prove it. */
export function claimDomain(website: string) {
  const host = hostOf(website);
  if (!host || SHARED_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) return "";
  return ownedDomain(host);
}

// ───────────────────────────── Claims ─────────────────────────────

/**
 * Puts the person on the company's team. The first person in runs the listing (owner);
 * people who join later are members, and the owner hears about it.
 */
export async function approveClaim(claimId: string, actorId: string | null, how: "email" | "staff") {
  const claim = await db.companyClaim.findUnique({ where: { id: claimId }, include: { company: true, user: true } });
  if (!claim || claim.status !== "PENDING") return null;
  const now = new Date();
  const hasOwner = (await db.businessMember.count({ where: { companyId: claim.companyId, role: "OWNER" } })) > 0;
  const role: MemberRole = hasOwner ? "MEMBER" : "OWNER";
  const claimed = await db.companyClaim.updateMany({
    where: { id: claim.id, status: "PENDING" },
    data: { status: "APPROVED", reviewedAt: now, reviewedById: how === "staff" ? actorId : null, ...(how === "email" ? { workEmailVerifiedAt: now } : {}) },
  });
  if (!claimed.count) return null;
  await db.$transaction([
    db.businessMember.upsert({
      where: { companyId_userId: { companyId: claim.companyId, userId: claim.userId } },
      create: { companyId: claim.companyId, userId: claim.userId, role },
      update: {},
    }),
    db.company.update({ where: { id: claim.companyId }, data: { claimedAt: claim.company.claimedAt ?? now, verifiedAt: now } }),
    // Other open claims by the same person for this company are done too.
    db.companyClaim.updateMany({ where: { companyId: claim.companyId, userId: claim.userId, status: "PENDING", id: { not: claim.id } }, data: { status: "REJECTED", reviewNote: "Replaced by a newer claim." } }),
  ]);
  await audit(actorId ?? claim.userId, how === "email" ? "claim.verified" : "claim.approved", { type: "company", id: claim.companyId }, { claimId: claim.id, role });

  const dash = `/business/${claim.company.slug}`;
  await notify(claim.userId, {
    type: "claim.approved",
    title: `You now run ${claim.company.name} on TraderTrades`,
    body: "Keep your listing right, reply to reviews, post offers and reach traders from your business dashboard.",
    url: dash,
    email: "business",
    ctaLabel: "Open your dashboard",
  });
  if (hasOwner) {
    const owners = await db.businessMember.findMany({ where: { companyId: claim.companyId, role: { in: ["OWNER", "ADMIN"] }, userId: { not: claim.userId } }, select: { userId: true } });
    for (const o of owners) {
      await notify(o.userId, {
        type: "team.joined",
        title: `${claim.user.displayName} joined ${claim.company.name}'s team`,
        body: `They proved they work there with ${claim.workEmail}. You can remove them from your team page.`,
        url: `${dash}/team`,
        email: "business",
      });
    }
  }
  return { role, company: claim.company };
}

export async function rejectClaim(claimId: string, actorId: string, note: string) {
  const claim = await db.companyClaim.findUnique({ where: { id: claimId }, include: { company: true } });
  if (!claim || claim.status !== "PENDING") return false;
  await db.companyClaim.update({ where: { id: claim.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: actorId, reviewNote: note } });
  await audit(actorId, "claim.rejected", { type: "company", id: claim.companyId }, { claimId: claim.id, note });
  await notify(claim.userId, {
    type: "claim.rejected",
    title: `We couldn't confirm your claim for ${claim.company.name}`,
    body: note,
    url: `/business/claim?company=${claim.company.slug}`,
    email: "business",
    ctaLabel: "Try again",
  });
  return true;
}

// ───────────────────────────── Sponsored spots ─────────────────────────────

export const FEATURED_WEEKS_AHEAD = 8;
/** An unpaid booking holds its place this long, so two companies can't pay for the last spot at once. */
const HOLD_UNPAID_MS = 30 * 60_000;

/** Monday 00:00 UTC of the week that holds `d`. */
export function weekStart(d: Date) {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

export function featuredPrice(placement: FeaturedPlacement) {
  return placement === "HOME" ? FEATURED_PRICES.HOME : FEATURED_PRICES.CATEGORY;
}

export function featuredLimit(placement: FeaturedPlacement) {
  return placement === "HOME" ? FEATURED_LIMITS.HOME : FEATURED_LIMITS.CATEGORY;
}

export type FeaturedWeek = {
  start: Date;
  end: Date;
  /** For this week: the spot starts now and the price covers only the days left. */
  partial: boolean;
  priceCents: number;
  taken: number;
  limit: number;
  mine: boolean;
};

/** This week and the next eight, with how many spots are left in each. */
export async function featuredWeeks(placement: FeaturedPlacement, category: CompanyCategory | null, companyId: string, now = new Date()): Promise<FeaturedWeek[]> {
  const first = weekStart(now);
  const last = new Date(first.getTime() + (FEATURED_WEEKS_AHEAD + 1) * 7 * DAY);
  const slots = await db.featuredSlot.findMany({
    where: {
      placement,
      ...(placement === "CATEGORY" ? { category } : {}),
      startsAt: { lt: last },
      endsAt: { gt: first },
      OR: [{ status: { in: ["SCHEDULED", "ACTIVE"] } }, { status: "PENDING_PAYMENT", createdAt: { gt: new Date(now.getTime() - HOLD_UNPAID_MS) } }],
    },
    select: { companyId: true, startsAt: true, endsAt: true },
  });
  const weekly = featuredPrice(placement);
  const weeks: FeaturedWeek[] = [];
  for (let i = 0; i <= FEATURED_WEEKS_AHEAD; i++) {
    const start = new Date(first.getTime() + i * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const inWeek = slots.filter((s) => s.startsAt < end && s.endsAt > start);
    const partial = i === 0;
    const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / DAY));
    weeks.push({
      start: partial ? now : start,
      end,
      partial,
      priceCents: partial ? Math.round((weekly * Math.min(7, daysLeft)) / 7) : weekly,
      taken: inWeek.length,
      limit: featuredLimit(placement),
      mine: inWeek.some((s) => s.companyId === companyId),
    });
  }
  return weeks;
}

export function featuredPlaceLabel(placement: FeaturedPlacement, category: CompanyCategory | null) {
  return placement === "HOME" ? "Home page" : `Top of ${category ? categoryInfo(category).label : "a category"}`;
}

// ───────────────────────────── Deals ─────────────────────────────

/** A deal waiting for the company's OK is approved for them after this many days. */
export const DEAL_APPROVE_DAYS = 7;

/** What a deal costs the company and what the creator gets. Our 10% is added on top of the agreed price. */
export function dealTotals(priceCents: number) {
  const feeCents = Math.round((priceCents * FEE_BPS.CAMPAIGN) / 10000);
  const totalCents = priceCents + feeCents;
  const processingCents = processingFee(totalCents);
  return { priceCents, feeCents, totalCents, processingCents, creatorNetCents: Math.max(0, priceCents - processingCents) };
}

export const DEAL_STATUS: Record<string, { label: string; tone: string }> = {
  APPLIED: { label: "Applied", tone: "badge-outline" },
  INVITED: { label: "Invited", tone: "badge-outline" },
  ACCEPTED: { label: "Agreed, waiting for payment", tone: "badge-warn" },
  DECLINED: { label: "Declined", tone: "badge-outline" },
  FUNDED: { label: "Paid in, work in progress", tone: "badge-info" },
  SUBMITTED: { label: "Work sent, waiting for approval", tone: "badge-warn" },
  APPROVED: { label: "Approved and paid", tone: "badge-ok" },
  PAID: { label: "Paid out", tone: "badge-ok" },
  CANCELED: { label: "Canceled", tone: "badge-outline" },
};

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "badge-outline" },
  OPEN: { label: "Open", tone: "badge-ok" },
  CLOSED: { label: "Closed", tone: "badge-outline" },
  COMPLETED: { label: "Done", tone: "badge-outline" },
  REMOVED: { label: "Taken down", tone: "badge-bad" },
};

/** The business side of a paid order: a Sponsored spot or money paid into a deal. Safe to call twice. */
export async function completeBusinessOrder(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { buyer: true, featuredSlot: { include: { company: true } }, deal: { include: { campaign: true, company: true, creator: true } } } });
  if (!order) return;
  const ref = orderNumber(order.number);
  const now = order.paidAt ?? new Date();

  if (order.kind === "FEATURED" && order.featuredSlot) {
    const slot = order.featuredSlot;
    await db.featuredSlot.updateMany({
      where: { id: slot.id, status: "PENDING_PAYMENT" },
      data: { status: slot.startsAt <= now ? "ACTIVE" : "SCHEDULED" },
    });
    const place = featuredPlaceLabel(slot.placement, slot.category);
    await audit(order.buyerId, "featured.booked", { type: "company", id: slot.companyId }, { slotId: slot.id, placement: slot.placement, category: slot.category });
    await sendEmail(
      order.buyer.email,
      emails.generic({
        subject: `Receipt: Sponsored spot for ${slot.company.name}`,
        heading: "Your Sponsored spot is booked",
        body: [`${slot.company.name} shows as Sponsored (${place.toLowerCase()}) from ${formatDate(slot.startsAt)} to ${formatDate(new Date(slot.endsAt.getTime() - 1))}.`],
        rows: [
          ["Order", ref],
          ["Spot", place],
          ["Paid", money(order.amountCents, { exact: true })],
        ],
        cta: { label: "See your spots", url: absoluteUrl(`/business/${slot.company.slug}/featured`) },
      }),
      { template: "featured-receipt", userId: order.buyerId },
    ).catch((e) => console.error("[business] receipt", e));
    return;
  }

  if (order.kind === "CAMPAIGN" && order.deal) {
    const deal = order.deal;
    const moved = await db.deal.updateMany({ where: { id: deal.id, status: "ACCEPTED" }, data: { status: "FUNDED", fundedAt: now } });
    if (!moved.count) return;
    await audit(order.buyerId, "deal.funded", { type: "deal", id: deal.id }, { order: ref, amount: order.amountCents });
    await notify(deal.creatorId, {
      type: "deal.funded",
      title: `${deal.company.name} paid in for "${deal.campaign.title}"`,
      body: `${money(deal.priceCents, { exact: true })} is waiting for you. Make the content, then send the links from the deal page.`,
      url: `/deals/${deal.id}`,
      email: "business",
      ctaLabel: "Open the deal",
    });
    await sendEmail(
      order.buyer.email,
      emails.generic({
        subject: `Receipt: deal with ${deal.creator.displayName}`,
        heading: "Payment received",
        body: [`The money is held until you approve ${deal.creator.displayName}'s work. If they don't deliver, you get it back.`],
        rows: [
          ["Order", ref],
          ["Campaign", deal.campaign.title],
          ["Creator's price", money(deal.priceCents, { exact: true })],
          ["TraderTrades fee (10%)", money(order.platformFeeCents, { exact: true })],
          ["Paid", money(order.amountCents, { exact: true })],
        ],
        cta: { label: "Open the deal", url: absoluteUrl(`/deals/${deal.id}`) },
      }),
      { template: "deal-receipt", userId: order.buyerId },
    ).catch((e) => console.error("[business] receipt", e));
  }
}

async function paidDealOrder(dealId: string) {
  return db.order.findFirst({ where: { dealId, kind: "CAMPAIGN", status: { in: ["PAID", "PARTIALLY_REFUNDED", "DISPUTED"] } }, orderBy: { createdAt: "desc" } });
}

/**
 * The company approved the work (or the time to answer ran out, or our team decided): the creator's share goes to
 * their balance and pays out after the usual hold.
 */
export async function approveDeal(dealId: string, actorId: string | null, how: "company" | "auto" | "staff", note?: string | null) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { campaign: true, company: true, creator: { include: { creator: true } } } });
  if (!deal || (deal.status !== "SUBMITTED" && deal.status !== "FUNDED")) return false;
  const order = await paidDealOrder(deal.id);
  if (!order) return false;
  const now = new Date();
  const moved = await db.deal.updateMany({
    where: { id: deal.id, status: { in: ["SUBMITTED", "FUNDED"] } },
    data: {
      status: "APPROVED",
      approvedAt: now,
      changesNote: null,
      ...(how === "staff" ? { resolvedAt: now, resolvedById: actorId, resolutionNote: note ?? null } : deal.disputedAt && !deal.resolvedAt ? { resolvedAt: now, resolutionNote: "The company approved the work." } : {}),
    },
  });
  if (!moved.count) return false;

  const availableAt = new Date(now.getTime() + holdDaysFor(deal.creator.creator?.approvedAt) * DAY);
  const ref = orderNumber(order.number);
  await db.$transaction([
    db.ledgerEntry.create({
      data: { userId: deal.creatorId, orderId: order.id, type: "CAMPAIGN", amountCents: deal.priceCents, description: `Campaign: ${deal.campaign.title} (${ref})`, availableAt },
    }),
    ...(order.processingFeeCents
      ? [db.ledgerEntry.create({ data: { userId: deal.creatorId, orderId: order.id, type: "PROCESSING_FEE", amountCents: -order.processingFeeCents, description: `Card processing ${ref}`, availableAt } })]
      : []),
    db.order.update({ where: { id: order.id }, data: { availableAt } }),
  ]);

  // Card payments: move the creator's share to their Stripe account now that the work is approved.
  if (order.provider === "STRIPE" && features.stripe && deal.creator.creator?.stripeAccountId) {
    try {
      const pi = await paymentIntentFor(order);
      if (pi) await transferToCreator({ paymentIntentId: pi, amountCents: order.sellerNetCents, destination: deal.creator.creator.stripeAccountId, orderId: order.id });
    } catch (err) {
      console.error("[deals] transfer failed", err);
      await notifyAdmins({ type: "deal.transfer_failed", title: `Transfer to @${deal.creator.username} failed for ${ref}`, body: "The deal is approved but Stripe didn't move the money. Retry it from Stripe.", url: `/admin/orders?q=${ref}` });
    }
  }

  await audit(actorId, how === "auto" ? "deal.auto_approved" : how === "staff" ? "deal.dispute_paid" : "deal.approved", { type: "deal", id: deal.id }, { order: ref });
  await notify(deal.creatorId, {
    type: "deal.approved",
    title: how === "auto" ? `"${deal.campaign.title}" was approved automatically` : `${deal.company.name} approved your work`,
    body: `${money(order.sellerNetCents, { exact: true })} is in your balance (after card processing). It can be paid out from ${formatDate(availableAt)}.`,
    url: `/deals/${deal.id}`,
    email: "business",
  });
  if (how !== "company") {
    const team = await db.businessMember.findMany({ where: { companyId: deal.companyId }, select: { userId: true } });
    for (const m of team) {
      await notify(m.userId, {
        type: "deal.approved",
        title: how === "auto" ? `Approved automatically: ${deal.creator.displayName}'s work` : `Our team paid ${deal.creator.displayName} for "${deal.campaign.title}"`,
        body: how === "auto" ? `Nobody answered within ${DEAL_APPROVE_DAYS} days, so the work was approved and the creator was paid.` : (note ?? undefined),
        url: `/deals/${deal.id}`,
        email: "business",
      });
    }
  }
  return true;
}

/** Cancels a paid deal and gives the company all its money back, our fee included. */
export async function refundDeal(dealId: string, actorId: string | null, reason: string, by: "creator" | "staff") {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { campaign: true, company: true, creator: true } });
  if (!deal || (deal.status !== "FUNDED" && deal.status !== "SUBMITTED")) return false;
  const order = await paidDealOrder(deal.id);
  const now = new Date();
  const moved = await db.deal.updateMany({
    where: { id: deal.id, status: { in: ["FUNDED", "SUBMITTED"] } },
    data: {
      status: "CANCELED",
      canceledAt: now,
      ...(by === "staff" || (deal.disputedAt && !deal.resolvedAt) ? { resolvedAt: now, resolvedById: by === "staff" ? actorId : null, resolutionNote: reason } : {}),
    },
  });
  if (!moved.count) return false;
  if (order) {
    const amount = order.amountCents - order.refundedCents;
    try {
      if (order.provider === "STRIPE" && amount > 0) {
        const pi = await paymentIntentFor(order);
        if (!pi) throw new Error("We couldn't find this payment at Stripe");
        await refundPlatformPayment({ paymentIntentId: pi, amountCents: amount, orderId: order.id });
      }
    } catch (err) {
      // Put the deal back so nobody thinks the money went back when it didn't.
      await db.deal.update({ where: { id: deal.id }, data: { status: deal.status, canceledAt: null, resolvedAt: deal.resolvedAt, resolvedById: deal.resolvedById, resolutionNote: deal.resolutionNote } });
      throw err;
    }
    await db.order.update({ where: { id: order.id }, data: { refundedCents: order.amountCents, status: "REFUNDED" } });
  }
  await audit(actorId, by === "staff" ? "deal.dispute_refunded" : "deal.canceled_refunded", { type: "deal", id: deal.id }, { reason });
  const team = await db.businessMember.findMany({ where: { companyId: deal.companyId }, select: { userId: true } });
  for (const m of team) {
    await notify(m.userId, {
      type: "deal.refunded",
      title: `Refund on your deal with ${deal.creator.displayName}`,
      body: `${order ? money(order.amountCents, { exact: true }) : "The money"} is on its way back to your card. ${reason}`,
      url: `/deals/${deal.id}`,
      email: "business",
    });
  }
  await notify(deal.creatorId, {
    type: "deal.canceled",
    title: `"${deal.campaign.title}" was canceled`,
    body: by === "staff" ? `Our team refunded ${deal.company.name}. ${reason}` : "You canceled the deal, so the company got its money back.",
    url: `/deals/${deal.id}`,
    email: by === "staff" ? "business" : undefined,
  });
  return true;
}

// ───────────────────────────── Sponsored spot refunds ─────────────────────────────

/** Ends a Sponsored spot early (or before it starts). With `refund`, the company gets back the unused part. */
export async function cancelFeaturedSlot(slotId: string, actorId: string, reason: string, refund: boolean) {
  const slot = await db.featuredSlot.findUnique({ where: { id: slotId }, include: { company: true, orders: { where: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } } } });
  if (!slot || slot.status === "CANCELED" || slot.status === "ENDED") return null;
  const now = new Date();
  const order = slot.orders[0] ?? null;
  let refunded = 0;
  if (refund && order) {
    // Unused days come back. Before it starts, that's everything.
    const total = slot.endsAt.getTime() - slot.startsAt.getTime();
    const left = Math.max(0, slot.endsAt.getTime() - Math.max(now.getTime(), slot.startsAt.getTime()));
    refunded = Math.min(order.amountCents - order.refundedCents, Math.round((order.amountCents * left) / total));
    if (refunded > 0) {
      if (order.provider === "STRIPE") {
        const pi = await paymentIntentFor(order);
        if (!pi) throw new Error("We couldn't find this payment at Stripe");
        await refundPlatformPayment({ paymentIntentId: pi, amountCents: refunded, orderId: order.id });
      }
      const total2 = order.refundedCents + refunded;
      await db.order.update({ where: { id: order.id }, data: { refundedCents: total2, status: total2 >= order.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    }
  }
  await db.featuredSlot.update({ where: { id: slot.id }, data: { status: "CANCELED", endsAt: slot.startsAt > now ? slot.endsAt : now } });
  await audit(actorId, "featured.canceled", { type: "company", id: slot.companyId }, { slotId: slot.id, refunded, reason });
  const team = await db.businessMember.findMany({ where: { companyId: slot.companyId }, select: { userId: true } });
  for (const m of team) {
    await notify(m.userId, {
      type: "featured.canceled",
      title: `Our team ended your Sponsored spot (${featuredPlaceLabel(slot.placement, slot.category).toLowerCase()})`,
      body: `${reason}${refunded ? ` ${money(refunded, { exact: true })} is on its way back to your card.` : ""}`,
      url: `/business/${slot.company.slug}/featured`,
      email: "business",
    });
  }
  return { refunded };
}

/** Staff refund of a whole Sponsored spot order (a mistake, a complaint): everything left goes back and the spot ends. */
export async function refundFeaturedOrder(orderId: string, actorId: string, reason: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { featuredSlot: { include: { company: true } } } });
  if (!order || order.kind !== "FEATURED" || (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED")) return null;
  const amount = order.amountCents - order.refundedCents;
  if (amount <= 0) return null;
  if (order.provider === "STRIPE") {
    const pi = await paymentIntentFor(order);
    if (!pi) throw new Error("We couldn't find this payment at Stripe");
    await refundPlatformPayment({ paymentIntentId: pi, amountCents: amount, orderId: order.id });
  }
  const now = new Date();
  await db.order.update({ where: { id: order.id }, data: { refundedCents: order.amountCents, status: "REFUNDED" } });
  const slot = order.featuredSlot;
  if (slot && slot.status !== "CANCELED" && slot.status !== "ENDED") {
    await db.featuredSlot.update({ where: { id: slot.id }, data: { status: "CANCELED", endsAt: slot.startsAt > now ? slot.endsAt : now } });
  }
  await audit(actorId, "featured.refunded", { type: "order", id: order.id }, { amount, reason });
  if (slot) {
    const team = await db.businessMember.findMany({ where: { companyId: slot.companyId }, select: { userId: true } });
    for (const m of team) {
      await notify(m.userId, {
        type: "featured.refunded",
        title: `Refund on your Sponsored spot (${featuredPlaceLabel(slot.placement, slot.category).toLowerCase()})`,
        body: `${money(amount, { exact: true })} is on its way back to your card. ${reason}`,
        url: `/business/${slot.company.slug}/featured`,
        email: "business",
      });
    }
  }
  return { refunded: amount };
}

/** A refund made in the Stripe dashboard: the deal or Sponsored spot it paid for stops too. */
export async function afterOutsideRefund(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { featuredSlot: true } });
  if (!order || order.status !== "REFUNDED") return;
  const now = new Date();
  if (order.kind === "CAMPAIGN" && order.dealId) {
    await db.deal.updateMany({ where: { id: order.dealId, status: { in: ["FUNDED", "SUBMITTED"] } }, data: { status: "CANCELED", canceledAt: now } });
  }
  if (order.kind === "FEATURED" && order.featuredSlot && ["PENDING_PAYMENT", "SCHEDULED", "ACTIVE"].includes(order.featuredSlot.status)) {
    const slot = order.featuredSlot;
    await db.featuredSlot.update({ where: { id: slot.id }, data: { status: "CANCELED", endsAt: slot.startsAt > now ? slot.endsAt : now } });
  }
}

// ───────────────────────────── Daily upkeep ─────────────────────────────

/** Approves deals nobody answered, moves Sponsored spots along, and closes jobs that ran out. */
export async function businessUpkeep(now = new Date()) {
  const dueBefore = new Date(now.getTime() - DEAL_APPROVE_DAYS * DAY);
  // While our team is looking at a disagreement, nothing is approved automatically.
  const waiting = await db.deal.findMany({
    where: { status: "SUBMITTED", submittedAt: { lt: dueBefore }, OR: [{ disputedAt: null }, { resolvedAt: { not: null } }] },
    select: { id: true },
    take: 200,
  });
  let approved = 0;
  for (const d of waiting) if (await approveDeal(d.id, null, "auto")) approved++;

  const [started, ended, unpaid] = await Promise.all([
    db.featuredSlot.updateMany({ where: { status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } }, data: { status: "ACTIVE" } }),
    db.featuredSlot.updateMany({ where: { status: { in: ["SCHEDULED", "ACTIVE"] }, endsAt: { lte: now } }, data: { status: "ENDED" } }),
    db.featuredSlot.updateMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(now.getTime() - DAY) } }, data: { status: "CANCELED" } }),
  ]);

  const expired = await db.jobPost.findMany({ where: { status: "OPEN", expiresAt: { lt: now } }, select: { id: true, title: true, posterId: true } });
  if (expired.length) {
    await db.jobPost.updateMany({ where: { id: { in: expired.map((j) => j.id) } }, data: { status: "CLOSED" } });
    for (const j of expired) {
      await notify(j.posterId, { type: "job.expired", title: `Your job post "${j.title}" closed`, body: "Job posts close after 60 days. Reopen it if you're still hiring.", url: `/jobs/${j.id}` });
    }
  }
  return { dealsAutoApproved: approved, featured: { started: started.count, ended: ended.count, unpaidCanceled: unpaid.count }, jobsClosed: expired.length };
}

/** For the demo checkout. Business payments go through the same test card page as everything else. */
export function businessPaymentPath(): "stripe" | "test" | "off" {
  if (features.stripe) return "stripe";
  return env.demoMode ? "test" : "off";
}
