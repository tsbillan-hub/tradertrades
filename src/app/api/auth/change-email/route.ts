import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { consumeToken } from "@/server/auth/tokens";
import { emails } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { audit } from "@/server/audit";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const row = token ? await consumeToken(token, "CHANGE_EMAIL") : null;
  const dest = new URL("/settings/account", request.url);
  const newEmail = (row?.data as { email?: string } | null)?.email;
  if (!row || !newEmail) {
    dest.searchParams.set("email", "expired");
    return NextResponse.redirect(dest);
  }
  const taken = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken) {
    dest.searchParams.set("email", "taken");
    return NextResponse.redirect(dest);
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: row.userId } });
  await db.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerifiedAt: new Date() } });
  await sendEmail(user.email, emails.emailChanged(user.displayName, newEmail), { template: "email-changed", userId: user.id });
  await audit(user.id, "user.email.change", { type: "user", id: user.id }, { from: user.email, to: newEmail });
  dest.searchParams.set("email", "changed");
  return NextResponse.redirect(dest);
}
