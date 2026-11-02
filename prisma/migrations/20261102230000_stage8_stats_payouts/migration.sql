-- CreateEnum
CREATE TYPE "ViewTarget" AS ENUM ('PROFILE', 'PRODUCT', 'COMPANY', 'LINK');

-- AlterTable
ALTER TABLE "CreatorProfile" ADD COLUMN     "payoutsPausedAt" TIMESTAMP(3),
ADD COLUMN     "payoutsPausedReason" TEXT;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "stripePayoutId" TEXT;

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "target" "ViewTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "visitor" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "audienceLabel" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorEmailOptOut" (
    "userId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorEmailOptOut_pkey" PRIMARY KEY ("userId","creatorId")
);

-- CreateIndex
CREATE INDEX "PageView_ownerId_day_idx" ON "PageView"("ownerId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PageView_target_targetId_day_visitor_key" ON "PageView"("target", "targetId", "day", "visitor");

-- CreateIndex
CREATE INDEX "Broadcast_creatorId_createdAt_idx" ON "Broadcast"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "CreatorEmailOptOut_creatorId_idx" ON "CreatorEmailOptOut"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_stripePayoutId_key" ON "Payout"("stripePayoutId");

-- CreateIndex
CREATE INDEX "Payout_userId_createdAt_idx" ON "Payout"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEmailOptOut" ADD CONSTRAINT "CreatorEmailOptOut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEmailOptOut" ADD CONSTRAINT "CreatorEmailOptOut_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
