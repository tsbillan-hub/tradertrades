import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { CHANGE_CUTOFF_HOURS, hoursUntil, openSlots } from "@/server/bookings";
import { Notice } from "@/components/ui/misc";
import { SlotPicker } from "@/components/bookings/slot-picker";
import { MoveForm } from "@/components/bookings/forms";
import { MessageButton } from "@/components/message-button";
import { productSettings } from "@/lib/product-settings";
import { formatClock, formatDay, formatTime, formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Move call", robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string; slot?: string }> };

export default async function MoveCallPage({ params, searchParams }: Props) {
  const [{ id }, { day, slot }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      product: { select: { title: true, settings: true } },
      mentor: { select: { id: true, displayName: true } },
      buyer: { select: { id: true, displayName: true } },
    },
  });
  if (!b || (b.mentorId !== user.id && b.buyerId !== user.id)) notFound();
  const asMentor = b.mentorId === user.id;
  const other = asMentor ? b.buyer : b.mentor;
  const tz = user.timezone;
  const back = `/calls/${b.id}`;

  const blocked =
    b.status !== "CONFIRMED"
      ? "This call can't be moved anymore."
      : hoursUntil(b.startsAt) <= 0
        ? "This call has already started."
        : !asMentor && hoursUntil(b.startsAt) < CHANGE_CUTOFF_HOURS
          ? `Calls can only be moved up to ${CHANGE_CUTOFF_HOURS} hours before. Message ${other.displayName} if something came up.`
          : null;

  const { slots } = blocked ? { slots: [] } : await openSlots({ mentorId: b.mentorId, settings: productSettings(b.product.settings), excludeBookingId: b.id });
  const choices = slots.filter((s) => s.start.getTime() !== b.startsAt.getTime());

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to the call
      </Link>
      <h1 className="mt-4 text-2xl sm:text-3xl">Move your call with {other.displayName}</h1>
      <p className="mt-1 text-sm text-muted">
        Now: {formatWhen(b.startsAt, tz)} · {b.product.title}
      </p>

      {blocked ? (
        <Notice tone="warn" className="mt-6" title={blocked}>
          <div className="mt-2">
            <MessageButton
              toId={other.id}
              toName={other.displayName}
              subject={`Our call on ${formatWhen(b.startsAt, tz)}`}
              variant="secondary"
              className="btn-sm"
            />
          </div>
        </Notice>
      ) : (
        <div className="card mt-6 p-5 sm:p-6">
          <SlotPicker
            slots={choices}
            timeZone={tz}
            path={`/calls/${b.id}/move`}
            day={day}
            slot={slot}
            empty={
              asMentor
                ? "No other open times. Add weekly hours or remove time off in your calendar."
                : `${b.mentor.displayName} has no other open times right now. Message them to find a time.`
            }
            confirm={(picked) => (
              <MoveForm
                bookingId={b.id}
                startsAt={picked.start.toISOString()}
                summary={`${formatDay(picked.start, tz)} · ${formatClock(picked.start, tz)} to ${formatTime(picked.end, tz)}`}
              />
            )}
          />
          {asMentor ? <p className="mt-5 text-xs text-faint">These are your open times. {b.buyer.displayName} gets an email with the new time.</p> : null}
        </div>
      )}
    </div>
  );
}
