import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CalendarPlus, CheckCircle2, Clock, Star, UserX, Video } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/server/dal";
import { CHANGE_CUTOFF_HOURS, JOIN_EARLY_MIN, JOIN_LATE_MIN, hoursUntil, joinState } from "@/server/bookings";
import { markCall } from "@/server/actions/bookings";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/client";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Notice } from "@/components/ui/misc";
import { MessageButton } from "@/components/message-button";
import { CallNotesForm, CancelCallButton } from "@/components/bookings/forms";
import { formatClock, formatDay, formatTime, formatWhen, zoneName } from "@/lib/time";
import { insidePath, productPath } from "@/lib/paths";
import { minutesLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Call", robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string; moved?: string }> };

/** "in 3 days", "in 2 hours", "in 12 minutes". */
function startsIn(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `in ${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.round(min / 60);
  if (h < 36) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `in ${d} days`;
}

export default async function CallPage({ params, searchParams }: Props) {
  const [{ id }, { booked, moved }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, title: true, slug: true } },
      mentor: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      buyer: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      entitlement: { select: { sessionsTotal: true, sessionsUsed: true, status: true } },
    },
  });
  if (!b || (b.mentorId !== user.id && b.buyerId !== user.id)) notFound();

  const asMentor = b.mentorId === user.id;
  const other = asMentor ? b.buyer : b.mentor;
  const firstName = (name: string) => name.split(" ")[0];
  const tz = user.timezone;
  const now = new Date();
  const minutes = Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000);
  const confirmed = b.status === "CONFIRMED";
  const join = joinState(b.startsAt, b.endsAt, now);
  const untilStart = b.startsAt.getTime() - now.getTime();
  const canChange = confirmed && untilStart > 0 && (asMentor || hoursUntil(b.startsAt, now) >= CHANGE_CUTOFF_HOURS);
  const started = untilStart <= 0;
  const canceledBy = b.canceledById === b.mentorId ? b.mentor.displayName : b.canceledById === b.buyerId ? b.buyer.displayName : null;
  const productHref = insidePath(b.mentor.username, b.product.slug);
  const left = b.entitlement.sessionsTotal != null ? Math.max(0, b.entitlement.sessionsTotal - b.entitlement.sessionsUsed) : 0;

  return (
    <div className="container-tt max-w-3xl py-8 sm:py-10">
      <Link href="/bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All calls
      </Link>

      {booked && confirmed ? (
        <Notice tone="ok" className="mt-4" title="You're booked">
          We emailed you both the details. Add it to your calendar so you don&apos;t miss it.
        </Notice>
      ) : null}
      {moved && confirmed ? (
        <Notice tone="ok" className="mt-4" title="Call moved">
          We let {other.displayName} know the new time.
        </Notice>
      ) : null}

      <div className="mt-5 flex items-center gap-4">
        <Avatar src={other.avatarUrl} name={other.displayName} size={56} />
        <div className="min-w-0">
          <div className="kicker">{asMentor ? "Call with your buyer" : "Your call"}</div>
          <h1 className="mt-1 text-2xl sm:text-3xl">Call with {other.displayName}</h1>
          <Link href={productHref} className="mt-0.5 block truncate text-sm text-muted hover:text-ink">
            {b.product.title}
          </Link>
        </div>
      </div>

      {b.status === "CANCELED" ? (
        <Notice
          tone="bad"
          className="mt-6"
          title={canceledBy ? `${canceledBy === user.displayName ? "You" : canceledBy} canceled this call` : "This call was canceled"}
        >
          {b.cancelReason ? <p className="whitespace-pre-line">&ldquo;{b.cancelReason}&rdquo;</p> : null}
          {!asMentor && b.entitlement.status === "ACTIVE" ? (
            <p className={b.cancelReason ? "mt-2" : undefined}>
              {left > 0 ? (
                <>
                  You have {left === 1 ? "a call" : `${left} calls`} to book.{" "}
                  <Link href={insidePath(b.mentor.username, b.product.slug)} className="link font-semibold">
                    Book another time
                  </Link>
                </>
              ) : (
                "You have no calls left to book."
              )}
            </p>
          ) : null}
        </Notice>
      ) : null}

      <section className="card mt-6 p-5 sm:p-6" aria-label="When">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-text">
              <CalendarClock className="size-4" />
              {formatDay(b.startsAt, tz)}
            </div>
            <div className={`mt-1 text-2xl font-semibold ${b.status === "CANCELED" ? "text-muted line-through decoration-2" : ""}`}>
              {formatClock(b.startsAt, tz)} to {formatTime(b.endsAt, tz)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {minutesLabel(minutes)}
              </span>
              <span>
                Times in {zoneName(tz)}.{" "}
                <Link href="/settings" className="link">
                  Change
                </Link>
              </span>
            </div>
          </div>
          {b.status === "COMPLETED" ? (
            <span className="badge badge-ok">
              <CheckCircle2 /> Done
            </span>
          ) : b.status === "NO_SHOW" ? (
            <span className="badge badge-warn">
              <UserX /> No-show
            </span>
          ) : confirmed && join === "over" ? (
            <span className="badge badge-outline">Ended</span>
          ) : confirmed && untilStart > 0 ? (
            <span className="badge badge-info">Starts {startsIn(untilStart)}</span>
          ) : null}
        </div>

        {confirmed && join !== "over" ? (
          <div className="mt-5 border-t border-line pt-5">
            {join === "open" && b.callUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <a href={b.callUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg">
                  <Video /> Join call
                </a>
                <span className="text-sm text-muted">Opens in a new tab. Allow your camera and microphone when asked.</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="btn btn-secondary btn-lg pointer-events-none opacity-60" aria-disabled="true">
                  <Video /> Join call
                </span>
                <span className="text-sm text-muted">The join button opens {JOIN_EARLY_MIN} minutes before the start.</span>
                {untilStart < 70 * 60_000 ? <AutoRefresh seconds={30} maxTries={160} /> : null}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/api/calendar?booking=${b.id}`} className="btn btn-ghost btn-sm">
                <CalendarPlus /> Add to calendar
              </a>
              {asMentor && b.callUrl ? <CopyButton value={b.callUrl} label="Copy room link" small /> : null}
            </div>
            {join === "open" ? <p className="mt-3 text-xs text-faint">The room stays open until {JOIN_LATE_MIN} minutes after the planned end.</p> : null}
          </div>
        ) : null}

        {canChange ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
            <Link href={`/calls/${b.id}/move`} className="btn btn-secondary">
              <CalendarClock /> Move call
            </Link>
            <CancelCallButton bookingId={b.id} otherName={other.displayName} asMentor={asMentor} />
            {!asMentor ? (
              <span className="text-sm text-muted">
                You can change it until {formatWhen(new Date(b.startsAt.getTime() - CHANGE_CUTOFF_HOURS * 3_600_000), tz)}.
              </span>
            ) : null}
          </div>
        ) : confirmed && !started && !asMentor ? (
          <p className="mt-5 border-t border-line pt-5 text-sm text-muted">
            Calls can only be moved or canceled up to {CHANGE_CUTOFF_HOURS} hours before. Message {firstName(other.displayName)} if something came up.
          </p>
        ) : null}

        {asMentor && confirmed && started ? (
          <div className="mt-5 border-t border-line pt-5">
            <div className="text-sm font-semibold">How did it go?</div>
            <p className="mt-0.5 text-sm text-muted">Calls count as done automatically a day after they end.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton action={markCall} fields={{ bookingId: b.id, outcome: "done" }} variant="secondary" size="md">
                <CheckCircle2 /> Mark as done
              </ActionButton>
              <ActionButton
                action={markCall}
                fields={{ bookingId: b.id, outcome: "no_show" }}
                variant="ghost"
                size="md"
                confirm={`Mark ${b.buyer.displayName} as a no-show? The call stays used.`}
              >
                <UserX /> Didn&apos;t show up
              </ActionButton>
            </div>
          </div>
        ) : null}
      </section>

      {b.intake ? (
        <section className="mt-6">
          <h2 className="text-lg">{asMentor ? `What ${firstName(b.buyer.displayName)} wants to work on` : "What you want to work on"}</h2>
          <p className="card mt-3 p-5 text-sm whitespace-pre-line text-ink-2">{b.intake}</p>
        </section>
      ) : null}

      {asMentor ? (
        b.status !== "CANCELED" ? (
          <section className="mt-6">
            <h2 className="text-lg">Notes</h2>
            <div className="card mt-3 p-5">
              <CallNotesForm bookingId={b.id} mentorNotes={b.mentorNotes} summary={b.summary} buyerFirstName={firstName(b.buyer.displayName)} />
            </div>
          </section>
        ) : null
      ) : b.summary ? (
        <section className="mt-6">
          <h2 className="text-lg">Notes from {firstName(b.mentor.displayName)}</h2>
          <p className="card mt-3 p-5 text-sm whitespace-pre-line text-ink-2">{b.summary}</p>
        </section>
      ) : null}

      {!asMentor && b.status === "COMPLETED" ? (
        <Notice
          tone="plain"
          className="mt-6"
          title={`How was your call with ${firstName(b.mentor.displayName)}?`}
          action={
            <Link href={`${productPath(b.mentor.username, b.product.slug)}#reviews`} className="btn btn-secondary btn-sm">
              <Star /> Leave a review
            </Link>
          }
        >
          A short review helps other traders pick the right mentor.
        </Notice>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6 text-sm text-muted">
        <Link href={`/@${other.username}`} className="font-semibold text-ink hover:underline">
          {other.displayName}
        </Link>
        <MessageButton
          toId={other.id}
          toName={other.displayName}
          subject={`Our call on ${formatWhen(b.startsAt, tz)}`}
          variant="secondary"
          className="btn-sm"
        />
      </div>
    </div>
  );
}
