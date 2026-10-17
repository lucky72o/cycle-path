import { describe, it, expect } from 'vitest';
import {
  compareWithSavedDay,
  buildDuplicateSavePayload,
  findSavedDayForDate,
  type DayFormValues,
  type SavedDay
} from '../duplicateDay';
import { stripEmptyFields } from '../cycleDayDataBuilders';
import { formatDateDDMM, toDisplayTemperature } from '../utils';

const saved: SavedDay = {
  id: 'day-1',
  dayNumber: 2,
  date: new Date('2026-05-14T00:00:00Z'),
  bbt: 36.45,
  bbtTime: '06:30',
  hadIntercourse: false,
  excludeFromInterpretation: false,
  cervicalAppearance: 'STICKY',
  cervicalSensation: null,
  opkStatus: null,
  menstrualFlow: null,
  disturbanceFactors: [],
  travelTimeDiff: null,
  notes: 'note'
};

const emptyForm: DayFormValues = {
  bbt: '',
  bbtTime: '',
  hadIntercourse: false,
  excludeFromInterpretation: false,
  cervicalAppearance: '',
  cervicalSensation: '',
  opkStatus: '',
  menstrualFlow: '',
  disturbanceFactors: [],
  travelTimeDiff: 0,
  notes: ''
};

describe('compareWithSavedDay', () => {
  it('spec example', () => {
    const c = compareWithSavedDay({ ...emptyForm, bbt: '36.70', bbtTime: '07:15' }, saved, 'CELSIUS');
    expect(c.conflicts).toEqual([
      { label: 'BBT', saved: '36.45°C', next: '36.70°C' },
      { label: 'BBT Time', saved: '06:30', next: '07:15' }
    ]);
    expect(c.kept.map((k) => k.label)).toEqual(['Cervical Fluid · Appearance', 'Notes']);
    expect(c.fillIns).toEqual({});
  });

  it('no conflicts when only empty fields', () => {
    const c = compareWithSavedDay(emptyForm, saved, 'CELSIUS');
    expect(c.conflicts).toEqual([]);
    expect(c.fillIns).toEqual({});
  });

  it('fill-in', () => {
    const c = compareWithSavedDay({ ...emptyForm, menstrualFlow: 'LIGHT' }, saved, 'CELSIUS');
    expect(c.conflicts).toEqual([]);
    expect(c.fillIns).toEqual({ menstrualFlow: 'LIGHT' });
  });

  it('same value is not a conflict', () => {
    const c = compareWithSavedDay({ ...emptyForm, bbt: '36.45' }, saved, 'CELSIUS');
    expect(c.conflicts.find((r) => r.label === 'BBT')).toBeUndefined();
  });

  it('fahrenheit equal at display precision', () => {
    const f = toDisplayTemperature(36.45, 'FAHRENHEIT').toFixed(2);
    const c = compareWithSavedDay({ ...emptyForm, bbt: f }, saved, 'FAHRENHEIT');
    expect(c.conflicts.find((r) => r.label === 'BBT')).toBeUndefined();
  });

  it('checkbox never conflicts', () => {
    const s = { ...saved, hadIntercourse: true };
    const c = compareWithSavedDay(emptyForm, s, 'CELSIUS');
    expect(c.conflicts).toEqual([]);
    expect(c.kept.find((k) => k.label === 'Intercourse')).toEqual({ label: 'Intercourse', saved: 'yes' });
    const c2 = compareWithSavedDay({ ...emptyForm, hadIntercourse: true }, saved, 'CELSIUS');
    expect(c2.fillIns.hadIntercourse).toBe(true);
  });

  it('disturbances compared as set', () => {
    const s = { ...saved, disturbanceFactors: ['STRESS', 'ALCOHOL'] };
    const same = compareWithSavedDay({ ...emptyForm, disturbanceFactors: ['ALCOHOL', 'STRESS'] }, s, 'CELSIUS');
    expect(same.conflicts).toEqual([]);
    const diff = compareWithSavedDay({ ...emptyForm, disturbanceFactors: ['STRESS'] }, s, 'CELSIUS');
    expect(diff.conflicts).toEqual([
      { label: 'Disturbance Factor', saved: 'Stress, Alcohol the Evening Before', next: 'Stress' }
    ]);
  });

  const travelSaved = { ...saved, disturbanceFactors: ['TRAVEL'], travelTimeDiff: 3 };
  const travelForm = { ...emptyForm, disturbanceFactors: ['TRAVEL'], travelTimeDiff: 0 };

  it('travel 0 vs saved +3 conflicts', () => {
    const c = compareWithSavedDay(travelForm, travelSaved, 'CELSIUS');
    expect(c.conflicts).toContainEqual({ label: 'Travel time difference', saved: '+3h', next: '0h' });
  });

  it('travel-only replace survives the server guard', () => {
    const c = compareWithSavedDay(travelForm, travelSaved, 'CELSIUS');
    expect(stripEmptyFields(buildDuplicateSavePayload(c, 'replace'))).toEqual({
      disturbanceFactors: ['TRAVEL'],
      travelTimeDiff: 0
    });
  });

  it('keep existing never overwrites a conflicting factor set', () => {
    const s = { ...saved, disturbanceFactors: ['STRESS'] };
    const c = compareWithSavedDay(travelForm, s, 'CELSIUS');
    const keep = buildDuplicateSavePayload(c, 'keep');
    expect(keep).not.toHaveProperty('disturbanceFactors');
    expect(keep).not.toHaveProperty('travelTimeDiff');
    expect(stripEmptyFields(buildDuplicateSavePayload(c, 'replace'))).toEqual({
      disturbanceFactors: ['TRAVEL'],
      travelTimeDiff: 0
    });
    expect(c.conflicts.map((r) => r.label)).toContain('Disturbance Factor');
    expect(c.conflicts.map((r) => r.label)).not.toContain('Travel time difference');
  });

  it('payloads', () => {
    const c = compareWithSavedDay({ ...emptyForm, bbt: '36.70', bbtTime: '07:15' }, saved, 'CELSIUS');
    expect(buildDuplicateSavePayload(c, 'keep')).toEqual({});
    const r = buildDuplicateSavePayload(c, 'replace');
    expect(r.bbtTime).toBe('07:15');
    expect(r.bbt).toBeCloseTo(36.7, 5);
  });

  it('uses Add page labels for display values', () => {
    const s = { ...saved, menstrualFlow: 'VERY_HEAVY', opkStatus: 'peak' } as SavedDay;
    const c = compareWithSavedDay({ ...emptyForm, menstrualFlow: 'LIGHT', opkStatus: 'low' }, s, 'CELSIUS');
    expect(c.conflicts).toEqual([
      { label: 'Menstrual Flow', saved: 'Very Heavy', next: 'Light' },
      { label: 'Ovulation Predictor Kit', saved: 'Peak LH – Surge', next: 'Low LH' }
    ]);
  });
});

describe('findSavedDayForDate', () => {
  const days = [{ dayNumber: 1 }, { dayNumber: 2 }];
  it('finds by day number', () => {
    expect(findSavedDayForDate(days, '2026-05-13', '2026-05-14')).toBe(days[1]);
    expect(findSavedDayForDate(days, '2026-05-13', '2026-05-12')).toBeNull();
    expect(findSavedDayForDate(days, '2026-05-13', '2026-05-20')).toBeNull();
  });
});

describe('formatDateDDMM', () => {
  it('formats from the string', () => {
    expect(formatDateDDMM('2026-05-14')).toBe('14/05');
  });

  it('replacing a TRAVEL set with a non-TRAVEL set clears travelTimeDiff', () => {
    const c = compareWithSavedDay(
      { ...emptyForm, disturbanceFactors: ['STRESS'] },
      { ...saved, disturbanceFactors: ['TRAVEL'], travelTimeDiff: 3 },
      'CELSIUS'
    );
    expect(stripEmptyFields(buildDuplicateSavePayload(c, 'replace'))).toEqual({
      disturbanceFactors: ['STRESS'],
      travelTimeDiff: null
    });
    const keep = stripEmptyFields(buildDuplicateSavePayload(c, 'keep'));
    expect(keep).not.toHaveProperty('disturbanceFactors');
    expect(keep).not.toHaveProperty('travelTimeDiff');
  });

  it('shows travel hours in the Disturbance Factor row so clearing them is visible', () => {
    const toStress = compareWithSavedDay(
      { ...emptyForm, disturbanceFactors: ['STRESS'] },
      { ...saved, disturbanceFactors: ['TRAVEL'], travelTimeDiff: 3 },
      'CELSIUS'
    );
    expect(toStress.conflicts).toContainEqual({
      label: 'Disturbance Factor',
      saved: 'Travel (+3h)',
      next: 'Stress'
    });

    const toTravel = compareWithSavedDay(
      { ...emptyForm, disturbanceFactors: ['TRAVEL'], travelTimeDiff: 0 },
      { ...saved, disturbanceFactors: ['STRESS'] },
      'CELSIUS'
    );
    expect(toTravel.conflicts).toContainEqual({
      label: 'Disturbance Factor',
      saved: 'Stress',
      next: 'Travel (0h)'
    });

    const kept = compareWithSavedDay(
      emptyForm,
      { ...saved, disturbanceFactors: ['TRAVEL'], travelTimeDiff: -2 },
      'CELSIUS'
    );
    expect(kept.kept).toContainEqual({ label: 'Disturbance Factor', saved: 'Travel (-2h)' });
  });

  it('truncates a long note in the kept line to 30 chars + ellipsis', () => {
    const long = 'x'.repeat(150);
    const c = compareWithSavedDay(emptyForm, { ...saved, notes: long }, 'CELSIUS');
    expect(c.kept.find((k) => k.label === 'Notes')?.saved).toBe('x'.repeat(30) + '…');
  });
});
