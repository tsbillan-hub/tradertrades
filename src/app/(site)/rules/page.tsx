import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Check } from "lucide-react";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { ALLOWED_PRODUCTS, BANNED_PRODUCTS } from "@/lib/constants";

export const metadata: Metadata = { title: "Marketplace rules", description: "What can and can't be sold on TraderTrades, and how we keep it honest." };

export default function RulesPage() {
  return (
    <LegalPage
      title="Marketplace rules"
      updated="November 2, 2026"
      current="/rules"
      draft
      intro="What can be sold on TraderTrades, what can't, and how listings and posts must be written. These rules apply to every creator, every listing and every post."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="kicker mb-3">Allowed</div>
          <ul className="space-y-2 text-sm">
            {ALLOWED_PRODUCTS.map((a) => (
              <li key={a} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-up" />
                {a}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <div className="kicker mb-3">Never allowed</div>
          <ul className="space-y-2 text-sm">
            {BANNED_PRODUCTS.map((b) => (
              <li key={b.title} className="flex gap-2">
                <Ban className="mt-0.5 size-4 shrink-0 text-down" />
                <span>
                  <b>{b.title}.</b> <span className="text-muted">{b.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Section title="1. Who can sell">
        <p>Anyone can join, buy and sell.</p>
        <ul>
          <li>To sell, confirm your email, set up your creator page and agree to these rules. Listings go live as soon as they pass the automatic rules check.</li>
          <li>Breaking these rules can get a listing removed, payouts held and selling switched off for your account.</li>
          <li>You need to be 13 or older to have an account. To get paid out, creators must meet the age rules of our payment partner, Stripe, in their country.</li>
          <li>Businesses sell through featured spots and creator campaigns, not product listings.</li>
        </ul>
      </Section>

      <Section title="2. Honest claims only">
        <ul>
          <li>No promises of income, profits or returns. No &ldquo;guaranteed&rdquo;, &ldquo;risk free&rdquo;, &ldquo;can&apos;t lose&rdquo; or &ldquo;100% win rate&rdquo;.</li>
          <li>Any result you show must be real, yours, and say the time period. Simulated, backtested or demo results must be labelled as such.</li>
          <li>Win rates and P&amp;L screenshots need the full picture. Showing only the winners is misleading and gets listings removed.</li>
        </ul>
        <p>Every listing and post is checked automatically for claims like these when it&apos;s published. Anything that gets reported is looked at by our team.</p>
      </Section>

      <Section title="3. Alert rooms">
        <p>Alert rooms are allowed with strict rules, because this is where trading education goes wrong most often.</p>
        <ul>
          <li>Every alert shows the market, direction, entry, stop, target and the reasoning behind it.</li>
          <li>Alerts are time stamped and locked the moment they&apos;re posted. They can&apos;t be edited or deleted. Updates (target hit, stopped out, closed) are added underneath.</li>
          <li>The full history stays visible to members, wins and losses.</li>
          <li>Alerts are for education. Nothing may place trades in a member&apos;s account automatically.</li>
          <li>No promises about how alerts will perform.</li>
        </ul>
      </Section>

      <Section title="4. Listings">
        <ul>
          <li>Say clearly what&apos;s included, how it&apos;s delivered and how long access lasts.</li>
          <li>Everything you sell must be your own work, or work you have the rights to sell.</li>
          <li>Show your refund window. The default is 7 days. Downloads and indicators can have a shorter window if you say so before purchase.</li>
          <li>Keep payments on TraderTrades. Don&apos;t send buyers elsewhere to pay.</li>
        </ul>
      </Section>

      <Section title="5. Reviews">
        <ul>
          <li>Only people who bought a product can review it.</li>
          <li>No paying, rewarding or pressuring people for reviews. No reviewing your own products.</li>
          <li>Creators and companies can reply to any review in public.</li>
          <li>We remove reviews that break these rules or our community guidelines. We never remove a review because it&apos;s negative.</li>
        </ul>
      </Section>

      <Section title="6. What happens if rules are broken">
        <p>Depending on how serious it is: a warning, a listing taken down, payouts paused, a suspension, or a permanent ban. Buyers who were misled can be refunded from the creator&apos;s balance.</p>
        <p>
          If you think we got something wrong, reply to the email we sent or write to us from the <Link href="/help">help page</Link>. A different person will look at it.
        </p>
      </Section>

      <Section title="7. Report something">
        <p>Every profile, listing, review and post has a Report button. Reports go to a person, usually within a day.</p>
      </Section>
    </LegalPage>
  );
}
