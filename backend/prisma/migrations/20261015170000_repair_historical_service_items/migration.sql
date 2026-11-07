-- AlterTable: Add is_legacy_bundle to distinguish unresolved legacy bundles from known single-service items
ALTER TABLE "appointment_service_items" ADD COLUMN "is_legacy_bundle" BOOLEAN NOT NULL DEFAULT false;

-- 1. Repair historical backfill records ('hist_%'):
-- Preserve the appointment's authoritative historical snapshot name as primary!
UPDATE "appointment_service_items" asi
SET "service_name_uz" = a."service_name"
FROM "appointments" a
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%'
  AND a."service_name" IS NOT NULL;

-- 2. Repair Russian translation for single-service historical records:
-- Only keep s.name_ru if the appointment's historical name matched the single catalog service name.
-- Clear fabricated translations where historical name differed or was a bundle.
UPDATE "appointment_service_items" asi
SET "service_name_ru" = NULL
FROM "appointments" a
LEFT JOIN "services" s ON a."service_id" = s."id"
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%'
  AND (s."id" IS NULL OR a."service_name" <> s."name_uz");

-- 3. Distinguish unresolved legacy bundles (multi-service appointments with combined names or commas):
-- Disassociate from primary service_id so analytics do NOT falsely attribute the complete bundle to a single service!
-- Set is_legacy_bundle = true to indicate an unresolved legacy bundle.
UPDATE "appointment_service_items" asi
SET "service_id" = NULL,
    "service_name_ru" = NULL,
    "is_legacy_bundle" = true
FROM "appointments" a
WHERE asi."appointment_id" = a."id"
  AND asi."id" LIKE 'hist_%'
  AND a."service_name" LIKE '%,%';
