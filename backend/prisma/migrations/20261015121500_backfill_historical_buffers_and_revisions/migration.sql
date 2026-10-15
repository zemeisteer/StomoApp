-- 1. Forward migration: Reconstruct historical buffer_minutes from stored end_time, start_time, and duration_minutes
-- Only for reliable rows where end_time > start_time and the derived buffer is between 0 and 120 minutes.
UPDATE "appointments"
SET "buffer_minutes" = ROUND(EXTRACT(EPOCH FROM ("end_time" - "start_time")) / 60)::integer - "duration_minutes"
WHERE "end_time" IS NOT NULL
  AND "start_time" IS NOT NULL
  AND "duration_minutes" > 0
  AND ROUND(EXTRACT(EPOCH FROM ("end_time" - "start_time")) / 60)::integer - "duration_minutes" >= 0
  AND ROUND(EXTRACT(EPOCH FROM ("end_time" - "start_time")) / 60)::integer - "duration_minutes" <= 120;

-- 2. Backfill appointment_revision on historical notification_jobs from their linked appointment
UPDATE "notification_jobs" nj
SET "appointment_revision" = a."revision"
FROM "appointments" a
WHERE nj."appointment_id" = a."id"
  AND nj."appointment_revision" IS NULL;
