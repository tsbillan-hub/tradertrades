"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, optionalUrl, success, type ActionState } from "@/lib/forms";
import { requireCreator } from "@/server/dal";
import { checkText } from "@/server/moderation";
import { flash } from "@/server/flash";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/rate-limit";
import { mediaUrl, removeMedia } from "@/server/storage";
import { toEmbedUrl, youtubeThumb } from "@/lib/utils";

/** "9:16" for phone videos, "1:1" for square, otherwise "16:9". */
function aspectOf(width?: number | null, height?: number | null) {
  if (!width || !height) return "16:9";
  const r = width / height;
  if (r < 0.8) return "9:16";
  if (r < 1.2) return "1:1";
  return "16:9";
}

const videoSchema = z.object({
  videoId: z.string().optional(),
  title: z.string().trim().min(3, "At least 3 characters").max(120, "120 characters at most"),
  description: optionalText(3000),
  mediaId: z.string().max(40).optional(),
  embedUrl: optionalUrl,
  posterMediaId: z.string().max(40).optional(),
  productId: z.string().max(40).optional(),
  aspect: z.enum(["auto", "16:9", "9:16", "1:1"]).default("auto"),
});

export async function saveVideo(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  const parsed = videoSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const existing = d.videoId ? await db.videoPost.findFirst({ where: { id: d.videoId, authorId: user.id } }) : null;
  if (d.videoId && !existing) return fail("Video not found.");
  if (!existing) {
    const rl = await rateLimit(`video:${user.id}`, 20, 86400);
    if (!rl.ok) return fail("That's a lot of videos today. Try again tomorrow.");
  }

  let media: { id: string; width: number | null; height: number | null; durationSec: number | null } | null = null;
  if (d.mediaId) {
    media = await db.media.findFirst({ where: { id: d.mediaId, ownerId: user.id, purpose: "video" }, select: { id: true, width: true, height: true, durationSec: true } });
    if (!media) return fail("That video didn't upload properly. Try again.", formData);
  }
  if (d.embedUrl && !toEmbedUrl(d.embedUrl)) return fail("Links can be YouTube, Vimeo or Loom.", formData, { embedUrl: ["Use a YouTube, Vimeo or Loom link"] });
  if (!media && !d.embedUrl && !existing?.mediaId && !existing?.embedUrl) return fail("Upload a video or paste a link.", formData, { embedUrl: ["Add a video"] });

  let posterUrl: string | null | undefined = undefined;
  if (d.posterMediaId) {
    const poster = await db.media.findFirst({ where: { id: d.posterMediaId, ownerId: user.id, purpose: "poster" } });
    if (!poster) return fail("The thumbnail didn't upload properly. Try again.", formData);
    posterUrl = mediaUrl(poster);
  }

  let productId: string | null = null;
  if (d.productId) {
    const p = await db.product.findFirst({ where: { id: d.productId, creatorId: user.id }, select: { id: true } });
    if (!p) return fail("Pick one of your own products.", formData);
    productId = p.id;
  }

  // Videos are public marketing, so the same claim rules as listings apply.
  const check = await checkText(`${d.title}\n${d.description ?? ""}`, existing ? { type: "VIDEO", id: existing.id } : null);
  if (check.blocked) return fail(check.message, formData);

  const source = media
    ? { mediaId: media.id, embedUrl: null, durationSec: media.durationSec }
    : d.embedUrl
      ? { mediaId: null, embedUrl: d.embedUrl, durationSec: null }
      : {};
  const autoAspect = media ? aspectOf(media.width, media.height) : d.embedUrl?.includes("/shorts/") ? "9:16" : (existing?.aspect ?? "16:9");
  const aspect = d.aspect === "auto" ? autoAspect : d.aspect;
  const autoPoster = !media && d.embedUrl ? youtubeThumb(d.embedUrl) : undefined;

  if (existing) {
    // The old upload is deleted when a new file or a link replaces it.
    const replacedMedia = existing.mediaId && (media ? existing.mediaId !== media.id : Boolean(d.embedUrl)) ? existing.mediaId : null;
    await db.videoPost.update({
      where: { id: existing.id },
      data: {
        title: d.title,
        description: d.description ?? null,
        productId,
        aspect,
        ...source,
        ...(posterUrl !== undefined ? { posterUrl } : autoPoster ? { posterUrl: autoPoster } : {}),
      },
    });
    if (replacedMedia) await removeMedia(replacedMedia);
    return success("Video saved.");
  }

  const video = await db.videoPost.create({
    data: {
      authorId: user.id,
      title: d.title,
      description: d.description ?? null,
      productId,
      aspect,
      posterUrl: posterUrl ?? autoPoster ?? null,
      mediaId: media?.id ?? null,
      embedUrl: media ? null : (d.embedUrl ?? null),
      durationSec: media?.durationSec ?? null,
      status: "PUBLISHED",
    },
  });
  await audit(user.id, "video.create", { type: "video", id: video.id });
  await flash("Video posted. It's on your page now.");
  redirect(`/creator/videos`);
}

export async function deleteVideo(formData: FormData) {
  const user = await requireCreator();
  const video = await db.videoPost.findFirst({ where: { id: String(formData.get("videoId") ?? ""), authorId: user.id } });
  if (!video) return;
  await db.$transaction([
    db.videoPost.delete({ where: { id: video.id } }),
    db.product.updateMany({ where: { trailerId: video.id }, data: { trailerId: null } }),
    db.creatorProfile.updateMany({ where: { pinnedVideoId: video.id }, data: { pinnedVideoId: null } }),
  ]);
  if (video.mediaId) await removeMedia(video.mediaId);
  await flash("Video deleted.");
  refresh();
}

export async function setVideoHidden(formData: FormData) {
  const user = await requireCreator();
  const video = await db.videoPost.findFirst({ where: { id: String(formData.get("videoId") ?? ""), authorId: user.id } });
  if (!video) return;
  if (video.status === "REMOVED") {
    await flash("Our team took this video down, so it can't go back on your page.", "error");
    return refresh();
  }
  const hide = video.status === "PUBLISHED";
  await db.videoPost.update({ where: { id: video.id }, data: { status: hide ? "HIDDEN" : "PUBLISHED" } });
  await flash(hide ? "Hidden from your page." : "Back on your page.");
  refresh();
}
