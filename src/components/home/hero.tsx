"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "traders" | "creators" | "business";

const COPY: Record<Role, { kicker: string; title: React.ReactNode; body: string; primary: { href: string; label: string }; secondary: { href: string; label: string } }> = {
  traders: {
    kicker: "For traders",
    title: (
      <>
        The marketplace
        <br className="hidden sm:block" /> built for <span className="relative whitespace-nowrap">traders<Underline /></span>.
      </>
    ),
    body: "Communities, courses, mentoring, alerts and indicators from trading creators, plus prop firms, brokers and tools to compare. One account for all of it.",
    primary: { href: "/marketplace", label: "Browse the marketplace" },
    secondary: { href: "/directory/prop-firms", label: "Compare prop firms" },
  },
  creators: {
    kicker: "For creators",
    title: (
      <>
        Sell to your followers.
        <br className="hidden sm:block" /> Keep <span className="relative whitespace-nowrap">100%<Underline /></span> of it.
      </>
    ),
    body: "Your community, courses, calls and indicators on one page. 0% fee on buyers you bring. When we find you a buyer, we take 30% of that first sale, then 5%.",
    primary: { href: "/signup?as=creator", label: "Start selling" },
    secondary: { href: "/fees", label: "See how fees work" },
  },
  business: {
    kicker: "For businesses",
    title: (
      <>
        Be there when traders
        <br className="hidden sm:block" /> pick their <span className="relative whitespace-nowrap">tools<Underline /></span>.
      </>
    ),
    body: "Claim your free listing, reply to reviews, post offers, run campaigns with creators and hire help.",
    primary: { href: "/business/claim", label: "Claim your listing" },
    secondary: { href: "/for-business", label: "See business tools" },
  },
};

function Underline() {
  return (
    <svg className="absolute -bottom-1.5 left-0 h-[0.32em] w-full text-accent" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden>
      <path d="M2 9C40 3 120 1 198 6" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

const QUICK = ["Prop firms", "NQ scalping", "Order flow", "Mentoring", "Trading journals", "Psychology"];

export function Hero({ productCount, companyCount, creatorCount }: { productCount: number; companyCount: number; creatorCount: number }) {
  const [role, setRole] = useState<Role>("traders");
  const [q, setQ] = useState("");
  const router = useRouter();
  const c = COPY[role];

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div className="container-tt pt-12 pb-14 sm:pt-16 sm:pb-20">
        <div role="tablist" aria-label="Who are you" className="inline-flex rounded-full border border-line bg-card p-1 shadow-[var(--shadow-sm)]">
          {(Object.keys(COPY) as Role[]).map((r) => (
            <button
              key={r}
              role="tab"
              type="button"
              aria-selected={role === r}
              onClick={() => setRole(r)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors sm:px-4",
                role === r ? "bg-primary text-primary-ink" : "text-muted hover:text-ink",
              )}
            >
              {COPY[r].kicker}
            </button>
          ))}
        </div>

        <h1 key={role} className="animate-rise mt-7 max-w-4xl text-[40px] leading-[1.02] tracking-[-0.035em] sm:text-[64px] lg:text-[76px]">
          {c.title}
        </h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-lg">{c.body}</p>

        {role === "traders" ? (
          <form
            className="mt-8 max-w-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/marketplace");
            }}
          >
            <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-card p-2 shadow-[var(--shadow)] focus-within:border-ink">
              <Search className="ml-2 size-5 shrink-0 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
                placeholder="What do you want to learn or find?"
                aria-label="Search TraderTrades"
              />
              <button className="btn btn-primary h-11 rounded-xl px-5" type="submit">
                Search
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="chip h-8 bg-transparent text-[12.5px]">
                  {t}
                </Link>
              ))}
            </div>
          </form>
        ) : (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={c.primary.href} className="btn btn-primary btn-lg">
              {c.primary.label}
              <ArrowRight />
            </Link>
            <Link href={c.secondary.href} className="btn btn-secondary btn-lg">
              {c.secondary.label}
            </Link>
          </div>
        )}

        <dl className="mt-12 grid max-w-2xl grid-cols-3 gap-6 border-t border-line pt-6">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Listings</dt>
            <dd className="num mt-1 text-2xl font-semibold">{productCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Companies</dt>
            <dd className="num mt-1 text-2xl font-semibold">{companyCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Creators</dt>
            <dd className="num mt-1 text-2xl font-semibold">{creatorCount.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
