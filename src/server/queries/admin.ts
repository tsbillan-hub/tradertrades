import "server-only";
import type { ReportTarget } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** How many things wait in each admin queue. A report or flag counts once per reported thing. */
export async function adminCounts() {
  const [reports, flags, verification, suggestions, proof, refunds, listings] = await Promise.all([
    db.report.groupBy({ by: ["targetType", "targetId"], where: { status: "OPEN" } }).then((g) => g.length),
    db.moderationFlag.groupBy({ by: ["targetType", "targetId"], where: { status: "OPEN" } }).then((g) => g.length),
    db.verificationRequest.count({ where: { status: "PENDING", kind: { in: ["IDENTITY", "SOCIALS"] } } }),
    db.companySuggestion.count({ where: { status: "PENDING" } }),
    db.companyReview.count({ where: { proofStatus: "PENDING", status: { not: "REMOVED" } } }),
    db.refund.count({ where: { status: "REQUESTED", escalatedAt: { not: null } } }),
    db.product.count({ where: { status: "PUBLISHED", checkedAt: null, isSample: false } }),
  ]);
  return { reports, flags, verification, suggestions, proof, refunds, listings };
}

export type AdminCounts = Awaited<ReturnType<typeof adminCounts>>;

/** Groups rows by the thing they are about, oldest first, keeping every row. */
export function groupByTarget<T extends { targetType: ReportTarget; targetId: string }>(rows: T[]) {
  const groups = new Map<string, { targetType: ReportTarget; targetId: string; rows: T[] }>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else groups.set(key, { targetType: r.targetType, targetId: r.targetId, rows: [r] });
  }
  return [...groups.values()];
}

/** Reads a page number from the query string. */
export function pageParam(v: string | undefined) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
