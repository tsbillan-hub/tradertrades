import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Handshake, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { FEE_BPS } from "@/lib/fees";
import { formatDate, money, plural } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { CAMPAIGN_STATUS } from "@/server/business";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Campaigns" };

export default async function BusinessCampaignsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  const base = `/business/${company.slug}/campaigns`;
  const campaigns = await db.campaign.findMany({
    where: { companyId: company.id },
    orderBy: [{ updatedAt: "desc" }],
    include: { deals: { select: { status: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description={`Post a brief and creators apply, or invite them yourself. You pay each creator's price plus our ${FEE_BPS.CAMPAIGN / 100}% into the deal, and they're paid when you approve the work.`}
        actions={
          <Link href={`${base}/new`} className="btn btn-primary">
            <Plus /> New campaign
          </Link>
        }
      />
      {campaigns.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Your campaigns">
          {campaigns.map((c) => {
            const applied = c.deals.filter((d) => d.status === "APPLIED").length;
            const working = c.deals.filter((d) => ["ACCEPTED", "FUNDED", "SUBMITTED"].includes(d.status)).length;
            const done = c.deals.filter((d) => d.status === "APPROVED" || d.status === "PAID").length;
            const st = CAMPAIGN_STATUS[c.status];
            return (
              <li key={c.id}>
                <Link href={`${base}/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-hover">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{c.title}</span>
                      <span className={`badge ${st.tone}`}>{st.label}</span>
                      {applied ? <span className="badge badge-accent">{plural(applied, "new application")}</span> : null}
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {money(c.budgetCents)} per creator · {plural(working, "deal")} going · {done} done
                      {c.deadline ? ` · live by ${formatDate(c.deadline)}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Handshake />}
          title="No campaigns yet"
          description="A review video, a tutorial on your platform, a live session: write what you want and what it pays, and trading creators apply."
          action={
            <>
              <Link href={`${base}/new`} className="btn btn-primary">
                <Plus /> New campaign
              </Link>
              <Link href={`/business/${company.slug}/creators`} className="btn btn-secondary">
                Browse creators
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}
