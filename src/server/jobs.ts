import "server-only";
import { db } from "@/lib/db";

/** Job posts close on their own after this long, so the board doesn't fill up with filled roles. */
export const JOB_DAYS = 60;

/** The poster, or anyone on the team of the company it was posted for. */
export async function managesJob(job: { posterId: string; companyId: string | null }, userId: string | null | undefined) {
  if (!userId) return false;
  if (job.posterId === userId) return true;
  if (!job.companyId) return false;
  const member = await db.businessMember.findUnique({ where: { companyId_userId: { companyId: job.companyId, userId } }, select: { userId: true } });
  return Boolean(member);
}

/** Open, and its 60 days haven't run out. (The daily upkeep closes expired posts properly and tells the poster.) */
export function jobIsOpen(job: { status: string; expiresAt: Date | null }, now = new Date()) {
  return job.status === "OPEN" && (!job.expiresAt || job.expiresAt > now);
}
