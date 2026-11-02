"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { absoluteUrl, env, features } from "@/lib/env";
import { fail, formObject, invalid, success, type ActionState } from "@/lib/forms";
import { formatDateTime, plural } from "@/lib/utils";
import { requireCreator, requireUser } from "@/server/dal";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { checkText } from "@/server/moderation";
import { rateLimit } from "@/server/rate-limit";
import { emails } from "@/server/email/templates";
import { sendEmail, sendEmailBatch } from "@/server/email/send";
import { BROADCAST_EVERY_HOURS, BROADCAST_MAX, audienceLabel, broadcastRecipients, readUnsubscribeToken, unsubscribeUrl } from "@/server/broadcasts";

const schema = z.object({
  audience: z.string().trim().min(1, "Pick who gets it").max(80),
  subject: z.string().trim().min(3, "Write a subject line").max(120, "120 characters at most"),
  body: z.string().trim().min(10, "Write a few words").max(5000, "5,000 characters at most"),
  intent: z.enum(["send", "test"]).default("send"),
});

function unsubscribeHeaders(userId: string, creatorId: string) {
  const token = new URL(unsubscribeUrl(userId, creatorId)).searchParams.get("t") ?? "";
  return {
    "List-Unsubscribe": `<${absoluteUrl(`/api/unsubscribe?t=${token}`)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** A creator emails people who bought from them or joined. Test sends go only to the creator. */
export async function sendBroadcast(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { audience, subject, body, intent } = parsed.data;

  const check = await checkText(`${subject}\n${body}`, { type: "USER", id: user.id });
  if (check.blocked) return fail(check.message, formData);

  const pageUrl = absoluteUrl(`/u/${user.username}`);
  const content = (userId: string) =>
    emails.broadcast({
      creatorName: user.displayName,
      subject,
      body,
      pageUrl,
      reason: `You're getting this because you bought from or joined ${user.displayName} on TraderTrades. To reply, message them there.`,
      unsubscribeUrl: unsubscribeUrl(userId, user.id),
    });

  if (intent === "test") {
    const rl = await rateLimit(`broadcast-test:${user.id}`, 10, 86_400);
    if (!rl.ok) return fail("That's 10 test emails today. Send the real one, or try again tomorrow.", formData);
    const c = content(user.id);
    await sendEmail(user.email, { ...c, subject: `[Test] ${c.subject}` }, { template: "creator.broadcast.test", userId: user.id, fromName: user.displayName, headers: unsubscribeHeaders(user.id, user.id) });
    if (!features.email) {
      // Preview mode: nothing is really sent, so let them open it from here.
      const saved = env.demoMode ? await db.emailLog.findFirst({ where: { userId: user.id, template: "creator.broadcast.test" }, orderBy: { createdAt: "desc" }, select: { id: true } }) : null;
      return success("Test saved. Email isn't connected yet, so it wasn't really sent.", saved ? { previewUrl: `/api/emails/${saved.id}` } : undefined);
    }
    return success(`Test sent to ${user.email}. Only you got it.`);
  }

  const recipients = await broadcastRecipients(user.id, audience);
  if (!recipients) return fail("Pick who gets it.", formData, { audience: ["Pick who gets it"] });
  if (!recipients.length) return fail("Nobody on that list can get emails right now. People show up here once they buy from you or join.", formData);
  if (recipients.length > BROADCAST_MAX) {
    return fail(`That list has ${recipients.length.toLocaleString("en-US")} people. One email can go to ${BROADCAST_MAX.toLocaleString("en-US")} at most for now. Pick a smaller list.`, formData);
  }
  const label = await audienceLabel(user.id, audience);

  // One email a day. The lock stops two clicks (or two tabs) both getting through.
  const since = new Date(Date.now() - BROADCAST_EVERY_HOURS * 3_600_000);
  const created = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`broadcast:${user.id}`}))::text`;
    const last = await tx.broadcast.findFirst({ where: { creatorId: user.id, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (last) return { wait: new Date(last.createdAt.getTime() + BROADCAST_EVERY_HOURS * 3_600_000) };
    const b = await tx.broadcast.create({ data: { creatorId: user.id, subject, body, audience, audienceLabel: label, recipientCount: recipients.length } });
    return { id: b.id };
  });
  if ("wait" in created) {
    return fail(`You can email your customers once a day. The next one can go after ${formatDateTime(created.wait!, user.timezone)}.`, formData);
  }

  const result = await sendEmailBatch(
    recipients.map((r) => ({ to: r.email, userId: r.id, content: content(r.id), headers: unsubscribeHeaders(r.id, user.id) })),
    { template: "creator.broadcast", key: `broadcast-${created.id}`, fromName: user.displayName },
  );
  await audit(user.id, "broadcast.sent", { type: "broadcast", id: created.id }, { audience, recipients: recipients.length, sent: result.sent, failed: result.failed });
  const message = result.failed
    ? `Sent to ${plural(result.sent, "person", "people")}. ${plural(result.failed, "email")} didn't go through; our team has been told.`
    : `Sent to ${plural(result.sent, "person", "people")}.`;
  if (result.failed) console.error("[broadcast] some emails failed", created.id, result);
  await flash(message);
  refresh();
  return success(message);
}

/** From the link in a creator's email. No sign in needed: the signed link proves whose inbox it came from. */
export async function unsubscribeFromCreator(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const t = readUnsubscribeToken(token);
  if (!t) redirect("/unsubscribe");
  if (t.userId !== t.creatorId) {
    await db.creatorEmailOptOut.upsert({
      where: { userId_creatorId: { userId: t.userId, creatorId: t.creatorId } },
      create: { userId: t.userId, creatorId: t.creatorId },
      update: {},
    });
  }
  redirect(`/unsubscribe?t=${encodeURIComponent(token)}`);
}

/** Undo from the same page, using the same signed link. */
export async function resubscribeWithToken(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const t = readUnsubscribeToken(token);
  if (!t) redirect("/unsubscribe");
  await db.creatorEmailOptOut.deleteMany({ where: { userId: t.userId, creatorId: t.creatorId } });
  redirect(`/unsubscribe?t=${encodeURIComponent(token)}&back=1`);
}

/** Settings: turn one creator's emails back on. */
export async function resubscribeToCreator(formData: FormData) {
  const user = await requireUser();
  const creatorId = z.string().min(1).max(60).safeParse(formData.get("creatorId"));
  if (!creatorId.success) return;
  const { count } = await db.creatorEmailOptOut.deleteMany({ where: { userId: user.id, creatorId: creatorId.data } });
  if (count) await flash("Turned back on. You'll get their emails again.");
  refresh();
}
