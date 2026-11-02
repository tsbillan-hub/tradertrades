import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { GeneratedCover } from "@/components/market/cover";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { PRODUCT_TYPES, productTypeInfo } from "@/lib/constants";
import { insidePath, productPath } from "@/lib/paths";
import { formatDate, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const user = await requireUser();
  const entitlements = await db.entitlement.findMany({
    where: { userId: user.id },
    include: {
      product: { include: { creator: { select: { username: true, displayName: true, avatarUrl: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const subs = await db.subscription.findMany({
    where: { buyerId: user.id, status: { not: "CANCELED" } },
    select: { productId: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  const subFor = (productId: string) => subs.find((s) => s.productId === productId);

  const active = entitlements.filter((e) => e.status === "ACTIVE");
  const ended = entitlements.filter((e) => e.status !== "ACTIVE");
  const groups = PRODUCT_TYPES.map((t) => ({ t, items: active.filter((e) => e.product.type === t.value) })).filter((g) => g.items.length);

  return (
    <div className="container-tt py-8 sm:py-10">
      <PageHeader
        title="Library"
        description="Everything you've bought or joined. Open anything to pick up where you left off."
        actions={
          <Link href="/settings/billing" className="btn btn-secondary">
            Purchases and receipts
          </Link>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Library />}
          title="Nothing here yet"
          description="Communities you join and things you buy show up here."
          action={
            <Link href="/marketplace" className="btn btn-primary">
              Browse the marketplace
            </Link>
          }
        />
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map(({ t, items }) => (
            <section key={t.value}>
              <h2 className="mb-4 flex items-center gap-2 text-lg">
                <ProductTypeIcon type={t.value} className="size-4 text-muted" />
                {t.plural}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((e) => {
                  const p = e.product;
                  const sub = subFor(p.id);
                  return (
                    <div key={e.id} className="card flex flex-col overflow-hidden">
                      <Link href={insidePath(p.creator.username, p.slug)} className="block aspect-[16/8] overflow-hidden border-b border-line">
                        {p.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <GeneratedCover title={p.title} type={p.type} seed={p.id} className="h-full w-full" />
                        )}
                      </Link>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="font-semibold leading-snug">{p.title}</div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                          <Avatar src={p.creator.avatarUrl} name={p.creator.displayName} size={18} />
                          {p.creator.displayName}
                        </div>
                        <div className="mt-2 text-xs text-muted">
                          {p.type === "MENTORING" && e.sessionsTotal != null
                            ? `${plural(Math.max(0, e.sessionsTotal - e.sessionsUsed), "call")} left`
                            : sub
                              ? sub.status === "TRIALING"
                                ? `Free trial until ${formatDate(sub.currentPeriodEnd)}`
                                : sub.cancelAtPeriodEnd
                                  ? `Ends ${formatDate(sub.currentPeriodEnd)}`
                                  : sub.status === "PAST_DUE"
                                    ? "Payment failed: update your card"
                                    : `Renews ${formatDate(sub.currentPeriodEnd)}`
                              : `Added ${formatDate(e.createdAt)}`}
                        </div>
                        <div className="mt-auto flex gap-2 pt-4">
                          <Link href={insidePath(p.creator.username, p.slug)} className="btn btn-primary btn-sm flex-1">
                            {p.type === "MENTORING" ? "Book a call" : "Open"}
                          </Link>
                          <Link href={productPath(p.creator.username, p.slug)} className="btn btn-ghost btn-sm">
                            Listing
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {ended.length ? (
        <section className="mt-12">
          <h2 className="mb-3 text-lg">Ended</h2>
          <ul className="card divide-y divide-line">
            {ended.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.product.title}</div>
                  <div className="text-xs text-muted">
                    {productTypeInfo(e.product.type).label} ·{" "}
                    {e.status === "REFUNDED" ? "Refunded" : e.status === "REVOKED" ? "Access removed" : `Ended ${formatDate(e.endsAt ?? e.updatedAt)}`}
                  </div>
                </div>
                {e.product.status === "PUBLISHED" ? (
                  <Link href={productPath(e.product.creator.username, e.product.slug)} className="btn btn-secondary btn-sm shrink-0">
                    {e.product.type === "COMMUNITY" || e.product.type === "ALERTS" ? "Rejoin" : "View"}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
