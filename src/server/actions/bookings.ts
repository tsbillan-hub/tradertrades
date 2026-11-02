"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fail, formObject, invalid, optionalText, success, type ActionState } from "@/lib/forms";
import { productSettings } from "@/lib/product-settings";
import { formatWhen, zonedToUtc } from "@/lib/time";
import { minutesLabel } from "@/lib/utils";
import { requireCreator, requireUser } from "@/server/dal";
import { accessById } from "@/server/inside";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { flash } from "@/server/flash";
import { rateLimit } from "@/server/rate-limit";
import { checkText } from "@/server/moderation";
import { CHANGE_CUTOFF_HOURS, callUrlFor, clashes, hoursUntil, mentorZone, newRoomName, openSlots } from "@/server/bookings";

class Taken extends Error {}

const isConflict = (e: unknown) => e instanceof Taken || (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2034" || e.code === "P2002"));

const bookSchema = z.object({
  productId: z.string().min(1),
  startsAt: z.iso.datetime({ error: "Pick a time" }),
  intake: optionalText(1000),
});

/** Book one of your calls at an open time. Uses up one call from what you bought. */
export async function bookCall(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = bookSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const ctx = await accessById(d.productId);
  if (!ctx || ctx.product.type !== "MENTORING") return fail("You don't have access to this mentoring.");
  if (ctx.isOwner) return fail("This is your own mentoring. Buyers book from here.");
  const ent = ctx.entitlement;
  if (!ent || ent.status !== "ACTIVE") return fail("You don't have access to this mentoring.");
  if ((ent.sessionsTotal ?? 0) - ent.sessionsUsed <= 0) return fail("You've used all your calls. You can buy more from the listing.");
  const rl = await rateLimit(`book:${user.id}`, 20, 3600);
  if (!rl.ok) return fail("Too many tries. Wait a few minutes and try again.");

  const settings = ctx.settings;
  const start = new Date(d.startsAt);
  const { slots } = await openSlots({ mentorId: ctx.product.creatorId, settings });
  if (!slots.some((s) => s.start.getTime() === start.getTime())) return fail("That time isn't open anymore. Pick another one.");
  const end = new Date(start.getTime() + settings.durationMin * 60_000);
  if (d.intake) {
    const check = await checkText(d.intake, null, { block: true });
    if (check.blocked) return fail(check.message, formData);
  }

  const roomName = newRoomName();
  const callUrl = await callUrlFor(settings, roomName, start, end);
  let bookingId: string;
  try {
    bookingId = await db.$transaction(
      async (tx) => {
        if (await clashes(tx, ctx.product.creatorId, start, end, settings.bufferMin)) throw new Taken();
        const used = await tx.$executeRaw`UPDATE "Entitlement" SET "sessionsUsed" = "sessionsUsed" + 1, "updatedAt" = now()
          WHERE "id" = ${ent.id} AND "status" = 'ACTIVE' AND "sessionsUsed" < COALESCE("sessionsTotal", 0)`;
        if (used !== 1) throw new Error("NO_CALLS_LEFT");
        const b = await tx.booking.create({
          data: {
            productId: ctx.product.id,
            mentorId: ctx.product.creatorId,
            buyerId: user.id,
            entitlementId: ent.id,
            startsAt: start,
            endsAt: end,
            intake: d.intake ?? null,
            roomName,
            callUrl,
          },
        });
        return b.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (isConflict(e)) return fail("Someone just booked that time. Pick another one.");
    if (e instanceof Error && e.message === "NO_CALLS_LEFT") return fail("You've used all your calls. You can buy more from the listing.");
    throw e;
  }

  const mentor = await db.user.findUnique({ where: { id: ctx.product.creatorId }, select: { timezone: true } });
  const length = minutesLabel(settings.durationMin);
  await notify(ctx.product.creatorId, {
    type: "booking.new",
    title: `New call booked: ${user.displayName}, ${formatWhen(start, mentorZone(mentor?.timezone))}`,
    body: d.intake ? `They want to work on: ${d.intake.slice(0, 300)}` : `${length} · ${ctx.product.title}`,
    url: `/calls/${bookingId}`,
    email: "bookings",
    ctaLabel: "Open the call page",
    rows: [
      ["When", formatWhen(start, mentorZone(mentor?.timezone))],
      ["Length", length],
      ["Mentoring", ctx.product.title],
    ],
  });
  await notify(user.id, {
    type: "booking.confirmed",
    title: `Your call with ${ctx.product.creator.displayName} is booked`,
    body: `${formatWhen(start, mentorZone(user.timezone))}. You can join from TraderTrades 10 minutes before it starts.`,
    url: `/calls/${bookingId}`,
    email: "bookings",
    ctaLabel: "Open the call page",
    rows: [
      ["When", formatWhen(start, mentorZone(user.timezone))],
      ["Length", length],
    ],
  });
  await audit(user.id, "booking.create", { type: "booking", id: bookingId }, { productId: ctx.product.id, startsAt: start.toISOString() });
  redirect(`/calls/${bookingId}?booked=1`);
}

/** Who may change a booking, and whether it's still allowed. */
async function loadForChange(bookingId: string, userId: string) {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      product: { select: { id: true, title: true, settings: true } },
      mentor: { select: { id: true, displayName: true, timezone: true } },
      buyer: { select: { id: true, displayName: true, timezone: true } },
    },
  });
  if (!b) return { error: "Call not found." } as const;
  const asMentor = b.mentorId === userId;
  if (!asMentor && b.buyerId !== userId) return { error: "Call not found." } as const;
  if (b.status !== "CONFIRMED") return { error: "This call can't be changed anymore." } as const;
  if (hoursUntil(b.startsAt) <= 0) return { error: "This call has already started." } as const;
  if (!asMentor && hoursUntil(b.startsAt) < CHANGE_CUTOFF_HOURS)
    return {
      error: `Calls can only be moved or canceled up to ${CHANGE_CUTOFF_HOURS} hours before. Message ${b.mentor.displayName} if something came up.`,
    } as const;
  return { b, asMentor } as const;
}

/** Move a call to another open time. Buyers up to 24 hours before; mentors any time. */
export async function moveCall(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ bookingId: z.string().min(1), startsAt: z.iso.datetime({ error: "Pick a time" }) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const got = await loadForChange(parsed.data.bookingId, user.id);
  if ("error" in got) return fail(got.error ?? "Call not found.");
  const { b, asMentor } = got;
  const settings = productSettings(b.product.settings);
  const start = new Date(parsed.data.startsAt);
  const { slots } = await openSlots({ mentorId: b.mentorId, settings, excludeBookingId: b.id });
  if (!slots.some((s) => s.start.getTime() === start.getTime())) return fail("That time isn't open anymore. Pick another one.");
  const end = new Date(start.getTime() + settings.durationMin * 60_000);
  try {
    await db.$transaction(
      async (tx) => {
        if (await clashes(tx, b.mentorId, start, end, settings.bufferMin, b.id)) throw new Taken();
        await tx.booking.update({ where: { id: b.id }, data: { startsAt: start, endsAt: end, reminderSentAt: null } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (isConflict(e)) return fail("Someone just booked that time. Pick another one.");
    throw e;
  }
  const other = asMentor ? b.buyer : b.mentor;
  const me = asMentor ? b.mentor : b.buyer;
  await notify(other.id, {
    type: "booking.moved",
    title: `${me.displayName} moved your call to ${formatWhen(start, mentorZone(other.timezone))}`,
    body: `It was ${formatWhen(b.startsAt, mentorZone(other.timezone))}. ${b.product.title}.`,
    url: `/calls/${b.id}`,
    email: "bookings",
    ctaLabel: "Open the call page",
  });
  await audit(user.id, "booking.move", { type: "booking", id: b.id }, { from: b.startsAt.toISOString(), to: start.toISOString() });
  redirect(`/calls/${b.id}?moved=1`);
}

/** Cancel a call. The call goes back to the buyer to book again. */
export async function cancelCall(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ bookingId: z.string().min(1), reason: optionalText(500) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const got = await loadForChange(parsed.data.bookingId, user.id);
  if ("error" in got) return fail(got.error ?? "Call not found.");
  const { b, asMentor } = got;
  const now = new Date();
  await db.$transaction([
    db.booking.update({
      where: { id: b.id },
      data: { status: "CANCELED", canceledAt: now, canceledById: user.id, cancelReason: parsed.data.reason ?? null },
    }),
    db.entitlement.updateMany({ where: { id: b.entitlementId, sessionsUsed: { gt: 0 } }, data: { sessionsUsed: { decrement: 1 } } }),
  ]);
  const other = asMentor ? b.buyer : b.mentor;
  const me = asMentor ? b.mentor : b.buyer;
  await notify(other.id, {
    type: "booking.canceled",
    title: `${me.displayName} canceled your call on ${formatWhen(b.startsAt, mentorZone(other.timezone))}`,
    body: [parsed.data.reason, asMentor ? "The call is back in your account, so you can book another time." : null].filter(Boolean).join(" "),
    url: `/calls/${b.id}`,
    email: "bookings",
  });
  await audit(user.id, "booking.cancel", { type: "booking", id: b.id }, { asMentor });
  // The cancel button goes away when the page refreshes, so the message rides along as a flash toast.
  await flash(
    asMentor ? `Call canceled. ${b.buyer.displayName} can book another time.` : "Call canceled. It's back in your account, so you can book another time.",
  );
  refresh();
  return success();
}

/** The mentor's notes: private notes for themselves, and notes shared with the buyer after the call. */
export async function saveCallNotes(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ bookingId: z.string().min(1), mentorNotes: optionalText(5000), summary: optionalText(5000) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const b = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { mentor: { select: { displayName: true } } },
  });
  if (!b || b.mentorId !== user.id) return fail("Call not found.");
  const firstSummary = Boolean(parsed.data.summary && !b.summary);
  await db.booking.update({ where: { id: b.id }, data: { mentorNotes: parsed.data.mentorNotes ?? null, summary: parsed.data.summary ?? null } });
  if (firstSummary) {
    await notify(b.buyerId, {
      type: "booking.summary",
      title: `${b.mentor.displayName} added notes from your call`,
      body: parsed.data.summary!.slice(0, 200),
      url: `/calls/${b.id}`,
      email: "bookings",
      ctaLabel: "Read the notes",
    });
  }
  refresh();
  return success("Notes saved.");
}

/** After the start time, the mentor can mark the call as done or say the buyer didn't show up. */
export async function markCall(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("bookingId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const b = await db.booking.findUnique({ where: { id } });
  if (!b || b.mentorId !== user.id || b.status !== "CONFIRMED" || hoursUntil(b.startsAt) > 0) return;
  if (outcome !== "done" && outcome !== "no_show") return;
  await db.booking.update({ where: { id }, data: { status: outcome === "done" ? "COMPLETED" : "NO_SHOW", completedAt: new Date() } });
  await audit(user.id, `booking.${outcome}`, { type: "booking", id });
  refresh();
}

// ───────────────────────────── Weekly hours and time off ─────────────────────────────

const rangeSchema = z.object({ weekday: z.number().int().min(0).max(6), start: z.number().int().min(0).max(1440), end: z.number().int().min(0).max(1440) });

/** Replaces the creator's weekly hours. Times are minutes from midnight in their own time zone. */
export async function saveWeeklyHours(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("hours") ?? "[]"));
  } catch {
    return fail("Something went wrong reading your hours. Refresh and try again.");
  }
  const parsed = z.array(rangeSchema).max(70).safeParse(raw);
  if (!parsed.success) return fail("Something went wrong reading your hours. Refresh and try again.");
  const ranges = parsed.data;
  for (const r of ranges) {
    if (r.end <= r.start) return fail("Each time range has to end after it starts.");
    if (r.start % 15 || r.end % 15) return fail("Use times on the quarter hour.");
  }
  for (let wd = 0; wd < 7; wd++) {
    const day = ranges.filter((r) => r.weekday === wd).sort((a, b) => a.start - b.start);
    for (let i = 1; i < day.length; i++) if (day[i].start < day[i - 1].end) return fail("Two time ranges on the same day overlap. Merge them into one.");
  }
  await db.$transaction([
    db.availabilityRule.deleteMany({ where: { userId: user.id } }),
    db.availabilityRule.createMany({ data: ranges.map((r) => ({ userId: user.id, weekday: r.weekday, startMinute: r.start, endMinute: r.end })) }),
  ]);
  refresh();
  return success(ranges.length ? "Weekly hours saved. Buyers can book these times." : "Weekly hours cleared. Nobody can book a call until you add some.");
}

/** Block out days you're away. Dates are in the creator's own time zone; both days are included. */
export async function addTimeOff(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCreator();
  const parsed = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the first day"),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the last day"),
      reason: optionalText(120),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const tz = mentorZone(user.timezone);
  const start = zonedToUtc(parsed.data.from, "00:00", tz);
  const endDay = zonedToUtc(parsed.data.to, "00:00", tz);
  if (!start || !endDay) return fail("Pick real dates.", formData);
  // The block runs to the end of the last day (midnight at the start of the next one).
  const [y, m, d] = parsed.data.to.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const end = zonedToUtc(next, "00:00", tz)!;
  if (end <= start) return fail("The last day has to be on or after the first day.", formData, { to: ["The last day has to be on or after the first day"] });
  if (end.getTime() - start.getTime() > 366 * 86_400_000) return fail("Time off can be a year at most.", formData);
  await db.availabilityBlock.create({ data: { userId: user.id, startsAt: start, endsAt: end, reason: parsed.data.reason ?? null } });
  const clashing = await db.booking.count({ where: { mentorId: user.id, status: "CONFIRMED", startsAt: { lt: end }, endsAt: { gt: start } } });
  refresh();
  return success(
    clashing
      ? `Time off added. You already have ${clashing === 1 ? "a call" : `${clashing} calls`} booked in those days: move or cancel ${clashing === 1 ? "it" : "them"} from Calls.`
      : "Time off added. Nobody can book you on those days.",
  );
}

export async function removeTimeOff(formData: FormData) {
  const user = await requireCreator();
  await db.availabilityBlock.deleteMany({ where: { id: String(formData.get("blockId") ?? ""), userId: user.id } });
  refresh();
}
