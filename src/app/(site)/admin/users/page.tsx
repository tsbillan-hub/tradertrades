import type { Metadata } from "next";
import { Search, Users } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatDate, timeAgo } from "@/lib/utils";
import { pageParam } from "@/server/queries/admin";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { UserChip } from "@/components/admin/user-chip";
import { StatusBadge } from "@/components/admin/status-badge";

export const metadata: Metadata = { title: "Accounts" };

const PER_PAGE = 30;
const STATUSES = ["ACTIVE", "SUSPENDED", "BANNED", "DELETED"] as const;
const TYPES = ["TRADER", "CREATOR", "BUSINESS"] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; type?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = STATUSES.find((s) => s === sp.status);
  const type = TYPES.find((t) => t === sp.type);
  const page = pageParam(sp.page);
  const term = q.replace(/^@/, "");
  const where: Prisma.UserWhereInput = {
    ...(status ? { status } : {}),
    ...(type ? { accountType: type } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { username: { contains: term, mode: "insensitive" } },
            { displayName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        email: true,
        accountType: true,
        status: true,
        isAdmin: true,
        isSample: true,
        idVerifiedAt: true,
        socialsVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
  ]);
  const params = (p: number) =>
    `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(type ? { type } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts" description={`${total.toLocaleString()} ${total === 1 ? "account" : "accounts"}${q || status || type ? " match" : ""}.`} />
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="user-q">
          Search accounts
        </label>
        <input id="user-q" name="q" defaultValue={q} className="input flex-1" placeholder="Name, username, email or account id" />
        <label className="sr-only" htmlFor="user-status">
          Status
        </label>
        <select id="user-status" name="status" defaultValue={status ?? ""} className="input sm:w-40">
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">On hold</option>
          <option value="BANNED">Banned</option>
          <option value="DELETED">Deleted</option>
        </select>
        <label className="sr-only" htmlFor="user-type">
          Account type
        </label>
        <select id="user-type" name="type" defaultValue={type ?? ""} className="input sm:w-40">
          <option value="">Any type</option>
          <option value="TRADER">Traders</option>
          <option value="CREATOR">Creators</option>
          <option value="BUSINESS">Businesses</option>
        </select>
        <button className="btn btn-secondary">
          <Search /> Search
        </button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
                <th className="px-4 py-2.5 font-medium">Last sign in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="max-w-[260px] px-4 py-2.5">
                    <UserChip user={u} sub={u.accountType.charAt(0) + u.accountType.slice(1).toLowerCase()} />
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-2">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={u.status} />
                      {u.isAdmin ? <span className="badge badge-ink">Staff</span> : null}
                      {u.isSample ? <span className="badge badge-warn">Sample</span> : null}
                      {u.idVerifiedAt ? <span className="badge badge-info">ID</span> : null}
                      {u.socialsVerifiedAt ? <span className="badge badge-info">Socials</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Users />} title="No accounts match" />
      )}
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} hrefFor={params} />
    </div>
  );
}
