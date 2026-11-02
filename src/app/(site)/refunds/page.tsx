import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Refund policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy" updated="November 2, 2026" current="/refunds" draft intro="Every listing shows its refund window before you pay. Here's how it works.">
      <Section title="The standard window">
        <ul>
          <li>Most products can be refunded within 7 days of purchase.</li>
          <li>Downloads and indicators can have a shorter window, or none, because they can&apos;t be returned. If so, the listing says it clearly before you buy.</li>
          <li>Memberships: you can cancel any time. A refund for the current period is possible within 7 days of the first payment.</li>
          <li>Mentoring calls: cancel at least 24 hours before the call for a refund or to rebook. No-shows aren&apos;t refunded.</li>
        </ul>
      </Section>
      <Section title="How to ask">
        <ol>
          <li>Go to <Link href="/settings/billing">Purchases</Link> and pick the order.</li>
          <li>Choose &ldquo;Ask for a refund&rdquo; and tell us why.</li>
          <li>The creator has 3 days to answer. If they don&apos;t, or you disagree with their answer, our team decides.</li>
        </ol>
      </Section>
      <Section title="Always refunded">
        <p>Whatever the window, we refund you if a product wasn&apos;t delivered, was very different from its description, or broke the marketplace rules (for example, it promised profits).</p>
      </Section>
      <Section title="Where the money goes">
        <p>Refunds go back to the card you paid with. It usually shows up within 5 to 10 working days, depending on your bank. Access to the product ends when the refund is made.</p>
      </Section>
    </LegalPage>
  );
}
