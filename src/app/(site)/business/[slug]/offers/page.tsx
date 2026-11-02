import type { Metadata } from "next";
import Link from "next/link";
import { Ticket, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { deleteBusinessOffer, toggleBusinessOffer } from "@/server/actions/business";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { BusinessOfferForm, EditOfferButton } from "@/components/business/forms";

export const metadata: Metadata = { title: "Offers" };

export default async function BusinessOffersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  const now = new Date();
  const offers = await db.companyOffer.findMany({ where: { companyId: company.id }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        description={
          <>
            Discount codes and deals show on your listing and on the{" "}
            <Link href="/directory/offers" className="link">
              offers page
            </Link>
            . Keep them true: an offer that doesn&apos;t work gets reported.
          </>
        }
      />
      <Panel title="Add an offer">
        <BusinessOfferForm companyId={company.id} />
      </Panel>
      {offers.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Your offers">
          {offers.map((o) => {
            const expired = Boolean(o.expiresAt && o.expiresAt < now);
            return (
              <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{o.title}</span>
                    {expired ? <span className="badge badge-outline">Ended</span> : o.active ? <span className="badge badge-ok">Live</span> : <span className="badge badge-outline">Off</span>}
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {[o.code ? `Code ${o.code}` : null, o.url ? "Has a link" : null, o.expiresAt ? `Ends ${formatDate(o.expiresAt)}` : "No end date"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <EditOfferButton
                    companyId={company.id}
                    offer={{
                      id: o.id,
                      title: o.title,
                      description: o.description ?? "",
                      code: o.code ?? "",
                      url: o.url ?? "",
                      expiresAt: o.expiresAt ? o.expiresAt.toISOString().slice(0, 10) : "",
                    }}
                  />
                  <ActionButton action={toggleBusinessOffer} fields={{ offerId: o.id }} variant="ghost">
                    {o.active ? "Turn off" : "Turn on"}
                  </ActionButton>
                  <ActionButton action={deleteBusinessOffer} fields={{ offerId: o.id }} variant="ghost" confirm="Delete this offer?">
                    <Trash2 /> Delete
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Ticket />} title="No offers yet" description="Traders love a code. Add one above and it shows up straight away." />
      )}
    </div>
  );
}
