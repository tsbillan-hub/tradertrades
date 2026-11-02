import Link from "next/link";
import { BadgePercent, Banknote, CalendarDays, ExternalLink, Film, Handshake, LayoutDashboard, Package, Receipt, Settings, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { SideLink } from "@/components/layout/nav-link";

export default async function CreatorDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCreator();
  const now = new Date();
  const [openRefunds, upcomingCalls, dealsToDo] = await Promise.all([
    db.refund.count({ where: { order: { sellerId: user.id }, status: "REQUESTED", escalatedAt: null } }),
    // Calls in the next 7 days, so the creator notices them.
    db.booking.count({ where: { mentorId: user.id, status: "CONFIRMED", startsAt: { gt: now, lt: new Date(now.getTime() + 7 * 86_400_000) } } }),
    // Invites to answer and paid-in work to send.
    db.deal.count({ where: { creatorId: user.id, status: { in: ["INVITED", "FUNDED"] } } }),
  ]);
  return (
    <div className="container-tt py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="kicker">Creator dashboard</div>
        <Link href={`/@${user.username}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
          Your page <ExternalLink className="size-3.5" />
        </Link>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:px-0" aria-label="Creator dashboard">
          <SideLink href="/creator" exact icon={<LayoutDashboard />}>Overview</SideLink>
          <SideLink href="/creator/products" icon={<Package />}>Products</SideLink>
          <SideLink href="/creator/videos" icon={<Film />}>Videos</SideLink>
          <SideLink href="/creator/calendar" icon={<CalendarDays />} count={upcomingCalls}>Calendar</SideLink>
          <SideLink href="/creator/sales" icon={<Receipt />} count={openRefunds}>Sales</SideLink>
          <SideLink href="/creator/customers" icon={<Users />}>Customers</SideLink>
          <SideLink href="/creator/campaigns" icon={<Handshake />} count={dealsToDo}>Brand deals</SideLink>
          <SideLink href="/creator/coupons" icon={<BadgePercent />}>Discount codes</SideLink>
          <SideLink href="/creator/payouts" icon={<Banknote />}>Payouts</SideLink>
          <SideLink href="/creator/settings" icon={<Settings />}>Settings</SideLink>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
