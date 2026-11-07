-- AlterEnum
ALTER TYPE "staff_role" ADD VALUE IF NOT EXISTS 'RECEPTION';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "inventory_movement_type" AS ENUM ('RESTOCK', 'USAGE', 'ADJUSTMENT', 'RETURN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "odontogram_records" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "appointment_id" TEXT,
    "tooth_number" INTEGER NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'HEALTHY',
    "chart_type" TEXT NOT NULL DEFAULT 'ADULT',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "odontogram_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tooth_surface_records" (
    "id" TEXT NOT NULL,
    "odontogram_record_id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "condition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tooth_surface_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "treatment_plan_items" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "appointment_id" TEXT,
    "tooth_number" INTEGER,
    "treatment_name_uz" TEXT NOT NULL,
    "treatment_name_ru" TEXT,
    "cost_uzs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'dona',
    "min_threshold" INTEGER NOT NULL DEFAULT 10,
    "unit_cost" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inventory_movements" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "change_type" "inventory_movement_type" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" TEXT,
    "performed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "appointment_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "patient_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "odontogram_records_patient_id_tooth_number_key" ON "odontogram_records"("patient_id", "tooth_number");
CREATE INDEX IF NOT EXISTS "odontogram_records_patient_id_idx" ON "odontogram_records"("patient_id");
CREATE INDEX IF NOT EXISTS "odontogram_records_doctor_id_idx" ON "odontogram_records"("doctor_id");

CREATE UNIQUE INDEX IF NOT EXISTS "tooth_surface_records_odontogram_record_id_surface_key" ON "tooth_surface_records"("odontogram_record_id", "surface");

CREATE INDEX IF NOT EXISTS "treatment_plan_items_patient_id_idx" ON "treatment_plan_items"("patient_id");
CREATE INDEX IF NOT EXISTS "treatment_plan_items_doctor_id_idx" ON "treatment_plan_items"("doctor_id");

CREATE INDEX IF NOT EXISTS "invoices_patient_id_idx" ON "invoices"("patient_id");
CREATE INDEX IF NOT EXISTS "invoices_appointment_id_idx" ON "invoices"("appointment_id");

CREATE INDEX IF NOT EXISTS "inventory_movements_inventory_item_id_idx" ON "inventory_movements"("inventory_item_id");

CREATE INDEX IF NOT EXISTS "payments_appointment_id_idx" ON "payments"("appointment_id");
CREATE INDEX IF NOT EXISTS "payments_invoice_id_idx" ON "payments"("invoice_id");
CREATE INDEX IF NOT EXISTS "payments_patient_id_idx" ON "payments"("patient_id");

-- Safe Foreign Keys
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_id_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_patient_id_fkey') THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odontogram_records_patient_id_fkey') THEN
        ALTER TABLE "odontogram_records" ADD CONSTRAINT "odontogram_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odontogram_records_doctor_id_fkey') THEN
        ALTER TABLE "odontogram_records" ADD CONSTRAINT "odontogram_records_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'odontogram_records_appointment_id_fkey') THEN
        ALTER TABLE "odontogram_records" ADD CONSTRAINT "odontogram_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tooth_surface_records_odontogram_record_id_fkey') THEN
        ALTER TABLE "tooth_surface_records" ADD CONSTRAINT "tooth_surface_records_odontogram_record_id_fkey" FOREIGN KEY ("odontogram_record_id") REFERENCES "odontogram_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plan_items_patient_id_fkey') THEN
        ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plan_items_doctor_id_fkey') THEN
        ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plan_items_appointment_id_fkey') THEN
        ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_patient_id_fkey') THEN
        ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_appointment_id_fkey') THEN
        ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_inventory_item_id_fkey') THEN
        ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_performed_by_id_fkey') THEN
        ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
