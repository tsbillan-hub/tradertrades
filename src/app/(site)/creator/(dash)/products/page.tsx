import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { EmptyState, PageHeader, RatingSummary } from "@/components/ui/misc";
import { GeneratedCover } from "@/components/market/cover";
import { priceLabel } from "@/components/market/product-card";
import { productTypeInfo } from "@/lib/constants";
import { productPath } from "@/lib/paths";
import { cn, plural } from "@/lib/utils";
import { PRODUCT_STATUS_BADGE } from "@/lib/product-status";

export const metadata: Metadata = { title: "Your products" };

export default async function CreatorProductsPage() {
  const user = await requireCreator();
  const products = await db.product.findMany({
    where: { creatorId: user.id },
    include: { prices: { where: { active: true } }, _count: { select: { entitlements: { where: { status: "ACTIVE" } } } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  const live = products.filter((p) => p.status !== "ARCHIVED");
  const archived = products.filter((p) => p.status === "ARCHIVED");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Everything you sell. Click one to edit it."
        actions={
          <Link href="/creator/products/new" className="btn btn-primary">
            <Plus /> New product
          </Link>
        }
      />
      {live.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="No products yet"
          description="A community, a course, mentoring calls, an alert room, an indicator, a download or a live event. Pick one to start."
          action={
            <Link href="/creator/products/new" className="btn btn-primary">
              Create your first product
            </Link>
          }
        />
      ) : (
        <ul className="card divide-y divide-line">
          {live.map((p) => {
            const st = PRODUCT_STATUS_BADGE[p.status];
            return (
              <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Link href={`/creator/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="w-28 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <GeneratedCover title={p.title} type={p.type} seed={p.id} className="aspect-video w-full" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{p.title}</span>
                      <span className={cn("badge", st.tone)}>{st.label}</span>
                      {p.launchState === "WAITLIST" ? <span className="badge badge-ink">Waitlist</span> : null}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {productTypeInfo(p.type).label} · {priceLabel(p.prices)} · {plural(p.salesCount, "sale")}
                      {p.type === "COMMUNITY" || p.type === "ALERTS" ? ` · ${plural(p._count.entitlements, "member")}` : ""}
                    </div>
                    <RatingSummary avg={p.ratingAvg} count={p.ratingCount} className="mt-1 text-xs" />
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/creator/products/${p.id}`} className="btn btn-secondary btn-sm">
                    Edit
                  </Link>
                  <Link href={productPath(user.username, p.slug)} className="btn btn-ghost btn-sm">
                    View
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {archived.length ? (
        <details className="card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Archived ({archived.length})</summary>
          <ul className="divide-y divide-line border-t border-line">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate">{p.title}</span>
                <Link href={`/creator/products/${p.id}`} className="btn btn-ghost btn-sm">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
