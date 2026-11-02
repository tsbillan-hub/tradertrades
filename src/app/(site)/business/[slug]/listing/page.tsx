import type { Metadata } from "next";
import Link from "next/link";
import { categoryInfo } from "@/lib/constants";
import { hostname } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ListingForm } from "@/components/business/forms";

export const metadata: Metadata = { title: "Listing" };

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your listing"
        description="What traders see on your directory page. Changes go live as soon as you save."
        actions={
          <Link href={`/directory/c/${company.slug}`} className="btn btn-secondary">
            View it
          </Link>
        }
      />
      <Notice tone="plain" title="Changed through our team">
        Your name ({company.name}), website ({hostname(company.website)}) and category ({categoryInfo(company.primaryCategory).label}) stay as they are so traders can trust
        them.{" "}
        <Link href="/help#contact" className="underline underline-offset-2">
          Ask us
        </Link>{" "}
        if one is wrong. Prices, rules and other facts in the comparison table are checked by our team too.
      </Notice>
      <ListingForm
        c={{
          companyId: company.id,
          tagline: company.tagline ?? "",
          description: company.description ?? "",
          markets: company.markets,
          platforms: company.platforms.join(", "),
          foundedYear: company.foundedYear ? String(company.foundedYear) : "",
          headquarters: company.headquarters ?? "",
          logoUrl: company.logoUrl,
        }}
      />
    </div>
  );
}
