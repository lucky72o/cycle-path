-- CreateEnum
CREATE TYPE "CervicalAppearance" AS ENUM ('NONE', 'STICKY', 'CREAMY', 'WATERY', 'EGGWHITE');

-- CreateEnum
CREATE TYPE "CervicalSensation" AS ENUM ('DRY', 'DAMP', 'WET', 'SLIPPERY');

-- AlterTable
ALTER TABLE "CycleDay" ADD COLUMN     "cervicalAppearance" "CervicalAppearance",
ADD COLUMN     "cervicalSensation" "CervicalSensation";
