import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { REFUND_ANSWER_DAYS, REFUND_REASONS, refundWindow } from "@/server/commerce/refunds";
import { askForRefund, askTeamToReview, cancelSubscription, resumeSubscription } from "@/server/actions/billing";
import { Panel } from "@/components/ui/panel";
import { ActionButton, ActionForm, Field, FormMessage, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import { EmptyState } from "@/components/ui/misc";
import { INTERVAL_LABEL } from "@/lib/constants";
import { productPath } from "@/lib/paths";
import { cn, daysFromNow, formatDate, money, orderNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Purchases" };

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  PAID: { label: "Paid", tone: "badge-ok" },
  REFUNDED: { label: "Refunded", tone: "badge-outline" },
  PARTIALLY_REFUNDED: { label: "Part refunded", tone: "badge-outline" },
  DISPUTED: { label: "Disputed", tone: "badge-bad" },
  PENDING: { label: "Not finished", tone: "badge-warn" },
  FAILED: { label: "Failed", tone: "badge-bad" },
  CANCELED: { label: "Canceled", tone: "badge-outline" },
};

export default async function BillingPage() {
  const user = await requireUser();
  const [subs, orders] = await Promise.all([
    db.subscription.findMany({
      where: { buyerId: user.id, OR: [{ status: { not: "CANCELED" } }, { canceledAt: { gte: daysFromNow(-90) } }] },
      include: { product: { include: { creator: { select: { username: true, displayName: true } } } }, price: true },
      orderBy: { createdAt: "desc" },
    }),
    db.order.findMany({
      where: { buyerId: user.id, status: { in: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"] } },
      include: {
        product: { select: { title: true, slug: true, refundDays: true, creator: { select: { username: true, displayName: true } } } },
        refunds: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const windows = await Promise.all(orders.map((o) => refundWindow(o, o.product)));

  return (
    <>
      <Panel title="Memberships" description="Communities and alert rooms you pay for regularly. Canceling keeps your access until the end of the period you paid for.">
        {subs.length ? (
          <ul className="-my-2 divide-y divide-line">
            {subs.map((s) => {
              const ended = s.status === "CANCELED";
              return (
                <li key={s.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={productPath(s.product.creator.username, s.product.slug)} className="font-semibold hover:underline">
                      {s.product.title}
                    </Link>
                    <div className="mt-0.5 text-sm text-muted">
                      {money(s.price.amountCents, { exact: true })} {INTERVAL_LABEL[s.price.interval]} · {s.product.creator.displayName}
                    </div>
                    <div className={cn("mt-1 text-sm", s.status === "PAST_DUE" ? "text-down" : "text-ink-2")}>
                      {ended
                        ? `Ended ${formatDate(s.canceledAt ?? s.currentPeriodEnd)}`
                        : s.status === "PAST_DUE"
                          ? "Your last payment failed. Update your card from the payment email to keep access."
                          : s.cancelAtPeriodEnd
                            ? `Canceled. Access until ${formatDate(s.currentPeriodEnd)}`
                            : s.status === "TRIALING"
                              ? `Free trial. First payment ${formatDate(s.currentPeriodEnd)}`
                              : `Renews ${formatDate(s.currentPeriodEnd)}`}
                    </div>
                  </div>
                  {!ended ? (
                    s.cancelAtPeriodEnd ? (
                      <ActionButton action={resumeSubscription} fields={{ subscriptionId: s.id }}>
                        Keep my membership
                      </ActionButton>
                    ) : (
                      <ActionButton
                        action={cancelSubscription}
                        fields={{ subscriptionId: s.id }}
                        variant="ghost"
                        confirm={`Cancel ${s.product.title}? You keep access until ${formatDate(s.currentPeriodEnd)}.`}
                      >
                        Cancel membership
                      </ActionButton>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No memberships.</p>
        )}
      </Panel>

      <Panel title="Orders" description={`Ask for a refund within the window shown on each order. The creator has ${REFUND_ANSWER_DAYS} days to answer, then our team decides.`}>
        {orders.length ? (
          <ul className="-my-2 divide-y divide-line">
            {orders.map((o, i) => {
              const st = STATUS_LABEL[o.status] ?? { label: o.status, tone: "badge-outline" };
              const refund = o.refunds[0];
              const w = windows[i];
              return (
                <li key={o.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{o.product?.title ?? o.description}</div>
                      <div className="mt-0.5 text-sm text-muted">
                        <span className="num">{orderNumber(o.number)}</span> · {formatDate(o.paidAt ?? o.createdAt)}
                        {o.product ? ` · ${o.product.creator.displayName}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("badge", st.tone)}>{st.label}</span>
                      <span className="num font-semibold">{o.amountCents ? money(o.amountCents, { exact: true }) : "Free"}</span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    {refund ? (
                      <RefundState refund={refund} />
                    ) : w.open ? (
                      <>
                        <span className="text-muted">Refund window open until {formatDate(w.until)}.</span>
                        <ModalButton label="Ask for a refund" title="Ask for a refund" variant="secondary" className="btn-sm">
                          <ActionForm action={askForRefund} className="space-y-4" refreshOnSuccess>
                            <input type="hidden" name="orderId" value={o.id} />
                            <p className="text-sm text-muted">
                              {o.product?.title} · {money(o.amountCents - o.refundedCents, { exact: true })}
                            </p>
                            <Field label="Why?" name="reason">
                              <Select name="reason" defaultValue="">
                                <option value="" disabled>
                                  Pick a reason
                                </option>
                                {REFUND_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Anything else the creator should know?" name="details" optional>
                              <Textarea name="details" rows={4} maxLength={2000} />
                            </Field>
                            <FormMessage />
                            <SubmitButton>Send request</SubmitButton>
                          </ActionForm>
                        </ModalButton>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Receipt />}
            title="No orders yet"
            description="Receipts for everything you buy show up here."
            action={
              <Link href="/marketplace" className="btn btn-secondary">
                Browse the marketplace
              </Link>
            }
            className="border-0 shadow-none"
          />
        )}
      </Panel>
    </>
  );
}

function RefundState({
  refund,
}: {
  refund: { id: string; status: string; amountCents: number; createdAt: Date; decisionNote: string | null; escalatedAt: Date | null; processedAt: Date | null };
}) {
  const due = new Date(refund.createdAt.getTime() + REFUND_ANSWER_DAYS * 86400_000);
  if (refund.status === "PROCESSED") {
    return <span className="text-up">Refunded {money(refund.amountCents, { exact: true })} on {formatDate(refund.processedAt)}.</span>;
  }
  if (refund.escalatedAt) {
    return <span className="text-muted">Refund request is with the TraderTrades team. We&apos;ll email you our decision.</span>;
  }
  if (refund.status === "DENIED") {
    return (
      <>
        <span className="text-ink-2">The creator didn&apos;t approve the refund{refund.decisionNote ? `: "${refund.decisionNote}"` : "."}</span>
        <ActionButton action={askTeamToReview} fields={{ refundId: refund.id }}>
          Ask TraderTrades to review
        </ActionButton>
      </>
    );
  }
  const overdue = due < new Date();
  return (
    <>
      <span className="text-muted">Refund requested. {overdue ? "The creator didn't answer in time." : `The creator has until ${formatDate(due)} to answer.`}</span>
      {overdue ? (
        <ActionButton action={askTeamToReview} fields={{ refundId: refund.id }}>
          Ask TraderTrades to decide
        </ActionButton>
      ) : null}
    </>
  );
}
