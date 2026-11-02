import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import type { Market, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MARKETS, marketLabel } from "@/lib/constants";
import { compact, money, plural } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { DEAL_STATUS } from "@/server/business";
import { pageParam } from "@/server/queries/admin";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Notice, PageHeader, Pagination } from "@/components/ui/misc";
import { VerifiedTick } from "@/components/market/badges";
import { InviteButton } from "@/components/business/forms";

export const metadata: Metadata = { title: "Find creators" };

const PER_PAGE = 20;
const AUDIENCE = [
  { value: "", label: "Any audience" },
  { value: "1000", label: "1K+" },
  { value: "10000", label: "10K+" },
  { value: "50000", label: "50K+" },
  { value: "100000", label: "100K+" },
  { value: "500000", label: "500K+" },
];

export default async function FindCreatorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; market?: string; min?: string; campaign?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company, staffView } = await requireBusiness(slug);
  const q = (sp.q ?? "").trim().slice(0, 60);
  const market = MARKETS.find((m) => m.value === sp.market)?.value;
  const min = Number(sp.min) > 0 ? Math.min(Number(sp.min), 1_000_000_000) : 0;
  const page = pageParam(sp.page);

  const campaigns = await db.campaign.findMany({ where: { companyId: company.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, budgetCents: true } });
  const campaign = campaigns.find((c) => c.id === sp.campaign) ?? null;

  const where: Prisma.UserWhereInput = {
    status: "ACTIVE",
    isSample: false,
    creator: {
      status: "APPROVED",
      acceptsCampaigns: true,
      ...(market ? { markets: { has: market as Market } } : {}),
      ...(min ? { audienceSize: { gte: min } } : {}),
    },
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } },
            { creator: { headline: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, creators] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ creator: { audienceSize: { sort: "desc", nulls: "last" } } }, { createdAt: "asc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        idVerifiedAt: true,
        status: true,
        creator: { select: { headline: true, markets: true, audienceSize: true, status: true, resultsCheckedAt: true } },
        socialLinks: { select: { platform: true } },
        _count: { select: { products: { where: { status: "PUBLISHED" } } } },
      },
    }),
  ]);
  const deals = campaign ? await db.deal.findMany({ where: { campaignId: campaign.id, creatorId: { in: creators.map((c) => c.id) } }, select: { creatorId: true, status: true } }) : [];
  const keep = (extra: Record<string, string>) => {
    const all: Record<string, string> = { q, market: market ?? "", min: min ? String(min) : "", campaign: campaign?.id ?? "", ...extra };
    return `/business/${company.slug}/creators?${new URLSearchParams(Object.entries(all).filter(([, v]) => v))}`;
  };
  const options = campaigns.map((c) => ({ id: c.id, title: c.title, budget: money(c.budgetCents) }));

  return (
    <div className="space-y-6">
      <PageHeader title="Find creators" description="Trading creators who are open to brand deals. Invite one to a campaign with your offer; they choose whether to take it." />
      {!campaigns.length ? (
        <Notice
          tone="info"
          title="Make a campaign first"
          action={
            <Link href={`/business/${company.slug}/campaigns/new`} className="btn btn-primary btn-sm">
              New campaign
            </Link>
          }
        >
          Invites are for a campaign, so creators can see the brief before they say yes.
        </Notice>
      ) : null}
      <form className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_150px_auto]" role="search">
        {campaign ? <input type="hidden" name="campaign" value={campaign.id} /> : null}
        <label className="sr-only" htmlFor="cr-q">
          Name or topic
        </label>
        <input id="cr-q" name="q" defaultValue={q} className="input" placeholder="Name or topic" />
        <label className="sr-only" htmlFor="cr-market">
          Market
        </label>
        <select id="cr-market" name="market" defaultValue={market ?? ""} className="input">
          <option value="">Any market</option>
          {MARKETS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="cr-min">
          Audience
        </label>
        <select id="cr-min" name="min" defaultValue={min ? String(min) : ""} className="input">
          {AUDIENCE.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary">
          <Search /> Search
        </button>
      </form>
      {campaign ? (
        <p className="text-sm text-muted">
          Inviting to <span className="font-semibold text-ink">{campaign.title}</span>.{" "}
          <Link href={keep({ campaign: "" })} className="link">
            Any campaign
          </Link>
        </p>
      ) : null}
      <p className="text-sm text-muted">{plural(total, "creator")}</p>
      {creators.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Creators">
          {creators.map((u) => {
            const deal = deals.find((d) => d.creatorId === u.id && d.status !== "DECLINED" && d.status !== "CANCELED");
            return (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <Link href={`/@${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={u.avatarUrl} name={u.displayName} size={44} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="truncate">{u.displayName}</span>
                      <VerifiedTick who={u} />
                    </span>
                    <span className="block truncate text-sm text-muted">{u.creator?.headline ?? `@${u.username}`}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                      <span className="font-semibold text-ink-2">{u.creator?.audienceSize ? `${compact(u.creator.audienceSize)} followers` : "Audience not given"}</span>
                      {u.creator?.markets.length ? <span>· {u.creator.markets.map(marketLabel).join(", ")}</span> : null}
                      {u._count.products ? <span>· {plural(u._count.products, "product")}</span> : null}
                    </span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {deal ? (
                    <span className={`badge ${DEAL_STATUS[deal.status]?.tone}`}>{DEAL_STATUS[deal.status]?.label}</span>
                  ) : campaigns.length && !staffView ? (
                    <InviteButton creator={{ id: u.id, name: u.displayName }} campaigns={options} defaultCampaignId={campaign?.id} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Users />} title="No creators match" description="Try a different market or a smaller audience." />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={(p) => keep(p > 1 ? { page: String(p) } : {})} />
    </div>
  );
}
