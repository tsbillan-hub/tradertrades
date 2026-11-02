import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { CompanyCategory, FeaturedStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { categoryInfo } from "@/lib/constants";
import { FEATURED_LIMITS, FEATURED_PRICES } from "@/lib/fees";
import { formatDate, money, plural } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { businessPaymentPath, featuredPlaceLabel, featuredWeeks, type FeaturedWeek } from "@/server/business";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { FeaturedPicker, type WeekOption } from "@/components/business/forms";

export const metadata: Metadata = { title: "Sponsored spots" };

const STATUS: Record<FeaturedStatus, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Not paid", tone: "badge-outline" },
  SCHEDULED: { label: "Booked", tone: "badge-info" },
  ACTIVE: { label: "Showing now", tone: "badge-ok" },
  ENDED: { label: "Ended", tone: "badge-outline" },
  CANCELED: { label: "Canceled", tone: "badge-outline" },
};

const short = (d: Date) => formatDate(d, { month: "short", day: "numeric" });

function options(weeks: FeaturedWeek[]): WeekOption[] {
  return weeks.map((w, i) => ({
    index: i,
    label: w.partial ? `This week, to ${short(new Date(w.end.getTime() - 1))}` : `${short(w.start)} to ${short(new Date(w.end.getTime() - 1))}`,
    price: money(w.priceCents, { exact: w.partial }),
    left: Math.max(0, w.limit - w.taken),
    mine: w.mine,
    partial: w.partial,
  }));
}

export default async function BusinessFeaturedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cat?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company } = await requireBusiness(slug);
  const base = `/business/${company.slug}/featured`;
  const cats = [...new Set<CompanyCategory>([company.primaryCategory, ...company.categories])];
  const cat = cats.find((c) => categoryInfo(c).slug === sp.cat) ?? company.primaryCategory;
  const path = businessPaymentPath();
  const [home, category, mine] = await Promise.all([
    featuredWeeks("HOME", null, company.id),
    featuredWeeks("CATEGORY", cat, company.id),
    db.featuredSlot.findMany({
      where: { companyId: company.id, status: { not: "PENDING_PAYMENT" } },
      orderBy: { startsAt: "desc" },
      take: 30,
      include: { orders: { where: { status: { not: "PENDING" } }, select: { amountCents: true, refundedCents: true } } },
    }),
  ]);
  // Clicks through to your site from each spot while it ran (the /go link says where a click came from).
  const now = new Date();
  const clicks = await Promise.all(
    mine.map((s) =>
      s.startsAt > now || (s.status !== "ACTIVE" && s.status !== "ENDED")
        ? null
        : db.outboundClick.count({
            where: {
              companyId: company.id,
              source: s.placement === "HOME" ? "sponsored:home" : `sponsored:${s.category ? categoryInfo(s.category).slug : ""}`,
              createdAt: { gte: s.startsAt, lt: s.endsAt },
            },
          }),
    ),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sponsored spots"
        description="Be first in line for a week, at the top of your category or on the home page. Every spot is labelled Sponsored, and paying never changes your rating or where you rank in normal results."
      />
      {path === "off" ? (
        <Notice tone="warn" title="Card payments aren't switched on yet">
          You can see what&apos;s free, but booking opens once payments are live.
        </Notice>
      ) : path === "test" ? (
        <Notice tone="plain" title="Test mode">
          Payments here use a test card and no real money moves.
        </Notice>
      ) : null}

      <Panel
        title={`Top of ${categoryInfo(cat).label}`}
        description={`${money(FEATURED_PRICES.CATEGORY)} a week, ${FEATURED_LIMITS.CATEGORY} spots per category. Shown above the list on the ${categoryInfo(cat).label.toLowerCase()} page.`}
      >
        {cats.length > 1 ? (
          <LinkTabs
            className="-mt-1 mb-4"
            active={categoryInfo(cat).slug}
            tabs={cats.map((c) => ({ key: categoryInfo(c).slug, href: `${base}?cat=${categoryInfo(c).slug}`, label: categoryInfo(c).label }))}
          />
        ) : null}
        <FeaturedPicker companyId={company.id} placement="CATEGORY" category={cat} weeks={options(category)} />
      </Panel>

      <Panel title="Home page" description={`${money(FEATURED_PRICES.HOME)} a week, ${FEATURED_LIMITS.HOME} spots at a time. Shown in the Sponsored row on the home page.`}>
        <FeaturedPicker companyId={company.id} placement="HOME" weeks={options(home)} />
      </Panel>

      <section aria-labelledby="mine-title">
        <h2 id="mine-title" className="mb-3 text-lg">
          Your spots
        </h2>
        {mine.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {mine.map((s, i) => {
              const paid = s.orders.reduce((n, o) => n + o.amountCents - o.refundedCents, 0);
              const n = clicks[i];
              return (
                <li key={s.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold">{featuredPlaceLabel(s.placement, s.category)}</div>
                    <div className="text-sm text-muted">
                      {formatDate(s.startsAt)} to {formatDate(new Date(s.endsAt.getTime() - 1))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {n === null ? null : <span className="num text-muted">{plural(n, "click")}</span>}
                    <span className="num">{money(paid, { exact: true })}</span>
                    <span className={`badge ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Megaphone />} title="No spots yet" description="Pick a week above. You pay when you book, and it starts on its own." />
        )}
        <p className="mt-3 text-sm text-muted">
          Need to change or cancel a booking?{" "}
          <Link href="/help#contact" className="link">
            Ask us
          </Link>
          . Weeks that haven&apos;t started yet can be refunded.
        </p>
      </section>
    </div>
  );
}
