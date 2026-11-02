import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Building2, ChevronRight, Search } from "lucide-react";
import { db } from "@/lib/db";
import { categoryInfo } from "@/lib/constants";
import { hostname } from "@/lib/utils";
import { getViewer } from "@/server/dal";
import { claimDomain } from "@/server/business";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { ClaimStartForm } from "@/components/business/forms";

export const metadata: Metadata = { title: "Claim your listing", description: "Claim your company's free TraderTrades directory listing." };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const slug = (sp.company ?? "").trim().toLowerCase();
  const company = /^[a-z0-9-]{1,80}$/.test(slug) ? await db.company.findUnique({ where: { slug }, include: { _count: { select: { members: true } } } }) : null;

  if (company && company.status === "PUBLISHED") {
    const here = `/business/claim?company=${company.slug}`;
    if (viewer) {
      const member = await db.businessMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: viewer.id } } });
      if (member) redirect(`/business/${company.slug}`);
      const waiting = await db.companyClaim.findFirst({ where: { companyId: company.id, userId: viewer.id, status: "PENDING", documentIds: { isEmpty: false } } });
      if (waiting) redirect(`/business/claim/${waiting.id}`);
    }
    const domain = claimDomain(company.website);
    return (
      <div className="container-tt max-w-3xl py-8 sm:py-12">
        <PageHeader back={{ href: "/business/claim", label: "Find another company" }} kicker="Claim a listing" title={`Claim ${company.name}`} />
        <div className="mt-6 card flex items-center gap-4 p-4">
          <Avatar src={company.logoUrl} name={company.name} size={48} square />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{company.name}</div>
            <div className="truncate text-sm text-muted">
              {categoryInfo(company.primaryCategory).label} · {hostname(company.website)}
            </div>
          </div>
          <Link href={`/directory/c/${company.slug}`} className="btn btn-ghost btn-sm">
            View listing
          </Link>
        </div>
        {company._count.members ? (
          <Notice className="mt-4" tone="info" title="This listing already has a team">
            If you work at {company.name} too, prove it the same way and you&apos;ll join the team. The team&apos;s owner hears about it.
          </Notice>
        ) : null}
        <div className="mt-6 card p-5 sm:p-6">
          {viewer ? (
            viewer.emailVerifiedAt ? (
              <ClaimStartForm companyId={company.id} companyName={company.name} domain={domain} />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">Confirm your account email first, then come back here.</p>
                <Link href={`/verify-email?next=${encodeURIComponent(here)}`} className="btn btn-primary">
                  Confirm your email
                </Link>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-2">
                Claiming is free. Sign in, or make an account for your work, then prove you work at {company.name}
                {domain ? ` with an email at ${domain}` : " with a document"}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/signup?as=business&next=${encodeURIComponent(here)}`} className="btn btn-primary">
                  Create a free account
                </Link>
                <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-secondary">
                  Sign in
                </Link>
              </div>
            </div>
          )}
        </div>
        <section className="mt-8">
          <h2 className="text-lg">What you can do once it&apos;s yours</h2>
          <ul className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
            {[
              "Add your logo and keep the details right",
              "Reply to reviews in public",
              "Post offers and discount codes",
              "Add walkthrough videos",
              "Book Sponsored spots",
              "Run paid campaigns with trading creators",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-up" /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">You can&apos;t remove or edit reviews, and paying never changes your rating or where you rank.</p>
        </section>
      </div>
    );
  }

  const q = (sp.q ?? "").trim().slice(0, 60);
  const results = q
    ? await db.company.findMany({
        where: { status: "PUBLISHED", OR: [{ name: { contains: q, mode: "insensitive" } }, { website: { contains: q.toLowerCase() } }] },
        orderBy: [{ ratingCount: "desc" }, { name: "asc" }],
        take: 20,
        include: { _count: { select: { members: true } } },
      })
    : [];
  return (
    <div className="container-tt max-w-3xl py-8 sm:py-12">
      <PageHeader
        kicker="Claim a listing"
        title="Find your company"
        description="Prop firms, brokers, platforms and tools are already listed. Find yours, then prove you work there with a work email code."
      />
      <form className="mt-6 flex gap-2" role="search">
        <label htmlFor="claim-q" className="sr-only">
          Company name or website
        </label>
        <input id="claim-q" name="q" defaultValue={q} className="input flex-1" placeholder="Company name or website" autoFocus />
        <button className="btn btn-primary">
          <Search /> Search
        </button>
      </form>
      {q ? (
        results.length ? (
          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Companies">
            {results.map((c) => (
              <li key={c.id}>
                <Link href={`/business/claim?company=${c.slug}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-hover">
                  <Avatar src={c.logoUrl} name={c.name} size={40} square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {categoryInfo(c.primaryCategory).label} · {hostname(c.website)}
                    </span>
                  </span>
                  {c._count.members ? <span className="badge badge-ok hidden sm:inline-flex">Claimed</span> : null}
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-6"
            icon={<Building2 />}
            title={`Nothing called "${q}"`}
            description="If your company isn't in the directory yet, add it. Our team checks it, then you can claim it."
            action={
              <Link href="/directory/suggest" className="btn btn-primary">
                Add your company
              </Link>
            }
          />
        )
      ) : (
        <p className="mt-6 text-sm text-muted">
          Not listed yet?{" "}
          <Link href="/directory/suggest" className="link">
            Add your company
          </Link>{" "}
          and our team checks it first.
        </p>
      )}
    </div>
  );
}
