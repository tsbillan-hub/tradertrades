import "server-only";
import { createHash } from "node:crypto";

function clean(v: string | undefined) {
  const t = v?.trim();
  return t ? t : undefined;
}

export const env = {
  appUrl: (
    clean(process.env.APP_URL) ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000")
  ).replace(/\/$/, ""),
  /**
   * APP_SECRET when set. Otherwise, in production, a secret made from the database address (which holds the
   * database password), so a one-click deploy works with nothing typed in. Set APP_SECRET before real launch.
   */
  appSecret:
    clean(process.env.APP_SECRET) ??
    (process.env.NODE_ENV !== "production"
      ? "dev-only-secret-change-me"
      : process.env.DATABASE_URL
        ? createHash("sha256").update(`tradertrades-app-secret:${process.env.DATABASE_URL}`).digest("hex")
        : ""),
  adminEmails: (clean(process.env.ADMIN_EMAILS) ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  resendKey: clean(process.env.RESEND_API_KEY),
  emailFrom: clean(process.env.EMAIL_FROM) ?? "TraderTrades <hello@tradertrades.com>",
  stripeSecret: clean(process.env.STRIPE_SECRET_KEY),
  stripeWebhookSecret: clean(process.env.STRIPE_WEBHOOK_SECRET),
  blobToken: clean(process.env.BLOB_READ_WRITE_TOKEN),
  dailyKey: clean(process.env.DAILY_API_KEY),
  anthropicKey: clean(process.env.ANTHROPIC_API_KEY),
  supportEmail: clean(process.env.SUPPORT_EMAIL) ?? "support@tradertrades.com",
  isProd: process.env.NODE_ENV === "production",
  /**
   * Preview helpers: test checkout without Stripe and email links shown on screen. When DEMO_MODE isn't set it's on
   * outside production, and in production until Stripe is connected (no real payments are possible before that).
   */
  demoMode: clean(process.env.DEMO_MODE)
    ? process.env.DEMO_MODE === "1"
    : process.env.NODE_ENV !== "production" || !clean(process.env.STRIPE_SECRET_KEY),
};

export const features = {
  /** Real card payments through Stripe. Off means test checkout with no real money. */
  stripe: Boolean(env.stripeSecret),
  /** Real email sending. Off means emails go to the outbox at /admin/emails. */
  email: Boolean(env.resendKey),
  /** Vercel Blob storage for uploads. Off means files are saved on this server's disk. */
  blob: Boolean(env.blobToken),
  /** Daily.co video rooms. Off means calls use a free Jitsi room. */
  daily: Boolean(env.dailyKey),
  /** Extra content checks with Claude. */
  aiChecks: Boolean(env.anthropicKey),
};

export function absoluteUrl(path: string) {
  return `${env.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
