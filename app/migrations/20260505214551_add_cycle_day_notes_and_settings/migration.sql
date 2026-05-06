-- AlterTable
ALTER TABLE "CycleDay" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "notesRowExpanded" BOOLEAN NOT NULL DEFAULT false;
