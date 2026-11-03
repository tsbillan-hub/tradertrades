import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { Market } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Pagination, SampleBadge, Stars } from "@/components/ui/misc";
import { VerifiedTick } from "@/components/market/badges";
import { FilterBar } from "@/components/market/filter-bar";
import { MARKETS, marketLabel } from "@/lib/constants";
import { compact, plural } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Trading creators",
  description: "Find trading creators selling communities, courses, mentoring, alert rooms and indicators on TraderTrades.",
};

const PER_PAGE = 24;
type SP = { q?: string; market?: string; sort?: string; page?: string };

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60) ?? "";
  const market = MARKETS.find((m) => m.value.toLowerCase() === sp.market?.toLowerCase())?.value as Market | undefined;
  const sort = sp.sort === "new" ? "new" : "popular";
  const page = Math.max(1, Math.min(100, Number(sp.page) || 1));

  const where: Prisma.UserWhereInput = {
    status: "ACTIVE",
    creator: { status: "APPROVED", ...(market ? { markets: { has: market } } : {}) },
    products: { some: { status: "PUBLISHED" } },
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { username: { contains: q.toLowerCase().replace(/^@/, "") } },
            { creator: { headline: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, creators] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: {
        creator: { select: { headline: true, markets: true } },
        _count: { select: { followers: true, products: { where: { status: "PUBLISHED" } } } },
        products: { where: { status: "PUBLISHED" }, select: { ratingAvg: true, ratingCount: true, salesCount: true, type: true } },
      },
      orderBy: [{ isSample: "asc" }, ...(sort === "new" ? [{ creator: { approvedAt: "desc" as const } }] : [{ followers: { _count: "desc" as const } }, { createdAt: "asc" as const }])],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const params: Record<string, string> = { ...(q ? { q } : {}), ...(market ? { market: market.toLowerCase() } : {}), ...(sort !== "popular" ? { sort } : {}) };
  const href = (n: number) => {
    const qs = new URLSearchParams(params);
    if (n > 1) qs.set("page", String(n));
    const s = qs.toString();
    return s ? `/creators?${s}` : "/creators";
  };

  return (
    <div className="container-tt py-8 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] sm:text-[36px]">Creators</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">Traders who teach, run communities and build tools. Follow the ones you like to see what they post.</p>
        </div>
        <form action="/creators" method="get" className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={q} placeholder="Search creators" className="input pl-9" aria-label="Search creators" />
        </form>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <FilterBar
          path="/creators"
          params={params}
          filters={[
            { name: "market", label: "Market", value: market?.toLowerCase() ?? "", options: [{ value: "", label: "All markets" }, ...MARKETS.map((m) => ({ value: m.value.toLowerCase(), label: m.label }))] },
            { name: "sort", label: "Sort", value: sort === "popular" ? "" : sort, options: [{ value: "", label: "Most followed" }, { value: "new", label: "Newest" }] },
          ]}
        />
        <span className="num text-sm text-muted">{plural(total, "creator")}</span>
      </div>

      {creators.length ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => {
              const rated = c.products.filter((p) => p.ratingCount > 0);
              const reviews = rated.reduce((n, p) => n + p.ratingCount, 0);
              const avg = reviews ? rated.reduce((n, p) => n + p.ratingAvg * p.ratingCount, 0) / reviews : 0;
              return (
                <Link key={c.id} href={`/@${c.username}`} className="card card-hover flex flex-col p-5">
                  <div className="flex items-center gap-3">
                    <Avatar src={c.avatarUrl} name={c.displayName} size={52} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 font-semibold">
                        <span className="truncate">{c.displayName}</span>
                        <VerifiedTick who={c} />
                      </div>
                      <div className="truncate text-sm text-muted">@{c.username}</div>
                    </div>
                    {c.isSample ? <SampleBadge className="ml-auto" /> : null}
                  </div>
                  {c.creator?.headline ? <p className="mt-3 line-clamp-2 text-sm text-ink-2">{c.creator.headline}</p> : null}
                  {c.creator?.markets.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.creator.markets.map((m) => (
                        <span key={m} className="badge badge-outline">
                          {marketLabel(m)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" />
                      <span className="num">{compact(c._count.followers)}</span> followers
                    </span>
                    <span className="num">{plural(c._count.products, "product")}</span>
                    {reviews ? (
                      <span className="inline-flex items-center gap-1">
                        <Stars value={avg} size={12} />
                        <span className="num">({reviews})</span>
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
          <Pagination page={page} pages={pages} hrefFor={href} />
        </>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<Users />}
          title={q || market ? "No creators match" : "Creators are setting up"}
          description={q || market ? "Try a different search or market." : "Selling is open to everyone. Set up your page in a couple of minutes."}
          action={
            <Link href="/sell" className="btn btn-primary">
              Start selling
            </Link>
          }
        />
      )}
    </div>
  );
}
