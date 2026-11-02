import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Search, SearchX } from "lucide-react";
import { db } from "@/lib/db";
import { productCardInclude, publicProductWhere } from "@/server/queries/products";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, RatingSummary } from "@/components/ui/misc";
import { VerifiedTick } from "@/components/market/badges";
import { ProductCard } from "@/components/market/product-card";
import { CATEGORIES, PRODUCT_TYPES, categoryInfo } from "@/lib/constants";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw } = await searchParams;
  const q = raw?.trim().slice(0, 80) ?? "";
  const handle = q.toLowerCase().replace(/^@/, "");

  const [products, creators, companies] = q
    ? await Promise.all([
        db.product.findMany({
          where: {
            ...publicProductWhere,
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { subtitle: { contains: q, mode: "insensitive" } },
              { tags: { has: q.toLowerCase() } },
              { creator: { displayName: { contains: q, mode: "insensitive" } } },
            ],
          },
          include: productCardInclude,
          orderBy: [{ salesCount: "desc" }, { ratingCount: "desc" }],
          take: 8,
        }),
        db.user.findMany({
          where: {
            status: "ACTIVE",
            OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: handle } }],
          },
          include: { creator: { select: { status: true, headline: true } } },
          orderBy: [{ followers: { _count: "desc" } }],
          take: 8,
        }),
        db.company.findMany({
          where: {
            status: "PUBLISHED",
            OR: [{ name: { contains: q, mode: "insensitive" } }, { tagline: { contains: q, mode: "insensitive" } }, { platforms: { has: q } }],
          },
          orderBy: [{ ratingCount: "desc" }, { name: "asc" }],
          take: 8,
        }),
      ])
    : [[], [], []];

  const nothing = q && !products.length && !creators.length && !companies.length;

  return (
    <div className="container-tt max-w-6xl py-8 sm:py-10">
      <form action="/search" method="get" className="relative max-w-2xl" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint" />
        <input
          name="q"
          defaultValue={q}
          autoFocus={!q}
          placeholder="Search creators, courses, prop firms, brokers…"
          className="input h-12 rounded-full pl-12 text-base"
          aria-label="Search"
        />
      </form>

      {!q ? (
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-lg">Browse the marketplace</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRODUCT_TYPES.map((t) => (
                <Link key={t.value} href={`/marketplace?type=${t.slug}`} className="chip">
                  {t.plural}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg">Browse the directory</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Link key={c.value} href={`/directory/${c.slug}`} className="chip">
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : nothing ? (
        <EmptyState
          className="mt-8"
          icon={<SearchX />}
          title={`Nothing found for "${q}"`}
          description="Check the spelling, or try a shorter search like a creator's name, a market or a platform."
        />
      ) : (
        <div className="mt-8 space-y-12">
          {products.length ? (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="text-xl">Products</h2>
                <Link href={`/marketplace?q=${encodeURIComponent(q)}`} className="text-sm font-semibold hover:underline">
                  See all in the marketplace
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} compact />
                ))}
              </div>
            </section>
          ) : null}

          {creators.length ? (
            <section>
              <h2 className="mb-4 text-xl">People</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {creators.map((u) => (
                  <Link key={u.id} href={`/@${u.username}`} className="card card-hover flex items-center gap-3 p-4">
                    <Avatar src={u.avatarUrl} name={u.displayName} size={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-sm font-semibold">
                        <span className="truncate">{u.displayName}</span>
                        <VerifiedTick who={u} />
                      </div>
                      <div className="truncate text-xs text-muted">
                        @{u.username}
                        {u.creator?.status === "APPROVED" ? " · Creator" : ""}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {companies.length ? (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="text-xl">Directory</h2>
                <Link href="/directory" className="text-sm font-semibold hover:underline">
                  Open the directory
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {companies.map((c) => (
                  <Link key={c.id} href={`/directory/c/${c.slug}`} className="card card-hover flex items-center gap-3 p-4">
                    <Avatar src={c.logoUrl} name={c.name} size={40} square />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="truncate text-xs text-muted">{categoryInfo(c.primaryCategory).singular}</div>
                      <RatingSummary avg={c.ratingAvg} count={c.ratingCount} className="mt-0.5 text-xs" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Building2 className="size-4" /> No companies matched.{" "}
              <Link href="/directory" className="link">
                Browse the directory
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
