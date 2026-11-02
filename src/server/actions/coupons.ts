"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, success, type ActionState } from "@/lib/forms";
import { requireCreator } from "@/server/dal";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";

const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, "At least 3 characters")
      .max(20, "20 characters at most")
      .regex(/^[A-Z0-9_-]+$/, "Letters, numbers, dashes and underscores only"),
    kind: z.enum(["percent", "amount"]),
    value: z.coerce.number({ error: "Enter a number" }).positive("Must be more than 0"),
    productId: z.string().optional().default(""),
    maxRedemptions: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .pipe(z.number().int().min(1, "At least 1").max(100000).nullable()),
    expiresAt: z.string().trim().optional().default(""),
  })
  .refine((d) => d.kind !== "percent" || (Number.isInteger(d.value) && d.value <= 100), { message: "Use a whole number from 1 to 100", path: ["value"] })
  .refine((d) => d.kind !== "amount" || d.value <= 100000, { message: "That's too much", path: ["value"] });

export async function createCoupon(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  const parsed = couponSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  let productId: string | null = null;
  if (d.productId) {
    const p = await db.product.findFirst({ where: { id: d.productId, creatorId: user.id } });
    if (!p) return fail("Pick one of your products.", formData, { productId: ["Not found"] });
    productId = p.id;
  }
  let expiresAt: Date | null = null;
  if (d.expiresAt) {
    const t = new Date(`${d.expiresAt}T23:59:59`);
    if (Number.isNaN(t.getTime()) || t < new Date()) return fail("Pick a date in the future.", formData, { expiresAt: ["Pick a future date"] });
    expiresAt = t;
  }
  const exists = await db.coupon.findUnique({ where: { creatorId_code: { creatorId: user.id, code: d.code } } });
  if (exists) return fail("You already have a code with that name.", formData, { code: ["Already used"] });
  if ((await db.coupon.count({ where: { creatorId: user.id, active: true } })) >= 50) return fail("You can have up to 50 active codes.");

  const coupon = await db.coupon.create({
    data: {
      creatorId: user.id,
      productId,
      code: d.code,
      percentOff: d.kind === "percent" ? d.value : null,
      amountOffCents: d.kind === "amount" ? Math.round(d.value * 100) : null,
      maxRedemptions: d.maxRedemptions,
      expiresAt,
    },
  });
  await audit(user.id, "coupon.create", { type: "coupon", id: coupon.id });
  refresh();
  return success(`Code ${coupon.code} is ready to share.`);
}

export async function toggleCoupon(formData: FormData) {
  const user = await requireCreator();
  const coupon = await db.coupon.findFirst({ where: { id: String(formData.get("couponId") ?? ""), creatorId: user.id } });
  if (!coupon) return;
  await db.coupon.update({ where: { id: coupon.id }, data: { active: !coupon.active } });
  refresh();
}

export async function deleteCoupon(formData: FormData) {
  const user = await requireCreator();
  const coupon = await db.coupon.findFirst({ where: { id: String(formData.get("couponId") ?? ""), creatorId: user.id } });
  if (!coupon) return;
  if (coupon.redemptions > 0) {
    await db.coupon.update({ where: { id: coupon.id }, data: { active: false } });
    await flash("This code was used, so it was turned off instead of deleted. Your sales history keeps it.", "info");
  } else {
    await db.coupon.delete({ where: { id: coupon.id } });
  }
  refresh();
}
