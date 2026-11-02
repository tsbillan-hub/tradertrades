import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, MapPin, Plus, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { JobKind, JobRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { JOB_KINDS, JOB_ROLES, jobKindLabel, jobRoleLabel } from "@/lib/constants";
import { plural, timeAgo } from "@/lib/utils";
import { getViewer } from "@/server/dal";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { FilterBar } from "@/components/market/filter-bar";

export const metadata: Metadata = {
  title: "Jobs in trading",
  description: "Video editors, clippers, moderators, closers and developers wanted by trading creators, prop firms, brokers and tool makers.",
};

const PER_PAGE = 30;
type SP = { q?: string; role?: string; kind?: string; remote?: string; page?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60) ?? "";
  const role = JOB_ROLES.find((r) => r.value.toLowerCase() === sp.role?.toLowerCase())?.value as JobRole | undefined;
  const kind = JOB_KINDS.find((k) => k.value.toLowerCase() === sp.kind?.toLowerCase())?.value as JobKind | undefined;
  const remote = sp.remote === "yes" ? true : sp.remote === "no" ? false : undefined;
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));
  const now = new Date();

  const where: Prisma.JobPostWhereInput = {
    status: "OPEN",
    poster: { status: "ACTIVE" },
    ...(role ? { role } : {}),
    ...(kind ? { kind } : {}),
    ...(remote !== undefined ? { remote } : {}),
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { OR: [{ companyId: null }, { company: { status: "PUBLISHED" } }] },
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
                { company: { name: { contains: q, mode: "insensitive" as const } } },
              ],
            },
          ]
        : []),
    ],
  };

  const viewer = await getViewer();
  const [total, jobs, applied] = await Promise.all([
    db.jobPost.count({ where }),
    db.jobPost.findMany({
      where,
      include: {
        company: { select: { name: true, logoUrl: true } },
        poster: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    viewer ? db.jobApplication.findMany({ where: { userId: viewer.id }, select: { jobId: true } }) : [],
  ]);
  const appliedTo = new Set(applied.map((a) => a.jobId));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const params: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(role ? { role: role.toLowerCase() } : {}),
    ...(kind ? { kind: kind.toLowerCase() } : {}),
    ...(remote !== undefined ? { remote: remote ? "yes" : "no" } : {}),
  };
  const href = (n: number) => {
    const qs = new URLSearchParams(params);
    if (n > 1) qs.set("page", String(n));
    const s = qs.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };
  const filtered = Boolean(q || role || kind || remote !== undefined);

  return (
    <div className="container-tt py-8 sm:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-[30px] sm:text-[36px]">Jobs in trading</h1>
          <p className="mt-2 text-[15px] text-muted">
            Editors, clippers, moderators, closers and developers, wanted by trading creators and companies. Posting is free, and no job here can ask you to pay to
            apply.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {viewer ? (
            <Link href="/jobs/mine" className="btn btn-secondary">
              Your jobs
            </Link>
          ) : null}
          <Link href="/jobs/new" className="btn btn-primary">
            <Plus /> Post a job
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form action="/jobs" method="get" className="relative w-full sm:w-64">
            {Object.entries(params)
              .filter(([k]) => k !== "q")
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input name="q" defaultValue={q} placeholder="Search jobs" className="input h-9 pl-9 text-sm" aria-label="Search jobs" />
          </form>
          <FilterBar
            path="/jobs"
            params={params}
            filters={[
              { name: "role", label: "Role", value: role?.toLowerCase() ?? "", options: [{ value: "", label: "All roles" }, ...JOB_ROLES.map((r) => ({ value: r.value.toLowerCase(), label: r.label }))] },
              { name: "kind", label: "Type", value: kind?.toLowerCase() ?? "", options: [{ value: "", label: "Any type" }, ...JOB_KINDS.map((k) => ({ value: k.value.toLowerCase(), label: k.label }))] },
              {
                name: "remote",
                label: "Remote",
                value: remote === undefined ? "" : remote ? "yes" : "no",
                options: [
                  { value: "", label: "Remote or not" },
                  { value: "yes", label: "Remote" },
                  { value: "no", label: "In person" },
                ],
              },
            ]}
          />
        </div>
        <span className="num text-sm text-muted">{plural(total, "open job")}</span>
      </div>

      {jobs.length ? (
        <>
          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Open jobs">
            {jobs.map((j) => {
              const by = j.company ?? { name: j.poster.displayName, logoUrl: j.poster.avatarUrl };
              return (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex items-start gap-3.5 px-4 py-4 hover:bg-hover sm:px-5">
                    <Avatar src={by.logoUrl} name={by.name} size={44} square={Boolean(j.company)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{j.title}</span>
                        {appliedTo.has(j.id) ? <span className="badge badge-info">Applied</span> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">{by.name}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="badge badge-outline">{jobRoleLabel(j.role)}</span>
                        <span className="badge badge-outline">{jobKindLabel(j.kind)}</span>
                        <span className="inline-flex items-center gap-1 text-muted">
                          <MapPin className="size-3.5" />
                          {j.remote ? (j.location ? `Remote, ${j.location}` : "Remote") : j.location}
                        </span>
                      </span>
                      {j.pay ? <span className="mt-1.5 block truncate text-sm font-semibold sm:hidden">{j.pay}</span> : null}
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      {j.pay ? <span className="block max-w-[200px] truncate text-sm font-semibold">{j.pay}</span> : null}
                      <span className="block text-xs text-muted">{timeAgo(j.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pages={pages} hrefFor={href} />
        </>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<Briefcase />}
          title={filtered ? "No jobs match" : "No open jobs right now"}
          description={filtered ? "Try a different search or filter." : "Hiring? Posting a job is free and takes a couple of minutes."}
          action={
            <Link href="/jobs/new" className="btn btn-primary">
              <Plus /> Post a job
            </Link>
          }
        />
      )}
    </div>
  );
}
