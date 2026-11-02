import type { Metadata } from "next";
import {
  BadgeCheck,
  Building2,
  FileCheck2,
  Flag,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/server/dal";
import { adminCounts } from "@/server/queries/admin";
import { SideLink } from "@/components/layout/nav-link";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" }, robots: { index: false, follow: false } };

function Group({ label }: { label: string }) {
  return <div className="mt-4 hidden px-3 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase first:mt-0 lg:block">{label}</div>;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const n = await adminCounts();
  return (
    <div className="container-tt py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="kicker">TraderTrades admin</div>
        <span className="text-xs text-muted">Only staff accounts can see this</span>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:px-0" aria-label="Admin">
          <Group label="To do" />
          <SideLink href="/admin" exact icon={<LayoutDashboard />}>
            Overview
          </SideLink>
          <SideLink href="/admin/reports" icon={<Flag />} count={n.reports}>
            Reports
          </SideLink>
          <SideLink href="/admin/flags" icon={<ShieldAlert />} count={n.flags}>
            Flagged words
          </SideLink>
          <SideLink href="/admin/listings" icon={<Package />} count={n.listings}>
            New listings
          </SideLink>
          <SideLink href="/admin/refunds" icon={<RotateCcw />} count={n.refunds}>
            Refund reviews
          </SideLink>
          <SideLink href="/admin/verification" icon={<BadgeCheck />} count={n.verification}>
            ID and socials
          </SideLink>
          <SideLink href="/admin/suggestions" icon={<Lightbulb />} count={n.suggestions}>
            Suggestions
          </SideLink>
          <SideLink href="/admin/proof" icon={<FileCheck2 />} count={n.proof}>
            Review proof
          </SideLink>
          <Group label="Manage" />
          <SideLink href="/admin/users" icon={<Users />}>
            Accounts
          </SideLink>
          <SideLink href="/admin/orders" icon={<Receipt />}>
            Orders
          </SideLink>
          <SideLink href="/admin/directory" icon={<Building2 />}>
            Directory
          </SideLink>
          <Group label="Records" />
          <SideLink href="/admin/emails" icon={<Mail />}>
            Emails
          </SideLink>
          <SideLink href="/admin/audit" icon={<ScrollText />}>
            Audit log
          </SideLink>
          <SideLink href="/admin/fees" icon={<Percent />}>
            Fees
          </SideLink>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
