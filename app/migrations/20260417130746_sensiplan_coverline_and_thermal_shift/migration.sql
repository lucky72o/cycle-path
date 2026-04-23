-- CreateEnum
CREATE TYPE "InterpretationType" AS ENUM ('THERMAL_SHIFT');

-- CreateEnum
CREATE TYPE "InterpretationState" AS ENUM ('SUGGESTED', 'CONFIRMED', 'ADJUSTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "CycleInterpretation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "type" "InterpretationType" NOT NULL,
    "state" "InterpretationState" NOT NULL DEFAULT 'SUGGESTED',
    "engineResult" JSONB NOT NULL,
    "userOverrides" JSONB,
    "dismissedShiftDay" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "previousEngineResult" JSONB,
    "postShiftMonitoring" JSONB,
    "pendingNudges" JSONB,

    CONSTRAINT "CycleInterpretation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CycleInterpretation_cycleId_type_key" ON "CycleInterpretation"("cycleId", "type");

-- AddForeignKey
ALTER TABLE "CycleInterpretation" ADD CONSTRAINT "CycleInterpretation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
