import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil, Power, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { CATEGORIES, MARKETS } from "@/lib/constants";
import { formatDate, hostname, plural } from "@/lib/utils";
import { deleteOffer, toggleOffer } from "@/server/actions/admin";
import { ActionButton } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { CompanyForm, OfferForm } from "@/components/admin/forms";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await db.company.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Company" };
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditCompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const company = await db.company.findUnique({
    where: { id },
    include: {
      offers: { orderBy: { createdAt: "desc" } },
      members: { include: { user: { select: { id: true, username: true } } } },
      _count: { select: { reviews: true } },
    },
  });
  if (!company) notFound();
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/directory", label: "Directory" }}
        title={company.name}
        description={`${company.ratingCount ? `${company.ratingAvg.toFixed(1)} from ${plural(company.ratingCount, "review")}` : "No reviews yet"} · ${company.clickCount.toLocaleString()} visits sent · ${hostname(company.website)}`}
        actions={
          company.status === "PUBLISHED" ? (
            <Link href={`/directory/c/${company.slug}`} target="_blank" className="btn btn-secondary">
              See its page <ExternalLink />
            </Link>
          ) : (
            <span className="badge badge-outline">Hidden</span>
          )
        }
      />

      {sp.added ? (
        <Notice tone="ok" title="Added to the directory">
          It shows as “Not checked yet” until you fill in the details from their website, tick “I checked these details” and save.
        </Notice>
      ) : null}

      {company.members.length ? (
        <Notice tone="info" title="Claimed">
          Run by{" "}
          {company.members.map((m, i) => (
            <span key={m.id}>
              {i ? ", " : ""}
              <Link href={`/admin/users/${m.user.id}`} className="underline underline-offset-2">
                @{m.user.username}
              </Link>
            </span>
          ))}
          . They can change the description and reply to reviews; you can still change anything here.
        </Notice>
      ) : null}

      <div className="card p-5 sm:p-6">
        <CompanyForm
          categories={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          markets={MARKETS}
          company={{
            id: company.id,
            name: company.name,
            slug: company.slug,
            primaryCategory: company.primaryCategory,
            categories: company.categories,
            tagline: company.tagline ?? "",
            description: company.description ?? "",
            website: company.website,
            affiliateUrl: company.affiliateUrl ?? "",
            markets: company.markets,
            platforms: company.platforms.join(", "),
            foundedYear: company.foundedYear ? String(company.foundedYear) : "",
            headquarters: company.headquarters ?? "",
            status: company.status,
            lastChecked: company.lastCheckedAt ? formatDate(company.lastCheckedAt) : null,
          }}
        />
      </div>

      <Panel title="Offers" description="Discount codes and deals. Only add offers the company really runs, and check them on their website.">
        {company.offers.length ? (
          <ul className="-mt-2 mb-5 divide-y divide-line" aria-label="Offers">
            {company.offers.map((o) => {
              const expired = Boolean(o.expiresAt && o.expiresAt < now);
              return (
                <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {o.title}
                      {!o.active ? <span className="badge badge-outline">Off</span> : expired ? <span className="badge badge-warn">Ended</span> : <span className="badge badge-ok">Showing</span>}
                    </div>
                    <div className="truncate text-muted">
                      {[o.code ? `Code ${o.code}` : null, o.url ? hostname(o.url) : null, o.expiresAt ? `ends ${formatDate(o.expiresAt)}` : "no end date"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <ModalButton label={<><Pencil /> Edit</>} title="Edit offer" className="btn-sm" variant="ghost">
                      <OfferForm
                        companyId={company.id}
                        offer={{ id: o.id, title: o.title, description: o.description ?? "", code: o.code ?? "", url: o.url ?? "", expiresAt: isoDate(o.expiresAt) }}
                      />
                    </ModalButton>
                    <ActionButton action={toggleOffer} fields={{ offerId: o.id }} variant="ghost">
                      <Power /> {o.active ? "Turn off" : "Turn on"}
                    </ActionButton>
                    <ActionButton action={deleteOffer} fields={{ offerId: o.id }} variant="ghost" confirm={`Delete "${o.title}"?`}>
                      <Trash2 /> Delete
                    </ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className={company.offers.length ? "border-t border-line pt-5" : undefined}>
          <h3 className="mb-3 text-sm font-semibold">Add an offer</h3>
          <OfferForm companyId={company.id} />
        </div>
      </Panel>
    </div>
  );
}
