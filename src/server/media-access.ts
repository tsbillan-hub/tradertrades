import "server-only";
import type { Media } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type ViewerLike = { id: string; isAdmin: boolean } | null;

/** Who may open a private file: its owner, admins, the product's creator, people with access to that product. */
export async function canAccessMedia(media: Media, viewer: ViewerLike) {
  if (media.visibility === "PUBLIC") return true;
  if (!viewer) {
    return isPreviewLessonVideo(media.id);
  }
  if (viewer.isAdmin || media.ownerId === viewer.id) return true;
  if (media.purpose === "document" || media.purpose === "proof") return false;
  if (media.productId) {
    if (await isPreviewLessonVideo(media.id)) return true;
    const product = await db.product.findUnique({ where: { id: media.productId }, select: { creatorId: true } });
    if (product?.creatorId === viewer.id) return true;
    return hasProductAccess(viewer.id, media.productId);
  }
  return false;
}

async function isPreviewLessonVideo(mediaId: string) {
  const lesson = await db.lesson.findFirst({ where: { videoMediaId: mediaId, isPreview: true }, select: { id: true } });
  return Boolean(lesson);
}

export async function hasProductAccess(userId: string, productId: string) {
  const ent = await db.entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
  if (!ent || ent.status !== "ACTIVE") return false;
  if (ent.endsAt && ent.endsAt < new Date()) return false;
  return true;
}
