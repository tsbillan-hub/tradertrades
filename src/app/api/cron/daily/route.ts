import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { runSubscriptionUpkeep } from "@/server/commerce/orders";
import { escalateOverdueRefunds } from "@/server/commerce/refunds";
import { features } from "@/lib/env";
import { shortenPayoutHold } from "@/server/stripe";
import { NEW_SELLER_PERIOD_DAYS } from "@/lib/fees";
import { bookingUpkeep } from "@/server/bookings";
import { businessUpkeep } from "@/server/business";
import { runTestPayouts } from "@/server/commerce/payouts";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily upkeep, called by Vercel Cron with "Authorization: Bearer $CRON_SECRET". */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const allowed = secret ? auth === `Bearer ${secret}` : !env.isProd;
  if (!allowed) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400_000);
  const subscriptions = await runSubscriptionUpkeep(now);
  const refundsEscalated = await escalateOverdueRefunds(now);
  // Call reminders (calls in the next 36 hours) and calls that ended a day ago count as done.
  const bookings = await bookingUpkeep(now);
  // Campaign work approved after 7 quiet days, Sponsored spots switched on and off, old job posts closed.
  const business = await businessUpkeep(now);
  // Mondays: the weekly payout run. With Stripe connected, Stripe pays creators on its own weekly schedule.
  const payouts = now.getUTCDay() === 1 ? await runTestPayouts() : null;
  const [staleOrders, sessions, tokens, limits, views] = await Promise.all([
    db.order.updateMany({ where: { status: "PENDING", createdAt: { lt: dayAgo } }, data: { status: "CANCELED" } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    db.rateLimit.deleteMany({ where: { resetAt: { lt: dayAgo } } }),
    // Stats keep about 13 months of visits.
    db.pageView.deleteMany({ where: { day: { lt: new Date(now.getTime() - 400 * 86400_000) } } }),
  ]);
  // Sellers past their first 60 days get the shorter payout hold at Stripe too.
  let holdsShortened = 0;
  if (features.stripe) {
    const from = new Date(now.getTime() - (NEW_SELLER_PERIOD_DAYS + 7) * 86400_000);
    const to = new Date(now.getTime() - NEW_SELLER_PERIOD_DAYS * 86400_000);
    const sellers = await db.creatorProfile.findMany({ where: { stripeAccountId: { not: null }, approvedAt: { gte: from, lte: to }, payoutsPausedAt: null }, select: { stripeAccountId: true } });
    for (const s of sellers) {
      try {
        await shortenPayoutHold(s.stripeAccountId!);
        holdsShortened++;
      } catch (err) {
        console.error("[cron] payout hold", err);
      }
    }
  }
  return Response.json({
    ok: true,
    holdsShortened,
    payouts,
    subscriptions,
    refundsEscalated,
    bookings,
    business,
    staleOrdersCanceled: staleOrders.count,
    cleaned: { sessions: sessions.count, tokens: tokens.count, rateLimits: limits.count, views: views.count },
  });
}
