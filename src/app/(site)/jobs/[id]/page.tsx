import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Banknote, Briefcase, Clock, ExternalLink, LogIn, MapPin, PencilLine, Users } from "lucide-react";
import { db } from "@/lib/db";
import { APPLICATION_STATUS, JOB_STATUS, jobKindLabel, jobRoleLabel } from "@/lib/constants";
import { formatDate, hostname, plural, timeAgo } from "@/lib/utils";
import { getViewer } from "@/server/dal";
import { jobIsOpen, managesJob } from "@/server/jobs";
import { setJobStatus, withdrawJobApplication } from "@/server/actions/jobs";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { ReportButton } from "@/components/report-button";
import { MessageButton } from "@/components/message-button";
import { JobApplyForm } from "@/components/jobs/forms";

async function load(id: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return db.jobPost.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, slug: true, logoUrl: true, status: true } },
      poster: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
      _count: { select: { applications: true } },
    },
  });
}

/** Anyone can see open and closed posts. Taken-down posts, hidden companies and banned posters only show to the people who run the post. */
function isPublic(job: NonNullable<Awaited<ReturnType<typeof load>>>) {
  return job.status !== "REMOVED" && job.poster.status === "ACTIVE" && (!job.company || job.company.status === "PUBLISHED");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const job = await load((await params).id);
  if (!job || !isPublic(job)) return { title: "Job", robots: { index: false } };
  const by = job.company?.name ?? job.poster.displayName;
  return {
    title: `${job.title} · ${by}`,
    description: `${jobRoleLabel(job.role)}, ${jobKindLabel(job.kind).toLowerCase()}${job.remote ? ", remote" : ""}. ${job.description.slice(0, 120)}`,
    robots: jobIsOpen(job) ? undefined : { index: false },
  };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await load(id);
  if (!job) notFound();
  const viewer = await getViewer();
  const manager = await managesJob(job, viewer?.id);
  const staff = Boolean(viewer?.isAdmin) && !manager;
  if (!isPublic(job) && !manager && !staff) notFound();

  const mine = viewer && !manager ? await db.jobApplication.findUnique({ where: { jobId_userId: { jobId: job.id, userId: viewer.id } } }) : null;
  const newApps = manager ? await db.jobApplication.count({ where: { jobId: job.id, status: "NEW" } }) : 0;
  const open = jobIsOpen(job);
  const by = job.company
    ? { name: job.company.name, image: job.company.logoUrl, href: `/directory/c/${job.company.slug}`, square: true, sub: "Company" }
    : { name: job.poster.displayName, image: job.poster.avatarUrl, href: `/@${job.poster.username}`, square: false, sub: `@${job.poster.username}` };
  const where = job.remote ? (job.location ? `Remote, ${job.location}` : "Remote") : (job.location ?? "In person");
  const here = `/jobs/${job.id}`;

  return (
    <div className="container-tt max-w-5xl py-8 sm:py-10">
      <Link href={manager ? "/jobs/mine" : "/jobs"} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        ← {manager ? "Your jobs" : "All jobs"}
      </Link>
      <Link href={by.href} className="flex w-fit items-center gap-3">
        <Avatar src={by.image} name={by.name} size={44} square={by.square} />
        <span>
          <span className="block font-semibold">{by.name}</span>
          <span className="block text-sm text-muted">{by.sub}</span>
        </span>
      </Link>
      <h1 className="mt-4 text-[28px] sm:text-[34px]">{job.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        {job.status === "OPEN" && open ? null : <span className={`badge ${JOB_STATUS[job.status === "OPEN" ? "CLOSED" : job.status].tone}`}>{JOB_STATUS[job.status === "OPEN" ? "CLOSED" : job.status].label}</span>}
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="size-4" /> {jobRoleLabel(job.role)}, {jobKindLabel(job.kind).toLowerCase()}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4" /> {where}
        </span>
        {job.pay ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <Banknote className="size-4" /> {job.pay}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" /> Posted {timeAgo(job.createdAt)}
        </span>
      </div>

      {job.status === "REMOVED" ? (
        <Notice tone="bad" title="Our team took this job post down" className="mt-6">
          {job.removedReason ?? "It broke the jobs board rules."} Only you can see it now.
        </Notice>
      ) : !open ? (
        <Notice tone="info" title="This job is closed" className="mt-6">
          It isn&apos;t taking applications any more.
        </Notice>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card min-w-0 p-5 sm:p-6" aria-label="About the job">
          <h2 className="text-lg">About the job</h2>
          <p className="mt-3 text-[15px] whitespace-pre-line text-ink-2">{job.description}</p>
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            No job here can ask you to pay anything to apply or start. If one does, report it and don&apos;t send money.
          </p>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-5" aria-labelledby="apply-title">
            <h2 id="apply-title" className="text-lg">
              {manager ? "Your job post" : mine ? "You applied" : "Apply"}
            </h2>
            <div className="mt-3">
              {manager ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    {job.status === "REMOVED"
                      ? "Taken down posts can't be changed or reopened."
                      : open && job.expiresAt
                        ? `Open until ${formatDate(job.expiresAt)}.`
                        : "Closed. Reopen it to take applications for another 60 days."}
                  </p>
                  {job.applyUrl ? (
                    <p className="text-sm text-muted">Applications go to {hostname(job.applyUrl)}.</p>
                  ) : (
                    <Link href={`/jobs/${job.id}/applicants`} className="btn btn-primary w-full">
                      <Users /> {plural(job._count.applications, "applicant")}
                      {newApps ? <span className="num rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{newApps} new</span> : null}
                    </Link>
                  )}
                  {job.status === "REMOVED" ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/jobs/${job.id}/edit`} className="btn btn-secondary btn-sm">
                        <PencilLine /> Edit
                      </Link>
                      {open ? (
                        <ActionButton action={setJobStatus} fields={{ jobId: job.id, status: "CLOSED" }} confirm="Close this job? Nobody new can apply.">
                          Close it
                        </ActionButton>
                      ) : (
                        <ActionButton action={setJobStatus} fields={{ jobId: job.id, status: "OPEN" }}>
                          Reopen
                        </ActionButton>
                      )}
                    </div>
                  )}
                </div>
              ) : mine ? (
                <div className="space-y-3">
                  <span className={`badge ${APPLICATION_STATUS[mine.status].tone}`}>{APPLICATION_STATUS[mine.status].label}</span>
                  <p className="text-sm text-muted">
                    {mine.status === "HIRED"
                      ? "You got it. The poster will be in touch."
                      : mine.status === "REJECTED"
                        ? "They went with someone else this time."
                        : `Sent ${timeAgo(mine.createdAt)}. You'll get a notification when they answer.`}
                  </p>
                  <p className="line-clamp-4 rounded-lg bg-sunk p-3 text-sm whitespace-pre-line text-ink-2">{mine.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <MessageButton toId={job.poster.id} toName={by.name} subject={job.title} className="btn-sm" />
                    {mine.status === "HIRED" ? null : (
                      <ActionButton action={withdrawJobApplication} fields={{ applicationId: mine.id }} variant="ghost" confirm="Withdraw your application?">
                        Withdraw
                      </ActionButton>
                    )}
                  </div>
                </div>
              ) : !open ? (
                <p className="text-sm text-muted">Not taking applications.</p>
              ) : job.applyUrl ? (
                <>
                  <p className="text-sm text-muted">{by.name} takes applications on their own site.</p>
                  <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn btn-primary mt-4 w-full">
                    Apply on {hostname(job.applyUrl)} <ExternalLink />
                  </a>
                </>
              ) : !viewer ? (
                <>
                  <p className="text-sm text-muted">Sign in to send your application. It takes a minute.</p>
                  <div className="mt-4 grid gap-2">
                    <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary w-full">
                      <LogIn /> Sign in to apply
                    </Link>
                    <Link href={`/signup?next=${encodeURIComponent(here)}`} className="btn btn-secondary w-full">
                      Create an account
                    </Link>
                  </div>
                </>
              ) : !viewer.emailVerifiedAt ? (
                <>
                  <p className="text-sm text-muted">Confirm your email first, then you can apply.</p>
                  <Link href={`/verify-email?next=${encodeURIComponent(here)}`} className="btn btn-primary mt-4 w-full">
                    Confirm my email <ArrowRight />
                  </Link>
                </>
              ) : viewer.status !== "ACTIVE" ? (
                <p className="text-sm text-muted">Your account can&apos;t apply to jobs right now.</p>
              ) : (
                <JobApplyForm jobId={job.id} />
              )}
            </div>
          </section>
          {viewer && !manager ? (
            <div className="flex justify-end">
              <ReportButton targetType="JOB" targetId={job.id} label="Report this job" />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
