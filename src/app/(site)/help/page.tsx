import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CreditCard, LifeBuoy, Mail, ShieldAlert, Sparkles, UserRound } from "lucide-react";
import { env } from "@/lib/env";
import { SUPPORT_TOPICS } from "@/lib/constants";
import { HOLD_DAYS, NEW_SELLER_HOLD_DAYS } from "@/lib/fees";
import { getViewer } from "@/server/dal";
import { contactSupport } from "@/server/actions/support";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";

export const metadata: Metadata = { title: "Help", description: "Answers about buying, selling, accounts and business listings on TraderTrades." };

type QA = { q: string; a: React.ReactNode };

const GROUPS: { id: string; title: string; icon: typeof CreditCard; items: QA[] }[] = [
  {
    id: "buying",
    title: "Buying",
    icon: CreditCard,
    items: [
      {
        q: "Where do I find what I bought?",
        a: (
          <>
            Everything you buy is in <Link href="/library">your library</Link>: communities, courses, downloads, indicator access and booked calls. Receipts and
            subscriptions are in <Link href="/settings/billing">Billing</Link>.
          </>
        ),
      },
      {
        q: "How do refunds work?",
        a: (
          <>
            Each product shows its refund window before you buy (most are 7 days). Ask from your purchases page with a short reason. The creator answers first; if
            they don&apos;t within 3 days, or you disagree, our team decides. Full details are in the <Link href="/refunds">refund policy</Link>.
          </>
        ),
      },
      {
        q: "How do I cancel a subscription?",
        a: (
          <>
            Go to <Link href="/settings/billing">Billing</Link> and press Cancel. You keep access until the end of the period you already paid for, and you won&apos;t
            be charged again.
          </>
        ),
      },
      {
        q: "Is my card safe?",
        a: "Payments go through Stripe. We never see or store your full card number.",
      },
      {
        q: "Do I need to be 18 to buy?",
        a: "No. You need to be 13 or older to have an account. If you're under 18, check with a parent or guardian before buying anything.",
      },
    ],
  },
  {
    id: "selling",
    title: "Selling",
    icon: Sparkles,
    items: [
      {
        q: "How do I start selling?",
        a: (
          <>
            Make an account, confirm your email, then press <Link href="/creator/start">Start selling</Link>. Set up your creator page, add a product and publish it.
            It goes live straight away if it passes the automatic rules check.
          </>
        ),
      },
      {
        q: "What can I sell, and what's not allowed?",
        a: (
          <>
            Communities, courses, mentoring calls, alert rooms, indicators, downloads and live events. Copy trading, account management, profit sharing,
            challenge passing and any profit promise are banned. See the <Link href="/rules">marketplace rules</Link>.
          </>
        ),
      },
      {
        q: "What are the fees?",
        a: (
          <>
            0% on buyers who come through your own link. 30% on the first purchase of a buyer TraderTrades finds for you, then 5% on their later purchases. Card
            processing is extra and the same for everyone. Try the calculator on the <Link href="/fees">fees page</Link>.
          </>
        ),
      },
      {
        q: "When do I get paid?",
        a: `Money from each sale is held for ${HOLD_DAYS} days (${NEW_SELLER_HOLD_DAYS} days for your first 60 days), then paid to your bank weekly through Stripe.`,
      },
      {
        q: "How do I get the badges on my profile?",
        a: (
          <>
            They&apos;re optional. Go to <Link href="/settings/verification">Settings, then Verification</Link> to ask for an ID check, or prove your socials are
            yours by posting a code we give you.
          </>
        ),
      },
    ],
  },
  {
    id: "account",
    title: "Your account",
    icon: UserRound,
    items: [
      {
        q: "I didn't get the confirmation email",
        a: (
          <>
            Check spam first. You can send a new link from the <Link href="/verify-email">confirm email page</Link>. If your email was wrong, change it in{" "}
            <Link href="/settings/account">account settings</Link>.
          </>
        ),
      },
      {
        q: "How do I turn on two-step sign in?",
        a: (
          <>
            In <Link href="/settings/security">Security</Link>, scan the code with an authenticator app (Google Authenticator, 1Password, Authy and others work) and
            save your backup codes somewhere safe.
          </>
        ),
      },
      {
        q: "I lost my phone and my backup codes",
        a: "Contact us using the form below from the email on your account. We'll check it's really you before switching two-step sign in off, which can take a few days.",
      },
      {
        q: "How do I download or delete my data?",
        a: (
          <>
            Both are in <Link href="/settings/privacy">Privacy</Link>. Deleting your account removes your profile and signs you out everywhere. Order records are kept
            as the law requires.
          </>
        ),
      },
    ],
  },
  {
    id: "business",
    title: "Businesses",
    icon: Building2,
    items: [
      {
        q: "Our company is listed. How do we take it over?",
        a: (
          <>
            Open your listing and press &ldquo;Claim this listing&rdquo;, or <Link href="/business/claim">find it here</Link>. We send a code to an email on your
            company&apos;s domain. Once confirmed, you can edit details, reply to reviews, post offers and videos, and add teammates. See{" "}
            <Link href="/for-business">TraderTrades for business</Link>.
          </>
        ),
      },
      {
        q: "We don't have an email at our company's domain.",
        a: "Choose \u201cSend documents\u201d on the claim page instead, with something that shows you work there (a letter on company paper, or a business registration with your name). Only our team sees it, we usually answer within 2 working days, and we delete the documents once we've decided.",
      },
      {
        q: "How do creator campaigns work?",
        a: (
          <>
            Post a brief from your business dashboard, or invite creators directly. When you agree a price with a creator, you pay it into the deal plus our 10% fee. The
            creator makes the content and sends you the links. You approve it (or ask for changes), and then they&apos;re paid. If nobody answers within 7 days of the work
            arriving, it&apos;s approved automatically. Creators can browse open campaigns on the <Link href="/campaigns">campaigns page</Link>.
          </>
        ),
      },
      {
        q: "What if a creator doesn't deliver, or we disagree?",
        a: "The money stays held in the deal until the work is approved. If the creator pulls out, you get it all back, our fee included. If you can't agree, either side can ask our team to step in from the deal page: we look at both sides, then pay the creator, refund you, or let the deal carry on.",
      },
      {
        q: "Can we post jobs?",
        a: (
          <>
            Yes, for free, as yourself or as your company. Editors, clippers, moderators, closers, developers and more are on the <Link href="/jobs">jobs board</Link>. Job
            posts can&apos;t ask applicants to pay anything, and they close on their own after 60 days.
          </>
        ),
      },
      {
        q: "Can we remove a bad review?",
        a: "No. You can reply publicly, and you can report a review that breaks the community guidelines (for example, it's fake or about a different company). A person checks every report.",
      },
      {
        q: "How do Sponsored spots work?",
        a: (
          <>
            You pay a weekly price to appear at the top of a directory category or on the home page, always labelled &ldquo;Sponsored&rdquo;. Prices are on the{" "}
            <Link href="/for-business#featured">business page</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: "safety",
    title: "Safety and reports",
    icon: ShieldAlert,
    items: [
      {
        q: "Someone is promising profits or running a scam",
        a: "Press Report on their profile, product, post or message. Reports go straight to our team, and we act on rule breaks quickly, including removing listings and holding payouts.",
      },
      {
        q: "Someone is messaging me and I want it to stop",
        a: (
          <>
            Block them from the conversation menu. You can also choose who can message you in <Link href="/settings/notifications">Notifications</Link>.
          </>
        ),
      },
      {
        q: "Someone is pretending to be me",
        a: "Report the profile and pick \"Pretending to be someone else\". Getting your socials verified also shows people which account is really yours.",
      },
    ],
  },
];

export default async function HelpPage() {
  const viewer = await getViewer();
  return (
    <div>
      <section className="border-b border-line">
        <div className="container-tt py-12 sm:py-16">
          <div className="flex items-center gap-2 text-accent">
            <LifeBuoy className="size-5" />
            <span className="kicker text-accent">Help</span>
          </div>
          <h1 className="mt-3 text-[38px] sm:text-[48px]">How can we help?</h1>
          <p className="mt-3 max-w-xl text-muted">Quick answers to the common questions. If yours isn&apos;t here, send us a message at the bottom of the page.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="chip">
                <g.icon className="size-3.5" />
                {g.title}
              </a>
            ))}
            <a href="#contact" className="chip">
              <Mail className="size-3.5" />
              Contact us
            </a>
          </div>
        </div>
      </section>

      <div className="container-tt space-y-14 pt-12">
        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-24 grid gap-6 lg:grid-cols-[260px_1fr]">
            <div>
              <span className="grid size-10 place-items-center rounded-xl bg-sunk">
                <g.icon className="size-5" />
              </span>
              <h2 className="mt-3 text-2xl">{g.title}</h2>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {g.items.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex items-center justify-between gap-4 text-[16px] font-semibold">
                    {f.q}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="prose-tt mt-3 max-w-2xl text-[15px] text-muted">{f.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section id="contact" className="scroll-mt-24 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div>
            <span className="grid size-10 place-items-center rounded-xl bg-sunk">
              <Mail className="size-5" />
            </span>
            <h2 className="mt-3 text-2xl">Contact us</h2>
            <p className="mt-2 text-sm text-muted">
              A person reads every message. You can also email{" "}
              <a className="link" href={`mailto:${env.supportEmail}`}>
                {env.supportEmail}
              </a>
              .
            </p>
          </div>
          <div className="card max-w-2xl p-5 sm:p-6">
            <ActionForm action={contactSupport} resetOnSuccess className="space-y-4">
              <FormMessage />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" name="name">
                  <Input name="name" defaultValue={viewer?.displayName ?? ""} autoComplete="name" required maxLength={80} />
                </Field>
                <Field label="Email" name="email" hint="We reply here.">
                  <Input name="email" type="email" defaultValue={viewer?.email ?? ""} autoComplete="email" required />
                </Field>
              </div>
              <Field label="Topic" name="topic">
                <Select name="topic" defaultValue="">
                  <option value="" disabled>
                    Pick one
                  </option>
                  {SUPPORT_TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Message" name="message" hint="Include order numbers (like TT-10042) or links if you have them.">
                <Textarea name="message" rows={6} maxLength={5000} required />
              </Field>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <SubmitButton pendingText="Sending">Send message</SubmitButton>
            </ActionForm>
          </div>
        </section>
      </div>
    </div>
  );
}
