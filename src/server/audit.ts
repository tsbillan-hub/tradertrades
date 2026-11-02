import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requestMeta } from "@/server/auth/session";

export async function audit(
  actorId: string | null,
  action: string,
  target?: { type: string; id: string },
  data?: Prisma.InputJsonValue,
) {
  let ip: string | null = null;
  try {
    ip = (await requestMeta()).ip;
  } catch {
    ip = null;
  }
  await db.auditLog.create({
    data: { actorId, action, targetType: target?.type, targetId: target?.id, data, ip },
  });
}
