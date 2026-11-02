import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, LogIn } from "lucide-react";
import { db } from "@/lib/db";
import { categoryInfo, marketLabel, socialLabel } from "@/lib/constants";
import { compact, formatDate, money, plural, timeAgo } from "@/lib/utils";
import { getViewer } from "@/server/dal";
import { CAMPAIGN_STATUS, DEAL_STATUS } from "@/server/business";
import { Avatar } from "@/components/ui/avatar";
import { KeyValue, Notice } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { ReportButton } from "@/components/report-button";
import { ApplyForm } from "@/components/business/forms";

const TAKEN = ["ACCEPTED", "FUNDED", "SUBMITTED", "APPROVED", "PAID"] as const;
const PUBLIC = ["OPEN", "CLOSED", "COMPLETED"];

async function load(id: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return db.campaign.findUnique({
    where: { id },
    include: { company: true, _count: { select: { deals: { where: { status: { in: [...TAKEN] } } } } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await load((await params).id);
  if (!c || !PUBLIC.includes(c.status) || c.company.status !== "PUBLISHED") return { title: "Campaign", robots: { index: false } };
  return {
    title: `${c.title} · ${c.company.name}`,
    description: `${c.company.name} is paying trading creators ${money(c.budgetCents)} each. ${c.brief.slice(0, 120)}`,
    robots: c.status === "OPEN" ? undefined : { index: false },
  };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await load(id);
  if (!c) notFound();
  const viewer = await getViewer();
  const [member, myDeal] = viewer
    ? await Promise.all([
        db.businessMember.findUnique({ where: { companyId_userId: { companyId: c.companyId, userId: viewer.id } } }),
        db.deal.findUnique({ where: { campaignId_creatorId: { campaignId: c.id, creatorId: viewer.id } } }),
      ])
    : [null, null];
  const isStaff = Boolean(viewer?.isAdmin);
  const hasDeal = Boolean(myDeal && myDeal.status !== "CANCELED");
  const isPublic = PUBLIC.includes(c.status) && c.company.status === "PUBLISHED";
  // Drafts and taken-down campaigns stay with the company, our staff, and creators already on a deal.
  if (!isPublic && !member && !isStaff && !hasDeal) notFound();

  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const pastDate = Boolean(c.deadline && c.deadline < today);
  const taking = c.status === "OPEN" && c.company.status === "PUBLISHED" && !pastDate;
  const left = Math.max(0, c.creatorsWanted - c._count.deals);
  const st = CAMPAIGN_STATUS[c.status];
  const cat = categoryInfo(c.company.primaryCategory);
  const here = `/campaigns/${c.id}`;

  return (
    <div className="container-tt max-w-5xl py-8 sm:py-10">
      <Link href="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        ← All campaigns
      </Link>
      <Link href={`/directory/c/${c.company.slug}`} className="flex w-fit items-center gap-3">
        <Avatar src={c.company.logoUrl} name={c.company.name} size={44} square />
        <span>
          <span className="block font-semibold">{c.company.name}</span>
          <span className="block text-sm text-muted">{cat.singular}</span>
        </span>
      </Link>
      <h1 className="mt-4 text-[28px] sm:text-[34px]">{c.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        {c.status === "OPEN" ? null : <span className={`badge ${st.tone}`}>{st.label}</span>}
        <span>Posted {timeAgo(c.createdAt)}</span>
        <span aria-hidden>·</span>
        <span className="num">{money(c.budgetCents)} per creator</span>
      </div>

      {c.status === "REMOVED" ? (
        <Notice tone="bad" title="Our team took this campaign down" className="mt-6">
          {c.removedReason ?? "It broke the campaign rules."} Deals that were already paid into carry on.
        </Notice>
      ) : c.status === "DRAFT" ? (
        <Notice tone="info" title="This is a draft" className="mt-6">
          Only the company&apos;s team can see it until they put it live.
        </Notice>
      ) : c.status !== "OPEN" ? (
        <Notice tone="info" title="This campaign isn't taking applications" className="mt-6">
          {c.company.name} closed it. Look at the other open campaigns, or turn on brand deals in your creator settings so companies can invite you.
        </Notice>
      ) : pastDate ? (
        <Notice tone="info" title="The live-by date has passed" className="mt-6">
          This one isn&apos;t taking new applications.
        </Notice>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="The brief">
            <p className="text-[15px] whitespace-pre-line text-ink-2">{c.brief}</p>
            <div className="mt-5 text-sm font-semibold">What you&apos;d deliver</div>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
              {c.deliverables.map((d) => (
                <li key={d} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-up" />
                  {d}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Details">
            <KeyValue
              className="-my-2.5"
              items={[
                { label: "Budget", value: `${money(c.budgetCents)} per creator` },
                { label: "Spots", value: left ? `${left} of ${c.creatorsWanted} left` : `All ${plural(c.creatorsWanted, "spot")} taken` },
                { label: "Live by", value: c.deadline ? formatDate(c.deadline) : "Any time" },
                { label: "Audience", value: c.minAudience ? `${compact(c.minAudience)}+ followers` : "Any size" },
                { label: "Markets", value: c.markets.length ? c.markets.map(marketLabel).join(", ") : "Any" },
                { label: "Where", value: c.platforms.length ? c.platforms.map(socialLabel).join(", ") : "Any platform" },
              ]}
            />
          </Panel>
          <Panel title="How you get paid">
            <ol className="space-y-2.5 text-sm text-ink-2">
              {[
                "Apply with your price. You can ask for more or less than their budget.",
                `If ${c.company.name} says yes, they pay your full price into the deal. You start once it's in.`,
                "Post the work and send the links from the deal page.",
                "The money is yours when they approve it, or 7 days after you send it if they say nothing. Card processing comes off your price; our 10% is paid by the company.",
              ].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-sunk text-xs font-semibold ring-1 ring-line">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">
              Paid posts must say they&apos;re paid.{" "}
              <Link href="/rules#campaigns" className="font-semibold text-ink hover:underline">
                Campaign rules
              </Link>
            </p>
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-5" aria-labelledby="apply-title">
            <h2 id="apply-title" className="text-lg">
              {member ? "Your company's campaign" : hasDeal ? "You're on this one" : "Apply"}
            </h2>
            <div className="mt-3">
              {member ? (
                <>
                  <p className="text-sm text-muted">This is how creators see it. Applications come to your business dashboard.</p>
                  <Link href={`/business/${c.company.slug}/campaigns/${c.id}`} className="btn btn-primary mt-4 w-full">
                    Manage it <ArrowRight />
                  </Link>
                </>
              ) : myDeal && hasDeal ? (
                <>
                  <span className={`badge ${DEAL_STATUS[myDeal.status]?.tone ?? "badge-outline"}`}>{DEAL_STATUS[myDeal.status]?.label}</span>
                  <p className="mt-2 text-sm text-muted">
                    {myDeal.status === "DECLINED"
                      ? `${c.company.name} went with other creators this time.`
                      : myDeal.status === "APPLIED"
                        ? `You asked for ${money(myDeal.priceCents, { exact: true })}. ${c.company.name} answers on the deal page.`
                        : myDeal.status === "INVITED"
                          ? `${c.company.name} invited you at ${money(myDeal.priceCents, { exact: true })}. Answer on the deal page.`
                          : "Everything for this deal happens on the deal page."}
                  </p>
                  <Link href={`/deals/${myDeal.id}`} className="btn btn-primary mt-4 w-full">
                    Open the deal <ArrowRight />
                  </Link>
                </>
              ) : !taking ? (
                <p className="text-sm text-muted">Not taking applications.</p>
              ) : !viewer ? (
                <>
                  <p className="text-sm text-muted">Sign in to apply. Anyone can set up a creator page in a couple of minutes.</p>
                  <div className="mt-4 grid gap-2">
                    <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary w-full">
                      <LogIn /> Sign in to apply
                    </Link>
                    <Link href={`/signup?next=${encodeURIComponent(here)}`} className="btn btn-secondary w-full">
                      Create an account
                    </Link>
                  </div>
                </>
              ) : viewer.creator?.status !== "APPROVED" ? (
                <>
                  <p className="text-sm text-muted">Campaigns are for creators. Set up your creator page first, then come back to apply.</p>
                  <Link href="/creator/start" className="btn btn-primary mt-4 w-full">
                    Set up my creator page
                  </Link>
                </>
              ) : viewer.status !== "ACTIVE" ? (
                <p className="text-sm text-muted">Your account can&apos;t apply to campaigns right now.</p>
              ) : (
                <>
                  {left ? null : <p className="mb-3 text-sm text-muted">Every spot is taken right now. You can still apply in case one opens.</p>}
                  <ApplyForm campaignId={c.id} budget={money(c.budgetCents)} />
                </>
              )}
            </div>
          </section>
          {viewer && !member ? (
            <div className="flex justify-end">
              <ReportButton targetType="CAMPAIGN" targetId={c.id} label="Report this campaign" />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
