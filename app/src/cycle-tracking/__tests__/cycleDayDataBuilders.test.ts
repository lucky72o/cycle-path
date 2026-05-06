import { describe, it, expect } from 'vitest';
import {
  buildCycleDayUpdateData,
  buildCycleDayCreateData,
} from '../cycleDayDataBuilders';

const ENTRY_DATE = new Date('2026-05-04T00:00:00Z');
const DAY_OF_WEEK = 'Monday';

describe('buildCycleDayUpdateData', () => {
  it('always includes date and dayOfWeek', () => {
    const data = buildCycleDayUpdateData({}, ENTRY_DATE, DAY_OF_WEEK);
    expect(data.date).toBe(ENTRY_DATE);
    expect(data.dayOfWeek).toBe('Monday');
  });

  it('omits any optional field that is not present in args (notes-only save)', () => {
    const data = buildCycleDayUpdateData({ notes: 'hello' }, ENTRY_DATE, DAY_OF_WEEK);
    expect('notes' in data).toBe(true);
    expect(data.notes).toBe('hello');
    // Critical: a notes-only save MUST NOT touch any other field.
    expect('bbt' in data).toBe(false);
    expect('bbtTime' in data).toBe(false);
    expect('hadIntercourse' in data).toBe(false);
    expect('excludeFromInterpretation' in data).toBe(false);
    expect('cervicalAppearance' in data).toBe(false);
    expect('cervicalSensation' in data).toBe(false);
    expect('opkStatus' in data).toBe(false);
    expect('menstrualFlow' in data).toBe(false);
    expect('disturbanceFactors' in data).toBe(false);
    expect('travelTimeDiff' in data).toBe(false);
  });

  it('preserves an explicit null (delete a note)', () => {
    const data = buildCycleDayUpdateData({ notes: null }, ENTRY_DATE, DAY_OF_WEEK);
    expect('notes' in data).toBe(true);
    expect(data.notes).toBeNull();
  });

  it('trims whitespace-only notes to null', () => {
    const data = buildCycleDayUpdateData({ notes: '   ' }, ENTRY_DATE, DAY_OF_WEEK);
    expect(data.notes).toBeNull();
  });

  it('passes every field through when all are provided (form-style payload)', () => {
    const data = buildCycleDayUpdateData(
      {
        bbt: 36.4,
        bbtTime: '07:05',
        hadIntercourse: true,
        excludeFromInterpretation: false,
        cervicalAppearance: 'CREAMY',
        cervicalSensation: 'WET',
        opkStatus: 'rising',
        menstrualFlow: null,
        disturbanceFactors: ['TRAVEL'],
        travelTimeDiff: 2,
        notes: 'travel day',
      },
      ENTRY_DATE,
      DAY_OF_WEEK
    );
    expect(data.bbt).toBe(36.4);
    expect(data.bbtTime).toBe('07:05');
    expect(data.hadIntercourse).toBe(true);
    expect(data.excludeFromInterpretation).toBe(false);
    expect(data.cervicalAppearance).toBe('CREAMY');
    expect(data.cervicalSensation).toBe('WET');
    expect(data.opkStatus).toBe('rising');
    expect(data.menstrualFlow).toBeNull();
    expect(data.disturbanceFactors).toEqual(['TRAVEL']);
    expect(data.travelTimeDiff).toBe(2);
    expect(data.notes).toBe('travel day');
  });

  it('respects explicit null for nullable fields (clearing menstrual flow)', () => {
    const data = buildCycleDayUpdateData({ menstrualFlow: null }, ENTRY_DATE, DAY_OF_WEEK);
    expect('menstrualFlow' in data).toBe(true);
    expect(data.menstrualFlow).toBeNull();
  });
});

describe('buildCycleDayCreateData', () => {
  it('includes the required identity fields and omits absent optional ones', () => {
    const data = buildCycleDayCreateData(
      { notes: 'first note on a blank padded day' },
      { cycleId: 'cycle-1', dayNumber: 5, entryDate: ENTRY_DATE, dayOfWeek: DAY_OF_WEEK }
    );
    expect(data.cycleId).toBe('cycle-1');
    expect(data.dayNumber).toBe(5);
    expect(data.date).toBe(ENTRY_DATE);
    expect(data.dayOfWeek).toBe(DAY_OF_WEEK);
    expect(data.notes).toBe('first note on a blank padded day');
    // Booleans omitted → Prisma will fill the schema defaults.
    expect('hadIntercourse' in data).toBe(false);
    expect('excludeFromInterpretation' in data).toBe(false);
  });

  it('always provides disturbanceFactors (defaults to []) — schema has no DB default', () => {
    const data = buildCycleDayCreateData(
      { notes: 'hi' },
      { cycleId: 'cycle-1', dayNumber: 5, entryDate: ENTRY_DATE, dayOfWeek: DAY_OF_WEEK }
    );
    expect(data.disturbanceFactors).toEqual([]);
  });

  it('passes a provided disturbanceFactors through unchanged', () => {
    const data = buildCycleDayCreateData(
      { disturbanceFactors: ['TRAVEL', 'STRESS'] },
      { cycleId: 'cycle-1', dayNumber: 5, entryDate: ENTRY_DATE, dayOfWeek: DAY_OF_WEEK }
    );
    expect(data.disturbanceFactors).toEqual(['TRAVEL', 'STRESS']);
  });
});
