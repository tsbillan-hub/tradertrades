/**
 * Adds the starting directory listings, or refreshes them. Safe to run again and again.
 *
 *   npm run db:seed-directory
 *
 * A listing a company has claimed is never overwritten: once they own it, their edits win.
 * Runs automatically on Vercel builds after migrations (see scripts/migrate-on-deploy.mjs).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DIRECTORY } from "./directory-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[directory] No DATABASE_URL set.");
    process.exit(1);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let added = 0;
  let updated = 0;
  let kept = 0;
  const seen = new Set<string>();
  try {
    for (const c of DIRECTORY) {
      if (seen.has(c.slug)) throw new Error(`Duplicate slug in directory-data.ts: ${c.slug}`);
      seen.add(c.slug);
      const categories = Array.from(new Set([c.primaryCategory, ...(c.categories ?? [])]));
      const data = {
        name: c.name,
        primaryCategory: c.primaryCategory,
        categories,
        tagline: c.tagline,
        description: c.description,
        website: c.website,
        markets: c.markets,
        platforms: c.platforms ?? [],
        foundedYear: c.foundedYear ?? null,
        headquarters: c.headquarters ?? null,
      };
      const existing = await db.company.findUnique({ where: { slug: c.slug }, select: { id: true, claimedAt: true } });
      if (!existing) {
        await db.company.create({ data: { slug: c.slug, ...data } });
        added++;
      } else if (existing.claimedAt) {
        kept++;
      } else {
        await db.company.update({ where: { id: existing.id }, data });
        updated++;
      }
    }
    console.log(`[directory] ${added} added, ${updated} refreshed, ${kept} left alone (claimed by the company).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
