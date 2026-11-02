import "server-only";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { hmac, safeEqual } from "@/server/crypto";
import { emailPrefs } from "@/server/notify";

/** A creator can email their customers once a day. */
export const BROADCAST_EVERY_HOURS = 24;
/** Biggest list one email goes to in v1. */
export const BROADCAST_MAX = 5000;

export type Audience = { value: string; label: string; count: number };

/** The people a creator may email: anyone with an order from them, a membership, or a product of theirs. */
async function audienceIds(creatorId: string, audience: string): Promise<string[] | null> {
  if (audience === "all") {
    const rels = await db.buyerRelation.findMany({ where: { sellerId: creatorId }, select: { buyerId: true } });
    return rels.map((r) => r.buyerId);
  }
  if (audience === "members") {
    const subs = await db.subscription.findMany({ where: { sellerId: creatorId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, select: { buyerId: true } });
    return [...new Set(subs.map((s) => s.buyerId))];
  }
  if (audience.startsWith("product:")) {
    const productId = audience.slice("product:".length);
    const product = await db.product.findFirst({ where: { id: productId, creatorId }, select: { id: true } });
    if (!product) return null;
    const ents = await db.entitlement.findMany({ where: { productId, status: "ACTIVE" }, select: { userId: true } });
    return [...new Set(ents.map((e) => e.userId))];
  }
  return null;
}

/**
 * Who actually gets the email: confirmed emails only, active accounts, people who haven't turned off
 * creator emails or this creator, and nobody who blocked the creator.
 */
export async function broadcastRecipients(creatorId: string, audience: string) {
  const ids = await audienceIds(creatorId, audience);
  if (!ids) return null;
  const others = ids.filter((id) => id !== creatorId);
  if (!others.length) return [];
  const [users, optOuts, blocks] = await Promise.all([
    db.user.findMany({
      where: { id: { in: others }, status: "ACTIVE", emailVerifiedAt: { not: null } },
      select: { id: true, email: true, displayName: true, emailPrefs: true },
    }),
    db.creatorEmailOptOut.findMany({ where: { creatorId, userId: { in: others } }, select: { userId: true } }),
    db.block.findMany({ where: { blockedId: creatorId, blockerId: { in: others } }, select: { blockerId: true } }),
  ]);
  const off = new Set([...optOuts.map((o) => o.userId), ...blocks.map((b) => b.blockerId)]);
  return users.filter((u) => !off.has(u.id) && emailPrefs(u.emailPrefs).creators).map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }));
}

/** The choices on the compose form, with how many people each would reach. */
export async function audienceOptions(creatorId: string): Promise<Audience[]> {
  const products = await db.product.findMany({
    where: { creatorId, status: { not: "ARCHIVED" } },
    select: { id: true, title: true, type: true },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const options: { value: string; label: string }[] = [
    { value: "all", label: "Everyone who bought from you or joined" },
    { value: "members", label: "Active members (memberships and alert rooms)" },
    ...products.map((p) => ({ value: `product:${p.id}`, label: `People with ${p.title}` })),
  ];
  const counted = await Promise.all(options.map(async (o) => ({ ...o, count: (await broadcastRecipients(creatorId, o.value))?.length ?? 0 })));
  return counted.filter((o) => o.value === "all" || o.count > 0);
}

/** A link that stops one creator's emails, without signing in. */
export function unsubscribeUrl(userId: string, creatorId: string) {
  const payload = Buffer.from(`${userId}.${creatorId}`).toString("base64url");
  return absoluteUrl(`/unsubscribe?t=${payload}.${hmac(`unsub|${userId}|${creatorId}`).slice(0, 32)}`);
}

export function readUnsubscribeToken(token: string | null | undefined) {
  if (!token || token.length > 300) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [userId, creatorId] = decoded.split(".");
  if (!userId || !creatorId) return null;
  if (!safeEqual(sig, hmac(`unsub|${userId}|${creatorId}`).slice(0, 32))) return null;
  return { userId, creatorId };
}

/** The words for a list, saved with each email so the history still makes sense if a product is renamed. */
export async function audienceLabel(creatorId: string, audience: string) {
  if (audience === "all") return "Everyone who bought from you or joined";
  if (audience === "members") return "Active members";
  if (audience.startsWith("product:")) {
    const p = await db.product.findFirst({ where: { id: audience.slice("product:".length), creatorId }, select: { title: true } });
    return p ? `People with ${p.title}` : "One product's customers";
  }
  return "Your customers";
}
