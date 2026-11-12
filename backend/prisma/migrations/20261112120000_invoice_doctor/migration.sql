-- Doctor who billed an invoice that has no visit or plan (e.g. from the tooth chart)
ALTER TABLE "invoices" ADD COLUMN "doctor_id" TEXT;
CREATE INDEX "invoices_doctor_id_idx" ON "invoices"("doctor_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
