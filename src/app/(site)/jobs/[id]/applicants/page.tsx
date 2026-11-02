import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ExternalLink, Star, Undo2, Users, X } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { APPLICATION_STATUS } from "@/lib/constants";
import { hostname, timeAgo } from "@/lib/utils";
import { requireVerifiedUser } from "@/server/dal";
import { managesJob } from "@/server/jobs";
import { setApplicationStatus } from "@/server/actions/jobs";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { MessageButton } from "@/components/message-button";

export const metadata: Metadata = { title: "Applicants", robots: { index: false } };

const TABS: { key: string; status: ApplicationStatus; label: string; empty: string }[] = [
  { key: "new", status: "NEW", label: "New", empty: "New applications land here." },
  { key: "shortlisted", status: "SHORTLISTED", label: "Shortlist", empty: "Shortlist the people you want to talk to." },
  { key: "hired", status: "HIRED", label: "Hired", empty: "Nobody marked as hired yet." },
  { key: "rejected", status: "REJECTED", label: "Passed", empty: "People you passed on. They're told kindly." },
];

export default async function ApplicantsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireVerifiedUser();
  const job = await db.jobPost.findUnique({ where: { id }, include: { company: { select: { name: true } } } });
  if (!job) notFound();
  const manager = await managesJob(job, user.id);
  if (!manager && !user.isAdmin) notFound();
  if (job.applyUrl) redirect(`/jobs/${job.id}`);

  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const apps = await db.jobApplication.findMany({
    where: { jobId: job.id },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, creator: { select: { headline: true, status: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const shown = apps.filter((a) => a.status === tab.status);
  const move = (appId: string, status: ApplicationStatus, label: ReactNode, variant: "primary" | "secondary" | "ghost" = "secondary") =>
    manager ? (
      <ActionButton key={status} action={setApplicationStatus} fields={{ applicationId: appId, status }} variant={variant}>
        {label}
      </ActionButton>
    ) : null;

  return (
    <div className="container-tt max-w-4xl py-8 sm:py-10">
      <PageHeader back={{ href: `/jobs/${job.id}`, label: job.title }} title="Applicants" description={`For "${job.title}"${job.company ? ` at ${job.company.name}` : ""}. Each person is told when you shortlist, hire or pass on them.`} />
      {manager ? null : (
        <Notice tone="plain" className="mt-6" title="Staff view">
          You can read these, but only the poster and their team can answer.
        </Notice>
      )}
      <LinkTabs
        className="mt-6"
        active={tab.key}
        tabs={TABS.map((t) => ({ key: t.key, href: t.key === "new" ? `/jobs/${job.id}/applicants` : `/jobs/${job.id}/applicants?tab=${t.key}`, label: t.label, count: apps.filter((a) => a.status === t.status).length }))}
      />
      {shown.length ? (
        <ul className="mt-5 space-y-3">
          {shown.map((a) => (
            <li key={a.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={`/@${a.user.username}`} className="flex min-w-0 items-center gap-3">
                  <Avatar src={a.user.avatarUrl} name={a.user.displayName} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.user.displayName}</span>
                    <span className="block truncate text-xs text-muted">{a.user.creator?.status === "APPROVED" && a.user.creator.headline ? a.user.creator.headline : `@${a.user.username}`}</span>
                  </span>
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className={`badge ${APPLICATION_STATUS[a.status].tone}`}>{APPLICATION_STATUS[a.status].label}</span>
                  {timeAgo(a.createdAt)}
                </span>
              </div>
              <p className="mt-3 text-sm whitespace-pre-line text-ink-2">{a.message}</p>
              {a.links.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {a.links.map((l) => (
                    <li key={l}>
                      <a href={l} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm font-medium hover:bg-hover">
                        {hostname(l)} <ExternalLink className="size-3.5 text-muted" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {a.status === "NEW"
                  ? [
                      move(a.id, "SHORTLISTED", <><Star /> Shortlist</>, "primary"),
                      move(a.id, "HIRED", <><Check /> Hire</>),
                      move(a.id, "REJECTED", <><X /> Pass</>, "ghost"),
                    ]
                  : a.status === "SHORTLISTED"
                    ? [move(a.id, "HIRED", <><Check /> Hire</>, "primary"), move(a.id, "REJECTED", <><X /> Pass</>, "ghost"), move(a.id, "NEW", <><Undo2 /> Back to new</>, "ghost")]
                    : a.status === "HIRED"
                      ? [move(a.id, "SHORTLISTED", <><Undo2 /> Undo hire</>, "ghost")]
                      : [move(a.id, "NEW", <><Undo2 /> Back to new</>, "ghost")]}
                {manager ? <MessageButton toId={a.user.id} toName={a.user.displayName} subject={job.title} variant="ghost" className="btn-sm" /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="mt-5" icon={<Users />} title="Nobody here yet" description={tab.empty} />
      )}
    </div>
  );
}
