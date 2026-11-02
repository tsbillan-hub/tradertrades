"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { absoluteUrl, env } from "@/lib/env";
import { emailRule, fail, invalid, passwordRule, success, usernameRule, type ActionState } from "@/lib/forms";
import { safeNext } from "@/lib/utils";
import { dummyVerify, hashPassword, verifyPassword } from "@/server/auth/password";
import { SESSION_COOKIE, createSession, destroySession, requestMeta } from "@/server/auth/session";
import { consumeToken, issueToken, peekToken } from "@/server/auth/tokens";
import { decrypt, sha256 } from "@/server/crypto";
import { hashBackupCode, verifyTotp } from "@/server/auth/totp";
import { rateLimit, clearRateLimit } from "@/server/rate-limit";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { audit } from "@/server/audit";
import { getViewer } from "@/server/dal";
import { flash } from "@/server/flash";

const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(50, "50 characters at most"),
  username: usernameRule,
  email: emailRule,
  password: passwordRule,
  accountType: z.enum(["TRADER", "CREATOR", "BUSINESS"]),
  age: z.literal("on", { error: "You need to be 13 or older to use TraderTrades" }),
  terms: z.literal("on", { error: "Please accept the terms to continue" }),
  next: z.string().optional(),
});

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const data = parsed.data;

  const { ip } = await requestMeta();
  const rl = await rateLimit(`signup:${ip}`, 8, 3600);
  if (!rl.ok) return fail("Too many new accounts from this connection. Try again in an hour.", formData);

  const [emailTaken, usernameTaken] = await Promise.all([
    db.user.findUnique({ where: { email: data.email }, select: { id: true } }),
    db.user.findUnique({ where: { username: data.username }, select: { id: true } }),
  ]);
  const fieldErrors: Record<string, string[]> = {};
  if (emailTaken) fieldErrors.email = ["There's already an account with this email. Try signing in."];
  if (usernameTaken) fieldErrors.username = ["That username is taken"];
  if (Object.keys(fieldErrors).length) return fail("Check the highlighted fields.", formData, fieldErrors);

  const now = new Date();
  const user = await db.user.create({
    data: {
      email: data.email,
      username: data.username,
      displayName: data.displayName,
      passwordHash: await hashPassword(data.password),
      accountType: data.accountType,
      ageConfirmedAt: now,
      termsAcceptedAt: now,
      // Signing up signs you in.
      lastLoginAt: now,
      creator: data.accountType === "CREATOR" ? { create: { status: "DRAFT" } } : undefined,
    },
  });
  await audit(user.id, "user.signup", { type: "user", id: user.id }, { accountType: data.accountType });

  const token = await issueToken(user.id, "VERIFY_EMAIL", { email: user.email });
  await sendEmail(user.email, emails.verifyEmail(user.displayName, absoluteUrl(`/api/auth/verify?token=${token}`)), {
    template: "verify-email",
    userId: user.id,
  });

  await createSession(user.id);
  const next = safeNext(data.next, "");
  redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding");
}

const signInSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { login, password, next } = parsed.data;

  const { ip } = await requestMeta();
  const ipLimit = await rateLimit(`login-ip:${ip}`, 30, 900);
  const acctLimit = await rateLimit(`login:${login}`, 10, 900);
  if (!ipLimit.ok || !acctLimit.ok) return fail("Too many tries. Wait 15 minutes, or reset your password.", formData);

  const user = await db.user.findFirst({ where: login.includes("@") ? { email: login } : { username: login } });
  if (!user) {
    await dummyVerify(password);
    return fail("That email or password doesn't match.", formData);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return fail("That email or password doesn't match.", formData);
  if (user.status === "BANNED" || user.status === "DELETED") {
    return fail("This account can't sign in. Contact support if you think this is a mistake.", formData);
  }

  await clearRateLimit(`login:${login}`);
  const needs2fa = Boolean(user.twoFactorEnabledAt && user.twoFactorSecret);
  await createSession(user.id, { twoFactorPending: needs2fa });
  const dest = safeNext(next, "/");
  if (needs2fa) redirect(`/login/2fa?next=${encodeURIComponent(dest)}`);

  await afterSignIn(user.id, user.email, Boolean(user.emailVerifiedAt));
  redirect(dest);
}

async function afterSignIn(userId: string, email: string, verified: boolean) {
  const makeAdmin = verified && env.adminEmails.includes(email.toLowerCase());
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), ...(makeAdmin ? { isAdmin: true } : {}) } });
  await audit(userId, "user.login", { type: "user", id: userId });
}

export async function verifyTwoFactor(_: ActionState, formData: FormData): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""), "/");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || !session.twoFactorPending) redirect("/login");

  const rl = await rateLimit(`2fa:${session.userId}`, 8, 900);
  if (!rl.ok) return fail("Too many tries. Wait 15 minutes and try again.");

  const user = session.user;
  let ok = false;
  if (/^\d{6}$/.test(code.replace(/\s/g, "")) && user.twoFactorSecret) {
    ok = verifyTotp(decrypt(user.twoFactorSecret), code);
  } else if (code.length >= 10) {
    const h = hashBackupCode(code);
    if (user.backupCodes.includes(h)) {
      ok = true;
      await db.user.update({ where: { id: user.id }, data: { backupCodes: user.backupCodes.filter((c) => c !== h) } });
      await audit(user.id, "user.2fa.backup_code_used", { type: "user", id: user.id });
    }
  }
  if (!ok) return fail("That code didn't work. Check your app and try again.", undefined, { code: ["Wrong code"] });

  await db.session.update({ where: { id: session.id }, data: { twoFactorPending: false } });
  await afterSignIn(user.id, user.email, Boolean(user.emailVerifiedAt));
  redirect(next);
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

export async function resendVerification(): Promise<ActionState> {
  const user = await getViewer();
  if (!user) return fail("Sign in first.");
  if (user.emailVerifiedAt) return success("Your email is already confirmed.");
  const rl = await rateLimit(`verify-resend:${user.id}`, 4, 3600);
  if (!rl.ok) return fail("We've sent a few already. Check your spam folder, or try again in an hour.");
  const token = await issueToken(user.id, "VERIFY_EMAIL", { email: user.email });
  await sendEmail(user.email, emails.verifyEmail(user.displayName, absoluteUrl(`/api/auth/verify?token=${token}`)), {
    template: "verify-email",
    userId: user.id,
  });
  return success(`Sent a new link to ${user.email}.`);
}

export async function resendVerificationForm(): Promise<ActionState> {
  return resendVerification();
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailRule }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { ip } = await requestMeta();
  const rl1 = await rateLimit(`reset-ip:${ip}`, 10, 3600);
  const rl2 = await rateLimit(`reset:${parsed.data.email}`, 3, 3600);
  const done = success("If that email has an account, we've sent a reset link. It works for 1 hour.");
  if (!rl1.ok || !rl2.ok) return done;
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user && user.status !== "DELETED" && user.status !== "BANNED") {
    const token = await issueToken(user.id, "RESET_PASSWORD");
    await sendEmail(user.email, emails.resetPassword(user.displayName, absoluteUrl(`/reset-password?token=${token}`)), {
      template: "reset-password",
      userId: user.id,
    });
  }
  return done;
}

export async function resetPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ token: z.string().min(10), password: passwordRule })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const row = await peekToken(parsed.data.token, "RESET_PASSWORD");
  if (!row) return fail("This reset link has expired or was already used. Ask for a new one.");
  await consumeToken(parsed.data.token, "RESET_PASSWORD");
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
  ]);
  const user = await db.user.findUniqueOrThrow({ where: { id: row.userId } });
  await sendEmail(user.email, emails.passwordChanged(user.displayName), { template: "password-changed", userId: user.id });
  await audit(user.id, "user.password.reset", { type: "user", id: user.id });
  await createSession(user.id, { twoFactorPending: Boolean(user.twoFactorEnabledAt) });
  if (user.twoFactorEnabledAt) redirect("/login/2fa?next=/");
  await afterSignIn(user.id, user.email, Boolean(user.emailVerifiedAt));
  await flash("Password updated. You're signed in.");
  redirect("/");
}
