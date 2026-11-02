import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { FeaturedStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { FEATURED_LIMITS } from "@/lib/fees";
import { formatDate, money } from "@/lib/utils";
import { featuredPlaceLabel, weekStart } from "@/server/business";
import { EmptyState, LinkTabs, PageHeader, Stat } from "@/components/ui/misc";
import { CancelFeaturedButton } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Sponsored spots" };

const STATUS: Record<FeaturedStatus, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Not paid", tone: "badge-outline" },
  SCHEDULED: { label: "Booked", tone: "badge-info" },
  ACTIVE: { label: "Showing now", tone: "badge-ok" },
  ENDED: { label: "Ended", tone: "badge-outline" },
  CANCELED: { label: "Canceled", tone: "badge-outline" },
};

export default async function FeaturedAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "past" ? "past" : "live";
  const now = new Date();
  const thisWeek = weekStart(now);
  const nextWeek = new Date(thisWeek.getTime() + 7 * 86_400_000);
  const [rows, homeNow, monthIncome] = await Promise.all([
    db.featuredSlot.findMany({
      where: tab === "live" ? { status: { in: ["ACTIVE", "SCHEDULED"] } } : { status: { in: ["ENDED", "CANCELED"] } },
      orderBy: tab === "live" ? { startsAt: "asc" } : { endsAt: "desc" },
      take: 100,
      include: { company: { select: { id: true, name: true, slug: true } }, orders: { where: { status: { not: "PENDING" } }, select: { amountCents: true, refundedCents: true, provider: true } } },
    }),
    db.featuredSlot.count({ where: { placement: "HOME", status: { in: ["ACTIVE", "SCHEDULED"] }, startsAt: { lt: nextWeek }, endsAt: { gt: now } } }),
    db.order.aggregate({ where: { kind: "FEATURED", status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] }, paidAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, _sum: { amountCents: true, refundedCents: true } }),
  ]);
  const live = rows.filter((r) => r.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <PageHeader title="Sponsored spots" description="Weeks companies booked at the top of a directory category or on the home page. Every one is labelled Sponsored." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Showing now" value={tab === "live" ? live.length : "·"} sub={tab === "live" ? "across all places" : "see the live tab"} />
        <Stat label="Home page this week" value={`${homeNow} of ${FEATURED_LIMITS.HOME}`} />
        <Stat label="Last 30 days" value={money((monthIncome._sum.amountCents ?? 0) - (monthIncome._sum.refundedCents ?? 0))} sub="after refunds" />
      </div>
      <LinkTabs
        active={tab}
        tabs={[
          { key: "live", href: "/admin/featured", label: "Now and booked" },
          { key: "past", href: "/admin/featured?tab=past", label: "Past" },
        ]}
      />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Where</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => {
                const paid = s.orders.reduce((n, o) => n + o.amountCents - o.refundedCents, 0);
                const test = s.orders.some((o) => o.provider === "TEST");
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/directory/c/${s.company.slug}`} className="font-semibold hover:underline">
                        {s.company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{featuredPlaceLabel(s.placement, s.category)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {formatDate(s.startsAt)} to {formatDate(new Date(s.endsAt.getTime() - 1))}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {money(paid, { exact: true })}
                      {test ? <div className="text-xs text-warn">Test payment</div> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">{s.status === "ACTIVE" || s.status === "SCHEDULED" ? <CancelFeaturedButton slotId={s.id} company={s.company.name} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Megaphone />} title={tab === "live" ? "No spots booked" : "Nothing here yet"} description="Companies book Sponsored spots from their business dashboard." />
      )}
    </div>
  );
}
