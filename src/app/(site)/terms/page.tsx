import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="November 2, 2026" current="/terms" draft intro="These terms are the agreement between you and TraderTrades when you use the site. We've tried to keep them short and plain.">
      <Section title="1. Your account">
        <ul>
          <li>You must be at least 13 to make an account. If you&apos;re under the age of majority where you live, a parent or guardian must agree to these terms for you, and should help with any purchase.</li>
          <li>Give accurate information and keep your password safe. You&apos;re responsible for what happens on your account.</li>
          <li>One person, one personal account. Businesses can add their team to a company page.</li>
        </ul>
      </Section>
      <Section title="2. What TraderTrades is">
        <p>
          TraderTrades is a marketplace and a directory. Creators sell their own education, communities and tools. Companies in the directory are independent businesses. We check creators and listings, but we are not a broker, an investment adviser or a party to your trading.
        </p>
        <p>
          Nothing on TraderTrades is financial advice. Read the <Link href="/risk">risk disclaimer</Link>.
        </p>
      </Section>
      <Section title="3. Buying">
        <ul>
          <li>When you buy, you get access to what the listing describes, for as long as it says (for example, lifetime access to a course, or while a membership is active).</li>
          <li>Prices are shown before you pay. Taxes may be added where required.</li>
          <li>Memberships renew automatically until you cancel. You can cancel any time from your purchases page and keep access until the end of the period you paid for.</li>
          <li>Refunds follow the <Link href="/refunds">refund policy</Link> and the window shown on each listing.</li>
          <li>Access is for you alone. Don&apos;t share logins, re-upload, resell or redistribute content.</li>
        </ul>
      </Section>
      <Section title="4. Selling">
        <ul>
          <li>Creators must follow the <Link href="/rules">marketplace rules</Link>. We can remove listings and switch off selling for accounts that break them.</li>
          <li>You keep ownership of what you make. You give TraderTrades permission to host, show and promote it on and off the site to sell it.</li>
          <li>Fees are described on the <Link href="/fees">fees page</Link>. Payouts are made through Stripe and you agree to Stripe&apos;s connected account terms.</li>
          <li>You are responsible for your own taxes, and for any licences your country requires for what you teach or sell.</li>
          <li>Buyers who were misled or didn&apos;t get what was described can be refunded from your balance.</li>
        </ul>
      </Section>
      <Section title="5. Businesses">
        <ul>
          <li>Directory listings are written from public information and may be claimed by the company. A claimed listing must stay accurate.</li>
          <li>Sponsored spots are always labelled Sponsored. Paying for a spot never changes reviews or ratings.</li>
          <li>Campaign deals are agreements between the business and the creator. Creators must label paid promotion as an ad wherever they post it.</li>
        </ul>
      </Section>
      <Section title="6. Content and conduct">
        <p>
          Follow the <Link href="/guidelines">community guidelines</Link>. You&apos;re responsible for what you post. We may remove content or limit accounts that break these terms or the law.
        </p>
      </Section>
      <Section title="7. Our liability">
        <p>
          We work hard to keep TraderTrades safe and accurate, but the site is provided &ldquo;as is&rdquo;. To the extent the law allows, TraderTrades isn&apos;t liable for trading losses, for what creators or companies say or sell, or for indirect losses. Where we are liable, our total liability is limited to what you paid us in the 12 months before the claim.
        </p>
      </Section>
      <Section title="8. Ending things">
        <p>You can delete your account any time from settings. We may suspend or close accounts that break these terms. Purchases you made stay valid unless the account was closed for fraud.</p>
      </Section>
      <Section title="9. Changes">
        <p>We&apos;ll update these terms as TraderTrades grows. If a change matters, we&apos;ll tell you by email or on the site before it takes effect.</p>
      </Section>
    </LegalPage>
  );
}
