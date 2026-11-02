import Link from "next/link";
import { ArrowUpRight, Clock, Tag } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/client";
import { formatDate } from "@/lib/utils";
import { goHref } from "@/server/queries/directory";
import { outboundRel } from "@/components/directory/company-row";

export type OfferItemData = {
  id: string;
  title: string;
  description: string | null;
  code: string | null;
  url: string | null;
  expiresAt: Date | null;
};

/** A company's discount or deal, with the code to copy and a counted link to use it. */
export function OfferItem({
  offer,
  company,
  from,
}: {
  offer: OfferItemData;
  company: { slug: string; name: string; logoUrl: string | null; affiliateUrl: string | null };
  from: string;
}) {
  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-up-soft text-up">
          <Tag className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{offer.title}</div>
          {offer.description ? <p className="mt-0.5 text-sm text-ink-2">{offer.description}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {offer.expiresAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> Ends {formatDate(offer.expiresAt)}
              </span>
            ) : (
              <span>No end date given</span>
            )}
            <span>Terms on {company.name}&apos;s site</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {offer.code ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-sunk py-1 pr-1 pl-3">
            <code className="num text-sm font-semibold tracking-wide">{offer.code}</code>
            <CopyButton value={offer.code} label="Copy" small className="btn-ghost" />
          </div>
        ) : null}
        <a href={goHref(company.slug, from, offer.id)} target="_blank" rel={outboundRel(Boolean(company.affiliateUrl || offer.url))} className="btn btn-primary btn-sm">
          Get offer <ArrowUpRight />
        </a>
      </div>
    </div>
  );
}

/** The same offer in a list across companies: adds who it's from. */
export function OfferWithCompany({
  offer,
  company,
  from,
}: {
  offer: OfferItemData;
  company: { slug: string; name: string; logoUrl: string | null; affiliateUrl: string | null; tagline: string | null };
  from: string;
}) {
  return (
    <div className="space-y-2">
      <Link href={`/directory/c/${company.slug}`} className="flex items-center gap-2 text-sm font-semibold hover:underline">
        <Avatar src={company.logoUrl} name={company.name} size={22} square />
        {company.name}
      </Link>
      <OfferItem offer={offer} company={company} from={from} />
    </div>
  );
}
