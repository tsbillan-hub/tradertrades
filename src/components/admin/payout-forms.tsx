"use client";

import { CirclePause, Scale } from "lucide-react";
import { ActionForm, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/client";
import { adjustBalance, pauseCreatorPayouts } from "@/server/actions/payouts";

export function PausePayoutsButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ModalButton
      label={
        <>
          <CirclePause /> Pause payouts
        </>
      }
      title={`Pause payouts for ${name}`}
      className="btn-sm"
    >
      {(close) => (
        <ActionForm action={pauseCreatorPayouts} onSuccess={close} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <p className="text-sm text-ink-2">Their sales keep coming in and stay on their balance. Nothing goes to their bank until you restart payouts.</p>
          <Field name="reason" label="Why" hint="They see this in the email and on their payouts page.">
            <Textarea rows={3} maxLength={300} placeholder="For example: we're checking a run of refund requests on your alert room." />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton variant="danger" pendingText="Pausing">
            <CirclePause /> Pause payouts
          </SubmitButton>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function AdjustBalanceButton({ userId, name, stripe }: { userId: string; name: string; stripe: boolean }) {
  return (
    <ModalButton
      label={
        <>
          <Scale /> Adjust balance
        </>
      }
      title={`Adjust ${name}'s balance`}
      className="btn-sm"
      variant="ghost"
    >
      {(close) => (
        <ActionForm action={adjustBalance} onSuccess={close} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <p className="text-sm text-ink-2">
            {stripe
              ? "A credit is sent from the TraderTrades Stripe balance to their Stripe account straight away. To take money back, refund the order it came from."
              : "Adds money to their balance, ready to pay out now. Use a minus sign to take money off. (Preview mode: no real money moves.)"}
          </p>
          <Field name="amount" label="Amount in USD" hint={stripe ? "For example 25 or 12.50" : "For example 25, or -12.50 to take money off"}>
            <Input inputMode="decimal" className="max-w-[160px]" placeholder="25.00" />
          </Field>
          <Field name="reason" label="Reason" hint="They see this on their payouts page and in the email.">
            <Input maxLength={200} placeholder="Goodwill credit for the checkout outage on Nov 3" />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton pendingText="Saving">
            <Scale /> Save
          </SubmitButton>
        </ActionForm>
      )}
    </ModalButton>
  );
}
