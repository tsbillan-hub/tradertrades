import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronRight, FileCheck2, Flag, Handshake, KeyRound, Lightbulb, Package, RotateCcw, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { money, plural } from "@/lib/utils";
import { adminCounts } from "@/server/queries/admin";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { AuditRow } from "@/components/admin/audit-row";

export const metadata: Metadata = { title: "Overview" };

const DAY = 86_400_000;

export default async function AdminHome() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const real = { isSample: false };
  const [n, users, newUsers, creators, listings, sales, companies, reviews, recent] = await Promise.all([
    adminCounts(),
    db.user.count({ where: { ...real, status: { not: "DELETED" } } }),
    db.user.count({ where: { ...real, createdAt: { gte: weekAgo } } }),
    db.creatorProfile.count({ where: { user: real } }),
    db.product.count({ where: { ...real, status: "PUBLISHED" } }),
    db.order.aggregate({
      where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] }, paidAt: { gte: monthAgo } },
      _sum: { amountCents: true, platformFeeCents: true, refundedCents: true },
      _count: true,
    }),
    db.company.count({ where: { status: "PUBLISHED" } }),
    db.companyReview.count({ where: { status: "PUBLISHED", isSample: false } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const actors = await db.user.findMany({ where: { id: { in: recent.map((r) => r.actorId).filter((x): x is string => Boolean(x)) } }, select: { id: true, username: true } });

  const queues = [
    { href: "/admin/reports", icon: <Flag />, label: "Reports", count: n.reports, hint: "Things people reported" },
    { href: "/admin/flags", icon: <ShieldAlert />, label: "Flagged words", count: n.flags, hint: "Posts our word check wants a person to read" },
    { href: "/admin/listings", icon: <Package />, label: "New listings", count: n.listings, hint: "Live listings nobody has looked at yet" },
    { href: "/admin/refunds", icon: <RotateCcw />, label: "Refund reviews", count: n.refunds, hint: "Buyers asked us, or the creator didn't answer" },
    { href: "/admin/verification", icon: <BadgeCheck />, label: "ID and socials", count: n.verification, hint: "Optional badges people asked for" },
    { href: "/admin/suggestions", icon: <Lightbulb />, label: "Suggestions", count: n.suggestions, hint: "Companies people want in the directory" },
    { href: "/admin/proof", icon: <FileCheck2 />, label: "Review proof", count: n.proof, hint: "Proof of use on directory reviews" },
    { href: "/admin/claims", icon: <KeyRound />, label: "Listing claims", count: n.claims, hint: "Companies proving it's theirs with documents" },
    { href: "/admin/deals", icon: <Handshake />, label: "Deal disputes", count: n.deals, hint: "A company and a creator disagree on a paid deal" },
  ];
  const waiting = queues.reduce((sum, q) => sum + q.count, 0);

  const services = [
    { label: "Card payments", on: features.stripe, yes: "Stripe connected", no: "Test checkout, no real money" },
    { label: "Email", on: features.email, yes: "Sending for real", no: "Saved to the outbox only" },
    { label: "File storage", on: features.blob, yes: "Vercel Blob", no: "This server's disk" },
    { label: "Video calls", on: features.daily, yes: "Daily rooms", no: "Free Jitsi rooms" },
    { label: "Extra content checks", on: features.aiChecks, yes: "On", no: "Word rules only" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" description={waiting ? `${waiting} ${waiting === 1 ? "thing needs" : "things need"} a look.` : "Nothing waiting. Nice."} />

      <section aria-labelledby="todo-title">
        <h2 id="todo-title" className="sr-only">
          To do
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queues.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className="card group flex items-center gap-3 p-4 transition-colors hover:border-line-strong">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sunk text-ink-2 [&>svg]:size-[18px]">{q.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {q.label}
                    {q.count ? <span className="num rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{q.count}</span> : null}
                  </span>
                  <span className="block truncate text-[13px] text-muted">{q.hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="numbers-title">
        <h2 id="numbers-title" className="mb-3 text-lg">
          The numbers
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Accounts" value={users.toLocaleString()} sub={`${newUsers} new this week`} />
          <Stat label="Creators" value={creators.toLocaleString()} sub={`${listings} live listings`} />
          <Stat label="Sales, 30 days" value={money(sales._sum.amountCents ?? 0)} sub={plural(sales._count, "order")} />
          <Stat label="Our fees, 30 days" value={money(sales._sum.platformFeeCents ?? 0)} sub={`${money(sales._sum.refundedCents ?? 0)} refunded`} />
          <Stat label="Directory" value={companies.toLocaleString()} sub={plural(reviews, "review")} />
        </div>
        <p className="mt-2 text-xs text-muted">Sample accounts and listings made for the preview are left out.</p>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Latest activity" action={<Link href="/admin/audit" className="text-sm font-semibold text-ink-2 hover:text-ink">Audit log</Link>}>
          {recent.length ? (
            <ul className="-my-2 divide-y divide-line">
              {recent.map((r) => (
                <AuditRow key={r.id} row={r} actor={actors.find((a) => a.id === r.actorId)?.username ?? null} compact />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing yet.</p>
          )}
        </Panel>
        <Panel title="Services" description="What's connected on this copy of the site.">
          <dl className="-my-2 divide-y divide-line">
            {services.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt className="text-muted">{s.label}</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <span className={s.on ? "size-2 rounded-full bg-up" : "size-2 rounded-full bg-warn"} aria-hidden />
                  {s.on ? s.yes : s.no}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">Each one turns on when its key is added to the hosting settings.</p>
        </Panel>
      </div>
    </div>
  );
}
