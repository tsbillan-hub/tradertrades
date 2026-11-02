import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand";
import { CATEGORIES, PRODUCT_TYPES } from "@/lib/constants";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      ...PRODUCT_TYPES.slice(0, 5).map((t) => ({ href: `/marketplace?type=${t.slug}`, label: t.plural })),
      { href: "/creators", label: "All creators" },
    ],
  },
  {
    title: "Directory",
    links: [
      ...CATEGORIES.slice(0, 6).map((c) => ({ href: `/directory/${c.slug}`, label: c.label })),
      { href: "/directory", label: "All categories" },
    ],
  },
  {
    title: "Creators",
    links: [
      { href: "/sell", label: "Sell on TraderTrades" },
      { href: "/fees", label: "Fees" },
      { href: "/rules", label: "Marketplace rules" },
      { href: "/creator", label: "Creator dashboard" },
      { href: "/campaigns", label: "Paid brand campaigns" },
      { href: "/jobs", label: "Jobs board" },
    ],
  },
  {
    title: "Business",
    links: [
      { href: "/for-business", label: "TraderTrades for business" },
      { href: "/business/claim", label: "Claim your listing" },
      { href: "/for-business#featured", label: "Sponsored spots" },
      { href: "/for-business#campaigns", label: "Creator campaigns" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/help", label: "Help" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/risk", label: "Risk disclaimer" },
      { href: "/refunds", label: "Refund policy" },
      { href: "/guidelines", label: "Community guidelines" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-card">
      <div className="container-tt py-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <LogoMark className="size-9" />
              <Wordmark className="h-[18px] w-auto text-ink" />
            </div>
            <p className="mt-4 text-sm text-muted">
              The marketplace built for traders. Communities, courses, mentoring and tools from trading creators, plus a directory of prop firms, brokers and platforms.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <div className="kicker mb-3">{col.title}</div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink-2 hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-muted">
          <p className="max-w-4xl">
            Trading futures, forex, crypto, stocks and options carries a high risk of losing money and isn&apos;t right for everyone. Nothing on
            TraderTrades is financial advice. Creators share education and their own views. Past results don&apos;t promise future results.{" "}
            <Link href="/risk" className="link">
              Read the full risk disclaimer
            </Link>
            .
          </p>
          <p className="mt-3">© {new Date().getFullYear()} TraderTrades. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
