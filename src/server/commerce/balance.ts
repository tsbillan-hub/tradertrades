import "server-only";
import { db } from "@/lib/db";

/** Money owed to a seller from our ledger: still on hold, ready to pay out, and paid out so far. */
export async function balances(userId: string) {
  const now = new Date();
  const [pending, available, paid] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { userId, payoutId: null, availableAt: { gt: now } }, _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { userId, payoutId: null, availableAt: { lte: now } }, _sum: { amountCents: true } }),
    db.payout.aggregate({ where: { userId, status: "PAID" }, _sum: { amountCents: true } }),
  ]);
  return {
    pendingCents: pending._sum.amountCents ?? 0,
    availableCents: available._sum.amountCents ?? 0,
    paidOutCents: paid._sum.amountCents ?? 0,
  };
}

export async function availableBalance(userId: string) {
  const entries = await db.ledgerEntry.findMany({ where: { userId, payoutId: null, availableAt: { lte: new Date() } }, select: { id: true, amountCents: true } });
  return { available: entries.reduce((n, e) => n + e.amountCents, 0), entryIds: entries.map((e) => e.id) };
}
