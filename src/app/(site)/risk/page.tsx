import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Risk disclaimer" };

export default function RiskPage() {
  return (
    <LegalPage title="Risk disclaimer" updated="November 2, 2026" current="/risk" draft intro="Please read this before you buy anything or place a trade.">
      <Section title="Trading is risky">
        <p>
          Trading futures, forex, crypto, stocks, options and other markets carries a high risk of losing money, and can lose more than you put in with leverage. Most people who trade lose money. Only trade money you can afford to lose.
        </p>
      </Section>
      <Section title="Not financial advice">
        <p>
          TraderTrades and the creators on it share education, opinions and their own experience. None of it is personal financial, investment, tax or legal advice. Think about your own situation and talk to a licensed professional if you need advice.
        </p>
      </Section>
      <Section title="Past results">
        <p>
          Past results, including any shown by creators, don&apos;t promise future results. Simulated and backtested results have real limits and may not reflect real trading.
        </p>
      </Section>
      <Section title="Prop firms and brokers">
        <p>
          Companies in the directory are independent. Their rules, prices and terms change often and are set by them. Always read a company&apos;s current terms on its own website before you sign up or pay.
        </p>
      </Section>
    </LegalPage>
  );
}
