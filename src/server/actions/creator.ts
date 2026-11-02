"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, type ActionState } from "@/lib/forms";
import { requireVerifiedUser } from "@/server/dal";
import { checkText } from "@/server/moderation";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";

const MARKET = z.enum(["FUTURES", "FOREX", "CRYPTO", "STOCKS", "OPTIONS"]);
const TYPE = z.enum(["COMMUNITY", "COURSE", "MENTORING", "ALERTS", "INDICATOR", "DOWNLOAD", "EVENT"]);

/** Turns on selling for this account straight away. There is no application or approval step. */
export async function startSelling(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (user.status !== "ACTIVE") return fail("Your account can't sell right now. Contact support if you think that's a mistake.");
  if (user.creator?.status === "SUSPENDED" || user.creator?.status === "REJECTED") {
    return fail("Selling is switched off for your account. Contact support if you think that's a mistake.");
  }
  const parsed = z
    .object({
      headline: z.string().trim().min(10, "Write at least a few words about what you teach").max(100, "Keep it under 100 characters"),
      markets: z.array(MARKET).min(1, "Pick at least one market").max(5),
      tradingStyle: optionalText(60),
      yearsTrading: z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? Number(v) : undefined))
        .pipe(z.number().int().min(0, "Years can't be negative").max(60, "That's a lot of years").optional()),
      firstProduct: TYPE.optional().or(z.literal("").transform(() => undefined)),
      rules: z.literal("on", { error: "Please agree to the marketplace rules" }),
    })
    .safeParse(formObject(formData, ["markets"]));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const check = await checkText(`${d.headline}\n${d.tradingStyle ?? ""}`, null);
  if (check.blocked) return fail(check.message, formData, { headline: ["Reword this"] });

  const now = new Date();
  const data = {
    status: "APPROVED" as const,
    headline: d.headline,
    markets: d.markets,
    tradingStyle: d.tradingStyle ?? null,
    yearsTrading: d.yearsTrading ?? null,
    application: { firstProduct: d.firstProduct ?? null, agreedToRulesAt: now.toISOString() },
  };
  const profile = await db.creatorProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data, appliedAt: now, approvedAt: now },
    update: { ...data, approvedAt: user.creator?.approvedAt ?? now },
  });
  await db.user.update({
    where: { id: user.id },
    data: { accountType: user.accountType === "BUSINESS" ? "BUSINESS" : "CREATOR", markets: user.markets.length ? undefined : d.markets },
  });
  await checkText(d.headline, { type: "USER", id: user.id });
  await audit(user.id, "creator.start", { type: "creator", id: profile.id });
  await flash("You can sell now. Add your first product.");
  redirect(d.firstProduct ? `/creator/products/new?type=${d.firstProduct.toLowerCase()}` : "/creator");
}
