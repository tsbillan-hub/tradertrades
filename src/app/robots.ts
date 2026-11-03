import type { MetadataRoute } from "next";
import { absoluteUrl, env } from "@/lib/env";

// Rendered per request from the running settings, not fixed at build time.
export const dynamic = "force-dynamic";

/** Search engines: the public pages only. A preview site (test checkout, sample listings) stays out of search results. */
export default function robots(): MetadataRoute.Robots {
  if (env.demoMode) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/creator$",
        "/creator/",
        "/business$",
        "/business/",
        "/settings",
        "/checkout",
        "/messages",
        "/notifications",
        "/library",
        "/bookings",
        "/calls/",
        "/deals/",
        "/saved",
        "/onboarding",
        "/unsubscribe",
        "/suspended",
        "/r/",
        "/go/",
        "/*/inside$",
        "/*/inside/",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
