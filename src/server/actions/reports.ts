"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { fail, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { requireVerifiedUser } from "@/server/dal";
import { rateLimit } from "@/server/rate-limit";

const TARGETS = ["USER", "PRODUCT", "PRODUCT_REVIEW", "COMPANY", "COMPANY_REVIEW", "POST", "COMMENT", "MESSAGE", "VIDEO", "JOB", "CAMPAIGN"] as const;
const REASONS = ["SCAM", "MISLEADING_CLAIMS", "BANNED_PRODUCT", "HARASSMENT", "SPAM", "IMPERSONATION", "COPYRIGHT", "OTHER"] as const;

export async function submitReport(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const parsed = z
    .object({ targetType: z.enum(TARGETS), targetId: z.string().min(1).max(60), reason: z.enum(REASONS, { error: "Pick a reason" }), details: optionalText(2000) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const rl = await rateLimit(`report:${user.id}`, 15, 86400);
  if (!rl.ok) return fail("You've sent a lot of reports today. Our team will get to them.");
  const d = parsed.data;
  const dupe = await db.report.findFirst({ where: { reporterId: user.id, targetType: d.targetType, targetId: d.targetId, status: "OPEN" } });
  if (dupe) return success("You've already reported this. Our team is on it.");
  await db.report.create({ data: { reporterId: user.id, targetType: d.targetType, targetId: d.targetId, reason: d.reason, details: d.details } });
  return success("Thanks. A person on our team will look at this, usually within a day.");
}
