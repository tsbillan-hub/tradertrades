import type { FeeType } from "@/generated/prisma/enums";

/** Platform fee in basis points (100 = 1%). */
export const FEE_BPS: Record<FeeType, number> = {
  OWN_AUDIENCE: 0,
  MARKETPLACE_FIRST: 3000,
  MARKETPLACE_REPEAT: 500,
  CAMPAIGN: 1000,
  FEATURED: 0,
  NONE: 0,
};

export const FEE_LABEL: Record<FeeType, string> = {
  OWN_AUDIENCE: "Your buyer (0%)",
  MARKETPLACE_FIRST: "Found by TraderTrades, first purchase (30%)",
  MARKETPLACE_REPEAT: "Found by TraderTrades, repeat purchase (5%)",
  CAMPAIGN: "Campaign deal (10%)",
  FEATURED: "Featured spot",
  NONE: "No fee",
};

export const FEE_SHORT: Record<FeeType, string> = {
  OWN_AUDIENCE: "Your buyer",
  MARKETPLACE_FIRST: "Found by us · 1st",
  MARKETPLACE_REPEAT: "Found by us · repeat",
  CAMPAIGN: "Campaign",
  FEATURED: "Featured",
  NONE: "None",
};

/** Card processing estimate (Stripe US standard pricing). Shown as an estimate everywhere. */
export const CARD_FEE = { bps: 290, fixedCents: 30 };

export function processingFee(amountCents: number) {
  if (amountCents <= 0) return 0;
  return Math.round((amountCents * CARD_FEE.bps) / 10000) + CARD_FEE.fixedCents;
}

export function platformFee(amountCents: number, feeType: FeeType) {
  return Math.round((amountCents * FEE_BPS[feeType]) / 10000);
}

export function feeExample(amountCents: number, feeType: FeeType) {
  const platformFeeCents = platformFee(amountCents, feeType);
  const processingFeeCents = processingFee(amountCents);
  return {
    amountCents,
    feeBps: FEE_BPS[feeType],
    platformFeeCents,
    processingFeeCents,
    sellerNetCents: Math.max(0, amountCents - platformFeeCents - processingFeeCents),
  };
}

/** Money from a sale waits this long before it can be paid out (covers refunds). */
export const HOLD_DAYS = 7;
export const NEW_SELLER_HOLD_DAYS = 14;
export const NEW_SELLER_PERIOD_DAYS = 60;

export function holdDaysFor(approvedAt: Date | null | undefined) {
  if (!approvedAt) return NEW_SELLER_HOLD_DAYS;
  const age = (Date.now() - approvedAt.getTime()) / 86400_000;
  return age < NEW_SELLER_PERIOD_DAYS ? NEW_SELLER_HOLD_DAYS : HOLD_DAYS;
}

/** Featured spot prices, per week. Labelled "Sponsored" everywhere they show. */
export const FEATURED_PRICES = {
  CATEGORY: 9900,
  HOME: 19900,
} as const;

export const FEATURED_LIMITS = { CATEGORY: 2, HOME: 3 } as const;
