"use client";

import { CalendarCheck, CalendarX2 } from "lucide-react";
import { ModalButton } from "@/components/ui/client";
import { ActionForm, Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { bookCall, cancelCall, moveCall, saveCallNotes } from "@/server/actions/bookings";

/** Confirms a picked time: what you want to work on, then book. */
export function BookForm({ productId, startsAt, summary, mentorFirstName }: { productId: string; startsAt: string; summary: string; mentorFirstName: string }) {
  return (
    <ActionForm action={bookCall} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <div>
        <div className="text-xs font-semibold text-muted uppercase">Your call</div>
        <div className="mt-0.5 font-semibold">{summary}</div>
      </div>
      <Field
        label={`What do you want to work on with ${mentorFirstName}?`}
        name="intake"
        optional
        hint="A few lines helps them prepare. For example your market, your setup and where you get stuck."
      >
        <Textarea name="intake" rows={3} maxLength={1000} />
      </Field>
      <FormMessage />
      <SubmitButton pendingText="Booking...">
        <CalendarCheck /> Confirm booking
      </SubmitButton>
    </ActionForm>
  );
}

/** Confirms moving an existing call to the picked time. */
export function MoveForm({ bookingId, startsAt, summary }: { bookingId: string; startsAt: string; summary: string }) {
  return (
    <ActionForm action={moveCall} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <div>
        <div className="text-xs font-semibold text-muted uppercase">New time</div>
        <div className="mt-0.5 font-semibold">{summary}</div>
      </div>
      <FormMessage />
      <SubmitButton pendingText="Moving...">
        <CalendarCheck /> Move my call here
      </SubmitButton>
    </ActionForm>
  );
}

/** Cancel a call, with an optional reason for the other person. Closes once done. */
export function CancelCallButton({ bookingId, otherName, asMentor }: { bookingId: string; otherName: string; asMentor: boolean }) {
  return (
    <ModalButton
      variant="ghost"
      label={
        <>
          <CalendarX2 /> Cancel call
        </>
      }
      title="Cancel this call?"
    >
      {(close) => (
        <ActionForm action={cancelCall} onSuccess={close} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="text-sm text-ink-2">
            {asMentor
              ? `${otherName} gets the call back to book another time, and we'll let them know.`
              : `The call goes back into your account so you can book another time. We'll let ${otherName} know.`}
          </p>
          <Field label={`Message for ${otherName}`} name="reason" optional>
            <Textarea name="reason" rows={3} maxLength={500} placeholder="Sorry, something came up." />
          </Field>
          <FormMessage hideSuccess />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Keep the call
            </button>
            <SubmitButton variant="danger">Cancel call</SubmitButton>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/** The mentor's notes on a call. */
export function CallNotesForm({
  bookingId,
  mentorNotes,
  summary,
  buyerFirstName,
}: {
  bookingId: string;
  mentorNotes: string | null;
  summary: string | null;
  buyerFirstName: string;
}) {
  return (
    <ActionForm action={saveCallNotes} className="space-y-4" toastOnSuccess>
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field
        label={`Notes for ${buyerFirstName}`}
        name="summary"
        optional
        hint={`${buyerFirstName} sees these on this page and gets an email the first time you add them.`}
      >
        <Textarea name="summary" rows={8} maxLength={5000} defaultValue={summary ?? ""} placeholder={"What we covered\n\n- \n\nYour homework\n\n- "} />
      </Field>
      <Field label="Private notes" name="mentorNotes" optional hint="Only you see these.">
        <Textarea name="mentorNotes" rows={3} maxLength={5000} defaultValue={mentorNotes ?? ""} />
      </Field>
      <FormMessage hideSuccess />
      <SubmitButton>Save notes</SubmitButton>
    </ActionForm>
  );
}
