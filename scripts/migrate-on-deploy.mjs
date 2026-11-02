// Applies database migrations during a Vercel build (or when MIGRATE_ON_BUILD=1).
// Local builds skip it so `npm run build` never touches your dev database by surprise.
import { execSync } from "node:child_process";

const onVercel = process.env.VERCEL === "1";
const forced = process.env.MIGRATE_ON_BUILD === "1";

if (!onVercel && !forced) {
  console.log("[migrate] Skipped (not a Vercel build). Set MIGRATE_ON_BUILD=1 to run it.");
  process.exit(0);
}
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  console.error("[migrate] No DATABASE_URL. In Vercel, open Storage and connect a Postgres database (Neon), then redeploy.");
  process.exit(1);
}
console.log("[migrate] Applying migrations...");
execSync("npx prisma migrate deploy", { stdio: "inherit" });

// Keep the starting directory listings in place (claimed listings are never touched).
if (process.env.DATABASE_URL) {
  console.log("[migrate] Refreshing directory listings...");
  execSync("npx tsx scripts/seed-directory.ts", { stdio: "inherit" });
}
