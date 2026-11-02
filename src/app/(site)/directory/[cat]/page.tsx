import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Info, Search, SearchX } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { Market } from "@/generated/prisma/enums";
import { CATEGORIES, MARKETS, categoryBySlug } from "@/lib/constants";
import { cn, daysFromNow, plural } from "@/lib/utils";
import { categoryCounts, companyPage, publicCompanyWhere, sponsoredFor, type CompanySort } from "@/server/queries/directory";
import { CompanyRow } from "@/components/directory/company-row";
import { CategoryIcon } from "@/components/category-icon";
import { FilterBar } from "@/components/market/filter-bar";
import { EmptyState, Pagination } from "@/components/ui/misc";

const PER_PAGE = 30;

const SORTS: Record<CompanySort, { label: string }> = {
  reviews: { label: "Most reviewed" },
  rating: { label: "Top rated" },
  popular: { label: "Most visited" },
  name: { label: "A to Z" },
};

type SP = { q?: string; market?: string; offers?: string; sort?: string; page?: string };
type Props = { params: Promise<{ cat: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params;
  const info = categoryBySlug(cat);
  if (!info) return { title: "Not found" };
  return {
    title: `${info.label}: compare and read reviews`,
    description: `${info.blurb} Compare ${info.label.toLowerCase()} and read reviews from traders on TraderTrades.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { cat } = await params;
  const info = categoryBySlug(cat);
  if (!info) notFound();
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const market = MARKETS.find((m) => m.value.toLowerCase() === sp.market?.toLowerCase())?.value as Market | undefined;
  const withOffers = sp.offers === "yes";
  const sort: CompanySort = sp.sort && sp.sort in SORTS ? (sp.sort as CompanySort) : "reviews";
  const page = Math.max(1, Math.min(100, Number(sp.page) || 1));
  const now = daysFromNow(0);

  const where: Prisma.CompanyWhereInput = {
    ...publicCompanyWhere,
    categories: { has: info.value },
    ...(market ? { markets: { has: market } } : {}),
    ...(withOffers ? { offers: { some: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { tagline: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { platforms: { has: q } },
          ],
        }
      : {}),
  };

  const [{ total, companies }, sponsored, counts] = await Promise.all([
    companyPage(where, sort, page, PER_PAGE),
    page === 1 && !q ? sponsoredFor("CATEGORY", info.value) : Promise.resolve([]),
    categoryCounts(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtered = Boolean(q || market || withOffers);

  const params_: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(market ? { market: market.toLowerCase() } : {}),
    ...(withOffers ? { offers: "yes" } : {}),
    ...(sort !== "reviews" ? { sort } : {}),
  };
  const base = `/directory/${info.slug}`;
  const href = (over: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params_, ...over })) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="container-tt py-6 sm:py-8">
      <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/directory" className="hover:text-ink">
          Directory
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink">{info.label}</span>
      </nav>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ink text-bg">
            <CategoryIcon category={info.value} className="size-6" />
          </span>
          <div>
            <h1 className="text-[28px] sm:text-[34px]">{info.label}</h1>
            <p className="mt-1 max-w-xl text-[15px] text-muted">{info.blurb}</p>
          </div>
        </div>
        <form action={base} method="get" className="relative w-full sm:w-72">
          {market ? <input type="hidden" name="market" value={market.toLowerCase()} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={q} placeholder={`Search ${info.label.toLowerCase()}`} className="input pl-9" aria-label={`Search ${info.label.toLowerCase()}`} />
        </form>
      </div>

      <nav className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Categories">
        {CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={`/directory/${c.slug}`}
            className={cn("chip shrink-0 gap-1.5", c.value === info.value && "border-ink bg-ink text-bg")}
            aria-current={c.value === info.value ? "page" : undefined}
          >
            <CategoryIcon category={c.value} className="size-3.5" />
            {c.label}
            <span className="num text-xs opacity-60">{counts.get(c.value) ?? 0}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <FilterBar
          path={base}
          params={params_}
          filters={[
            { name: "market", label: "Market", value: market?.toLowerCase() ?? "", options: [{ value: "", label: "All markets" }, ...MARKETS.map((m) => ({ value: m.value.toLowerCase(), label: m.label }))] },
            { name: "offers", label: "Offers", value: withOffers ? "yes" : "", options: [{ value: "", label: "With or without offers" }, { value: "yes", label: "Has an offer" }] },
            { name: "sort", label: "Sort", value: sort === "reviews" ? "" : sort, options: Object.entries(SORTS).map(([value, s]) => ({ value: value === "reviews" ? "" : value, label: s.label })) },
          ]}
        />
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="num">{plural(total, "company", "companies")}</span>
          {filtered ? (
            <Link href={base} className="font-semibold text-ink hover:underline">
              Clear filters
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-[13px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          {info.checkNote} Sorted by {SORTS[sort].label.toLowerCase()}. Paid spots are always labelled Sponsored and never change the order of the list.
        </span>
      </p>

      {sponsored.length ? (
        <section className="mt-5" aria-label="Sponsored">
          <ul className="grid gap-3">
            {sponsored.map((s) => (
              <CompanyRow key={s.slotId} company={s.company} from={`sponsored:${info.slug}`} sponsored />
            ))}
          </ul>
        </section>
      ) : null}

      {companies.length ? (
        <>
          <ul className="mt-5 grid gap-3">
            {companies.map((c) => (
              <CompanyRow key={c.id} company={c} from={`category:${info.slug}`} />
            ))}
          </ul>
          <Pagination page={page} pages={pages} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} />
        </>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<SearchX />}
          title="Nothing matches"
          description="Try fewer filters or a different search. If a company is missing, tell us and we'll add it."
          action={
            <>
              {filtered ? (
                <Link href={base} className="btn btn-secondary">
                  Clear filters
                </Link>
              ) : null}
              <Link href={`/directory/suggest?category=${info.slug}`} className="btn btn-primary">
                Suggest a company
              </Link>
            </>
          }
        />
      )}

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link href={`/directory/suggest?category=${info.slug}`} className="card card-hover p-5">
          <div className="font-semibold">Missing a company?</div>
          <p className="mt-1 text-sm text-muted">Suggest it and our team will add it, usually within a few days.</p>
        </Link>
        <Link href="/for-business" className="card card-hover p-5">
          <div className="font-semibold">Work at one of these companies?</div>
          <p className="mt-1 text-sm text-muted">Claim your listing for free to keep it right, post offers and reply to reviews.</p>
        </Link>
      </div>
    </div>
  );
}
