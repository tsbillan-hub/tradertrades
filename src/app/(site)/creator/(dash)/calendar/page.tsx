import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarOff, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireCreator } from "@/server/dal";
import { mentorZone, openSlots } from "@/server/bookings";
import { addTimeOff, removeTimeOff } from "@/server/actions/bookings";
import { ActionButton, ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { WeeklyHoursEditor } from "@/components/bookings/weekly-hours";
import { CallList, CallRow } from "@/components/bookings/call-row";
import { productSettings } from "@/lib/product-settings";
import { PRODUCT_STATUS_BADGE } from "@/lib/product-status";
import { formatWhen, utcToZoned, zoneName } from "@/lib/time";
import { minutesLabel, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar" };

function shortDay(at: Date, tz: string) {
  return at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
}

export default async function CalendarPage() {
  const user = await requireCreator();
  const tz = mentorZone(user.timezone);
  const now = new Date();
  const [rules, blocks, upcoming, upcomingCount, mentoring] = await Promise.all([
    db.availabilityRule.findMany({ where: { userId: user.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.availabilityBlock.findMany({ where: { userId: user.id, endsAt: { gt: now } }, orderBy: { startsAt: "asc" } }),
    db.booking.findMany({
      where: { mentorId: user.id, status: "CONFIRMED", endsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 6,
      include: { product: { select: { title: true } }, buyer: { select: { displayName: true, avatarUrl: true } } },
    }),
    db.booking.count({ where: { mentorId: user.id, status: "CONFIRMED", endsAt: { gt: now } } }),
    db.product.findMany({
      where: { creatorId: user.id, type: "MENTORING", status: { not: "ARCHIVED" } },
      select: { id: true, title: true, status: true, settings: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const nextOpen = await Promise.all(
    mentoring.map(async (p) => {
      const { slots } = await openSlots({ mentorId: user.id, settings: productSettings(p.settings), now });
      return slots[0]?.start ?? null;
    }),
  );
  const today = utcToZoned(now, tz).date;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="When buyers can book calls with you, the days you're away, and the calls you have coming up."
        actions={
          <Link href="/bookings" className="btn btn-secondary btn-sm">
            <CalendarDays /> All calls
          </Link>
        }
      />

      {!mentoring.length ? (
        <Notice
          tone="plain"
          title="You don't sell mentoring yet"
          action={
            <Link href="/creator/products/new?type=MENTORING" className="btn btn-secondary btn-sm">
              <Plus /> New mentoring
            </Link>
          }
        >
          Set your hours now and they&apos;re ready when you add one-to-one calls.
        </Notice>
      ) : !rules.length ? (
        <Notice tone="warn" title="Nobody can book you yet">
          Add the times you&apos;re free below. Buyers only see open times inside your weekly hours.
        </Notice>
      ) : null}

      <Panel
        title="Coming up"
        description={upcomingCount ? `${plural(upcomingCount, "call")} booked.` : undefined}
        action={
          upcomingCount > upcoming.length ? (
            <Link href="/bookings" className="link text-sm font-semibold">
              See all
            </Link>
          ) : null
        }
      >
        {upcoming.length ? (
          <CallList label="Calls coming up">
            {upcoming.map((b) => (
              <CallRow key={b.id} call={{ ...b, other: b.buyer }} timeZone={tz} now={now} />
            ))}
          </CallList>
        ) : (
          <p className="text-sm text-muted">No calls booked. When someone books, it shows here and we email you.</p>
        )}
      </Panel>

      <Panel
        title="Weekly hours"
        description={
          <>
            The times you take calls each week.{" "}
            <Link href="/settings" className="link">
              Change time zone
            </Link>
          </>
        }
      >
        <WeeklyHoursEditor initial={rules} zoneLabel={zoneName(tz)} />
      </Panel>

      <Panel title="Time off" description="Days you're away. Nobody can book you on them. Calls you already have stay booked until you move or cancel them.">
        <div className="space-y-5">
          <ActionForm action={addTimeOff} toastOnSuccess resetOnSuccess refreshOnSuccess className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
              <Field label="First day" name="from">
                <Input name="from" type="date" min={today} />
              </Field>
              <Field label="Last day" name="to">
                <Input name="to" type="date" min={today} />
              </Field>
              <Field label="Note" name="reason" optional hint="Only you see this.">
                <Input name="reason" maxLength={120} placeholder="Vacation" />
              </Field>
            </div>
            <FormMessage hideSuccess />
            <SubmitButton variant="secondary">
              <CalendarOff /> Add time off
            </SubmitButton>
          </ActionForm>

          {blocks.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Your time off">
              {blocks.map((b) => {
                const first = shortDay(b.startsAt, tz);
                const last = shortDay(new Date(b.endsAt.getTime() - 1), tz);
                return (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <CalendarOff className="size-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{first === last ? first : `${first} to ${last}`}</div>
                      {b.reason ? <div className="truncate text-sm text-muted">{b.reason}</div> : null}
                    </div>
                    <ActionButton action={removeTimeOff} fields={{ blockId: b.id }} variant="ghost" title="Remove this time off">
                      <Trash2 /> Remove
                    </ActionButton>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Panel>

      {mentoring.length ? (
        <Panel title="Your mentoring" description="Call length, notice and how far ahead people can book are set on each product.">
          <ul className="divide-y divide-line rounded-xl border border-line">
            {mentoring.map((p, i) => {
              const s = productSettings(p.settings);
              const badge = PRODUCT_STATUS_BADGE[p.status];
              return (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.title}</span>
                      {badge ? <span className={`badge ${badge.tone}`}>{badge.label}</span> : null}
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {minutesLabel(s.durationMin)} calls · {s.bufferMin ? `${minutesLabel(s.bufferMin)} break` : "No break"} ·{" "}
                      {s.minNoticeHours ? `${plural(s.minNoticeHours, "hour")} notice` : "No notice needed"} · up to {plural(s.maxDaysAhead, "day")} ahead
                    </div>
                    <div className="mt-0.5 text-sm">
                      {nextOpen[i] ? (
                        <>
                          Next open time: <span className="font-semibold">{formatWhen(nextOpen[i]!, tz)}</span>
                        </>
                      ) : (
                        <span className="text-warn">No open times. Add weekly hours or check your time off.</span>
                      )}
                    </div>
                  </div>
                  <Link href={`/creator/products/${p.id}`} className="btn btn-secondary btn-sm self-start sm:self-center">
                    Edit
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
