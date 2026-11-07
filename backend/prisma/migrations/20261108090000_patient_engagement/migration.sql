-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "birthday_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recall_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recall_months" INTEGER NOT NULL DEFAULT 6;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "last_recall_at" TIMESTAMP(3),
ADD COLUMN     "marketing_opt_out" BOOLEAN NOT NULL DEFAULT false;

