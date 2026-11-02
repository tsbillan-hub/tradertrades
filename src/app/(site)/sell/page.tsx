import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  BarChart3,
  CalendarCheck,
  CreditCard,
  Link2,
  ListChecks,
  Lock,
  MessagesSquare,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { BANNED_PRODUCTS, PRODUCT_TYPES } from "@/lib/constants";
import { feeExample, HOLD_DAYS } from "@/lib/fees";
import { money } from "@/lib/utils";
import { absoluteUrl } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { Avatar } from "@/components/ui/avatar";

export const metadata: Metadata = {
  title: "Sell on TraderTrades",
  description: "Run your trading community, courses, mentoring and alerts from one page. 0% on the buyers you bring.",
};

const INCLUDED = [
  { icon: MessagesSquare, title: "Community with channels", body: "Chat channels, announcements, live sessions and a resources area for members." },
  { icon: PlayCircle, title: "Course player", body: "Modules, video lessons, files, free preview lessons and progress for every student." },
  { icon: CalendarCheck, title: "Mentoring calendar", body: "Set your hours, buffers and call length. Buyers book a time and get a call link." },
  { icon: Lock, title: "Locked alert posts", body: "Ideas are time stamped and can't be edited after posting, only updated. That's what makes them believable." },
  { icon: ListChecks, title: "Indicator access", body: "Buyers send their TradingView username and you tick off access, all tracked in one list." },
  { icon: Tag, title: "Coupons and trials", body: "Discount codes, free trials on memberships and a waitlist before you launch." },
  { icon: BarChart3, title: "Stats that matter", body: "Visits, sales, where each buyer came from and what you kept after fees." },
  { icon: CreditCard, title: "Payouts every week", body: `Stripe pays your bank weekly. Each sale is held ${HOLD_DAYS} days first so refunds are covered.` },
];

export default async function SellPage() {
  const viewer = await getViewer();
  const tris = await db.user.findFirst({
    where: { username: "tris", creator: { status: "APPROVED" } },
    select: { username: true, displayName: true, avatarUrl: true, creator: { select: { headline: true } } },
  });
  const applyHref = viewer ? (viewer.creator?.status === "APPROVED" ? "/creator" : "/creator/start") : "/signup?as=creator";
  const applyLabel = viewer?.creator?.status === "APPROVED" ? "Open your dashboard" : "Start selling";
  const own = feeExample(10000, "OWN_AUDIENCE");
  const first = feeExample(10000, "MARKETPLACE_FIRST");
  const repeat = feeExample(10000, "MARKETPLACE_REPEAT");

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-[#16130F] text-[#F2EADB]">
        <div className="pointer-events-none absolute -right-40 -bottom-40 size-[520px] rounded-full border-[48px] border-[#F2EADB]/[0.05]" />
        <div className="container-tt relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <div className="text-xs font-bold tracking-[0.08em] text-[#F2EADB]/60 uppercase">For creators</div>
            <h1 className="mt-4 text-[40px] leading-[1.03] text-[#F2EADB] sm:text-[60px]">Everything you sell, on one page you own.</h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#F2EADB]/75">
              Your community, courses, mentoring calls, alert room, indicators and downloads, with your own link. Pay us 0% on the buyers you bring. We find you new
              ones too.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={applyHref} className="btn btn-lg bg-[#F2EADB] text-[#16130F] hover:bg-white">
                <Sparkles /> {applyLabel}
              </Link>
              {tris ? (
                <Link href={`/@${tris.username}`} className="btn btn-lg border-[#F2EADB]/25 text-[#F2EADB] hover:bg-[#F2EADB]/10">
                  See an example page
                </Link>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-[#F2EADB]/15 bg-[#F2EADB]/[0.04] p-5">
            <div className="flex items-center gap-2 text-sm text-[#F2EADB]/70">
              <Link2 className="size-4" /> Your share link
            </div>
            <div className="num mt-2 truncate rounded-lg bg-[#F2EADB]/10 px-3 py-2.5 text-[15px] text-[#F2EADB]">{absoluteUrl("/r/yourname").replace(/^https?:\/\//, "")}</div>
            <div className="mt-5 space-y-3">
              {[
                { label: "Your buyer", ex: own, note: "0%" },
                { label: "We found them, 1st sale", ex: first, note: "30%" },
                { label: "Same buyer, after that", ex: repeat, note: "5%" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 border-t border-[#F2EADB]/10 pt-3">
                  <div>
                    <div className="text-[15px] font-semibold">{r.label}</div>
                    <div className="text-xs text-[#F2EADB]/55">
                      {r.note} to us · card fee {money(r.ex.processingFeeCents, { exact: true })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-2xl font-semibold">{money(r.ex.sellerNetCents, { exact: true })}</div>
                    <div className="text-[11px] text-[#F2EADB]/55">you keep of {money(10000)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What you can sell */}
      <section className="container-tt pt-16">
        <div className="kicker">What you can sell</div>
        <h2 className="mt-2 text-3xl sm:text-[34px]">Seven kinds of products, one checkout</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_TYPES.map((t) => (
            <div key={t.value} className="card p-5">
              <span className="grid size-10 place-items-center rounded-lg bg-sunk">
                <ProductTypeIcon type={t.value} className="size-[18px]" />
              </span>
              <div className="mt-3 font-bold">{t.plural}</div>
              <p className="mt-1 text-sm text-muted">{t.blurb}</p>
            </div>
          ))}
          <div className="card flex flex-col justify-center border-dashed p-5">
            <Users className="size-5 text-accent" />
            <p className="mt-2 text-sm text-muted">Bundle them: give community members a course, or include a monthly call with a membership.</p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="container-tt pt-16">
        <div className="kicker">How it works</div>
        <h2 className="mt-2 text-3xl sm:text-[34px]">From sign up to first sale</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Set up your page", d: "Add a photo, a headline and your socials. Takes a couple of minutes, and there's nothing to wait for." },
            { t: "Add products", d: "Create a community, course, mentoring calls or anything else. Upload videos and lessons, set prices, trials and coupons." },
            { t: "Publish", d: "Listings go live straight away once they pass the automatic rules check. Connect Stripe to get paid." },
            { t: "Share your link", d: "Post your link in your bio and videos. Everyone who buys through it is your buyer at 0%, for good." },
          ].map((s, i) => (
            <li key={s.t} className="card p-5">
              <div className="num grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-ink">{i + 1}</div>
              <div className="mt-4 text-lg font-bold">{s.t}</div>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Included */}
      <section className="container-tt pt-16">
        <div className="kicker">Included for every creator</div>
        <h2 className="mt-2 text-3xl sm:text-[34px]">No plugins, no monthly plan</h2>
        <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {INCLUDED.map((f) => (
            <div key={f.title}>
              <f.icon className="size-5 text-accent" />
              <div className="mt-3 font-bold">{f.title}</div>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Example */}
      {tris ? (
        <section className="container-tt pt-16">
          <Link href={`/@${tris.username}`} className="card card-hover flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <Avatar src={tris.avatarUrl} name={tris.displayName} size={64} />
            <div className="min-w-0 flex-1">
              <div className="kicker">Example creator page</div>
              <div className="mt-1 text-xl font-bold">{tris.displayName}</div>
              {tris.creator?.headline ? <p className="mt-1 text-sm text-muted">{tris.creator.headline}</p> : null}
            </div>
            <span className="btn btn-secondary shrink-0">
              Have a look <ArrowRight />
            </span>
          </Link>
        </section>
      ) : null}

      {/* Rules + badges */}
      <section className="container-tt pt-16">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-6">
            <div className="flex items-center gap-2">
              <Ban className="size-5 text-down" />
              <h3 className="text-xl">Never allowed</h3>
            </div>
            <ul className="mt-4 space-y-3">
              {BANNED_PRODUCTS.map((b) => (
                <li key={b.title} className="text-sm">
                  <span className="font-semibold">{b.title}.</span> <span className="text-muted">{b.detail}</span>
                </li>
              ))}
            </ul>
            <Link href="/rules" className="btn btn-secondary btn-sm mt-5">
              Full marketplace rules
            </Link>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-accent" />
              <h3 className="text-xl">Optional badges</h3>
            </div>
            <ul className="mt-4 space-y-4">
              {[
                { t: "ID verified", d: "We check a government ID matches you." },
                { t: "Socials verified", d: "Post a code we give you on your socials to prove they're yours." },
              ].map((b) => (
                <li key={b.t} className="flex gap-3 text-sm">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{b.t}.</span> <span className="text-muted">{b.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-tt pt-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="kicker">Questions</div>
            <h2 className="mt-2 text-3xl sm:text-[34px]">Creator questions</h2>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {[
              { q: "Do I need a big following?", a: "No. Anyone can sell. We find buyers for creators of every size, and that's the only time we take a cut." },
              {
                q: "Can I bring my existing members?",
                a: "Yes. Send them your share link. Anyone who joins through it counts as your buyer at 0%, including every renewal.",
              },
              { q: "Do you own my content?", a: "No. You keep all rights to everything you upload. You give us permission to show and deliver it to your buyers, and you can remove it any time." },
              { q: "Can I sell somewhere else too?", a: "Yes. There's no exclusivity. Sell wherever you like." },
              { q: "How old do I need to be?", a: "You need an account (13 or older) to sell. To receive payouts you need to meet Stripe's rules for your country, which can mean a parent or guardian sets up payouts with you." },
              { q: "What if a buyer wants a refund?", a: "You set a refund window on each product (7 days is the default). You can approve or decline with a reason. If you don't answer in 3 days, our team decides." },
            ].map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex items-center justify-between gap-4 text-[16px] font-semibold">
                  {f.q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[15px] text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="container-tt pt-16">
        <div className="relative overflow-hidden rounded-2xl bg-[#16130F] px-6 py-12 text-[#F2EADB] sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border-[28px] border-[#F2EADB]/[0.06]" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl text-[#F2EADB] sm:text-[40px]">Ready when you are.</h2>
            <p className="mt-4 text-[#F2EADB]/75">Free to start. Set up your page in a couple of minutes.</p>
            <Link href={applyHref} className="btn btn-lg mt-8 bg-[#F2EADB] text-[#16130F] hover:bg-white">
              <Sparkles /> {applyLabel}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
