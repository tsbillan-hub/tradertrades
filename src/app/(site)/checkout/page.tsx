import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, FlaskConical, Lock, RotateCcw, Tag } from "lucide-react";
import { env, features } from "@/lib/env";
import { requireUser } from "@/server/dal";
import { paymentPath, quoteCheckout, sellerCanTakeCards } from "@/server/commerce/checkout";
import { payNow } from "@/server/actions/checkout";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Notice } from "@/components/ui/misc";
import { GeneratedCover } from "@/components/market/cover";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { INTERVAL_LABEL, productTypeInfo } from "@/lib/constants";
import { insidePath, productPath } from "@/lib/paths";
import { daysFromNow, formatDate, money, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type Props = { searchParams: Promise<{ p?: string; price?: string; code?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const { p, price, code } = await searchParams;
  const user = await requireUser();
  if (!p) redirect("/marketplace");

  const res = await quoteCheckout(user, p, price, code);
  if (!res.ok) {
    const prod = res.product;
    return (
      <div className="container-tt max-w-xl py-14">
        <EmptyState
          title={res.ownsIt ? "You already have this" : "This can't be bought right now"}
          description={res.error}
          action={
            prod ? (
              <>
                {res.ownsIt ? (
                  <Link href={insidePath(prod.creator.username, prod.slug)} className="btn btn-primary">
                    Open it
                  </Link>
                ) : null}
                <Link href={productPath(prod.creator.username, prod.slug)} className="btn btn-secondary">
                  Back to the listing
                </Link>
              </>
            ) : (
              <Link href="/marketplace" className="btn btn-secondary">
                Browse the marketplace
              </Link>
            )
          }
        />
      </div>
    );
  }

  const q = res.quote;
  const product = q.product;
  const seller = product.creator;
  const info = productTypeInfo(product.type);
  const path = paymentPath(q);
  const recurring = q.price.interval !== "ONE_TIME";
  const back = productPath(seller.username, product.slug);
  const sellerReady = path !== "stripe" || sellerCanTakeCards(seller.creator);
  const trialEnds = q.trial ? daysFromNow(q.price.trialDays) : null;
  const payLabel =
    q.amountCents === 0
      ? q.trial
        ? `Start ${q.price.trialDays} day free trial`
        : product.type === "COMMUNITY"
          ? "Join for free"
          : "Get it for free"
      : `Pay ${money(q.amountCents, { exact: true })}`;

  return (
    <div className="container-tt max-w-5xl py-8 sm:py-12">
      <Link href={back} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Back to {product.title}
      </Link>
      <h1 className="mt-3 text-[28px] sm:text-[32px]">Checkout</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div className="card flex gap-4 p-4 sm:p-5">
            <div className="w-28 shrink-0 overflow-hidden rounded-lg ring-1 ring-line sm:w-36">
              {product.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.coverUrl} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <GeneratedCover title={product.title} type={product.type} seed={product.id} className="aspect-video w-full" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ProductTypeIcon type={product.type} className="size-3.5" />
                {info.label}
              </div>
              <div className="mt-1 font-semibold leading-snug">{product.title}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                <Avatar src={seller.avatarUrl} name={seller.displayName} size={18} />
                {seller.displayName}
              </div>
              <div className="mt-2 text-sm">
                <span className="font-medium">{q.price.label}</span>
                <span className="text-muted">
                  {recurring ? `, ${INTERVAL_LABEL[q.price.interval]}` : ""}
                  {q.price.sessions ? `, ${plural(q.price.sessions, "call")}` : ""}
                </span>
                {product.prices.length > 1 ? (
                  <Link href={back} className="link ml-2 text-xs">
                    Change
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {q.topUp ? <Notice tone="info" title="Adding more calls">You already have calls with {seller.displayName}. These are added to the ones you have left.</Notice> : null}

          {!q.trial && q.price.amountCents > 0 ? (
            <form action="/checkout" method="get" className="card p-4 sm:p-5">
              <input type="hidden" name="p" value={product.id} />
              <input type="hidden" name="price" value={q.price.id} />
              <label htmlFor="code" className="label flex items-center gap-1.5">
                <Tag className="size-3.5" /> Discount code
              </label>
              <div className="flex gap-2">
                <input id="code" name="code" defaultValue={code ?? ""} className="input uppercase" placeholder="CODE" maxLength={30} autoComplete="off" />
                <button type="submit" className="btn btn-secondary shrink-0">
                  Apply
                </button>
              </div>
              {q.couponError ? <p className="field-error">{q.couponError}</p> : null}
              {q.coupon ? (
                <p className="mt-1.5 text-sm font-medium text-up">
                  {q.coupon.code} applied: {money(q.discountCents, { exact: true })} off{recurring ? " your first payment" : ""}.
                </p>
              ) : null}
            </form>
          ) : null}

          <div className="card space-y-2 p-4 text-sm text-muted sm:p-5">
            <div className="flex items-start gap-2">
              <RotateCcw className="mt-0.5 size-4 shrink-0" />
              <span>
                {product.refundDays > 0
                  ? `You can ask for a refund within ${product.refundDays} days from your purchases page.`
                  : "This product can't be refunded once bought, because it can't be returned."}{" "}
                <Link href="/refunds" className="link">
                  Refund policy
                </Link>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                {path === "stripe"
                  ? "Card details are handled by Stripe. We never see or store your card number."
                  : path === "test"
                    ? "Preview mode: the next screen is a test checkout. No card is charged."
                    : "No card needed."}
              </span>
            </div>
          </div>
        </div>

        <aside>
          <div className="card sticky top-24 p-5">
            <h2 className="text-lg">Summary</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{q.price.label}</dt>
                <dd className="num font-medium">{q.price.amountCents === 0 ? "Free" : money(q.price.amountCents, { exact: true })}</dd>
              </div>
              {q.trial ? (
                <div className="flex justify-between gap-4 text-up">
                  <dt>{q.price.trialDays} day free trial</dt>
                  <dd className="num font-medium">-{money(q.price.amountCents, { exact: true })}</dd>
                </div>
              ) : null}
              {q.discountCents ? (
                <div className="flex justify-between gap-4 text-up">
                  <dt>Code {q.coupon?.code}</dt>
                  <dd className="num font-medium">-{money(q.discountCents, { exact: true })}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-line pt-3 text-base">
                <dt className="font-semibold">Due today</dt>
                <dd className="num font-semibold">{money(q.amountCents, { exact: true })}</dd>
              </div>
              {recurring ? (
                <p className="text-xs text-muted">
                  {q.trial && trialEnds
                    ? `Then ${money(q.price.amountCents, { exact: true })} ${INTERVAL_LABEL[q.price.interval]} from ${formatDate(trialEnds)}. Cancel before then and you won't be charged.`
                    : `Then ${money(q.price.amountCents, { exact: true })} ${INTERVAL_LABEL[q.price.interval]} until you cancel. Cancel any time.`}
                </p>
              ) : null}
            </dl>

            {!sellerReady ? (
              <Notice tone="warn" className="mt-4" title="Not taking payments yet">
                {seller.displayName} hasn&apos;t finished setting up payouts. Try again later.
              </Notice>
            ) : path === "off" ? (
              <Notice tone="warn" className="mt-4" title="Payments are off">
                Card payments aren&apos;t switched on yet. Please try again soon.
              </Notice>
            ) : (
              <ActionForm action={payNow} className="mt-5 space-y-3">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="priceId" value={q.price.id} />
                <input type="hidden" name="code" value={q.coupon?.code ?? ""} />
                <FormMessage />
                <SubmitButton size="lg" className="w-full" pendingText="One moment...">
                  {path === "test" && q.amountCents > 0 ? <FlaskConical /> : <Lock />}
                  {payLabel}
                </SubmitButton>
              </ActionForm>
            )}
            <p className="mt-4 text-xs leading-relaxed text-muted">
              By continuing you agree to the{" "}
              <Link href="/terms" className="link">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/refunds" className="link">
                Refund policy
              </Link>
              . This is trading education from {seller.displayName}, not financial advice.
            </p>
            {!features.stripe && env.demoMode ? (
              <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">Preview mode is on, so no real money moves anywhere.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
