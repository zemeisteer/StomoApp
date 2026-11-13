-- One open cash shift per branch drawer (null branch = clinic-wide drawer)
ALTER TABLE "cash_shifts" ADD COLUMN "branch_id" TEXT;
CREATE INDEX "cash_shifts_branch_id_idx" ON "cash_shifts"("branch_id");
DROP INDEX IF EXISTS "cash_shifts_single_open_idx";
CREATE UNIQUE INDEX "cash_shifts_single_open_idx" ON "cash_shifts" ((COALESCE("branch_id", ''))) WHERE "closed_at" IS NULL;
