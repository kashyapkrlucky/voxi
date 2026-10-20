-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('reminder', 'morning_briefing', 'evening_review');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('proposed', 'accepted', 'superseded');

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "kind" "ReminderKind" NOT NULL DEFAULT 'reminder';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "work_end_min" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "work_start_min" INTEGER NOT NULL DEFAULT 540;

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "status" "PlanStatus" NOT NULL DEFAULT 'proposed',
    "blocks" JSONB NOT NULL,
    "unscheduled" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plans_user_id_date_status_idx" ON "plans"("user_id", "date", "status");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
