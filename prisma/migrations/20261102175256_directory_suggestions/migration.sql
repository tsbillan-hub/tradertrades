-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ADDED', 'REJECTED');

-- CreateTable
CREATE TABLE "CompanySuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "category" "CompanyCategory" NOT NULL,
    "note" TEXT,
    "worksThere" BOOLEAN NOT NULL DEFAULT false,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanySuggestion_status_createdAt_idx" ON "CompanySuggestion"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanySuggestion" ADD CONSTRAINT "CompanySuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySuggestion" ADD CONSTRAINT "CompanySuggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
