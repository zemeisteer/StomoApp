-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN "telegram_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_telegram_user_id_key" ON "staff_users"("telegram_user_id");
