import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, ShieldCheck } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { Market, SocialPlatform } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { MARKETS, SOCIALS, categoryInfo, marketLabel, socialLabel } from "@/lib/constants";
import { compact, formatDate, money, plural } from "@/lib/utils";
import { getViewer } from "@/server/dal";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { FilterBar } from "@/components/market/filter-bar";

export const metadata: Metadata = {
  title: "Paid brand campaigns for trading creators",
  description: "Prop firms, brokers and trading tools paying creators for videos, posts and streams. Apply with your price. The money is paid in before you start.",
};

const PER_PAGE = 24;
const TAKEN = ["ACCEPTED", "FUNDED", "SUBMITTED", "APPROVED", "PAID"] as const;
const SOCIAL_FILTERS = SOCIALS.filter((s) => s.value !== "WEBSITE" && s.value !== "TELEGRAM");
type SP = { market?: string; platform?: string; sort?: string; page?: string };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const market = MARKETS.find((m) => m.value.toLowerCase() === sp.market?.toLowerCase())?.value as Market | undefined;
  const platform = SOCIAL_FILTERS.find((s) => s.value.toLowerCase() === sp.platform?.toLowerCase())?.value as SocialPlatform | undefined;
  const sort = sp.sort === "budget" ? "budget" : "new";
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));
  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const where: Prisma.CampaignWhereInput = {
    status: "OPEN",
    company: { status: "PUBLISHED" },
    AND: [
      // A campaign with no date, or one that hasn't passed yet.
      { OR: [{ deadline: null }, { deadline: { gte: today } }] },
      // An empty list means "any", so those show under every filter.
      ...(market ? [{ OR: [{ markets: { has: market } }, { markets: { isEmpty: true } }] }] : []),
      ...(platform ? [{ OR: [{ platforms: { has: platform } }, { platforms: { isEmpty: true } }] }] : []),
    ],
  };

  const viewer = await getViewer();
  const [total, campaigns, myCompanies] = await Promise.all([
    db.campaign.count({ where }),
    db.campaign.findMany({
      where,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true, primaryCategory: true } },
        _count: { select: { deals: { where: { status: { in: [...TAKEN] } } } } },
        deals: viewer ? { where: { creatorId: viewer.id }, select: { status: true } } : false,
      },
      orderBy: sort === "budget" ? [{ budgetCents: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    viewer ? db.businessMember.count({ where: { userId: viewer.id } }) : 0,
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const params: Record<string, string> = {
    ...(market ? { market: market.toLowerCase() } : {}),
    ...(platform ? { platform: platform.toLowerCase() } : {}),
    ...(sort !== "new" ? { sort } : {}),
  };
  const href = (n: number) => {
    const qs = new URLSearchParams(params);
    if (n > 1) qs.set("page", String(n));
    const s = qs.toString();
    return s ? `/campaigns?${s}` : "/campaigns";
  };
  const isCreator = viewer?.creator?.status === "APPROVED";

  return (
    <div className="container-tt py-8 sm:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="kicker">For creators</div>
          <h1 className="mt-2 text-[30px] sm:text-[36px]">Paid brand campaigns</h1>
          <p className="mt-2 text-[15px] text-muted">
            Prop firms, brokers and trading tools pay creators for videos, posts and streams. Apply with your price. The company pays the full amount in before you
            start, and it&apos;s yours when they approve the work, or 7 days after you send it if they say nothing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isCreator ? (
            <Link href="/creator/campaigns" className="btn btn-secondary">
              Your brand deals
            </Link>
          ) : null}
          {myCompanies ? (
            <Link href="/business" className="btn btn-secondary">
              Post a campaign
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <FilterBar
          path="/campaigns"
          params={params}
          filters={[
            { name: "market", label: "Market", value: market?.toLowerCase() ?? "", options: [{ value: "", label: "All markets" }, ...MARKETS.map((m) => ({ value: m.value.toLowerCase(), label: m.label }))] },
            {
              name: "platform",
              label: "Where it's posted",
              value: platform?.toLowerCase() ?? "",
              options: [{ value: "", label: "Anywhere" }, ...SOCIAL_FILTERS.map((s) => ({ value: s.value.toLowerCase(), label: s.label }))],
            },
            { name: "sort", label: "Sort", value: sort === "new" ? "" : sort, options: [{ value: "", label: "Newest" }, { value: "budget", label: "Biggest budget" }] },
          ]}
        />
        <span className="num text-sm text-muted">{plural(total, "open campaign")}</span>
      </div>

      {campaigns.length ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => {
              const left = Math.max(0, c.creatorsWanted - c._count.deals);
              const mine = c.deals?.[0]?.status;
              return (
                <Link key={c.id} href={`/campaigns/${c.id}`} className="card card-hover flex flex-col p-5">
                  <div className="flex items-center gap-3">
                    <Avatar src={c.company.logoUrl} name={c.company.name} size={40} square />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.company.name}</div>
                      <div className="truncate text-xs text-muted">{categoryInfo(c.company.primaryCategory).singular}</div>
                    </div>
                    {mine && mine !== "CANCELED" ? <span className="badge badge-info ml-auto">{mine === "INVITED" ? "Invited" : "Applied"}</span> : null}
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-[17px] leading-snug">{c.title}</h2>
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted">{c.brief}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(c.platforms.length ? c.platforms.map(socialLabel) : ["Any platform"]).map((p) => (
                      <span key={p} className="badge badge-outline">
                        {p}
                      </span>
                    ))}
                    {c.markets.slice(0, 2).map((m) => (
                      <span key={m} className="badge badge-outline">
                        {marketLabel(m)}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div>
                      <div className="num text-lg leading-tight font-semibold">{money(c.budgetCents)}</div>
                      <div className="text-xs text-muted">per creator</div>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <div>{left ? `${plural(left, "spot")} left` : "All spots taken"}</div>
                      <div>{c.minAudience ? `${compact(c.minAudience)}+ audience` : c.deadline ? `Live by ${formatDate(c.deadline)}` : "Any audience size"}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <Pagination page={page} pages={pages} hrefFor={href} />
        </>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<Megaphone />}
          title={market || platform ? "No open campaigns match" : "No open campaigns right now"}
          description={
            market || platform
              ? "Try another market or platform."
              : "Companies post new ones often. Turn on brand deals in your creator settings so companies can invite you directly."
          }
          action={
            isCreator ? (
              <Link href="/creator/settings" className="btn btn-secondary">
                Creator settings
              </Link>
            ) : (
              <Link href="/sell" className="btn btn-primary">
                Start as a creator
              </Link>
            )
          }
        />
      )}

      <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="How campaigns work">
        {[
          { t: "Apply with your price", d: "Say what you'd make and what it costs. Companies can also invite you, if you've turned on brand deals." },
          { t: "They pay in first", d: "Once you agree, the company pays the full amount to us. You only start when the money is in." },
          { t: "Send the work, get paid", d: "Post it, send the links. It's yours when they approve, or automatically 7 days later. Our 10% is paid by the company, not you." },
        ].map((s, i) => (
          <div key={s.t} className="card p-5">
            <div className="num grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-ink">{i + 1}</div>
            <div className="mt-3 font-semibold">{s.t}</div>
            <p className="mt-1 text-sm text-muted">{s.d}</p>
          </div>
        ))}
      </section>
      <p className="mt-4 flex items-start gap-2 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Campaigns follow the same rules as everything else here: no profit promises, no fake results, and paid posts must say they&apos;re paid.{" "}
          <Link href="/rules#campaigns" className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">
            Campaign rules <ArrowRight className="size-3.5" />
          </Link>
        </span>
      </p>
    </div>
  );
}
