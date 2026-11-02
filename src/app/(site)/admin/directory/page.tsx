import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus, Search } from "lucide-react";
import type { CompanyCategory } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CATEGORIES, categoryInfo } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { pageParam } from "@/server/queries/admin";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Directory" };

const PER_PAGE = 40;
const sortName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export default async function AdminDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; show?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const cat = CATEGORIES.find((c) => c.value === sp.cat)?.value as CompanyCategory | undefined;
  const show = sp.show === "hidden" || sp.show === "unchecked" || sp.show === "affiliate" ? sp.show : "";
  const page = pageParam(sp.page);
  const where: Prisma.CompanyWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { website: { contains: q, mode: "insensitive" } }] } : {}),
    ...(cat ? { categories: { has: cat } } : {}),
    ...(show === "hidden" ? { status: "HIDDEN" } : {}),
    ...(show === "unchecked" ? { lastCheckedAt: null } : {}),
    ...(show === "affiliate" ? { affiliateUrl: { not: null } } : {}),
  };
  // Sorted by name in code: the database sorts by byte order, which puts lowercase names last.
  const all = await db.company.findMany({
    where,
    select: { id: true, name: true, slug: true, primaryCategory: true, status: true, lastCheckedAt: true, ratingAvg: true, ratingCount: true, claimedAt: true, affiliateUrl: true, clickCount: true },
  });
  all.sort((a, b) => sortName.compare(a.name, b.name));
  const rows = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const hrefFor = (p: number) =>
    `/admin/directory?${new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { cat } : {}), ...(show ? { show } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Directory"
        description={`${all.length} ${all.length === 1 ? "company" : "companies"}. Facts only come from each company's own website; ratings only come from reviews.`}
        actions={
          <Link href="/admin/directory/new" className="btn btn-primary">
            <Plus /> Add company
          </Link>
        }
      />
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="dir-q">
          Search companies
        </label>
        <input id="dir-q" name="q" defaultValue={q} className="input flex-1" placeholder="Name, slug or website" />
        <label className="sr-only" htmlFor="dir-cat">
          Category
        </label>
        <select id="dir-cat" name="cat" defaultValue={cat ?? ""} className="input sm:w-44">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="dir-show">
          Show
        </label>
        <select id="dir-show" name="show" defaultValue={show} className="input sm:w-44">
          <option value="">Everything</option>
          <option value="unchecked">Not checked yet</option>
          <option value="hidden">Hidden</option>
          <option value="affiliate">With affiliate link</option>
        </select>
        <button className="btn btn-secondary">
          <Search /> Search
        </button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
                <th className="px-4 py-2.5 text-right font-medium">Reviews</th>
                <th className="px-4 py-2.5 text-right font-medium">Visits sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/directory/${c.id}`} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {c.status === "HIDDEN" ? <span className="badge badge-outline">Hidden</span> : null}
                      {c.claimedAt ? <span className="badge badge-info">Claimed</span> : null}
                      {c.affiliateUrl ? <span className="badge badge-accent">Affiliate</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{categoryInfo(c.primaryCategory).singular}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{c.lastCheckedAt ? <span className="text-ink-2">Checked {formatDate(c.lastCheckedAt)}</span> : <span className="text-warn">Not checked yet</span>}</td>
                  <td className="num px-4 py-2.5 text-right">{c.ratingCount ? `${c.ratingAvg.toFixed(1)} (${c.ratingCount})` : "–"}</td>
                  <td className="num px-4 py-2.5 text-right">{c.clickCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Building2 />} title="No companies match" />
      )}
      <Pagination page={page} pages={Math.ceil(all.length / PER_PAGE)} hrefFor={hrefFor} />
    </div>
  );
}
