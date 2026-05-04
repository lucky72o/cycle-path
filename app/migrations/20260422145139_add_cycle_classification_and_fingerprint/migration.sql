-- AlterTable
ALTER TABLE "Cycle" ADD COLUMN     "markedAnovulatoryAt" TIMESTAMP(3),
ADD COLUMN     "markedUninterpretableAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CycleInterpretation" ADD COLUMN     "dismissedDataFingerprint" TEXT;
