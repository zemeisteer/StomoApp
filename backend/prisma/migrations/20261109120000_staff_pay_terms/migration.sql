-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('PERCENT', 'SALARY', 'MIXED');

-- AlterTable
ALTER TABLE "doctor_commissions" ADD COLUMN     "monthly_salary" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pay_type" "PayType" NOT NULL DEFAULT 'PERCENT';

-- CreateTable
CREATE TABLE "staff_compensations" (
    "id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "pay_type" "PayType" NOT NULL DEFAULT 'SALARY',
    "monthly_salary" INTEGER NOT NULL DEFAULT 0,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "fixed_bonus" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_compensations_staff_user_id_key" ON "staff_compensations"("staff_user_id");

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

