-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "priceFromCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "escalatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_status_priceFromCents_idx" ON "Product"("status", "priceFromCents");
