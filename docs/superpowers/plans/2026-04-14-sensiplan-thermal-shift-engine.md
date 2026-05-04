# Sensiplan Thermal Shift Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side Sensiplan thermal shift detection engine with proposition cards, chart overlays, nudges, and post-shift monitoring — all integrated into the existing CycleChartPage.

**Architecture:** The engine is a pure TypeScript function that takes cycle day data and returns a `ThermalShiftResult`. It runs in the browser whenever cycle data changes. Results are persisted via Wasp actions to a new `CycleInterpretation` Prisma model. The UI renders proposition cards below the existing chart, overlays the coverline on the ApexChart, and manages user actions (Confirm, Adjust, Reject, Keep Watching) through dedicated mutations.

**Tech Stack:** TypeScript, React 18, Wasp 0.18, Prisma (PostgreSQL), Vitest, ApexCharts

**Spec:** `docs/superpowers/specs/2026-04-14-sensiplan-thermal-shift-engine-design.md`

**Design mockup:** `.superpowers/brainstorm/61478-1776171908/content/full-design-mockup-v2.html`

---

## File Structure

### New files to create

```
app/src/cycle-tracking/interpretation/
  types.ts                        — All shared types (ThermalShiftResult, PostShiftMonitoring, etc.)
  sensiplan/
    excludedDays.ts               — collectReferenceDays(): skip excluded, reach back to fill 6
    thermalShift.ts               — detectThermalShift(): core sequential scan
    fourthDayException.ts         — checkFourthDayException(): 4th-day rule
    confidence.ts                 — calculateConfidence(): High/Low based on excluded count
    measurementTime.ts            — calculateTimeWindow(): circular averaging, travel segmentation
    nudges.ts                     — generateNudges(): pre-shift outliers, post-shift dips
    postShiftMonitoring.ts        — monitorPostShift(): false rise detection
    index.ts                      — runInterpretation(): orchestrates all modules
  __tests__/
    excludedDays.test.ts
    thermalShift.test.ts
    fourthDayException.test.ts
    confidence.test.ts
    measurementTime.test.ts
    nudges.test.ts
    postShiftMonitoring.test.ts
    integration.test.ts
  interpretationOperations.ts     — Wasp query + action implementations (server-side)
  components/
    PropositionCard.tsx            — Renders the appropriate card variant
    PendingCard.tsx                — Pending shift card
    ConfirmedCard.tsx              — Engine-confirmed card (awaiting user action)
    UserConfirmedCard.tsx          — User-confirmed state card
    UserAdjustedCard.tsx           — User-adjusted state card (engine has a shift)
    KeptShiftCard.tsx              — User kept a shift the engine no longer detects (ADJUSTED + none)
    NeedsReviewCard.tsx            — Data-edit review card
    FalseRiseWarningCard.tsx       — Post-shift monitoring warning
    AdjustFlow.tsx                 — Adjust shift day / coverline inline form
    FailedAttemptsSection.tsx      — Collapsed educational section
    ChangeNotice.tsx               — Blue info banner
    NudgeIcon.tsx                  — 💬 chart overlay icon
    NudgeMessage.tsx               — Expanded nudge with Yes/No buttons
    ConfidenceBadge.tsx            — High/Low badge with disclaimer
    cardStyles.ts                  — Shared Tailwind class constants for card variants
  hooks/
    useInterpretation.ts           — Orchestrates engine run, persistence, re-evaluation
```

### Files to modify

```
app/schema.prisma                 — Add CycleInterpretation model + enums + Cycle relation
app/main.wasp                     — Declare new query + actions + entity references
app/src/cycle-tracking/CycleChartPage.tsx — Integrate coverline overlay, day highlights, nudge icons, proposition card
```

---

## Task 1: Types

**Files:**
- Create: `app/src/cycle-tracking/interpretation/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// app/src/cycle-tracking/interpretation/types.ts

// ============================================================
// Engine input
// ============================================================

/** A single cycle day as consumed by the interpretation engine. */
export type CycleDayInput = {
  dayNumber: number;
  bbt: number | null;             // Fahrenheit (as stored in DB)
  bbtTime: string | null;         // "HH:MM" or null
  excludeFromInterpretation: boolean;
  disturbanceFactors: string[];
  travelTimeDiff: number | null;  // minutes offset if travel event
};

// ============================================================
// Thermal shift result — discriminated union
// ============================================================

export type ThermalShiftResult =
  | ThermalShiftNone
  | ThermalShiftPending
  | ThermalShiftConfirmed;

export type ThermalShiftNone = {
  status: 'none';
  reason: 'insufficient_data' | 'no_shift_detected';
  failedAttempts: FailedAttempt[];
};

export type ThermalShiftPending = {
  status: 'pending';
  shiftDay: number;
  coverlineTemp: number;            // °C, full precision
  referenceDays: number[];
  confirmingDays: number[];         // 1-3 recorded so far
  skippedDays: number[];
  usedFourthDayException: boolean;  // false while pending
  confidence: Confidence;
  confidenceReasons: string[];
  failedAttempts: FailedAttempt[];
};

export type ThermalShiftConfirmed = {
  status: 'confirmed';
  shiftDay: number;
  coverlineTemp: number;            // °C, full precision
  referenceDays: number[];
  confirmingDays: number[];         // 3 or 4 days
  skippedDays: number[];
  usedFourthDayException: boolean;
  confidence: Confidence;
  confidenceReasons: string[];
  failedAttempts: FailedAttempt[];
};

export type Confidence = 'high' | 'low';

export type FailedAttempt = {
  attemptedShiftDay: number;
  coverlineTemp: number;
  referenceDays: number[];
  failureReason: string;
  failedOnDay: number;
};

// ============================================================
// Post-shift monitoring
// ============================================================

export type PostShiftMonitoring = {
  isActive: boolean;
  falseRiseWarning: 'active' | 'dismissed' | null;
  daysMonitored: number;
  dipsBelow: DipBelow[];
  consecutiveUnexplainedDips: number;
};

export type DipBelow = {
  day: number;
  temp: number;       // °C
  explained: boolean;
  factors: string[];
};

// ============================================================
// Nudges
// ============================================================

export type NudgeType = 'pre_shift_outlier' | 'post_shift_dip';

export type Nudge = {
  day: number;
  type: NudgeType;
  message: string;
  resolved: boolean;
  response?: 'yes_disturbed' | 'no_correct';
};

// ============================================================
// Measurement time window
// ============================================================

export type TimeWindow = {
  meanMinutes: number;        // minutes since midnight (0-1439)
  windowStart: number;        // mean - 60 min (wrapped)
  windowEnd: number;          // mean + 60 min (wrapped)
};

export type TimeWindowResult = {
  hasWindow: boolean;
  segments: TimeWindowSegment[];
};

export type TimeWindowSegment = {
  fromDay: number;
  toDay: number;
  window: TimeWindow;
};

// ============================================================
// User overrides (stored in DB)
// ============================================================

export type UserOverrides = {
  shiftDay?: number;
  coverlineTemp?: number;     // °C
};

// ============================================================
// Full interpretation result (returned by orchestrator)
// ============================================================

export type InterpretationResult = {
  thermalShift: ThermalShiftResult;
  nudges: Nudge[];
  timeWindow: TimeWindowResult;
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run --reporter verbose src/cycle-tracking/interpretation/__tests__/ 2>&1 | head -20` (will fail with "no test files found" — that's expected at this point, confirms vitest can resolve the file). As a secondary check, verify the file parses: `node -e "require('typescript').createProgram(['src/cycle-tracking/interpretation/types.ts'], { noEmit: true, strict: true, moduleResolution: 100 }).emit()"`

Expected: No syntax errors. Type-checking of Wasp imports will be verified after `wasp start` in Task 10.

- [ ] **Step 3: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/types.ts
git commit -m "feat(interpretation): add shared types for thermal shift engine"
```

---

## Task 2: Excluded Days — Collect Reference Days

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/excludedDays.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/excludedDays.test.ts
import { describe, it, expect } from 'vitest';
import { collectReferenceDays } from '../sensiplan/excludedDays';
import type { CycleDayInput } from '../types';

/** Helper: build a CycleDayInput with defaults. bbt is in Fahrenheit. */
function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber,
    bbt,
    bbtTime: null,
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
    ...opts,
  };
}

describe('collectReferenceDays', () => {
  it('returns 6 consecutive valid days immediately before candidateDay', () => {
    const days = [
      day(1, 97.5), day(2, 97.6), day(3, 97.4),
      day(4, 97.7), day(5, 97.5), day(6, 97.6),
      day(7, 97.8), day(8, 98.5),
    ];
    const result = collectReferenceDays(days, 7);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.skippedDays).toEqual([]);
  });

  it('skips excluded days and reaches back further', () => {
    const days = [
      day(1, 97.3), day(2, 97.5), day(3, 97.4),
      day(4, 97.7, { excludeFromInterpretation: true }),
      day(5, 97.5), day(6, 97.6), day(7, 97.4),
      day(8, 97.5), day(9, 98.5),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([2, 3, 5, 6, 7, 8]);
    expect(result!.skippedDays).toEqual([4]);
  });

  it('skips excluded day that would have been highest — coverline recalculates lower', () => {
    // Day 4 at 98.0°F is excluded. Without it, highest of 6 is lower.
    const days = [
      day(1, 97.3), day(2, 97.5), day(3, 97.6),
      day(4, 98.0, { excludeFromInterpretation: true }),
      day(5, 97.4), day(6, 97.5), day(7, 97.7),
      day(8, 97.6),
      day(9, 98.5), // candidate
    ];
    const result = collectReferenceDays(days, 9);
    expect(result).not.toBeNull();
    // Should include day 1 as reach-back to replace excluded day 4
    expect(result!.referenceDays).toEqual([1, 2, 3, 5, 6, 7]);
    expect(result!.skippedDays).toEqual([4]);
  });

  it('handles 3+ excluded days (still evaluable, reaches back)', () => {
    const days = [
      day(1, 97.0), day(2, 97.1), day(3, 97.2),
      day(4, 97.3, { excludeFromInterpretation: true }),
      day(5, 97.4, { excludeFromInterpretation: true }),
      day(6, 97.5, { excludeFromInterpretation: true }),
      day(7, 97.6), day(8, 97.7), day(9, 97.8),
      day(10, 98.5),
    ];
    const result = collectReferenceDays(days, 10);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 7, 8, 9]);
    expect(result!.skippedDays).toEqual([4, 5, 6]);
  });

  it('returns null when fewer than 6 valid temps exist', () => {
    const days = [
      day(1, 97.5), day(2, 97.6), day(3, 97.4),
      day(4, 97.7), day(5, 97.5),
      day(6, 98.5),
    ];
    const result = collectReferenceDays(days, 6);
    expect(result).toBeNull();
  });

  it('skips days with null bbt', () => {
    const days = [
      day(1, 97.3), day(2, null), day(3, 97.5),
      day(4, 97.6), day(5, 97.4), day(6, 97.5),
      day(7, 97.7), day(8, 97.6),
      day(9, 98.5),
    ];
    const result = collectReferenceDays(days, 9);
    expect(result).not.toBeNull();
    // Day 2 has null bbt — treated like a missing day, reach back to day 1
    expect(result!.referenceDays).toEqual([1, 3, 4, 5, 6, 7]);
    expect(result!.skippedDays).toEqual([]);
  });

  it('handles excluded day immediately before the candidate', () => {
    const days = [
      day(1, 97.3), day(2, 97.4), day(3, 97.5),
      day(4, 97.6), day(5, 97.7), day(6, 97.5),
      day(7, 97.6, { excludeFromInterpretation: true }),
      day(8, 98.5),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.skippedDays).toEqual([7]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/excludedDays.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement collectReferenceDays**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts
import type { CycleDayInput } from '../types';
import { fahrenheitToCelsius } from '../../utils';

export type ReferenceResult = {
  referenceDays: number[];   // dayNumbers of the 6 valid reference days
  coverlineTemp: number;     // °C — highest of the 6
  skippedDays: number[];     // excluded dayNumbers that were skipped
};

/**
 * Collect the 6 valid (non-excluded, non-null bbt) temperatures
 * immediately before candidateDay, scanning backward.
 *
 * Returns null if fewer than 6 valid temps are available.
 */
export function collectReferenceDays(
  days: CycleDayInput[],
  candidateDay: number,
): ReferenceResult | null {
  const referenceDays: number[] = [];
  const skippedDays: number[] = [];

  // Sort days by dayNumber descending so we scan backward from candidateDay
  const sorted = [...days]
    .filter((d) => d.dayNumber < candidateDay)
    .sort((a, b) => b.dayNumber - a.dayNumber);

  for (const d of sorted) {
    if (referenceDays.length >= 6) break;

    if (d.bbt === null) {
      // No recorded temp — skip silently (not an "excluded" day)
      continue;
    }

    if (d.excludeFromInterpretation) {
      skippedDays.push(d.dayNumber);
      continue;
    }

    referenceDays.push(d.dayNumber);
  }

  if (referenceDays.length < 6) return null;

  // Reverse so they're in ascending order
  referenceDays.reverse();
  skippedDays.reverse();

  // Calculate coverline = highest of the 6 valid temps (in °C, full precision)
  const dayMap = new Map(days.map((d) => [d.dayNumber, d]));
  let coverlineTemp = -Infinity;
  for (const dayNum of referenceDays) {
    const tempF = dayMap.get(dayNum)!.bbt!;
    const tempC = fahrenheitToCelsius(tempF);
    if (tempC > coverlineTemp) {
      coverlineTemp = tempC;
    }
  }

  return { referenceDays, coverlineTemp, skippedDays };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/excludedDays.test.ts`

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts \
        app/src/cycle-tracking/interpretation/__tests__/excludedDays.test.ts
git commit -m "feat(interpretation): add excluded day handling with reach-back logic"
```

---

## Task 3: Fourth Day Exception

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/fourthDayException.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/fourthDayException.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/fourthDayException.test.ts
import { describe, it, expect } from 'vitest';
import { checkFourthDayException } from '../sensiplan/fourthDayException';
import type { CycleDayInput } from '../types';
import { fahrenheitToCelsius } from '../../utils';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

describe('checkFourthDayException', () => {
  // Coverline = 36.4°C. Third temp above coverline but below +0.2°C.
  const coverlineC = 36.4;

  it('confirms shift when 4th temp is above coverline', () => {
    // 4th day temp = 36.52°C (above coverline 36.4)
    const days = [day(18, null)]; // stand-in — we pass 4th day directly
    const fourthDayTemp = 36.52; // °C
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(true);
  });

  it('rejects when 4th temp is at or below coverline', () => {
    const fourthDayTemp = 36.4; // exactly at coverline — not above
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(false);
  });

  it('rejects when 4th temp is below coverline', () => {
    const fourthDayTemp = 36.3;
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(false);
  });

  it('confirms when 4th temp is just barely above coverline', () => {
    const fourthDayTemp = 36.400001; // float above
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/fourthDayException.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement checkFourthDayException**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/fourthDayException.ts

/**
 * Sensiplan 4th-day exception rule.
 *
 * Called when the 3rd higher temp is above the coverline but did NOT
 * clear coverline + 0.2°C. If a 4th consecutive valid temp exists
 * and is strictly above the coverline, the shift is confirmed.
 *
 * The 4th temp does NOT need to clear +0.2°C.
 *
 * @param fourthTempC - The 4th consecutive higher temp in °C
 * @param coverlineC  - The coverline in °C
 * @returns true if the 4th-day exception confirms the shift
 */
export function checkFourthDayException(
  fourthTempC: number,
  coverlineC: number,
): boolean {
  return fourthTempC > coverlineC;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/fourthDayException.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/fourthDayException.ts \
        app/src/cycle-tracking/interpretation/__tests__/fourthDayException.test.ts
git commit -m "feat(interpretation): add 4th-day exception rule"
```

---

## Task 4: Core Thermal Shift Detection

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts
import { describe, it, expect } from 'vitest';
import { detectThermalShift } from '../sensiplan/thermalShift';
import type { CycleDayInput } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

// Helper: convert °C to °F for test data (stored in Fahrenheit)
function cToF(c: number): number { return (c * 9 / 5) + 32; }

describe('detectThermalShift', () => {
  describe('standard 3-over-6 confirmation', () => {
    it('detects a textbook thermal shift', () => {
      // 6 low temps around 36.3°C, then 3 higher temps with 3rd >= coverline + 0.2
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), // 1st higher (above 36.3 coverline)
        day(8, cToF(36.50)), // 2nd higher
        day(9, cToF(36.55)), // 3rd higher >= 36.3 + 0.2 = 36.5 ✓
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
        expect(result.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
        expect(result.confirmingDays).toEqual([7, 8, 9]);
        expect(result.usedFourthDayException).toBe(false);
      }
    });

    it('returns none when no shift is detectable', () => {
      // All temps are flat around 36.3°C
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.2)), day(8, cToF(36.3)), day(9, cToF(36.1)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('none');
      if (result.status === 'none') {
        expect(result.reason).toBe('no_shift_detected');
      }
    });

    it('returns none with insufficient_data when fewer than 6 valid temps', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)),
        day(3, cToF(36.5)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('none');
      if (result.status === 'none') {
        expect(result.reason).toBe('insufficient_data');
      }
    });
  });

  describe('pending detection', () => {
    it('returns pending when only 1 of 3 confirming temps recorded', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), // 1st higher — only one so far
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7]);
      }
    });

    it('returns pending when 2 of 3 confirming temps recorded', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), // 1st higher
        day(8, cToF(36.50)), // 2nd higher — still waiting for 3rd
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 8]);
      }
    });

    it('returns pending when 4th-day exception is in progress', () => {
      // 3rd temp above coverline but below +0.2°C, awaiting 4th
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), // 1st higher
        day(8, cToF(36.40)), // 2nd higher (above coverline 36.3)
        day(9, cToF(36.48)), // 3rd higher — above 36.3 but < 36.5 (+0.2)
        // No 4th day yet
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 8, 9]);
      }
    });
  });

  describe('4th-day exception', () => {
    it('confirms shift with 4th-day exception when 3rd temp below +0.2', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),  // 1st higher
        day(8, cToF(36.40)),  // 2nd higher
        day(9, cToF(36.48)),  // 3rd: above 36.3 but < 36.5
        day(10, cToF(36.42)), // 4th: above 36.3 → confirms
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 8, 9, 10]);
        expect(result.usedFourthDayException).toBe(true);
      }
    });
  });

  describe('failed attempts and resume scanning', () => {
    it('records failed attempt and finds shift later', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), // 1st higher — candidate
        day(8, cToF(36.20)), // drops below coverline → FAIL
        day(9, cToF(36.3)),  day(10, cToF(36.2)),
        day(11, cToF(36.45)), // new 1st higher
        day(12, cToF(36.50)), // 2nd
        day(13, cToF(36.55)), // 3rd ≥ +0.2 → confirmed
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(11);
        expect(result.failedAttempts).toHaveLength(1);
        expect(result.failedAttempts[0].attemptedShiftDay).toBe(7);
        expect(result.failedAttempts[0].failedOnDay).toBe(8);
      }
    });
  });

  describe('excluded days in confirming temps', () => {
    it('skips excluded day in the 3 highs and extends', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), // 1st higher
        day(8, cToF(36.50), { excludeFromInterpretation: true }), // excluded
        day(9, cToF(36.48)), // 2nd higher (skipped 8)
        day(10, cToF(36.55)), // 3rd higher ≥ +0.2
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 9, 10]);
      }
    });
  });

  describe('first valid shift wins', () => {
    it('stops scanning after the first confirmed shift', () => {
      // Two possible shifts — engine should find the first one and stop
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
        // Shift confirmed at day 7. Days below shouldn't be evaluated.
        day(10, cToF(36.2)), day(11, cToF(36.3)),
        day(12, cToF(36.6)), day(13, cToF(36.7)), day(14, cToF(36.8)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement detectThermalShift**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts
import type {
  CycleDayInput,
  ThermalShiftResult,
  FailedAttempt,
} from '../types';
import { collectReferenceDays } from './excludedDays';
import { checkFourthDayException } from './fourthDayException';
import { fahrenheitToCelsius } from '../../utils';

const THRESHOLD_C = 0.2;

/**
 * Sensiplan sequential thermal shift detection.
 *
 * Scans forward through cycle days. For each candidate first higher
 * temperature, checks 3-over-6 rule with +0.2°C on the 3rd.
 * Finds the FIRST valid shift and stops.
 */
export function detectThermalShift(days: CycleDayInput[]): ThermalShiftResult {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const failedAttempts: FailedAttempt[] = [];

  // Track whether we ever had enough data to even attempt evaluation
  let hadEnoughData = false;

  let i = 0;
  while (i < sorted.length) {
    const candidateDay = sorted[i];

    // Skip days without temps or excluded days
    if (candidateDay.bbt === null || candidateDay.excludeFromInterpretation) {
      i++;
      continue;
    }

    // Step 1: Collect 6 valid reference temps before this day
    const refResult = collectReferenceDays(sorted, candidateDay.dayNumber);
    if (!refResult) {
      i++;
      continue;
    }

    hadEnoughData = true;
    const { coverlineTemp, referenceDays, skippedDays } = refResult;
    const candidateTempC = fahrenheitToCelsius(candidateDay.bbt);

    // Step 3: Is this day above coverline?
    if (candidateTempC <= coverlineTemp) {
      i++;
      continue;
    }

    // This is a potential first higher temp. Check confirming temps.
    const confirmResult = checkConfirmingTemps(
      sorted, i, coverlineTemp, candidateDay.dayNumber
    );

    if (confirmResult.outcome === 'confirmed') {
      return {
        status: 'confirmed',
        shiftDay: candidateDay.dayNumber,
        coverlineTemp,
        referenceDays,
        confirmingDays: [candidateDay.dayNumber, ...confirmResult.confirmingDays],
        skippedDays,
        usedFourthDayException: confirmResult.usedFourthDay,
        confidence: 'high', // placeholder — Task 5 calculates this properly
        confidenceReasons: [],
        failedAttempts,
      };
    }

    if (confirmResult.outcome === 'pending') {
      return {
        status: 'pending',
        shiftDay: candidateDay.dayNumber,
        coverlineTemp,
        referenceDays,
        confirmingDays: [candidateDay.dayNumber, ...confirmResult.confirmingDays],
        skippedDays,
        usedFourthDayException: false,
        confidence: 'high', // placeholder — Task 5 calculates this properly
        confidenceReasons: [],
        failedAttempts,
      };
    }

    // Failed — record and resume scanning from after the failure point
    if (confirmResult.outcome === 'failed') {
      failedAttempts.push({
        attemptedShiftDay: candidateDay.dayNumber,
        coverlineTemp,
        referenceDays,
        failureReason: `Temperature on Day ${confirmResult.failedOnDay} dropped below coverline`,
        failedOnDay: confirmResult.failedOnDay,
      });

      // Resume scanning from the day after the failure
      const failIdx = sorted.findIndex((d) => d.dayNumber === confirmResult.failedOnDay);
      i = failIdx >= 0 ? failIdx + 1 : i + 1;
      continue;
    }

    i++;
  }

  return {
    status: 'none',
    reason: hadEnoughData ? 'no_shift_detected' : 'insufficient_data',
    failedAttempts,
  };
}

type ConfirmOutcome =
  | { outcome: 'confirmed'; confirmingDays: number[]; usedFourthDay: boolean }
  | { outcome: 'pending'; confirmingDays: number[] }
  | { outcome: 'failed'; failedOnDay: number };

/**
 * Starting from the day after the candidate (index candidateIdx),
 * check the next valid temps for 3-over-6 confirmation.
 */
function checkConfirmingTemps(
  sorted: CycleDayInput[],
  candidateIdx: number,
  coverlineC: number,
  candidateDayNumber: number,
): ConfirmOutcome {
  const confirmingDays: number[] = [];
  let needFourthDay = false;

  // We need 2 more valid temps after the candidate (positions 2nd and 3rd)
  let j = candidateIdx + 1;

  while (j < sorted.length && confirmingDays.length < (needFourthDay ? 3 : 2)) {
    const d = sorted[j];

    // Skip days without temps or excluded days
    if (d.bbt === null || d.excludeFromInterpretation) {
      j++;
      continue;
    }

    const tempC = fahrenheitToCelsius(d.bbt);
    const positionInConfirm = confirmingDays.length + 1; // 1-indexed (2nd, 3rd, or 4th)

    if (positionInConfirm === 1) {
      // 2nd higher temp: must be above coverline
      if (tempC <= coverlineC) {
        return { outcome: 'failed', failedOnDay: d.dayNumber };
      }
      confirmingDays.push(d.dayNumber);
    } else if (positionInConfirm === 2 && !needFourthDay) {
      // 3rd higher temp: must be above coverline
      if (tempC <= coverlineC) {
        return { outcome: 'failed', failedOnDay: d.dayNumber };
      }
      // Must also clear +0.2°C
      if (tempC >= coverlineC + THRESHOLD_C) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: false };
      }
      // Above coverline but didn't clear +0.2 — try 4th-day exception
      confirmingDays.push(d.dayNumber);
      needFourthDay = true;
    } else if (needFourthDay && positionInConfirm === 3) {
      // 4th temp: only needs to be above coverline
      if (checkFourthDayException(tempC, coverlineC)) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: true };
      }
      // 4th temp is at or below coverline — attempt failed
      return { outcome: 'failed', failedOnDay: d.dayNumber };
    }

    j++;
  }

  // Ran out of data while mid-confirmation → pending
  return { outcome: 'pending', confirmingDays };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts`

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts \
        app/src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts
git commit -m "feat(interpretation): add core sequential thermal shift detection algorithm"
```

---

## Task 5: Confidence Calculation

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/confidence.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/confidence.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/confidence.test.ts
import { describe, it, expect } from 'vitest';
import { calculateConfidence } from '../sensiplan/confidence';

describe('calculateConfidence', () => {
  it('returns high with 0 excluded days', () => {
    const result = calculateConfidence(0);
    expect(result.confidence).toBe('high');
    expect(result.reasons).toEqual([]);
  });

  it('returns high with 1 excluded day', () => {
    const result = calculateConfidence(1);
    expect(result.confidence).toBe('high');
    expect(result.reasons).toEqual([]);
  });

  it('returns high with 2 excluded days', () => {
    const result = calculateConfidence(2);
    expect(result.confidence).toBe('high');
    expect(result.reasons).toEqual([]);
  });

  it('returns low with 3 excluded days', () => {
    const result = calculateConfidence(3);
    expect(result.confidence).toBe('low');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('3');
  });

  it('returns low with 5 excluded days', () => {
    const result = calculateConfidence(5);
    expect(result.confidence).toBe('low');
    expect(result.reasons[0]).toContain('5');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/confidence.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement calculateConfidence**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/confidence.ts
import type { Confidence } from '../types';

export type ConfidenceResult = {
  confidence: Confidence;
  reasons: string[];
};

/**
 * Calculate confidence level based on the number of excluded days
 * that were skipped in the reference window.
 *
 * [CyclePath Enhancement] — Sensiplan evaluation is binary.
 * This reflects data quality, not rule compliance.
 *
 * High: 0-2 excluded days (standard Sensiplan evaluation)
 * Low: 3+ excluded days (sparse data, but still evaluable)
 */
export function calculateConfidence(excludedCount: number): ConfidenceResult {
  if (excludedCount <= 2) {
    return { confidence: 'high', reasons: [] };
  }

  return {
    confidence: 'low',
    reasons: [
      `${excludedCount} temperatures were excluded from the reference window. ` +
      `The engine had to reach further back, which may reduce relevance to the current cycle.`,
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/confidence.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Wire confidence into thermalShift.ts**

Replace the two placeholder `confidence: 'high'` lines in `thermalShift.ts`:

In `app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts`, add import at the top:

```typescript
import { calculateConfidence } from './confidence';
```

Then replace both `confirmed` and `pending` return blocks to compute confidence from `skippedDays.length`:

In the `confirmed` return block, replace:
```typescript
        confidence: 'high', // placeholder — Task 5 calculates this properly
        confidenceReasons: [],
```
with:
```typescript
        confidence: calculateConfidence(skippedDays.length).confidence,
        confidenceReasons: calculateConfidence(skippedDays.length).reasons,
```

In the `pending` return block, replace:
```typescript
        confidence: 'high', // placeholder — Task 5 calculates this properly
        confidenceReasons: [],
```
with:
```typescript
        confidence: calculateConfidence(skippedDays.length).confidence,
        confidenceReasons: calculateConfidence(skippedDays.length).reasons,
```

- [ ] **Step 6: Run all interpretation tests to verify nothing broke**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/`

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/confidence.ts \
        app/src/cycle-tracking/interpretation/__tests__/confidence.test.ts \
        app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts
git commit -m "feat(interpretation): add confidence calculation wired into thermal shift"
```

---

## Task 6: Measurement Time Window

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/measurementTime.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/measurementTime.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/measurementTime.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTimeWindow, isWithinWindow } from '../sensiplan/measurementTime';
import type { CycleDayInput } from '../types';

function day(dayNumber: number, bbt: number | null, bbtTime: string | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

describe('calculateTimeWindow', () => {
  it('returns hasWindow=false with fewer than 5 data points', () => {
    const days = [
      day(1, 97.5, '06:30'), day(2, 97.6, '06:45'),
      day(3, 97.4, '07:00'), day(4, 97.5, '06:50'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(false);
    expect(result.segments).toEqual([]);
  });

  it('calculates a single-segment window with 5+ data points', () => {
    const days = [
      day(1, 97.5, '06:30'), day(2, 97.6, '06:45'),
      day(3, 97.4, '07:00'), day(4, 97.5, '06:50'),
      day(5, 97.6, '06:35'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    expect(result.segments).toHaveLength(1);
    // Mean should be around 06:44 (average of 390, 405, 420, 410, 395 = 404 min)
    const seg = result.segments[0];
    expect(seg.window.meanMinutes).toBeGreaterThan(390);
    expect(seg.window.meanMinutes).toBeLessThan(420);
  });

  it('handles midnight-crossing times correctly via circular averaging', () => {
    // Times: 23:30, 23:45, 00:00, 00:15, 00:30
    // Mean should be near midnight, NOT near noon
    const days = [
      day(1, 97.5, '23:30'), day(2, 97.6, '23:45'),
      day(3, 97.4, '00:00'), day(4, 97.5, '00:15'),
      day(5, 97.6, '00:30'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    const mean = result.segments[0].window.meanMinutes;
    // Mean should be near 0 (midnight), within ±30 minutes
    const nearMidnight = mean < 30 || mean > 1410;
    expect(nearMidnight).toBe(true);
  });

  it('skips days with null bbtTime in the calculation', () => {
    const days = [
      day(1, 97.5, '06:30'), day(2, 97.6, null),
      day(3, 97.4, '07:00'), day(4, 97.5, '06:50'),
      day(5, 97.6, '06:35'), day(6, 97.5, '06:40'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    // Day 2 excluded — should have 5 valid points
    expect(result.segments).toHaveLength(1);
  });

  it('splits into segments when travel event detected', () => {
    const days = [
      day(1, 97.5, '06:30'), day(2, 97.6, '06:45'),
      day(3, 97.4, '07:00'), day(4, 97.5, '06:50'),
      day(5, 97.6, '06:35'),
      // Day 6 has travel — switch to new timezone
      day(6, 97.5, '09:30', { travelTimeDiff: 180 }), // +3h travel
      day(7, 97.6, '09:45'), day(8, 97.4, '10:00'),
      day(9, 97.5, '09:50'), day(10, 97.6, '09:35'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].toDay).toBe(5);
    expect(result.segments[1].fromDay).toBe(6);
  });
});

describe('isWithinWindow', () => {
  it('returns true for a time within the window', () => {
    expect(isWithinWindow('06:30', { meanMinutes: 400, windowStart: 340, windowEnd: 460 })).toBe(true);
  });

  it('returns false for a time outside the window', () => {
    expect(isWithinWindow('10:00', { meanMinutes: 400, windowStart: 340, windowEnd: 460 })).toBe(false);
  });

  it('handles midnight-wrapped window (windowStart > windowEnd)', () => {
    // Window from 23:00 to 01:00 — wraps around midnight
    expect(isWithinWindow('23:30', { meanMinutes: 0, windowStart: 1380, windowEnd: 60 })).toBe(true);
    expect(isWithinWindow('00:30', { meanMinutes: 0, windowStart: 1380, windowEnd: 60 })).toBe(true);
    expect(isWithinWindow('12:00', { meanMinutes: 0, windowStart: 1380, windowEnd: 60 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/measurementTime.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement calculateTimeWindow and isWithinWindow**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/measurementTime.ts
import type { CycleDayInput, TimeWindow, TimeWindowResult, TimeWindowSegment } from '../types';

const MINUTES_PER_DAY = 1440;
const WINDOW_HALF_WIDTH = 60; // ±1 hour
const MIN_DATA_POINTS = 5;

/**
 * Parse "HH:MM" to minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Circular mean of time-of-day values.
 * Converts to angles on a circle, averages sin/cos, converts back.
 * This ensures 23:30 and 00:30 average to midnight, not noon.
 */
function circularMean(minuteValues: number[]): number {
  let sinSum = 0;
  let cosSum = 0;

  for (const m of minuteValues) {
    const angle = (m / MINUTES_PER_DAY) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  const meanAngle = Math.atan2(sinSum, cosSum);
  let meanMinutes = (meanAngle / (2 * Math.PI)) * MINUTES_PER_DAY;

  // Normalize to 0–1439
  if (meanMinutes < 0) meanMinutes += MINUTES_PER_DAY;

  return Math.round(meanMinutes);
}

/**
 * Build a TimeWindow from a mean.
 */
function buildWindow(meanMinutes: number): TimeWindow {
  let windowStart = meanMinutes - WINDOW_HALF_WIDTH;
  let windowEnd = meanMinutes + WINDOW_HALF_WIDTH;

  // Wrap around midnight
  if (windowStart < 0) windowStart += MINUTES_PER_DAY;
  if (windowEnd >= MINUTES_PER_DAY) windowEnd -= MINUTES_PER_DAY;

  return { meanMinutes, windowStart, windowEnd };
}

/**
 * Calculate the measurement time window for a cycle.
 *
 * [CyclePath Enhancement]
 * - Requires 5+ data points before establishing a window.
 * - Uses circular averaging to handle midnight crossings.
 * - Splits into segments at travel events.
 */
export function calculateTimeWindow(days: CycleDayInput[]): TimeWindowResult {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  // Find travel break points to split into segments
  const segments: { from: number; to: number; days: CycleDayInput[] }[] = [];
  let currentSegmentStart = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].travelTimeDiff != null && sorted[i].travelTimeDiff !== 0 && i > 0) {
      // Travel event — close current segment, start new one
      segments.push({
        from: sorted[currentSegmentStart].dayNumber,
        to: sorted[i - 1].dayNumber,
        days: sorted.slice(currentSegmentStart, i),
      });
      currentSegmentStart = i;
    }
  }
  // Last segment
  segments.push({
    from: sorted[currentSegmentStart].dayNumber,
    to: sorted[sorted.length - 1].dayNumber,
    days: sorted.slice(currentSegmentStart),
  });

  // If only one segment, treat the whole cycle as one
  const resultSegments: TimeWindowSegment[] = [];

  for (const seg of segments) {
    const timesMinutes: number[] = [];
    for (const d of seg.days) {
      if (d.bbtTime) {
        timesMinutes.push(parseTimeToMinutes(d.bbtTime));
      }
    }

    if (timesMinutes.length < MIN_DATA_POINTS) continue;

    const meanMinutes = circularMean(timesMinutes);
    resultSegments.push({
      fromDay: seg.from,
      toDay: seg.to,
      window: buildWindow(meanMinutes),
    });
  }

  return {
    hasWindow: resultSegments.length > 0,
    segments: resultSegments,
  };
}

/**
 * Check if a given time string is within a TimeWindow.
 * Handles windows that wrap around midnight.
 */
export function isWithinWindow(time: string, window: TimeWindow): boolean {
  const minutes = parseTimeToMinutes(time);

  if (window.windowStart <= window.windowEnd) {
    // Normal range (no midnight wrap)
    return minutes >= window.windowStart && minutes <= window.windowEnd;
  }

  // Wrapped around midnight (e.g., 23:00 → 01:00)
  return minutes >= window.windowStart || minutes <= window.windowEnd;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/measurementTime.test.ts`

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/measurementTime.ts \
        app/src/cycle-tracking/interpretation/__tests__/measurementTime.test.ts
git commit -m "feat(interpretation): add measurement time window with circular averaging"
```

---

## Task 7: Nudges

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/nudges.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/nudges.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/nudges.test.ts
import { describe, it, expect } from 'vitest';
import { generateNudges } from '../sensiplan/nudges';
import type { CycleDayInput, ThermalShiftResult, TimeWindowResult } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9 / 5) + 32; }

const noWindow: TimeWindowResult = { hasWindow: false, segments: [] };

describe('generateNudges', () => {
  describe('pre-shift outlier detection', () => {
    it('nudges when a pre-shift temp spikes ≥ 0.2°C above neighbors', () => {
      const days = [
        day(1, cToF(36.3)), day(2, cToF(36.3)),
        day(3, cToF(36.6)), // spike: 0.3°C above neighbors
        day(4, cToF(36.3)), day(5, cToF(36.3)),
      ];
      // No shift — all pre-shift
      const shiftResult: ThermalShiftResult = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
      const nudges = generateNudges(days, shiftResult, noWindow);
      expect(nudges).toHaveLength(1);
      expect(nudges[0].day).toBe(3);
      expect(nudges[0].type).toBe('pre_shift_outlier');
    });

    it('does not nudge when spike is < 0.2°C', () => {
      const days = [
        day(1, cToF(36.3)), day(2, cToF(36.3)),
        day(3, cToF(36.49)), // 0.19°C — below threshold
        day(4, cToF(36.3)), day(5, cToF(36.3)),
      ];
      const shiftResult: ThermalShiftResult = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
      const nudges = generateNudges(days, shiftResult, noWindow);
      expect(nudges).toHaveLength(0);
    });

    it('skips excluded days when computing neighbors', () => {
      const days = [
        day(1, cToF(36.3)),
        day(2, cToF(36.8), { excludeFromInterpretation: true }), // excluded — skip
        day(3, cToF(36.6)), // neighbors are day 1 (36.3) and day 4 (36.3) → spike of 0.3
        day(4, cToF(36.3)),
      ];
      const shiftResult: ThermalShiftResult = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
      const nudges = generateNudges(days, shiftResult, noWindow);
      expect(nudges).toHaveLength(1);
      expect(nudges[0].day).toBe(3);
    });
  });

  describe('post-shift dip detection', () => {
    it('nudges when a post-shift temp drops below coverline without disturbance', () => {
      const shiftResult: ThermalShiftResult = {
        status: 'confirmed',
        shiftDay: 7, coverlineTemp: 36.3,
        referenceDays: [1, 2, 3, 4, 5, 6], confirmingDays: [7, 8, 9],
        skippedDays: [], usedFourthDayException: false,
        confidence: 'high', confidenceReasons: [], failedAttempts: [],
      };
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
        day(10, cToF(36.2)), // below coverline, no disturbance
      ];
      const nudges = generateNudges(days, shiftResult, noWindow);
      const postNudges = nudges.filter((n) => n.type === 'post_shift_dip');
      expect(postNudges).toHaveLength(1);
      expect(postNudges[0].day).toBe(10);
    });

    it('does not nudge when post-shift dip has disturbance factors', () => {
      const shiftResult: ThermalShiftResult = {
        status: 'confirmed',
        shiftDay: 7, coverlineTemp: 36.3,
        referenceDays: [1, 2, 3, 4, 5, 6], confirmingDays: [7, 8, 9],
        skippedDays: [], usedFourthDayException: false,
        confidence: 'high', confidenceReasons: [], failedAttempts: [],
      };
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
        day(10, cToF(36.2), { disturbanceFactors: ['POOR_SLEEP'] }),
      ];
      const nudges = generateNudges(days, shiftResult, noWindow);
      const postNudges = nudges.filter((n) => n.type === 'post_shift_dip');
      expect(postNudges).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/nudges.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement generateNudges**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/nudges.ts
import type { CycleDayInput, ThermalShiftResult, Nudge, TimeWindowResult } from '../types';
import { isWithinWindow } from './measurementTime';
import { fahrenheitToCelsius } from '../../utils';

const SPIKE_THRESHOLD_C = 0.2;
const NEIGHBOR_RANGE = 2; // up to 2 temps on each side

/**
 * Generate data quality nudges for a cycle.
 *
 * [CyclePath Enhancement]
 * - Pre-shift: suspicious outliers (≥ 0.2°C above neighbors)
 * - Post-shift: temps below coverline without disturbance factors
 */
export function generateNudges(
  days: CycleDayInput[],
  shiftResult: ThermalShiftResult,
  timeWindow: TimeWindowResult,
): Nudge[] {
  const nudges: Nudge[] = [];
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  const shiftDay = shiftResult.status !== 'none' ? shiftResult.shiftDay : null;

  // Pre-shift outlier detection
  for (const d of sorted) {
    if (d.bbt === null || d.excludeFromInterpretation) continue;
    // Only pre-shift days (before shift day, or all days if no shift)
    if (shiftDay !== null && d.dayNumber >= shiftDay) continue;

    const tempC = fahrenheitToCelsius(d.bbt);
    const neighbors = getValidNeighborTemps(sorted, d.dayNumber, NEIGHBOR_RANGE);
    if (neighbors.length === 0) continue;

    const avgNeighbor = neighbors.reduce((sum, t) => sum + t, 0) / neighbors.length;
    const spike = tempC - avgNeighbor;

    if (spike >= SPIKE_THRESHOLD_C) {
      let message = `Day ${d.dayNumber} temperature appears unusually high compared to neighboring days.`;

      // Check if outside time window
      if (timeWindow.hasWindow && d.bbtTime) {
        const segment = timeWindow.segments.find(
          (s) => d.dayNumber >= s.fromDay && d.dayNumber <= s.toDay
        );
        if (segment && !isWithinWindow(d.bbtTime, segment.window)) {
          message += ` It was also taken outside your usual measurement time window.`;
        }
      }

      message += ` Was this temperature affected by a disturbance?`;

      nudges.push({
        day: d.dayNumber,
        type: 'pre_shift_outlier',
        message,
        resolved: false,
      });
    }
  }

  // Post-shift dip detection
  if (shiftResult.status === 'confirmed') {
    const coverline = shiftResult.coverlineTemp;
    const lastConfirmDay = Math.max(...shiftResult.confirmingDays);

    for (const d of sorted) {
      if (d.bbt === null || d.excludeFromInterpretation) continue;
      if (d.dayNumber <= lastConfirmDay) continue;

      const tempC = fahrenheitToCelsius(d.bbt);
      if (tempC < coverline && d.disturbanceFactors.length === 0) {
        nudges.push({
          day: d.dayNumber,
          type: 'post_shift_dip',
          message:
            `Day ${d.dayNumber} temperature dropped below your coverline with no disturbance recorded. ` +
            `Was it affected by a disturbance?`,
          resolved: false,
        });
      }
    }
  }

  return nudges;
}

/**
 * Get valid (non-excluded, non-null) neighbor temps in °C,
 * up to `range` on each side, skipping excluded days.
 */
function getValidNeighborTemps(
  sorted: CycleDayInput[],
  dayNumber: number,
  range: number,
): number[] {
  const temps: number[] = [];

  // Scan backward
  let found = 0;
  for (let i = sorted.findIndex((d) => d.dayNumber === dayNumber) - 1; i >= 0 && found < range; i--) {
    const d = sorted[i];
    if (d.bbt !== null && !d.excludeFromInterpretation) {
      temps.push(fahrenheitToCelsius(d.bbt));
      found++;
    }
  }

  // Scan forward
  found = 0;
  for (let i = sorted.findIndex((d) => d.dayNumber === dayNumber) + 1; i < sorted.length && found < range; i++) {
    const d = sorted[i];
    if (d.bbt !== null && !d.excludeFromInterpretation) {
      temps.push(fahrenheitToCelsius(d.bbt));
      found++;
    }
  }

  return temps;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/nudges.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/nudges.ts \
        app/src/cycle-tracking/interpretation/__tests__/nudges.test.ts
git commit -m "feat(interpretation): add nudge generation for outliers and post-shift dips"
```

---

## Task 8: Post-Shift Monitoring

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/postShiftMonitoring.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/postShiftMonitoring.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/postShiftMonitoring.test.ts
import { describe, it, expect } from 'vitest';
import { monitorPostShift } from '../sensiplan/postShiftMonitoring';
import type { CycleDayInput, Nudge, PostShiftMonitoring } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9 / 5) + 32; }

describe('monitorPostShift', () => {
  const shiftDay = 7;
  const coverlineC = 36.3;
  const lastConfirmDay = 9;

  it('returns inactive monitoring when no post-shift data exists', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.isActive).toBe(true);
    expect(result.daysMonitored).toBe(0);
    expect(result.dipsBelow).toEqual([]);
    expect(result.falseRiseWarning).toBeNull();
  });

  it('counts unexplained dips below coverline', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), // dip, no disturbance
      day(11, cToF(36.5)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow).toHaveLength(1);
    expect(result.dipsBelow[0]).toEqual({ day: 10, temp: expect.closeTo(36.2, 1), explained: false, factors: [] });
    expect(result.consecutiveUnexplainedDips).toBe(1);
  });

  it('marks dip as explained when user resolved nudge with yes_disturbed', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), // dip
    ];
    const resolvedNudges: Nudge[] = [
      { day: 10, type: 'post_shift_dip', message: '', resolved: true, response: 'yes_disturbed' },
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, resolvedNudges);
    expect(result.dipsBelow[0].explained).toBe(true);
    expect(result.consecutiveUnexplainedDips).toBe(0);
  });

  it('marks dip as explained when day has disturbance factors', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2), { disturbanceFactors: ['ILLNESS_FEVER'] }),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow[0].explained).toBe(true);
    expect(result.consecutiveUnexplainedDips).toBe(0);
  });

  it('triggers false rise warning at 3+ consecutive unexplained dips', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), day(11, cToF(36.1)), day(12, cToF(36.25)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(3);
    expect(result.falseRiseWarning).toBe('active');
  });

  it('does not trigger at 2 consecutive unexplained dips', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), day(11, cToF(36.1)),
      day(12, cToF(36.5)), // above coverline — breaks chain
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(0); // reset by above-coverline day
    expect(result.falseRiseWarning).toBeNull();
  });

  it('resets consecutive count when explained dip breaks the chain', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)),  // unexplained
      day(11, cToF(36.2), { disturbanceFactors: ['POOR_SLEEP'] }), // explained — breaks chain
      day(12, cToF(36.25)), // unexplained
      day(13, cToF(36.1)),  // unexplained — only 2 consecutive
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(2);
    expect(result.falseRiseWarning).toBeNull();
  });

  it('preserves dismissed warning state', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), day(11, cToF(36.1)), day(12, cToF(36.25)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, [], 'dismissed');
    // Warning was previously dismissed — should stay dismissed even though dips still exist
    expect(result.falseRiseWarning).toBe('dismissed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/postShiftMonitoring.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement monitorPostShift**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/postShiftMonitoring.ts
import type { CycleDayInput, PostShiftMonitoring, DipBelow, Nudge } from '../types';
import { fahrenheitToCelsius } from '../../utils';

const FALSE_RISE_THRESHOLD = 3;

/**
 * Post-shift monitoring — false rise detection.
 *
 * [CyclePath Enhancement]
 * Runs against the ACTIVE interpretation values (coverline from engine
 * if CONFIRMED, from userOverrides if ADJUSTED).
 *
 * @param days           All cycle days
 * @param shiftDay       The active shift day (engine or user-adjusted)
 * @param coverlineC     The active coverline in °C
 * @param lastConfirmDay The last confirming temp day number
 * @param resolvedNudges Previously resolved nudges (to check explained dips)
 * @param previousWarning Previous falseRiseWarning state (to preserve 'dismissed')
 */
export function monitorPostShift(
  days: CycleDayInput[],
  shiftDay: number,
  coverlineC: number,
  lastConfirmDay: number,
  resolvedNudges: Nudge[],
  previousWarning?: 'active' | 'dismissed' | null,
): PostShiftMonitoring {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  const postShiftDays = sorted.filter(
    (d) => d.dayNumber > lastConfirmDay && d.bbt !== null
  );

  const resolvedMap = new Map(
    resolvedNudges
      .filter((n) => n.type === 'post_shift_dip' && n.resolved)
      .map((n) => [n.day, n.response])
  );

  const dipsBelow: DipBelow[] = [];
  let consecutiveUnexplained = 0;
  let maxConsecutiveUnexplained = 0;

  for (const d of postShiftDays) {
    const tempC = fahrenheitToCelsius(d.bbt!);

    if (tempC >= coverlineC) {
      // Above coverline — reset consecutive count
      consecutiveUnexplained = 0;
      continue;
    }

    // Below coverline — check if explained
    const hasDisturbance = d.disturbanceFactors.length > 0;
    const nudgeResponse = resolvedMap.get(d.dayNumber);
    const explained = hasDisturbance || nudgeResponse === 'yes_disturbed';

    dipsBelow.push({
      day: d.dayNumber,
      temp: tempC,
      explained,
      factors: d.disturbanceFactors,
    });

    if (explained) {
      // Explained dip breaks the consecutive chain
      consecutiveUnexplained = 0;
    } else {
      consecutiveUnexplained++;
      maxConsecutiveUnexplained = Math.max(maxConsecutiveUnexplained, consecutiveUnexplained);
    }
  }

  // Determine false rise warning state
  let falseRiseWarning: 'active' | 'dismissed' | null = null;

  if (previousWarning === 'dismissed') {
    // User previously dismissed — keep dismissed unless new consecutive dips
    // exceed the threshold again (beyond what was already dismissed)
    falseRiseWarning = 'dismissed';
  } else if (maxConsecutiveUnexplained >= FALSE_RISE_THRESHOLD) {
    falseRiseWarning = 'active';
  }

  return {
    isActive: true,
    falseRiseWarning,
    daysMonitored: postShiftDays.length,
    dipsBelow,
    consecutiveUnexplainedDips: consecutiveUnexplained,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/postShiftMonitoring.test.ts`

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/postShiftMonitoring.ts \
        app/src/cycle-tracking/interpretation/__tests__/postShiftMonitoring.test.ts
git commit -m "feat(interpretation): add post-shift monitoring with false rise detection"
```

---

## Task 9: Orchestrator — runInterpretation

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/index.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/integration.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest';
import { runInterpretation } from '../sensiplan/index';
import type { CycleDayInput } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: '06:30',
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9 / 5) + 32; }

describe('runInterpretation (orchestrator)', () => {
  it('returns full result for a textbook shift cycle', () => {
    const days: CycleDayInput[] = [];
    // 6 low temps + 3 confirming
    for (let i = 1; i <= 6; i++) days.push(day(i, cToF(36.2 + (i % 2) * 0.1)));
    days.push(day(7, cToF(36.5)));  // 1st higher
    days.push(day(8, cToF(36.55))); // 2nd higher
    days.push(day(9, cToF(36.6)));  // 3rd higher ≥ +0.2

    const result = runInterpretation(days);

    expect(result.thermalShift.status).toBe('confirmed');
    expect(result.nudges).toBeDefined();
    expect(result.timeWindow).toBeDefined();
  });

  it('returns none result for an anovulatory cycle', () => {
    const days: CycleDayInput[] = [];
    for (let i = 1; i <= 20; i++) {
      days.push(day(i, cToF(36.2 + (i % 3) * 0.05)));
    }
    const result = runInterpretation(days);
    expect(result.thermalShift.status).toBe('none');
  });

  it('returns pending when shift is mid-confirmation', () => {
    const days: CycleDayInput[] = [];
    for (let i = 1; i <= 6; i++) days.push(day(i, cToF(36.2 + (i % 2) * 0.1)));
    days.push(day(7, cToF(36.5))); // only 1 higher temp

    const result = runInterpretation(days);
    expect(result.thermalShift.status).toBe('pending');
  });

  it('generates post-shift dip nudge when applicable', () => {
    const days: CycleDayInput[] = [];
    for (let i = 1; i <= 6; i++) days.push(day(i, cToF(36.2 + (i % 2) * 0.1)));
    days.push(day(7, cToF(36.5)));
    days.push(day(8, cToF(36.55)));
    days.push(day(9, cToF(36.6)));
    days.push(day(10, cToF(36.1))); // dip below coverline

    const result = runInterpretation(days);
    expect(result.thermalShift.status).toBe('confirmed');
    const dipNudges = result.nudges.filter((n) => n.type === 'post_shift_dip');
    expect(dipNudges.length).toBeGreaterThanOrEqual(1);
    expect(dipNudges[0].day).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/integration.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement runInterpretation**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/index.ts
import type { CycleDayInput, InterpretationResult } from '../types';
import { detectThermalShift } from './thermalShift';
import { calculateTimeWindow } from './measurementTime';
import { generateNudges } from './nudges';

/**
 * Run the full Sensiplan interpretation engine over cycle day data.
 *
 * This is a pure function — no side effects, no persistence.
 * The caller (useInterpretation hook) handles persistence and state.
 */
export function runInterpretation(days: CycleDayInput[]): InterpretationResult {
  // Step 1: Calculate measurement time window
  const timeWindow = calculateTimeWindow(days);

  // Step 2: Detect thermal shift
  const thermalShift = detectThermalShift(days);

  // Step 3: Generate nudges
  const nudges = generateNudges(days, thermalShift, timeWindow);

  return { thermalShift, nudges, timeWindow };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/__tests__/integration.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 5: Run ALL interpretation tests**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/interpretation/`

Expected: All tests PASS (excludedDays, fourthDayException, thermalShift, confidence, measurementTime, nudges, postShiftMonitoring, integration).

- [ ] **Step 6: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/sensiplan/index.ts \
        app/src/cycle-tracking/interpretation/__tests__/integration.test.ts
git commit -m "feat(interpretation): add orchestrator that wires all engine modules together"
```

---

## Task 10: Prisma Schema + Wasp Declarations

**Files:**
- Modify: `app/schema.prisma`
- Modify: `app/main.wasp`

- [ ] **Step 1: Add CycleInterpretation model and enums to schema.prisma**

At the end of `app/schema.prisma` (after the `CycleDay` model), add:

```prisma
enum InterpretationType {
  THERMAL_SHIFT
}

enum InterpretationState {
  SUGGESTED
  CONFIRMED
  ADJUSTED
  DISMISSED
}

model CycleInterpretation {
  id                    String              @id @default(uuid())
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  cycle                 Cycle               @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  cycleId               String

  type                  InterpretationType
  state                 InterpretationState @default(SUGGESTED)

  engineResult          Json
  userOverrides         Json?

  dismissedShiftDay     Int?
  needsReview           Boolean             @default(false)
  reviewReason          String?
  previousEngineResult  Json?

  postShiftMonitoring   Json?
  pendingNudges         Json?

  @@unique([cycleId, type])
}
```

Also add the `interpretations` relation to the existing `Cycle` model:

```prisma
model Cycle {
  // ... existing fields ...
  days        CycleDay[]
  interpretations CycleInterpretation[]
  
  @@index([userId, isActive])
}
```

- [ ] **Step 2: Add query and action declarations to main.wasp**

In `app/main.wasp`, inside the `//#region Cycle Tracking` section, add before the closing `//#endregion`:

```wasp
query getCycleInterpretation {
  fn: import { getCycleInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action upsertCycleInterpretation {
  fn: import { upsertCycleInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action deleteCycleInterpretation {
  fn: import { deleteCycleInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action confirmInterpretation {
  fn: import { confirmInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action adjustInterpretation {
  fn: import { adjustInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action dismissInterpretation {
  fn: import { dismissInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action resolveReview {
  fn: import { resolveReview } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action resolveFalseRiseWarning {
  fn: import { resolveFalseRiseWarning } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}

action resolveNudge {
  fn: import { resolveNudge } from "@src/cycle-tracking/interpretation/interpretationOperations",
  entities: [CycleInterpretation, Cycle]
}
```

- [ ] **Step 3: Run database migration**

Run: `cd /Users/olgapak/work/cycle-path/app && wasp db migrate-dev --name add_cycle_interpretation`

Expected: Migration succeeds. New `CycleInterpretation` table created.

- [ ] **Step 4: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/schema.prisma app/main.wasp
git commit -m "feat(interpretation): add CycleInterpretation schema and Wasp operation declarations"
```

---

## Task 11: Backend Operations (Query + Actions)

**Files:**
- Create: `app/src/cycle-tracking/interpretation/interpretationOperations.ts`

- [ ] **Step 1: Create the operations file with all query and action implementations**

All operations enforce ownership. For `cycleId`-based lookups, verify the cycle belongs to the user. For `interpretationId`-based mutations, join through the cycle relation and verify `cycle.userId`. The `upsertCycleInterpretation` action implements the full state-aware persistence rules from the spec.

```typescript
// app/src/cycle-tracking/interpretation/interpretationOperations.ts
import { HttpError } from 'wasp/server';
import type {
  GetCycleInterpretation,
  UpsertCycleInterpretation,
  DeleteCycleInterpretation,
  ConfirmInterpretation,
  AdjustInterpretation,
  DismissInterpretation,
  ResolveReview,
  ResolveFalseRiseWarning,
  ResolveNudge,
} from 'wasp/server/operations';
import type { CycleInterpretation } from 'wasp/entities';

// ===== OWNERSHIP HELPER =====

/**
 * Fetch an interpretation by ID and verify the owning cycle belongs to the
 * requesting user. Throws 404 if not found, 403 if ownership check fails.
 */
async function getOwnedInterpretation(
  interpretationId: string,
  userId: string,
  entities: any
): Promise<CycleInterpretation> {
  const interp = await entities.CycleInterpretation.findUnique({
    where: { id: interpretationId },
    include: { cycle: { select: { userId: true } } },
  });
  if (!interp) throw new HttpError(404, 'Interpretation not found');
  if ((interp as any).cycle.userId !== userId) {
    throw new HttpError(403, 'Not authorized to access this interpretation');
  }
  return interp;
}

// ===== QUERY =====

type GetInterpretationInput = {
  cycleId: string;
  type: 'THERMAL_SHIFT';
};

export const getCycleInterpretation: GetCycleInterpretation<
  GetInterpretationInput,
  CycleInterpretation | null
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  // Verify cycle belongs to user before returning interpretation
  const cycle = await context.entities.Cycle.findUnique({
    where: { id: args.cycleId },
  });
  if (!cycle || cycle.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to access this cycle');
  }

  return context.entities.CycleInterpretation.findUnique({
    where: {
      cycleId_type: { cycleId: args.cycleId, type: args.type },
    },
  });
};

// ===== ENGINE PERSISTENCE =====

type UpsertInput = {
  cycleId: string;
  type: 'THERMAL_SHIFT';
  engineResult: any;
  postShiftMonitoring?: any;
  pendingNudges?: any;
};

/**
 * State-aware engine persistence. Implements the spec's full persistence rules:
 *
 * - `none` + no row         → no-op (return null)
 * - `none` + SUGGESTED      → delete row (return null)
 * - `none` + CONFIRMED/ADJ  → set needsReview, store previousEngineResult
 * - `none` + DISMISSED      → no-op (preserve dismiss memory)
 * - non-none + no row       → create SUGGESTED
 * - non-none + SUGGESTED    → update engineResult
 * - non-none + CONF/ADJ     → if result changed: set needsReview, store previousEngineResult
 * - non-none + DISMISSED    → if different shift day: replace with new SUGGESTED; else no-op
 */
export const upsertCycleInterpretation: UpsertCycleInterpretation<
  UpsertInput,
  CycleInterpretation | null
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  // Verify cycle belongs to user
  const cycle = await context.entities.Cycle.findUnique({
    where: { id: args.cycleId },
  });
  if (!cycle || cycle.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to access this cycle');
  }

  const existing = await context.entities.CycleInterpretation.findUnique({
    where: {
      cycleId_type: { cycleId: args.cycleId, type: args.type },
    },
  });

  const isNone = args.engineResult?.status === 'none';

  // ---- Engine returns none ----
  if (isNone) {
    if (!existing) return null; // No row, nothing to do

    switch (existing.state) {
      case 'SUGGESTED':
        // No user investment — delete the row
        await context.entities.CycleInterpretation.delete({
          where: { id: existing.id },
        });
        return null;

      case 'CONFIRMED':
      case 'ADJUSTED':
        // User had confirmed/adjusted — enter review
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            needsReview: true,
            reviewReason:
              'The data no longer supports a thermal shift. The engine cannot detect a valid pattern with the current readings.',
            previousEngineResult: existing.engineResult,
            engineResult: args.engineResult,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });

      case 'DISMISSED':
        // Preserve dismiss memory — no change
        return existing;

      default:
        return existing;
    }
  }

  // ---- Engine returns non-none (confirmed or pending) ----
  if (!existing) {
    // No row → create SUGGESTED
    return context.entities.CycleInterpretation.create({
      data: {
        cycleId: args.cycleId,
        type: args.type,
        state: 'SUGGESTED',
        engineResult: args.engineResult,
        postShiftMonitoring: args.postShiftMonitoring ?? null,
        pendingNudges: args.pendingNudges ?? null,
      },
    });
  }

  // Helper: did the engine result change in any way the user should review?
  // Uses deep JSON comparison rather than checking individual fields —
  // changes to referenceDays, confirmingDays, usedFourthDayException,
  // confidence, or failedAttempts all warrant review when the user has
  // already confirmed or adjusted.
  const resultChanged =
    JSON.stringify(existing.engineResult) !== JSON.stringify(args.engineResult);

  switch (existing.state) {
    case 'SUGGESTED':
      // Just update — no user investment to protect
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });

    case 'CONFIRMED':
    case 'ADJUSTED':
      if (!resultChanged) {
        // Same result — just refresh monitoring/nudges, no review
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            postShiftMonitoring: args.postShiftMonitoring ?? undefined,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });
      }
      // Result changed — enter review
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          needsReview: true,
          reviewReason: 'A data edit changed the engine\'s evaluation. Review the new result.',
          previousEngineResult: existing.engineResult,
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });

    case 'DISMISSED': {
      // If materially different shift day → replace with new SUGGESTED
      const oldEngineResult = existing.engineResult as any;
      const dismissedDay = existing.dismissedShiftDay ?? (oldEngineResult?.shiftDay ?? null);
      if (dismissedDay !== null && args.engineResult?.shiftDay !== dismissedDay) {
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            state: 'SUGGESTED',
            engineResult: args.engineResult,
            userOverrides: null,
            dismissedShiftDay: null,
            needsReview: false,
            reviewReason: null,
            previousEngineResult: null,
            postShiftMonitoring: args.postShiftMonitoring ?? null,
            pendingNudges: args.pendingNudges ?? null,
          },
        });
      }
      // Same shift day the user rejected — stay quiet
      return existing;
    }

    default:
      return existing;
  }
};

type DeleteInput = { interpretationId: string };

export const deleteCycleInterpretation: DeleteCycleInterpretation<
  DeleteInput,
  void
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  await context.entities.CycleInterpretation.delete({
    where: { id: args.interpretationId },
  });
};

// ===== USER ACTIONS =====

type IdInput = { interpretationId: string };

export const confirmInterpretation: ConfirmInterpretation<
  IdInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: { state: 'CONFIRMED' },
  });
};

type AdjustInput = {
  interpretationId: string;
  userOverrides: { shiftDay?: number; coverlineTemp?: number };
};

export const adjustInterpretation: AdjustInterpretation<
  AdjustInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'ADJUSTED',
      userOverrides: args.userOverrides,
    },
  });
};

export const dismissInterpretation: DismissInterpretation<
  IdInput & { dismissedShiftDay: number },
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'DISMISSED',
      dismissedShiftDay: args.dismissedShiftDay,
      userOverrides: null,
    },
  });
};

type ResolveReviewInput = {
  interpretationId: string;
  action: 'keep_mine' | 'accept_new' | 'reject';
  latestEngineResult: any;
  keptValues?: { shiftDay: number; coverlineTemp: number };
  dismissedShiftDay?: number;
};

export const resolveReview: ResolveReview<
  ResolveReviewInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities
  );

  switch (args.action) {
    case 'keep_mine': {
      // Promote to ADJUSTED — save kept values into userOverrides
      const userOverrides = args.keptValues ??
        (interp.userOverrides as any) ?? // already ADJUSTED
        null;

      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'ADJUSTED',
          engineResult: args.latestEngineResult,
          userOverrides,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: null,
        },
      });
    }

    case 'accept_new':
      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'CONFIRMED',
          engineResult: args.latestEngineResult,
          userOverrides: null,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: null,
        },
      });

    case 'reject':
      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'DISMISSED',
          engineResult: args.latestEngineResult,
          dismissedShiftDay: args.dismissedShiftDay,
          userOverrides: null,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: null,
        },
      });

    default:
      throw new HttpError(400, `Unknown action: ${args.action}`);
  }
};

type FalseRiseInput = {
  interpretationId: string;
  action: 'reject_shift' | 'keep_shift';
  dismissedShiftDay?: number;
};

export const resolveFalseRiseWarning: ResolveFalseRiseWarning<
  FalseRiseInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities
  );

  if (args.action === 'reject_shift') {
    return context.entities.CycleInterpretation.update({
      where: { id: args.interpretationId },
      data: {
        state: 'DISMISSED',
        dismissedShiftDay: args.dismissedShiftDay,
        userOverrides: null,
        postShiftMonitoring: null,
      },
    });
  }

  // keep_shift — set falseRiseWarning to 'dismissed' in postShiftMonitoring
  const monitoring = (interp.postShiftMonitoring as any) ?? {};
  monitoring.falseRiseWarning = 'dismissed';

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: { postShiftMonitoring: monitoring },
  });
};

type NudgeInput = {
  interpretationId: string;
  day: number;
  response: 'yes_disturbed' | 'no_correct';
};

export const resolveNudge: ResolveNudge<
  NudgeInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities
  );

  const nudges = ((interp.pendingNudges as any[]) ?? []).map((n: any) => {
    if (n.day === args.day) {
      return { ...n, resolved: true, response: args.response };
    }
    return n;
  });

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: { pendingNudges: nudges },
  });
};
```

- [ ] **Step 2: Verify Wasp generates the operation types**

Run: `cd /Users/olgapak/work/cycle-path/app && wasp start` (let it compile — cancel after successful build)

Expected: No TypeScript errors for the new operations. Wasp generates the types under `.wasp/out/`.

Note: The exact Wasp-generated type names depend on the query/action names declared in `main.wasp`. If the generated names differ (e.g., `GetCycleInterpretation` vs lowercase), update the import statement to match what Wasp generates. Check `.wasp/out/sdk/wasp/server/operations/index.ts` for the actual exports.

- [ ] **Step 3: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/interpretationOperations.ts
git commit -m "feat(interpretation): add backend query and action implementations"
```

---

## Task 12: useInterpretation Hook — Engine Run + Re-evaluation + Persistence

**Files:**
- Create: `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts`

- [ ] **Step 1: Create the hook**

```typescript
// app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts
import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleInterpretation } from 'wasp/client/operations';
import { runInterpretation } from '../sensiplan/index';
import { monitorPostShift } from '../sensiplan/postShiftMonitoring';
import type {
  CycleDayInput,
  ThermalShiftResult,
  InterpretationResult,
  PostShiftMonitoring,
  UserOverrides,
  Nudge,
} from '../types';

type UseInterpretationReturn = {
  /** The engine's latest evaluation */
  engineResult: InterpretationResult | null;
  /** The persisted interpretation from the DB (may be null if no proposition) */
  interpretation: any | null;  // CycleInterpretation entity
  /** Post-shift monitoring (computed against active values) */
  postShiftMonitoring: PostShiftMonitoring | null;
  /** Whether the interpretation is loading */
  isLoading: boolean;
  /** True when the user clicked Keep Watching on a pending card (local state only) */
  keepWatchingDismissed: boolean;
  /** Collapse the pending card locally (resets when engine result changes) */
  onKeepWatching: () => void;
  /** User action handlers */
  actions: {
    confirm: () => Promise<void>;
    adjust: (overrides: UserOverrides) => Promise<void>;
    dismiss: () => Promise<void>;
    resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
    resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
    resolveNudge: (day: number, response: 'yes_disturbed' | 'no_correct') => Promise<void>;
  };
};

/**
 * Orchestrates the interpretation engine lifecycle:
 * 1. Runs the engine when cycle data changes
 * 2. Compares with persisted state
 * 3. Handles persistence (create/update/delete)
 * 4. Manages re-evaluation and needsReview
 * 5. Exposes user action handlers
 */
export function useInterpretation(
  cycleId: string | undefined,
  days: CycleDayInput[],
): UseInterpretationReturn {
  const { data: interpretation, isLoading } = useQuery(
    getCycleInterpretation,
    { cycleId: cycleId ?? '', type: 'THERMAL_SHIFT' as const },
    { enabled: !!cycleId }
  );

  // Run engine whenever days change
  const engineResult = useMemo(() => {
    if (days.length === 0) return null;
    return runInterpretation(days);
  }, [days]);

  // Keep Watching: local-only state. Collapses the pending card without
  // persisting anything. Resets when the engine result changes (new data
  // arrived), so the card re-appears with updated information.
  const [keepWatchingDismissed, setKeepWatchingDismissed] = useState(false);
  const prevResultRef = useRef<string | null>(null);

  useEffect(() => {
    const currentKey = engineResult
      ? JSON.stringify({
          s: engineResult.thermalShift.status,
          d: engineResult.thermalShift.status !== 'none'
            ? (engineResult.thermalShift as any).shiftDay
            : null,
        })
      : null;
    if (currentKey !== prevResultRef.current) {
      prevResultRef.current = currentKey;
      setKeepWatchingDismissed(false);
    }
  }, [engineResult]);

  const onKeepWatching = useCallback(() => {
    setKeepWatchingDismissed(true);
  }, []);

  // Compute post-shift monitoring against ACTIVE values.
  // Active values come from userOverrides (ADJUSTED) or engineResult (CONFIRMED).
  // Monitoring must also run when the engine returns none but the user kept their
  // shift (ADJUSTED + none) — the active values live entirely in userOverrides.
  const postShiftMonitoring = useMemo((): PostShiftMonitoring | null => {
    if (!interpretation || (interpretation.state !== 'CONFIRMED' && interpretation.state !== 'ADJUSTED')) return null;

    const overrides = interpretation.userOverrides as UserOverrides | null;
    const shift = engineResult?.thermalShift;

    // Determine active values: overrides take precedence, fall back to engine
    const activeShiftDay = overrides?.shiftDay
      ?? (shift && shift.status !== 'none' ? shift.shiftDay : null);
    const activeCoverline = overrides?.coverlineTemp
      ?? (shift && shift.status !== 'none' ? shift.coverlineTemp : null);

    // If we can't determine active values, we can't monitor
    if (activeShiftDay == null || activeCoverline == null) return null;

    // lastConfirmDay: use engine's confirming days if available, otherwise
    // fall back to activeShiftDay + 2 (the minimum 3-over-6 window)
    const lastConfirmDay = (shift && shift.status === 'confirmed')
      ? Math.max(...shift.confirmingDays)
      : activeShiftDay + 2;

    const resolvedNudges = ((interpretation.pendingNudges as Nudge[]) ?? []).filter(
      (n) => n.resolved
    );

    const previousWarning = (interpretation.postShiftMonitoring as PostShiftMonitoring | null)?.falseRiseWarning ?? null;

    return monitorPostShift(
      days, activeShiftDay, activeCoverline, lastConfirmDay, resolvedNudges, previousWarning
    );
  }, [engineResult, interpretation, days]);

  // Persist engine results when they change.
  // The server-side upsertCycleInterpretation handles ALL state-aware
  // persistence logic (needsReview, delete for none+SUGGESTED, no-op for
  // DISMISSED, etc.) — so the hook is a thin caller.
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cycleId || !engineResult) return;

    // Dedupe key covers the full persisted payload — thermalShift, monitoring,
    // and nudges — so changes to any of them trigger a write.
    const payload = {
      ts: engineResult.thermalShift,
      psm: postShiftMonitoring,
      n: engineResult.nudges,
    };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastPersistedRef.current) return;
    lastPersistedRef.current = payloadJson;

    (async () => {
      try {
        const { upsertCycleInterpretation } = await import('wasp/client/operations');
        await upsertCycleInterpretation({
          cycleId,
          type: 'THERMAL_SHIFT',
          engineResult: engineResult.thermalShift,
          postShiftMonitoring: postShiftMonitoring ?? undefined,
          pendingNudges: engineResult.nudges,
        });
      } catch (err) {
        console.error('Failed to persist interpretation:', err);
      }
    })();
  }, [cycleId, engineResult, postShiftMonitoring]);

  // Action handlers
  const confirm = useCallback(async () => {
    if (!interpretation) return;
    const { confirmInterpretation } = await import('wasp/client/operations');
    await confirmInterpretation({ interpretationId: interpretation.id });
  }, [interpretation]);

  const adjust = useCallback(async (overrides: UserOverrides) => {
    if (!interpretation) return;
    const { adjustInterpretation } = await import('wasp/client/operations');
    await adjustInterpretation({ interpretationId: interpretation.id, userOverrides: overrides });
  }, [interpretation]);

  const dismiss = useCallback(async () => {
    if (!interpretation || !engineResult) return;
    const shift = engineResult.thermalShift;
    const overrides = interpretation.userOverrides as UserOverrides | null;
    const shiftDay = overrides?.shiftDay ??
      (shift.status !== 'none' ? shift.shiftDay : 0);

    const { dismissInterpretation } = await import('wasp/client/operations');
    await dismissInterpretation({
      interpretationId: interpretation.id,
      dismissedShiftDay: shiftDay,
    });
  }, [interpretation, engineResult]);

  const resolveReviewAction = useCallback(async (action: 'keep_mine' | 'accept_new' | 'reject') => {
    if (!interpretation || !engineResult) return;
    const { resolveReview } = await import('wasp/client/operations');

    const prev = interpretation.previousEngineResult as any;
    const keptValues = action === 'keep_mine'
      ? (interpretation.userOverrides as UserOverrides) ??
        (prev ? { shiftDay: prev.shiftDay, coverlineTemp: prev.coverlineTemp } : undefined)
      : undefined;

    const dismissedShiftDay = action === 'reject'
      ? keptValues?.shiftDay ??
        ((interpretation.previousEngineResult as any)?.shiftDay) ?? 0
      : undefined;

    await resolveReview({
      interpretationId: interpretation.id,
      action,
      latestEngineResult: engineResult.thermalShift,
      keptValues,
      dismissedShiftDay,
    });
  }, [interpretation, engineResult]);

  const resolveFalseRise = useCallback(async (action: 'reject_shift' | 'keep_shift') => {
    if (!interpretation || !engineResult) return;
    const { resolveFalseRiseWarning } = await import('wasp/client/operations');
    const shift = engineResult.thermalShift;
    const overrides = interpretation.userOverrides as UserOverrides | null;
    const shiftDay = overrides?.shiftDay ?? (shift.status !== 'none' ? shift.shiftDay : 0);

    await resolveFalseRiseWarning({
      interpretationId: interpretation.id,
      action,
      dismissedShiftDay: action === 'reject_shift' ? shiftDay : undefined,
    });
  }, [interpretation, engineResult]);

  const resolveNudgeAction = useCallback(async (day: number, response: 'yes_disturbed' | 'no_correct') => {
    if (!interpretation) return;
    const { resolveNudge } = await import('wasp/client/operations');
    await resolveNudge({
      interpretationId: interpretation.id,
      day,
      response,
    });
  }, [interpretation]);

  return {
    engineResult,
    interpretation,
    postShiftMonitoring,
    isLoading,
    keepWatchingDismissed,
    onKeepWatching,
    actions: {
      confirm,
      adjust,
      dismiss,
      resolveReview: resolveReviewAction,
      resolveFalseRise,
      resolveNudge: resolveNudgeAction,
    },
  };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/olgapak/work/cycle-path/app && wasp start` (let it compile, cancel after successful build). Wasp's build pipeline resolves all generated types — standalone `tsc` calls won't resolve `wasp/client/operations` imports.

Expected: No TypeScript errors in the Wasp build output. If you already verified the build in Task 11, this step can be skipped.

- [ ] **Step 3: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts
git commit -m "feat(interpretation): add useInterpretation hook for engine lifecycle"
```

---

## Task 13: Proposition Card Components

**Files:**
- Create: `app/src/cycle-tracking/interpretation/components/cardStyles.ts`
- Create: `app/src/cycle-tracking/interpretation/components/ConfidenceBadge.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/PendingCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/ConfirmedCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/UserConfirmedCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/NeedsReviewCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/FalseRiseWarningCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/FailedAttemptsSection.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/ChangeNotice.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx`

This is a large UI task. Implement incrementally — one card at a time. Each card follows the same structure: styled container, detail grid, action buttons. Build the simplest card first, then iterate.

**This task should be broken into sub-steps by the implementing agent.** The key contract for each component:

- **cardStyles.ts**: Shared Tailwind class constants (button styles, card container, badges)
- **ConfidenceBadge.tsx**: `{ confidence: 'high' | 'low' }` → badge with color + disclaimer tooltip
- **PendingCard.tsx**: `{ result: ThermalShiftPending, onKeepWatching, onAdjust, onReject }` → pending card
- **ConfirmedCard.tsx**: `{ result: ThermalShiftConfirmed, onConfirm, onAdjust, onReject }` → engine-confirmed card
- **UserConfirmedCard.tsx**: `{ result, onAdjust, onReject }` → user-confirmed state card (green border)
- **UserAdjustedCard.tsx**: `{ result: ThermalShiftConfirmed | ThermalShiftPending, userOverrides, onAdjust, onReject }` → user-adjusted card when engine still has a shift (amber border)
- **KeptShiftCard.tsx**: `{ userOverrides: UserOverrides, onAdjust, onReject }` → user kept a shift the engine no longer detects (amber border with info banner: "The engine no longer detects a thermal shift with the current data. Your interpretation is preserved.")
- **NeedsReviewCard.tsx**: `{ previous, current, reason, isNoneResult, onKeepMine, onAcceptNew?, onAdjust?, onReject? }` → review card. Actions are conditional on `isNoneResult`: when `false` (different shift), show Keep Mine · Accept New · Adjust — `onReject` is `undefined`. When `true` (engine returns `none`), show Keep Mine · Reject — `onAcceptNew` and `onAdjust` are `undefined`. The component renders only the buttons whose callbacks are provided.
- **FalseRiseWarningCard.tsx**: `{ monitoring, shiftDay, onRejectShift, onKeepShift }` → false rise warning
- **FailedAttemptsSection.tsx**: `{ attempts: FailedAttempt[] }` → collapsible section
- **ChangeNotice.tsx**: `{ message: string }` → blue info banner
- **PropositionCard.tsx**: Routes to the correct card variant based on interpretation state

Refer to the design mockup at `.superpowers/brainstorm/61478-1776171908/content/full-design-mockup-v2.html` for exact visual treatment, colors, and layout. Use the color coding from the spec (Section 10, Button color coding table).

- [ ] **Step 1: Create cardStyles.ts with shared constants**

```typescript
// app/src/cycle-tracking/interpretation/components/cardStyles.ts

export const btn = {
  base: 'px-4 py-2 rounded-md text-sm font-medium transition-colors',
  confirm: 'bg-emerald-600 text-white hover:bg-emerald-700',
  adjust: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100',
  reject: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
  keepWatching: 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-50',
  keepMine: 'bg-emerald-600 text-white hover:bg-emerald-700',
  acceptNew: 'bg-violet-500 text-white hover:bg-violet-600',
  saveAdjust: 'bg-amber-600 text-white hover:bg-amber-700',
  rejectShift: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
  keepShift: 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-50',
  secondary: 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-50',
} as const;

export const card = {
  base: 'rounded-lg border overflow-hidden',
  suggested: 'border-violet-200',
  confirmed: 'border-green-200',
  adjusted: 'border-amber-200',
  needsReview: 'border-red-300 border-2',
  falseRise: 'border-red-200',
} as const;

export const header = {
  base: 'px-4 py-3 border-b flex items-center justify-between',
  suggested: 'bg-violet-50 border-violet-200',
  confirmed: 'bg-green-50 border-green-200',
  adjusted: 'bg-amber-50 border-amber-200',
  needsReview: 'bg-red-50 border-red-200',
} as const;

export const footer = {
  base: 'px-4 py-3 border-t flex items-center gap-2',
} as const;

export const badge = {
  high: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700',
  low: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700',
} as const;
```

- [ ] **Step 2: Create each card component following the mockup**

Create each file listed above. The implementing agent should reference the mockup HTML and the spec's Section 10 for exact visual treatment. Each component is a self-contained React functional component receiving props and calling action callbacks.

- [ ] **Step 3: Create PropositionCard.tsx that routes to the correct variant**

```typescript
// app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
import type { InterpretationResult, PostShiftMonitoring, UserOverrides } from '../types';
import { PendingCard } from './PendingCard';
import { ConfirmedCard } from './ConfirmedCard';
import { UserConfirmedCard } from './UserConfirmedCard';
import { UserAdjustedCard } from './UserAdjustedCard';
import { KeptShiftCard } from './KeptShiftCard';
import { NeedsReviewCard } from './NeedsReviewCard';
import { FalseRiseWarningCard } from './FalseRiseWarningCard';
import { FailedAttemptsSection } from './FailedAttemptsSection';
import { ChangeNotice } from './ChangeNotice';

type PropositionCardProps = {
  engineResult: InterpretationResult;
  interpretation: any; // CycleInterpretation entity or null
  postShiftMonitoring: PostShiftMonitoring | null;
  changeNotice: string | null;
  /** True when the user clicked Keep Watching on a pending card. */
  keepWatchingDismissed: boolean;
  onKeepWatching: () => void;
  actions: {
    confirm: () => Promise<void>;
    adjust: (overrides: UserOverrides) => Promise<void>;
    dismiss: () => Promise<void>;
    resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
    resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
  };
};

export function PropositionCard({
  engineResult, interpretation, postShiftMonitoring,
  changeNotice, keepWatchingDismissed, onKeepWatching, actions,
}: PropositionCardProps) {
  const { thermalShift } = engineResult;
  const state = interpretation?.state;
  const needsReview = interpretation?.needsReview;
  const userOverrides = interpretation?.userOverrides as UserOverrides | null;

  // No proposition
  if (thermalShift.status === 'none' && !interpretation) return null;
  if (state === 'DISMISSED') return null;

  return (
    <div className="space-y-3 mt-4">
      {/* Change notice */}
      {changeNotice && <ChangeNotice message={changeNotice} />}

      {/* Needs Review takes priority */}
      {needsReview && (
        <NeedsReviewCard
          previous={interpretation.previousEngineResult}
          current={thermalShift}
          reason={interpretation.reviewReason ?? ''}
          isNoneResult={thermalShift.status === 'none'}
          onKeepMine={() => actions.resolveReview('keep_mine')}
          // Different-shift review: Keep Mine · Accept New · Adjust (no Reject)
          onAcceptNew={thermalShift.status !== 'none' ? () => actions.resolveReview('accept_new') : undefined}
          onAdjust={thermalShift.status !== 'none' ? () => {/* open adjust flow */} : undefined}
          // None review: Keep Mine · Reject (no Accept New, no Adjust)
          onReject={thermalShift.status === 'none' ? () => actions.resolveReview('reject') : undefined}
        />
      )}

      {/* Main proposition card */}
      {!needsReview && thermalShift.status === 'pending' && state === 'SUGGESTED' && !keepWatchingDismissed && (
        <PendingCard
          result={thermalShift}
          onKeepWatching={onKeepWatching}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && thermalShift.status === 'confirmed' && state === 'SUGGESTED' && (
        <ConfirmedCard
          result={thermalShift}
          onConfirm={actions.confirm}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'CONFIRMED' && (
        <UserConfirmedCard
          result={thermalShift}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {/* ADJUSTED with a real shift — standard adjusted card */}
      {!needsReview && state === 'ADJUSTED' && thermalShift.status !== 'none' && (
        <UserAdjustedCard
          result={thermalShift}
          userOverrides={userOverrides!}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {/* ADJUSTED but engine returns none — user kept a shift the engine no longer detects */}
      {!needsReview && state === 'ADJUSTED' && thermalShift.status === 'none' && userOverrides && (
        <KeptShiftCard
          userOverrides={userOverrides}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {/* Failed attempts (educational) */}
      {thermalShift.status !== 'none' && thermalShift.failedAttempts.length > 0 && (
        <FailedAttemptsSection attempts={thermalShift.failedAttempts} />
      )}

      {/* False rise warning — use active values (userOverrides or engine) for shiftDay */}
      {postShiftMonitoring?.falseRiseWarning === 'active' && (
        <FalseRiseWarningCard
          monitoring={postShiftMonitoring}
          shiftDay={userOverrides?.shiftDay ?? (thermalShift.status !== 'none' ? thermalShift.shiftDay : 0)}
          onRejectShift={() => actions.resolveFalseRise('reject_shift')}
          onKeepShift={() => actions.resolveFalseRise('keep_shift')}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/components/
git commit -m "feat(interpretation): add proposition card components for all states"
```

---

## Task 14: Chart Overlays — Coverline + Day Highlights + Nudge Icons

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/NudgeIcon.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/NudgeMessage.tsx`

This task integrates the interpretation engine into the existing chart. It adds:
1. A coverline horizontal annotation on the ApexChart
2. Day column background shading for reference/confirming days
3. 💬 nudge icons positioned above temperature nodes
4. The PropositionCard below existing data rows

The implementing agent should:

- [ ] **Step 1: Create NudgeIcon and NudgeMessage components**

NudgeIcon renders a 💬 positioned absolutely above a chart node. NudgeMessage renders the expanded nudge with "Yes, disturbed" / "No, correct" buttons.

- [ ] **Step 2: Add the useInterpretation hook to CycleChartPage**

In `CycleChartPage.tsx`, import and call the hook:

```typescript
import { useInterpretation } from './interpretation/hooks/useInterpretation';
import type { CycleDayInput } from './interpretation/types';

// Inside the component, after existing data loading:
const cycleDayInputs: CycleDayInput[] = useMemo(() => {
  if (!cycle) return [];
  return cycle.days.map((d: any) => ({
    dayNumber: d.dayNumber,
    bbt: d.bbt,
    bbtTime: d.bbtTime,
    excludeFromInterpretation: d.excludeFromInterpretation,
    disturbanceFactors: d.disturbanceFactors ?? [],
    travelTimeDiff: d.travelTimeDiff,
  }));
}, [cycle]);

const { engineResult, interpretation, postShiftMonitoring, actions } = useInterpretation(cycleId, cycleDayInputs);
```

- [ ] **Step 3: Add coverline annotation to ApexChart options**

Use ApexCharts `yaxis.annotations` to draw the coverline. Determine style based on interpretation state:

```typescript
const coverlineAnnotation = useMemo(() => {
  if (!interpretation) return [];

  const shift = engineResult?.thermalShift;
  const state = interpretation.state;
  const overrides = interpretation.userOverrides as any;

  // Determine coverline from active values: overrides first, then engine
  const coverlineC = overrides?.coverlineTemp
    ?? (shift && shift.status !== 'none' ? shift.coverlineTemp : null);

  // No coverline available (e.g. DISMISSED, or no active values)
  if (coverlineC == null) return [];

  // Convert to display unit
  const coverlineDisplay = settings?.temperatureUnit === 'CELSIUS'
    ? coverlineC
    : celsiusToFahrenheit(coverlineC);

  const styleMap: Record<string, { color: string; dash: number; opacity: number }> = {
    SUGGESTED: { color: '#8b5cf6', dash: 6, opacity: 0.6 },
    CONFIRMED: { color: '#059669', dash: 0, opacity: 1 },
    ADJUSTED: { color: '#d97706', dash: 0, opacity: 1 },
  };
  const style = styleMap[state] ?? styleMap.SUGGESTED;

  return [{
    y: coverlineDisplay,
    borderColor: style.color,
    strokeDashArray: style.dash,
    opacity: style.opacity,
    label: {
      text: `${coverlineC.toFixed(2)}°C`,
      position: 'right',
      style: { color: style.color, fontSize: '10px' },
    },
  }];
}, [engineResult, interpretation, settings]);
```

Add this to the chart options under `annotations.yaxis`.

- [ ] **Step 4: Add day column highlights for reference and confirming days**

Use ApexCharts `annotations.xaxis` to shade reference days (blue) and confirming days (purple). Map day numbers to x-axis positions.

- [ ] **Step 5: Render PropositionCard below existing data rows**

In the JSX, after the existing chart data rows (cervical fluid, disturbances, intercourse, OPK), add:

```tsx
{engineResult && (
  <PropositionCard
    engineResult={engineResult}
    interpretation={interpretation}
    postShiftMonitoring={postShiftMonitoring}
    changeNotice={null}
    keepWatchingDismissed={keepWatchingDismissed}
    onKeepWatching={onKeepWatching}
    actions={actions}
  />
)}
```

Destructure `keepWatchingDismissed` and `onKeepWatching` from the `useInterpretation` hook return value alongside `engineResult`, `interpretation`, etc.

- [ ] **Step 6: Render nudge icons above chart nodes**

Position 💬 icons above temperature nodes that have active nudges. Use the `plotAreaOffset` and `plotAreaWidth` values already tracked in CycleChartPage to calculate positions.

- [ ] **Step 7: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/CycleChartPage.tsx \
        app/src/cycle-tracking/interpretation/components/NudgeIcon.tsx \
        app/src/cycle-tracking/interpretation/components/NudgeMessage.tsx
git commit -m "feat(interpretation): integrate coverline overlay, day highlights, nudges, and proposition card into chart"
```

---

## Task 15: Adjust Flow Component

**Files:**
- Create: `app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx`

- [ ] **Step 1: Build the inline adjust form**

The AdjustFlow component renders when the user clicks "Adjust" on any card. It shows:
- Shift day picker (dropdown or chart tap)
- Coverline temperature input
- Collapsible reference/confirming temps detail
- Collapsible "How is the coverline calculated?" explanation
- Live preview: engine recalculates as user changes values
- "Save Adjustment" and "Cancel" buttons

```typescript
// app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx
import { useState, useMemo } from 'react';
import type { ThermalShiftResult, UserOverrides, CycleDayInput } from '../types';
import { btn, card, header, footer } from './cardStyles';

type AdjustFlowProps = {
  currentResult: ThermalShiftResult;
  days: CycleDayInput[];
  existingOverrides?: UserOverrides;
  onSave: (overrides: UserOverrides) => Promise<void>;
  onCancel: () => void;
};

export function AdjustFlow({ currentResult, days, existingOverrides, onSave, onCancel }: AdjustFlowProps) {
  const defaultShiftDay = existingOverrides?.shiftDay ??
    (currentResult.status !== 'none' ? currentResult.shiftDay : 1);
  const defaultCoverline = existingOverrides?.coverlineTemp ??
    (currentResult.status !== 'none' ? currentResult.coverlineTemp : 0);

  const [shiftDay, setShiftDay] = useState(defaultShiftDay);
  const [coverlineTemp, setCoverlineTemp] = useState(defaultCoverline);
  const [showDetails, setShowDetails] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ shiftDay, coverlineTemp });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <span className="font-semibold text-sm text-violet-700">Adjust Interpretation</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Shift day picker */}
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Shift day</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={shiftDay}
              onChange={(e) => setShiftDay(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-md border-2 border-violet-500 bg-violet-50 font-medium text-sm"
            />
            <span className="text-xs text-gray-500">or tap a day on the chart</span>
          </div>
        </div>

        {/* Coverline input */}
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Coverline temperature (°C)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              value={coverlineTemp}
              onChange={(e) => setCoverlineTemp(Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-md border-2 border-violet-500 bg-violet-50 font-medium text-sm"
            />
            <span className="text-xs text-gray-500">or drag the line on the chart</span>
          </div>
        </div>

        {/* Collapsible details */}
        <details open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-violet-600 cursor-pointer font-medium">
            View reference & confirming temps
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded-md text-xs text-gray-600">
            {currentResult.status !== 'none' && (
              <>
                <div className="font-semibold text-gray-500 mb-1">6 preceding low temps (reference):</div>
                <div>{currentResult.referenceDays.join(', ')}</div>
              </>
            )}
          </div>
        </details>

        <details open={showExplanation} onToggle={(e) => setShowExplanation((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-violet-600 cursor-pointer font-medium">
            How is the coverline calculated? (Sensiplan)
          </summary>
          <div className="mt-2 p-3 bg-violet-50 rounded-md border border-violet-200 text-xs text-gray-600 leading-relaxed">
            <strong>Step 1:</strong> Identify the 6 valid temps immediately before the apparent shift.<br />
            <strong>Step 2:</strong> Find the highest of those 6.<br />
            <strong>Step 3:</strong> The coverline is drawn at this highest value.<br />
            <strong>Step 4:</strong> 3 consecutive temps must be above the coverline, with the 3rd at least +0.2°C above it.<br />
            <strong>Exception:</strong> If the 3rd doesn't clear +0.2°C, a 4th consecutive temp above the coverline confirms the shift.
          </div>
        </details>

        {/* Engine comparison */}
        {currentResult.status !== 'none' && (
          <div className="p-2 bg-violet-50 rounded-md text-xs text-violet-600 border border-violet-200">
            Engine's suggestion: Day {currentResult.shiftDay}, coverline {currentResult.coverlineTemp.toFixed(2)}°C
          </div>
        )}
      </div>

      <div className={`${footer.base} bg-violet-50 border-violet-200`}>
        <button onClick={handleSave} disabled={saving} className={`${btn.base} ${btn.saveAdjust}`}>
          {saving ? 'Saving...' : 'Save Adjustment'}
        </button>
        <button onClick={onCancel} className={`${btn.base} ${btn.secondary}`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire AdjustFlow into PropositionCard**

Add state to PropositionCard to track whether the adjust flow is open, and render AdjustFlow when it is. Pass the `actions.adjust` callback.

- [ ] **Step 3: Commit**

```bash
cd /Users/olgapak/work/cycle-path
git add app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx \
        app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
git commit -m "feat(interpretation): add adjust flow component with shift day and coverline editing"
```

---

## Task 16: Final Integration Testing

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: Run Wasp compilation check**

Run: `cd /Users/olgapak/work/cycle-path/app && wasp build` (or `wasp start` and verify no errors)

Expected: No build errors.

- [ ] **Step 3: Manual smoke test**

Start the app with `wasp start`. Navigate to a cycle chart page. Verify:
1. For a cycle with enough data — a proposition card appears
2. The coverline draws on the chart
3. Confirm/Adjust/Reject buttons work
4. For cycles without enough data — no card shows

- [ ] **Step 4: Final commit**

```bash
cd /Users/olgapak/work/cycle-path
git add -A
git commit -m "feat(interpretation): complete Sensiplan thermal shift engine integration"
```
