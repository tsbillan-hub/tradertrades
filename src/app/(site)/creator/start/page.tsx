import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban, Sparkles } from "lucide-react";
import { ActionForm, Field, FieldError, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { startSelling } from "@/server/actions/creator";
import { requireVerifiedUser } from "@/server/dal";
import { BANNED_PRODUCTS, MARKETS, PRODUCT_TYPES } from "@/lib/constants";

export const metadata: Metadata = { title: "Start selling" };

export default async function StartSellingPage() {
  const user = await requireVerifiedUser();
  if (user.creator?.status === "APPROVED") redirect("/creator");
  const blocked = user.creator?.status === "SUSPENDED" || user.creator?.status === "REJECTED";
  const markets = user.creator?.markets?.length ? user.creator.markets : user.markets;

  return (
    <div className="container-tt max-w-2xl py-10 sm:py-14">
      <div className="kicker">Start selling</div>
      <h1 className="mt-2 text-[30px] sm:text-[36px]">Set up your creator page</h1>
      <p className="mt-2 text-muted">Takes a couple of minutes. There&apos;s nothing to wait for: you can add your first product as soon as you&apos;re done.</p>

      {blocked ? (
        <Notice tone="bad" title="Selling is switched off for this account" className="mt-8">
          If you think that&apos;s a mistake, <Link href="/help#contact" className="link">contact us</Link>.
        </Notice>
      ) : (
        <ActionForm action={startSelling} className="card mt-8 space-y-7 p-6 sm:p-8">
          <Field label="What do you teach, in one line?" name="headline" hint="Shown under your name. For example: NQ scalping with order flow, live every morning.">
            <Input name="headline" defaultValue={user.creator?.headline ?? ""} maxLength={100} placeholder="What you teach and who it's for" />
          </Field>

          <fieldset>
            <legend className="label">Markets you teach</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MARKETS.map((m) => (
                <label key={m.value} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                  <input type="checkbox" name="markets" value={m.value} defaultChecked={markets.includes(m.value)} className="sr-only" />
                  {m.label}
                </label>
              ))}
            </div>
            <FieldError name="markets" />
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
            <Field label="Your style" name="tradingStyle" optional hint="Scalping, ICT, order flow, swing...">
              <Input name="tradingStyle" defaultValue={user.creator?.tradingStyle ?? ""} maxLength={60} />
            </Field>
            <Field label="Years trading" name="yearsTrading" optional>
              <Input name="yearsTrading" type="number" min={0} max={60} inputMode="numeric" defaultValue={user.creator?.yearsTrading ?? ""} />
            </Field>
          </div>

          <fieldset>
            <legend className="label">What do you want to sell first?</legend>
            <p className="hint -mt-1 mb-3">Optional. We&apos;ll open that product type for you next. You can sell all of them.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRODUCT_TYPES.map((t) => (
                <label key={t.value} className="tile">
                  <input type="radio" name="firstProduct" value={t.value} className="checkbox radio mt-0.5" />
                  <span className="flex items-start gap-2">
                    <ProductTypeIcon type={t.value} className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span>
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block text-xs text-muted">{t.blurb}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-line bg-sunk p-4">
            <div className="text-sm font-semibold">Never allowed on TraderTrades</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {BANNED_PRODUCTS.map((b) => (
                <li key={b.title} className="flex gap-2">
                  <Ban className="mt-0.5 size-4 shrink-0 text-down" />
                  <span>{b.title}</span>
                </li>
              ))}
            </ul>
            <label className="mt-4 flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="rules" className="checkbox mt-0.5" />
              <span>
                I&apos;ve read the{" "}
                <Link href="/rules" target="_blank" className="link">
                  marketplace rules
                </Link>{" "}
                and I&apos;ll follow them.
              </span>
            </label>
            <FieldError name="rules" />
          </div>

          <FormMessage />
          <SubmitButton size="lg" pendingText="Setting up">
            <Sparkles /> Start selling
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
