-- Forward Migration: 20261016200000_schedule_revision_and_repair_matching
-- 1. Add schedule_revision to appointments and notification_jobs
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "schedule_revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "notification_jobs" ADD COLUMN IF NOT EXISTS "schedule_revision" INTEGER;
CREATE INDEX IF NOT EXISTS "notification_jobs_schedule_rev_idx" ON "notification_jobs"("appointment_id", "schedule_revision");

-- 2. Populate original_service_id for historical items where missing
UPDATE "appointment_service_items" asi
SET "original_service_id" = a."service_id"
FROM "appointments" a
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%'
  AND asi."original_service_id" IS NULL;

-- 3. Reset historical non-manually-resolved items to safe baseline
-- (Preserves manual staff resolutions 'RESOLVED_MANUAL' and all modern items)
-- Historical Russian translation cleared if it was artificially populated from catalog
UPDATE "appointment_service_items" asi
SET "service_id" = NULL,
    "is_legacy_bundle" = true,
    "legacy_provenance" = 'AMBIGUOUS_BUNDLE',
    "service_name_ru" = NULL
FROM "appointments" a
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%'
  AND asi."legacy_provenance" <> 'RESOLVED_MANUAL';

-- 4. Match and verify historical items using deterministic evidence:
-- A historical item is classified as VERIFIED_SINGLE only when:
-- Preference 1: original_service_id matches existing catalog service and snapshot name matches it directly
-- Preference 2: original_service_id matches existing catalog service, historical name is a single service (no comma), and no other service has this snapshot name
-- Preference 3: Exactly 1 catalog service matches the snapshot name in Uzbek, and original_service_id does NOT point to an existing different service
-- Preference 4: Exactly 1 catalog service matches the snapshot name in Russian, and original_service_id does NOT point to an existing different service

WITH catalog_name_counts AS (
  SELECT
    LOWER(TRIM(name_uz)) as norm_name,
    COUNT(*) as cnt,
    MIN(id) as single_id
  FROM "services"
  GROUP BY LOWER(TRIM(name_uz))
),
catalog_name_ru_counts AS (
  SELECT
    LOWER(TRIM(name_ru)) as norm_name_ru,
    COUNT(*) as cnt,
    MIN(id) as single_id
  FROM "services"
  GROUP BY LOWER(TRIM(name_ru))
),
resolved_candidates AS (
  SELECT
    asi."id" as item_id,
    CASE
      -- Preference 1: original_service_id matches existing catalog service and snapshot name matches it directly
      WHEN orig_s."id" IS NOT NULL AND (orig_s."name_uz" = a."service_name" OR orig_s."name_ru" = a."service_name")
        THEN orig_s."id"
      -- Preference 2: original_service_id matches existing catalog service, historical name is a single service (no comma), and no other service has this snapshot name
      WHEN orig_s."id" IS NOT NULL AND a."service_name" NOT LIKE '%,%' AND COALESCE(cnc."cnt", 0) = 0 AND COALESCE(cnrc."cnt", 0) = 0
        THEN orig_s."id"
      -- Preference 3: Exactly 1 catalog service matches the snapshot name in Uzbek, and original_service_id does NOT point to an existing different service
      WHEN cnc."cnt" = 1 AND (asi."original_service_id" IS NULL OR orig_s."id" IS NULL OR orig_s."id" = cnc."single_id")
        THEN cnc."single_id"
      -- Preference 4: Exactly 1 catalog service matches the snapshot name in Russian, and original_service_id does NOT point to an existing different service
      WHEN cnrc."cnt" = 1 AND (asi."original_service_id" IS NULL OR orig_s."id" IS NULL OR orig_s."id" = cnrc."single_id")
        THEN cnrc."single_id"
      ELSE NULL
    END as resolved_service_id
  FROM "appointment_service_items" asi
  JOIN "appointments" a ON asi."appointment_id" = a."id"
  LEFT JOIN "services" orig_s ON asi."original_service_id" = orig_s."id"
  LEFT JOIN catalog_name_counts cnc ON LOWER(TRIM(a."service_name")) = cnc."norm_name"
  LEFT JOIN catalog_name_ru_counts cnrc ON LOWER(TRIM(a."service_name")) = cnrc."norm_name_ru"
  WHERE asi."id" LIKE 'hist_%'
    AND asi."legacy_provenance" <> 'RESOLVED_MANUAL'
)
UPDATE "appointment_service_items" asi
SET "service_id" = rc."resolved_service_id",
    "is_legacy_bundle" = false,
    "legacy_provenance" = 'VERIFIED_SINGLE'
FROM resolved_candidates rc
WHERE asi."id" = rc."item_id"
  AND rc."resolved_service_id" IS NOT NULL;
