import { HttpError } from 'wasp/server';
import { parse } from 'csv-parse/sync';
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
  DeleteCycleDay,
  ImportCycleCsv
} from 'wasp/server/operations';
import type { Cycle, CycleDay, UserSettings } from 'wasp/entities';
import { celsiusToFahrenheit, getDayOfWeek } from './utils';

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

  // Get all active cycles to potentially deactivate them
  const activeCycles = await context.entities.Cycle.findMany({
    where: {
      userId: context.user.id,
      isActive: true
    },
    orderBy: { cycleNumber: 'desc' },
    include: {
      days: {
        orderBy: { date: 'desc' },
        take: 1
      }
    }
  });

  const newCycleStartDate = new Date(args.startDate);

  // Set existing active cycles to inactive with proper endDate
  await Promise.all(
    activeCycles.map(async (cycle) => {
      const lastRecordedDay = cycle.days[0];
      const endDate = lastRecordedDay 
        ? new Date(lastRecordedDay.date) 
        : new Date(cycle.startDate);

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
  cervicalAppearance?: 'NONE' | 'STICKY' | 'CREAMY' | 'WATERY' | 'EGGWHITE';
  cervicalSensation?: 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY';
  opkStatus?: 'low' | 'rising' | 'peak' | 'declining';
  menstrualFlow?: 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'VERY_HEAVY';
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

  let updatedDay: CycleDay;
  
  if (existingDay) {
    // Update existing day
    updatedDay = await context.entities.CycleDay.update({
      where: { id: existingDay.id },
      data: {
        date: entryDate,
        dayOfWeek,
        bbt: args.bbt,
        bbtTime: args.bbtTime,
        hadIntercourse: args.hadIntercourse,
        excludeFromInterpretation: args.excludeFromInterpretation,
        cervicalAppearance: args.cervicalAppearance,
        cervicalSensation: args.cervicalSensation,
        opkStatus: args.opkStatus,
        menstrualFlow: args.menstrualFlow
      }
    });
  } else {
    // Create new day
    updatedDay = await context.entities.CycleDay.create({
      data: {
        cycleId: args.cycleId,
        dayNumber,
        date: entryDate,
        dayOfWeek,
        bbt: args.bbt,
        bbtTime: args.bbtTime,
        hadIntercourse: args.hadIntercourse,
        excludeFromInterpretation: args.excludeFromInterpretation,
        cervicalAppearance: args.cervicalAppearance,
        cervicalSensation: args.cervicalSensation,
        opkStatus: args.opkStatus,
        menstrualFlow: args.menstrualFlow
      }
    });
  }

  // If cycle is inactive (past cycle), update endDate to the last recorded day
  if (!cycle.isActive) {
    const lastRecordedDay = await context.entities.CycleDay.findFirst({
      where: { cycleId: args.cycleId },
      orderBy: { date: 'desc' }
    });

    if (lastRecordedDay) {
      await context.entities.Cycle.update({
        where: { id: args.cycleId },
        data: { endDate: new Date(lastRecordedDay.date) }
      });
    }
  }

  return updatedDay;
};

// ===== CSV IMPORT =====

type ImportCycleCsvArgs = { csvText: string };

const appearanceValueMap: Record<string, 'NONE' | 'STICKY' | 'CREAMY' | 'WATERY' | 'EGGWHITE'> = {
  '0': 'NONE',
  'none': 'NONE',
  '1': 'STICKY',
  'sticky': 'STICKY',
  '2': 'CREAMY',
  'creamy': 'CREAMY',
  '3': 'WATERY',
  'watery': 'WATERY',
  '4': 'EGGWHITE',
  'eggwhite': 'EGGWHITE',
  'egg white': 'EGGWHITE'
};

const sensationValueMap: Record<string, 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY'> = {
  '0': 'DRY',
  'dry': 'DRY',
  '1': 'DAMP',
  'damp': 'DAMP',
  '2': 'WET',
  'wet': 'WET',
  '3': 'SLIPPERY',
  'slippery': 'SLIPPERY'
};

function normalizeAppearance(value?: unknown) {
  if (!value) return undefined;
  const key = String(value).trim().toLowerCase();
  return appearanceValueMap[key];
}

function normalizeSensation(value?: unknown) {
  if (!value) return undefined;
  const key = String(value).trim().toLowerCase();
  return sensationValueMap[key];
}

function normalizeBoolean(value?: unknown): boolean {
  if (value === undefined || value === null) return false;
  const key = String(value).trim().toLowerCase();
  if (!key) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(key);
}

function normalizeExclude(value?: unknown): boolean {
  if (value === undefined || value === null) return false;
  const key = String(value).trim().toLowerCase();
  if (!key) return false;

  const num = Number(key);
  if (!Number.isNaN(num)) {
    return num < 0;
  }

  return ['-1', 'exclude', 'x', 'skip'].includes(key);
}

function inferTemperatureUnit(temps: number[]): TemperatureUnit {
  if (!temps.length) return 'FAHRENHEIT';
  const average = temps.reduce((sum, val) => sum + val, 0) / temps.length;
  return average < 60 ? 'CELSIUS' : 'FAHRENHEIT';
}

function parseDateSafe(value?: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // ISO-like: yyyy-mm-dd or yyyy/mm/dd
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
    return null;
  }

  // Day-first or month-first with slashes (e.g., 20/09/2025 or 09/20/2025)
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, a, b, c] = slash;
    const first = Number(a);
    const second = Number(b);
    const year = Number(c);

    // Heuristic: if first > 12, treat as day-first; if second > 12, treat as month-first; otherwise prefer day-first (common in exports)
    let day: number;
    let month: number;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    } else {
      day = first;
      month = second;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
    return null;
  }

  // Fallback to native parsing
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date, current: Date): number {
  const diff = current.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

type ImportSummary = {
  cycleId: string;
  createdCycle: boolean;
  updatedDays: number;
  detectedUnit: TemperatureUnit;
};

export const importCycleCsv: ImportCycleCsv<ImportCycleCsvArgs, ImportSummary> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authorized');
  }

  const rows = parse(args.csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  if (!rows.length) {
    throw new HttpError(400, 'CSV is empty or has no data rows.');
  }

  // Parse and sort rows by date to ensure day numbers align even if the CSV is unordered.
  const parsedRows = rows
    .map((row) => {
      const parsedDate = parseDateSafe(row.d ?? row.date);
      return {
        raw: row,
        parsedDate
      };
    })
    .filter((row) => row.parsedDate !== null)
    .sort((a, b) => (a.parsedDate as Date).getTime() - (b.parsedDate as Date).getTime());

  if (!parsedRows.length) {
    throw new HttpError(400, 'No valid dates found in CSV.');
  }

  // BBT is in `bf` (e.g., 98.15), time is in `bt` (e.g., 09:41)
  const parsedTemps = parsedRows
    .map(({ raw }) => Number.parseFloat(raw.bf ?? raw.BF ?? raw.temp ?? ''))
    .filter((t) => Number.isFinite(t)) as number[];

  const detectedUnit = inferTemperatureUnit(parsedTemps);
  const convertTemperature = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null;
    }
    return detectedUnit === 'CELSIUS' ? celsiusToFahrenheit(value) : value;
  };

  const firstDate = parsedRows[0].parsedDate as Date;
  if (!firstDate) {
    throw new HttpError(400, 'First row is missing a valid date.');
  }

  // Determine the last date from parsed rows (used for endDate hints)
  const lastDate = parsedRows[parsedRows.length - 1].parsedDate as Date;

  // Find cycle by matching startDate to the first date; if not found, create a new one
  let cycle = await context.entities.Cycle.findFirst({
    where: {
      userId: context.user.id,
      startDate: firstDate
    }
  });

  let createdCycle = false;
  if (!cycle) {
    const lastCycle = await context.entities.Cycle.findFirst({
      where: { userId: context.user.id },
      orderBy: { cycleNumber: 'desc' }
    });

    const nextCycleNumber = lastCycle ? lastCycle.cycleNumber + 1 : 1;

    cycle = await context.entities.Cycle.create({
      data: {
        userId: context.user.id,
        startDate: firstDate,
        endDate: null, // Will be set after importing days
        isActive: true, // Will be adjusted based on date comparison
        cycleNumber: nextCycleNumber
      }
    });

    createdCycle = true;
  }

  let updatedDays = 0;

  for (const { raw, parsedDate } of parsedRows) {
    const entryDate = parsedDate as Date;

    const dayNumberFromCsv = raw.cd ?? raw.CD ?? raw.cycleDay;
    const computedDayNumber = dayNumberFromCsv
      ? Number.parseInt(String(dayNumberFromCsv), 10)
      : daysBetween(firstDate, entryDate) + 1;

    const temperatureRaw = Number.parseFloat(raw.bf ?? raw.BF ?? raw.temp ?? '');
    const temperature = convertTemperature(Number.isFinite(temperatureRaw) ? temperatureRaw : null);

    const bbtTime = (raw.bt ?? raw.BT ?? raw.time ?? raw.bbtTime ?? '').toString().trim() || null;
    const excludeFromInterpretation = normalizeExclude(raw.ok);
    const hadIntercourse = normalizeBoolean(raw.it);
    const cervicalAppearance = normalizeAppearance(raw.cf);
    const cervicalSensation = normalizeSensation(raw.cf ?? raw.cp);

    const existingDay = await context.entities.CycleDay.findFirst({
      where: {
        cycleId: cycle.id,
        date: entryDate
      }
    });

    const commonData = {
      cycleId: cycle.id,
      dayNumber: computedDayNumber,
      date: entryDate,
      dayOfWeek: getDayOfWeek(entryDate),
      bbt: temperature,
      bbtTime: bbtTime || null,
      hadIntercourse,
      excludeFromInterpretation,
      cervicalAppearance,
      cervicalSensation
    };

    if (existingDay) {
      await context.entities.CycleDay.update({
        where: { id: existingDay.id },
        data: commonData
      });
    } else {
      await context.entities.CycleDay.create({
        data: commonData
      });
    }

    updatedDays += 1;
  }

  if (updatedDays === 0) {
    throw new HttpError(400, 'No valid rows found to import.');
  }

  // Set endDate to the last imported day's date
  await context.entities.Cycle.update({
    where: { id: cycle.id },
    data: {
      endDate: lastDate,
      isActive: false // Will be adjusted if this is the latest cycle
    }
  });

  // Ensure only one cycle is active: the one with the latest dates
  const allUserCycles = await context.entities.Cycle.findMany({
    where: { userId: context.user.id },
    include: {
      days: {
        orderBy: { date: 'desc' },
        take: 1
      }
    }
  });

  // Find the cycle with the latest date (either endDate or last recorded day)
  let latestCycle: { id: string; latestDate: Date } | null = null;

  for (const c of allUserCycles) {
    const lastRecordedDay = c.days[0];
    const cycleLatestDate = lastRecordedDay 
      ? new Date(lastRecordedDay.date)
      : c.endDate 
        ? new Date(c.endDate)
        : new Date(c.startDate);

    if (!latestCycle || cycleLatestDate > latestCycle.latestDate) {
      latestCycle = { id: c.id, latestDate: cycleLatestDate };
    }
  }

  // Set the latest cycle as active, all others as inactive
  if (latestCycle) {
    await Promise.all(
      allUserCycles.map(async (c) => {
        const shouldBeActive = c.id === latestCycle.id;
        const lastRecordedDay = c.days[0];
        const computedEndDate = lastRecordedDay ? new Date(lastRecordedDay.date) : c.endDate;

        await context.entities.Cycle.update({
          where: { id: c.id },
          data: {
            isActive: shouldBeActive,
            endDate: shouldBeActive ? null : computedEndDate
          }
        });
      })
    );
  }

  return {
    cycleId: cycle.id,
    createdCycle,
    updatedDays,
    detectedUnit
  };
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

  const cycleId = cycleDay.cycleId;
  const isInactiveCycle = !cycleDay.cycle.isActive;

  await context.entities.CycleDay.delete({
    where: { id: args.cycleDayId }
  });

  // If cycle is inactive (past cycle), update endDate to the last remaining recorded day
  if (isInactiveCycle) {
    const lastRecordedDay = await context.entities.CycleDay.findFirst({
      where: { cycleId },
      orderBy: { date: 'desc' }
    });

    await context.entities.Cycle.update({
      where: { id: cycleId },
      data: { 
        endDate: lastRecordedDay ? new Date(lastRecordedDay.date) : new Date(cycleDay.cycle.startDate)
      }
    });
  }
};

