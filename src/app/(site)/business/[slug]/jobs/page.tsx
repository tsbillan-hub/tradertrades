import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { JOB_STATUS as STATUS, jobKindLabel, jobRoleLabel } from "@/lib/constants";
import { formatDate, plural } from "@/lib/utils";
import { requireBusiness } from "@/server/dal";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Jobs" };

export default async function BusinessJobsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireBusiness(slug);
  const jobs = await db.jobPost.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applications: true } }, applications: { where: { status: "NEW" }, select: { id: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Hire editors, clippers, moderators, closers and developers from the trading world. Posting is free, and posts close on their own after 60 days."
        actions={
          <Link href={`/jobs/new?as=${company.id}`} className="btn btn-primary">
            <Plus /> Post a job
          </Link>
        }
      />
      {jobs.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Your job posts">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/jobs/${j.id}`} className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold hover:underline">{j.title}</span>
                  <span className={`badge ${STATUS[j.status].tone}`}>{STATUS[j.status].label}</span>
                </span>
                <span className="block text-sm text-muted">
                  {jobRoleLabel(j.role)} · {jobKindLabel(j.kind)} · posted {formatDate(j.createdAt)}
                </span>
              </Link>
              {j.applyUrl ? (
                <span className="text-sm text-muted">Applications on your site</span>
              ) : (
                <Link href={`/jobs/${j.id}/applicants`} className="btn btn-secondary btn-sm shrink-0">
                  {plural(j._count.applications, "applicant")}
                  {j.applications.length ? <span className="num rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{j.applications.length} new</span> : null}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Briefcase />}
          title="No job posts yet"
          description="Post a role as your company and applications come to you here."
          action={
            <Link href={`/jobs/new?as=${company.id}`} className="btn btn-primary">
              <Plus /> Post a job
            </Link>
          }
        />
      )}
    </div>
  );
}
