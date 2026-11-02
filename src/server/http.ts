import "server-only";
import { env } from "@/lib/env";

/** Blocks cross-site POSTs to route handlers (server actions check this on their own). */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host && o.host === host) return true;
    return o.origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}
