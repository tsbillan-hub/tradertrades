import type { Metadata } from "next";
import { BadgePercent } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { createCoupon, deleteCoupon, toggleCoupon } from "@/server/actions/coupons";
import { ActionButton, ActionForm, Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/client";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { cn, formatDate, money } from "@/lib/utils";

export const metadata: Metadata = { title: "Discount codes" };

export default async function CouponsPage() {
  const user = await requireCreator();
  const [coupons, products] = await Promise.all([
    db.coupon.findMany({ where: { creatorId: user.id }, include: { product: { select: { title: true } } }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    db.product.findMany({ where: { creatorId: user.id, status: { not: "ARCHIVED" } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Discount codes" description="Codes buyers type at checkout. On memberships, a code takes money off the first payment." />

      <Panel title="New code">
        <ActionForm action={createCoupon} toastOnSuccess resetOnSuccess refreshOnSuccess className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Code" name="code" hint="What buyers type, like LAUNCH20.">
              <Input name="code" maxLength={20} className="uppercase" placeholder="LAUNCH20" autoComplete="off" />
            </Field>
            <Field label="Discount" name="value">
              <div className="flex gap-2">
                <Input name="value" inputMode="decimal" placeholder="20" className="min-w-0" />
                <Select name="kind" id="coupon-kind" aria-label="Discount type" defaultValue="percent" className="w-28 shrink-0">
                  <option value="percent">% off</option>
                  <option value="amount">$ off</option>
                </Select>
              </div>
            </Field>
            <Field label="Works on" name="productId">
              <Select name="productId" defaultValue="">
                <option value="">All my products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Max uses" name="maxRedemptions" optional>
              <Input name="maxRedemptions" type="number" min={1} placeholder="No limit" />
            </Field>
            <Field label="Last day" name="expiresAt" optional>
              <Input name="expiresAt" type="date" />
            </Field>
          </div>
          <FormMessage hideSuccess />
          <SubmitButton>Create code</SubmitButton>
        </ActionForm>
      </Panel>

      {coupons.length ? (
        <ul className="card divide-y divide-line">
          {coupons.map((c) => {
            const expired = c.expiresAt && c.expiresAt < now;
            const usedUp = c.maxRedemptions != null && c.redemptions >= c.maxRedemptions;
            const live = c.active && !expired && !usedUp;
            return (
              <li key={c.id} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", !live && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-semibold tracking-wide">{c.code}</span>
                    <span className="badge badge-outline">{c.percentOff ? `${c.percentOff}% off` : `${money(c.amountOffCents ?? 0, { exact: true })} off`}</span>
                    <span className={cn("badge", live ? "badge-ok" : "badge-outline")}>{live ? "Active" : expired ? "Expired" : usedUp ? "Used up" : "Off"}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {c.product ? c.product.title : "All products"} · used {c.redemptions}
                    {c.maxRedemptions != null ? ` of ${c.maxRedemptions}` : ""} times
                    {c.expiresAt ? ` · until ${formatDate(c.expiresAt)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <CopyButton value={c.code} small label="Copy" />
                  <ActionButton action={toggleCoupon} fields={{ couponId: c.id }} variant="ghost">
                    {c.active ? "Turn off" : "Turn on"}
                  </ActionButton>
                  <ActionButton action={deleteCoupon} fields={{ couponId: c.id }} variant="ghost" confirm={`Delete ${c.code}?`}>
                    Delete
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<BadgePercent />} title="No codes yet" description="Make one for a launch, a live stream or your community." />
      )}
    </div>
  );
}
