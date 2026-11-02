import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { REF_COOKIE, REF_DAYS, addRef } from "@/lib/ref";
import { getViewer } from "@/server/dal";
import { VIA_COOKIE, trackView } from "@/server/views";

/**
 * A creator's share link: tradertrades.com/r/username.
 * Remembers the creator on this browser for 30 days (so their buyers cost them 0%), then opens their page.
 * Add ?to=/@username/product-slug to land on a product instead.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username: raw } = await ctx.params;
  const username = raw.toLowerCase();
  const user = /^[a-z0-9_]{3,24}$/.test(username)
    ? await db.user.findUnique({ where: { username }, select: { id: true, username: true, status: true } })
    : null;
  if (!user || user.status === "BANNED" || user.status === "DELETED") {
    return NextResponse.redirect(new URL("/marketplace", request.url));
  }

  const to = request.nextUrl.searchParams.get("to");
  const ownPath = `/@${user.username}`;
  const dest = to && (to === ownPath || to.startsWith(`${ownPath}/`)) && !to.includes("//") ? to : ownPath;

  // Counts the click for the creator's stats (not their own clicks).
  const viewer = await getViewer();
  await trackView({ target: "LINK", targetId: user.id, ownerId: user.id, viewerId: viewer?.id, skip: viewer?.id === user.id });

  const res = NextResponse.redirect(new URL(dest, request.url));
  // Apps like Instagram often send no referrer; this marks the next page view as coming from the link.
  res.cookies.set(VIA_COOKIE, "1", { path: "/", maxAge: 60, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  res.cookies.set(REF_COOKIE, addRef(request.cookies.get(REF_COOKIE)?.value, user.username), {
    path: "/",
    maxAge: REF_DAYS * 86400,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
