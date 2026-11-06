-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "payment_method" ADD VALUE 'PAYME';
ALTER TYPE "payment_method" ADD VALUE 'CLICK';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "plan_id" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "recorded_by_id" TEXT,
ADD COLUMN     "refund_of_id" TEXT;

-- AlterTable
ALTER TABLE "treatment_plan_items" ADD COLUMN     "invoice_id" TEXT;

-- CreateTable
CREATE TABLE "online_payments" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_transaction_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_uzs" INTEGER NOT NULL,
    "state" INTEGER NOT NULL DEFAULT 1,
    "reason" INTEGER,
    "provider_time" BIGINT,
    "create_time" BIGINT NOT NULL,
    "perform_time" BIGINT,
    "cancel_time" BIGINT,
    "payment_id" TEXT,
    "refund_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" TEXT NOT NULL,
    "opened_by_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" INTEGER NOT NULL DEFAULT 0,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "expected_cash" INTEGER,
    "counted_cash" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_payment_id_key" ON "online_payments"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_refund_payment_id_key" ON "online_payments"("refund_payment_id");

-- CreateIndex
CREATE INDEX "online_payments_invoice_id_idx" ON "online_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "online_payments_provider_create_time_idx" ON "online_payments"("provider", "create_time");

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_provider_provider_transaction_id_key" ON "online_payments"("provider", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "cash_shifts_opened_at_idx" ON "cash_shifts"("opened_at");

-- CreateIndex
CREATE INDEX "invoices_plan_id_idx" ON "invoices"("plan_id");

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one open cash shift at a time (not expressible in the Prisma schema)
CREATE UNIQUE INDEX "cash_shifts_single_open_idx" ON "cash_shifts" ((true)) WHERE "closed_at" IS NULL;
