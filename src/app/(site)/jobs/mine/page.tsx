import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronRight, Plus, Send } from "lucide-react";
import { db } from "@/lib/db";
import { APPLICATION_STATUS, JOB_STATUS, jobKindLabel, jobRoleLabel } from "@/lib/constants";
import { formatDate, plural, timeAgo } from "@/lib/utils";
import { requireVerifiedUser } from "@/server/dal";
import { jobIsOpen } from "@/server/jobs";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Your jobs", robots: { index: false } };

export default async function MyJobsPage() {
  const user = await requireVerifiedUser();
  const [posts, applications] = await Promise.all([
    db.jobPost.findMany({
      where: { OR: [{ posterId: user.id }, { company: { members: { some: { userId: user.id } } } }] },
      include: {
        company: { select: { name: true, logoUrl: true } },
        _count: { select: { applications: true } },
        applications: { where: { status: "NEW" }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.jobApplication.findMany({
      where: { userId: user.id },
      include: { job: { include: { company: { select: { name: true, logoUrl: true } }, poster: { select: { displayName: true, avatarUrl: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div className="container-tt max-w-4xl py-8 sm:py-10">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Your jobs"
        description="Jobs you've posted, for yourself or your company, and the jobs you've applied to."
        actions={
          <Link href="/jobs/new" className="btn btn-primary">
            <Plus /> Post a job
          </Link>
        }
      />

      <section className="mt-8" aria-labelledby="posts-title">
        <h2 id="posts-title" className="mb-3 text-lg">
          Your job posts
        </h2>
        {posts.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {posts.map((j) => {
              const status = j.status === "OPEN" && !jobIsOpen(j) ? "CLOSED" : j.status;
              return (
                <li key={j.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/jobs/${j.id}`} className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold hover:underline">{j.title}</span>
                      <span className={`badge ${JOB_STATUS[status].tone}`}>{JOB_STATUS[status].label}</span>
                    </span>
                    <span className="block text-sm text-muted">
                      {j.company ? `For ${j.company.name} · ` : ""}
                      {jobRoleLabel(j.role)} · posted {formatDate(j.createdAt)}
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
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Briefcase />} title="You haven't posted a job" description="Posting is free. Hire editors, clippers, moderators and more." />
        )}
      </section>

      <section className="mt-10" aria-labelledby="apps-title">
        <h2 id="apps-title" className="mb-3 text-lg">
          Your applications
        </h2>
        {applications.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {applications.map((a) => {
              const by = a.job.company ?? { name: a.job.poster.displayName, logoUrl: a.job.poster.avatarUrl };
              const st = APPLICATION_STATUS[a.status];
              return (
                <li key={a.id}>
                  <Link href={`/jobs/${a.jobId}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-hover">
                    <Avatar src={by.logoUrl} name={by.name} size={36} square={Boolean(a.job.company)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.job.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {by.name} · {jobKindLabel(a.job.kind)} · applied {timeAgo(a.createdAt)}
                      </span>
                    </span>
                    <span className={`badge ${st.tone}`}>{st.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Send />}
            title="No applications yet"
            description="Jobs you apply to show up here with where they're at."
            action={
              <Link href="/jobs" className="btn btn-secondary">
                Browse jobs
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
