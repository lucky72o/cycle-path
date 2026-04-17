import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Backfill past cycles so endDate matches the last recorded day.
 * - For inactive cycles: endDate -> max(days.date) if days exist.
 * - If no days exist: keep existing endDate.
 *
 * Run from the app/ directory after `wasp db migrate-dev`:
 *   cd app && npx tsx ../scripts/fixCycleEndDates.ts
 *
 * Requires DATABASE_URL to be set (Wasp sets this automatically
 * when you use `wasp start`; for standalone runs, export it first).
 */
async function main() {
  const cycles = await prisma.cycle.findMany({
    where: { isActive: false },
    include: {
      days: {
        orderBy: { date: 'desc' },
        take: 1
      }
    }
  });

  let updated = 0;

  for (const cycle of cycles) {
    const lastDay = cycle.days[0];
    if (!lastDay) continue;

    const lastDayDate = new Date(lastDay.date);
    const currentEndDate = cycle.endDate ? new Date(cycle.endDate) : null;

    // Only update if endDate is missing or after the last recorded day
    if (!currentEndDate || currentEndDate.getTime() !== lastDayDate.getTime()) {
      await prisma.cycle.update({
        where: { id: cycle.id },
        data: { endDate: lastDayDate }
      });
      updated += 1;
    }
  }

  console.log(`Updated ${updated} cycles.`);
}

main()
  .catch((err) => {
    console.error('Failed to backfill cycle end dates', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

