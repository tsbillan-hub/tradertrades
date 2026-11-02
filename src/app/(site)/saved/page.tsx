import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { productCardInclude } from "@/server/queries/products";
import { toggleSaved } from "@/server/actions/profile";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, PageHeader, RatingSummary } from "@/components/ui/misc";
import { ProductCard } from "@/components/market/product-card";
import { VerifiedTick } from "@/components/market/badges";
import { categoryInfo } from "@/lib/constants";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await requireUser();
  const items = await db.savedItem.findMany({
    where: { userId: user.id },
    include: {
      product: { include: productCardInclude },
      company: true,
      creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, idVerifiedAt: true, status: true, creator: { select: { headline: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const products = items.filter((i) => i.product && i.product.status === "PUBLISHED");
  const companies = items.filter((i) => i.company && i.company.status === "PUBLISHED");
  const creators = items.filter((i) => i.creator && i.creator.status === "ACTIVE");

  return (
    <div className="container-tt py-8 sm:py-10">
      <PageHeader title="Saved" description="Products, creators and companies you saved to come back to." />
      {!products.length && !companies.length && !creators.length ? (
        <EmptyState
          className="mt-8"
          icon={<Bookmark />}
          title="Nothing saved yet"
          description="Tap Save on a product or company and it lands here."
          action={
            <>
              <Link href="/marketplace" className="btn btn-primary">
                Browse the marketplace
              </Link>
              <Link href="/directory" className="btn btn-secondary">
                Open the directory
              </Link>
            </>
          }
        />
      ) : (
        <div className="mt-8 space-y-10">
          {products.length ? (
            <section>
              <h2 className="mb-4 text-lg">Products</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((i) => (
                  <div key={i.id} className="relative">
                    <ProductCard product={i.product!} />
                    <div className="absolute top-2 right-2">
                      <ActionButton action={toggleSaved} fields={{ productId: i.product!.id }} variant="secondary" title="Remove from saved">
                        <X />
                        <span className="sr-only">Remove</span>
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {creators.length ? (
            <section>
              <h2 className="mb-4 text-lg">Creators</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {creators.map((i) => (
                  <div key={i.id} className="card flex items-center gap-3 p-4">
                    <Link href={`/@${i.creator!.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar src={i.creator!.avatarUrl} name={i.creator!.displayName} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-sm font-semibold">
                          <span className="truncate">{i.creator!.displayName}</span>
                          <VerifiedTick who={i.creator!} />
                        </div>
                        <div className="truncate text-xs text-muted">{i.creator!.creator?.headline ?? `@${i.creator!.username}`}</div>
                      </div>
                    </Link>
                    <ActionButton action={toggleSaved} fields={{ creatorId: i.creator!.id }} variant="ghost" title="Remove from saved">
                      <X />
                    </ActionButton>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {companies.length ? (
            <section>
              <h2 className="mb-4 text-lg">Companies</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((i) => (
                  <div key={i.id} className="card flex items-center gap-3 p-4">
                    <Link href={`/directory/c/${i.company!.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar src={i.company!.logoUrl} name={i.company!.name} size={40} square />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{i.company!.name}</div>
                        <div className="truncate text-xs text-muted">{categoryInfo(i.company!.primaryCategory).singular}</div>
                        <RatingSummary avg={i.company!.ratingAvg} count={i.company!.ratingCount} className="text-xs" />
                      </div>
                    </Link>
                    <ActionButton action={toggleSaved} fields={{ companyId: i.company!.id }} variant="ghost" title="Remove from saved">
                      <X />
                    </ActionButton>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
