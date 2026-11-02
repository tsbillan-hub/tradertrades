import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2, 2026" current="/privacy" draft intro="What we collect, why, and what you can do about it. We don't sell your data.">
      <Section title="What we collect">
        <ul>
          <li><b>Account details:</b> name, username, email, password (stored scrambled, never readable), and what you add to your profile.</li>
          <li><b>Purchases and sales:</b> what you bought or sold, amounts and dates. Card details go straight to Stripe. We never see or store your full card number.</li>
          <li><b>Verification:</b> ID photos you send for an ID check. A person checks them, and the photos are deleted once we decide. We keep the result and your legal name.</li>
          <li><b>What you post:</b> reviews, posts, comments, messages and uploads.</li>
          <li><b>Usage and devices:</b> pages you visit, the device and browser you use, your IP address, and sign-in history, to keep accounts safe and stop abuse.</li>
        </ul>
      </Section>
      <Section title="Why we use it">
        <ul>
          <li>To run your account, deliver what you buy and pay creators.</li>
          <li>To keep people safe: checking creators, stopping fraud, spam and scams.</li>
          <li>To send emails you asked for (receipts, messages, bookings). You choose which ones in <Link href="/settings/notifications">settings</Link>.</li>
          <li>To work out who brought a buyer, so creators are charged the right fee.</li>
        </ul>
      </Section>
      <Section title="Who sees it">
        <ul>
          <li>Your public profile, reviews and public posts can be seen by anyone.</li>
          <li>Creators see the name and username of people who buy from them, and members of their communities.</li>
          <li>Service providers who help us run the site: hosting (Vercel), database (Neon), payments (Stripe), email (Resend), video calls (Daily or Jitsi). They only use data to provide their service.</li>
          <li>Authorities, when the law requires it.</li>
        </ul>
      </Section>
      <Section title="Cookies">
        <p>We use a few cookies: one to keep you signed in, one to remember your theme, and one that remembers which creator&apos;s link you came from (for 30 days). No advertising cookies.</p>
      </Section>
      <Section title="Your choices">
        <ul>
          <li>Download everything we have about you from <Link href="/settings/privacy">Privacy and data</Link>.</li>
          <li>Edit or delete your profile and posts any time.</li>
          <li>Delete your account. We keep records of payments for as long as tax law requires, without your name attached.</li>
        </ul>
      </Section>
      <Section title="Younger users">
        <p>Accounts are for people 13 and older. If you think a child under 13 has an account, tell us and we&apos;ll remove it.</p>
      </Section>
      <Section title="Contact">
        <p>Questions about privacy? Write to us from the <Link href="/help">help page</Link>.</p>
      </Section>
    </LegalPage>
  );
}
