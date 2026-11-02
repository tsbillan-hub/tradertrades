import "server-only";
import { cookies } from "next/headers";
import type { AttributionSource, FeeType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { REF_COOKIE, hasRef } from "@/lib/ref";

export type Attribution = { source: AttributionSource; feeType: FeeType };

/**
 * Who brought this buyer to this seller? First touch wins and is remembered forever.
 * - Came through the creator's own link (tt_ref cookie) before their first purchase: their audience, 0%.
 * - Otherwise TraderTrades found them: 30% on the first paid purchase, 5% after.
 */
export async function attributionFor(buyerId: string, seller: { id: string; username: string }, refCookie?: string | null): Promise<Attribution> {
  const rel = await db.buyerRelation.findUnique({ where: { buyerId_sellerId: { buyerId, sellerId: seller.id } } });
  if (rel?.source === "OWN_AUDIENCE") return { source: "OWN_AUDIENCE", feeType: "OWN_AUDIENCE" };
  if (rel) {
    const paidBefore = await db.order.count({
      where: { buyerId, sellerId: seller.id, amountCents: { gt: 0 }, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    });
    return { source: "MARKETPLACE", feeType: paidBefore > 0 ? "MARKETPLACE_REPEAT" : "MARKETPLACE_FIRST" };
  }
  const raw = refCookie !== undefined ? refCookie : (await cookies()).get(REF_COOKIE)?.value;
  return hasRef(raw, seller.username) ? { source: "OWN_AUDIENCE", feeType: "OWN_AUDIENCE" } : { source: "MARKETPLACE", feeType: "MARKETPLACE_FIRST" };
}
