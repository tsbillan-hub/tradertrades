import type { Metadata } from "next";
import { ExternalLink, Mail, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { pageParam } from "@/server/queries/admin";
import { EmptyState, Notice, PageHeader, Pagination } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Emails" };

const PER_PAGE = 40;
const STATUS = {
  SENT: { label: "Sent", tone: "badge-ok" },
  LOGGED: { label: "Saved, not sent", tone: "badge-outline" },
  FAILED: { label: "Failed", tone: "badge-bad" },
} as const;

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; failed?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const failed = sp.failed === "1";
  const page = pageParam(sp.page);
  const where: Prisma.EmailLogWhereInput = {
    ...(failed ? { status: "FAILED" } : {}),
    ...(q
      ? { OR: [{ toEmail: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { template: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.emailLog.count({ where }),
    db.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, select: { id: true, toEmail: true, subject: true, template: true, status: true, error: true, createdAt: true } }),
  ]);
  const hrefFor = (p: number) => `/admin/emails?${new URLSearchParams({ ...(q ? { q } : {}), ...(failed ? { failed: "1" } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Emails" description="Every email the site sends, newest first. Open one to see exactly what the person got." />
      {!features.email ? (
        <Notice tone="warn" title="Email isn't connected yet">
          Emails are saved here instead of sent. Once a Resend key is added to the hosting settings they go out for real, and still show up here.
        </Notice>
      ) : null}
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="email-q">
          Search emails
        </label>
        <input id="email-q" name="q" defaultValue={q} className="input flex-1" placeholder="Email address, subject or type" />
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="failed" value="1" defaultChecked={failed} className="checkbox" /> Failed only
        </label>
        <button className="btn btn-secondary">
          <Search /> Search
        </button>
      </form>
      {rows.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Emails">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 text-sm">
                <div className="truncate font-semibold">{e.subject}</div>
                <div className="truncate text-muted">
                  To {e.toEmail} · {e.template.replace(/[._-]/g, " ")}
                </div>
                {e.error ? <div className="truncate text-xs text-down">{e.error}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`badge ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
                <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)} className="text-xs text-muted">
                  {timeAgo(e.createdAt)}
                </time>
                <a href={`/api/emails/${e.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                  Open <ExternalLink />
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Mail />} title={q || failed ? "No emails match" : "No emails yet"} />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={hrefFor} />
    </div>
  );
}
