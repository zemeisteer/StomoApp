-- AlterTable: existing accounts keep working (default false); only new or reset ones must change.
ALTER TABLE "staff_users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
