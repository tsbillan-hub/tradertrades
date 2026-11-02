"use client";

import { useState } from "react";
import { feeExample } from "@/lib/fees";
import { money } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TYPES = [
  { v: "OWN_AUDIENCE", l: "From my link" },
  { v: "MARKETPLACE_FIRST", l: "Found by TraderTrades (1st)" },
  { v: "MARKETPLACE_REPEAT", l: "Found by TraderTrades (repeat)" },
] as const;

export function FeeCalculator() {
  const [price, setPrice] = useState("99");
  const [type, setType] = useState<(typeof TYPES)[number]["v"]>("OWN_AUDIENCE");
  const cents = Math.max(0, Math.round((Number(price.replace(/[^\d.]/g, "")) || 0) * 100));
  const ex = feeExample(cents, type);
  return (
    <div className="card overflow-hidden">
      <div className="grid gap-4 border-b border-line p-5 sm:grid-cols-[180px_1fr]">
        <label className="block">
          <span className="label">Price</span>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">$</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="input num pl-7" aria-label="Price in dollars" />
          </div>
        </label>
        <div>
          <span className="label">Where the buyer came from</span>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button key={t.v} type="button" onClick={() => setType(t.v)} data-active={type === t.v} className={cn("chip")}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <dl className="divide-y divide-line text-sm">
        <div className="flex justify-between px-5 py-3">
          <dt className="text-muted">Buyer pays</dt>
          <dd className="num font-semibold">{money(ex.amountCents, { exact: true })}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-muted">TraderTrades fee ({ex.feeBps / 100}%)</dt>
          <dd className="num">−{money(ex.platformFeeCents, { exact: true })}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-muted">Card processing (2.9% + 30¢, estimate)</dt>
          <dd className="num">−{money(ex.processingFeeCents, { exact: true })}</dd>
        </div>
        <div className="flex items-center justify-between bg-sunk px-5 py-4">
          <dt className="font-semibold">You get</dt>
          <dd className="num text-2xl font-semibold">{money(ex.sellerNetCents, { exact: true })}</dd>
        </div>
      </dl>
    </div>
  );
}
