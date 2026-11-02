"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, optionalUrl, success, type ActionState } from "@/lib/forms";
import { safeNext } from "@/lib/utils";
import { requireUser } from "@/server/dal";
import { flash } from "@/server/flash";
import { checkText } from "@/server/moderation";

const MARKET = z.enum(["FUTURES", "FOREX", "CRYPTO", "STOCKS", "OPTIONS"]);
const EXPERIENCE = z.enum(["NEW", "LEARNING", "CONSISTENT", "FUNDED", "PRO"]);

export async function saveOnboarding(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      markets: z.array(MARKET).max(5),
      experience: EXPERIENCE.optional(),
      bio: optionalText(160),
      next: z.string().optional(),
    })
    .safeParse(formObject(formData, ["markets"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { markets, experience, bio, next } = parsed.data;
  await db.user.update({
    where: { id: user.id },
    data: { markets, experience, bio: bio ?? user.bio, onboardedAt: new Date() },
  });
  const fallback = user.accountType === "CREATOR" ? "/creator/start" : user.accountType === "BUSINESS" ? "/business/claim" : "/marketplace";
  await flash("You're all set. Welcome to TraderTrades.");
  redirect(safeNext(next, fallback));
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(50),
  bio: optionalText(160),
  about: optionalText(5000),
  location: optionalText(60),
  website: optionalUrl,
  timezone: z.string().trim().min(1).max(60),
  markets: z.array(MARKET).max(5),
  experience: EXPERIENCE.optional().or(z.literal("").transform(() => undefined)),
  avatarUrl: z.string().trim().max(500).optional(),
  bannerUrl: z.string().trim().max(500).optional(),
  showPurchases: z.string().optional(),
});

function cleanMediaUrl(v: string | undefined) {
  if (!v) return null;
  if (v.startsWith("/api/media/") || v.startsWith("https://")) return v;
  return null;
}

export async function updateProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(formObject(formData, ["markets"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: d.timezone });
  } catch {
    return fail("Pick a valid time zone.", formData, { timezone: ["Pick a valid time zone"] });
  }
  const flagged = await checkText(`${d.bio ?? ""}\n${d.about ?? ""}`, { type: "USER", id: user.id });
  if (flagged.blocked) return fail(flagged.message, formData);

  await db.user.update({
    where: { id: user.id },
    data: {
      displayName: d.displayName,
      bio: d.bio ?? null,
      about: d.about ?? null,
      location: d.location ?? null,
      website: d.website ?? null,
      timezone: d.timezone,
      markets: d.markets,
      experience: d.experience ?? null,
      avatarUrl: cleanMediaUrl(d.avatarUrl),
      bannerUrl: cleanMediaUrl(d.bannerUrl),
      showPurchases: d.showPurchases === "on",
    },
  });
  refresh();
  return success("Profile saved.");
}

const SOCIAL = z.enum(["YOUTUBE", "INSTAGRAM", "TIKTOK", "X", "DISCORD", "TWITCH", "TELEGRAM", "WEBSITE"]);

export async function updateSocials(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const entries: { platform: z.infer<typeof SOCIAL>; url: string }[] = [];
  const errors: Record<string, string[]> = {};
  for (const p of SOCIAL.options) {
    const raw = String(formData.get(`social_${p}`) ?? "").trim();
    if (!raw) continue;
    const res = optionalUrl.safeParse(raw);
    if (!res.success || !res.data) {
      errors[`social_${p}`] = ["Enter a full link starting with https://"];
      continue;
    }
    entries.push({ platform: p, url: res.data });
  }
  if (Object.keys(errors).length) return fail("Check the highlighted links.", formData, errors);

  const existing = await db.socialLink.findMany({ where: { userId: user.id } });
  const keep = new Set(entries.map((e) => e.platform));
  await db.$transaction([
    db.socialLink.deleteMany({ where: { userId: user.id, platform: { notIn: [...keep] } } }),
    ...entries.map((e) => {
      const prev = existing.find((x) => x.platform === e.platform);
      const changed = prev && prev.url !== e.url;
      return db.socialLink.upsert({
        where: { userId_platform: { userId: user.id, platform: e.platform } },
        create: { userId: user.id, platform: e.platform, url: e.url },
        update: { url: e.url, ...(changed ? { verifiedAt: null } : {}) },
      });
    }),
  ]);
  refresh();
  return success("Links saved. Changing a link removes its verified tick until it's checked again.");
}

export async function followUser(formData: FormData) {
  const user = await requireUser();
  const targetId = String(formData.get("userId") ?? "");
  if (!targetId || targetId === user.id) return;
  const exists = await db.follow.findUnique({ where: { followerId_followingId: { followerId: user.id, followingId: targetId } } });
  if (exists) await db.follow.delete({ where: { followerId_followingId: { followerId: user.id, followingId: targetId } } });
  else await db.follow.create({ data: { followerId: user.id, followingId: targetId } });
  refresh();
}

export async function toggleSaved(formData: FormData) {
  const user = await requireUser();
  const productId = String(formData.get("productId") ?? "") || null;
  const companyId = String(formData.get("companyId") ?? "") || null;
  const creatorId = String(formData.get("creatorId") ?? "") || null;
  if (!productId && !companyId && !creatorId) return;
  const where = productId
    ? { userId_productId: { userId: user.id, productId } }
    : companyId
      ? { userId_companyId: { userId: user.id, companyId } }
      : { userId_creatorId: { userId: user.id, creatorId: creatorId! } };
  const existing = await db.savedItem.findUnique({ where });
  if (existing) await db.savedItem.delete({ where: { id: existing.id } });
  else await db.savedItem.create({ data: { userId: user.id, productId, companyId, creatorId } });
  refresh();
}
