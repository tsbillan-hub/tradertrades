import "server-only";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";

export type EmailPref = "orders" | "messages" | "community" | "creators" | "bookings" | "reviews" | "business" | "marketing";

export const EMAIL_PREFS: { key: EmailPref; label: string; hint: string }[] = [
  { key: "orders", label: "Purchases and sales", hint: "Receipts, new sales, refunds and payouts" },
  { key: "bookings", label: "Mentoring calls", hint: "New bookings, reminders and changes" },
  { key: "messages", label: "Messages", hint: "When someone messages you and you're away" },
  { key: "community", label: "Communities", hint: "Announcements and alerts from communities you're in" },
  { key: "creators", label: "Emails from creators", hint: "Updates from creators you bought from. Every email also has a link to stop that one creator's emails" },
  { key: "reviews", label: "Reviews", hint: "New reviews and replies" },
  { key: "business", label: "Brand deals and jobs", hint: "Campaign invites and deals, listing claims, job applications and replies" },
  { key: "marketing", label: "News from TraderTrades", hint: "New features and the occasional update" },
];

export function emailPrefs(raw: unknown): Record<EmailPref, boolean> {
  const base: Record<EmailPref, boolean> = {
    orders: true,
    bookings: true,
    messages: true,
    community: true,
    creators: true,
    reviews: true,
    business: true,
    marketing: false,
  };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(base) as EmailPref[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

type NotifyInput = {
  type: string;
  title: string;
  body?: string;
  url?: string;
  /** Also email it if the person allows this kind of email. */
  email?: EmailPref;
  ctaLabel?: string;
  rows?: [string, string][];
};

export async function notify(userId: string, n: NotifyInput) {
  await db.notification.create({
    data: { userId, type: n.type, title: n.title, body: n.body, url: n.url },
  });
  if (!n.email) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailPrefs: true, emailVerifiedAt: true, status: true } });
  if (!user || !user.emailVerifiedAt || user.status === "DELETED") return;
  if (!emailPrefs(user.emailPrefs)[n.email]) return;
  await sendEmail(
    user.email,
    emails.generic({
      subject: n.title,
      heading: n.title,
      body: n.body ? [n.body] : [],
      rows: n.rows,
      cta: n.url ? { label: n.ctaLabel ?? "Open TraderTrades", url: absoluteUrl(n.url) } : undefined,
    }),
    { template: `notify:${n.type}`, userId },
  );
}
