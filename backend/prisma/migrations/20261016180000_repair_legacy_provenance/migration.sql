-- Forward Migration: 20261016180000_repair_legacy_provenance
-- Introduce explicit provenance and review status for historical records without guesswork.

-- 1. AlterTable: Add original_service_id and legacy_provenance columns
ALTER TABLE "appointment_service_items" ADD COLUMN IF NOT EXISTS "original_service_id" TEXT;
ALTER TABLE "appointment_service_items" ADD COLUMN IF NOT EXISTS "legacy_provenance" TEXT NOT NULL DEFAULT 'MODERN';

-- 2. Create index on legacy_provenance
CREATE INDEX IF NOT EXISTS "appointment_service_items_legacy_provenance_idx" ON "appointment_service_items"("legacy_provenance");

-- 3. Populate original_service_id from appointments table for all historical items
UPDATE "appointment_service_items" asi
SET "original_service_id" = a."service_id"
FROM "appointments" a
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%';

-- 4. Classify verified single-service items using reliable evidence:
-- If the historical appointment's snapshot name exactly matches a catalog service's name (Uzbek or Russian),
-- or matches its primary service, even if the legitimate service name contains a comma (e.g. "Konsultatsiya, birlamchi"),
-- it is reliably a single service. Restore service_id, set is_legacy_bundle = false, and set provenance = 'VERIFIED_SINGLE'.
UPDATE "appointment_service_items" asi
SET "service_id" = s."id",
    "service_name_ru" = s."name_ru",
    "is_legacy_bundle" = false,
    "legacy_provenance" = 'VERIFIED_SINGLE'
FROM "appointments" a
JOIN "services" s ON (s."name_uz" = a."service_name" OR s."name_ru" = a."service_name" OR (s."id" = a."service_id" AND a."service_name" NOT LIKE '%,%'))
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%';

-- 5. For historical items where historical name didn't match catalog but no comma exists (e.g. renamed service):
-- If it has a primary service_id in appointments and was already linked, classify as 'VERIFIED_SINGLE'
UPDATE "appointment_service_items" asi
SET "legacy_provenance" = 'VERIFIED_SINGLE'
WHERE asi."id" LIKE 'hist_%'
  AND asi."is_legacy_bundle" = false
  AND asi."legacy_provenance" = 'MODERN';

-- 6. For truly ambiguous records: historical multi-service appointments with combined names
-- that do NOT match any single catalog service.
-- Keep is_legacy_bundle = true, service_id = NULL, and set legacy_provenance = 'AMBIGUOUS_BUNDLE'.
-- Note: original_service_id retains the primary service ID from the appointment for provenance tracking.
UPDATE "appointment_service_items" asi
SET "is_legacy_bundle" = true,
    "legacy_provenance" = 'AMBIGUOUS_BUNDLE',
    "service_id" = NULL
FROM "appointments" a
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%'
  AND asi."legacy_provenance" <> 'VERIFIED_SINGLE'
  AND a."service_name" LIKE '%,%';
