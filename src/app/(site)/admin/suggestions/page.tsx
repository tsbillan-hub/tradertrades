import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Lightbulb } from "lucide-react";
import { db } from "@/lib/db";
import { categoryInfo } from "@/lib/constants";
import { hostname, timeAgo } from "@/lib/utils";
import { EmptyState, LinkTabs, Notice, PageHeader } from "@/components/ui/misc";
import { SuggestionDecisionForm } from "@/components/admin/forms";
import { UserChip } from "@/components/admin/user-chip";

export const metadata: Metadata = { title: "Suggestions" };

/** Words too common in company names to match on. */
const GENERIC_WORDS = new Set(["the", "trading", "trader", "traders", "trade", "funded", "funding", "capital", "markets", "market", "group", "prop", "firm", "futures", "forex", "global", "pro", "inc", "ltd", "llc", "com"]);

export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "open";
  const pending = await db.companySuggestion.count({ where: { status: "PENDING" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Suggestions" description="Companies people want in the directory. Adding one lists it as “Not checked yet” until you check its details." />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "open", href: "/admin/suggestions", label: "Waiting", count: pending },
          { key: "done", href: "/admin/suggestions?tab=done", label: "Done" },
        ]}
      />
      {tab === "open" ? <Waiting /> : <Done />}
    </div>
  );
}

async function Waiting() {
  const rows = await db.companySuggestion.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  if (!rows.length) return <EmptyState icon={<Lightbulb />} title="No suggestions waiting" />;
  // Companies we may already list under another name, matched on name or website.
  const matches = await Promise.all(
    rows.map((s) => {
      const host = hostname(s.website).replace(/^www\./, "");
      const word = s.name.split(/[^a-z0-9]+/i).find((w) => w.length >= 3 && !GENERIC_WORDS.has(w.toLowerCase())) ?? s.name.trim();
      return db.company.findMany({
        where: { OR: [{ name: { contains: word, mode: "insensitive" } }, ...(host ? [{ website: { contains: host, mode: "insensitive" as const } }] : [])] },
        select: { id: true, slug: true, name: true, website: true, status: true },
        take: 3,
      });
    }),
  );
  return (
    <div className="space-y-4">
      <Notice tone="plain">Only add real companies traders use. Add one, then fill in its details from its own website, tick “I checked these details” and save.</Notice>
      {rows.map((s, i) => {
        const likely = matches[i];
        return (
          <article key={s.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg">{s.name}</h2>
                <span className="badge badge-outline">{categoryInfo(s.category).singular}</span>
                {s.worksThere ? <span className="badge badge-info">Works there</span> : null}
              </div>
              <a href={s.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
                {hostname(s.website)} <ExternalLink className="size-3.5" />
              </a>
              {s.note ? <p className="text-sm whitespace-pre-line text-ink-2">{s.note}</p> : null}
              <UserChip user={s.user} sub={`suggested ${timeAgo(s.createdAt)}`} />
              {likely.length ? (
                <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                  <div className="font-semibold">Might already be listed</div>
                  <ul className="mt-1 space-y-0.5">
                    {likely.map((c) => (
                      <li key={c.id}>
                        <Link href={`/admin/directory/${c.id}`} className="underline underline-offset-2">
                          {c.name}
                        </Link>{" "}
                        <span className="opacity-80">
                          ({c.slug}, {hostname(c.website)}
                          {c.status === "HIDDEN" ? ", hidden" : ""})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="lg:border-l lg:border-line lg:pl-5">
              <SuggestionDecisionForm suggestionId={s.id} likelySlug={likely[0]?.slug} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Done() {
  const rows = await db.companySuggestion.findMany({
    where: { status: { not: "PENDING" } },
    orderBy: { reviewedAt: "desc" },
    take: 50,
    include: { company: { select: { id: true, name: true } } },
  });
  if (!rows.length) return <EmptyState icon={<Lightbulb />} title="Nothing decided yet" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Decided suggestions">
      {rows.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <div className="min-w-0">
            <div className="font-semibold">{s.name}</div>
            <div className="truncate text-muted">
              {s.status === "ADDED" && s.company ? (
                <>
                  Listed as{" "}
                  <Link href={`/admin/directory/${s.company.id}`} className="underline underline-offset-2">
                    {s.company.name}
                  </Link>
                </>
              ) : (
                s.reviewNote
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={s.status === "ADDED" ? "badge badge-ok" : "badge badge-outline"}>{s.status === "ADDED" ? "Added" : "Said no"}</span>
            <span className="text-xs text-muted">{s.reviewedAt ? timeAgo(s.reviewedAt) : null}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
