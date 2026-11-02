import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { getViewer } from "@/server/dal";

/**
 * Shows a saved email. Admins can open any of them (the outbox). In preview mode with no email
 * service connected, people can also open their own, so sign up works before email is set up.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in first", { status: 401 });
  const email = await db.emailLog.findUnique({ where: { id } });
  const ownerMayView = env.demoMode && !features.email && email?.userId === viewer.id;
  if (!email || (!ownerMayView && !viewer.isAdmin)) return new Response("Not found", { status: 404 });
  // A big send keeps the full body only on the first copy of each batch.
  const html = email.html || `<p style="font-family:sans-serif;padding:24px">The full text isn't kept for every copy of a large send. Open an earlier copy of "${email.subject.replace(/[<>&"]/g, "")}" to see it.</p>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "x-robots-tag": "noindex",
    },
  });
}
