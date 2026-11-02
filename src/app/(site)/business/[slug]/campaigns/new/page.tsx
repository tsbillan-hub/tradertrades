import type { Metadata } from "next";
import { requireBusiness } from "@/server/dal";
import { PageHeader } from "@/components/ui/misc";
import { CampaignForm } from "@/components/business/forms";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `/business/${company.slug}/campaigns`, label: "Campaigns" }}
        title="New campaign"
        description="Once it's live, creators can find it on the campaigns page and apply with their price. You can also invite creators yourself."
      />
      <CampaignForm companyId={company.id} c={{ title: "", brief: "", deliverables: "", markets: company.markets, platforms: [], budget: "", creatorsWanted: "1", minAudience: "", deadline: "" }} />
    </div>
  );
}
