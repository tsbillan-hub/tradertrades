import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  ChartNoAxesColumn,
  Handshake,
  Megaphone,
  MessageSquareReply,
  MousePointerClick,
  ShieldCheck,
  Ticket,
  Video,
} from "lucide-react";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/constants";
import { FEATURED_LIMITS, FEATURED_PRICES } from "@/lib/fees";
import { money } from "@/lib/utils";
import { getViewer, companiesFor } from "@/server/dal";

export const metadata: Metadata = {
  title: "TraderTrades for business",
  description: "Claim your free directory listing, reply to reviews, post offers, run creator campaigns and hire help.",
};

export default async function ForBusinessPage() {
  const viewer = await getViewer();
  const [companyCount, memberships] = await Promise.all([db.company.count({ where: { status: "PUBLISHED" } }), viewer ? companiesFor(viewer.id) : []]);
  const hasCompany = memberships.length > 0;
  const primaryHref = hasCompany ? "/business" : viewer ? "/business/claim" : "/signup?as=business";
  const primaryLabel = hasCompany ? "Open your business dashboard" : "Claim your listing";

  return (
    <div>
      <section className="border-b border-line">
        <div className="container-tt grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <div className="kicker">For business</div>
            <h1 className="mt-3 text-[38px] leading-[1.05] sm:text-[56px]">Meet traders while they&apos;re choosing.</h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
              Prop firms, brokers, platforms and tools are listed for free. Claim yours to keep it right, answer reviews and post offers. Then reach more traders with
              Featured spots and campaigns with trading creators.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={primaryHref} className="btn btn-primary btn-lg">
                <Building2 /> {primaryLabel}
              </Link>
              <Link href="/directory" className="btn btn-secondary btn-lg">
                Browse the directory
              </Link>
            </div>
          </div>
          <div className="card p-6">
            <div className="text-sm font-semibold text-muted">In the directory</div>
            <div className="num mt-1 text-5xl font-semibold">{companyCount.toLocaleString()}</div>
            <div className="mt-1 text-sm text-muted">companies across {CATEGORIES.length} categories</div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <Link key={c.value} href={`/directory/${c.slug}`} className="chip">
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Free */}
      <section className="container-tt pt-16">
        <div className="kicker">Free for every company</div>
        <h2 className="mt-2 text-3xl sm:text-[34px]">Claim your listing in a few minutes</h2>
        <p className="mt-3 max-w-2xl text-muted">
          Press &ldquo;Claim this listing&rdquo; on your company&apos;s page. We send a code to an email at your company&apos;s domain, and you&apos;re in. Can&apos;t find your
          company? You can add it.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: BadgeCheck, t: "Claimed badge", d: "Shows traders the listing is run by your team and kept up to date." },
            { icon: MessageSquareReply, t: "Reply to reviews", d: "Answer every review in public. You can report fake ones, but you can't delete honest ones." },
            { icon: Ticket, t: "Post offers", d: "Discount codes and deals show on your listing and in the offers list." },
            { icon: MousePointerClick, t: "See your clicks", d: "Count the traders who visit your site from TraderTrades, by day and by page." },
            { icon: Video, t: "Add videos", d: "Walkthroughs and explainers play right on your listing." },
            { icon: Briefcase, t: "Post jobs for free", d: "Hire editors, moderators, analysts and developers from the trading world." },
          ].map((f) => (
            <div key={f.t} className="card p-5">
              <f.icon className="size-5 text-accent" />
              <div className="mt-3 font-bold">{f.t}</div>
              <p className="mt-1 text-sm text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section id="featured" className="container-tt scroll-mt-24 pt-16">
        <div className="card overflow-hidden lg:grid lg:grid-cols-[1fr_1.1fr]">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 text-accent">
              <Megaphone className="size-5" />
              <span className="kicker text-accent">Featured spots</span>
            </div>
            <h2 className="mt-3 text-3xl">Be first in line, clearly labelled</h2>
            <p className="mt-3 text-muted">
              Book a week at the top of a directory category or on the home page. Every Featured spot says &ldquo;Sponsored&rdquo;. Paying never changes your rating,
              your reviews or where you rank in normal results.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">
              <li>• Book by the week, up to 8 weeks ahead</li>
              <li>• Limited spots, so each one gets seen</li>
              <li>• Clicks and views reported in your dashboard</li>
              <li>• We can refuse companies with unresolved complaints</li>
            </ul>
          </div>
          <div className="grid border-t border-line sm:grid-cols-2 lg:border-t-0 lg:border-l">
            {[
              { t: "Top of a category", price: FEATURED_PRICES.CATEGORY, limit: FEATURED_LIMITS.CATEGORY, d: "Above the list in one directory category, such as Prop firms." },
              { t: "Home page", price: FEATURED_PRICES.HOME, limit: FEATURED_LIMITS.HOME, d: "In the Sponsored row on the TraderTrades home page." },
            ].map((p) => (
              <div key={p.t} className="flex flex-col border-line p-6 sm:p-8 sm:[&:first-child]:border-r">
                <div className="font-bold">{p.t}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="num text-4xl font-semibold">{money(p.price)}</span>
                  <span className="text-sm text-muted">/ week</span>
                </div>
                <p className="mt-3 flex-1 text-sm text-muted">{p.d}</p>
                <div className="mt-4 text-xs text-faint">{p.limit} spots at a time</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Campaigns */}
      <section id="campaigns" className="container-tt scroll-mt-24 pt-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-accent">
              <Handshake className="size-5" />
              <span className="kicker text-accent">Creator campaigns</span>
            </div>
            <h2 className="mt-3 text-3xl sm:text-[34px]">Work with trading creators</h2>
            <p className="mt-3 text-muted">
              Post a brief with your budget, or invite creators directly. Agree a price, pay into the deal, and the money goes to the creator when the work is done.
            </p>
            <div className="mt-6 card p-5">
              <div className="text-sm font-semibold text-muted">Example: a {money(100000)} deal</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Agreed price</span>
                  <span className="num font-semibold">{money(100000, { exact: true })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform fee (10%)</span>
                  <span className="num font-semibold">{money(10000, { exact: true })}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-2">
                  <span className="font-semibold">You pay</span>
                  <span className="num font-semibold">{money(110000, { exact: true })}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">The creator gets the agreed price, minus card processing.</p>
            </div>
          </div>
          <ol className="space-y-3">
            {[
              { t: "Post a brief", d: "Say what you want (a review video, a tutorial, a live session), your budget, dates and which markets you serve." },
              { t: "Pick creators", d: "Filter by market and audience size. Creators apply to your brief, or you invite them." },
              { t: "Agree and pay", d: "Agree the price and what gets delivered. You pay into the deal, so the creator knows the money is there." },
              { t: "Approve the work", d: "The creator sends links to what they made. You approve it, and they get paid. Disagreements come to our team." },
            ].map((s, i) => (
              <li key={s.t} className="card flex gap-4 p-5">
                <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-ink">{i + 1}</span>
                <div>
                  <div className="font-bold">{s.t}</div>
                  <p className="mt-1 text-sm text-muted">{s.d}</p>
                </div>
              </li>
            ))}
            <li className="rounded-xl bg-sunk p-5 text-sm text-ink-2">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-4" /> Campaign rules
              </div>
              <p className="mt-1.5 text-muted">
                Sponsored content must be labelled as an ad. No income claims or &ldquo;easy money&rdquo; messages. Prop firm promotions must link to the firm&apos;s full
                rules. Creators can turn down any brief.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* Never */}
      <section className="container-tt pt-16">
        <div className="card p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <ChartNoAxesColumn className="size-6 text-accent" />
              <h2 className="mt-3 text-3xl">What money can&apos;t buy here</h2>
              <p className="mt-3 text-muted">Traders only trust the directory if it stays honest. So some things are never for sale.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                "A higher rating, or a better spot in normal results",
                "Removing or hiding honest reviews",
                "Fake reviews from your own team",
                "Featured spots that don't say Sponsored",
              ].map((t) => (
                <li key={t} className="rounded-xl border border-line p-4 text-sm font-semibold">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="container-tt pt-16">
        <div className="relative overflow-hidden rounded-2xl bg-[#16130F] px-6 py-12 text-[#F2EADB] sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border-[28px] border-[#F2EADB]/[0.06]" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl text-[#F2EADB] sm:text-[40px]">Your listing is probably already here.</h2>
            <p className="mt-4 text-[#F2EADB]/75">Claim it for free and make sure traders see the right details.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={primaryHref} className="btn btn-lg bg-[#F2EADB] text-[#16130F] hover:bg-white">
                {primaryLabel} <ArrowRight />
              </Link>
              <Link href="/help#business" className="btn btn-lg border-[#F2EADB]/25 text-[#F2EADB] hover:bg-[#F2EADB]/10">
                Business questions
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
