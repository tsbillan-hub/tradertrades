import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Tag } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CATEGORIES, categoryBySlug } from "@/lib/constants";
import { cn, daysFromNow } from "@/lib/utils";
import { publicCompanyWhere } from "@/server/queries/directory";
import { OfferWithCompany } from "@/components/directory/offer-item";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Offers from prop firms, brokers and trading tools",
  description: "Discount codes and deals posted by prop firms, brokers, platforms and trading tools on the TraderTrades directory.",
};

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const cat = category ? categoryBySlug(category) : undefined;
  const now = daysFromNow(0);
  const where: Prisma.CompanyOfferWhereInput = {
    active: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    company: { ...publicCompanyWhere, ...(cat ? { categories: { has: cat.value } } : {}) },
  };
  const [offers, byCategory] = await Promise.all([
    db.companyOffer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { company: { select: { slug: true, name: true, logoUrl: true, affiliateUrl: true, tagline: true } } },
    }),
    db.companyOffer.findMany({
      where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], company: publicCompanyWhere },
      select: { company: { select: { categories: true } } },
    }),
  ]);
  const countFor = (v: string) => byCategory.filter((o) => o.company.categories.some((c) => c === v)).length;
  const withOffers = CATEGORIES.filter((c) => countFor(c.value) > 0);

  return (
    <div className="container-tt py-6 sm:py-8">
      <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/directory" className="hover:text-ink">
          Directory
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink">Offers</span>
      </nav>
      <h1 className="mt-4 text-[28px] sm:text-[34px]">Offers</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-muted">
        Discount codes and deals posted by the companies themselves. Always read the terms on the company&apos;s site before you buy.
      </p>

      {withOffers.length ? (
        <nav className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filter offers by category">
          <Link href="/directory/offers" className={cn("chip shrink-0", !cat && "border-ink bg-ink text-bg")}>
            All
          </Link>
          {withOffers.map((c) => (
            <Link
              key={c.value}
              href={`/directory/offers?category=${c.slug}`}
              className={cn("chip shrink-0 gap-1.5", cat?.value === c.value && "border-ink bg-ink text-bg")}
            >
              <CategoryIcon category={c.value} className="size-3.5" />
              {c.label}
              <span className="num text-xs opacity-60">{countFor(c.value)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {offers.length ? (
        <div className="mt-6 space-y-6">
          {offers.map((o) => (
            <OfferWithCompany key={o.id} offer={o} company={o.company} from="offers-page" />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<Tag />}
          title={cat ? `No ${cat.label.toLowerCase()} offers right now` : "No offers right now"}
          description="Companies post offers once they claim their listing. Check back soon."
          action={
            <Link href="/directory" className="btn btn-secondary">
              Browse the directory
            </Link>
          }
        />
      )}
    </div>
  );
}
