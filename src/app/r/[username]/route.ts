import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { REF_COOKIE, REF_DAYS, addRef } from "@/lib/ref";

/**
 * A creator's share link: tradertrades.com/r/username.
 * Remembers the creator on this browser for 30 days (so their buyers cost them 0%), then opens their page.
 * Add ?to=/@username/product-slug to land on a product instead.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username: raw } = await ctx.params;
  const username = raw.toLowerCase();
  const user = /^[a-z0-9_]{3,24}$/.test(username)
    ? await db.user.findUnique({ where: { username }, select: { username: true, status: true } })
    : null;
  if (!user || user.status === "BANNED" || user.status === "DELETED") {
    return NextResponse.redirect(new URL("/marketplace", request.url));
  }

  const to = request.nextUrl.searchParams.get("to");
  const ownPath = `/@${user.username}`;
  const dest = to && (to === ownPath || to.startsWith(`${ownPath}/`)) && !to.includes("//") ? to : ownPath;

  const res = NextResponse.redirect(new URL(dest, request.url));
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
