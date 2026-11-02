import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, ChevronRight, Circle, Handshake, Megaphone, MessageSquareReply, MousePointerClick } from "lucide-react";
import { db } from "@/lib/db";
import { categoryInfo } from "@/lib/constants";
import { formatDate, plural } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { featuredPlaceLabel } from "@/server/business";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader, RatingSummary, Stat } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Business dashboard" };

const DAY = 86_400_000;
/** Where a "Visit website" click came from, in words (see the `from` on each /go link). */
const SOURCE: Record<string, string> = {
  company: "Your listing",
  "company-offer": "Offers on your listing",
  "offers-page": "The offers page",
  "directory-search": "Directory search",
  "directory-top": "Directory home",
  category: "Your category's list",
  sponsored: "Sponsored spots",
  similar: "Similar companies",
};

export default async function BusinessOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  const base = `/business/${company.slug}`;
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const [clicks, clicksBefore, bySource, newReviews, unanswered, offers, videos, spots, applications, submitted, accepted] = await Promise.all([
    db.outboundClick.count({ where: { companyId: company.id, createdAt: { gte: since } } }),
    db.outboundClick.count({ where: { companyId: company.id, createdAt: { gte: new Date(since.getTime() - 30 * DAY), lt: since } } }),
    db.outboundClick.groupBy({ by: ["source"], where: { companyId: company.id, createdAt: { gte: since } }, _count: true }),
    db.companyReview.count({ where: { companyId: company.id, status: "PUBLISHED", createdAt: { gte: since } } }),
    db.companyReview.count({ where: { companyId: company.id, status: "PUBLISHED", reply: null, isSample: false } }),
    db.companyOffer.count({ where: { companyId: company.id, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    db.videoPost.count({ where: { companyId: company.id, status: "PUBLISHED" } }),
    db.featuredSlot.findMany({ where: { companyId: company.id, status: { in: ["ACTIVE", "SCHEDULED"] } }, orderBy: { startsAt: "asc" }, take: 3 }),
    db.deal.count({ where: { companyId: company.id, status: "APPLIED", campaign: { status: "OPEN" } } }),
    db.deal.count({ where: { companyId: company.id, status: "SUBMITTED" } }),
    db.deal.count({ where: { companyId: company.id, status: "ACCEPTED" } }),
  ]);

  const setup = [
    { done: Boolean(company.logoUrl), label: "Add your logo", href: `${base}/listing` },
    { done: Boolean(company.tagline && company.description), label: "Write your tagline and description", href: `${base}/listing` },
    { done: offers > 0, label: "Post an offer", href: `${base}/offers` },
    { done: videos > 0, label: "Add a walkthrough video", href: `${base}/videos/new` },
  ];
  const todo = [
    unanswered ? { icon: <MessageSquareReply />, label: `${plural(unanswered, "review")} without a reply`, href: `${base}/reviews` } : null,
    applications ? { icon: <Handshake />, label: `${plural(applications, "creator")} applied to your campaigns`, href: `${base}/campaigns` } : null,
    accepted ? { icon: <Handshake />, label: `${plural(accepted, "deal")} waiting for you to pay in`, href: `${base}/campaigns` } : null,
    submitted ? { icon: <Handshake />, label: `${plural(submitted, "deal")} with work to check`, href: `${base}/campaigns` } : null,
  ].filter((x) => x !== null);
  const change = clicksBefore ? Math.round(((clicks - clicksBefore) / clicksBefore) * 100) : null;
  const sources = bySource
    .map((s) => ({ label: SOURCE[(s.source ?? "").split(":")[0]] ?? "Other pages", n: s._count }))
    .reduce<{ label: string; n: number }[]>((all, s) => {
      const hit = all.find((x) => x.label === s.label);
      if (hit) hit.n += s.n;
      else all.push({ ...s });
      return all;
    }, [])
    .sort((a, b) => b.n - a.n);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar src={company.logoUrl} name={company.name} size={44} square />
            <span className="min-w-0 truncate">{company.name}</span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {categoryInfo(company.primaryCategory).label}
            <span className="badge badge-ok">
              <BadgeCheck /> Claimed {company.claimedAt ? formatDate(company.claimedAt) : ""}
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Visits to your website"
          value={clicks.toLocaleString()}
          sub={change === null ? "Last 30 days" : `Last 30 days · ${change >= 0 ? "+" : ""}${change}% on the 30 before`}
        />
        <Stat label="Rating" value={company.ratingCount ? company.ratingAvg.toFixed(1) : "None yet"} sub={<RatingSummary avg={company.ratingAvg} count={company.ratingCount} />} />
        <Stat label="New reviews" value={newReviews} sub="Last 30 days" />
      </div>

      {todo.length ? (
        <Panel title="Needs you">
          <ul className="-my-2 divide-y divide-line">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 text-sm font-semibold hover:text-ink [&>svg:first-child]:size-4 [&>svg:first-child]:text-accent">
                  {t.icon}
                  <span className="flex-1">{t.label}</span>
                  <ChevronRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Get your listing ready" description={`${setup.filter((s) => s.done).length} of ${setup.length} done`}>
          <ul className="-my-2 divide-y divide-line">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 py-2.5 text-sm">
                  {s.done ? <Check className="size-4 text-up" /> : <Circle className="size-4 text-faint" />}
                  <span className={s.done ? "flex-1 text-muted line-through" : "flex-1 font-semibold"}>{s.label}</span>
                  {!s.done ? <ChevronRight className="size-4 text-faint" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Where your visits come from" description="Last 30 days">
          {sources.length ? (
            <ul className="-my-2 divide-y divide-line text-sm">
              {sources.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <MousePointerClick className="size-4 text-muted" />
                    {s.label}
                  </span>
                  <span className="num font-semibold">{s.n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No visits yet. Traders reach your site from your listing&apos;s &ldquo;Visit website&rdquo; button and from your offers.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Sponsored spots"
        action={
          <Link href={`${base}/featured`} className="btn btn-secondary btn-sm">
            <Megaphone /> Book a week
          </Link>
        }
      >
        {spots.length ? (
          <ul className="-my-2 divide-y divide-line text-sm">
            {spots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-semibold">{featuredPlaceLabel(s.placement, s.category)}</span>
                <span className="text-muted">
                  {s.status === "ACTIVE" ? "Showing now, until " : `From ${formatDate(s.startsAt)} to `}
                  {formatDate(new Date(s.endsAt.getTime() - 1))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing booked. A week at the top of your category or on the home page puts you first in line, clearly labelled Sponsored.</p>
        )}
      </Panel>
    </div>
  );
}
