import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/dal";
import { rateLimit } from "@/server/rate-limit";

/**
 * "Visit website" for a directory listing: counts the click for the company's stats, then sends the visitor on.
 * ?from= says where on TraderTrades the click came from. ?offer= sends them to that offer's link.
 * The same visitor clicking again within an hour isn't counted twice.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const company = /^[a-z0-9-]{1,80}$/.test(slug)
    ? await db.company.findUnique({ where: { slug }, select: { id: true, status: true, website: true, affiliateUrl: true } })
    : null;
  if (!company || company.status !== "PUBLISHED") return NextResponse.redirect(new URL("/directory", request.url));

  const params = request.nextUrl.searchParams;
  const offerId = params.get("offer");
  const offer = offerId ? await db.companyOffer.findFirst({ where: { id: offerId, companyId: company.id, active: true }, select: { url: true } }) : null;
  const dest = safeHttpUrl(offer?.url) ?? safeHttpUrl(company.affiliateUrl) ?? safeHttpUrl(company.website);
  if (!dest) return NextResponse.redirect(new URL("/directory", request.url));

  const source = (params.get("from") ?? "").replace(/[^a-z0-9:_-]/gi, "").slice(0, 40) || null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const bot = /bot|crawl|spider|preview|fetch/i.test(request.headers.get("user-agent") ?? "");
  const viewer = await getViewer();

  if (!bot) {
    after(async () => {
      const fresh = await rateLimit(`click:${company.id}:${viewer?.id ?? ip}`, 1, 3600);
      if (!fresh.ok) return;
      await db.$transaction([
        db.outboundClick.create({ data: { companyId: company.id, userId: viewer?.id ?? null, source } }),
        db.company.update({ where: { id: company.id }, data: { clickCount: { increment: 1 } } }),
      ]);
    });
  }

  const res = NextResponse.redirect(dest, 302);
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "origin");
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

function safeHttpUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
