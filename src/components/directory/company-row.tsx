import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Tag } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RatingSummary } from "@/components/ui/misc";
import { CategoryIcon } from "@/components/category-icon";
import { categoryInfo, marketLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { goHref, liveOffers, type CompanyCardData } from "@/server/queries/directory";

/** Outbound links: never pass page rank, and say so when the link can earn us a commission. */
export function outboundRel(affiliate: boolean) {
  return affiliate ? "noopener nofollow sponsored" : "noopener nofollow";
}

/** One company in a list. The whole card opens the listing; "Visit website" goes straight to the company. */
export function CompanyRow({ company, from, sponsored, showCategory }: { company: CompanyCardData; from: string; sponsored?: boolean; showCategory?: boolean }) {
  const offers = liveOffers(company.offers);
  return (
    <li className={cn("card card-hover relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5", sponsored && "border-accent/40 bg-accent-soft/40")}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <Avatar src={company.logoUrl} name={company.name} size={52} square />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/directory/c/${company.slug}`} className="text-[17px] leading-tight font-bold after:absolute after:inset-0 after:rounded-[inherit] hover:underline">
              {company.name}
            </Link>
            {sponsored ? (
              <span className="badge badge-accent" title="A paid spot. The company paid to be shown here for a week.">
                Sponsored
              </span>
            ) : null}
            {company.claimedAt ? (
              <span className="badge badge-outline" title="Run by the company's own team">
                <BadgeCheck /> Claimed
              </span>
            ) : null}
          </div>
          {showCategory ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <CategoryIcon category={company.primaryCategory} className="size-3.5" />
              {categoryInfo(company.primaryCategory).singular}
            </div>
          ) : null}
          {company.tagline ? <p className="mt-1 line-clamp-2 text-sm text-ink-2">{company.tagline}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            <RatingSummary avg={company.ratingAvg} count={company.ratingCount} className="text-xs" />
            {company.markets.length ? <span>{company.markets.map(marketLabel).join(" · ")}</span> : null}
            {offers.length ? (
              <span className="badge badge-ok">
                <Tag /> {offers.length === 1 ? offers[0].title : `${offers.length} offers`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-2 sm:pl-2">
        <a
          href={goHref(company.slug, from)}
          target="_blank"
          rel={outboundRel(Boolean(company.affiliateUrl))}
          className="btn btn-secondary btn-sm w-full sm:w-auto"
        >
          Visit website <ArrowUpRight />
        </a>
      </div>
    </li>
  );
}
