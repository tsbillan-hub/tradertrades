"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { BillingInterval, ProductType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { checkbox, dollars, fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { PLATFORMS, productTypeInfo } from "@/lib/constants";
import { STARTER_INCLUDES, productSettings } from "@/lib/product-settings";
import { zonedToUtc } from "@/lib/time";
import { productPath } from "@/lib/paths";
import { slugify } from "@/lib/utils";
import { requireCreator } from "@/server/dal";
import { checkText } from "@/server/moderation";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { sendEmail } from "@/server/email/send";
import { emails } from "@/server/email/templates";
import { syncPriceFrom } from "@/server/commerce/pricing";
import { publishBlockers } from "@/server/commerce/publish";

const TYPE = z.enum(["COMMUNITY", "COURSE", "MENTORING", "ALERTS", "INDICATOR", "DOWNLOAD", "EVENT"]);
const MARKET = z.enum(["FUTURES", "FOREX", "CRYPTO", "STOCKS", "OPTIONS"]);
const LEVEL = z.enum(["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"]);

/** A starting price so a new listing isn't blank. Creators change it before publishing. */
const STARTER_PRICE: Record<ProductType, { label: string; amountCents: number; interval: BillingInterval; sessions?: number }> = {
  COMMUNITY: { label: "Monthly", amountCents: 4900, interval: "MONTH" },
  COURSE: { label: "Full course", amountCents: 9900, interval: "ONE_TIME" },
  MENTORING: { label: "One call", amountCents: 15000, interval: "ONE_TIME", sessions: 1 },
  ALERTS: { label: "Monthly", amountCents: 5900, interval: "MONTH" },
  INDICATOR: { label: "Lifetime access", amountCents: 7900, interval: "ONE_TIME" },
  DOWNLOAD: { label: "Download", amountCents: 1900, interval: "ONE_TIME" },
  EVENT: { label: "Ticket", amountCents: 2900, interval: "ONE_TIME" },
};

async function ownProduct(productId: string) {
  const user = await requireCreator();
  const product = await db.product.findUnique({ where: { id: productId }, include: { prices: true } });
  if (!product || (product.creatorId !== user.id && !user.isAdmin)) return { user, product: null };
  return { user, product };
}

async function uniqueSlug(creatorId: string, base: string, exceptId?: string) {
  const root = slugify(base) || "product";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.product.findFirst({ where: { creatorId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createProduct(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  if (user.status !== "ACTIVE") return fail("Your account can't sell right now.");
  const parsed = z
    .object({
      type: TYPE,
      title: z.string().trim().min(3, "Give it a name").max(90, "Keep it under 90 characters"),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { type, title } = parsed.data;

  const check = await checkText(title, null);
  if (check.blocked) return fail(check.message, formData, { title: ["Reword this"] });

  const count = await db.product.count({ where: { creatorId: user.id, status: { not: "ARCHIVED" } } });
  if (count >= 50) return fail("You can have up to 50 products. Archive old ones to add more.");

  const starter = STARTER_PRICE[type];
  const product = await db.product.create({
    data: {
      creatorId: user.id,
      type,
      title,
      slug: await uniqueSlug(user.id, title),
      markets: user.creator.markets,
      includes: STARTER_INCLUDES[type],
      settings: productSettings(null),
      refundDays: 7,
      priceFromCents: starter.amountCents,
      prices: { create: [{ label: starter.label, amountCents: starter.amountCents, interval: starter.interval, sessions: starter.sessions ?? null }] },
      ...(type === "COMMUNITY"
        ? {
            channels: {
              create: [
                { name: "Announcements", slug: "announcements", kind: "ANNOUNCEMENTS", postingPolicy: "OWNER", position: 0, description: "News and updates from the host" },
                { name: "General", slug: "general", kind: "CHAT", postingPolicy: "MEMBERS", position: 1, description: "Talk with other members" },
                { name: "Resources", slug: "resources", kind: "RESOURCES", postingPolicy: "OWNER", position: 2, description: "Guides, files and recordings" },
              ],
            },
          }
        : type === "ALERTS"
          ? {
              channels: {
                create: [
                  { name: "Alerts", slug: "alerts", kind: "ALERTS", postingPolicy: "OWNER", position: 0, description: "Time stamped trade ideas" },
                  { name: "Discussion", slug: "discussion", kind: "CHAT", postingPolicy: "MEMBERS", position: 1, description: "Talk about the alerts" },
                ],
              },
            }
          : {}),
    },
  });
  await audit(user.id, "product.create", { type: "product", id: product.id }, { type });
  redirect(`/creator/products/${product.id}`);
}

const detailsSchema = z.object({
  productId: z.string().min(1),
  title: z.string().trim().min(3, "Give it a name").max(90, "Keep it under 90 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60, "60 characters at most")
    .regex(/^[a-z0-9-]*$/, "Use lowercase letters, numbers and dashes"),
  subtitle: optionalText(140),
  description: z.string().trim().max(20000, "That's too long").optional().default(""),
  coverUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || v.startsWith("/api/media/") || /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(v), "Upload the image again")
    .optional()
    .default(""),
  trailerId: z.string().trim().optional().default(""),
  markets: z.array(MARKET).max(5),
  level: LEVEL,
  tags: z.string().trim().max(300).optional().default(""),
  platforms: z.array(z.string()).max(PLATFORMS.length),
  includes: z.string().max(2000).optional().default(""),
  refundDays: z.coerce.number().int().min(0, "Can't be negative").max(30, "30 days at most"),
  memberLimit: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1, "At least 1").max(100000).nullable()),
  launchState: z.enum(["OPEN", "WAITLIST"]),
  startsAt: z.string().trim().optional().default(""),
  // Type settings
  durationMin: z.coerce.number().int().optional(),
  bufferMin: z.coerce.number().int().optional(),
  minNoticeHours: z.coerce.number().int().optional(),
  maxDaysAhead: z.coerce.number().int().optional(),
  callProvider: z.enum(["daily", "jitsi", "link"]).optional(),
  callLink: z.string().trim().max(300).optional(),
  indicatorPlatform: z.string().trim().max(40).optional(),
  accessType: z.enum(["username", "download", "license"]).optional(),
  welcome: z.string().trim().max(2000).optional(),
  eventMinutes: z.coerce.number().int().optional(),
});

export async function saveProductDetails(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = detailsSchema.safeParse(formObject(formData, ["markets", "platforms"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const { user, product } = await ownProduct(d.productId);
  if (!product) return fail("Product not found.");

  const tags = [...new Set(d.tags.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 8).map((t) => t.slice(0, 30));
  const includes = d.includes
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => l.slice(0, 100));
  const platforms = d.platforms.filter((p) => PLATFORMS.includes(p));
  const slug = d.slug ? await uniqueSlug(product.creatorId, d.slug, product.id) : product.slug;
  if (d.slug && slug !== slugify(d.slug)) return fail("That link is taken by another of your products.", formData, { slug: ["Already used"] });

  let startsAt: Date | null = product.startsAt;
  if (product.type === "EVENT") {
    if (d.startsAt) {
      // The form shows the creator's own time zone, so read it back in that zone.
      const tz = product.creatorId === user.id ? user.timezone : ((await db.user.findUnique({ where: { id: product.creatorId }, select: { timezone: true } }))?.timezone ?? "UTC");
      const [day, time] = d.startsAt.split("T");
      const t = zonedToUtc(day ?? "", (time ?? "").slice(0, 5), tz);
      if (!t) return fail("Check the date.", formData, { startsAt: ["Pick a valid date and time"] });
      startsAt = t;
    } else startsAt = null;
  }

  let trailerId: string | null = null;
  if (d.trailerId) {
    const v = await db.videoPost.findFirst({ where: { id: d.trailerId, authorId: product.creatorId } });
    if (!v) return fail("Pick one of your own videos for the trailer.", formData);
    trailerId = v.id;
  }

  const text = [d.title, d.subtitle ?? "", d.description, includes.join("\n"), tags.join(" ")].join("\n");
  const check = await checkText(text, product.status === "PUBLISHED" ? { type: "PRODUCT", id: product.id } : null);
  if (check.blocked) return fail(check.message, formData);

  const settings = productSettings({
    ...productSettings(product.settings),
    ...Object.fromEntries(
      Object.entries({
        durationMin: d.durationMin,
        bufferMin: d.bufferMin,
        minNoticeHours: d.minNoticeHours,
        maxDaysAhead: d.maxDaysAhead,
        callProvider: d.callProvider,
        callLink: d.callLink,
        indicatorPlatform: d.indicatorPlatform,
        accessType: d.accessType,
        welcome: d.welcome,
        eventMinutes: d.eventMinutes,
      }).filter(([, v]) => v !== undefined),
    ),
  });
  if (settings.callProvider === "link" && settings.callLink && !/^https:\/\//.test(settings.callLink)) {
    return fail("Your call link should start with https://", formData, { callLink: ["Start with https://"] });
  }

  const wasWaitlist = product.launchState === "WAITLIST";
  await db.product.update({
    where: { id: product.id },
    data: {
      title: d.title,
      slug,
      subtitle: d.subtitle ?? null,
      description: d.description || null,
      coverUrl: d.coverUrl || null,
      trailerId,
      markets: d.markets,
      level: d.level,
      tags,
      platforms,
      includes,
      refundDays: d.refundDays,
      memberLimit: d.memberLimit,
      launchState: d.launchState,
      startsAt,
      settings: settings as unknown as Prisma.InputJsonValue,
    },
  });
  if (trailerId) await db.videoPost.update({ where: { id: trailerId }, data: { productId: product.id } });
  if (wasWaitlist && d.launchState === "OPEN" && product.status === "PUBLISHED") await tellWaitlist(product.id);
  await audit(user.id, "product.update", { type: "product", id: product.id });
  refresh();
  return success("Saved.");
}

const priceSchema = z.object({
  productId: z.string().min(1),
  priceId: z.string().optional().default(""),
  label: z.string().trim().min(2, "Name this option, like Monthly or Lifetime").max(40, "40 characters at most"),
  amount: dollars({ max: 1_000_000 }),
  interval: z.enum(["ONE_TIME", "MONTH", "YEAR"]),
  sessions: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1, "At least 1 call").max(50, "50 calls at most").nullable()),
  trialDays: z.coerce.number().int().min(0).max(30, "30 days at most").optional().default(0),
});

export async function savePrice(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = priceSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const { user, product } = await ownProduct(d.productId);
  if (!product) return fail("Product not found.");
  const info = productTypeInfo(product.type);
  if (!info.allowedIntervals.includes(d.interval)) return fail(`${info.plural} can't be sold that way.`, formData, { interval: ["Pick another option"] });
  if (d.amount > 0 && d.amount < 100) return fail("Paid options need to be at least $1.", formData, { amount: ["At least $1, or 0 for free"] });
  if (d.interval !== "ONE_TIME" && d.amount === 0) return fail("Memberships need a price. Use a one time option for free access.", formData, { amount: ["At least $1"] });
  const sessions = product.type === "MENTORING" ? (d.sessions ?? 1) : null;
  const trialDays = d.interval === "ONE_TIME" ? 0 : d.trialDays;

  const check = await checkText(d.label, null);
  if (check.blocked) return fail(check.message, formData);

  if (d.priceId) {
    const price = product.prices.find((p) => p.id === d.priceId);
    if (!price) return fail("Price not found.");
    const sold = await db.order.count({ where: { priceId: price.id, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } });
    const changesMoney = price.amountCents !== d.amount || price.interval !== d.interval || (price.sessions ?? null) !== sessions;
    if (sold && changesMoney) {
      return fail("People have bought this option, so its price can't change. Turn it off and add a new option instead.", formData);
    }
    await db.price.update({ where: { id: price.id }, data: { label: d.label, amountCents: d.amount, interval: d.interval, sessions, trialDays } });
  } else {
    if (product.prices.filter((p) => p.active).length >= 5) return fail("You can have up to 5 price options. Turn one off first.");
    await db.price.create({
      data: { productId: product.id, label: d.label, amountCents: d.amount, interval: d.interval, sessions, trialDays, position: product.prices.length },
    });
  }
  await syncPriceFrom(product.id);
  await audit(user.id, "product.price", { type: "product", id: product.id });
  refresh();
  return success("Price saved.");
}

export async function togglePrice(formData: FormData) {
  const priceId = String(formData.get("priceId") ?? "");
  const price = await db.price.findUnique({ where: { id: priceId } });
  if (!price) return;
  const { product } = await ownProduct(price.productId);
  if (!product) return;
  if (!price.active && product.prices.filter((p) => p.active).length >= 5) {
    await flash("You can have up to 5 price options on at once.", "error");
    return;
  }
  await db.price.update({ where: { id: price.id }, data: { active: !price.active } });
  await syncPriceFrom(product.id);
  refresh();
}

export async function deletePrice(formData: FormData) {
  const priceId = String(formData.get("priceId") ?? "");
  const price = await db.price.findUnique({ where: { id: priceId }, include: { _count: { select: { orders: true, subscriptions: true } } } });
  if (!price) return;
  const { product } = await ownProduct(price.productId);
  if (!product) return;
  if (price._count.orders || price._count.subscriptions) {
    await db.price.update({ where: { id: price.id }, data: { active: false } });
    await flash("This option has buyers, so it was turned off instead of deleted.", "info");
  } else {
    await db.price.delete({ where: { id: price.id } });
  }
  await syncPriceFrom(product.id);
  refresh();
}

export async function publishProduct(_: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get("productId") ?? "");
  const { user, product } = await ownProduct(productId);
  if (!product) return fail("Product not found.");
  if (formData.get("rules") !== "on") return fail("Please confirm the listing follows the marketplace rules.", formData, { rules: ["Required"] });
  if (product.status === "SUSPENDED") return fail("This listing was taken down by our team. Contact support.");
  const creator = await db.creatorProfile.findUnique({ where: { userId: product.creatorId } });
  if (!creator || creator.status !== "APPROVED") return fail("Selling is switched off for this account.");

  const blockers = publishBlockers(product, creator);
  if (blockers.length) return fail(blockers[0]);

  const text = [product.title, product.subtitle ?? "", product.description ?? "", product.includes.join("\n"), product.tags.join(" "), ...product.prices.map((p) => p.label)].join("\n");
  const check = await checkText(text, { type: "PRODUCT", id: product.id });
  if (check.blocked) return fail(check.message);

  const first = !product.publishedAt;
  await db.product.update({
    where: { id: product.id },
    data: { status: "PUBLISHED", publishedAt: product.publishedAt ?? new Date(), submittedAt: new Date(), reviewNote: null },
  });
  await audit(user.id, "product.publish", { type: "product", id: product.id }, { flagged: check.hits.length });

  if (first) {
    const owner = await db.user.findUnique({ where: { id: product.creatorId }, select: { username: true, displayName: true } });
    const followers = await db.follow.findMany({ where: { followingId: product.creatorId }, select: { followerId: true }, take: 2000 });
    if (owner && followers.length) {
      await db.notification.createMany({
        data: followers.map((f) => ({
          userId: f.followerId,
          type: "product.new",
          title: `${owner.displayName} launched ${product.title}`,
          url: productPath(owner.username, product.slug),
        })),
      });
    }
  }
  if (product.launchState === "OPEN") await tellWaitlist(product.id);
  refresh();
  return success(first ? "It's live. Share your link to get your first buyers." : "Published again.");
}

export async function unpublishProduct(formData: FormData) {
  const { user, product } = await ownProduct(String(formData.get("productId") ?? ""));
  if (!product || product.status !== "PUBLISHED") return;
  await db.product.update({ where: { id: product.id }, data: { status: "DRAFT" } });
  await audit(user.id, "product.unpublish", { type: "product", id: product.id });
  await flash("Hidden from the marketplace. People who already bought it keep their access.", "info");
  refresh();
}

export async function archiveProduct(formData: FormData) {
  const { user, product } = await ownProduct(String(formData.get("productId") ?? ""));
  if (!product) return;
  // A listing our team took down stays down until we put it back, so it can't be archived and restored.
  if (product.status === "SUSPENDED") {
    await flash("Our team took this listing down, so it can't be changed. Contact support if you think that's a mistake.", "error");
    return;
  }
  const buyers = await db.entitlement.count({ where: { productId: product.id } });
  const orders = await db.order.count({ where: { productId: product.id } });
  if (!buyers && !orders && product.status !== "PUBLISHED") {
    await db.product.delete({ where: { id: product.id } });
    await audit(user.id, "product.delete", { type: "product", id: product.id });
    await flash("Deleted.");
    redirect("/creator/products");
  }
  await db.product.update({ where: { id: product.id }, data: { status: "ARCHIVED", launchState: "OPEN" } });
  await db.price.updateMany({ where: { productId: product.id }, data: { active: false } });
  await audit(user.id, "product.archive", { type: "product", id: product.id });
  await flash("Archived. It can't be bought any more. Members keep access until their paid time ends.", "info");
  redirect("/creator/products");
}

export async function restoreProduct(formData: FormData) {
  const { product } = await ownProduct(String(formData.get("productId") ?? ""));
  if (!product || product.status !== "ARCHIVED") return;
  await db.product.update({ where: { id: product.id }, data: { status: "DRAFT" } });
  await flash("Restored as a draft. Turn a price back on, then publish.", "info");
  refresh();
}

/** Emails everyone on the waitlist that the product is open. */
async function tellWaitlist(productId: string) {
  const product = await db.product.findUnique({ where: { id: productId }, include: { creator: { select: { username: true, displayName: true } } } });
  if (!product) return;
  const entries = await db.waitlistEntry.findMany({ where: { productId, notifiedAt: null }, take: 2000 });
  const url = absoluteUrl(productPath(product.creator.username, product.slug));
  for (const e of entries) {
    try {
      await sendEmail(
        e.email,
        emails.generic({
          subject: `${product.title} is open`,
          heading: `${product.title} is open`,
          body: [`You joined the waitlist for ${product.title} by ${product.creator.displayName}. It's open now.`],
          cta: { label: "Take a look", url },
        }),
        { template: "waitlist.open", userId: e.userId },
      );
      if (e.userId) await notify(e.userId, { type: "waitlist.open", title: `${product.title} is open`, url: productPath(product.creator.username, product.slug) });
    } catch (err) {
      console.error("[waitlist] email failed", err);
    }
  }
  if (entries.length) await db.waitlistEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { notifiedAt: new Date() } });
}

const creatorSettingsSchema = z.object({
  headline: z.string().trim().min(10, "Write at least a few words").max(100, "Keep it under 100 characters"),
  markets: z.array(MARKET).min(1, "Pick at least one market").max(5),
  tradingStyle: optionalText(60),
  yearsTrading: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(0).max(60).nullable()),
  acceptsCampaigns: checkbox,
  pinnedVideoId: z.string().trim().optional().default(""),
});

export async function saveCreatorSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  const parsed = creatorSettingsSchema.safeParse(formObject(formData, ["markets"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const check = await checkText(`${d.headline}\n${d.tradingStyle ?? ""}`, { type: "USER", id: user.id });
  if (check.blocked) return fail(check.message, formData);
  let pinnedVideoId: string | null = null;
  if (d.pinnedVideoId) {
    const v = await db.videoPost.findFirst({ where: { id: d.pinnedVideoId, authorId: user.id } });
    pinnedVideoId = v?.id ?? null;
  }
  await db.creatorProfile.update({
    where: { userId: user.id },
    data: { headline: d.headline, markets: d.markets, tradingStyle: d.tradingStyle ?? null, yearsTrading: d.yearsTrading, acceptsCampaigns: d.acceptsCampaigns, pinnedVideoId },
  });
  refresh();
  return success("Saved.");
}
