import "server-only";
import type { CompanyCategory, FeaturedPlacement } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { daysFromNow } from "@/lib/utils";

export const publicCompanyWhere = { status: "PUBLISHED" } satisfies Prisma.CompanyWhereInput;

/** What a company row or card needs. */
export const companyCardSelect = {
  id: true,
  slug: true,
  name: true,
  primaryCategory: true,
  categories: true,
  tagline: true,
  website: true,
  affiliateUrl: true,
  markets: true,
  logoUrl: true,
  claimedAt: true,
  lastCheckedAt: true,
  ratingAvg: true,
  ratingCount: true,
  offers: { where: { active: true }, select: { id: true, title: true, expiresAt: true }, take: 3 },
} satisfies Prisma.CompanySelect;

export type CompanyCardData = Prisma.CompanyGetPayload<{ select: typeof companyCardSelect }>;

/** Offers that are switched on and haven't run out. */
export function liveOffers<T extends { expiresAt: Date | null }>(offers: T[]) {
  const now = daysFromNow(0).getTime();
  return offers.filter((o) => !o.expiresAt || o.expiresAt.getTime() > now);
}

/** Paid Sponsored spots running right now for a page. Clearly labelled wherever they show. */
export async function sponsoredFor(placement: FeaturedPlacement, category?: CompanyCategory, limit = placement === "HOME" ? 3 : 2) {
  const now = daysFromNow(0);
  const slots = await db.featuredSlot.findMany({
    where: {
      placement,
      ...(placement === "CATEGORY" ? { category } : {}),
      status: { in: ["ACTIVE", "SCHEDULED"] },
      startsAt: { lte: now },
      endsAt: { gt: now },
      company: publicCompanyWhere,
    },
    orderBy: { startsAt: "asc" },
    take: limit,
    include: { company: { select: companyCardSelect } },
  });
  return slots.map((s) => ({ slotId: s.id, company: s.company }));
}

/** Count of published companies per category (a company counts in every category it lists). */
export async function categoryCounts() {
  const rows = await db.$queryRaw<{ category: CompanyCategory; n: bigint }[]>`
    SELECT unnest("categories") AS category, count(*)::bigint AS n
    FROM "Company" WHERE "status" = 'PUBLISHED' GROUP BY 1`;
  return new Map(rows.map((r) => [r.category, Number(r.n)]));
}

/** Recomputes a company's cached rating from its published reviews. */
export async function refreshCompanyRating(companyId: string) {
  const agg = await db.companyReview.aggregate({ where: { companyId, status: "PUBLISHED" }, _avg: { rating: true }, _count: true });
  await db.company.update({ where: { id: companyId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
}

/** Where the "Visit website" button goes. Counted, then sent on. */
export function goHref(slug: string, from: string, offerId?: string) {
  const qs = new URLSearchParams({ from });
  if (offerId) qs.set("offer", offerId);
  return `/go/${slug}?${qs}`;
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
