import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/server/dal";
import { rateLimit } from "@/server/rate-limit";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = await rateLimit(`export:${viewer.id}`, 5, 3600);
  if (!rl.ok) return NextResponse.json({ error: "Try again later" }, { status: 429 });
  const id = viewer.id;
  const [user, socials, orders, subscriptions, entitlements, productReviews, companyReviews, posts, comments, messages, bookings, notifications] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, username: true, displayName: true, bio: true, about: true, location: true, timezone: true, website: true,
        markets: true, experience: true, accountType: true, createdAt: true, emailVerifiedAt: true, idVerifiedAt: true, socialsVerifiedAt: true,
      },
    }),
    db.socialLink.findMany({ where: { userId: id }, select: { platform: true, url: true, verifiedAt: true } }),
    db.order.findMany({ where: { OR: [{ buyerId: id }, { sellerId: id }] }, select: { number: true, kind: true, description: true, amountCents: true, currency: true, status: true, createdAt: true, buyerId: true, sellerId: true, feeType: true, platformFeeCents: true, processingFeeCents: true, sellerNetCents: true } }),
    db.subscription.findMany({ where: { buyerId: id }, select: { productId: true, status: true, currentPeriodEnd: true, createdAt: true } }),
    db.entitlement.findMany({ where: { userId: id }, select: { productId: true, status: true, source: true, startsAt: true, endsAt: true } }),
    db.productReview.findMany({ where: { userId: id }, select: { productId: true, rating: true, title: true, body: true, createdAt: true } }),
    db.companyReview.findMany({ where: { userId: id }, select: { companyId: true, rating: true, title: true, body: true, createdAt: true } }),
    db.post.findMany({ where: { authorId: id }, select: { id: true, productId: true, body: true, createdAt: true } }),
    db.comment.findMany({ where: { authorId: id }, select: { postId: true, body: true, createdAt: true } }),
    db.message.findMany({ where: { senderId: id }, select: { conversationId: true, body: true, createdAt: true } }),
    db.booking.findMany({ where: { OR: [{ buyerId: id }, { mentorId: id }] }, select: { productId: true, startsAt: true, endsAt: true, status: true, intake: true } }),
    db.notification.findMany({ where: { userId: id }, select: { type: true, title: true, body: true, createdAt: true }, take: 500, orderBy: { createdAt: "desc" } }),
  ]);
  const payload = { exportedAt: new Date().toISOString(), user, socials, orders, subscriptions, entitlements, productReviews, companyReviews, posts, comments, messages, bookings, notifications };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="tradertrades-${viewer.username}-data.json"`,
      "cache-control": "no-store",
    },
  });
}
