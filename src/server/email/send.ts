import "server-only";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import type { EmailContent } from "./templates";

let resend: Resend | null = null;

/**
 * Sends through Resend when a key is set. Without one, the email is kept in the outbox
 * (admins see it at /admin/emails, and people can open their own from the confirm screens).
 */
export async function sendEmail(to: string, content: EmailContent, meta: { template: string; userId?: string | null; replyTo?: string }) {
  if (!features.email) {
    await db.emailLog.create({
      data: { toEmail: to, userId: meta.userId ?? null, template: meta.template, subject: content.subject, html: content.html, text: content.text, status: "LOGGED" },
    });
    return { ok: true, logged: true };
  }
  try {
    resend ??= new Resend(env.resendKey);
    const res = await resend.emails.send({ from: env.emailFrom, to, subject: content.subject, html: content.html, text: content.text, replyTo: meta.replyTo });
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
