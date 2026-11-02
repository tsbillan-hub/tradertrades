"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalUrl, success, type ActionState } from "@/lib/forms";
import { getViewer } from "@/server/dal";
import { accessById, canPostIn } from "@/server/inside";
import { markChannelRead, notifyMembers } from "@/server/community";
import { checkText } from "@/server/moderation";
import { flash } from "@/server/flash";
import { notify } from "@/server/notify";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { ALERT_STATE_LABEL, REACTIONS } from "@/lib/community";
import { insidePath } from "@/lib/paths";
import { toEmbedUrl, truncate } from "@/lib/utils";

const NOT_ALLOWED = "You can't do that here.";

function excerpt(text: string, n = 140) {
  return truncate(text.replace(/\s+/g, " ").trim(), n);
}

/** Media a person attached to a post: theirs, for this product, of the right kind. */
async function ownMedia(ids: string[], userId: string, productId: string, purposes: string[]) {
  if (!ids.length) return [];
  const rows = await db.media.findMany({ where: { id: { in: ids }, ownerId: userId, productId, purpose: { in: purposes } }, select: { id: true } });
  return rows.length === new Set(ids).size ? ids : null;
}

// ───────────────────────────── Posts ─────────────────────────────

const postSchema = z
  .object({
    channelId: z.string().min(1),
    body: z.string().trim().max(5000, "5,000 characters at most"),
    embedUrl: optionalUrl,
    imageIds: z.array(z.string().max(40)).max(4, "Up to 4 images"),
    fileIds: z.array(z.string().max(40)).max(5, "Up to 5 files"),
    videoId: z.string().max(40).optional(),
  })
  .refine((d) => d.body.length > 0 || d.imageIds.length > 0 || d.fileIds.length > 0 || Boolean(d.videoId) || Boolean(d.embedUrl), {
    message: "Write something first",
    path: ["body"],
  });

export async function createPost(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = postSchema.safeParse(formObject(formData, ["imageIds", "fileIds"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const channel = await db.channel.findUnique({ where: { id: d.channelId } });
  if (!channel) return fail("This channel no longer exists.");
  const ctx = await accessById(channel.productId);
  if (!ctx) return fail(NOT_ALLOWED);
  const me = ctx.viewer;
  if (!me.emailVerifiedAt) return fail("Confirm your email first, then you can post.");
  if (channel.kind === "ALERTS") return fail("Use the alert form in this channel.");
  if (!canPostIn(channel, ctx)) return fail(`Only ${ctx.product.creator.displayName} posts in this channel.`);

  const rl = await rateLimit(`post:${me.id}`, 20, 600);
  if (!rl.ok) return fail("You're posting very fast. Take a breather and try again in a few minutes.", formData);

  if (d.embedUrl && !toEmbedUrl(d.embedUrl)) return fail("Video links can be YouTube, Vimeo or Loom.", formData, { embedUrl: ["Use a YouTube, Vimeo or Loom link"] });
  const images = await ownMedia(d.imageIds, me.id, channel.productId, ["post"]);
  // Only the creator can attach files and member-only videos.
  const files = ctx.canManage ? await ownMedia(d.fileIds, me.id, channel.productId, ["file"]) : d.fileIds.length ? null : [];
  const video = d.videoId ? (ctx.canManage ? await ownMedia([d.videoId], me.id, channel.productId, ["lesson"]) : null) : [];
  if (!images || !files || !video) return fail("One of the attachments didn't upload properly. Remove it and add it again.", formData);

  // The creator is selling, so their own claims are held to the listing rules. Members' posts are flagged for our team instead.
  const check = await checkText(d.body, null, { block: ctx.canManage });
  if (check.blocked) return fail(check.message, formData);

  const post = await db.post.create({
    data: {
      channelId: channel.id,
      productId: channel.productId,
      authorId: me.id,
      body: d.body,
      embedUrl: d.embedUrl ?? null,
      mediaIds: [...images, ...files, ...video],
    },
  });
  if (check.hits.length) await checkText(d.body, { type: "POST", id: post.id }, { block: ctx.canManage });
  await markChannelRead(me.id, channel.id);

  const url = insidePath(ctx.product.creator.username, ctx.product.slug, `/post/${post.id}`);
  if (ctx.isOwner && (channel.kind === "ANNOUNCEMENTS" || channel.kind === "RESOURCES")) {
    const title = `${me.displayName} posted in ${ctx.product.title}`;
    after(() =>
      notifyMembers(
        channel.productId,
        { type: "community.post", title, body: excerpt(d.body || "New post"), url, ctaLabel: "Read it" },
        { exceptUserId: me.id, email: channel.kind === "ANNOUNCEMENTS" },
      ).catch((err) => console.error("[community] fan-out failed", err)),
    );
  }
  return success("Posted.");
}

const editSchema = z.object({ postId: z.string().min(1), body: z.string().trim().min(1, "Write something").max(5000, "5,000 characters at most") });

export async function editPost(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const me = await getViewer();
  const post = await db.post.findUnique({ where: { id: parsed.data.postId } });
  if (!me || !post || post.deletedAt || post.authorId !== me.id) return fail(NOT_ALLOWED);
  if (post.isAlert) return fail("Alerts are locked once posted. Add an update instead.");
  const ctx = await accessById(post.productId);
  if (!ctx) return fail(NOT_ALLOWED);
  const check = await checkText(parsed.data.body, null, { block: ctx.canManage });
  if (check.blocked) return fail(check.message, formData);
  await db.post.update({ where: { id: post.id }, data: { body: parsed.data.body, editedAt: new Date() } });
  if (check.hits.length) await checkText(parsed.data.body, { type: "POST", id: post.id }, { block: ctx.canManage });
  return success("Saved.");
}

export async function deletePost(formData: FormData) {
  const me = await getViewer();
  const post = await db.post.findUnique({ where: { id: String(formData.get("postId") ?? "") } });
  if (!me || !post || post.deletedAt) return;
  const ctx = await accessById(post.productId);
  if (!ctx) return;
  const mine = post.authorId === me.id;
  if (!mine && !ctx.canManage) return;
  // Alerts stay up for good, wins and losses. Only our team can take one down (for a rules problem).
  if (post.isAlert && !ctx.isAdmin) {
    await flash("Alerts can't be deleted. Add an update instead.", "error");
    return;
  }
  await db.post.update({ where: { id: post.id }, data: { deletedAt: new Date(), pinnedAt: null } });
  if (!mine) await audit(me.id, "post.remove", { type: "post", id: post.id });
  await flash(mine ? "Post deleted." : "Post removed.");
  refresh();
}

export async function togglePin(formData: FormData) {
  const me = await getViewer();
  const post = await db.post.findUnique({ where: { id: String(formData.get("postId") ?? "") } });
  if (!me || !post || post.deletedAt) return;
  const ctx = await accessById(post.productId);
  if (!ctx?.canManage) return;
  if (!post.pinnedAt) {
    const pinned = await db.post.count({ where: { channelId: post.channelId, pinnedAt: { not: null }, deletedAt: null } });
    if (pinned >= 3) {
      await flash("You can pin up to 3 posts per channel. Unpin one first.", "error");
      return;
    }
  }
  await db.post.update({ where: { id: post.id }, data: { pinnedAt: post.pinnedAt ? null : new Date() } });
  await flash(post.pinnedAt ? "Unpinned." : "Pinned to the top.");
  refresh();
}

export async function toggleReaction(formData: FormData) {
  const me = await getViewer();
  const emoji = String(formData.get("emoji") ?? "");
  const post = await db.post.findUnique({ where: { id: String(formData.get("postId") ?? "") }, select: { id: true, productId: true, deletedAt: true } });
  if (!me || !post || post.deletedAt || !(REACTIONS as readonly string[]).includes(emoji)) return;
  const ctx = await accessById(post.productId);
  if (!ctx) return;
  const rl = await rateLimit(`react:${me.id}`, 120, 60);
  if (!rl.ok) return;
  const key = { postId_userId_emoji: { postId: post.id, userId: me.id, emoji } };
  const existing = await db.reaction.findUnique({ where: key });
  if (existing) await db.reaction.delete({ where: key });
  else await db.reaction.create({ data: { postId: post.id, userId: me.id, emoji } }).catch(() => null);
  refresh();
}

// ───────────────────────────── Comments ─────────────────────────────

const commentSchema = z.object({ postId: z.string().min(1), body: z.string().trim().min(1, "Write a reply").max(2000, "2,000 characters at most") });

export async function addComment(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const post = await db.post.findUnique({ where: { id: parsed.data.postId }, include: { channel: true } });
  if (!post || post.deletedAt) return fail("This post was removed.");
  const ctx = await accessById(post.productId);
  if (!ctx) return fail(NOT_ALLOWED);
  const me = ctx.viewer;
  if (!me.emailVerifiedAt) return fail("Confirm your email first, then you can reply.");
  if (me.status !== "ACTIVE") return fail(NOT_ALLOWED);
  const rl = await rateLimit(`comment:${me.id}`, 40, 600);
  if (!rl.ok) return fail("You're replying very fast. Try again in a few minutes.", formData);

  const check = await checkText(parsed.data.body, null, { block: false });
  const comment = await db.comment.create({ data: { postId: post.id, authorId: me.id, body: parsed.data.body } });
  await db.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });
  if (check.hits.length) await checkText(parsed.data.body, { type: "COMMENT", id: comment.id }, { block: false });

  if (post.authorId !== me.id) {
    const url = insidePath(ctx.product.creator.username, ctx.product.slug, `/post/${post.id}#c-${comment.id}`);
    after(() =>
      notify(post.authorId, { type: "community.reply", title: `${me.displayName} replied to your post`, body: excerpt(parsed.data.body), url }).catch((err) =>
        console.error("[community] reply notice failed", err),
      ),
    );
  }
  return success("Replied.");
}

export async function deleteComment(formData: FormData) {
  const me = await getViewer();
  const comment = await db.comment.findUnique({ where: { id: String(formData.get("commentId") ?? "") }, include: { post: { select: { id: true, productId: true } } } });
  if (!me || !comment || comment.deletedAt) return;
  const ctx = await accessById(comment.post.productId);
  if (!ctx) return;
  const mine = comment.authorId === me.id;
  if (!mine && !ctx.canManage) return;
  await db.$transaction([
    db.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } }),
    db.post.update({ where: { id: comment.post.id }, data: { commentCount: { decrement: 1 } } }),
  ]);
  if (!mine) await audit(me.id, "comment.remove", { type: "comment", id: comment.id });
  await flash(mine ? "Reply deleted." : "Reply removed.");
  refresh();
}

// ───────────────────────────── Alerts ─────────────────────────────

const level = z
  .string()
  .trim()
  .min(1, "Required")
  .max(24, "Too long")
  .regex(/^[0-9.,\s-]+$/, "Numbers only, like 21450.25");

const alertSchema = z.object({
  channelId: z.string().min(1),
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Which market?")
    .max(20, "20 characters at most")
    .regex(/^[A-Z0-9!/.:_-]+$/, "Letters and numbers, like NQ, EURUSD or BTC/USD"),
  direction: z.enum(["LONG", "SHORT"], { error: "Long or short?" }),
  entry: level,
  stop: level,
  target: level,
  reasoning: z.string().trim().min(20, "Explain the idea in at least 20 characters").max(2000, "2,000 characters at most"),
  confirm: z.literal("on", { error: "Tick the box to confirm" }),
});

export async function createAlert(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = alertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const channel = await db.channel.findUnique({ where: { id: d.channelId } });
  if (!channel || channel.kind !== "ALERTS") return fail("This isn't an alerts channel.");
  const ctx = await accessById(channel.productId);
  if (!ctx?.canManage) return fail("Only the creator posts alerts.");
  const me = ctx.viewer;
  const rl = await rateLimit(`alert:${me.id}`, 30, 3600);
  if (!rl.ok) return fail("That's a lot of alerts in an hour. Try again later.", formData);

  const check = await checkText(d.reasoning, null, { block: true });
  if (check.blocked) return fail(check.message, formData);

  const post = await db.post.create({
    data: {
      channelId: channel.id,
      productId: channel.productId,
      authorId: me.id,
      body: d.reasoning,
      isAlert: true,
      symbol: d.symbol,
      direction: d.direction,
      entry: d.entry,
      stop: d.stop,
      target: d.target,
      reasoning: d.reasoning,
      alertState: "OPEN",
    },
  });
  if (check.hits.length) await checkText(d.reasoning, { type: "POST", id: post.id }, { block: true });
  await markChannelRead(me.id, channel.id);
  await audit(me.id, "alert.create", { type: "post", id: post.id }, { symbol: d.symbol, direction: d.direction });

  const url = insidePath(ctx.product.creator.username, ctx.product.slug, `/post/${post.id}`);
  after(() =>
    notifyMembers(
      channel.productId,
      {
        type: "community.alert",
        title: `New alert: ${d.direction === "LONG" ? "Long" : "Short"} ${d.symbol}`,
        body: `Entry ${d.entry}, stop ${d.stop}, target ${d.target}. ${excerpt(d.reasoning, 100)}`,
        url,
        ctaLabel: "See the alert",
      },
      { exceptUserId: me.id, email: true },
    ).catch((err) => console.error("[community] alert fan-out failed", err)),
  );
  return success("Alert posted. It's time stamped and locked.");
}

const updateSchema = z.object({
  postId: z.string().min(1),
  state: z.enum(["OPEN", "TARGET_HIT", "STOPPED", "CLOSED", "CANCELED"]),
  note: z.string().trim().min(3, "Add a short note").max(500, "500 characters at most"),
});

export async function addAlertUpdate(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const post = await db.post.findUnique({ where: { id: d.postId } });
  if (!post || !post.isAlert || post.deletedAt) return fail("Alert not found.");
  const ctx = await accessById(post.productId);
  if (!ctx?.canManage) return fail("Only the creator updates alerts.");
  if (post.alertState && ALERT_STATE_LABEL[post.alertState]?.final) return fail("This alert is already closed.");
  const check = await checkText(d.note, null, { block: true });
  if (check.blocked) return fail(check.message, formData);

  await db.$transaction([
    db.alertUpdate.create({ data: { postId: post.id, state: d.state, note: d.note } }),
    db.post.update({ where: { id: post.id }, data: { alertState: d.state } }),
  ]);

  if (ALERT_STATE_LABEL[d.state]?.final) {
    const url = insidePath(ctx.product.creator.username, ctx.product.slug, `/post/${post.id}`);
    after(() =>
      notifyMembers(
        post.productId,
        { type: "community.alert", title: `${post.symbol}: ${ALERT_STATE_LABEL[d.state].label.toLowerCase()}`, body: excerpt(d.note), url },
        { exceptUserId: ctx.viewer.id },
      ).catch((err) => console.error("[community] alert update fan-out failed", err)),
    );
  }
  return success("Update added.");
}
