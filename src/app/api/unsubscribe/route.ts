import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readUnsubscribeToken } from "@/server/broadcasts";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header.
 * Only POST changes anything, because link scanners in inboxes open every GET.
 */
export async function POST(request: NextRequest) {
  const t = readUnsubscribeToken(request.nextUrl.searchParams.get("t"));
  if (!t) return new Response("This link doesn't work.", { status: 400 });
  if (t.userId !== t.creatorId) {
    await db.creatorEmailOptOut.upsert({
      where: { userId_creatorId: { userId: t.userId, creatorId: t.creatorId } },
      create: { userId: t.userId, creatorId: t.creatorId },
      update: {},
    });
  }
  return new Response("You won't get emails from this creator anymore.", { status: 200 });
}

/** Someone opened the header link in a browser: show the page with the button. */
export async function GET(request: NextRequest) {
  const url = new URL("/unsubscribe", request.nextUrl.origin);
  const token = request.nextUrl.searchParams.get("t");
  if (token) url.searchParams.set("t", token);
  return NextResponse.redirect(url, 303);
}
