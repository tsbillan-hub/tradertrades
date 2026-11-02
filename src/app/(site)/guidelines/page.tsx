import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Community guidelines" };

export default function GuidelinesPage() {
  return (
    <LegalPage title="Community guidelines" updated="November 2, 2026" current="/guidelines" draft intro="For communities, comments, reviews and messages. Short version: be useful, be honest, be decent.">
      <Section title="Be honest">
        <ul>
          <li>Post real trades and real results. Say when something is a demo, a sim or a backtest.</li>
          <li>No pumping coins or stocks, no paid promotion without saying it&apos;s paid.</li>
        </ul>
      </Section>
      <Section title="Be decent">
        <ul>
          <li>No harassment, hate, threats or bullying. Disagree with ideas, not people.</li>
          <li>No sharing other people&apos;s private information.</li>
          <li>No sexual content. TraderTrades is open to teens.</li>
        </ul>
      </Section>
      <Section title="Keep it on TraderTrades">
        <ul>
          <li>Don&apos;t ask people to pay you outside the site, or for their account logins.</li>
          <li>Never send money to someone who messages you offering to trade for you or pass your challenge. It&apos;s a scam. Report it.</li>
        </ul>
      </Section>
      <Section title="No spam">
        <p>No repeated posts, mass messages, or links to things you&apos;re selling in other people&apos;s communities.</p>
      </Section>
      <Section title="Creators run their communities">
        <p>Creators can remove posts and members in their own communities, as long as they follow these guidelines too.</p>
      </Section>
    </LegalPage>
  );
}
