import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, LinkTabs, PageHeader, Pagination, Stat } from "@/components/ui/misc";
import { MessageButton } from "@/components/message-button";
import { cn, formatDate, money, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };

const PER_PAGE = 30;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireCreator();
  const q = sp.q?.trim().slice(0, 60) ?? "";
  const source = sp.source === "own" ? "OWN_AUDIENCE" : sp.source === "marketplace" ? "MARKETPLACE" : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.BuyerRelationWhereInput = {
    sellerId: user.id,
    ...(source ? { source } : {}),
    ...(q ? { buyer: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase() } }] } } : {}),
  };
  const [total, own, found, rels] = await Promise.all([
    db.buyerRelation.count({ where }),
    db.buyerRelation.count({ where: { sellerId: user.id, source: "OWN_AUDIENCE" } }),
    db.buyerRelation.count({ where: { sellerId: user.id, source: "MARKETPLACE" } }),
    db.buyerRelation.findMany({
      where,
      include: { buyer: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);
  const ids = rels.map((r) => r.buyerId);
  const [spend, access] = ids.length
    ? await Promise.all([
        db.order.groupBy({
          by: ["buyerId"],
          where: { sellerId: user.id, buyerId: { in: ids }, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
          _sum: { amountCents: true, refundedCents: true },
          _max: { paidAt: true },
          _count: true,
        }),
        db.entitlement.findMany({
          where: { userId: { in: ids }, product: { creatorId: user.id }, status: "ACTIVE" },
          select: { userId: true, product: { select: { title: true } } },
        }),
      ])
    : [[], []];

  const base = (over: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const all = { q: q || undefined, source: sp.source, ...over };
    for (const [k, v] of Object.entries(all)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/creator/customers?${s}` : "/creator/customers";
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Everyone who has bought from you or joined, and where they came from." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Your own buyers" value={own} sub="Came through your link: 0% fee for good" />
        <Stat label="Found by TraderTrades" value={found} sub="30% on their first purchase, then 5%" />
        <Stat label="Total" value={own + found} className="max-xl:col-span-2" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinkTabs
          active={sp.source === "own" ? "own" : sp.source === "marketplace" ? "marketplace" : "all"}
          tabs={[
            { key: "all", href: base({ source: undefined, page: undefined }), label: "All" },
            { key: "own", href: base({ source: "own", page: undefined }), label: "Your buyers" },
            { key: "marketplace", href: base({ source: "marketplace", page: undefined }), label: "Found by us" },
          ]}
        />
        <form action="/creator/customers" method="get" className="relative w-full sm:w-64">
          {sp.source ? <input type="hidden" name="source" value={sp.source} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={q} placeholder="Search by name" className="input h-9 pl-9 text-sm" aria-label="Search customers" />
        </form>
      </div>

      {rels.length ? (
        <>
          <ul className="card divide-y divide-line">
            {rels.map((r) => {
              const s = spend.find((x) => x.buyerId === r.buyerId);
              const owned = access.filter((a) => a.userId === r.buyerId).map((a) => a.product.title);
              const net = (s?._sum.amountCents ?? 0) - (s?._sum.refundedCents ?? 0);
              return (
                <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <Link href={`/@${r.buyer.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar src={r.buyer.avatarUrl} name={r.buyer.displayName} size={40} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{r.buyer.displayName}</span>
                        <span className={cn("badge", r.source === "OWN_AUDIENCE" ? "badge-ok" : "badge-outline")}>
                          {r.source === "OWN_AUDIENCE" ? "Your buyer" : "Found by us"}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted">
                        @{r.buyer.username} · since {formatDate(r.createdAt)}
                        {owned.length ? ` · ${owned.join(", ")}` : ""}
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <div className="num font-semibold">{money(net, { exact: true })}</div>
                      <div className="text-xs text-muted">{plural(s?._count ?? 0, "order")}</div>
                    </div>
                    <MessageButton toId={r.buyer.id} toName={r.buyer.displayName} />
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pages={Math.max(1, Math.ceil(total / PER_PAGE))} hrefFor={(n) => base({ page: n > 1 ? String(n) : undefined })} />
        </>
      ) : (
        <EmptyState icon={<Users />} title={q ? "No one matches" : "No customers yet"} description={q ? "Try another name." : "Your buyers and members show up here."} />
      )}
    </div>
  );
}
