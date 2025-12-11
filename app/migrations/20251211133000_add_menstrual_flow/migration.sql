-- CreateEnum
CREATE TYPE "MenstrualFlow" AS ENUM ('SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY', 'VERY_HEAVY');

-- AlterTable
ALTER TABLE "CycleDay" ADD COLUMN "menstrualFlow" "MenstrualFlow";

