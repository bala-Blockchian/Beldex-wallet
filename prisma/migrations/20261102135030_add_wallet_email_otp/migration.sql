-- AlterTable
ALTER TABLE "otp_verifications" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "walletId" TEXT;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE INDEX "otp_verifications_walletId_status_idx" ON "otp_verifications"("walletId", "status");

-- CreateIndex
CREATE INDEX "otp_verifications_walletId_createdAt_idx" ON "otp_verifications"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
