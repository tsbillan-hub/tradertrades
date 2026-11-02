-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'REMOVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobRole" ADD VALUE 'CLIPPER';
ALTER TYPE "JobRole" ADD VALUE 'APPOINTMENT_SETTER';
ALTER TYPE "JobRole" ADD VALUE 'CLOSER';

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "removedReason" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "changesNote" TEXT,
ADD COLUMN     "disputeNote" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "disputedById" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "JobPost" ADD COLUMN     "removedReason" TEXT;

-- CreateIndex
CREATE INDEX "Deal_disputedAt_idx" ON "Deal"("disputedAt");
