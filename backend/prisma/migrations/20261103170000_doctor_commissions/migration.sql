-- CreateTable
CREATE TABLE "doctor_commissions" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL DEFAULT 30,
    "fixed_bonus" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doctor_commissions_doctor_id_key" ON "doctor_commissions"("doctor_id");

-- AddForeignKey
ALTER TABLE "doctor_commissions" ADD CONSTRAINT "doctor_commissions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

