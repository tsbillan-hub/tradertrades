import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, PencilLine, Search, Users } from "lucide-react";
import { db } from "@/lib/db";
import { marketLabel, socialLabel } from "@/lib/constants";
import { compact, formatDate, money, plural, timeAgo } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { CAMPAIGN_STATUS, DEAL_STATUS, dealTotals } from "@/server/business";
import { setCampaignStatus } from "@/server/actions/business";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, KeyValue, Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { MessageButton } from "@/components/message-button";
import { ApplicationButtons } from "@/components/business/forms";

export const metadata: Metadata = { title: "Campaign" };

const creatorSelect = { id: true, username: true, displayName: true, avatarUrl: true, creator: { select: { headline: true, audienceSize: true, markets: true } } } as const;

export default async function BusinessCampaignPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { company, staffView } = await requireBusiness(slug);
  const c = await db.campaign.findFirst({
    where: { id, companyId: company.id },
    include: { deals: { orderBy: { updatedAt: "desc" }, include: { creator: { select: creatorSelect } } } },
  });
  if (!c) notFound();
  const base = `/business/${company.slug}`;
  const st = CAMPAIGN_STATUS[c.status];
  const applied = c.deals.filter((d) => d.status === "APPLIED");
  const active = c.deals.filter((d) => ["INVITED", "ACCEPTED", "FUNDED", "SUBMITTED", "APPROVED", "PAID"].includes(d.status));
  const past = c.deals.filter((d) => d.status === "DECLINED" || d.status === "CANCELED");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `${base}/campaigns`, label: "Campaigns" }}
        title={c.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={`badge ${st.tone}`}>{st.label}</span>
            <span>Made {formatDate(c.createdAt)}</span>
          </span>
        }
        actions={
          c.status === "REMOVED" ? null : (
            <>
              <Link href={`${base}/campaigns/${c.id}/edit`} className="btn btn-secondary btn-sm">
                <PencilLine /> Edit
              </Link>
              {c.status === "OPEN" ? (
                <ActionButton action={setCampaignStatus} fields={{ campaignId: c.id, status: "CLOSED" }} confirm="Close it? Nobody new can apply. Deals already agreed carry on.">
                  Close
                </ActionButton>
              ) : c.status === "CLOSED" ? (
                <ActionButton action={setCampaignStatus} fields={{ campaignId: c.id, status: "OPEN" }}>
                  Open again
                </ActionButton>
              ) : null}
              {c.status === "OPEN" ? (
                <Link href={`/campaigns/${c.id}`} className="btn btn-ghost btn-sm">
                  As creators see it <ExternalLink />
                </Link>
              ) : null}
            </>
          )
        }
      />

      {c.status === "REMOVED" ? (
        <Notice tone="bad" title="Our team took this campaign down">
          {c.removedReason ?? "It broke the campaign rules."} Deals already paid into carry on, and nobody new can apply.
        </Notice>
      ) : c.status === "DRAFT" ? (
        <Notice tone="info" title="This is a draft">
          Only your team can see it. Press Edit, then &ldquo;Put it live&rdquo; when it&apos;s ready.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="The brief">
          <p className="text-[15px] whitespace-pre-line text-ink-2">{c.brief}</p>
          <div className="mt-4 text-sm font-semibold">What the creator delivers</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {c.deliverables.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Details">
          <KeyValue
            className="-my-2.5"
            items={[
              { label: "Budget", value: `${money(c.budgetCents)} per creator` },
              { label: "Creators", value: `${active.filter((d) => d.status !== "INVITED").length} of ${c.creatorsWanted}` },
              { label: "Live by", value: c.deadline ? formatDate(c.deadline) : "Any time" },
              { label: "Audience", value: c.minAudience ? `${compact(c.minAudience)}+` : "Any size" },
              { label: "Markets", value: c.markets.length ? c.markets.map(marketLabel).join(", ") : "Any" },
              { label: "Where", value: c.platforms.length ? c.platforms.map(socialLabel).join(", ") : "Any" },
            ]}
          />
        </Panel>
      </div>

      <section aria-labelledby="apps-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="apps-title" className="text-lg">
            Applications {applied.length ? <span className="num text-muted">({applied.length})</span> : null}
          </h2>
          {c.status === "OPEN" ? (
            <Link href={`${base}/creators?campaign=${c.id}`} className="btn btn-secondary btn-sm">
              <Search /> Invite creators
            </Link>
          ) : null}
        </div>
        {applied.length ? (
          <ul className="space-y-3">
            {applied.map((d) => {
              const t = dealTotals(d.priceCents);
              return (
                <li key={d.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link href={`/@${d.creator.username}`} className="flex min-w-0 items-center gap-3">
                      <Avatar src={d.creator.avatarUrl} name={d.creator.displayName} size={40} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{d.creator.displayName}</span>
                        <span className="block truncate text-xs text-muted">
                          {d.creator.creator?.audienceSize ? `${compact(d.creator.creator.audienceSize)} followers · ` : ""}
                          {d.creator.creator?.markets.map(marketLabel).join(", ") || d.creator.creator?.headline}
                        </span>
                      </span>
                    </Link>
                    <div className="text-right">
                      <div className="num text-lg font-semibold">{money(d.priceCents, { exact: true })}</div>
                      <div className="text-xs text-muted">You&apos;d pay {money(t.totalCents, { exact: true })} with our fee</div>
                    </div>
                  </div>
                  {d.pitch ? <p className="mt-3 text-sm whitespace-pre-line text-ink-2">{d.pitch}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {staffView ? null : <ApplicationButtons dealId={d.id} name={d.creator.displayName} />}
                    {staffView ? null : <MessageButton toId={d.creator.id} toName={d.creator.displayName} subject={c.title} variant="ghost" className="btn-sm" />}
                    <span className="text-xs text-muted">Applied {timeAgo(d.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Users />}
            title="No applications waiting"
            description={c.status === "OPEN" ? "Creators who apply show up here. You can also invite creators who fit." : "Open the campaign so creators can apply."}
          />
        )}
      </section>

      {active.length ? (
        <section aria-labelledby="deals-title">
          <h2 id="deals-title" className="mb-3 text-lg">
            Creators on this campaign
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {active.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-hover">
                  <Avatar src={d.creator.avatarUrl} name={d.creator.displayName} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.creator.displayName}</span>
                    <span className="block truncate text-xs text-muted">{money(d.priceCents, { exact: true })}</span>
                  </span>
                  <span className={`badge ${DEAL_STATUS[d.status]?.tone ?? "badge-outline"} hidden sm:inline-flex`}>{DEAL_STATUS[d.status]?.label}</span>
                  {d.disputedAt && !d.resolvedAt ? <span className="badge badge-bad">With our team</span> : null}
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-muted">{plural(past.length, "declined or canceled")}</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {past.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="hover:underline">
                  {d.creator.displayName}
                </Link>{" "}
                · {DEAL_STATUS[d.status]?.label} · {money(d.priceCents)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
