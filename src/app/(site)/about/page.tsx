import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Building2, GraduationCap, HandCoins, LayoutGrid, MessageSquareQuote, Sparkles, Users } from "lucide-react";
import { db } from "@/lib/db";
import { SITE } from "@/lib/constants";
import { publicProductWhere } from "@/server/queries/products";

export const metadata: Metadata = {
  title: "About",
  description: "TraderTrades is the marketplace built for traders: communities, courses, mentoring, alerts and indicators, plus a directory of prop firms, brokers and tools.",
};

const BELIEFS = [
  {
    icon: LayoutGrid,
    title: "One place for everything",
    body: "Traders pay for Discord roles, course sites, booking links and random invoices. Here it’s one account, one checkout and one library for every community, course, call and indicator.",
  },
  {
    icon: Ban,
    title: "No profit promises, ever",
    body: "No “guaranteed”, no “risk free”, no income claims. Copy trading, account management, profit sharing and challenge passing aren’t allowed at all. Every listing is checked for this automatically when it’s published.",
  },
  {
    icon: MessageSquareQuote,
    title: "Reviews you can believe",
    body: "Only people who bought a product can review it. Creators and companies can reply in public, but they can’t delete what people say.",
  },
  {
    icon: HandCoins,
    title: "Your audience stays yours",
    body: "Creators pay us nothing on buyers they bring with their own link. We only earn when we find them a new buyer: 30% of that first purchase, then 5%.",
  },
];

export default async function AboutPage() {
  const [creators, products, companies] = await Promise.all([
    db.creatorProfile.count({ where: { status: "APPROVED" } }),
    db.product.count({ where: publicProductWhere }),
    db.company.count({ where: { status: "PUBLISHED" } }),
  ]);

  return (
    <div>
      <section className="border-b border-line">
        <div className="container-tt py-14 sm:py-20">
          <div className="kicker">About {SITE.name}</div>
          <h1 className="mt-3 max-w-3xl text-[38px] leading-[1.05] sm:text-[56px]">One marketplace for everything traders buy.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">
            Communities, courses, mentoring, alert rooms, indicators and downloads from trading creators, plus a directory to compare prop firms, brokers and
            tools. {SITE.name} puts it all in one place, with one account and the same rules for everyone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/marketplace" className="btn btn-primary btn-lg">
              Browse the marketplace <ArrowRight />
            </Link>
            <Link href="/rules" className="btn btn-secondary btn-lg">
              Read the rules
            </Link>
          </div>
        </div>
      </section>

      <section className="container-tt pt-14">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { n: creators, label: "creators" },
            { n: products, label: "live listings" },
            { n: companies, label: "companies in the directory" },
          ].map((s) => (
            <div key={s.label} className="card p-6">
              <div className="num text-4xl font-semibold">{s.n.toLocaleString()}</div>
              <div className="mt-1 text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-tt pt-16">
        <div className="kicker">What we believe</div>
        <h2 className="mt-2 text-3xl sm:text-[34px]">Four ideas we built everything around</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {BELIEFS.map((b) => (
            <div key={b.title} className="card p-6">
              <b.icon className="size-6 text-accent" />
              <h3 className="mt-4 text-xl">{b.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-tt pt-16">
        <div className="kicker">Who it&apos;s for</div>
        <h2 className="mt-2 text-3xl sm:text-[34px]">One place for the whole trading world</h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: GraduationCap,
              title: "Traders",
              body: "Find a course, a community or a mentor that fits how you trade. Compare prop firms, brokers and platforms with reviews from people who use them.",
              href: "/signup",
              cta: "Create a free account",
            },
            {
              icon: Sparkles,
              title: "Creators",
              body: "Run your community, courses, mentoring calls, alert room and downloads from one page, with your own link and 0% on the buyers you bring.",
              href: "/sell",
              cta: "Sell on TraderTrades",
            },
            {
              icon: Building2,
              title: "Businesses",
              body: "Claim your free listing, answer reviews, post offers, run campaigns with creators and hire editors and moderators.",
              href: "/for-business",
              cta: "TraderTrades for business",
            },
          ].map((c) => (
            <div key={c.title} className="card flex flex-col p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-sunk">
                <c.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-xl">{c.title}</h3>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted">{c.body}</p>
              <Link href={c.href} className="btn btn-secondary mt-6 self-start">
                {c.cta} <ArrowRight />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="container-tt pt-16">
        <div className="card p-6 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <div className="kicker">How buying works</div>
              <h2 className="mt-2 text-3xl sm:text-[34px]">Find it, buy it, it&apos;s in your library</h2>
              <p className="mt-4 text-muted">No juggling logins. Everything you buy lives in one place.</p>
            </div>
            <ol className="divide-y divide-line border-y border-line">
              {[
                { t: "Find", d: "Browse the marketplace or search. Each product shows what's inside, the price, the refund window and reviews from buyers." },
                { t: "Buy", d: "Pay once by card through Stripe. Memberships renew until you cancel, and you can cancel any time." },
                { t: "Use it", d: "Communities, courses, calls, alerts, indicators and downloads all open from your library." },
                { t: "Not right?", d: "Ask for a refund inside the window shown on the product. The creator answers, and our team steps in if needed." },
              ].map((b, i) => (
                <li key={b.t} className="flex gap-4 py-4">
                  <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-ink">{i + 1}</span>
                  <span>
                    <span className="block font-semibold">{b.t}</span>
                    <span className="mt-1 block text-sm text-muted">{b.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="container-tt pt-16">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="card p-6">
            <Users className="size-6 text-accent" />
            <h3 className="mt-4 text-xl">Education, not advice</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Creators share what they know and how they trade. Nothing here is financial advice, and most people who trade lose money. Read our{" "}
              <Link href="/risk" className="link">
                risk disclaimer
              </Link>{" "}
              before you buy anything.
            </p>
          </div>
          <div className="card p-6">
            <MessageSquareQuote className="size-6 text-accent" />
            <h3 className="mt-4 text-xl">Talk to us</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Found something that breaks the rules? Every page has a report button, and a person reads every report. For anything else, the{" "}
              <Link href="/help" className="link">
                help page
              </Link>{" "}
              has answers and a way to reach us.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
