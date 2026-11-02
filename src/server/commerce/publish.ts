import "server-only";
import type { ProductType } from "@/generated/prisma/enums";
import { features } from "@/lib/env";

/** What's still missing before a product can go live. */
export function publishBlockers(product: {
  title: string;
  description: string | null;
  prices: { active: boolean; amountCents: number }[];
  type: ProductType;
  startsAt: Date | null;
}, creator: { stripeChargesEnabled: boolean; testPayoutsReady: boolean }) {
  const out: string[] = [];
  if ((product.description ?? "").trim().length < 80) out.push("Write a description of at least 80 characters, so buyers know what they get.");
  const active = product.prices.filter((p) => p.active);
  if (!active.length) out.push("Add at least one price option.");
  const paid = active.some((p) => p.amountCents > 0);
  if (paid && features.stripe && !creator.stripeChargesEnabled) out.push("Set up payouts so you can take card payments.");
  if (paid && !features.stripe && !creator.testPayoutsReady) out.push("Set up payouts (in preview mode this takes one click).");
  if (product.type === "EVENT" && !product.startsAt) out.push("Set the event date and time.");
  return out;
}

