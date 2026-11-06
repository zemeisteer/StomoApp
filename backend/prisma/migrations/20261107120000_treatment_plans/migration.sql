-- AlterTable
ALTER TABLE "treatment_plan_items" ADD COLUMN     "phase" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "plan_id" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "service_id" TEXT,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unit_price_uzs" INTEGER NOT NULL DEFAULT 0;

-- Existing items: unit price equals their stored line cost (quantity 1)
UPDATE "treatment_plan_items" SET "unit_price_uzs" = "cost_uzs";

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "created_by_id" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "discount_uzs" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approval_token_hash" TEXT,
    "approval_expires_at" TIMESTAMP(3),
    "presented_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "accepted_by_name" TEXT,
    "acceptance_method" TEXT,
    "acceptance_signature" TEXT,
    "acceptance_ip" TEXT,
    "accepted_total_uzs" INTEGER,
    "decline_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_approval_token_hash_key" ON "treatment_plans"("approval_token_hash");

-- CreateIndex
CREATE INDEX "treatment_plans_patient_id_idx" ON "treatment_plans"("patient_id");

-- CreateIndex
CREATE INDEX "treatment_plans_doctor_id_idx" ON "treatment_plans"("doctor_id");

-- CreateIndex
CREATE INDEX "treatment_plan_items_plan_id_idx" ON "treatment_plan_items"("plan_id");

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

