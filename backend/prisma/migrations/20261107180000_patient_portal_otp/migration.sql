-- CreateTable
CREATE TABLE "portal_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_otps_phone_created_at_idx" ON "portal_otps"("phone", "created_at");

