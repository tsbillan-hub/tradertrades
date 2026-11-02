"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { checkbox, fail, formObject, invalid, optionalText, optionalUrl, success, type ActionState } from "@/lib/forms";
import { getViewer } from "@/server/dal";
import { accessById } from "@/server/inside";
import { notifyMembers } from "@/server/community";
import { checkText } from "@/server/moderation";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/rate-limit";
import { removeMedia } from "@/server/storage";
import { stripe } from "@/server/stripe";
import { productSettings } from "@/lib/product-settings";
import { insidePath } from "@/lib/paths";
import { formatWhen, zonedToUtc } from "@/lib/time";
import { slugify, toEmbedUrl } from "@/lib/utils";
import { randomToken } from "@/server/crypto";

/** The product, if the signed in person may manage it (its creator or an admin). */
async function manage(productId: string) {
  const ctx = await accessById(productId);
  return ctx?.canManage ? ctx : null;
}

const NOPE = "Only the creator can change this.";

function managePath(ctx: { product: { slug: string; creator: { username: string } } }, tab: string) {
  return insidePath(ctx.product.creator.username, ctx.product.slug, `/manage?tab=${tab}`);
}

// ───────────────────────────── Channels ─────────────────────────────

const channelSchema = z.object({
  productId: z.string().min(1),
  channelId: z.string().optional(),
  name: z.string().trim().min(2, "At least 2 characters").max(40, "40 characters at most"),
  description: optionalText(140),
  kind: z.enum(["CHAT", "ANNOUNCEMENTS", "RESOURCES"]),
  postingPolicy: z.enum(["OWNER", "MEMBERS"]),
});

export async function saveChannel(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = channelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const ctx = await manage(d.productId);
  if (!ctx) return fail(NOPE);
  if (ctx.product.type !== "COMMUNITY" && ctx.product.type !== "ALERTS") return fail("Only communities and alert rooms have channels.");

  const base = slugify(d.name).slice(0, 30) || "channel";
  const taken = await db.channel.findMany({ where: { productId: ctx.product.id, NOT: d.channelId ? { id: d.channelId } : undefined }, select: { slug: true } });
  const slugs = new Set(taken.map((t) => t.slug));
  let slug = base;
  for (let i = 2; slugs.has(slug); i++) slug = `${base}-${i}`;

  if (d.channelId) {
    const ch = await db.channel.findFirst({ where: { id: d.channelId, productId: ctx.product.id } });
    if (!ch) return fail("Channel not found.");
    // The alerts channel keeps its kind and rules.
    const kind = ch.kind === "ALERTS" ? "ALERTS" : d.kind;
    const postingPolicy = ch.kind === "ALERTS" || kind === "ANNOUNCEMENTS" ? "OWNER" : d.postingPolicy;
    await db.channel.update({ where: { id: ch.id }, data: { name: d.name, slug, description: d.description ?? null, kind, postingPolicy } });
    return success("Channel saved.");
  }
  if (taken.length >= 20) return fail("You can have up to 20 channels.");
  const last = await db.channel.aggregate({ where: { productId: ctx.product.id }, _max: { position: true } });
  await db.channel.create({
    data: {
      productId: ctx.product.id,
      name: d.name,
      slug,
      description: d.description ?? null,
      kind: d.kind,
      postingPolicy: d.kind === "ANNOUNCEMENTS" ? "OWNER" : d.postingPolicy,
      position: (last._max.position ?? 0) + 1,
    },
  });
  return success("Channel added.");
}

export async function moveChannel(formData: FormData) {
  const ch = await db.channel.findUnique({ where: { id: String(formData.get("channelId") ?? "") } });
  if (!ch || !(await manage(ch.productId))) return;
  const all = await db.channel.findMany({ where: { productId: ch.productId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const i = all.findIndex((c) => c.id === ch.id);
  const j = formData.get("dir") === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((c, k) => db.channel.update({ where: { id: c.id }, data: { position: k } })));
  refresh();
}

export async function deleteChannel(formData: FormData) {
  const ch = await db.channel.findUnique({ where: { id: String(formData.get("channelId") ?? "") }, include: { _count: { select: { posts: { where: { isAlert: true } } } } } });
  if (!ch) return;
  const ctx = await manage(ch.productId);
  if (!ctx) return;
  const count = await db.channel.count({ where: { productId: ch.productId } });
  if (count <= 1) {
    await flash("Keep at least one channel.", "error");
    return;
  }
  if (ch._count.posts > 0) {
    await flash("This channel has alerts in it. Alert history stays visible for good, so it can't be deleted.", "error");
    return;
  }
  await db.channel.delete({ where: { id: ch.id } });
  await audit(ctx.viewer.id, "channel.delete", { type: "channel", id: ch.id }, { name: ch.name });
  await flash(`#${ch.slug} deleted.`);
  refresh();
}

// ───────────────────────────── Welcome and settings ─────────────────────────────

async function mergeSettings(productId: string, patch: Record<string, unknown>) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { settings: true } });
  const next = productSettings({ ...productSettings(product?.settings), ...patch });
  await db.product.update({ where: { id: productId }, data: { settings: next as unknown as Prisma.InputJsonValue } });
}

export async function saveWelcome(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), welcome: z.string().trim().max(2000, "2,000 characters at most") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const ctx = await manage(parsed.data.productId);
  if (!ctx) return fail(NOPE);
  const check = await checkText(parsed.data.welcome, null, { block: true });
  if (check.blocked) return fail(check.message, formData);
  await mergeSettings(ctx.product.id, { welcome: parsed.data.welcome });
  return success("Welcome message saved.");
}

export async function saveIndicatorSetup(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ productId: z.string().min(1), instructions: z.string().trim().max(4000, "4,000 characters at most"), indicatorPlatform: z.string().trim().min(2).max(40) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const ctx = await manage(parsed.data.productId);
  if (!ctx || ctx.product.type !== "INDICATOR") return fail(NOPE);
  await mergeSettings(ctx.product.id, { instructions: parsed.data.instructions, indicatorPlatform: parsed.data.indicatorPlatform });
  return success("Saved.");
}

export async function saveEventLinks(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ productId: z.string().min(1), callLink: optionalUrl, recordingUrl: optionalUrl })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const ctx = await manage(parsed.data.productId);
  if (!ctx || ctx.product.type !== "EVENT") return fail(NOPE);
  const before = ctx.settings;
  if (parsed.data.callLink && !parsed.data.callLink.startsWith("https://")) return fail("Use a link starting with https://", formData, { callLink: ["Start with https://"] });
  if (parsed.data.recordingUrl && !parsed.data.recordingUrl.startsWith("https://")) return fail("Use a link starting with https://", formData, { recordingUrl: ["Start with https://"] });
  await mergeSettings(ctx.product.id, {
    callProvider: parsed.data.callLink ? "link" : "jitsi",
    callLink: parsed.data.callLink ?? "",
    recordingUrl: parsed.data.recordingUrl ?? "",
  });
  if (parsed.data.recordingUrl && parsed.data.recordingUrl !== before.recordingUrl) {
    const url = insidePath(ctx.product.creator.username, ctx.product.slug);
    after(() =>
      notifyMembers(ctx.product.id, { type: "community.recording", title: `The recording of ${ctx.product.title} is up`, url, ctaLabel: "Watch it" }, { email: true }).catch((err) =>
        console.error(err),
      ),
    );
  }
  return success("Saved.");
}

// ───────────────────────────── Live sessions ─────────────────────────────

const liveSchema = z.object({
  productId: z.string().min(1),
  sessionId: z.string().optional(),
  title: z.string().trim().min(3, "At least 3 characters").max(100, "100 characters at most"),
  description: optionalText(1000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, "Pick a time"),
  durationMin: z.coerce.number().int().min(15, "At least 15 minutes").max(600, "10 hours at most"),
  joinUrl: optionalUrl,
});

export async function saveLiveSession(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = liveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const ctx = await manage(d.productId);
  if (!ctx) return fail(NOPE);
  const tz = ctx.product.creator.timezone;
  const startsAt = zonedToUtc(d.date, d.time, tz);
  if (!startsAt) return fail("Check the date and time.", formData, { date: ["Pick a valid date"] });
  if (!d.sessionId && startsAt.getTime() < Date.now() - 60_000) return fail("That time has already passed.", formData, { time: ["Pick a time in the future"] });
  if (d.joinUrl && !d.joinUrl.startsWith("https://")) return fail("Use a link starting with https://", formData, { joinUrl: ["Start with https://"] });
  const check = await checkText(`${d.title}\n${d.description ?? ""}`, null, { block: true });
  if (check.blocked) return fail(check.message, formData);

  // No link of their own: a free video room that works in the browser.
  const joinUrl = d.joinUrl ?? `https://meet.jit.si/TraderTrades-${randomToken(9).replace(/[^a-zA-Z0-9]/g, "")}`;

  if (d.sessionId) {
    const s = await db.liveSession.findFirst({ where: { id: d.sessionId, productId: ctx.product.id } });
    if (!s) return fail("Session not found.");
    await db.liveSession.update({
      where: { id: s.id },
      data: { title: d.title, description: d.description ?? null, startsAt, durationMin: d.durationMin, joinUrl: d.joinUrl ?? s.joinUrl ?? joinUrl },
    });
    return success("Session updated.");
  }
  const upcoming = await db.liveSession.count({ where: { productId: ctx.product.id, startsAt: { gte: new Date() } } });
  if (upcoming >= 50) return fail("You have 50 sessions coming up already.");
  await db.liveSession.create({
    data: { productId: ctx.product.id, title: d.title, description: d.description ?? null, startsAt, durationMin: d.durationMin, joinUrl },
  });
  const url = insidePath(ctx.product.creator.username, ctx.product.slug, "/live");
  after(() =>
    notifyMembers(
      ctx.product.id,
      { type: "community.live", title: `Live session: ${d.title}`, body: `${formatWhen(startsAt, tz)} in ${ctx.product.title}.`, url, ctaLabel: "See the details" },
      { exceptUserId: ctx.viewer.id, email: true },
    ).catch((err) => console.error("[content] live fan-out failed", err)),
  );
  return success("Session scheduled. Members have been told.");
}

export async function saveRecording(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ sessionId: z.string().min(1), recordingUrl: optionalUrl }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const s = await db.liveSession.findUnique({ where: { id: parsed.data.sessionId } });
  if (!s) return fail("Session not found.");
  const ctx = await manage(s.productId);
  if (!ctx) return fail(NOPE);
  await db.liveSession.update({ where: { id: s.id }, data: { recordingUrl: parsed.data.recordingUrl ?? null } });
  return success(parsed.data.recordingUrl ? "Recording added." : "Recording removed.");
}

export async function deleteLiveSession(formData: FormData) {
  const s = await db.liveSession.findUnique({ where: { id: String(formData.get("sessionId") ?? "") } });
  if (!s) return;
  const ctx = await manage(s.productId);
  if (!ctx) return;
  await db.liveSession.delete({ where: { id: s.id } });
  if (s.startsAt > new Date()) {
    const url = insidePath(ctx.product.creator.username, ctx.product.slug, "/live");
    after(() =>
      notifyMembers(ctx.product.id, { type: "community.live", title: `Canceled: ${s.title}`, body: `This live session in ${ctx.product.title} won't happen.`, url }, { exceptUserId: ctx.viewer.id }).catch(
        (err) => console.error(err),
      ),
    );
  }
  await flash("Session deleted.");
  refresh();
}

// ───────────────────────────── Course: modules and lessons ─────────────────────────────

export async function addModule(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ productId: z.string().min(1), title: z.string().trim().min(2, "At least 2 characters").max(100) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const ctx = await manage(parsed.data.productId);
  if (!ctx || ctx.product.type !== "COURSE") return fail(NOPE);
  const count = await db.courseModule.count({ where: { productId: ctx.product.id } });
  if (count >= 50) return fail("Up to 50 modules.");
  await db.courseModule.create({ data: { productId: ctx.product.id, title: parsed.data.title, position: count } });
  return success("Module added.");
}

export async function renameModule(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ moduleId: z.string().min(1), title: z.string().trim().min(2, "At least 2 characters").max(100) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const m = await db.courseModule.findUnique({ where: { id: parsed.data.moduleId } });
  if (!m || !(await manage(m.productId))) return fail(NOPE);
  await db.courseModule.update({ where: { id: m.id }, data: { title: parsed.data.title } });
  return success("Saved.");
}

export async function moveModule(formData: FormData) {
  const m = await db.courseModule.findUnique({ where: { id: String(formData.get("moduleId") ?? "") } });
  if (!m || !(await manage(m.productId))) return;
  const all = await db.courseModule.findMany({ where: { productId: m.productId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const i = all.findIndex((x) => x.id === m.id);
  const j = formData.get("dir") === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, k) => db.courseModule.update({ where: { id: x.id }, data: { position: k } })));
  refresh();
}

export async function deleteModule(formData: FormData) {
  const m = await db.courseModule.findUnique({ where: { id: String(formData.get("moduleId") ?? "") }, include: { lessons: { select: { videoMediaId: true } } } });
  if (!m) return;
  const ctx = await manage(m.productId);
  if (!ctx) return;
  await db.courseModule.delete({ where: { id: m.id } });
  for (const l of m.lessons) if (l.videoMediaId) await removeMedia(l.videoMediaId);
  await audit(ctx.viewer.id, "module.delete", { type: "module", id: m.id }, { title: m.title });
  await flash("Module deleted.");
  refresh();
}

export async function addLesson(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ moduleId: z.string().min(1), title: z.string().trim().min(2, "At least 2 characters").max(120) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const m = await db.courseModule.findUnique({ where: { id: parsed.data.moduleId } });
  if (!m) return fail("Module not found.");
  const ctx = await manage(m.productId);
  if (!ctx) return fail(NOPE);
  const count = await db.lesson.count({ where: { productId: m.productId } });
  if (count >= 500) return fail("Up to 500 lessons per course.");
  const inModule = await db.lesson.count({ where: { moduleId: m.id } });
  const lesson = await db.lesson.create({ data: { moduleId: m.id, productId: m.productId, title: parsed.data.title, position: inModule } });
  redirect(insidePath(ctx.product.creator.username, ctx.product.slug, `/manage/lesson/${lesson.id}`));
}

const lessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().trim().min(2, "At least 2 characters").max(120, "120 characters at most"),
  kind: z.enum(["VIDEO", "TEXT", "FILE"]),
  body: z.string().trim().max(20000, "20,000 characters at most"),
  videoMediaId: z.string().max(40).optional(),
  embedUrl: optionalUrl,
  durationSec: z.coerce.number().int().min(0).max(86400).optional(),
  isPreview: checkbox,
});

export async function saveLesson(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = lessonSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const lesson = await db.lesson.findUnique({ where: { id: d.lessonId } });
  if (!lesson) return fail("Lesson not found.");
  const ctx = await manage(lesson.productId);
  if (!ctx) return fail(NOPE);

  let videoMediaId: string | null = null;
  if (d.videoMediaId) {
    const media = await db.media.findFirst({ where: { id: d.videoMediaId, productId: lesson.productId, purpose: "lesson", ownerId: ctx.product.creatorId } });
    if (!media) return fail("That video didn't upload properly. Try again.", formData);
    videoMediaId = media.id;
  }
  if (d.embedUrl && !toEmbedUrl(d.embedUrl)) return fail("Video links can be YouTube, Vimeo or Loom.", formData, { embedUrl: ["Use a YouTube, Vimeo or Loom link"] });
  if (d.kind === "VIDEO" && !videoMediaId && !d.embedUrl && !d.body) {
    return fail("Upload a video or paste a video link.", formData, { embedUrl: ["Add a video"] });
  }
  const check = await checkText(`${d.title}\n${d.body}`, null, { block: true });
  if (check.blocked) return fail(check.message, formData);

  // A replaced upload is deleted so it doesn't keep taking space.
  if (lesson.videoMediaId && lesson.videoMediaId !== videoMediaId) await removeMedia(lesson.videoMediaId);
  let durationSec = d.durationSec ?? lesson.durationSec;
  if (videoMediaId && videoMediaId !== lesson.videoMediaId) {
    const m = await db.media.findUnique({ where: { id: videoMediaId }, select: { durationSec: true } });
    durationSec = m?.durationSec ?? durationSec;
  }
  await db.lesson.update({
    where: { id: lesson.id },
    data: {
      title: d.title,
      kind: d.kind,
      body: d.body || null,
      videoMediaId,
      embedUrl: videoMediaId ? null : (d.embedUrl ?? null),
      durationSec: durationSec || null,
      isPreview: d.isPreview,
    },
  });
  return success("Lesson saved.");
}

export async function moveLesson(formData: FormData) {
  const l = await db.lesson.findUnique({ where: { id: String(formData.get("lessonId") ?? "") } });
  if (!l || !(await manage(l.productId))) return;
  const all = await db.lesson.findMany({ where: { moduleId: l.moduleId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const i = all.findIndex((x) => x.id === l.id);
  const j = formData.get("dir") === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, k) => db.lesson.update({ where: { id: x.id }, data: { position: k } })));
  refresh();
}

export async function deleteLesson(formData: FormData) {
  const l = await db.lesson.findUnique({ where: { id: String(formData.get("lessonId") ?? "") }, include: { files: { select: { mediaId: true } } } });
  if (!l) return;
  const ctx = await manage(l.productId);
  if (!ctx) return;
  await db.lesson.delete({ where: { id: l.id } });
  if (l.videoMediaId) await removeMedia(l.videoMediaId);
  for (const f of l.files) await removeMedia(f.mediaId);
  await flash("Lesson deleted.");
  redirect(managePath(ctx, "lessons"));
}

// ───────────────────────────── Progress (buyers) ─────────────────────────────

export async function setLessonDone(formData: FormData) {
  const me = await getViewer();
  const lesson = await db.lesson.findUnique({ where: { id: String(formData.get("lessonId") ?? "") }, select: { id: true, productId: true } });
  if (!me || !lesson) return;
  const ctx = await accessById(lesson.productId);
  if (!ctx) return;
  const done = formData.get("done") !== "0";
  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: me.id, lessonId: lesson.id } },
    create: { userId: me.id, lessonId: lesson.id, productId: lesson.productId, completedAt: done ? new Date() : null },
    update: { completedAt: done ? new Date() : null },
  });
  const next = String(formData.get("next") ?? "");
  if (done && next.startsWith("/")) redirect(next);
  refresh();
}

/** Remembers how far into a lesson video someone got. Called by the player now and then. */
export async function saveLessonPosition(lessonId: string, positionSec: number) {
  const me = await getViewer();
  if (!me || typeof lessonId !== "string" || typeof positionSec !== "number" || !Number.isFinite(positionSec)) return;
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, productId: true } });
  if (!lesson) return;
  if (!(await accessById(lesson.productId))) return;
  const pos = Math.max(0, Math.min(86400, Math.round(positionSec)));
  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: me.id, lessonId: lesson.id } },
    create: { userId: me.id, lessonId: lesson.id, productId: lesson.productId, positionSec: pos },
    update: { positionSec: pos },
  });
}

// ───────────────────────────── Files ─────────────────────────────

const fileSchema = z.object({
  productId: z.string().min(1),
  mediaId: z.string().min(1).max(40),
  label: z.string().trim().max(120).optional(),
  lessonId: z.string().max(40).optional(),
});

export async function addFile(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const ctx = await manage(d.productId);
  if (!ctx) return fail(NOPE);
  const media = await db.media.findFirst({ where: { id: d.mediaId, productId: ctx.product.id, purpose: "file", ownerId: ctx.product.creatorId } });
  if (!media) return fail("That file didn't upload properly. Try again.");
  if (d.lessonId) {
    const lesson = await db.lesson.findFirst({ where: { id: d.lessonId, productId: ctx.product.id } });
    if (!lesson) return fail("Lesson not found.");
  }
  const count = await db.productFile.count({ where: { productId: ctx.product.id, lessonId: d.lessonId ?? null } });
  if (count >= 50) return fail("Up to 50 files here.");
  await db.productFile.create({
    data: { productId: ctx.product.id, lessonId: d.lessonId ?? null, mediaId: media.id, label: (d.label || media.originalName).slice(0, 120), position: count },
  });
  return success("File added.");
}

export async function renameFile(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ fileId: z.string().min(1), label: z.string().trim().min(1, "Give it a name").max(120) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const f = await db.productFile.findUnique({ where: { id: parsed.data.fileId } });
  if (!f || !(await manage(f.productId))) return fail(NOPE);
  await db.productFile.update({ where: { id: f.id }, data: { label: parsed.data.label } });
  return success("Saved.");
}

export async function moveFile(formData: FormData) {
  const f = await db.productFile.findUnique({ where: { id: String(formData.get("fileId") ?? "") } });
  if (!f || !(await manage(f.productId))) return;
  const all = await db.productFile.findMany({ where: { productId: f.productId, lessonId: f.lessonId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const i = all.findIndex((x) => x.id === f.id);
  const j = formData.get("dir") === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, k) => db.productFile.update({ where: { id: x.id }, data: { position: k } })));
  refresh();
}

export async function deleteFile(formData: FormData) {
  const f = await db.productFile.findUnique({ where: { id: String(formData.get("fileId") ?? "") } });
  if (!f || !(await manage(f.productId))) return;
  await db.productFile.delete({ where: { id: f.id } });
  await removeMedia(f.mediaId);
  await flash("File deleted.");
  refresh();
}

// ───────────────────────────── Indicator access ─────────────────────────────

export async function requestIndicatorAccess(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      productId: z.string().min(1),
      platformUsername: z
        .string()
        .trim()
        .min(2, "Enter your username")
        .max(60, "60 characters at most")
        .regex(/^[\w.@-]+$/, "Letters, numbers, dots, dashes and underscores only"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const ctx = await accessById(parsed.data.productId);
  if (!ctx || ctx.product.type !== "INDICATOR") return fail("You don't have access to this.");
  if (ctx.isOwner) return fail("This is your own indicator.");
  const rl = await rateLimit(`indicator:${ctx.viewer.id}`, 10, 3600);
  if (!rl.ok) return fail("Too many changes. Try again later.");
  const existing = await db.indicatorAccess.findUnique({ where: { userId_productId: { userId: ctx.viewer.id, productId: ctx.product.id } } });
  if (existing && existing.platformUsername === parsed.data.platformUsername && existing.status !== "REVOKED") return success("That's the username we have.");
  await db.indicatorAccess.upsert({
    where: { userId_productId: { userId: ctx.viewer.id, productId: ctx.product.id } },
    create: { userId: ctx.viewer.id, productId: ctx.product.id, platformUsername: parsed.data.platformUsername },
    update: { platformUsername: parsed.data.platformUsername, status: "REQUESTED", grantedAt: null, revokedAt: null },
  });
  await notify(ctx.product.creatorId, {
    type: "indicator.request",
    title: `${ctx.viewer.displayName} needs access to ${ctx.product.title}`,
    body: `${ctx.settings.indicatorPlatform} username: ${parsed.data.platformUsername}`,
    url: managePath(ctx, "access"),
    email: "orders",
    ctaLabel: "Give access",
  });
  return success(`Sent. ${ctx.product.creator.displayName} will add you on ${ctx.settings.indicatorPlatform}, and we'll tell you when it's done.`);
}

export async function setIndicatorAccess(formData: FormData) {
  const a = await db.indicatorAccess.findUnique({ where: { id: String(formData.get("accessId") ?? "") }, include: { product: { select: { title: true } } } });
  if (!a) return;
  const ctx = await manage(a.productId);
  if (!ctx) return;
  const grant = formData.get("grant") === "1";
  await db.indicatorAccess.update({
    where: { id: a.id },
    data: grant ? { status: "GRANTED", grantedAt: new Date(), revokedAt: null } : { status: "REVOKED", revokedAt: new Date() },
  });
  if (grant) {
    await notify(a.userId, {
      type: "indicator.granted",
      title: `You have access to ${a.product.title}`,
      body: `It's been added to your ${ctx.settings.indicatorPlatform} account (${a.platformUsername}). Open ${ctx.settings.indicatorPlatform} to find it.`,
      url: insidePath(ctx.product.creator.username, ctx.product.slug),
      email: "orders",
    });
  }
  await flash(grant ? "Marked as added. The buyer has been told." : "Marked as removed.");
  refresh();
}

// ───────────────────────────── Members ─────────────────────────────

export async function removeMember(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const ctx = await manage(productId);
  if (!ctx || !userId || userId === ctx.product.creatorId) return;
  const ent = await db.entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
  if (!ent || ent.status !== "ACTIVE") return;
  const now = new Date();
  const subs = await db.subscription.findMany({ where: { buyerId: userId, productId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } });
  await db.$transaction([
    db.entitlement.update({ where: { id: ent.id }, data: { status: "REVOKED", endsAt: now } }),
    db.subscription.updateMany({ where: { id: { in: subs.map((s) => s.id) } }, data: { status: "CANCELED", canceledAt: now, cancelAtPeriodEnd: false } }),
    db.block.upsert({
      where: { blockerId_blockedId: { blockerId: ctx.product.creatorId, blockedId: userId } },
      create: { blockerId: ctx.product.creatorId, blockedId: userId },
      update: {},
    }),
  ]);
  if (features.stripe) {
    for (const s of subs) {
      if (!s.stripeSubscriptionId) continue;
      try {
        await stripe().subscriptions.cancel(s.stripeSubscriptionId);
      } catch (err) {
        console.error("[content] couldn't cancel Stripe subscription", err);
      }
    }
  }
  await audit(ctx.viewer.id, "member.remove", { type: "user", id: userId }, { productId });
  await notify(userId, {
    type: "community.removed",
    title: `You were removed from ${ctx.product.title}`,
    body: "Your access has ended and you won't be charged again. If you think this was a mistake, contact support.",
    url: "/settings/billing",
    email: "orders",
  });
  await flash("Member removed. They won't be charged again. If a refund is fair, send it from Sales.");
  refresh();
}

/** The creator lets someone in for free (a friend, a tester, a giveaway winner). */
export async function giftAccess(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      productId: z.string().min(1),
      username: z
        .string()
        .trim()
        .transform((v) => v.replace(/^@/, "").toLowerCase())
        .pipe(z.string().min(3, "Enter their username").max(24, "Usernames are 24 characters at most")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const ctx = await manage(parsed.data.productId);
  if (!ctx) return fail(NOPE);
  const rl = await rateLimit(`gift:${ctx.viewer.id}`, 50, 86400);
  if (!rl.ok) return fail("That's a lot of free passes today. Try again tomorrow.");
  const person = await db.user.findUnique({ where: { username: parsed.data.username }, select: { id: true, status: true, displayName: true } });
  if (!person || person.status !== "ACTIVE") return fail("No one has that username.", formData, { username: ["Check the spelling"] });
  if (person.id === ctx.product.creatorId) return fail("That's you. You always have access.", formData);
  const existing = await db.entitlement.findUnique({ where: { userId_productId: { userId: person.id, productId: ctx.product.id } } });
  if (existing?.status === "ACTIVE" && (!existing.endsAt || existing.endsAt > new Date())) return fail(`@${parsed.data.username} already has access.`, formData);
  if (ctx.product.memberLimit) {
    const active = await db.entitlement.count({ where: { productId: ctx.product.id, status: "ACTIVE" } });
    if (active >= ctx.product.memberLimit) return fail("You've reached your member limit. Raise it in the listing first.", formData);
  }
  const data = {
    source: "GIFT" as const,
    status: "ACTIVE" as const,
    startsAt: new Date(),
    endsAt: null,
    priceId: null,
    orderId: null,
    subscriptionId: null,
    sessionsTotal: ctx.product.type === "MENTORING" ? 1 : null,
    sessionsUsed: 0,
  };
  await db.$transaction([
    db.entitlement.upsert({
      where: { userId_productId: { userId: person.id, productId: ctx.product.id } },
      create: { userId: person.id, productId: ctx.product.id, ...data },
      update: data,
    }),
    db.block.deleteMany({ where: { blockerId: ctx.product.creatorId, blockedId: person.id } }),
  ]);
  await audit(ctx.viewer.id, "member.gift", { type: "user", id: person.id }, { productId: ctx.product.id });
  await notify(person.id, {
    type: "community.gift",
    title: `${ctx.product.creator.displayName} gave you free access to ${ctx.product.title}`,
    body: "It's in your library now.",
    url: insidePath(ctx.product.creator.username, ctx.product.slug),
    email: "orders",
    ctaLabel: "Open it",
  });
  return success(`${person.displayName} now has access and has been told.`);
}
