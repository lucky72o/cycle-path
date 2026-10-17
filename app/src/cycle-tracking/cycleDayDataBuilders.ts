import { Prisma } from '@prisma/client';
import { normalizeNote } from './notesValidation';

export type CycleDayPartialArgs = {
  bbt?: number | null;
  bbtTime?: string;
  hadIntercourse?: boolean;
  excludeFromInterpretation?: boolean;
  cervicalAppearance?: 'NONE' | 'STICKY' | 'CREAMY' | 'WATERY' | 'EGGWHITE' | null;
  cervicalSensation?: 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY' | null;
  opkStatus?: 'low' | 'rising' | 'peak' | 'declining' | null;
  menstrualFlow?: 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'VERY_HEAVY' | null;
  disturbanceFactors?: string[];
  travelTimeDiff?: number | null;
  notes?: string | null;
};

/**
 * Return a copy of `args` without empty values (undefined, null, '' / whitespace-only
 * strings, false, []). Used by `preserveExisting` saves so an empty form field can
 * never overwrite recorded data. `travelTimeDiff` is only meaningful with the TRAVEL
 * disturbance ticked: without a factor set it is dropped, and a factor set without TRAVEL
 * clears it to null (0 is kept when TRAVEL is ticked).
 */
export function stripEmptyFields(args: CycleDayPartialArgs): CycleDayPartialArgs {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  const factors = result.disturbanceFactors;
  if (!Array.isArray(factors)) {
    delete result.travelTimeDiff;
  } else if (!factors.includes('TRAVEL')) {
    // The factor set is being replaced without TRAVEL: explicitly clear stale hours.
    result.travelTimeDiff = null;
  }
  return result as CycleDayPartialArgs;
}

/**
 * Build the `data` argument for `CycleDay.update`. Every optional field
 * is included only if its key is present in `args` — this preserves
 * existing values when a caller (e.g. the Notes Sheet) only changes one
 * field. `'key' in args` distinguishes "explicitly set to null" (delete)
 * from "not provided".
 */
export function buildCycleDayUpdateData(
  args: CycleDayPartialArgs,
  entryDate: Date,
  dayOfWeek: string
): Prisma.CycleDayUncheckedUpdateInput {
  const data: Prisma.CycleDayUncheckedUpdateInput = { date: entryDate, dayOfWeek };
  if ('bbt' in args)                       data.bbt = args.bbt;
  if ('bbtTime' in args)                   data.bbtTime = args.bbtTime;
  if ('hadIntercourse' in args)            data.hadIntercourse = args.hadIntercourse;
  if ('excludeFromInterpretation' in args) data.excludeFromInterpretation = args.excludeFromInterpretation;
  if ('cervicalAppearance' in args)        data.cervicalAppearance = args.cervicalAppearance;
  if ('cervicalSensation' in args)         data.cervicalSensation = args.cervicalSensation;
  if ('opkStatus' in args)                 data.opkStatus = args.opkStatus;
  if ('menstrualFlow' in args)             data.menstrualFlow = args.menstrualFlow;
  // disturbanceFactors needs no `?? []` default here (unlike the create path) because
  // the existing DB row already holds a value; omitting the key leaves it untouched.
  if ('disturbanceFactors' in args)        data.disturbanceFactors = args.disturbanceFactors;
  if ('travelTimeDiff' in args)            data.travelTimeDiff = args.travelTimeDiff;
  if ('notes' in args)                     data.notes = normalizeNote(args.notes);
  return data;
}

/**
 * Build the `data` argument for `CycleDay.create`. Required-on-create
 * identity fields (cycleId, dayNumber, date, dayOfWeek) come from a
 * separate `identity` parameter; optional fields are conditionally
 * spread in the same way as the update path. Booleans not provided
 * are omitted so Prisma fills the schema's @default(false).
 */
export function buildCycleDayCreateData(
  args: CycleDayPartialArgs,
  identity: { cycleId: string; dayNumber: number; entryDate: Date; dayOfWeek: string }
): Prisma.CycleDayUncheckedCreateInput {
  // disturbanceFactors is a non-nullable String[] in the schema with no DB-level
  // DEFAULT, so the create path must always provide a value. Default to [] when
  // the caller didn't pass one (e.g. the Notes Sheet creating a blank-day row).
  const data: Prisma.CycleDayUncheckedCreateInput = {
    cycleId: identity.cycleId,
    dayNumber: identity.dayNumber,
    date: identity.entryDate,
    dayOfWeek: identity.dayOfWeek,
    disturbanceFactors: args.disturbanceFactors ?? [],
  };
  if ('bbt' in args)                       data.bbt = args.bbt;
  if ('bbtTime' in args)                   data.bbtTime = args.bbtTime;
  if ('hadIntercourse' in args)            data.hadIntercourse = args.hadIntercourse;
  if ('excludeFromInterpretation' in args) data.excludeFromInterpretation = args.excludeFromInterpretation;
  if ('cervicalAppearance' in args)        data.cervicalAppearance = args.cervicalAppearance;
  if ('cervicalSensation' in args)         data.cervicalSensation = args.cervicalSensation;
  if ('opkStatus' in args)                 data.opkStatus = args.opkStatus;
  if ('menstrualFlow' in args)             data.menstrualFlow = args.menstrualFlow;
  if ('travelTimeDiff' in args)            data.travelTimeDiff = args.travelTimeDiff;
  if ('notes' in args)                     data.notes = normalizeNote(args.notes);
  return data;
}
