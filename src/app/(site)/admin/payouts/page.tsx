import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Play, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { cn, formatDate, money, plural } from "@/lib/utils";
import { nextPayoutDate } from "@/server/commerce/payouts";
import { resumeCreatorPayouts, runPayoutsNow } from "@/server/actions/payouts";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, LinkTabs, Notice, PageHeader, Stat } from "@/components/ui/misc";
import { AdjustBalanceButton, PausePayoutsButton } from "@/components/admin/payout-forms";

export const metadata: Metadata = { title: "Payouts" };

const PAYOUT_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Starting", tone: "badge-outline" },
  IN_TRANSIT: { label: "On its way", tone: "badge-info" },
  PAID: { label: "Sent", tone: "badge-ok" },
  FAILED: { label: "Failed", tone: "badge-bad" },
};

type Creator = {
  id: string;
  username: string;
  displayName: string;
  status: string;
  creator: {
    stripeAccountId: string | null;
    stripePayoutsEnabled: boolean;
    testPayoutsReady: boolean;
    payoutsPausedAt: Date | null;
    payoutsPausedReason: string | null;
  } | null;
};

const creatorSelect = {
  id: true,
  username: true,
  displayName: true,
  status: true,
  creator: { select: { stripeAccountId: true, stripePayoutsEnabled: true, testPayoutsReady: true, payoutsPausedAt: true, payoutsPausedReason: true } },
} satisfies Prisma.UserSelect;

function setupBadge(c: Creator["creator"]) {
  if (!c) return null;
  if (features.stripe) {
    return c.stripePayoutsEnabled ? <span className="badge badge-ok">Stripe ready</span> : c.stripeAccountId ? <span className="badge badge-warn">Stripe not finished</span> : <span className="badge badge-outline">Not set up</span>;
  }
  return c.testPayoutsReady ? <span className="badge badge-ok">Test payouts ready</span> : <span className="badge badge-outline">Not set up</span>;
}

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "payouts" ? "payouts" : sp.tab === "paused" ? "paused" : "balances";
  const q = (sp.q ?? "").trim().replace(/^@/, "").slice(0, 60);
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);

  const [held, readyByAll, paid30, failed30, pausedCount] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { payoutId: null, availableAt: { gt: now } }, _sum: { amountCents: true } }),
    db.ledgerEntry.groupBy({ by: ["userId"], where: { payoutId: null, availableAt: { lte: now } }, _sum: { amountCents: true } }),
    db.payout.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { amountCents: true }, _count: true }),
    db.payout.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    db.creatorProfile.count({ where: { payoutsPausedAt: { not: null } } }),
  ]);

  // A refund after a payout can leave a creator below zero. That isn't money going out, so it's counted on its own.
  const readyCents = readyByAll.reduce((sum, r) => sum + Math.max(0, r._sum.amountCents ?? 0), 0);
  const owedBack = readyByAll.filter((r) => (r._sum.amountCents ?? 0) < 0);
  const owedBackCents = owedBack.reduce((sum, r) => sum - (r._sum.amountCents ?? 0), 0);

  // Balances: the creators owed the most, or the ones matching a search (even with nothing owed).
  let rows: { user: Creator; heldCents: number; readyCents: number }[] = [];
  if (tab === "balances" || tab === "paused") {
    let users: Creator[];
    if (tab === "paused") {
      users = await db.user.findMany({ where: { creator: { payoutsPausedAt: { not: null } } }, select: creatorSelect, orderBy: { username: "asc" }, take: 100 });
    } else if (q) {
      users = await db.user.findMany({
        where: { creator: { isNot: null }, OR: [{ username: { contains: q.toLowerCase() } }, { displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
        select: creatorSelect,
        take: 30,
      });
    } else {
      const owed = await db.ledgerEntry.groupBy({ by: ["userId"], where: { payoutId: null }, _sum: { amountCents: true }, orderBy: { _sum: { amountCents: "desc" } }, take: 50 });
      const ids = owed.filter((o) => (o._sum.amountCents ?? 0) !== 0).map((o) => o.userId);
      const found = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: creatorSelect }) : [];
      users = ids.map((id) => found.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
    }
    const ids = users.map((u) => u.id);
    const [heldBy, readyBy] = ids.length
      ? await Promise.all([
          db.ledgerEntry.groupBy({ by: ["userId"], where: { userId: { in: ids }, payoutId: null, availableAt: { gt: now } }, _sum: { amountCents: true } }),
          db.ledgerEntry.groupBy({ by: ["userId"], where: { userId: { in: ids }, payoutId: null, availableAt: { lte: now } }, _sum: { amountCents: true } }),
        ])
      : [[], []];
    rows = users.map((u) => ({
      user: u,
      heldCents: heldBy.find((h) => h.userId === u.id)?._sum.amountCents ?? 0,
      readyCents: readyBy.find((r) => r.userId === u.id)?._sum.amountCents ?? 0,
    }));
  }

  const payouts =
    tab === "payouts"
      ? await db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { user: { select: { id: true, username: true, displayName: true } } } })
      : [];

  const next = nextPayoutDate(now).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" description={`Money held for creators, what's ready, and payouts to their banks. Payouts go out every Monday; the next one is ${next}.`} />

      {!features.stripe ? (
        <Notice
          tone="warn"
          title="Preview mode"
          action={
            <ActionButton action={runPayoutsNow} variant="secondary" size="sm" confirm="Pay out every creator who has money ready now? (Test: no real money moves.)">
              <Play /> Run this week&apos;s payouts now
            </ActionButton>
          }
        >
          Payouts are pretend until Stripe is connected. The weekly run happens Mondays at 07:00 UTC.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Held for creators" value={money(held._sum.amountCents ?? 0, { exact: true })} sub="Still inside the refund hold" />
        <Stat
          label="Ready to pay out"
          value={money(readyCents, { exact: true })}
          sub={owedBack.length ? `Goes out ${next.split(",")[0]}. ${money(owedBackCents, { exact: true })} owed back by ${plural(owedBack.length, "creator")}` : `Goes out ${next.split(",")[0]}`}
        />
        <Stat label="Paid out, last 30 days" value={money(paid30._sum.amountCents ?? 0, { exact: true })} sub={`${paid30._count} ${paid30._count === 1 ? "payout" : "payouts"}`} />
        <Stat label="Failed, last 30 days" value={failed30} sub={failed30 ? "Creators were asked to check their bank details" : "None"} />
      </div>

      <LinkTabs
        active={tab}
        tabs={[
          { key: "balances", href: "/admin/payouts", label: "Balances" },
          { key: "payouts", href: "/admin/payouts?tab=payouts", label: "Payouts" },
          { key: "paused", href: "/admin/payouts?tab=paused", label: "Paused", count: pausedCount },
        ]}
      />

      {tab === "balances" ? (
        <form className="flex flex-col gap-2 sm:flex-row" role="search">
          <label className="sr-only" htmlFor="payout-q">
            Find a creator
          </label>
          <input id="payout-q" name="q" defaultValue={q} className="input flex-1" placeholder="Find a creator by name, username or email" />
          <button className="btn btn-secondary">
            <Search /> Search
          </button>
        </form>
      ) : null}

      {tab === "payouts" ? (
        payouts.length ? (
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Creator</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">How</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/users/${p.user.id}`} className="hover:underline">
                        {p.user.displayName}
                      </Link>
                      <div className="text-xs text-muted">@{p.user.username}</div>
                    </td>
                    <td className="num px-4 py-2.5 text-right font-semibold">{money(p.amountCents, { exact: true })}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("badge", PAYOUT_STATUS[p.status]?.tone)}>{PAYOUT_STATUS[p.status]?.label ?? p.status}</span>
                      {p.failureReason ? <div className="mt-1 text-xs text-down">{p.failureReason}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{p.provider === "TEST" ? "Test" : p.stripeTransferId ? "Credit from us" : "Stripe"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Banknote />} title="No payouts yet" description="Payouts show here once creators have money past the refund hold." />
        )
      ) : rows.length ? (
        <ul className="card divide-y divide-line">
          {rows.map(({ user: u, heldCents, readyCents }) => (
            <li key={u.id} className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">
                    {u.displayName}
                  </Link>
                  <span className="text-sm text-muted">@{u.username}</span>
                  {setupBadge(u.creator)}
                  {u.creator?.payoutsPausedAt ? <span className="badge badge-bad">Payouts paused</span> : null}
                  {u.status !== "ACTIVE" ? <span className="badge badge-warn">Account {u.status.toLowerCase()}</span> : null}
                </div>
                {u.creator?.payoutsPausedAt ? (
                  <p className="mt-1 text-xs text-muted">
                    Paused {formatDate(u.creator.payoutsPausedAt)}: {u.creator.payoutsPausedReason}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted">On hold </span>
                    <span className="num font-semibold">{money(heldCents, { exact: true })}</span>
                  </span>
                  <span>
                    <span className="text-muted">Ready </span>
                    <span className={cn("num font-semibold", readyCents < 0 && "text-down")}>{money(readyCents, { exact: true })}</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdjustBalanceButton userId={u.id} name={u.displayName} stripe={features.stripe} />
                {u.creator?.payoutsPausedAt ? (
                  <ActionButton action={resumeCreatorPayouts} fields={{ userId: u.id }} confirm={`Restart payouts for ${u.displayName}?`}>
                    Restart payouts
                  </ActionButton>
                ) : (
                  <PausePayoutsButton userId={u.id} name={u.displayName} />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Banknote />}
          title={tab === "paused" ? "No paused payouts" : q ? "No creator matches" : "Nobody is owed anything yet"}
          description={tab === "paused" ? "Creators whose payouts you pause show here." : q ? "Try their username or email." : "Creators show here once they have sales."}
        />
      )}
    </div>
  );
}
