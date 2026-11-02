import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/server/auth/session";
import type { MemberRole } from "@/generated/prisma/enums";

export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

/** The signed in user for this request, or null. Banned and half-signed-in (2FA) sessions count as signed out. */
export const getViewer = cache(async () => {
  const s = await readSession();
  if (!s || s.twoFactorPending) return null;
  if (s.user.status === "BANNED" || s.user.status === "DELETED") return null;
  return s.user;
});

export async function currentPath() {
  const h = await headers();
  return h.get("x-tt-path") ?? "/";
}

export async function requireUser() {
  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent(await currentPath())}`);
  return user;
}

/** Signed in and email confirmed. */
export async function requireVerifiedUser() {
  const user = await requireUser();
  if (!user.emailVerifiedAt) redirect(`/verify-email?next=${encodeURIComponent(await currentPath())}`);
  return user;
}

export function isActive(user: { status: string }) {
  return user.status === "ACTIVE";
}

export async function requireCreator() {
  const user = await requireVerifiedUser();
  if (user.creator?.status !== "APPROVED") redirect("/creator/start");
  return user as typeof user & { creator: NonNullable<typeof user.creator> };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}

export async function companiesFor(userId: string) {
  return db.businessMember.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });
}

/** The user's role at a company, or redirect if they are not on its team. */
export async function requireCompanyMember(companyId: string, roles: MemberRole[] = ["OWNER", "ADMIN", "MEMBER"]) {
  const user = await requireVerifiedUser();
  const member = await db.businessMember.findUnique({
    where: { companyId_userId: { companyId, userId: user.id } },
    include: { company: true },
  });
  if (!member && !user.isAdmin) redirect("/business");
  if (member && !roles.includes(member.role) && !user.isAdmin) redirect("/business");
  const company = member?.company ?? (await db.company.findUnique({ where: { id: companyId } }));
  if (!company) notFound();
  return { user, company, role: member?.role ?? ("OWNER" as MemberRole) };
}
