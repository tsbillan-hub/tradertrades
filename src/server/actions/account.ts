"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { emailRule, fail, invalid, passwordRule, success, usernameRule, type ActionState } from "@/lib/forms";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { currentSessionId, destroySession } from "@/server/auth/session";
import { issueToken } from "@/server/auth/tokens";
import { decrypt, encrypt } from "@/server/crypto";
import { hashBackupCode, newBackupCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/server/auth/totp";
import { requireUser } from "@/server/dal";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { EMAIL_PREFS, type EmailPref } from "@/server/notify";
import { flash } from "@/server/flash";

export async function changeUsername(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ username: usernameRule }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { username } = parsed.data;
  if (username === user.username) return success("That's already your username.");
  const rl = await rateLimit(`username:${user.id}`, 3, 86400 * 7);
  if (!rl.ok) return fail("You've changed your username a few times this week. Try again later.", formData);
  const taken = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (taken) return fail("That username is taken.", formData, { username: ["That username is taken"] });
  await db.user.update({ where: { id: user.id }, data: { username } });
  await audit(user.id, "user.username.change", { type: "user", id: user.id }, { from: user.username, to: username });
  refresh();
  return success(`Your username is now @${username}. Your old profile link stops working.`);
}

export async function requestEmailChange(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ email: emailRule, currentPassword: z.string().min(1, "Enter your password") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { email, currentPassword } = parsed.data;
  if (!(await verifyPassword(currentPassword, user.passwordHash))) return fail("Your password isn't right.", formData, { currentPassword: ["Wrong password"] });
  if (email === user.email) return fail("That's already your email.", formData);
  const rl = await rateLimit(`email-change:${user.id}`, 4, 3600);
  if (!rl.ok) return fail("Too many tries. Wait an hour.", formData);
  const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) return fail("Another account uses that email.", formData, { email: ["Another account uses that email"] });
  const token = await issueToken(user.id, "CHANGE_EMAIL", { email });
  await sendEmail(email, emails.changeEmail(user.displayName, absoluteUrl(`/api/auth/change-email?token=${token}`), email), { template: "change-email", userId: user.id });
  return success(`We sent a link to ${email}. Your email changes when you tap it.`);
}

export async function changePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: passwordRule }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const rl = await rateLimit(`pw-change:${user.id}`, 6, 3600);
  if (!rl.ok) return fail("Too many tries. Wait an hour.");
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return fail("Your current password isn't right.", undefined, { currentPassword: ["Wrong password"] });
  const sid = await currentSessionId();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } }),
    db.session.deleteMany({ where: { userId: user.id, NOT: { id: sid ?? "" } } }),
  ]);
  await sendEmail(user.email, emails.passwordChanged(user.displayName), { template: "password-changed", userId: user.id });
  await audit(user.id, "user.password.change", { type: "user", id: user.id });
  return success("Password changed. Other devices were signed out.");
}

/** Step 1 of 2FA: make a secret and show the QR code. Nothing is switched on until a code is confirmed. */
export async function startTwoFactor(): Promise<ActionState> {
  const user = await requireUser();
  if (user.twoFactorEnabledAt) return fail("Two-step sign in is already on.");
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: encrypt(secret) } });
  const url = otpauthUrl(secret, user.email);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#16130F", light: "#FFFFFF" } });
  return success(undefined, { qr, secret });
}

export async function confirmTwoFactor(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "");
  if (!user.twoFactorSecret || user.twoFactorEnabledAt) return fail("Start setup again.");
  const rl = await rateLimit(`2fa-setup:${user.id}`, 10, 900);
  if (!rl.ok) return fail("Too many tries. Wait 15 minutes.");
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) return fail("That code didn't match. Check the time on your phone and try again.", undefined, { code: ["Wrong code"] });
  const codes = newBackupCodes();
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorEnabledAt: new Date(), backupCodes: codes.map(hashBackupCode) },
  });
  await audit(user.id, "user.2fa.enable", { type: "user", id: user.id });
  return success("Two-step sign in is on.", { backupCodes: codes });
}

export async function disableTwoFactor(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const password = String(formData.get("currentPassword") ?? "");
  if (!(await verifyPassword(password, user.passwordHash))) return fail("Your password isn't right.", undefined, { currentPassword: ["Wrong password"] });
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: null, twoFactorSecret: null, backupCodes: [] } });
  await audit(user.id, "user.2fa.disable", { type: "user", id: user.id });
  refresh();
  return success("Two-step sign in is off.");
}

export async function regenerateBackupCodes(): Promise<ActionState> {
  const user = await requireUser();
  if (!user.twoFactorEnabledAt) return fail("Turn on two-step sign in first.");
  const codes = newBackupCodes();
  await db.user.update({ where: { id: user.id }, data: { backupCodes: codes.map(hashBackupCode) } });
  await audit(user.id, "user.2fa.backup_codes", { type: "user", id: user.id });
  return success("New backup codes made. The old ones no longer work.", { backupCodes: codes });
}

export async function revokeSession(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("sessionId") ?? "");
  await db.session.deleteMany({ where: { id, userId: user.id } });
  refresh();
}

export async function revokeOtherSessions() {
  const user = await requireUser();
  const sid = await currentSessionId();
  await db.session.deleteMany({ where: { userId: user.id, NOT: { id: sid ?? "" } } });
  await flash("Signed out of every other device.");
  refresh();
}

export async function updateEmailPrefs(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const prefs: Record<string, boolean> = {};
  for (const p of EMAIL_PREFS) prefs[p.key as EmailPref] = formData.get(p.key) === "on";
  const dm = String(formData.get("dmPolicy") ?? "EVERYONE");
  await db.user.update({
    where: { id: user.id },
    data: { emailPrefs: prefs, dmPolicy: dm === "NOBODY" ? "NOBODY" : dm === "CUSTOMERS" ? "CUSTOMERS" : "EVERYONE" },
  });
  refresh();
  return success("Saved.");
}

export async function saveTheme(formData: FormData) {
  const user = await requireUser();
  const t = String(formData.get("theme") ?? "SYSTEM");
  await db.user.update({ where: { id: user.id }, data: { theme: t === "LIGHT" ? "LIGHT" : t === "DARK" ? "DARK" : "SYSTEM" } });
}

export async function deleteAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ currentPassword: z.string().min(1, "Enter your password"), confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return fail("Your password isn't right.", undefined, { currentPassword: ["Wrong password"] });
  const activeSales = await db.subscription.count({ where: { sellerId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } });
  if (activeSales > 0) return fail("You still have members paying for a subscription. Cancel or move them first, or contact support.");

  const tombstone = `deleted-${user.id}`;
  await db.$transaction([
    db.product.updateMany({ where: { creatorId: user.id }, data: { status: "ARCHIVED" } }),
    db.subscription.updateMany({ where: { buyerId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, data: { cancelAtPeriodEnd: true } }),
    db.socialLink.deleteMany({ where: { userId: user.id } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.user.update({
      where: { id: user.id },
      data: {
        status: "DELETED",
        email: `${tombstone}@deleted.invalid`,
        username: tombstone.slice(0, 24).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        displayName: "Deleted user",
        bio: null,
        about: null,
        avatarUrl: null,
        bannerUrl: null,
        location: null,
        website: null,
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
        backupCodes: [],
        passwordHash: await hashPassword(crypto.randomUUID()),
      },
    }),
  ]);
  await audit(user.id, "user.delete", { type: "user", id: user.id });
  await destroySession();
  redirect("/?deleted=1");
}
