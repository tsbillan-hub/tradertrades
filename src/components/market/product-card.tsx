import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { RatingSummary, SampleBadge } from "@/components/ui/misc";
import { GeneratedCover } from "@/components/market/cover";
import { VerifiedTick } from "@/components/market/badges";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import type { ProductCardData } from "@/server/queries/products";
import { INTERVAL_SHORT, productTypeInfo } from "@/lib/constants";
import { cn, money } from "@/lib/utils";

export function priceLabel(prices: { amountCents: number; interval: "ONE_TIME" | "MONTH" | "YEAR"; sessions?: number | null }[]) {
  if (!prices.length) return "Not on sale";
  const sorted = [...prices].sort((a, b) => a.amountCents - b.amountCents);
  const p = sorted[0];
  if (p.amountCents === 0) return "Free";
  const base = `${money(p.amountCents)}${INTERVAL_SHORT[p.interval]}`;
  return sorted.length > 1 ? `From ${base}` : base;
}

export function productHref(p: { slug: string; creator: { username: string } }) {
  return `/@${p.creator.username}/${p.slug}`;
}

export function ProductCard({ product, className, compact }: { product: ProductCardData; className?: string; compact?: boolean }) {
  const info = productTypeInfo(product.type);
  return (
    <Link href={productHref(product)} className={cn("card card-hover group flex flex-col overflow-hidden", className)}>
      <div className="relative aspect-[16/9] overflow-hidden border-b border-line">
        {product.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <GeneratedCover title={product.title} type={product.type} seed={product.id} className="h-full w-full" />
        )}
        {product.launchState === "WAITLIST" ? <span className="badge badge-ink absolute top-3 left-3">Opening soon</span> : null}
      </div>
      <div className={cn("flex flex-1 flex-col", compact ? "p-3.5" : "p-4")}>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <ProductTypeIcon type={product.type} className="size-3.5" />
          {info.label}
          {product.isSample ? <SampleBadge className="ml-auto" /> : null}
        </div>
        <h3 className="mt-1.5 line-clamp-2 font-sans text-[15.5px] leading-snug font-bold tracking-[-0.01em] text-ink">{product.title}</h3>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
          <Avatar src={product.creator.avatarUrl} name={product.creator.displayName} size={20} />
          <span className="truncate">{product.creator.displayName}</span>
          <VerifiedTick who={product.creator} />
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <RatingSummary avg={product.ratingAvg} count={product.ratingCount} className="text-xs" />
          <span className="num shrink-0 text-[15px] font-semibold text-ink">{priceLabel(product.prices)}</span>
        </div>
      </div>
    </Link>
  );
}
