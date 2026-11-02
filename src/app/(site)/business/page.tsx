import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { categoryInfo } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import { companiesFor, requireVerifiedUser } from "@/server/dal";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Business dashboard" };

const ROLE: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Team member" };

export default async function BusinessHome() {
  const user = await requireVerifiedUser();
  const [memberships, pending] = await Promise.all([
    companiesFor(user.id),
    db.companyClaim.findMany({ where: { userId: user.id, status: "PENDING" }, include: { company: { select: { name: true, logoUrl: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  // One company and nothing waiting: go straight to it.
  if (memberships.length === 1 && !pending.length) redirect(`/business/${memberships[0].company.slug}`);

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-12">
      <PageHeader
        kicker="Business"
        title="Your companies"
        description="Run your directory listing, answer reviews, post offers, book Sponsored spots and work with trading creators."
        actions={
          <Link href="/business/claim" className="btn btn-secondary">
            <Building2 /> Claim a listing
          </Link>
        }
      />
      <div className="mt-8 space-y-6">
        {pending.length ? (
          <section aria-labelledby="pending-title">
            <h2 id="pending-title" className="mb-3 text-lg">
              Claims in progress
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
              {pending.map((c) => (
                <li key={c.id}>
                  <Link href={`/business/claim/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-hover">
                    <Avatar src={c.company.logoUrl} name={c.company.name} size={36} square />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.company.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Clock className="size-3.5" />
                        {c.documentIds.length ? `Documents with our team, sent ${timeAgo(c.createdAt)}` : `Waiting for the code sent to ${c.workEmail}`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {memberships.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Your companies">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link href={`/business/${m.company.slug}`} className="flex items-center gap-3 px-5 py-4 hover:bg-hover">
                  <Avatar src={m.company.logoUrl} name={m.company.name} size={44} square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.company.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {categoryInfo(m.company.primaryCategory).label} · {ROLE[m.role]}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : !pending.length ? (
          <EmptyState
            icon={<Building2 />}
            title="You don't run a listing yet"
            description="Every prop firm, broker, platform and tool in the directory can be claimed for free by its own team."
            action={
              <>
                <Link href="/business/claim" className="btn btn-primary">
                  Claim your listing
                </Link>
                <Link href="/for-business" className="btn btn-secondary">
                  What you get
                </Link>
              </>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
