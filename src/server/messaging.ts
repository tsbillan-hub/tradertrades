import "server-only";
import { db } from "@/lib/db";

export async function isBlocked(a: string, b: string) {
  const n = await db.block.count({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } });
  return n > 0;
}

export async function haveDealtWith(a: string, b: string) {
  const [orders, convo, deals] = await Promise.all([
    db.order.count({ where: { OR: [{ buyerId: a, sellerId: b }, { buyerId: b, sellerId: a }], status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } }),
    db.conversation.count({ where: { AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }] } }),
    db.deal.count({ where: { OR: [{ creatorId: a, company: { members: { some: { userId: b } } } }, { creatorId: b, company: { members: { some: { userId: a } } } }] } }),
  ]);
  return orders + convo + deals > 0;
}

/** Can `from` start a conversation with `to`? Returns a reason when not. */
export async function canMessage(fromId: string, toId: string): Promise<string | null> {
  if (fromId === toId) return "You can't message yourself.";
  const to = await db.user.findUnique({ where: { id: toId }, select: { status: true, dmPolicy: true } });
  if (!to || to.status === "DELETED" || to.status === "BANNED") return "This account isn't available.";
  // Our team can reach anyone, for support and refund reviews.
  const from = await db.user.findUnique({ where: { id: fromId }, select: { isAdmin: true } });
  if (from?.isAdmin) return null;
  if (await isBlocked(fromId, toId)) return "You can't message this person.";
  if (to.dmPolicy === "EVERYONE") return null;
  const dealt = await haveDealtWith(fromId, toId);
  if (to.dmPolicy === "CUSTOMERS" && dealt) return null;
  if (to.dmPolicy === "NOBODY") {
    const existing = await findDirect(fromId, toId);
    if (existing) return null;
  }
  return "This person only takes messages from people they've dealt with.";
}

export async function findDirect(a: string, b: string) {
  return db.conversation.findFirst({
    where: { dealId: null, AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }] },
    include: { members: true },
  });
}

