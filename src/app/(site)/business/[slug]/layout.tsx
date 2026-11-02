import Link from "next/link";
import { Briefcase, ExternalLink, Film, Handshake, LayoutDashboard, Megaphone, MessageSquareReply, PencilLine, Search, Ticket, Users } from "lucide-react";
import { db } from "@/lib/db";
import { companiesFor, requireBusiness } from "@/server/dal";
import { SideLink } from "@/components/layout/nav-link";
import { Notice } from "@/components/ui/misc";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, company, staffView } = await requireBusiness(slug);
  const base = `/business/${company.slug}`;
  const [applications, toApprove, unanswered, others] = await Promise.all([
    db.deal.count({ where: { companyId: company.id, status: "APPLIED", campaign: { status: "OPEN" } } }),
    db.deal.count({ where: { companyId: company.id, status: { in: ["SUBMITTED", "ACCEPTED"] } } }),
    db.companyReview.count({ where: { companyId: company.id, status: "PUBLISHED", reply: null, isSample: false } }),
    staffView ? Promise.resolve([]) : companiesFor(user.id).then((all) => all.filter((m) => m.companyId !== company.id)),
  ]);
  return (
    <div className="container-tt py-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="kicker">Business dashboard</div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          {others.length ? (
            <Link href="/business" className="text-ink-2 hover:text-ink">
              Switch company
            </Link>
          ) : null}
          <Link href={`/directory/c/${company.slug}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">
            Your listing <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
      {staffView ? (
        <Notice className="mt-4" tone="warn" title="You're seeing this as staff">
          You aren&apos;t on {company.name}&apos;s team. Anything you change here is done in their name and goes in the audit log.
        </Notice>
      ) : null}
      <div className="mt-4 grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:px-0" aria-label="Business dashboard">
          <SideLink href={base} exact icon={<LayoutDashboard />}>
            Overview
          </SideLink>
          <SideLink href={`${base}/listing`} icon={<PencilLine />}>
            Listing
          </SideLink>
          <SideLink href={`${base}/reviews`} icon={<MessageSquareReply />} count={unanswered}>
            Reviews
          </SideLink>
          <SideLink href={`${base}/offers`} icon={<Ticket />}>
            Offers
          </SideLink>
          <SideLink href={`${base}/videos`} icon={<Film />}>
            Videos
          </SideLink>
          <SideLink href={`${base}/featured`} icon={<Megaphone />}>
            Sponsored spots
          </SideLink>
          <SideLink href={`${base}/campaigns`} icon={<Handshake />} count={applications + toApprove}>
            Campaigns
          </SideLink>
          <SideLink href={`${base}/creators`} icon={<Search />}>
            Find creators
          </SideLink>
          <SideLink href={`${base}/jobs`} icon={<Briefcase />}>
            Jobs
          </SideLink>
          <SideLink href={`${base}/team`} icon={<Users />}>
            Team
          </SideLink>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
