import type { Metadata } from "next";
import Link from "next/link";
import { Check, ExternalLink, Package, RotateCcw, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { productTypeInfo } from "@/lib/constants";
import { productPath } from "@/lib/paths";
import { PRODUCT_STATUS_BADGE } from "@/lib/product-status";
import { money, timeAgo } from "@/lib/utils";
import { markListingChecked, restoreListing } from "@/server/actions/admin";
import { pageParam } from "@/server/queries/admin";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, LinkTabs, PageHeader, Pagination } from "@/components/ui/misc";
import { TakeDownListingButton } from "@/components/admin/forms";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "Listings" };

const PER_PAGE = 25;

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "down" ? "down" : sp.tab === "all" ? "all" : "new";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = pageParam(sp.page);

  const newWhere: Prisma.ProductWhereInput = { status: "PUBLISHED", checkedAt: null, isSample: false };
  const downWhere: Prisma.ProductWhereInput = { status: "SUSPENDED" };
  const allWhere: Prisma.ProductWhereInput = q
    ? {
        OR: [
          { id: q },
          { title: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          { creator: { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } } },
        ],
      }
    : {};
  const where = tab === "new" ? newWhere : tab === "down" ? downWhere : allWhere;

  const [newCount, downCount, total, rows] = await Promise.all([
    db.product.count({ where: newWhere }),
    db.product.count({ where: downWhere }),
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: tab === "new" ? { publishedAt: "asc" } : { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    }),
  ]);
  const reportCounts = rows.length
    ? await db.report.groupBy({ by: ["targetId"], where: { targetType: "PRODUCT", targetId: { in: rows.map((r) => r.id) }, status: "OPEN" }, _count: true })
    : [];

  const hrefFor = (p: number) => `/admin/listings?${new URLSearchParams({ ...(tab !== "new" ? { tab } : {}), ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listings"
        description="Anyone can sell right away, so listings go live first and get a look from us after. Our word check already blocks the clear rule breaks before they're posted."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "new", href: "/admin/listings", label: "New", count: newCount },
          { key: "down", href: "/admin/listings?tab=down", label: "Taken down", count: downCount },
          { key: "all", href: "/admin/listings?tab=all", label: "Search all" },
        ]}
      />
      {tab === "all" ? (
        <form className="flex gap-2" role="search">
          <input type="hidden" name="tab" value="all" />
          <label className="sr-only" htmlFor="listing-q">
            Search listings
          </label>
          <input id="listing-q" name="q" defaultValue={q} className="input flex-1" placeholder="Title, slug, creator username or listing id" />
          <button className="btn btn-secondary">
            <Search /> Search
          </button>
        </form>
      ) : null}

      {rows.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Listings">
          {rows.map((p) => {
            const badge = PRODUCT_STATUS_BADGE[p.status];
            const reports = reportCounts.find((r) => r.targetId === p.id)?._count ?? 0;
            return (
              <li key={p.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={productPath(p.creator.username, p.slug)} target="_blank" className="inline-flex items-center gap-1 font-semibold hover:underline">
                      {p.title} <ExternalLink className="size-3.5 text-faint" />
                    </Link>
                    <span className={`badge ${badge.tone}`}>{badge.label}</span>
                    {p.isSample ? <span className="badge badge-warn">Sample</span> : null}
                    {reports ? <span className="badge badge-bad">{reports === 1 ? "1 open report" : `${reports} open reports`}</span> : null}
                  </div>
                  <div className="text-sm text-muted">
                    {productTypeInfo(p.type).label} · from {money(p.priceFromCents)} · {p.salesCount} sold
                    {p.publishedAt ? ` · live ${timeAgo(p.publishedAt)}` : ""}
                    {p.status === "PUBLISHED" ? (p.checkedAt ? ` · checked ${timeAgo(p.checkedAt)}` : " · not checked yet") : ""}
                  </div>
                  {p.status === "SUSPENDED" && p.reviewNote ? <p className="text-sm text-down">Why: {p.reviewNote}</p> : null}
                  <UserChip user={p.creator} />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {p.status === "SUSPENDED" ? (
                    <ActionButton action={restoreListing} fields={{ productId: p.id }} confirm={`Put "${p.title}" back up? The creator is told.`}>
                      <RotateCcw /> Put back up
                    </ActionButton>
                  ) : (
                    <>
                      {p.status === "PUBLISHED" && !p.checkedAt ? (
                        <ActionButton action={markListingChecked} fields={{ productId: p.id }} variant="secondary">
                          <Check /> Looks fine
                        </ActionButton>
                      ) : null}
                      {p.status === "PUBLISHED" ? <TakeDownListingButton productId={p.id} title={p.title} /> : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Package />}
          title={tab === "new" ? "You've seen every new listing" : tab === "down" ? "Nothing taken down" : q ? "No listings match" : "No listings yet"}
          description={tab === "new" ? "New listings show up here after they go live." : undefined}
        />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={hrefFor} />
    </div>
  );
}
