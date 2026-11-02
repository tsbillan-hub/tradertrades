import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { consumeToken } from "@/server/auth/tokens";
import { audit } from "@/server/audit";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const row = token ? await consumeToken(token, "VERIFY_EMAIL") : null;
  const dest = new URL("/verify-email", request.url);
  if (!row) {
    dest.searchParams.set("status", "expired");
    return NextResponse.redirect(dest);
  }
  const user = await db.user.findUnique({ where: { id: row.userId } });
  const tokenEmail = (row.data as { email?: string } | null)?.email;
  if (!user || (tokenEmail && tokenEmail !== user.email)) {
    dest.searchParams.set("status", "expired");
    return NextResponse.redirect(dest);
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      ...(env.adminEmails.includes(user.email.toLowerCase()) ? { isAdmin: true } : {}),
    },
  });
  await audit(user.id, "user.email.verified", { type: "user", id: user.id });
  dest.searchParams.set("status", "ok");
  return NextResponse.redirect(dest);
}
