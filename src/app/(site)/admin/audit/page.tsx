import type { Metadata } from "next";
import { ScrollText, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { pageParam } from "@/server/queries/admin";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { AuditRow } from "@/components/admin/audit-row";

export const metadata: Metadata = { title: "Audit log" };

const PER_PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; staff?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const staffOnly = sp.staff === "1";
  const page = pageParam(sp.page);
  const term = q.replace(/^@/, "");
  // A search can match the action name, the thing it was done to, or who did it.
  const people = term ? await db.user.findMany({ where: { username: { contains: term, mode: "insensitive" } }, select: { id: true }, take: 20 }) : [];
  const staff = staffOnly ? await db.user.findMany({ where: { isAdmin: true }, select: { id: true } }) : [];
  const where: Prisma.AuditLogWhereInput = {
    ...(staffOnly ? { actorId: { in: staff.map((s) => s.id) } } : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: term, mode: "insensitive" } },
            { targetId: q },
            { actorId: q },
            ...(people.length ? [{ actorId: { in: people.map((p) => p.id) } }, { targetId: { in: people.map((p) => p.id) } }] : []),
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, username: true } });
  const hrefFor = (p: number) => `/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(staffOnly ? { staff: "1" } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Sign ins, money, listings and every staff decision, with who did it and when. Nothing here can be edited or deleted." />
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="audit-q">
          Search the log
        </label>
        <input id="audit-q" name="q" defaultValue={q} className="input flex-1" placeholder="Username, action (like refund or login) or an id" />
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="staff" value="1" defaultChecked={staffOnly} className="checkbox" /> Staff only
        </label>
        <button className="btn btn-secondary">
          <Search /> Search
        </button>
      </form>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card px-5" aria-label="Audit log">
          {rows.map((r) => (
            <AuditRow key={r.id} row={r} actor={actors.find((a) => a.id === r.actorId)?.username ?? null} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ScrollText />} title="Nothing matches" />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={hrefFor} />
    </div>
  );
}
