import "server-only";
import { db } from "@/lib/db";

export async function unreadCounts(userId: string) {
  const [notifications, msgRows] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n
      FROM "ConversationMember" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE m."userId" = ${userId}
        AND m."archivedAt" IS NULL
        AND (m."lastReadAt" IS NULL OR c."lastMessageAt" > m."lastReadAt")`,
  ]);
  return { notifications, messages: Number(msgRows[0]?.n ?? 0) };
}
