"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { addAlertUpdate, createAlert } from "@/server/actions/community";
import { cn } from "@/lib/utils";

/** The creator's alert form. Every field the rules ask for is required. */
export function AlertComposer({ channelId }: { channelId: string }) {
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  return (
    <ActionForm action={createAlert} resetOnSuccess refreshOnSuccess toastOnSuccess className="card space-y-4 p-4 sm:p-5">
      <input type="hidden" name="channelId" value={channelId} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base">New alert</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> Locked once posted
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Market" name="symbol" hint="Like NQ, ES, EURUSD or BTC/USD">
          <Input name="symbol" maxLength={20} autoComplete="off" className="uppercase" placeholder="NQ" />
        </Field>
        <fieldset>
          <legend className="label">Direction</legend>
          <div className="mt-1 inline-flex rounded-lg border border-line bg-card p-0.5">
            {(["LONG", "SHORT"] as const).map((d) => (
              <label
                key={d}
                className={cn(
                  "cursor-pointer rounded-md px-4 py-2 text-sm font-semibold",
                  direction === d ? (d === "LONG" ? "bg-up text-white" : "bg-down text-white") : "text-ink-2 hover:bg-hover",
                )}
              >
                <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />
                {d === "LONG" ? "Long" : "Short"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Entry" name="entry">
          <Input name="entry" inputMode="decimal" autoComplete="off" />
        </Field>
        <Field label="Stop" name="stop">
          <Input name="stop" inputMode="decimal" autoComplete="off" />
        </Field>
        <Field label="Target" name="target">
          <Input name="target" inputMode="decimal" autoComplete="off" />
        </Field>
      </div>
      <Field label="Reasoning" name="reasoning" hint="Why this trade: the setup, the level, what would prove it wrong.">
        <Textarea name="reasoning" rows={4} maxLength={2000} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="confirm" className="checkbox mt-0.5" />
        <span>I understand this alert is time stamped and can&apos;t be edited or deleted. Wins and losses stay in the history.</span>
      </label>
      <FormMessage hideSuccess />
      <div className="flex justify-end">
        <SubmitButton pendingText="Posting...">Post alert</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AlertUpdateForm({ postId }: { postId: string }) {
  return (
    <ActionForm action={addAlertUpdate} resetOnSuccess refreshOnSuccess toastOnSuccess className="grid gap-2 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-start">
      <input type="hidden" name="postId" value={postId} />
      <Select name="state" defaultValue="OPEN" aria-label="What happened">
        <option value="OPEN">Note (still open)</option>
        <option value="TARGET_HIT">Target hit</option>
        <option value="STOPPED">Stopped out</option>
        <option value="CLOSED">Closed early</option>
        <option value="CANCELED">Canceled (never filled)</option>
      </Select>
      <div className="min-w-0">
        <Input name="note" maxLength={500} placeholder="What happened, like 'moved stop to break even'" aria-label="Update note" />
        <FormMessage hideSuccess className="mt-2" />
      </div>
      <SubmitButton variant="secondary" size="md">
        Add update
      </SubmitButton>
    </ActionForm>
  );
}
