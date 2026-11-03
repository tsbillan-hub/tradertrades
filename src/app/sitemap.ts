import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { CATEGORIES } from "@/lib/constants";
import { productPath } from "@/lib/paths";

// Built when asked for, not at build time: it always matches the live database, and a build never needs it.
export const dynamic = "force-dynamic";

const STATIC = ["/", "/marketplace", "/creators", "/directory", "/directory/offers", "/campaigns", "/jobs", "/sell", "/for-business", "/fees", "/rules", "/guidelines", "/about", "/help", "/terms", "/privacy", "/risk", "/refunds"];

/** Every public page search engines should know about. Sample content is left out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, creators, companies, campaigns, jobs] = await Promise.all([
    db.product.findMany({
      where: { status: "PUBLISHED", isSample: false, creator: { status: "ACTIVE", isSample: false, creator: { status: "APPROVED" } } },
      select: { slug: true, updatedAt: true, creator: { select: { username: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20000,
    }),
    db.user.findMany({
      where: { status: "ACTIVE", isSample: false, creator: { status: "APPROVED" } },
      select: { username: true, updatedAt: true },
      take: 20000,
    }),
    db.company.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true }, take: 5000 }),
    db.campaign.findMany({ where: { status: "OPEN", company: { status: "PUBLISHED" } }, select: { id: true, updatedAt: true }, take: 2000 }),
    db.jobPost.findMany({ where: { status: "OPEN", isSample: false }, select: { id: true, updatedAt: true }, take: 2000 }),
  ]);
  return [
    ...STATIC.map((p) => ({ url: absoluteUrl(p) })),
    ...CATEGORIES.map((c) => ({ url: absoluteUrl(`/directory/${c.slug}`) })),
    ...creators.map((u) => ({ url: absoluteUrl(`/@${u.username}`), lastModified: u.updatedAt })),
    ...products.map((p) => ({ url: absoluteUrl(productPath(p.creator.username, p.slug)), lastModified: p.updatedAt })),
    ...companies.map((c) => ({ url: absoluteUrl(`/directory/c/${c.slug}`), lastModified: c.updatedAt })),
    ...campaigns.map((c) => ({ url: absoluteUrl(`/campaigns/${c.id}`), lastModified: c.updatedAt })),
    ...jobs.map((j) => ({ url: absoluteUrl(`/jobs/${j.id}`), lastModified: j.updatedAt })),
  ];
}
