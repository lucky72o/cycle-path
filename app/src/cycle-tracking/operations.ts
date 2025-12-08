import { HttpError } from 'wasp/server';
import type {
  GetUserCycles,
  GetCycleById,
  GetCycleDays,
  GetUserSettings,
  CreateCycle,
  CreateOrUpdateCycleDay,
  UpdateUserTemperaturePreference,
  EndCycle,
  DeleteCycle,
  UpdateCycle,
  DeleteCycleDay
} from 'wasp/server/operations';
import type { Cycle, CycleDay, UserSettings } from 'wasp/entities';
import { getDayOfWeek } from './utils';

// TemperatureUnit type - matches Prisma enum
// Will be available from '@prisma/client' after running migration
type TemperatureUnit = 'FAHRENHEIT' | 'CELSIUS';

// ===== QUERIES =====

/**
 * Get all cycles for the current user
 */
type CycleWithDays = Cycle & { days: CycleDay[] };

/**
 * Ensure an inactive cycle's endDate matches the last recorded day, and return the normalized cycle.
 */
async function ensureCycleEndDate(
  cycle: CycleWithDays,
  context: any // Wasp context type not re-exported here
): Promise<CycleWithDays> {
  if (cycle.isActive) {
    return cycle;
  }

  const lastDay = cycle.days.length > 0 ? cycle.days[cycle.days.length - 1] : null;
  if (!lastDay) {
    return cycle;
  }

  const lastDayDate = new Date(lastDay.date);
  const currentEndDate = cycle.endDate ? new Date(cycle.endDate) : null;

  if (!currentEndDate || currentEndDate.getTime() !== lastDayDate.getTime()) {
    const updated = await context.entities.Cycle.update({
      where: { id: cycle.id },
      data: { endDate: lastDayDate },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' }
        }
      }
    });
    return updated as CycleWithDays;
  }

  return cycle;
}

export const getUserCycles: GetUserCycles<void, CycleWithDays[]> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  const cycles = await context.entities.Cycle.findMany({
    where: { userId: context.user.id },
    orderBy: { cycleNumber: 'desc' },
    include: {
      days: {
        orderBy: { dayNumber: 'asc' }
      }
    }
  }) as CycleWithDays[];

  // Normalize past cycles so endDate reflects the last recorded day
  const normalizedCycles = await Promise.all(
    cycles.map((cycle) => ensureCycleEndDate(cycle, context))
  );

  return normalizedCycles;
};

/**
 * Get a specific cycle by ID with all its days
 */
type GetCycleByIdArgs = { cycleId: string };
export const getCycleById: GetCycleById<GetCycleByIdArgs, CycleWithDays | null> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  const cycle = await context.entities.Cycle.findFirst({
    where: {
      id: args.cycleId,
      userId: context.user.id
    },
    include: {
      days: {
        orderBy: { dayNumber: 'asc' }
      }
    }
  });

  if (!cycle) {
    throw new HttpError(404, 'Cycle not found');
  }

  return cycle as CycleWithDays;
};

/**
 * Get cycle days for a specific cycle
 */
type GetCycleDaysArgs = { cycleId: string };
export const getCycleDays: GetCycleDays<GetCycleDaysArgs, CycleDay[]> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Verify the cycle belongs to the user
  const cycle = await context.entities.Cycle.findFirst({
    where: {
      id: args.cycleId,
      userId: context.user.id
    }
  });

  if (!cycle) {
    throw new HttpError(404, 'Cycle not found');
  }

  return context.entities.CycleDay.findMany({
    where: { cycleId: args.cycleId },
    orderBy: { dayNumber: 'asc' }
  });
};

/**
 * Get user settings (create if doesn't exist)
 */
export const getUserSettings: GetUserSettings<void, UserSettings> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  let settings = await context.entities.UserSettings.findUnique({
    where: { userId: context.user.id }
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await context.entities.UserSettings.create({
      data: {
        userId: context.user.id,
        temperatureUnit: 'FAHRENHEIT'
      }
    });
  }

  return settings;
};

// ===== ACTIONS =====

/**
 * Create a new cycle
 */
type CreateCycleArgs = { startDate: string };
export const createCycle: CreateCycle<CreateCycleArgs, CycleWithDays> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Set any currently active cycle to inactive, ensuring endDate reflects the last recorded day
  const activeCycles = await context.entities.Cycle.findMany({
    where: {
      userId: context.user.id,
      isActive: true
    },
    orderBy: { cycleNumber: 'desc' },
    include: {
      days: {
        orderBy: { dayNumber: 'desc' },
        take: 1
      }
    }
  });

  const newCycleStartDate = new Date(args.startDate);

  await Promise.all(
    activeCycles.map(async (cycle) => {
      const lastRecordedDay = cycle.days[0];

      // If no days were recorded, fall back to the day before the new cycle starts (but not before the cycle start)
      const fallbackEndDate = new Date(Math.max(
        newCycleStartDate.getTime() - 24 * 60 * 60 * 1000,
        new Date(cycle.startDate).getTime()
      ));

      const endDate = lastRecordedDay ? new Date(lastRecordedDay.date) : fallbackEndDate;

      await context.entities.Cycle.update({
        where: { id: cycle.id },
        data: {
          isActive: false,
          endDate
        }
      });
    })
  );

  // Get the next cycle number
  const lastCycle = await context.entities.Cycle.findFirst({
    where: { userId: context.user.id },
    orderBy: { cycleNumber: 'desc' }
  });

  const nextCycleNumber = lastCycle ? lastCycle.cycleNumber + 1 : 1;

  // Create new cycle
  const newCycle = await context.entities.Cycle.create({
    data: {
      userId: context.user.id,
      startDate: new Date(args.startDate),
      cycleNumber: nextCycleNumber,
      isActive: true
    },
    include: {
      days: true
    }
  });

  return newCycle as CycleWithDays;
};

/**
 * Create or update a cycle day entry
 */
type CreateOrUpdateCycleDayArgs = {
  cycleId: string;
  dayNumber?: number;
  date: string;
  bbt?: number;
  bbtTime?: string;
  hadIntercourse: boolean;
  excludeFromInterpretation: boolean;
};

export const createOrUpdateCycleDay: CreateOrUpdateCycleDay<CreateOrUpdateCycleDayArgs, CycleDay> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Verify the cycle belongs to the user
  const cycle = await context.entities.Cycle.findFirst({
    where: {
      id: args.cycleId,
      userId: context.user.id
    },
    include: {
      days: {
        orderBy: { dayNumber: 'desc' },
        take: 1
      }
    }
  });

  if (!cycle) {
    throw new HttpError(404, 'Cycle not found');
  }

  const entryDate = new Date(args.date);
  const dayOfWeek = getDayOfWeek(entryDate);

  // Determine day number
  let dayNumber = args.dayNumber;
  if (!dayNumber) {
    // Auto-calculate day number based on date difference from cycle start
    const startDate = new Date(cycle.startDate);
    const daysDiff = Math.floor((entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    dayNumber = daysDiff + 1;
  }

  // Check if day already exists
  const existingDay = await context.entities.CycleDay.findFirst({
    where: {
      cycleId: args.cycleId,
      dayNumber: dayNumber
    }
  });

  if (existingDay) {
    // Update existing day
    return context.entities.CycleDay.update({
      where: { id: existingDay.id },
      data: {
        date: entryDate,
        dayOfWeek,
        bbt: args.bbt,
        bbtTime: args.bbtTime,
        hadIntercourse: args.hadIntercourse,
        excludeFromInterpretation: args.excludeFromInterpretation
      }
    });
  } else {
    // Create new day
    return context.entities.CycleDay.create({
      data: {
        cycleId: args.cycleId,
        dayNumber,
        date: entryDate,
        dayOfWeek,
        bbt: args.bbt,
        bbtTime: args.bbtTime,
        hadIntercourse: args.hadIntercourse,
        excludeFromInterpretation: args.excludeFromInterpretation
      }
    });
  }
};

/**
 * Update user's temperature preference
 */
type UpdateUserTemperaturePreferenceArgs = { temperatureUnit: TemperatureUnit };
export const updateUserTemperaturePreference: UpdateUserTemperaturePreference<UpdateUserTemperaturePreferenceArgs, UserSettings> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Get or create settings
  let settings = await context.entities.UserSettings.findUnique({
    where: { userId: context.user.id }
  });

  if (!settings) {
    settings = await context.entities.UserSettings.create({
      data: {
        userId: context.user.id,
        temperatureUnit: args.temperatureUnit
      }
    });
  } else {
    settings = await context.entities.UserSettings.update({
      where: { userId: context.user.id },
      data: { temperatureUnit: args.temperatureUnit }
    });
  }

  return settings;
};

/**
 * End a cycle (mark as inactive)
 */
type EndCycleArgs = { cycleId: string; endDate: string };
export const endCycle: EndCycle<EndCycleArgs, CycleWithDays> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Verify the cycle belongs to the user
  const cycle = await context.entities.Cycle.findFirst({
    where: {
      id: args.cycleId,
      userId: context.user.id
    }
  });

  if (!cycle) {
    throw new HttpError(404, 'Cycle not found');
  }

  const updatedCycle = await context.entities.Cycle.update({
    where: { id: args.cycleId },
    data: {
      isActive: false,
      endDate: new Date(args.endDate)
    },
    include: {
      days: true
    }
  });

  return updatedCycle as CycleWithDays;
};

/**
 * Delete a cycle and all its days
 */
type DeleteCycleArgs = { cycleId: string };
export const deleteCycle: DeleteCycle<DeleteCycleArgs, void> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Verify the cycle belongs to the user
  const cycle = await context.entities.Cycle.findFirst({
    where: {
      id: args.cycleId,
      userId: context.user.id
    }
  });

  if (!cycle) {
    throw new HttpError(404, 'Cycle not found');
  }

  // Delete the cycle (cascade will delete all days)
  await context.entities.Cycle.delete({
    where: { id: args.cycleId }
  });
};

/**
 * Update a cycle's details
 */
type UpdateCycleArgs = {
  cycleId: string;
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
};
export const updateCycle: UpdateCycle<UpdateCycleArgs, CycleWithDays> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Verify the cycle belongs to the user
  const cycle = await context.entities.Cycle.findFirst({
    where: {
      id: args.cycleId,
      userId: context.user.id
    }
  });

  if (!cycle) {
    throw new HttpError(404, 'Cycle not found');
  }

  const updateData: any = {};
  if (args.startDate !== undefined) {
    updateData.startDate = new Date(args.startDate);
  }
  if (args.endDate !== undefined) {
    updateData.endDate = args.endDate ? new Date(args.endDate) : null;
  }
  if (args.isActive !== undefined) {
    updateData.isActive = args.isActive;
  }

  const updatedCycle = await context.entities.Cycle.update({
    where: { id: args.cycleId },
    data: updateData,
    include: {
      days: true
    }
  });

  return updatedCycle as CycleWithDays;
};

/**
 * Delete a cycle day entry
 */
type DeleteCycleDayArgs = { cycleDayId: string };
export const deleteCycleDay: DeleteCycleDay<DeleteCycleDayArgs, void> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  // Get the cycle day and verify ownership through the cycle
  const cycleDay = await context.entities.CycleDay.findUnique({
    where: { id: args.cycleDayId },
    include: { cycle: true }
  });

  if (!cycleDay) {
    throw new HttpError(404, 'Cycle day not found');
  }

  if (cycleDay.cycle.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to delete this cycle day');
  }

  await context.entities.CycleDay.delete({
    where: { id: args.cycleDayId }
  });
};

