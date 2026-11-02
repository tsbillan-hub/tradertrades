import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireBusiness } from "@/server/dal";
import { PageHeader } from "@/components/ui/misc";
import { CampaignForm } from "@/components/business/forms";

export const metadata: Metadata = { title: "Edit campaign" };

export default async function EditCampaignPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { company } = await requireBusiness(slug);
  const c = await db.campaign.findFirst({ where: { id, companyId: company.id } });
  if (!c || c.status === "REMOVED") notFound();
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: `/business/${company.slug}/campaigns/${c.id}`, label: c.title }} title="Edit campaign" description="Deals already agreed keep the price and brief they were agreed on." />
      <CampaignForm
        companyId={company.id}
        c={{
          id: c.id,
          status: c.status,
          title: c.title,
          brief: c.brief,
          deliverables: c.deliverables.join("\n"),
          markets: c.markets,
          platforms: c.platforms,
          budget: String(c.budgetCents / 100),
          creatorsWanted: String(c.creatorsWanted),
          minAudience: c.minAudience ? String(c.minAudience) : "",
          deadline: c.deadline ? c.deadline.toISOString().slice(0, 10) : "",
        }}
      />
    </div>
  );
}
