-- Forward migration: 20261020180000_overrun_lifecycle_and_arrival_tracking
-- 1. Add structured phones array to clinic_settings
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "phones" JSONB DEFAULT '[]';

-- 2. Add arrival timestamp, treatment timestamps, and structured overrun lifecycle tracking to appointments
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "arrived_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "actual_start_time" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "actual_end_time" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "overrun_minutes" INTEGER;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "overrun_estimated_end_time" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "overrun_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "overrun_reason" TEXT;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "overrun_updated_at" TIMESTAMP(3);

-- 3. Create index for fast active overrun conflict lookups
CREATE INDEX IF NOT EXISTS "appointments_overrun_active_overrun_estimated_end_time_idx"
  ON "appointments"("overrun_active", "overrun_estimated_end_time");
