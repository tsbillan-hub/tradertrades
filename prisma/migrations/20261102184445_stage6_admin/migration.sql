-- AlterEnum
ALTER TYPE "VideoStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "CompanySuggestion" ADD COLUMN     "reviewNote" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "checkedAt" TIMESTAMP(3);
