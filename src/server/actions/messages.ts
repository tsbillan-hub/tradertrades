"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, invalid, success, type ActionState } from "@/lib/forms";
import { requireUser, requireVerifiedUser } from "@/server/dal";
import { rateLimit } from "@/server/rate-limit";
import { checkText } from "@/server/moderation";
import { notify } from "@/server/notify";
import { canMessage, findDirect, isBlocked } from "@/server/messaging";

const bodyRule = z.string().trim().min(1, "Write a message").max(4000, "That's a long one. Keep it under 4,000 characters.");

export async function startConversation(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (user.status !== "ACTIVE") return fail("Your account can't send messages right now.");
  const parsed = z.object({ toId: z.string().min(1), body: bodyRule, subject: z.string().max(120).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { toId, body, subject } = parsed.data;
  const reason = await canMessage(user.id, toId);
  if (reason) return fail(reason, formData);

  let convo = await findDirect(user.id, toId);
  if (!convo) {
    const rl = await rateLimit(`dm-new:${user.id}`, 20, 86400);
    if (!rl.ok) return fail("You've started a lot of new chats today. Try again tomorrow.", formData);
  }
  const rl2 = await rateLimit(`dm:${user.id}`, 60, 600);
  if (!rl2.ok) return fail("Slow down a little. Try again in a few minutes.", formData);

  const check = await checkText(body, null);
  if (check.blocked) return fail(check.message, formData);

  const now = new Date();
  if (!convo) {
    convo = await db.conversation.create({
      data: { subject: subject || null, lastMessageAt: now, members: { create: [{ userId: user.id, lastReadAt: now }, { userId: toId }] } },
      include: { members: true },
    });
    await notify(toId, { type: "message.new", title: `New message from ${user.displayName}`, body: body.slice(0, 140), url: `/messages/${convo.id}`, email: "messages" });
  }
  const msg = await db.message.create({ data: { conversationId: convo.id, senderId: user.id, body } });
  await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: msg.createdAt } });
  await db.conversationMember.updateMany({ where: { conversationId: convo.id, userId: user.id }, data: { lastReadAt: msg.createdAt, archivedAt: null } });
  await db.conversationMember.updateMany({ where: { conversationId: convo.id, NOT: { userId: user.id } }, data: { archivedAt: null } });
  await checkText(body, { type: "MESSAGE", id: msg.id });
  redirect(`/messages/${convo.id}`);
}

export async function sendMessage(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (user.status !== "ACTIVE") return fail("Your account can't send messages right now.");
  const parsed = z.object({ conversationId: z.string().min(1), body: bodyRule }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { conversationId, body } = parsed.data;
  const convo = await db.conversation.findUnique({ where: { id: conversationId }, include: { members: true } });
  if (!convo || !convo.members.some((m) => m.userId === user.id)) return fail("Conversation not found.");
  const others = convo.members.filter((m) => m.userId !== user.id);
  for (const o of others) if (await isBlocked(user.id, o.userId)) return fail("You can't message this person.", formData);
  const rl = await rateLimit(`dm:${user.id}`, 60, 600);
  if (!rl.ok) return fail("Slow down a little. Try again in a few minutes.", formData);
  const check = await checkText(body, null);
  if (check.blocked) return fail(check.message, formData);

  const msg = await db.message.create({ data: { conversationId, senderId: user.id, body } });
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } }),
    db.conversationMember.updateMany({ where: { conversationId, userId: user.id }, data: { lastReadAt: msg.createdAt } }),
    db.conversationMember.updateMany({ where: { conversationId }, data: { archivedAt: null } }),
  ]);
  await checkText(body, { type: "MESSAGE", id: msg.id });
  return success(undefined, { id: msg.id });
}

export async function markConversationRead(conversationId: string) {
  const user = await requireUser();
  await db.conversationMember.updateMany({ where: { conversationId, userId: user.id }, data: { lastReadAt: new Date() } });
}

export async function archiveConversation(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("conversationId") ?? "");
  await db.conversationMember.updateMany({ where: { conversationId: id, userId: user.id }, data: { archivedAt: new Date() } });
  redirect("/messages");
}

export async function blockUser(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("userId") ?? "");
  if (!id || id === user.id) return;
  await db.block.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: id } }, create: { blockerId: user.id, blockedId: id }, update: {} });
  await db.follow.deleteMany({ where: { OR: [{ followerId: user.id, followingId: id }, { followerId: id, followingId: user.id }] } });
  refresh();
}

export async function unblockUser(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("userId") ?? "");
  await db.block.deleteMany({ where: { blockerId: user.id, blockedId: id } });
  refresh();
}
