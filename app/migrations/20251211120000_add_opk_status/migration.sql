-- CreateEnum
CREATE TYPE "OpkStatus" AS ENUM ('low', 'rising', 'peak', 'declining');

-- AlterTable
ALTER TABLE "CycleDay" ADD COLUMN "opkStatus" "OpkStatus";

