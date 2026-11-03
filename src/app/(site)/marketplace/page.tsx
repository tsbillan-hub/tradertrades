import type { Metadata } from "next";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { Market, SkillLevel } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { productCardInclude, publicProductWhere } from "@/server/queries/products";
import { ProductCard } from "@/components/market/product-card";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { FilterBar } from "@/components/market/filter-bar";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { MARKETS, PRODUCT_TYPES, SKILL_LEVELS, productTypeBySlug } from "@/lib/constants";
import { cn, plural } from "@/lib/utils";

const PER_PAGE = 24;

const PRICE_FILTERS: Record<string, { label: string; where: Prisma.IntFilter }> = {
  free: { label: "Free", where: { equals: 0 } },
  under50: { label: "Under $50", where: { gt: 0, lt: 5000 } },
  "50to200": { label: "$50 to $200", where: { gte: 5000, lte: 20000 } },
  over200: { label: "Over $200", where: { gt: 20000 } },
};

const SORTS: Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput[] }> = {
  popular: { label: "Most popular", orderBy: [{ isSample: "asc" }, { salesCount: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }] },
  new: { label: "Newest", orderBy: [{ isSample: "asc" }, { publishedAt: "desc" }] },
  rating: { label: "Top rated", orderBy: [{ isSample: "asc" }, { ratingAvg: "desc" }, { ratingCount: "desc" }] },
  "price-asc": { label: "Price: low to high", orderBy: [{ isSample: "asc" }, { priceFromCents: "asc" }, { salesCount: "desc" }] },
  "price-desc": { label: "Price: high to low", orderBy: [{ isSample: "asc" }, { priceFromCents: "desc" }, { salesCount: "desc" }] },
};

type SP = { q?: string; type?: string; market?: string; level?: string; price?: string; sort?: string; page?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { type } = await searchParams;
  const t = type ? productTypeBySlug(type) : null;
  return {
    title: t ? `${t.plural} for traders` : "Marketplace",
    description: t ? `${t.blurb} Find ${t.plural.toLowerCase()} from trading creators on TraderTrades.` : "Trading communities, courses, mentoring, alert rooms, indicators and downloads from trading creators.",
  };
}

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const type = sp.type ? productTypeBySlug(sp.type) : undefined;
  const market = MARKETS.find((m) => m.value.toLowerCase() === sp.market?.toLowerCase())?.value as Market | undefined;
  const level = SKILL_LEVELS.find((l) => l.value.toLowerCase() === sp.level?.toLowerCase() && l.value !== "ALL")?.value as SkillLevel | undefined;
  const price = sp.price && PRICE_FILTERS[sp.price] ? sp.price : "";
  const sort = sp.sort && SORTS[sp.sort] ? sp.sort : "popular";
  const page = Math.max(1, Math.min(200, Number(sp.page) || 1));

  const where: Prisma.ProductWhereInput = {
    ...publicProductWhere,
    ...(type ? { type: type.value } : {}),
    ...(market ? { markets: { has: market } } : {}),
    ...(level ? { level: { in: [level, "ALL"] } } : {}),
    ...(price ? { priceFromCents: PRICE_FILTERS[price].where } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { subtitle: { contains: q, mode: "insensitive" } },
            { tags: { has: q.toLowerCase() } },
            { creator: { displayName: { contains: q, mode: "insensitive" } } },
            { creator: { username: { contains: q.toLowerCase().replace(/^@/, "") } } },
          ],
        }
      : {}),
  };

  const [total, products, typeCounts] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include: productCardInclude, orderBy: SORTS[sort].orderBy, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.product.groupBy({ by: ["type"], where: publicProductWhere, _count: true }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const countFor = (t: string) => typeCounts.find((c) => c.type === t)?._count ?? 0;

  const params: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(type ? { type: type.slug } : {}),
    ...(market ? { market: market.toLowerCase() } : {}),
    ...(level ? { level: level.toLowerCase() } : {}),
    ...(price ? { price } : {}),
    ...(sort !== "popular" ? { sort } : {}),
  };
  const href = (over: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...over })) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/marketplace?${s}` : "/marketplace";
  };
  const filtered = Boolean(q || market || level || price);

  return (
    <div className="container-tt py-8 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] sm:text-[36px]">{type ? type.plural : "Marketplace"}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">
            {type ? type.blurb : "Communities, courses, mentoring, alert rooms, indicators and downloads from trading creators."}
          </p>
        </div>
        <form action="/marketplace" method="get" className="relative w-full sm:w-80">
          {type ? <input type="hidden" name="type" value={type.slug} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={q} placeholder="Search the marketplace" className="input pl-9" aria-label="Search the marketplace" />
        </form>
      </div>

      <nav className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Product types">
        <Link href={href({ type: undefined, page: undefined })} className={cn("chip shrink-0", !type && "border-ink bg-ink text-bg")}>
          All
        </Link>
        {PRODUCT_TYPES.map((t) => (
          <Link
            key={t.value}
            href={href({ type: t.slug, page: undefined })}
            className={cn("chip shrink-0 gap-1.5", type?.value === t.value && "border-ink bg-ink text-bg")}
            aria-current={type?.value === t.value ? "page" : undefined}
          >
            <ProductTypeIcon type={t.value} className="size-3.5" />
            {t.plural}
            <span className="num text-xs opacity-60">{countFor(t.value)}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <FilterBar
          path="/marketplace"
          params={params}
          filters={[
            { name: "market", label: "Market", value: market?.toLowerCase() ?? "", options: [{ value: "", label: "All markets" }, ...MARKETS.map((m) => ({ value: m.value.toLowerCase(), label: m.label }))] },
            { name: "level", label: "Level", value: level?.toLowerCase() ?? "", options: [{ value: "", label: "Any level" }, ...SKILL_LEVELS.filter((l) => l.value !== "ALL").map((l) => ({ value: l.value.toLowerCase(), label: l.label }))] },
            { name: "price", label: "Price", value: price, options: [{ value: "", label: "Any price" }, ...Object.entries(PRICE_FILTERS).map(([value, f]) => ({ value, label: f.label }))] },
            { name: "sort", label: "Sort", value: sort === "popular" ? "" : sort, options: Object.entries(SORTS).map(([value, s]) => ({ value: value === "popular" ? "" : value, label: s.label })) },
          ]}
        />
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="num">{plural(total, "result")}</span>
          {filtered ? (
            <Link href={type ? `/marketplace?type=${type.slug}` : "/marketplace"} className="font-semibold text-ink hover:underline">
              Clear filters
            </Link>
          ) : null}
        </div>
      </div>

      {products.length ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <Pagination page={page} pages={pages} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} />
        </>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<SearchX />}
          title={filtered || type ? "Nothing matches yet" : "The marketplace is just opening"}
          description={
            filtered || type
              ? "Try fewer filters or a different search."
              : "Creators are adding their first products. Selling is open to everyone, so yours could be the first."
          }
          action={
            <>
              {filtered || type ? (
                <Link href="/marketplace" className="btn btn-secondary">
                  See everything
                </Link>
              ) : null}
              <Link href="/sell" className="btn btn-primary">
                Start selling
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}
