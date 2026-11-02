import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentPath, getViewer } from "@/server/dal";
import { productSettings } from "@/lib/product-settings";
import { insidePath, productPath } from "@/lib/paths";

const creatorSelect = { id: true, username: true, displayName: true, avatarUrl: true, status: true, timezone: true } as const;

/**
 * Everything the members area needs to know about a product and the person looking at it.
 * Cached per request, so pages and components can call it freely.
 */
export const loadInside = cache(async (username: string, slug: string) => {
  const viewer = await getViewer();
  const product = await db.product.findFirst({
    where: { slug: decodeURIComponent(slug).toLowerCase(), creator: { username: decodeURIComponent(username).toLowerCase() } },
    include: {
      creator: { select: creatorSelect },
      channels: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!product || product.creator.status === "BANNED" || product.creator.status === "DELETED") return null;
  return withAccess(product, viewer);
});

async function withAccess<P extends { id: string; creatorId: string; status: string; settings: unknown; creator: { timezone: string } }>(product: P, viewer: Awaited<ReturnType<typeof getViewer>>) {
  const isOwner = Boolean(viewer && viewer.id === product.creatorId);
  const isAdmin = Boolean(viewer?.isAdmin);
  const entitlement =
    viewer && !isOwner ? await db.entitlement.findUnique({ where: { userId_productId: { userId: viewer.id, productId: product.id } } }) : null;
  const now = new Date();
  const member = Boolean(entitlement && entitlement.status === "ACTIVE" && (!entitlement.endsAt || entitlement.endsAt > now));
  // A product our team took down closes for members too (refunds are handled by the team).
  const open = product.status !== "SUSPENDED";
  const hasAccess = isOwner || isAdmin || (member && open);
  return {
    viewer,
    product,
    settings: productSettings(product.settings),
    isOwner,
    isAdmin,
    canManage: isOwner || isAdmin,
    member,
    entitlement,
    hasAccess,
    /** Time zone to show times in: the viewer's, or the creator's for signed out visitors. */
    timeZone: viewer?.timezone ?? product.creator.timezone,
  };
}

export type InsideCtx = NonNullable<Awaited<ReturnType<typeof loadInside>>>;
export type InsideViewer = NonNullable<InsideCtx["viewer"]>;

/** For members area pages: signed in with access, or sent to sign in / the listing. */
export async function requireInside(username: string, slug: string) {
  const ctx = await loadInside(username, slug);
  if (!ctx) notFound();
  if (!ctx.viewer) redirect(`/login?next=${encodeURIComponent(await currentPath())}`);
  if (!ctx.hasAccess) redirect(`${productPath(ctx.product.creator.username, ctx.product.slug)}?locked=1`);
  return ctx as InsideCtx & { viewer: InsideViewer };
}

/** For the creator's own tools inside the members area. */
export async function requireManage(username: string, slug: string) {
  const ctx = await requireInside(username, slug);
  if (!ctx.canManage) redirect(insidePath(ctx.product.creator.username, ctx.product.slug));
  return ctx;
}

/** For server actions: access to a product by id for the signed in user. */
export async function accessById(productId: string) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const product = await db.product.findUnique({ where: { id: productId }, include: { creator: { select: creatorSelect } } });
  if (!product || product.creator.status === "BANNED" || product.creator.status === "DELETED") return null;
  const ctx = await withAccess(product, viewer);
  return ctx.hasAccess ? (ctx as typeof ctx & { viewer: InsideViewer }) : null;
}

/** Who may write in a channel: the creator always; members only where members can post (never alert channels). */
export function canPostIn(channel: { kind: string; postingPolicy: string }, ctx: { canManage: boolean; viewer: { status: string; emailVerifiedAt: Date | null } | null }) {
  if (!ctx.viewer || ctx.viewer.status !== "ACTIVE") return false;
  if (ctx.canManage) return true;
  if (channel.kind === "ALERTS" || channel.postingPolicy !== "MEMBERS") return false;
  return true;
}

/** Active members of a product (not the creator). */
export async function memberIds(productId: string) {
  const now = new Date();
  const rows = await db.entitlement.findMany({
    where: { productId, status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
