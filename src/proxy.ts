import { NextResponse, type NextRequest } from "next/server";
import { REF_COOKIE, REF_DAYS, addRef } from "@/lib/ref";

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  // Let server components know the current path (used for "sign in, then come back here").
  const headers = new Headers(request.headers);
  headers.set("x-tt-path", `${pathname}${search}`);
  const res = NextResponse.next({ request: { headers } });

  // ?ref=username on any page counts the visitor as that creator's own audience.
  const ref = searchParams.get("ref");
  if (ref && /^[a-zA-Z0-9_]{3,24}$/.test(ref)) {
    res.cookies.set(REF_COOKIE, addRef(request.cookies.get(REF_COOKIE)?.value, ref), {
      path: "/",
      maxAge: REF_DAYS * 86400,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|mp4|ico|txt|xml)$).*)"],
};
