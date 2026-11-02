import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { FeeCalculator } from "@/components/fees/calculator";
import { FEATURED_PRICES, HOLD_DAYS, NEW_SELLER_HOLD_DAYS, NEW_SELLER_PERIOD_DAYS } from "@/lib/fees";
import { money } from "@/lib/utils";

export const metadata: Metadata = { title: "Fees", description: "0% on buyers you bring. 30% on the first purchase of buyers we find, then 5%." };

export default function FeesPage() {
  return (
    <LegalPage
      title="Fees"
      updated="November 2, 2026"
      current="/fees"
      intro={
        <>
          Joining, browsing and buying are free. Creators pay nothing to us on buyers they bring. We only take a cut when TraderTrades brings you a new buyer.
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { big: "0%", label: "Buyers from your own link", note: "Forever, on every purchase they make from you." },
          { big: "30%", label: "First purchase of a buyer we found", note: "When someone finds you through TraderTrades." },
          { big: "5%", label: "Every purchase after that", note: "Same buyer, any of your products, for good." },
        ].map((c) => (
          <div key={c.big} className="card p-5">
            <div className="num text-4xl font-semibold">{c.big}</div>
            <div className="mt-2 font-semibold">{c.label}</div>
            <p className="mt-1 text-sm text-muted">{c.note}</p>
          </div>
        ))}
      </div>

      <FeeCalculator />

      <Section title="How we know who brought the buyer">
        <ul>
          <li>Every creator gets a share link (tradertrades.com/r/yourname). Adding ?ref=yourname to any TraderTrades link works too.</li>
          <li>When someone arrives through your link, we remember it on their device for 30 days. If they buy from you in that time, they count as your buyer, at 0%, and stay yours for every future purchase.</li>
          <li>If a buyer finds you on TraderTrades without your link (search, the marketplace, another page), their first purchase from you is 30% and every purchase after is 5%.</li>
          <li>Whoever brought the buyer first counts. Your dashboard shows where every buyer came from.</li>
          <li>Subscriptions follow the same rule: the first payment of a buyer we found is 30%, each renewal is 5%. Your own buyers&apos; renewals are 0%.</li>
        </ul>
      </Section>

      <Section title="Card processing">
        <p>
          Card payments go through Stripe. Their fee (about 2.9% + 30¢ for US cards, more for some international cards and currency conversion) comes out of each sale, the same way for everyone. We don&apos;t add anything on top.
        </p>
      </Section>

      <Section title="Getting paid">
        <ul>
          <li>Money from a sale is held for {HOLD_DAYS} days so refunds can be handled, then it&apos;s ready to pay out.</li>
          <li>For your first {NEW_SELLER_PERIOD_DAYS} days as a creator, the hold is {NEW_SELLER_HOLD_DAYS} days.</li>
          <li>Payouts go to your bank every week through Stripe.</li>
          <li>Refunds come out of your balance. If a refund is because of a broken rule, we may also hold payouts while we check.</li>
        </ul>
      </Section>

      <Section title="For businesses">
        <ul>
          <li>Your directory listing is free. Claim it to edit details, reply to reviews and post offers.</li>
          <li>Featured spots are labelled &ldquo;Sponsored&rdquo;: {money(FEATURED_PRICES.CATEGORY)} a week for the top of a directory category, {money(FEATURED_PRICES.HOME)} a week on the home page.</li>
          <li>Creator campaigns: you pay the agreed price plus a 10% platform fee. The creator gets the agreed price, minus card processing.</li>
          <li>Job posts are free.</li>
        </ul>
        <p>
          Questions? <Link href="/help">Contact us</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
