import "server-only";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import type { EmailContent } from "./templates";

let resend: Resend | null = null;

/** "Name via TraderTrades <hello@...>", so people see who an email is really from. */
function fromWithName(name: string) {
  const address = /<([^>]+)>/.exec(env.emailFrom)?.[1] ?? env.emailFrom;
  const clean = name.replace(/["<>\r\n\\]/g, "").trim().slice(0, 60);
  return clean ? `"${clean} via TraderTrades" <${address}>` : env.emailFrom;
}

/**
 * Sends through Resend when a key is set. Without one, the email is kept in the outbox
 * (admins see it at /admin/emails, and people can open their own from the confirm screens).
 */
export async function sendEmail(
  to: string,
  content: EmailContent,
  meta: { template: string; userId?: string | null; replyTo?: string; fromName?: string; headers?: Record<string, string> },
) {
  if (!features.email) {
    await db.emailLog.create({
      data: { toEmail: to, userId: meta.userId ?? null, template: meta.template, subject: content.subject, html: content.html, text: content.text, status: "LOGGED" },
    });
    return { ok: true, logged: true };
  }
  try {
    resend ??= new Resend(env.resendKey);
    const res = await resend.emails.send({
      from: meta.fromName ? fromWithName(meta.fromName) : env.emailFrom,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      replyTo: meta.replyTo,
      headers: meta.headers,
    });
    const id = res.data?.id ?? null;
    await db.emailLog.create({
      data: {
        toEmail: to,
        userId: meta.userId ?? null,
        template: meta.template,
        subject: content.subject,
        html: content.html,
        text: content.text,
        status: res.error ? "FAILED" : "SENT",
        providerId: id,
        error: res.error ? String(res.error.message ?? res.error) : null,
      },
    });
    return { ok: !res.error, logged: false };
  } catch (err) {
    await db.emailLog.create({
      data: { toEmail: to, userId: meta.userId ?? null, template: meta.template, subject: content.subject, html: content.html, text: content.text, status: "FAILED", error: String(err) },
    });
    return { ok: false, logged: false };
  }
}

type BatchItem = { to: string; userId?: string | null; content: EmailContent; headers?: Record<string, string> };

/** Resend takes up to 100 emails per call, and 2 calls a second on a standard plan. */
const BATCH_SIZE = 100;
const BATCH_GAP_MS = 600;

/**
 * Many emails at once (a creator emailing their customers), through Resend's batch endpoint.
 * Each batch has its own idempotency key, so a retried request never sends twice.
 * Only the first email of each batch keeps its full body in the log, so a big send doesn't fill the database with copies.
 */
export async function sendEmailBatch(items: BatchItem[], meta: { template: string; key: string; fromName?: string }) {
  if (!items.length) return { sent: 0, failed: 0 };
  if (!features.email) {
    await db.emailLog.createMany({
      data: items.map((i) => ({ toEmail: i.to, userId: i.userId ?? null, template: meta.template, subject: i.content.subject, html: i.content.html, text: i.content.text, status: "LOGGED" as const })),
    });
    return { sent: items.length, failed: 0 };
  }
  resend ??= new Resend(env.resendKey);
  const from = meta.fromName ? fromWithName(meta.fromName) : env.emailFrom;
  let sent = 0;
  let failed = 0;
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const chunk = items.slice(start, start + BATCH_SIZE);
    if (start > 0) await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    let ids: string[] = [];
    let error: string | null = null;
    try {
      const res = await resend.batch.send(
        chunk.map((c) => ({ from, to: c.to, subject: c.content.subject, html: c.content.html, text: c.content.text, headers: c.headers })),
        { idempotencyKey: `${meta.key}-${start / BATCH_SIZE}` },
      );
      if (res.error) error = String(res.error.message ?? res.error);
      else ids = res.data?.data.map((d) => d.id) ?? [];
    } catch (err) {
      error = String(err);
    }
    if (error) failed += chunk.length;
    else sent += chunk.length;
    await db.emailLog.createMany({
      data: chunk.map((c, j) => ({
        toEmail: c.to,
        userId: c.userId ?? null,
        template: meta.template,
        subject: c.content.subject,
        html: j === 0 ? c.content.html : "",
        text: j === 0 ? c.content.text : null,
        status: error ? ("FAILED" as const) : ("SENT" as const),
        providerId: ids[j] ?? null,
        error,
      })),
    });
  }
  return { sent, failed };
}
