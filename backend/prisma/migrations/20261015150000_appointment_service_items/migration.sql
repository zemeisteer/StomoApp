-- CreateTable
CREATE TABLE "appointment_service_items" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "service_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "service_name_uz" TEXT NOT NULL,
    "service_name_ru" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "price_from" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_service_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_service_items_appointment_id_idx" ON "appointment_service_items"("appointment_id");

-- CreateIndex
CREATE INDEX "appointment_service_items_service_id_idx" ON "appointment_service_items"("service_id");

-- AddForeignKey
ALTER TABLE "appointment_service_items" ADD CONSTRAINT "appointment_service_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_service_items" ADD CONSTRAINT "appointment_service_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Forward migration: Backfill historical single-service appointments into appointment_service_items
INSERT INTO "appointment_service_items" (
    "id",
    "appointment_id",
    "service_id",
    "sort_order",
    "service_name_uz",
    "service_name_ru",
    "duration_minutes",
    "price_from",
    "created_at"
)
SELECT
    concat('hist_', a."id"),
    a."id",
    a."service_id",
    0,
    COALESCE(s."name_uz", a."service_name"),
    s."name_ru",
    a."duration_minutes",
    a."service_price_from",
    a."created_at"
FROM "appointments" a
LEFT JOIN "services" s ON a."service_id" = s."id"
ON CONFLICT ("id") DO NOTHING;
