import "server-only";
import { db } from "@/lib/db";

/** Keeps Product.priceFromCents (used by price filters and sorting) in step with its active prices. */
export async function syncPriceFrom(productId: string) {
  const cheapest = await db.price.findFirst({ where: { productId, active: true }, orderBy: { amountCents: "asc" }, select: { amountCents: true } });
  await db.product.update({ where: { id: productId }, data: { priceFromCents: cheapest?.amountCents ?? 0 } });
}
