import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import type { ProductSettings } from "@/lib/product-settings";
import { formatWhen, isValidTimeZone, utcToZoned, zonedToUtc } from "@/lib/time";
import { notify } from "@/server/notify";

/** Buyers can move or cancel a call up to this many hours before it starts. Mentors can any time. */
export const CHANGE_CUTOFF_HOURS = 24;
/** The join button opens this many minutes before the start. */
export const JOIN_EARLY_MIN = 10;
/** And stays open this long after the planned end, in case the call runs over. */
export const JOIN_LATE_MIN = 30;
export const DEFAULT_TZ = "America/New_York";

export type Slot = { start: Date; end: Date };
type Busy = [number, number];

const pad = (n: number) => String(n).padStart(2, "0");
export const minuteLabel = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** "2026-11-05" plus n days, as a calendar date (no time zone involved). */
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday, for a calendar date. */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function mentorZone(tz: string | null | undefined) {
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}

/**
 * Open call times for one of a mentor's products, from now until the end of its booking window.
 * Weekly hours are in the mentor's own time zone, so they follow daylight saving changes.
 * Busy: other calls (with the break before and after), the mentor's live sessions and time off.
 */
export async function openSlots(opts: { mentorId: string; settings: ProductSettings; now?: Date; excludeBookingId?: string }) {
  const { mentorId, settings } = opts;
  const now = opts.now ?? new Date();
  const mentor = await db.user.findUnique({ where: { id: mentorId }, select: { timezone: true } });
  const tz = mentorZone(mentor?.timezone);
  const durationMs = settings.durationMin * 60_000;
  const bufferMs = settings.bufferMin * 60_000;
  const earliest = now.getTime() + settings.minNoticeHours * 3_600_000;
  const latest = now.getTime() + settings.maxDaysAhead * 86_400_000;
  const stepMin = settings.durationMin < 30 ? 15 : 30;

  const [rules, blocks, bookings, lives] = await Promise.all([
    db.availabilityRule.findMany({ where: { userId: mentorId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.availabilityBlock.findMany({ where: { userId: mentorId, endsAt: { gt: now }, startsAt: { lt: new Date(latest + durationMs) } } }),
    db.booking.findMany({
      where: {
        mentorId,
        status: "CONFIRMED",
        endsAt: { gt: new Date(now.getTime() - bufferMs) },
        startsAt: { lt: new Date(latest + durationMs + bufferMs) },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    }),
    db.liveSession.findMany({
      where: { product: { creatorId: mentorId }, startsAt: { gt: new Date(now.getTime() - 86_400_000), lt: new Date(latest + durationMs) } },
      select: { startsAt: true, durationMin: true },
    }),
  ]);
  if (!rules.length) return { tz, slots: [] as Slot[] };

  const busy: Busy[] = [
    ...bookings.map((b): Busy => [b.startsAt.getTime() - bufferMs, b.endsAt.getTime() + bufferMs]),
    ...lives.map((l): Busy => [l.startsAt.getTime() - bufferMs, l.startsAt.getTime() + l.durationMin * 60_000 + bufferMs]),
    ...blocks.map((b): Busy => [b.startsAt.getTime(), b.endsAt.getTime()]),
  ];

  const seen = new Set<number>();
  const slots: Slot[] = [];
  const today = utcToZoned(now, tz).date;
  for (let i = 0; i <= settings.maxDaysAhead + 1; i++) {
    const date = addDays(today, i);
    const weekday = weekdayOf(date);
    for (const r of rules) {
      if (r.weekday !== weekday) continue;
      for (let m = r.startMinute; m + settings.durationMin <= r.endMinute; m += stepMin) {
        const start = zonedToUtc(date, minuteLabel(m), tz);
        if (!start) continue;
        const s = start.getTime();
        const e = s + durationMs;
        if (s < earliest || s > latest || seen.has(s)) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        seen.add(s);
        slots.push({ start, end: new Date(e) });
      }
    }
  }
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { tz, slots };
}

/** True if a booking at this time would clash with another call (including the break between calls). */
export async function clashes(tx: Pick<typeof db, "booking">, mentorId: string, start: Date, end: Date, bufferMin: number, excludeId?: string) {
  const buffer = bufferMin * 60_000;
  const n = await tx.booking.count({
    where: {
      mentorId,
      status: "CONFIRMED",
      startsAt: { lt: new Date(end.getTime() + buffer) },
      endsAt: { gt: new Date(start.getTime() - buffer) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return n > 0;
}

/** A hard to guess room name for the call. */
export function newRoomName() {
  return (
    "tt-" +
    randomBytes(12)
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 16)
      .toLowerCase()
  );
}

/** Where the call happens: the mentor's own link, a Daily room (when set up), or a free Jitsi room. */
export async function callUrlFor(settings: ProductSettings, roomName: string, start: Date, end: Date) {
  if (settings.callProvider === "link" && /^https:\/\//.test(settings.callLink)) return settings.callLink;
  if (settings.callProvider === "daily" && features.daily) {
    const url = await createDailyRoom(roomName, start, end);
    if (url) return url;
  }
  return `https://meet.jit.si/TraderTrades-${roomName}`;
}

async function createDailyRoom(name: string, start: Date, end: Date) {
  try {
    const res = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: { authorization: `Bearer ${env.dailyKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        name,
        privacy: "public",
        properties: {
          nbf: Math.floor((start.getTime() - 30 * 60_000) / 1000),
          exp: Math.floor((end.getTime() + 2 * 3_600_000) / 1000),
          enable_chat: true,
          enable_screenshare: true,
        },
      }),
    });
    if (!res.ok) {
      console.error("[bookings] Daily room failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { url?: string };
    return json.url ?? null;
  } catch (err) {
    console.error("[bookings] Daily room failed", err);
    return null;
  }
}

/** Can the join button be used right now? */
export function joinState(start: Date, end: Date, now = new Date()) {
  const t = now.getTime();
  if (t < start.getTime() - JOIN_EARLY_MIN * 60_000) return "early" as const;
  if (t > end.getTime() + JOIN_LATE_MIN * 60_000) return "over" as const;
  return "open" as const;
}

/** Hours until a call starts (negative once it has started). */
export function hoursUntil(start: Date, now = new Date()) {
  return (start.getTime() - now.getTime()) / 3_600_000;
}

/** When someone loses access (refund, removed), their future calls are canceled and the mentor is told. */
export async function cancelFutureBookings(userId: string, productId: string, reason: string) {
  const now = new Date();
  const upcoming = await db.booking.findMany({
    where: { buyerId: userId, productId, status: "CONFIRMED", startsAt: { gt: now } },
    include: { mentor: { select: { id: true, timezone: true } }, buyer: { select: { displayName: true } } },
  });
  for (const b of upcoming) {
    await db.booking.update({ where: { id: b.id }, data: { status: "CANCELED", canceledAt: now, cancelReason: reason } });
    await notify(b.mentorId, {
      type: "booking.canceled",
      title: `Call canceled: ${b.buyer.displayName}, ${formatWhen(b.startsAt, mentorZone(b.mentor.timezone))}`,
      body: reason,
      url: `/calls/${b.id}`,
      email: "bookings",
    });
  }
  return upcoming.length;
}

/** Daily upkeep: reminders for calls in the next 36 hours, and calls that finished a day ago count as done. */
export async function bookingUpkeep(now = new Date()) {
  const soon = await db.booking.findMany({
    where: { status: "CONFIRMED", reminderSentAt: null, startsAt: { gt: now, lt: new Date(now.getTime() + 36 * 3_600_000) } },
    include: {
      product: { select: { title: true } },
      mentor: { select: { id: true, displayName: true, timezone: true } },
      buyer: { select: { id: true, displayName: true, timezone: true } },
    },
  });
  for (const b of soon) {
    await notify(b.buyerId, {
      type: "booking.reminder",
      title: `Reminder: your call with ${b.mentor.displayName}`,
      body: `${formatWhen(b.startsAt, mentorZone(b.buyer.timezone))}. Join from TraderTrades up to ${JOIN_EARLY_MIN} minutes before.`,
      url: `/calls/${b.id}`,
      email: "bookings",
      ctaLabel: "Open the call page",
    });
    await notify(b.mentorId, {
      type: "booking.reminder",
      title: `Reminder: call with ${b.buyer.displayName}`,
      body: `${formatWhen(b.startsAt, mentorZone(b.mentor.timezone))} · ${b.product.title}`,
      url: `/calls/${b.id}`,
      email: "bookings",
      ctaLabel: "Open the call page",
    });
    await db.booking.update({ where: { id: b.id }, data: { reminderSentAt: now } });
  }
  const done = await db.booking.updateMany({
    where: { status: "CONFIRMED", endsAt: { lt: new Date(now.getTime() - 86_400_000) } },
    data: { status: "COMPLETED", completedAt: now },
  });
  return { reminders: soon.length, completed: done.count };
}
