import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Handshake, Search } from "lucide-react";
import type { DealStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formatDate, money, timeAgo } from "@/lib/utils";
import { requireCreator } from "@/server/dal";
import { DEAL_APPROVE_DAYS, DEAL_STATUS, dealTotals } from "@/server/business";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, LinkTabs, Notice, PageHeader, Stat } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Brand deals" };

const DAY = 86_400_000;
const TABS: Record<string, { label: string; statuses: DealStatus[]; emptyTitle: string; empty: string }> = {
  active: { label: "Active", statuses: ["ACCEPTED", "FUNDED", "SUBMITTED"], emptyTitle: "No active deals", empty: "Deals you've agreed show up here, from waiting for payment to approved." },
  invites: { label: "Invites", statuses: ["INVITED"], emptyTitle: "No invites yet", empty: "When a company invites you to a campaign, you answer here." },
  applied: { label: "Applications", statuses: ["APPLIED"], emptyTitle: "No applications waiting", empty: "Campaigns you've applied to and haven't heard back on." },
  done: { label: "Done", statuses: ["APPROVED", "PAID", "DECLINED", "CANCELED"], emptyTitle: "Nothing finished yet", empty: "Approved, declined and canceled deals." },
};

/** One line under each deal saying where it's at and what happens next. */
function whereItsAt(d: { status: DealStatus; createdAt: Date; invitedAt: Date | null; acceptedAt: Date | null; fundedAt: Date | null; submittedAt: Date | null; approvedAt: Date | null; canceledAt: Date | null; updatedAt: Date; changesNote: string | null }) {
  switch (d.status) {
    case "INVITED":
      return `Invited ${timeAgo(d.invitedAt ?? d.createdAt)}. Answer to agree the price.`;
    case "APPLIED":
      return `Applied ${timeAgo(d.createdAt)}`;
    case "ACCEPTED":
      return `Agreed ${timeAgo(d.acceptedAt ?? d.updatedAt)}. Waiting for them to pay in, don't start yet.`;
    case "FUNDED":
      return d.changesNote ? "They asked for changes. Update the work and send it again." : `Paid in ${timeAgo(d.fundedAt ?? d.updatedAt)}. Make it and send the links.`;
    case "SUBMITTED":
      return d.submittedAt ? `Sent ${timeAgo(d.submittedAt)}. Approved automatically on ${formatDate(new Date(d.submittedAt.getTime() + DEAL_APPROVE_DAYS * DAY))} if they say nothing.` : "Sent";
    case "APPROVED":
    case "PAID":
      return `Approved ${formatDate(d.approvedAt ?? d.updatedAt)}`;
    case "DECLINED":
      return "Not this time";
    case "CANCELED":
      return `Canceled ${formatDate(d.canceledAt ?? d.updatedAt)}`;
  }
}

export default async function CreatorCampaignsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireCreator();
  const sp = await searchParams;
  const tab = sp.tab && sp.tab in TABS ? sp.tab : "active";
  const deals = await db.deal.findMany({
    where: { creatorId: user.id },
    include: { campaign: { select: { title: true } }, company: { select: { name: true, logoUrl: true } } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const count = (k: string) => deals.filter((d) => TABS[k].statuses.includes(d.status)).length;
  const shown = deals.filter((d) => TABS[tab].statuses.includes(d.status));
  const earned = deals.filter((d) => d.status === "APPROVED" || d.status === "PAID").reduce((n, d) => n + dealTotals(d.priceCents).creatorNetCents, 0);
  const held = deals.filter((d) => d.status === "FUNDED" || d.status === "SUBMITTED").reduce((n, d) => n + dealTotals(d.priceCents).creatorNetCents, 0);
  const toDo = deals.filter((d) => d.status === "INVITED" || d.status === "FUNDED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brand deals"
        description="Paid campaigns from prop firms, brokers and tool makers. The company pays in before you start, and the money is yours when they approve the work."
        actions={
          <Link href="/campaigns" className="btn btn-primary">
            <Search /> Find campaigns
          </Link>
        }
      />

      {user.creator.acceptsCampaigns ? null : (
        <Notice
          tone="warn"
          title="Companies can't invite you right now"
          action={
            <Link href="/creator/settings#brand-deals" className="btn btn-secondary btn-sm">
              Turn it on
            </Link>
          }
        >
          You can still apply to open campaigns. Turn on brand deals in settings so companies can find you and invite you.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Earned from brand deals" value={money(earned, { exact: true })} sub="After card processing" />
        <Stat label="Paid in, waiting on your work" value={money(held, { exact: true })} sub="Yours once it's approved" />
        <Stat label="Waiting on you" value={toDo} sub="Invites to answer and work to send" />
      </div>

      <LinkTabs
        active={tab}
        tabs={Object.entries(TABS).map(([k, t]) => ({ key: k, href: k === "active" ? "/creator/campaigns" : `/creator/campaigns?tab=${k}`, label: t.label, count: count(k) }))}
      />

      {shown.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label={TABS[tab].label}>
          {shown.map((d) => {
            const st = DEAL_STATUS[d.status];
            const needsYou = d.status === "INVITED" || d.status === "FUNDED";
            return (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="flex items-start gap-3 px-4 py-4 hover:bg-hover sm:items-center sm:px-5">
                  <Avatar src={d.company.logoUrl} name={d.company.name} size={40} square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.campaign.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {d.company.name} · <span className="num">{money(d.priceCents, { exact: true })}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted">{whereItsAt(d)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    {d.disputedAt && !d.resolvedAt ? (
                      <span className="badge badge-bad">With our team</span>
                    ) : needsYou ? (
                      <span className="badge badge-accent">{d.status === "INVITED" ? "Answer" : "Send work"}</span>
                    ) : (
                      <span className={`badge ${st?.tone ?? "badge-outline"} hidden sm:inline-flex`}>{st?.label}</span>
                    )}
                  </span>
                  <ChevronRight className="mt-2.5 size-4 shrink-0 text-faint sm:mt-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Handshake />}
          title={TABS[tab].emptyTitle}
          description={TABS[tab].empty}
          action={
            <Link href="/campaigns" className="btn btn-secondary">
              Browse open campaigns
            </Link>
          }
        />
      )}
    </div>
  );
}
