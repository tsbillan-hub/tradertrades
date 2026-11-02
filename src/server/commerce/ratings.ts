import "server-only";
import { db } from "@/lib/db";

/** Recomputes the cached rating on a product from its published reviews. */
export async function refreshRating(productId: string) {
  const agg = await db.productReview.aggregate({ where: { productId, status: "PUBLISHED" }, _avg: { rating: true }, _count: true });
  await db.product.update({ where: { id: productId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
}
