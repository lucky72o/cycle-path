import type { CycleDay } from 'wasp/entities';
import type { CycleDayPartialArgs } from './cycleDayDataBuilders';
import {
  convertToCelsiusForStorage,
  formatTemperature,
  toDisplayTemperature,
  type TemperatureUnit
} from './utils';

export type DayFormValues = {
  bbt: string; // raw input, display unit
  bbtTime: string;
  hadIntercourse: boolean;
  excludeFromInterpretation: boolean;
  cervicalAppearance: string; // '' = unselected
  cervicalSensation: string;
  opkStatus: string;
  menstrualFlow: string;
  disturbanceFactors: string[];
  travelTimeDiff: number;
  notes: string;
};

export type SavedDay = Pick<
  CycleDay,
  | 'id'
  | 'dayNumber'
  | 'date'
  | 'bbt'
  | 'bbtTime'
  | 'hadIntercourse'
  | 'excludeFromInterpretation'
  | 'cervicalAppearance'
  | 'cervicalSensation'
  | 'opkStatus'
  | 'menstrualFlow'
  | 'disturbanceFactors'
  | 'travelTimeDiff'
  | 'notes'
>;

export type FieldRow = { label: string; saved: string; next: string };

export type DuplicateComparison = {
  conflicts: FieldRow[];
  kept: { label: string; saved: string }[];
  fillIns: CycleDayPartialArgs;
  replacements: CycleDayPartialArgs;
};

// Display labels, copied from the Add page's option lists (emoji removed).
export const ENUM_LABELS = {
  cervicalAppearance: {
    NONE: 'None',
    STICKY: 'Sticky',
    CREAMY: 'Creamy',
    WATERY: 'Watery',
    EGGWHITE: 'Eggwhite'
  },
  cervicalSensation: { DRY: 'Dry', DAMP: 'Damp', WET: 'Wet', SLIPPERY: 'Slippery' },
  menstrualFlow: {
    SPOTTING: 'Spotting',
    LIGHT: 'Light',
    MEDIUM: 'Medium',
    HEAVY: 'Heavy',
    VERY_HEAVY: 'Very Heavy'
  },
  opkStatus: {
    low: 'Low LH',
    rising: 'Rising LH',
    peak: 'Peak LH – Surge',
    declining: 'Declining LH'
  },
  disturbanceFactors: {
    POOR_SLEEP: 'Poor Sleep',
    TRAVEL: 'Travel',
    STRESS: 'Stress',
    ILLNESS_FEVER: 'Illness / Fever',
    DIFFERENT_WAKE_TIME: 'Different Wake Time',
    ALCOHOL: 'Alcohol the Evening Before',
    MEDICATION: 'Medication',
    HOT_COLD_ROOM: 'Hot / Cold Room'
  }
} as const satisfies Record<string, Record<string, string>>;

type EnumField = 'cervicalAppearance' | 'cervicalSensation' | 'menstrualFlow' | 'opkStatus';

const enumLabel = (field: keyof typeof ENUM_LABELS, value: string): string =>
  (ENUM_LABELS[field] as Record<string, string>)[value] ?? value;

export function findSavedDayForDate<T extends { dayNumber: number }>(
  days: T[],
  cycleStartDate: Date | string,
  isoDate: string
): T | null {
  const dayNumber =
    Math.floor((new Date(isoDate).getTime() - new Date(cycleStartDate).getTime()) / 86400000) + 1;
  if (!(dayNumber >= 1)) return null;
  return days.find((d) => d.dayNumber === dayNumber) ?? null;
}

const formatTravel = (hours: number): string => (hours > 0 ? `+${hours}h` : `${hours}h`);

const parseBbt = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
};

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

type FieldSpec = {
  label: string;
  newEmpty: (f: DayFormValues, unit: TemperatureUnit) => boolean;
  savedEmpty: (s: SavedDay) => boolean;
  same: (f: DayFormValues, s: SavedDay, unit: TemperatureUnit) => boolean;
  showSaved: (s: SavedDay, unit: TemperatureUnit) => string;
  showNew: (f: DayFormValues, unit: TemperatureUnit) => string;
  payload: (f: DayFormValues, unit: TemperatureUnit) => CycleDayPartialArgs;
};

const enumField = (key: EnumField, label: string): FieldSpec => ({
  label,
  newEmpty: (f) => f[key] === '',
  savedEmpty: (s) => !s[key],
  same: (f, s) => f[key] === s[key],
  showSaved: (s) => enumLabel(key, s[key] as string),
  showNew: (f) => enumLabel(key, f[key]),
  payload: (f) => ({ [key]: f[key] }) as CycleDayPartialArgs
});

const checkboxField = (
  key: 'hadIntercourse' | 'excludeFromInterpretation',
  label: string
): FieldSpec => ({
  label,
  newEmpty: (f) => !f[key],
  savedEmpty: (s) => !s[key],
  same: () => true, // checkboxes never conflict
  showSaved: () => 'yes',
  showNew: () => 'yes',
  payload: () => ({ [key]: true })
});

// Single ordered table: conflict order follows the form order.
// Disturbance factors and travel time are handled separately (they depend on each other).
const FIELDS_BEFORE_DISTURBANCE: FieldSpec[] = [
  {
    label: 'BBT',
    newEmpty: (f) => parseBbt(f.bbt) === null,
    savedEmpty: (s) => s.bbt == null,
    same: (f, s, unit) =>
      toDisplayTemperature(s.bbt as number, unit).toFixed(2) === (parseBbt(f.bbt) as number).toFixed(2),
    showSaved: (s, unit) => formatTemperature(s.bbt as number, unit),
    showNew: (f, unit) =>
      formatTemperature(convertToCelsiusForStorage(parseBbt(f.bbt) as number, unit), unit),
    payload: (f, unit) => ({ bbt: convertToCelsiusForStorage(parseBbt(f.bbt) as number, unit) })
  },
  {
    label: 'BBT Time',
    newEmpty: (f) => f.bbtTime === '',
    savedEmpty: (s) => !s.bbtTime,
    same: (f, s) => f.bbtTime === s.bbtTime,
    showSaved: (s) => s.bbtTime as string,
    showNew: (f) => f.bbtTime,
    payload: (f) => ({ bbtTime: f.bbtTime })
  },
  checkboxField('hadIntercourse', 'Intercourse'),
  checkboxField('excludeFromInterpretation', 'Exclude from BBT-based interpretation'),
  enumField('menstrualFlow', 'Menstrual Flow'),
  enumField('cervicalAppearance', 'Cervical Fluid · Appearance'),
  enumField('cervicalSensation', 'Cervical Fluid · Sensation'),
  enumField('opkStatus', 'Ovulation Predictor Kit')
];

const NOTES_FIELD: FieldSpec = {
  label: 'Notes',
  newEmpty: (f) => f.notes.trim() === '',
  savedEmpty: (s) => (s.notes ?? '').trim() === '',
  same: (f, s) => f.notes.trim() === (s.notes ?? '').trim(),
  showSaved: (s) => (s.notes ?? '').trim(),
  showNew: (f) => f.notes.trim(),
  payload: (f) => ({ notes: f.notes.trim() })
};

// Travel shows its hours, e.g. "Travel (+3h)", so replacing or keeping them is visible.
const factorLabels = (keys: string[], travelHours?: number | null): string =>
  keys
    .map((k) => {
      const label = enumLabel('disturbanceFactors', k);
      return k === 'TRAVEL' && travelHours != null ? `${label} (${formatTravel(travelHours)})` : label;
    })
    .join(', ');

export function compareWithSavedDay(
  form: DayFormValues,
  saved: SavedDay,
  unit: TemperatureUnit
): DuplicateComparison {
  const conflicts: FieldRow[] = [];
  const kept: { label: string; saved: string }[] = [];
  const fillIns: CycleDayPartialArgs = {};
  const replacements: CycleDayPartialArgs = {};

  const classify = (
    spec: Pick<FieldSpec, 'label'>,
    state: 'keep' | 'fill' | 'same' | 'conflict',
    savedText: string,
    nextText: string,
    payload: CycleDayPartialArgs
  ) => {
    if (state === 'keep') {
      const shown =
        spec.label === 'Notes' && savedText.length > 30 ? `${savedText.slice(0, 30)}…` : savedText;
      kept.push({ label: spec.label, saved: shown });
    } else if (state === 'fill') Object.assign(fillIns, payload);
    else if (state === 'conflict') {
      conflicts.push({ label: spec.label, saved: savedText, next: nextText });
      Object.assign(replacements, payload);
    }
  };

  const runSpec = (spec: FieldSpec) => {
    const newEmpty = spec.newEmpty(form, unit);
    const savedEmpty = spec.savedEmpty(saved);
    let state: 'keep' | 'fill' | 'same' | 'conflict';
    if (newEmpty) state = savedEmpty ? 'same' : 'keep';
    else if (savedEmpty) state = 'fill';
    else state = spec.same(form, saved, unit) ? 'same' : 'conflict';
    classify(
      spec,
      state,
      savedEmpty ? '' : spec.showSaved(saved, unit),
      newEmpty ? '' : spec.showNew(form, unit),
      newEmpty ? {} : spec.payload(form, unit)
    );
  };

  FIELDS_BEFORE_DISTURBANCE.forEach(runSpec);

  // Disturbance factors: compared as a set.
  const savedFactors = saved.disturbanceFactors ?? [];
  const newFactors = form.disturbanceFactors;
  const factorSpec = { label: 'Disturbance Factor' };
  let factorsConflict = false;
  if (newFactors.length === 0) {
    if (savedFactors.length > 0) classify(factorSpec, 'keep', factorLabels(savedFactors, saved.travelTimeDiff), '', {});
  } else if (savedFactors.length === 0) {
    classify(factorSpec, 'fill', '', '', { disturbanceFactors: newFactors });
  } else if (!sameSet(savedFactors, newFactors)) {
    factorsConflict = true;
    classify(factorSpec, 'conflict', factorLabels(savedFactors, saved.travelTimeDiff), factorLabels(newFactors, form.travelTimeDiff), {
      disturbanceFactors: newFactors
    });
    // Replacing a TRAVEL set with a non-TRAVEL set must also clear the saved hours.
    if (savedFactors.includes('TRAVEL') && !newFactors.includes('TRAVEL')) {
      replacements.travelTimeDiff = null;
    }
  }

  // Travel time difference: only meaningful when the new entry ticks TRAVEL.
  if (newFactors.includes('TRAVEL')) {
    const travelPayload = { travelTimeDiff: form.travelTimeDiff };
    if (savedFactors.includes('TRAVEL')) {
      const savedHours = saved.travelTimeDiff ?? 0;
      if (savedHours !== form.travelTimeDiff) {
        classify(
          { label: 'Travel time difference' },
          'conflict',
          formatTravel(savedHours),
          formatTravel(form.travelTimeDiff),
          travelPayload
        );
      }
    } else if (savedFactors.length === 0) {
      Object.assign(fillIns, travelPayload);
    } else if (factorsConflict) {
      // Covered by the Disturbance Factor row: replaced together, never kept separately.
      Object.assign(replacements, travelPayload);
    }
  }

  runSpec(NOTES_FIELD);

  // Keep travel hours and factor set together so the pair survives stripEmptyFields.
  for (const payload of [fillIns, replacements]) {
    if ('travelTimeDiff' in payload && !('disturbanceFactors' in payload)) {
      payload.disturbanceFactors = newFactors;
    }
    if (payload.disturbanceFactors?.includes('TRAVEL') && !('travelTimeDiff' in payload)) {
      payload.travelTimeDiff = form.travelTimeDiff;
    }
  }

  return { conflicts, kept, fillIns, replacements };
}

export function buildDuplicateSavePayload(
  c: DuplicateComparison,
  choice: 'replace' | 'keep'
): CycleDayPartialArgs {
  return choice === 'replace' ? { ...c.fillIns, ...c.replacements } : { ...c.fillIns };
}
