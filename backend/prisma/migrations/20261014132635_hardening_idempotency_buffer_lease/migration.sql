-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "buffer_minutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "request_fingerprint" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "notification_jobs" ADD COLUMN     "appointment_revision" INTEGER,
ADD COLUMN     "lease_token" TEXT;
