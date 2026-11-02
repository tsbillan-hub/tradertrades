import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { accessById } from "@/server/inside";
import { getViewer } from "@/server/dal";
import { productSettings } from "@/lib/product-settings";
import { insidePath } from "@/lib/paths";
import { icsEvent } from "@/lib/time";

/** A calendar file for a live session (?session=), an event product (?event=) or a booked call (?booking=), for people with access. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const eventId = url.searchParams.get("event");
  const bookingId = url.searchParams.get("booking");

  let file: string | null = null;
  let name = "session";
  if (sessionId) {
    const s = await db.liveSession.findUnique({ where: { id: sessionId } });
    const ctx = s ? await accessById(s.productId) : null;
    if (!s || !ctx) return new Response("Not found", { status: 404 });
    const page = absoluteUrl(insidePath(ctx.product.creator.username, ctx.product.slug, "/live"));
    file = icsEvent({
      uid: s.id,
      title: `${s.title} (${ctx.product.title})`,
      description: `${s.description ? `${s.description}\n\n` : ""}Join from ${page}`,
      start: s.startsAt,
      minutes: s.durationMin,
      url: page,
    });
    name = s.title;
  } else if (eventId) {
    const ctx = await accessById(eventId);
    if (!ctx || ctx.product.type !== "EVENT" || !ctx.product.startsAt) return new Response("Not found", { status: 404 });
    const page = absoluteUrl(insidePath(ctx.product.creator.username, ctx.product.slug));
    file = icsEvent({
      uid: ctx.product.id,
      title: ctx.product.title,
      description: `Join from ${page}`,
      start: ctx.product.startsAt,
      minutes: productSettings(ctx.product.settings).eventMinutes,
      url: page,
    });
    name = ctx.product.title;
  } else if (bookingId) {
    const viewer = await getViewer();
    const b = viewer
      ? await db.booking.findUnique({
          where: { id: bookingId },
          include: { product: { select: { title: true } }, mentor: { select: { displayName: true } }, buyer: { select: { displayName: true } } },
        })
      : null;
    if (!viewer || !b || (b.mentorId !== viewer.id && b.buyerId !== viewer.id) || b.status !== "CONFIRMED") return new Response("Not found", { status: 404 });
    const other = b.mentorId === viewer.id ? b.buyer.displayName : b.mentor.displayName;
    const page = absoluteUrl(`/calls/${b.id}`);
    file = icsEvent({
      uid: b.id,
      title: `Call with ${other} (${b.product.title})`,
      description: `Join from ${page}`,
      start: b.startsAt,
      minutes: Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000),
      url: page,
    });
    name = `Call with ${other}`;
  }
  if (!file) return new Response("Missing session, event or booking", { status: 400 });
  const safe = name.replace(/[^\w -]+/g, "").trim().slice(0, 60) || "event";
  return new Response(file, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
