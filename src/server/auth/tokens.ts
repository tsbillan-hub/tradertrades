import "server-only";
import type { AuthTokenType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/server/crypto";

const TTL: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 48 * 3600,
  RESET_PASSWORD: 3600,
  CHANGE_EMAIL: 24 * 3600,
  VERIFY_WORK_EMAIL: 24 * 3600,
};

export async function issueToken(userId: string, type: AuthTokenType, data?: Prisma.InputJsonValue) {
  // One live token per purpose keeps old links from working.
  await db.authToken.deleteMany({ where: { userId, type, usedAt: null } });
  const token = randomToken(32);
  await db.authToken.create({
    data: {
      userId,
      type,
      tokenHash: sha256(token),
      data,
      expiresAt: new Date(Date.now() + TTL[type] * 1000),
    },
  });
  return token;
}

/** Short numeric code variant, for typing into a form (used for work email checks). */
export async function issueCode(userId: string, type: AuthTokenType, data?: Prisma.InputJsonValue) {
  await db.authToken.deleteMany({ where: { userId, type, usedAt: null } });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.authToken.create({
    data: {
      userId,
      type,
      tokenHash: sha256(`${userId}:${type}:${code}`),
      data,
      expiresAt: new Date(Date.now() + TTL[type] * 1000),
    },
  });
  return code;
}

export async function consumeToken(token: string, type: AuthTokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  await db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row;
}

export async function consumeCode(userId: string, type: AuthTokenType, code: string) {
  // The hash already binds the code to this user and purpose.
  return consumeToken(`${userId}:${type}:${code.trim()}`, type);
}

export async function peekToken(token: string, type: AuthTokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}
