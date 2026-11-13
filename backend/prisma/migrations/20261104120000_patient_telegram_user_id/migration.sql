-- AlterTable
ALTER TABLE "patients" ADD COLUMN "telegram_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "patients_telegram_user_id_key" ON "patients"("telegram_user_id");

