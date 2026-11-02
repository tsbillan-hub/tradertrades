"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { humanCode } from "@/server/crypto";
import { requireVerifiedUser } from "@/server/dal";
import { audit } from "@/server/audit";
import { notifyAdmins } from "@/server/admin";
import { flash } from "@/server/flash";

async function ownedMedia(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.media.findMany({ where: { id: { in: ids }, ownerId: userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function hasOpen(userId: string, kind: "IDENTITY" | "SOCIALS" | "RESULTS") {
  return db.verificationRequest.findFirst({ where: { userId, kind, status: { in: ["PENDING", "NEEDS_MORE"] } } });
}

export async function requestIdentityCheck(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = z
    .object({ mediaIds: z.array(z.string()).min(1, "Add a photo of your ID").max(4), legalName: z.string().trim().min(2, "Enter your full legal name").max(100), note: optionalText(500) })
    .safeParse(formObject(formData, ["mediaIds"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  if (user.idVerifiedAt) return success("Your ID is already verified.");
  if (await hasOpen(user.id, "IDENTITY")) return fail("You already have an ID check waiting. We'll get back to you soon.");
  const media = await ownedMedia(user.id, parsed.data.mediaIds);
  if (!media.length) return fail("Upload your ID again and retry.");
  const req = await db.verificationRequest.create({
    data: { userId: user.id, kind: "IDENTITY", mediaIds: media, note: parsed.data.note, data: { legalName: parsed.data.legalName } },
  });
  await audit(user.id, "verification.request", { type: "verification", id: req.id }, { kind: "IDENTITY" });
  await notifyAdmins({ type: "admin.verification", title: `ID check to review: ${user.displayName}`, url: "/admin/verification" });
  // The form gives way to the "waiting" note, so the confirmation is a toast.
  const message = "Sent. A person checks IDs, usually within 2 working days. Your ID photos are deleted once we decide.";
  await flash(message);
  refresh();
  return success(message);
}

/** Gives the person a code to put in their social bios. */
export async function startSocialsCheck(): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const links = await db.socialLink.count({ where: { userId: user.id } });
  if (!links) return fail("Add your social links on the Profile tab first.");
  const existing = await hasOpen(user.id, "SOCIALS");
  if (existing) return success("You already have a code.", { code: (existing.data as { code?: string } | null)?.code });
  const code = `TT-${humanCode(1, 6)}`;
  await db.verificationRequest.create({ data: { userId: user.id, kind: "SOCIALS", status: "NEEDS_MORE", data: { code, ready: false } } });
  refresh();
  return success("Code made.", { code });
}

export async function submitSocialsCheck(): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const req = await hasOpen(user.id, "SOCIALS");
  if (!req) return fail("Make a code first.");
  const data = (req.data as Record<string, unknown> | null) ?? {};
  await db.verificationRequest.update({ where: { id: req.id }, data: { status: "PENDING", data: { ...data, ready: true, submittedAt: new Date().toISOString() } } });
  await notifyAdmins({ type: "admin.verification", title: `Socials check to review: ${user.displayName}`, url: "/admin/verification" });
  refresh();
  return success("Thanks. We'll check your bios for the code, usually within 2 working days. Leave it there until then.");
}

export async function cancelVerification(formData: FormData) {
  const user = await requireVerifiedUser();
  const id = String(formData.get("id") ?? "");
  await db.verificationRequest.deleteMany({ where: { id, userId: user.id, status: { in: ["PENDING", "NEEDS_MORE"] } } });
  refresh();
}
