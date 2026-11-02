import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, FlaskConical, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/server/dal";
import { cancelPendingOrder, payTestOrder } from "@/server/actions/checkout";
import { ActionButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { productPath } from "@/lib/paths";
import { money, orderNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

export default async function TestCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser();
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { product: { include: { creator: { select: { username: true, displayName: true } } } }, price: true, company: { select: { name: true, slug: true } } },
  });
  if (!order || order.buyerId !== user.id || order.provider !== "TEST" || !env.demoMode) redirect("/library");
  if (order.status !== "PENDING") redirect(`/checkout/success?order=${order.id}`);
  // Businesses pay for Sponsored spots and campaign deals through the same test card page.
  const business = order.kind === "FEATURED" || order.kind === "CAMPAIGN";
  const back =
    order.kind === "FEATURED" && order.company
      ? `/business/${order.company.slug}/featured`
      : order.kind === "CAMPAIGN" && order.dealId
        ? `/deals/${order.dealId}`
        : order.product
          ? productPath(order.product.creator.username, order.product.slug)
          : "/marketplace";
  const seller = business ? `Paying as ${order.company?.name ?? "your company"}` : order.product?.creator.displayName;

  return (
    <div className="container-tt max-w-md py-10 sm:py-14">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-sunk/60 px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4" /> Test checkout
          </span>
          <span className="num text-xs text-muted">{orderNumber(order.number)}</span>
        </div>
        <div className="p-5 sm:p-6">
          <div className="text-sm text-muted">{seller}</div>
          <div className="mt-0.5 font-semibold">{order.description}</div>
          <div className="num mt-3 text-3xl font-semibold">{money(order.amountCents, { exact: true })}</div>

          <Notice tone="warn" className="mt-5" title="Preview mode">
            {business ? (
              <>
                This is how paying works before Stripe is connected. No card is charged and no real money moves. Everything after it (
                {order.kind === "FEATURED" ? "the spot going live on its week" : "the deal starting, the money held until you approve"}, receipts) works for real.
              </>
            ) : (
              <>
                This is how paying works before Stripe is connected. No card is charged and no real money moves. Everything after it (access,
                receipts, fees, the creator&apos;s sales) works for real.
              </>
            )}
          </Notice>

          <div className="mt-5 space-y-3" aria-hidden>
            <div>
              <div className="label">Card number</div>
              <div className="input flex items-center gap-2 text-muted">
                <CreditCard className="size-4" />
                <span className="num">4242 4242 4242 4242</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label">Expiry</div>
                <div className="input num text-muted">12 / 34</div>
              </div>
              <div>
                <div className="label">CVC</div>
                <div className="input num text-muted">123</div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-2">
            <ActionButton action={payTestOrder} fields={{ orderId: order.id }} variant="primary" size="lg" className="w-full">
              <Lock /> Pay {money(order.amountCents, { exact: true })} (test)
            </ActionButton>
            <ActionButton action={cancelPendingOrder} fields={{ orderId: order.id, back }} variant="ghost" size="md" className="w-full">
              Cancel
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
