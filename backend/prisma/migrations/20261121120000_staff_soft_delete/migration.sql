-- AlterTable: deleted staff keep their row (history stays attributed); null = not deleted
ALTER TABLE "staff_users" ADD COLUMN     "deleted_at" TIMESTAMP(3);
