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

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export type CompanySort = "reviews" | "rating" | "popular" | "name";

/**
 * One page of companies in a human order. Sorting happens here rather than in the database so that "A to Z" puts
 * "tastytrade" among the T's (the database sorts capital letters first). Lists are small, so this stays cheap.
 */
export async function companyPage(where: Prisma.CompanyWhereInput, sort: CompanySort, page: number, perPage: number) {
  const all = await db.company.findMany({ where, select: { id: true, name: true, ratingCount: true, ratingAvg: true, clickCount: true } });
  const cmp: Record<CompanySort, (a: (typeof all)[number], b: (typeof all)[number]) => number> = {
    reviews: (a, b) => b.ratingCount - a.ratingCount || b.ratingAvg - a.ratingAvg || byName.compare(a.name, b.name),
    rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || byName.compare(a.name, b.name),
    popular: (a, b) => b.clickCount - a.clickCount || byName.compare(a.name, b.name),
    name: (a, b) => byName.compare(a.name, b.name),
  };
  all.sort(cmp[sort]);
  const ids = all.slice((page - 1) * perPage, page * perPage).map((c) => c.id);
  const rows = ids.length ? await db.company.findMany({ where: { id: { in: ids } }, select: companyCardSelect }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { total: all.length, companies: ids.map((id) => byId.get(id)).filter((c): c is CompanyCardData => Boolean(c)) };
}

/** Where the "Visit website" button goes. Counted, then sent on. */
export function goHref(slug: string, from: string, offerId?: string) {
  const qs = new URLSearchParams({ from });
  if (offerId) qs.set("offer", offerId);
  return `/go/${slug}?${qs}`;
}
