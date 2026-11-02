import "server-only";
import { db } from "@/lib/db";
import { sourceLabel } from "@/server/views";
import { clickSourceLabel } from "@/lib/click-sources";
import { categoryInfo } from "@/lib/constants";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(v?: string): Range {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

const DAY = 86_400_000;

/** The last `days` UTC days, oldest first, as YYYY-MM-DD. */
export function dayList(days: number, now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY).toISOString().slice(0, 10));
}

type Window = { from: string; to: string; prevFrom: string };

/** This period and the one just before it, as date strings. `to` is the day after today (not included). */
function windowFor(days: number, now = new Date()): Window {
  const list = dayList(days, now);
  const from = list[0];
  const to = new Date(Date.parse(`${list[list.length - 1]}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.parse(`${from}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);
  return { from, to, prevFrom };
}

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Change from the previous period as a whole percent, or null when there's nothing to compare with. */
export function change(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Visits per day: each person counts once a day, across all the owner's pages of these kinds. */
async function visitsByDay(ownerId: string, targets: string[], from: string, to: string) {
  const rows = await db.$queryRaw<{ day: Date; n: number }[]>`
    SELECT "day", COUNT(DISTINCT "visitor")::int AS n
    FROM "PageView"
    WHERE "ownerId" = ${ownerId} AND "target"::text = ANY(${targets}) AND "day" >= ${from}::date AND "day" < ${to}::date
    GROUP BY "day"`;
  return new Map(rows.map((r) => [dayOf(r.day), r.n]));
}

/** Where each visit started: the first page a person opened that day decides it. */
async function entrySources(ownerId: string, targets: string[], from: string, to: string) {
  return db.$queryRaw<{ source: string; n: number }[]>`
    SELECT "source", COUNT(*)::int AS n FROM (
      SELECT DISTINCT ON ("day", "visitor") "source"
      FROM "PageView"
      WHERE "ownerId" = ${ownerId} AND "target"::text = ANY(${targets}) AND "day" >= ${from}::date AND "day" < ${to}::date
      ORDER BY "day", "visitor", "createdAt"
    ) first_views
    GROUP BY "source"
    ORDER BY n DESC`;
}

/** Folds sources that share a label, keeps the top ones and puts the rest in "Everything else". */
function rankSources(rows: { label: string; n: number }[], keep = 7) {
  const merged = new Map<string, number>();
  for (const r of rows) merged.set(r.label, (merged.get(r.label) ?? 0) + r.n);
  const sorted = [...merged.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep).reduce((s, r) => s + r.n, 0);
  return [...sorted.slice(0, keep), { label: "Everything else", n: rest }];
}

const SALE_STATUSES = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"] as const;
const PROFILE_TARGETS = ["PROFILE", "PRODUCT"];

export async function creatorStats(userId: string, days: Range) {
  const list = dayList(days);
  const { from, to, prevFrom } = windowFor(days);
  const [visitMap, prevVisitMap, sources, linkClicks, prevLinkClicks, orders, prevOrders, ledger, prevLedger, products, productViews, checkouts] = await Promise.all([
    visitsByDay(userId, PROFILE_TARGETS, from, to),
    visitsByDay(userId, PROFILE_TARGETS, prevFrom, from),
    entrySources(userId, PROFILE_TARGETS, from, to),
    db.pageView.count({ where: { ownerId: userId, target: "LINK", day: { gte: at(from), lt: at(to) } } }),
    db.pageView.count({ where: { ownerId: userId, target: "LINK", day: { gte: at(prevFrom), lt: at(from) } } }),
    db.order.findMany({
      where: { sellerId: userId, kind: { in: ["PURCHASE", "RENEWAL"] }, status: { in: [...SALE_STATUSES] }, amountCents: { gt: 0 }, paidAt: { gte: at(from), lt: at(to) } },
      select: { paidAt: true, amountCents: true, feeType: true, productId: true, platformFeeCents: true, kind: true },
    }),
    db.order.aggregate({
      where: { sellerId: userId, kind: { in: ["PURCHASE", "RENEWAL"] }, status: { in: [...SALE_STATUSES] }, amountCents: { gt: 0 }, paidAt: { gte: at(prevFrom), lt: at(from) } },
      _sum: { amountCents: true },
      _count: true,
    }),
    db.ledgerEntry.groupBy({ by: ["type"], where: { userId, type: { not: "PAYOUT" }, createdAt: { gte: at(from), lt: at(to) } }, _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { userId, type: { not: "PAYOUT" }, createdAt: { gte: at(prevFrom), lt: at(from) } }, _sum: { amountCents: true } }),
    db.product.findMany({
      where: { creatorId: userId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, slug: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.pageView.groupBy({ by: ["targetId"], where: { ownerId: userId, target: "PRODUCT", day: { gte: at(from), lt: at(to) } }, _count: true }),
    db.order.groupBy({
      by: ["productId"],
      where: { sellerId: userId, kind: "PURCHASE", createdAt: { gte: at(from), lt: at(to) }, productId: { not: null } },
      _count: true,
    }),
  ]);

  const visitsDaily = list.map((d) => visitMap.get(d) ?? 0);
  const visits = visitsDaily.reduce((s, n) => s + n, 0);
  const prevVisits = [...prevVisitMap.values()].reduce((s, n) => s + n, 0);

  const salesDaily = new Map<string, { cents: number; count: number }>();
  for (const o of orders) {
    const d = dayOf(o.paidAt!);
    const cur = salesDaily.get(d) ?? { cents: 0, count: 0 };
    cur.cents += o.amountCents;
    cur.count += 1;
    salesDaily.set(d, cur);
  }
  const gross = orders.reduce((s, o) => s + o.amountCents, 0);

  const buyerGroups = [
    { key: "own", label: "Your link and your audience", fee: "0% fee", match: ["OWN_AUDIENCE"] },
    { key: "first", label: "Found by TraderTrades, first purchase", fee: "30% fee", match: ["MARKETPLACE_FIRST"] },
    { key: "repeat", label: "Found by TraderTrades, buying again", fee: "5% fee", match: ["MARKETPLACE_REPEAT"] },
  ].map((g) => {
    const mine = orders.filter((o) => g.match.includes(o.feeType));
    return { key: g.key, label: g.label, fee: g.fee, count: mine.length, cents: mine.reduce((s, o) => s + o.amountCents, 0), feeCents: mine.reduce((s, o) => s + o.platformFeeCents, 0) };
  });

  const byType = Object.fromEntries(ledger.map((l) => [l.type, l._sum.amountCents ?? 0])) as Record<string, number>;
  const money = {
    sales: byType.SALE ?? 0,
    campaigns: byType.CAMPAIGN ?? 0,
    refunds: byType.REFUND ?? 0,
    platformFees: byType.PLATFORM_FEE ?? 0,
    processing: byType.PROCESSING_FEE ?? 0,
    adjustments: byType.ADJUSTMENT ?? 0,
  };
  const kept = Object.values(money).reduce((s, n) => s + n, 0);

  const viewsBy = new Map(productViews.map((v) => [v.targetId, v._count]));
  const checkoutsBy = new Map(checkouts.map((c) => [c.productId, c._count]));
  const productRows = products
    .map((p) => {
      const sold = orders.filter((o) => o.productId === p.id && o.kind === "PURCHASE");
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        views: viewsBy.get(p.id) ?? 0,
        checkouts: checkoutsBy.get(p.id) ?? 0,
        sales: sold.length,
        cents: orders.filter((o) => o.productId === p.id).reduce((s, o) => s + o.amountCents, 0),
      };
    })
    .sort((a, b) => b.cents - a.cents || b.views - a.views);

  return {
    days: list,
    visits: { daily: visitsDaily, total: visits, prev: prevVisits },
    linkClicks: { total: linkClicks, prev: prevLinkClicks },
    sales: {
      daily: list.map((d) => salesDaily.get(d)?.cents ?? 0),
      count: orders.length,
      purchases: orders.filter((o) => o.kind === "PURCHASE").length,
      prevCount: prevOrders._count,
      cents: gross,
      prevCents: prevOrders._sum.amountCents ?? 0,
    },
    kept: { total: kept, prev: prevLedger._sum.amountCents ?? 0 },
    money,
    sources: rankSources(sources.map((s) => ({ label: sourceLabel(s.source), n: s.n }))),
    buyers: buyerGroups,
    products: productRows,
  };
}

export async function businessStats(companyId: string, days: Range) {
  const list = dayList(days);
  const { from, to, prevFrom } = windowFor(days);
  const [visitMap, prevVisitMap, sources, clickRows, prevClicks, clickSources, reviews, prevReviews, slots, spend] = await Promise.all([
    visitsByDay(companyId, ["COMPANY"], from, to),
    visitsByDay(companyId, ["COMPANY"], prevFrom, from),
    entrySources(companyId, ["COMPANY"], from, to),
    db.$queryRaw<{ day: Date; n: number }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS n
      FROM "OutboundClick"
      WHERE "companyId" = ${companyId} AND "createdAt" >= ${at(from)} AND "createdAt" < ${at(to)}
      GROUP BY 1`,
    db.outboundClick.count({ where: { companyId, createdAt: { gte: at(prevFrom), lt: at(from) } } }),
    db.outboundClick.groupBy({ by: ["source"], where: { companyId, createdAt: { gte: at(from), lt: at(to) } }, _count: true }),
    db.companyReview.count({ where: { companyId, status: "PUBLISHED", isSample: false, createdAt: { gte: at(from), lt: at(to) } } }),
    db.companyReview.count({ where: { companyId, status: "PUBLISHED", isSample: false, createdAt: { gte: at(prevFrom), lt: at(from) } } }),
    db.featuredSlot.findMany({
      where: { companyId, status: { in: ["ACTIVE", "ENDED"] }, startsAt: { lt: at(to) }, endsAt: { gt: at(from) } },
      orderBy: { startsAt: "desc" },
    }),
    db.order.groupBy({
      by: ["kind"],
      where: { companyId, kind: { in: ["FEATURED", "CAMPAIGN"] }, status: { in: [...SALE_STATUSES] }, paidAt: { gte: at(from), lt: at(to) } },
      _sum: { amountCents: true, refundedCents: true },
    }),
  ]);

  const clickMap = new Map(clickRows.map((r) => [dayOf(new Date(Date.UTC(r.day.getUTCFullYear(), r.day.getUTCMonth(), r.day.getUTCDate()))), r.n]));
  const visitsDaily = list.map((d) => visitMap.get(d) ?? 0);
  const clicksDaily = list.map((d) => clickMap.get(d) ?? 0);
  const visits = visitsDaily.reduce((s, n) => s + n, 0);
  const clicks = clicksDaily.reduce((s, n) => s + n, 0);

  const slotRows = await Promise.all(
    slots.map(async (s) => {
      const source = s.placement === "HOME" ? "sponsored:home" : `sponsored:${s.category ? categoryInfo(s.category).slug : ""}`;
      const n = await db.outboundClick.count({ where: { companyId, source, createdAt: { gte: s.startsAt, lt: s.endsAt } } });
      return { id: s.id, placement: s.placement, category: s.category, startsAt: s.startsAt, endsAt: s.endsAt, status: s.status, clicks: n };
    }),
  );

  const spent = (kind: "FEATURED" | "CAMPAIGN") => {
    const row = spend.find((r) => r.kind === kind);
    return (row?._sum.amountCents ?? 0) - (row?._sum.refundedCents ?? 0);
  };

  return {
    days: list,
    visits: { daily: visitsDaily, total: visits, prev: [...prevVisitMap.values()].reduce((s, n) => s + n, 0) },
    clicks: { daily: clicksDaily, total: clicks, prev: prevClicks },
    reviews: { total: reviews, prev: prevReviews },
    sources: rankSources(sources.map((s) => ({ label: sourceLabel(s.source), n: s.n }))),
    clickSources: rankSources(clickSources.map((c) => ({ label: clickSourceLabel(c.source), n: c._count }))),
    slots: slotRows,
    spend: { featured: spent("FEATURED"), campaigns: spent("CAMPAIGN") },
  };
}

/** Day-by-day values in the shape the column chart takes. */
export function columnPoints(days: string[], values: number[]) {
  const week = days.length <= 8;
  return days.map((d, i) => {
    const date = new Date(`${d}T12:00:00Z`);
    return {
      key: d,
      label: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      short: week ? date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      value: values[i] ?? 0,
    };
  });
}

/** The day with the highest value, for a one-line summary over a chart. */
export function bestDay(days: string[], values: number[]) {
  let best = -1;
  values.forEach((v, i) => {
    if (v > 0 && (best < 0 || v >= values[best])) best = i;
  });
  if (best < 0) return null;
  const label = new Date(`${days[best]}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return { label, value: values[best] };
}
