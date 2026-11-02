import "server-only";
import { cookies } from "next/headers";

/** A one-time toast shown on the next page the person lands on. */
export async function flash(text: string, kind: "success" | "error" | "info" = "success") {
  const jar = await cookies();
  jar.set("tt_flash", JSON.stringify({ text, kind }), { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false });
}
