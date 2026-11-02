import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Megaphone, MessageSquareQuote, Search, SearchX, Tag } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/constants";
import { daysFromNow, plural, timeAgo, truncate } from "@/lib/utils";
import { categoryCounts, companyCardSelect, companyPage, publicCompanyWhere } from "@/server/queries/directory";
import { CompanyRow } from "@/components/directory/company-row";
import { CategoryIcon } from "@/components/category-icon";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Stars } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Directory of prop firms, brokers and trading tools",
  description: "Compare prop firms, brokers, trading platforms, journals, backtesting tools, trade copiers and more, with reviews from traders.",
};

type SP = { q?: string };

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { q: rawQ } = await searchParams;
  const q = rawQ?.trim().slice(0, 80) ?? "";
  const now = daysFromNow(0);
  const liveOffer = { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } satisfies Prisma.CompanyOfferWhereInput;

  if (q) {
    const where: Prisma.CompanyWhereInput = {
      ...publicCompanyWhere,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { tagline: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { platforms: { has: q } },
      ],
    };
    const { companies: results } = await companyPage(where, "reviews", 1, 50);
    return (
      <div className="container-tt py-8 sm:py-10">
        <DirectoryHeader q={q} />
        <div className="mt-8 flex items-center justify-between border-b border-line pb-3 text-sm text-muted">
          <span>
            {plural(results.length, "company", "companies")} for &ldquo;{q}&rdquo;
          </span>
          <Link href="/directory" className="font-semibold text-ink hover:underline">
            Clear search
          </Link>
        </div>
        {results.length ? (
          <ul className="mt-5 grid gap-3">
            {results.map((c) => (
              <CompanyRow key={c.id} company={c} from="directory-search" showCategory />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-6"
            icon={<SearchX />}
            title="We don't have that one yet"
            description="Tell us about it and our team will add it, usually within a few days."
            action={
              <Link href={`/directory/suggest?name=${encodeURIComponent(q)}`} className="btn btn-primary">
                Suggest a company
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const [counts, total, reviewCount, latest, topRated, offers] = await Promise.all([
    categoryCounts(),
    db.company.count({ where: publicCompanyWhere }),
    db.companyReview.count({ where: { status: "PUBLISHED", company: publicCompanyWhere } }),
    db.companyReview.findMany({
      where: { status: "PUBLISHED", company: publicCompanyWhere },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        user: { select: { displayName: true, avatarUrl: true } },
        company: { select: { slug: true, name: true, logoUrl: true } },
      },
    }),
    db.company.findMany({
      where: { ...publicCompanyWhere, ratingCount: { gt: 0 } },
      select: companyCardSelect,
      orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
      take: 6,
    }),
    db.companyOffer.findMany({
      where: { ...liveOffer, company: publicCompanyWhere },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { company: { select: { slug: true, name: true, logoUrl: true } } },
    }),
  ]);

  return (
    <div className="container-tt py-8 sm:py-10">
      <DirectoryHeader q="" total={total} reviews={reviewCount} />

      <section className="mt-10">
        <h2 className="sr-only">Categories</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <Link key={c.value} href={`/directory/${c.slug}`} className="card card-hover group flex items-start gap-3.5 p-4 sm:p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sunk text-ink transition-colors group-hover:bg-primary group-hover:text-primary-ink">
                <CategoryIcon category={c.value} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-bold">{c.label}</span>
                  <span className="num text-xs text-faint">{counts.get(c.value) ?? 0}</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">{c.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {offers.length ? (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl">Offers from companies</h2>
              <p className="mt-1 text-sm text-muted">Discounts and deals the companies post themselves.</p>
            </div>
            <Link href="/directory/offers" className="text-sm font-semibold hover:underline">
              All offers
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {offers.map((o) => (
              <Link key={o.id} href={`/directory/c/${o.company.slug}`} className="card card-hover flex items-start gap-3 p-4">
                <Avatar src={o.company.logoUrl} name={o.company.name} size={40} square />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted">{o.company.name}</div>
                  <div className="mt-0.5 font-semibold">{o.title}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-up">
                    <Tag className="size-3.5" /> {o.code ? `Code ${o.code}` : "Deal"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {topRated.length ? (
        <section className="mt-14">
          <h2 className="text-xl">Highest rated by traders</h2>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {topRated.map((c) => (
              <CompanyRow key={c.id} company={c} from="directory-top" showCategory />
            ))}
          </ul>
        </section>
      ) : null}

      {latest.length ? (
        <section className="mt-14">
          <h2 className="text-xl">Latest reviews</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {latest.map((r) => (
              <Link key={r.id} href={`/directory/c/${r.company.slug}#r-${r.id}`} className="card card-hover block p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Avatar src={r.company.logoUrl} name={r.company.name} size={24} square />
                    <span className="truncate">{r.company.name}</span>
                  </span>
                  <Stars value={r.rating} />
                </div>
                <div className="mt-3 font-semibold">{r.title}</div>
                <p className="mt-1 text-sm text-ink-2">{truncate(r.body, 180)}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Avatar src={r.user.avatarUrl} name={r.user.displayName} size={18} />
                  {r.user.displayName} · {timeAgo(r.createdAt)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-14 rounded-2xl border border-line bg-card p-6 sm:p-8">
        <h2 className="text-xl">How the directory works</h2>
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <div>
            <BadgeCheck className="size-5" />
            <div className="mt-2 font-semibold">Facts, not sales talk</div>
            <p className="mt-1 text-sm text-muted">
              Each listing starts with plain facts from the company&apos;s own site. Prices and rules change often, so we send you to the source for those.
            </p>
          </div>
          <div>
            <MessageSquareQuote className="size-5" />
            <div className="mt-2 font-semibold">Reviews from traders</div>
            <p className="mt-1 text-sm text-muted">Anyone with an account can review a company once. Companies can reply, but they can&apos;t edit or remove reviews.</p>
          </div>
          <div>
            <Megaphone className="size-5" />
            <div className="mt-2 font-semibold">Free to be listed</div>
            <p className="mt-1 text-sm text-muted">Listings are free and companies can claim theirs. Paid spots are always labelled Sponsored and never change the order of a list.</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/directory/suggest" className="card card-hover flex items-center justify-between gap-4 p-5">
          <span>
            <span className="block font-semibold">Can&apos;t find a company?</span>
            <span className="mt-0.5 block text-sm text-muted">Suggest it and we&apos;ll add it.</span>
          </span>
          <ArrowRight className="size-5 shrink-0" />
        </Link>
        <Link href="/for-business" className="card card-hover flex items-center justify-between gap-4 p-5">
          <span>
            <span className="block font-semibold">Run one of these companies?</span>
            <span className="mt-0.5 block text-sm text-muted">Claim your listing for free.</span>
          </span>
          <ArrowRight className="size-5 shrink-0" />
        </Link>
      </div>
    </div>
  );
}

function DirectoryHeader({ q, total, reviews }: { q: string; total?: number; reviews?: number }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <div className="kicker">Directory</div>
        <h1 className="mt-2 text-[30px] leading-[1.1] sm:text-[40px]">Prop firms, brokers and the tools traders use</h1>
        <p className="mt-3 text-[15px] text-muted sm:text-base">
          Compare them side by side and read what other traders say.
          {typeof total === "number" ? ` ${plural(total, "company", "companies")} listed${reviews ? `, ${plural(reviews, "review")} so far` : ""}.` : ""}
        </p>
      </div>
      <form action="/directory" method="get" className="relative w-full lg:w-96">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
        <input name="q" defaultValue={q} placeholder="Search Topstep, NinjaTrader, journals..." className="input h-12 pl-10 text-[15px]" aria-label="Search the directory" />
      </form>
    </div>
  );
}

