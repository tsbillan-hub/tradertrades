import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { requireUser } from "@/server/dal";
import { retrieveCheckout } from "@/server/stripe";
import { completeFromCheckoutSession } from "@/server/commerce/stripe-sync";
import { productSettings } from "@/lib/product-settings";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { KeyValue } from "@/components/ui/misc";
import { insidePath, productPath } from "@/lib/paths";
import { formatDate, money, orderNumber } from "@/lib/utils";
import type { ProductType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Thanks", robots: { index: false } };

function nextStep(type: ProductType, accessType: string, platform: string) {
  switch (type) {
    case "COMMUNITY":
      return { cta: "Go to the community", tip: "Say hi in the chat and check the pinned posts first." };
    case "COURSE":
      return { cta: "Start the course", tip: "Your progress saves as you go, so you can pick up where you left off." };
    case "MENTORING":
      return { cta: "Book your call", tip: "Pick a time that suits you from the mentor's calendar." };
    case "ALERTS":
      return { cta: "Open the alert room", tip: "Turn on notifications so you see new alerts as they're posted." };
    case "INDICATOR":
      return accessType === "username"
        ? { cta: `Send your ${platform} username`, tip: `Access is added to your ${platform} account once the creator gets your username.` }
        : { cta: "Get your indicator", tip: "Your files and setup guide are waiting inside." };
    case "DOWNLOAD":
      return { cta: "Download your files", tip: "You can download them again any time from your library." };
    case "EVENT":
      return { cta: "See event details", tip: "We'll email you a reminder before it starts." };
  }
}

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: orderId } = await searchParams;
  const user = await requireUser();
  if (!orderId) redirect("/library");

  const load = () =>
    db.order.findUnique({
      where: { id: orderId },
      include: { product: { include: { creator: { select: { username: true, displayName: true } } } }, subscription: true },
    });
  let order = await load();
  if (!order || order.buyerId !== user.id) redirect("/library");

  // If Stripe's webhook hasn't landed yet, ask Stripe directly.
  if (order.status === "PENDING" && order.provider === "STRIPE" && order.stripeCheckoutId && features.stripe) {
    try {
      const session = await retrieveCheckout(order.stripeCheckoutId);
      await completeFromCheckoutSession(session);
      order = (await load())!;
    } catch (err) {
      console.error("[checkout] success page sync", err);
    }
  }

  const product = order.product;
  if (order.status === "PENDING") {
    return (
      <div className="container-tt max-w-lg py-16 text-center">
        <AutoRefresh />
        <LoaderCircle className="mx-auto size-10 animate-spin text-muted" />
        <h1 className="mt-5 text-[28px]">Finishing your payment</h1>
        <p className="mt-2 text-muted">This usually takes a few seconds. You can leave this page; we&apos;ll email your receipt.</p>
      </div>
    );
  }
  if (order.status === "FAILED" || order.status === "CANCELED") {
    return (
      <div className="container-tt max-w-lg py-16 text-center">
        <CircleX className="mx-auto size-10 text-down" />
        <h1 className="mt-5 text-[28px]">The payment didn&apos;t go through</h1>
        <p className="mt-2 text-muted">Nothing was charged. You can try again.</p>
        {product ? (
          <Link href={productPath(product.creator.username, product.slug)} className="btn btn-primary mt-6">
            Back to {product.title}
          </Link>
        ) : null}
      </div>
    );
  }

  const settings = productSettings(product?.settings);
  const step = product ? nextStep(product.type, settings.accessType, settings.indicatorPlatform) : null;
  const trial = order.subscription?.status === "TRIALING";

  return (
    <div className="container-tt max-w-xl py-12 sm:py-16">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-up-soft text-up">
          <CircleCheck className="size-7" />
        </span>
        <h1 className="mt-5 text-[30px]">{order.amountCents ? "Payment received" : trial ? "Your free trial has started" : "You're in"}</h1>
        {product ? (
          <p className="mt-2 text-[15px] text-muted">
            <span className="font-semibold text-ink">{product.title}</span> by {product.creator.displayName} is in your library.
          </p>
        ) : null}
      </div>

      {product && step ? (
        <div className="card mt-8 p-5 text-center">
          <p className="text-sm text-muted">{step.tip}</p>
          <Link href={insidePath(product.creator.username, product.slug)} className="btn btn-primary btn-lg mt-4 w-full sm:w-auto">
            {step.cta}
          </Link>
        </div>
      ) : null}

      <div className="card mt-4 px-5 py-2">
        <KeyValue
          items={[
            { label: "Order", value: <span className="num">{orderNumber(order.number)}</span> },
            { label: "Paid", value: <span className="num">{order.amountCents ? money(order.amountCents, { exact: true }) : "Free"}</span> },
            ...(order.discountCents ? [{ label: "Discount", value: <span className="num">-{money(order.discountCents, { exact: true })}</span> }] : []),
            ...(trial && order.subscription ? [{ label: "First payment", value: formatDate(order.subscription.currentPeriodEnd) }] : []),
            ...(order.paidAt ? [{ label: "Date", value: formatDate(order.paidAt) }] : []),
            ...(product && order.amountCents && product.refundDays
              ? [{ label: "Refunds until", value: formatDate(new Date(order.paidAt!.getTime() + product.refundDays * 86400_000)) }]
              : []),
          ]}
        />
      </div>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/library" className="btn btn-secondary">
          Your library
        </Link>
        <Link href="/settings/billing" className="btn btn-ghost">
          Purchases and receipts
        </Link>
      </div>
    </div>
  );
}
