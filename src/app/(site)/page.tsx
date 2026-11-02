import Link from "next/link";
import { ArrowRight, Ban, LayoutGrid, MessageSquareQuote, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { BANNED_PRODUCTS, CATEGORIES, PRODUCT_TYPES } from "@/lib/constants";
import { money } from "@/lib/utils";
import { Hero } from "@/components/home/hero";
import { ProductCard } from "@/components/market/product-card";
import { CategoryIcon } from "@/components/category-icon";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { Avatar } from "@/components/ui/avatar";
import { TrustBadges } from "@/components/market/badges";
import { popularProducts, publicProductWhere, productCardInclude } from "@/server/queries/products";
import { feeExample } from "@/lib/fees";
import { categoryCounts, sponsoredFor } from "@/server/queries/directory";
import { CompanyRow } from "@/components/directory/company-row";
import type { CompanyCategory } from "@/generated/prisma/enums";

export default async function HomePage() {
  const [productCount, companyCount, creatorCount, popular, counts, featuredCreator, sponsored] = await Promise.all([
    db.product.count({ where: publicProductWhere }),
    db.company.count({ where: { status: "PUBLISHED" } }),
    db.creatorProfile.count({ where: { status: "APPROVED" } }),
    popularProducts(8),
    categoryCounts(),
    db.user.findFirst({
      where: { username: "tris", creator: { status: "APPROVED" } },
      include: {
        creator: true,
        products: { where: publicProductWhere, include: productCardInclude, orderBy: { salesCount: "desc" }, take: 3 },
      },
    }),
    sponsoredFor("HOME"),
  ]);
  const countFor = (c: CompanyCategory) => counts.get(c) ?? 0;
  const own = feeExample(10000, "OWN_AUDIENCE");
  const first = feeExample(10000, "MARKETPLACE_FIRST");
  const repeat = feeExample(10000, "MARKETPLACE_REPEAT");

  return (
    <>
      <Hero productCount={productCount} companyCount={companyCount} creatorCount={creatorCount} />

      {/* Trust strip */}
      <section className="border-b border-line bg-card">
        <div className="container-tt grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: LayoutGrid, title: "Everything in one place", body: "Communities, courses, calls, alerts and indicators with one account and one library." },
            { icon: MessageSquareQuote, title: "Reviews from buyers", body: "Product reviews come from people who paid for it." },
            { icon: RotateCcw, title: "Refund window shown", body: "Every product shows its refund window before you buy." },
            { icon: ShieldCheck, title: "No profit promises", body: "Income claims, 'risk free' and 'guaranteed' aren't allowed." },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <f.icon className="mt-0.5 size-5 shrink-0 text-accent" />
              <div>
                <div className="text-sm font-bold">{f.title}</div>
                <p className="mt-0.5 text-sm text-muted">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Marketplace */}
      <section className="container-tt pt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="kicker">Marketplace</div>
            <h2 className="mt-2 text-3xl sm:text-[34px]">Popular right now</h2>
          </div>
          <Link href="/marketplace" className="btn btn-secondary">
            See everything <ArrowRight />
          </Link>
        </div>
        <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {PRODUCT_TYPES.map((t) => (
            <Link key={t.value} href={`/marketplace?type=${t.slug}`} className="chip shrink-0">
              <ProductTypeIcon type={t.value} className="size-3.5" />
              {t.plural}
            </Link>
          ))}
        </div>
        {popular.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="card p-10 text-center text-sm text-muted">The first listings are being reviewed. Check back soon.</div>
        )}
      </section>

      {/* Featured creator */}
      {featuredCreator ? (
        <section className="container-tt pt-16">
          <div className="card overflow-hidden lg:grid lg:grid-cols-[380px_1fr]">
            <div className="relative bg-[#16130F] p-7 text-[#F2EADB]">
              <div className="text-xs font-bold tracking-[0.08em] text-[#F2EADB]/60 uppercase">Featured creator</div>
              <div className="mt-5 flex items-center gap-4">
                <Avatar src={featuredCreator.avatarUrl} name={featuredCreator.displayName} size={64} />
                <div>
                  <div className="font-display text-2xl font-extrabold tracking-tight">{featuredCreator.displayName}</div>
                  <div className="text-sm text-[#F2EADB]/70">@{featuredCreator.username}</div>
                </div>
              </div>
              {featuredCreator.creator?.headline ? <p className="mt-5 text-[15px] leading-relaxed text-[#F2EADB]/85">{featuredCreator.creator.headline}</p> : null}
              <TrustBadges who={featuredCreator} className="mt-5 [&_.badge]:border-[#F2EADB]/20 [&_.badge]:text-[#F2EADB]" />
              <Link href={`/@${featuredCreator.username}`} className="btn mt-7 bg-[#F2EADB] text-[#16130F] hover:bg-white">
                Visit profile <ArrowRight />
              </Link>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {featuredCreator.products.map((p) => (
                <ProductCard key={p.id} product={p} compact />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Directory */}
      <section className="container-tt pt-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="kicker">Directory</div>
            <h2 className="mt-2 text-3xl sm:text-[34px]">Compare the tools traders actually use</h2>
            <p className="mt-2 text-muted">Prop firms, brokers, platforms, journals and more, with reviews from real users. Listings are free and companies can claim theirs.</p>
          </div>
          <Link href="/directory" className="btn btn-secondary">
            Open the directory <ArrowRight />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <Link key={c.value} href={`/directory/${c.slug}`} className="card card-hover group flex items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sunk text-ink transition-colors group-hover:bg-primary group-hover:text-primary-ink">
                <CategoryIcon category={c.value} className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-bold">{c.label}</span>
                  <span className="num text-xs text-faint">{countFor(c.value)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{c.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
        {sponsored.length ? (
          <ul className="mt-4 grid gap-3 lg:grid-cols-2" aria-label="Sponsored">
            {sponsored.map((s) => (
              <CompanyRow key={s.slotId} company={s.company} from="sponsored:home" sponsored showCategory />
            ))}
          </ul>
        ) : null}
      </section>

      {/* Fees for creators */}
      <section className="container-tt pt-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <div className="kicker">For creators</div>
            <h2 className="mt-2 text-3xl sm:text-[34px]">Your followers are yours. We only earn when we bring you someone new.</h2>
            <p className="mt-4 text-muted">
              Share your own link and pay nothing to us on those sales, forever. If someone finds you through TraderTrades, we take 30% of their first purchase and
              5% after that. Card fees are the same for everyone.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup?as=creator" className="btn btn-primary">
                <Sparkles /> Start selling
              </Link>
              <Link href="/fees" className="btn btn-secondary">
                Full fee breakdown
              </Link>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-line bg-sunk px-5 py-3 text-sm font-semibold">On a {money(10000)} sale, you get</div>
            {[
              { label: "A buyer from your own link", ex: own, note: "0% to TraderTrades" },
              { label: "A buyer we found, first purchase", ex: first, note: "30% to TraderTrades" },
              { label: "That same buyer, every purchase after", ex: repeat, note: "5% to TraderTrades" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-0">
                <div>
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-xs text-muted">
                    {r.note} · card fee {money(r.ex.processingFeeCents, { exact: true })}
                  </div>
                </div>
                <div className="num text-2xl font-semibold">{money(r.ex.sellerNetCents, { exact: true })}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="container-tt pt-20">
        <div className="card p-6 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <div className="kicker">The rules</div>
              <h2 className="mt-2 text-3xl sm:text-[34px]">What you&apos;ll never find here</h2>
              <p className="mt-4 text-muted">
                These are banned outright. Every listing is checked for them automatically when it&apos;s published, and reports go straight to our team.
              </p>
              <Link href="/rules" className="btn btn-secondary mt-6">
                Read the marketplace rules
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {BANNED_PRODUCTS.map((b) => (
                <li key={b.title} className="rounded-xl border border-line p-4">
                  <div className="flex items-center gap-2 font-bold">
                    <Ban className="size-4 text-down" />
                    {b.title}
                  </div>
                  <p className="mt-1.5 text-sm text-muted">{b.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-tt pt-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="kicker">Questions</div>
            <h2 className="mt-2 text-3xl sm:text-[34px]">Good to know</h2>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {[
              {
                q: "Who sells on TraderTrades?",
                a: "Traders and trading educators sell their communities, courses, mentoring calls, alert rooms and indicators here. Every creator has a profile with their products, videos and buyer reviews, so you can see what you're getting before you pay.",
              },
              {
                q: "Can anyone leave a review?",
                a: "Product reviews come only from people who bought the product. For companies in the directory, anyone with an account can review, and reviews with proof (like a payout certificate) get a 'Proof checked' tag.",
              },
              {
                q: "What if I want a refund?",
                a: "Most products have a 7 day refund window, shown on the product page before you buy. You ask from your purchases page and the creator or our team decides within 3 days.",
              },
              {
                q: "Do I need to be 18?",
                a: "No. You need to be 13 or older to make an account. Creators getting paid out need to meet Stripe's age rules for payouts.",
              },
              {
                q: "Is this financial advice?",
                a: "No. Creators share education and their own views. Trading carries a high risk of losing money, so only trade what you can afford to lose.",
              },
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

      {/* Final CTA */}
      <section className="container-tt pt-20">
        <div className="relative overflow-hidden rounded-2xl bg-[#16130F] px-6 py-12 text-[#F2EADB] sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border-[28px] border-[#F2EADB]/[0.06]" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl text-[#F2EADB] sm:text-[40px]">Find what helps you trade better.</h2>
            <p className="mt-4 text-[#F2EADB]/75">Free to join. Pay only for what you buy.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-lg bg-[#F2EADB] text-[#16130F] hover:bg-white">
                Create free account
              </Link>
              <Link href="/signup?as=creator" className="btn btn-lg border-[#F2EADB]/25 text-[#F2EADB] hover:bg-[#F2EADB]/10">
                I&apos;m a creator
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
