import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const creatorMini = {
  select: {
    id: true,
    username: true,
    displayName: true,
    avatarUrl: true,
    idVerifiedAt: true,
    socialsVerifiedAt: true,
    isSample: true,
    creator: { select: { resultsCheckedAt: true, headline: true } },
  },
} satisfies Prisma.UserDefaultArgs;

export const productCardInclude = {
  creator: creatorMini,
  prices: { where: { active: true }, orderBy: [{ amountCents: "asc" }] },
} satisfies Prisma.ProductInclude;

export type ProductCardData = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

export const publicProductWhere = {
  status: "PUBLISHED",
  creator: { status: { in: ["ACTIVE"] }, creator: { status: "APPROVED" } },
} satisfies Prisma.ProductWhereInput;

export async function popularProducts(limit = 8) {
  return db.product.findMany({
    where: publicProductWhere,
    include: productCardInclude,
    orderBy: [{ isSample: "asc" }, { salesCount: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }],
    take: limit,
  });
}
