# AdjustFlow v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current freeform Adjust modal (which can't actually be used to enter values) with a Sensiplan-correct flow where the user picks a shift day and Cycle Path recomputes the coverline live, validates the pick against Sensiplan rules, and refuses Save when the pick is invalid.

**Architecture:** Pure-function validation (`validateAdjustment`) shared between the modal and the persistence layer. Coverline becomes derived from raw cycle days, never user-entered. Active-coverline computation extracted into a single shared helper used by the chart, the post-shift monitoring hook, and any UI that displays coverline. Persistence-layer ADJUSTED state gets a new review-trigger rule that defers to `validateAdjustment`. New `revertInterpretation` mutation. UI gating ensures AdjustFlow only opens when there's a Cycle Path suggestion to anchor it.

**Tech Stack:** TypeScript, React, Wasp (Prisma + Convex-style operations), Vitest.

**Spec:** [docs/superpowers/specs/2026-04-26-adjust-flow-v2-design.md](../specs/2026-04-26-adjust-flow-v2-design.md)

**Review revisions (post-initial-draft):**
- **P1.A** Revert button gated on `existingOverrides?.shiftDay != null` (saved adjustment exists), not on local picker divergence — prevents accidental demotion of CONFIRMED rows when user just experiments with the picker. (Task 11.)
- **P1.B** Action typings updated: `UseInterpretationReturn.actions` and `PropositionCardProps.actions` both declare `revert: () => Promise<void>`. (Task 8 steps 5b–5c.)
- **P2** `getActiveCoverline` widened to accept `ThermalShiftResult | null | undefined` so the hook's possibly-undefined `engineResult?.thermalShift` typechecks. ADJUSTED derivation still works without engineResult. (Task 2.)
- **P3** Pending "more highs needed" count fixed: `3 - validation.confirmingDays.length` (validation.confirmingDays already includes the picked shift day, so the previous formula double-counted). (Task 11.)

**Review revisions (third pass):**
- **P1 (server-side preconditions)** `revertInterpretation` mutation now enforces `state === 'ADJUSTED' && userOverrides.shiftDay != null`; otherwise returns 409 Conflict. Defense in depth — UI gating from P1.A above is the first line; the server is the second. Without this, a direct API call could still demote a CONFIRMED row. (Task 5 step 3 + new manual verification cases in Task 15.)
- **Doc nit** Task 11 commit message corrected (was describing the old picker-divergence gating; now describes the saved-adjustment gating that the plan actually implements).

---

## File structure

**New files:**
- `app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts` — pure function: `(days, pickedShiftDay) → AdjustValidation`
- `app/src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts`
- `app/src/cycle-tracking/interpretation/getActiveCoverline.ts` — pure helper: `(days, interpretation, engineResult) → number | null`
- `app/src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts`
- `app/src/cycle-tracking/interpretation/adjustReviewTrigger.ts` — pure function called by `upsertCycleInterpretation` for the ADJUSTED branch
- `app/src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts`

**Modified files:**
- `app/src/cycle-tracking/interpretation/types.ts` — `UserOverrides` shrinks to `{ shiftDay?: number }`
- `app/src/cycle-tracking/interpretation/interpretationOperations.ts` — new ADJUSTED branch in `upsertCycleInterpretation`; new `revertInterpretation` mutation; `adjustInterpretation` accepts only `{shiftDay}`
- `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts` — `activeCoverline` uses `getActiveCoverline`; new `revert` callback; updated `keptValues` extraction
- `app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx` — full rewrite
- `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx` — accept and forward `days`, `cycleStartDate` props
- `app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx` — drop coverlineTemp comparison; use derived coverline; pending indicator
- `app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx` — drop coverlineTemp display
- `app/src/cycle-tracking/CycleChartPage.tsx` — pass new props to PropositionCard; chart annotation uses `getActiveCoverline`
- `app/main.wasp` — register new `revertInterpretation` action

---

## Test commands

Tests run via vitest directly without needing the wasp dev server (which is broken in this env):

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/<file>.test.ts
```

To run the whole suite for the cycle-tracking module:

```bash
cd app
npx vitest run src/cycle-tracking
```

---

## Task 1: validateAdjustment pure function

Heart of the feature. Used by both the modal (live validation) and the persistence layer (review trigger). TDD all 17 cases from the spec.

**Files:**
- Create: `app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts`
- Create: `app/src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts`

- [ ] **Step 1: Write the failing test file with all 17 cases**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts
import { describe, it, expect } from 'vitest';
import { validateAdjustment } from '../sensiplan/validateAdjustment';
import type { CycleDayInput } from '../types';
import { celsiusToFahrenheit } from '../../utils';

// Helper: build CycleDayInput[] from a sequence of °C temperatures.
// Index in array = dayNumber - 1.
function buildDays(tempsC: (number | null)[], excludedDays: number[] = []): CycleDayInput[] {
  return tempsC.map((tC, i) => ({
    dayNumber: i + 1,
    bbt: tC === null ? null : celsiusToFahrenheit(tC),
    bbtTime: '06:30',
    excludeFromInterpretation: excludedDays.includes(i + 1),
    disturbanceFactors: [],
    travelTimeDiff: null,
  }));
}

// Standard 14-day low phase + 7-day high phase setup, easy to perturb
const cleanCycleDays = buildDays([
  // Days 1-14: low phase around 36.3
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
  // Days 15-21: high phase, Day 15 is the shift, 17 clears +0.2
  36.55, 36.50, 36.60, 36.55, 36.55, 36.55, 36.55,
]);

describe('validateAdjustment', () => {
  it('1. returns confirmed when 3 highs satisfy 3-over-6 with 3rd clearing +0.2°C', () => {
    const result = validateAdjustment(cleanCycleDays, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
    expect(result.coverlineTemp).toBeCloseTo(36.32, 2);
    expect(result.usedFourthDayException).toBe(false);
  });

  it('2. returns confirmed via 4th-day exception when 3rd does not clear +0.2°C', () => {
    // Days 15-18 high but 17 doesn't clear +0.2; 18 still above coverline → confirmed via 4th
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.50, 36.45, 36.40, 36.50, 36.50, 36.50, 36.50,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
    expect(result.usedFourthDayException).toBe(true);
  });

  it('3. returns pending when only 1 high recorded after picked day', () => {
    // Only Days 15-16 recorded; 17 onwards null
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.55, null, null, null, null, null, null,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('pending');
  });

  it('4. returns pending when 2 highs recorded but 2nd does not clear +0.2°C and no 3rd yet', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.50, 36.45, null, null, null, null, null,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('pending');
  });

  it('5. returns invalid when a confirming temp drops at/below coverline', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.55, 36.30, 36.55, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('rule_broken');
  });

  it('6. returns invalid when 3rd does not clear +0.2°C and 4th day also at/below coverline', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.50, 36.45, 36.40, 36.30, 36.30, 36.30, 36.30,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('fourth_day_failed');
  });

  it('7. returns invalid with insufficient_lows when <6 valid preceding temps', () => {
    // Pick Day 5; only 4 preceding temps exist
    const days = buildDays([36.30, 36.32, 36.28, 36.30, 36.55, 36.55, 36.70]);
    const result = validateAdjustment(days, 5);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('insufficient_lows');
  });

  it('8. returns invalid when picked day is excluded from interpretation', () => {
    const days = buildDays(
      [
        36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
        36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [15],
    );
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('picked_day_excluded');
  });

  it('9. returns invalid when picked day has no temperature recorded', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      null, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('picked_day_no_temp');
  });

  it('10. returns invalid when picked day temp is not above the computed coverline', () => {
    // Days 9-14 max = 36.32 → coverline 36.32; Day 15 = 36.30 (below) → not above
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.30, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('not_above_coverline');
  });

  it('11. soft-warning flag set when confirmed shift has pickedShiftDay <= 7', () => {
    // Build a cycle where Day 7 is a Sensiplan-valid shift and no earlier valid candidate exists
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28,           // Days 1-6 lows
      36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,    // Days 7-13 highs (Day 7 = shift)
    ]);
    const result = validateAdjustment(days, 7);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.softWarning).toBe('early_shift');
  });

  it('12. exclusions inside the 6-back window are skipped, scan continues further back', () => {
    // Pick Day 15. Days 9, 11 excluded. Reference window should pull from Days 7,8,10,12,13,14.
    const days = buildDays(
      [
        36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.50, 36.30, 36.50, 36.28, 36.30, 36.32,
        36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [9, 11],
    );
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.referenceDays).toEqual([7, 8, 10, 12, 13, 14]);
    expect(result.skippedDays).toEqual([9, 11]);
  });

  it('13. P1.A: returns invalid when an earlier confirmed valid shift exists', () => {
    // Days 1-7 low (36.30), Days 8-13 high (36.50), Day 14 high (36.60).
    // detectThermalShift would return Day 8 as confirmed.
    // User picks Day 14 → reject with earlier_valid_shift_exists.
    const days = buildDays([
      36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
      36.50, 36.50, 36.70, 36.50, 36.50, 36.50,
      36.60,
    ]);
    const result = validateAdjustment(days, 14);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('earlier_valid_shift_exists');
    expect(result.earlierShiftDay).toBe(8);
  });

  it('14. P1.A: pending earlier candidates do not block', () => {
    // Days 1-7 low, Day 8 above coverline (would-be candidate) but only 1 confirming temp exists,
    // then no more data until Day 15 onwards.
    const days = buildDays([
      36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
      36.50, null, null, null, null, null, null,
      36.50, 36.50, 36.70, 36.50, 36.50, 36.50, 36.50,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
  });

  it('15. P1.A: user picks earlier than auto-detected shift → valid', () => {
    // Build a cycle where engine auto-detects Day 16 (e.g., because Day 14-15 don't have 3-over-6),
    // but user thinks Day 14 is right and Day 14 happens to have its own valid 3-over-6.
    // For this test we just verify that a valid earlier pick is accepted.
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30,
      36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 14);
    expect(result.kind).toBe('valid');
  });

  it('16. P1.A: user picks engine pick exactly → valid', () => {
    const result = validateAdjustment(cleanCycleDays, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
  });

  it('17. P1.A: excluded earlier days no longer count as earlier-valid-shift', () => {
    // Days 1-7 low, Days 8-10 high (would auto-confirm at Day 8) BUT all excluded.
    // Days 11-14 low again. Days 15-21 high.
    // detectThermalShift should skip Days 8-10 (excluded) and confirm at Day 15.
    // User picks Day 15 → valid.
    const days = buildDays(
      [
        36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
        36.50, 36.50, 36.50,
        36.30, 36.30, 36.30, 36.30,
        36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [8, 9, 10],
    );
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (file doesn't exist yet)**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts
```

Expected: FAIL with module-not-found error for `../sensiplan/validateAdjustment`.

- [ ] **Step 3: Implement validateAdjustment**

```typescript
// app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts
import type { CycleDayInput } from '../types';
import { collectReferenceDays } from './excludedDays';
import { detectThermalShift } from './thermalShift';
import { checkFourthDayException } from './fourthDayException';
import { fahrenheitToCelsius } from '../../utils';

const THRESHOLD_C = 0.2;

export type AdjustValidation =
  | {
      kind: 'valid';
      status: 'confirmed' | 'pending';
      coverlineTemp: number; // °C
      referenceDays: number[];
      skippedDays: number[];
      confirmingDays: number[];
      usedFourthDayException: boolean;
      softWarning: 'early_shift' | null;
    }
  | {
      kind: 'invalid';
      reason:
        | 'picked_day_no_temp'
        | 'picked_day_excluded'
        | 'insufficient_lows'
        | 'not_above_coverline'
        | 'earlier_valid_shift_exists'
        | 'rule_broken'
        | 'fourth_day_failed';
      // For "earlier_valid_shift_exists":
      earlierShiftDay?: number;
      // For "rule_broken" / "fourth_day_failed":
      failedOnDay?: number;
      // For "insufficient_lows":
      validLowsCount?: number;
      missingDaysCount?: number;
      excludedDaysCount?: number;
    };

/**
 * Validate a user-proposed thermal shift day against Sensiplan rules using
 * raw cycle days. Pure function — no side effects, no I/O.
 *
 * Returns a tagged union: 'valid' (confirmed or pending) or 'invalid' with a
 * specific reason code. Used by AdjustFlow (live validation as user picks)
 * and upsertCycleInterpretation (ADJUSTED-state review trigger).
 */
export function validateAdjustment(
  days: CycleDayInput[],
  pickedShiftDay: number,
): AdjustValidation {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  // 1. Picked day exists, has temp, not excluded
  const pickedDay = sorted.find((d) => d.dayNumber === pickedShiftDay);
  if (!pickedDay) return { kind: 'invalid', reason: 'picked_day_no_temp' };
  if (pickedDay.bbt === null) return { kind: 'invalid', reason: 'picked_day_no_temp' };
  if (pickedDay.excludeFromInterpretation) {
    return { kind: 'invalid', reason: 'picked_day_excluded' };
  }

  // 2. Reference window
  const refResult = collectReferenceDays(sorted, pickedShiftDay);
  if (!refResult) {
    const validLowsCount = sorted.filter(
      (d) => d.dayNumber < pickedShiftDay && d.bbt !== null && !d.excludeFromInterpretation,
    ).length;
    const missingDaysCount = sorted.filter(
      (d) => d.dayNumber < pickedShiftDay && d.bbt === null,
    ).length;
    const excludedDaysCount = sorted.filter(
      (d) => d.dayNumber < pickedShiftDay && d.excludeFromInterpretation,
    ).length;
    return {
      kind: 'invalid',
      reason: 'insufficient_lows',
      validLowsCount,
      missingDaysCount,
      excludedDaysCount,
    };
  }
  const { coverlineTemp, referenceDays, skippedDays } = refResult;

  // 3. Picked day above coverline
  const pickedTempC = fahrenheitToCelsius(pickedDay.bbt);
  if (pickedTempC <= coverlineTemp) {
    return { kind: 'invalid', reason: 'not_above_coverline' };
  }

  // 4. P1.A: no earlier confirmed valid shift
  const autoDetected = detectThermalShift(sorted);
  if (autoDetected.status === 'confirmed' && autoDetected.shiftDay < pickedShiftDay) {
    return {
      kind: 'invalid',
      reason: 'earlier_valid_shift_exists',
      earlierShiftDay: autoDetected.shiftDay,
    };
  }

  // 5. 3-over-6 confirmation from picked day
  const confirmResult = checkConfirmingFromPicked(sorted, pickedShiftDay, coverlineTemp);

  if (confirmResult.outcome === 'rule_broken') {
    return { kind: 'invalid', reason: 'rule_broken', failedOnDay: confirmResult.failedOnDay };
  }
  if (confirmResult.outcome === 'fourth_day_failed') {
    return {
      kind: 'invalid',
      reason: 'fourth_day_failed',
      failedOnDay: confirmResult.failedOnDay,
    };
  }

  const softWarning: 'early_shift' | null = pickedShiftDay <= 7 ? 'early_shift' : null;

  return {
    kind: 'valid',
    status: confirmResult.outcome,
    coverlineTemp,
    referenceDays,
    skippedDays,
    confirmingDays: [pickedShiftDay, ...confirmResult.confirmingDays],
    usedFourthDayException: confirmResult.usedFourthDay ?? false,
    softWarning,
  };
}

type ConfirmFromPickedOutcome =
  | { outcome: 'confirmed'; confirmingDays: number[]; usedFourthDay: boolean }
  | { outcome: 'pending'; confirmingDays: number[] }
  | { outcome: 'rule_broken'; failedOnDay: number; confirmingDays: number[] }
  | { outcome: 'fourth_day_failed'; failedOnDay: number; confirmingDays: number[] };

function checkConfirmingFromPicked(
  sorted: CycleDayInput[],
  pickedShiftDay: number,
  coverlineC: number,
): ConfirmFromPickedOutcome {
  const confirmingDays: number[] = [];
  let needFourthDay = false;
  let i = sorted.findIndex((d) => d.dayNumber === pickedShiftDay) + 1;

  while (i < sorted.length) {
    if (confirmingDays.length >= 3) break;
    const d = sorted[i];
    if (d.bbt === null || d.excludeFromInterpretation) {
      i++;
      continue;
    }
    const tempC = fahrenheitToCelsius(d.bbt);
    const positionInConfirm = confirmingDays.length + 1;

    if (positionInConfirm === 1) {
      if (tempC <= coverlineC) {
        return { outcome: 'rule_broken', failedOnDay: d.dayNumber, confirmingDays };
      }
      confirmingDays.push(d.dayNumber);
    } else if (positionInConfirm === 2) {
      if (tempC <= coverlineC) {
        return { outcome: 'rule_broken', failedOnDay: d.dayNumber, confirmingDays };
      }
      if (tempC >= coverlineC + THRESHOLD_C) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: false };
      }
      confirmingDays.push(d.dayNumber);
      needFourthDay = true;
    } else if (positionInConfirm === 3 && needFourthDay) {
      if (checkFourthDayException(tempC, coverlineC)) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: true };
      }
      return { outcome: 'fourth_day_failed', failedOnDay: d.dayNumber, confirmingDays };
    }
    i++;
  }

  return { outcome: 'pending', confirmingDays };
}
```

- [ ] **Step 4: Run tests, verify all 17 pass**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts
```

Expected: 17 passed. If any fail, debug — do NOT change tests to match implementation; the spec defines the contract.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts app/src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts
git commit -m "feat(interpretation): add validateAdjustment pure function

Validates a user-proposed thermal shift day against Sensiplan rules using
raw cycle days. Returns confirmed/pending/invalid with specific reason codes.
Includes the P1.A 'earlier valid shift exists' check that uses
detectThermalShift to enforce Sensiplan's 'first higher temp' rule."
```

---

## Task 2: getActiveCoverline helper

Shared between the chart and the post-shift monitoring hook. For ADJUSTED state, recomputes coverline from raw days using `userOverrides.shiftDay`. For other states, returns the engine's coverline.

**Files:**
- Create: `app/src/cycle-tracking/interpretation/getActiveCoverline.ts`
- Create: `app/src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts
import { describe, it, expect } from 'vitest';
import { getActiveCoverline } from '../getActiveCoverline';
import type { CycleDayInput, ThermalShiftResult } from '../types';
import { celsiusToFahrenheit } from '../../utils';

function buildDays(tempsC: (number | null)[]): CycleDayInput[] {
  return tempsC.map((tC, i) => ({
    dayNumber: i + 1,
    bbt: tC === null ? null : celsiusToFahrenheit(tC),
    bbtTime: '06:30',
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
  }));
}

const days = buildDays([
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
  36.55, 36.50, 36.70, 36.55, 36.55, 36.55, 36.55,
]);

const engineConfirmed: ThermalShiftResult = {
  status: 'confirmed',
  shiftDay: 15,
  coverlineTemp: 36.32,
  referenceDays: [9, 10, 11, 12, 13, 14],
  confirmingDays: [15, 16, 17],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
};

const engineNone: ThermalShiftResult = {
  status: 'none',
  reason: 'no_shift_detected',
  failedAttempts: [],
};

describe('getActiveCoverline', () => {
  it('returns null when interpretation is null', () => {
    expect(getActiveCoverline(days, null, engineConfirmed)).toBeNull();
  });

  it('returns engine coverline for SUGGESTED state', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns engine coverline for CONFIRMED state', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns null for SUGGESTED with engine status=none', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineNone)).toBeNull();
  });

  it('returns derived coverline for ADJUSTED state with shiftDay override', () => {
    // User picks Day 14. 6 preceding lows = Days 8-13. Max = 36.32.
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 14 } } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns derived coverline for ADJUSTED state even when engine status=none', () => {
    // KeptShiftCard scenario: engine no longer detects, but user's override stands.
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 14 } } as any;
    expect(getActiveCoverline(days, interp, engineNone)).toBeCloseTo(36.32, 2);
  });

  it('returns null for ADJUSTED state when override has insufficient preceding lows', () => {
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 4 } } as any;
    expect(getActiveCoverline(days, interp, engineNone)).toBeNull();
  });

  it('returns null for DISMISSED state', () => {
    const interp = { state: 'DISMISSED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeNull();
  });

  it('ignores stale userOverrides.coverlineTemp (no longer trusted)', () => {
    // Old DB record may have coverlineTemp; we recompute from shiftDay regardless.
    const interp = {
      state: 'ADJUSTED',
      userOverrides: { shiftDay: 14, coverlineTemp: 99.99 },
    } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns null when engineResult is null/undefined (P2 robustness)', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, null)).toBeNull();
    expect(getActiveCoverline(days, interp, undefined)).toBeNull();
  });

  it('still derives ADJUSTED coverline even when engineResult is null', () => {
    // ADJUSTED path doesn't depend on engineResult — only on raw days + shiftDay.
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 14 } } as any;
    expect(getActiveCoverline(days, interp, null)).toBeCloseTo(36.32, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement getActiveCoverline**

```typescript
// app/src/cycle-tracking/interpretation/getActiveCoverline.ts
import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';
import { collectReferenceDays } from './sensiplan/excludedDays';

/**
 * Compute the active coverline for an interpretation, given raw cycle days
 * and the latest engine result. Pure function.
 *
 * For ADJUSTED state: recompute coverline from userOverrides.shiftDay using
 * the same logic the engine uses (collectReferenceDays). Stale
 * userOverrides.coverlineTemp values from old DB records are ignored.
 *
 * For SUGGESTED/CONFIRMED: return the engine's coverline if a shift is
 * detected, else null.
 *
 * For DISMISSED: return null (chart shouldn't draw a coverline for dismissed
 * interpretations).
 *
 * P2 robustness: engineResult can be null/undefined (e.g., marked cycles or
 * empty days where the client engine is skipped). The function returns null
 * in that case for SUGGESTED/CONFIRMED, but ADJUSTED derivation still works
 * since it only depends on raw days + shiftDay.
 */
export function getActiveCoverline(
  days: CycleDayInput[],
  interpretation: { state: string; userOverrides: UserOverrides | null } | null,
  engineResult: ThermalShiftResult | null | undefined,
): number | null {
  if (!interpretation) return null;
  if (interpretation.state === 'DISMISSED') return null;

  if (interpretation.state === 'ADJUSTED') {
    const shiftDay = interpretation.userOverrides?.shiftDay;
    if (shiftDay == null) return null;
    const refResult = collectReferenceDays(days, shiftDay);
    return refResult ? refResult.coverlineTemp : null;
  }

  // SUGGESTED or CONFIRMED
  if (!engineResult || engineResult.status === 'none') return null;
  return engineResult.coverlineTemp;
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/getActiveCoverline.ts app/src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts
git commit -m "feat(interpretation): add getActiveCoverline helper

Shared between chart and post-shift monitoring. For ADJUSTED state,
recomputes coverline from userOverrides.shiftDay using raw days. Stale
userOverrides.coverlineTemp values are ignored."
```

---

## Task 3: adjustReviewTrigger pure function

Encapsulates the new ADJUSTED-state review-trigger logic so `upsertCycleInterpretation` can stay thin and the rule is unit-tested.

**Files:**
- Create: `app/src/cycle-tracking/interpretation/adjustReviewTrigger.ts`
- Create: `app/src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts
import { describe, it, expect } from 'vitest';
import { shouldTriggerReviewForAdjusted } from '../adjustReviewTrigger';
import type { CycleDayInput, ThermalShiftResult } from '../types';
import { celsiusToFahrenheit } from '../../utils';

function buildDays(tempsC: (number | null)[], excluded: number[] = []): CycleDayInput[] {
  return tempsC.map((tC, i) => ({
    dayNumber: i + 1,
    bbt: tC === null ? null : celsiusToFahrenheit(tC),
    bbtTime: '06:30',
    excludeFromInterpretation: excluded.includes(i + 1),
    disturbanceFactors: [],
    travelTimeDiff: null,
  }));
}

const validDays = buildDays([
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
  36.55, 36.50, 36.70, 36.55, 36.55, 36.55, 36.55,
]);

const engineConfirmed = (shiftDay: number): ThermalShiftResult => ({
  status: 'confirmed',
  shiftDay,
  coverlineTemp: 36.32,
  referenceDays: [shiftDay - 6, shiftDay - 5, shiftDay - 4, shiftDay - 3, shiftDay - 2, shiftDay - 1],
  confirmingDays: [shiftDay, shiftDay + 1, shiftDay + 2],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
});

const engineNone: ThermalShiftResult = {
  status: 'none',
  reason: 'no_shift_detected',
  failedAttempts: [],
};

describe('shouldTriggerReviewForAdjusted', () => {
  it('does NOT trigger when user pick is still valid and engine is unchanged', () => {
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineConfirmed(15));
    expect(result.trigger).toBe(false);
  });

  it('does NOT trigger when engine.status flips pending->confirmed at same shiftDay', () => {
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineConfirmed(15));
    expect(result.trigger).toBe(false);
  });

  it('does NOT trigger when engine.shiftDay moves but user pick still valid', () => {
    // User picked Day 15; engine now picks Day 18 (somehow). User's pick still valid.
    // No earlier confirmed engine shift before Day 15.
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineConfirmed(18));
    expect(result.trigger).toBe(false);
  });

  it('triggers with reason="invalid_pick" when user pick fails Sensiplan rules', () => {
    // Days 1-14 lows but Day 15 (user's pick) has no temp recorded
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      null, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = shouldTriggerReviewForAdjusted(days, 15, engineConfirmed(16));
    expect(result.trigger).toBe(true);
    expect(result.reason).toMatch(/invalid_pick/);
  });

  it('triggers when engine.status flips to none', () => {
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineNone);
    expect(result.trigger).toBe(true);
    expect(result.reason).toMatch(/engine_lost_shift/);
  });

  it('triggers when raw data now shows earlier valid shift', () => {
    // User picked Day 15, but data now has Day 8 as confirmed earlier candidate
    const days = buildDays([
      36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
      36.50, 36.50, 36.70, 36.50, 36.50, 36.50, 36.50,
      36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = shouldTriggerReviewForAdjusted(days, 15, engineConfirmed(8));
    expect(result.trigger).toBe(true);
    expect(result.reason).toMatch(/invalid_pick|earlier_valid_shift/);
  });

  it('triggers when user excluded a low and now <6 valid pre-shift temps', () => {
    const days = buildDays(
      [
        36.30, 36.32, 36.28, 36.30, 36.32,
        36.55, 36.50, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [1, 2],
    );
    const result = shouldTriggerReviewForAdjusted(days, 6, engineNone);
    expect(result.trigger).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement shouldTriggerReviewForAdjusted**

```typescript
// app/src/cycle-tracking/interpretation/adjustReviewTrigger.ts
import type { CycleDayInput, ThermalShiftResult } from './types';
import { validateAdjustment } from './sensiplan/validateAdjustment';

export type AdjustReviewDecision =
  | { trigger: false }
  | { trigger: true; reason: string };

/**
 * Decide whether ADJUSTED-state interpretation should enter needsReview.
 *
 * Rule (per spec): trigger only when
 *   (a) validateAdjustment returns invalid (user's pick no longer satisfies
 *       Sensiplan rules with current data), OR
 *   (b) engineResult.status === 'none' (engine lost the shift entirely).
 *
 * The previous hasMaterialChange check is dropped for ADJUSTED state — engine
 * wobbling around its own pick (pending↔confirmed, shiftDay shifting) does
 * not trigger review when the user's pick remains valid.
 */
export function shouldTriggerReviewForAdjusted(
  days: CycleDayInput[],
  userShiftDay: number,
  newEngineResult: ThermalShiftResult,
): AdjustReviewDecision {
  if (newEngineResult.status === 'none') {
    return {
      trigger: true,
      reason: 'engine_lost_shift: The data no longer supports a thermal shift.',
    };
  }

  const validation = validateAdjustment(days, userShiftDay);
  if (validation.kind === 'invalid') {
    return {
      trigger: true,
      reason: `invalid_pick: ${validation.reason}`,
    };
  }

  return { trigger: false };
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/adjustReviewTrigger.ts app/src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts
git commit -m "feat(interpretation): add shouldTriggerReviewForAdjusted

New rule for ADJUSTED-state review trigger. Replaces hasMaterialChange
for this state. Only triggers when (a) user's pick fails Sensiplan rules
or (b) engine has lost the shift entirely. Engine wobble does not trigger."
```

---

## Task 4: Type cleanup — UserOverrides shrinks

`UserOverrides` no longer has `coverlineTemp`. Stored DB values are silently ignored.

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/types.ts:124-127`

- [ ] **Step 1: Edit the type**

In `app/src/cycle-tracking/interpretation/types.ts`, replace:

```typescript
export type UserOverrides = {
  shiftDay?: number;
  coverlineTemp?: number;     // °C
};
```

with:

```typescript
export type UserOverrides = {
  shiftDay?: number;
  // Note: coverlineTemp was removed in v2 (2026-04-26). The coverline is
  // now always derived from raw days via collectReferenceDays(days, shiftDay).
  // Stored values from before this change are silently ignored.
};
```

- [ ] **Step 2: Run typecheck on the cycle-tracking module**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep -E "interpretation/(components|hooks|sensiplan)" | grep -v "wasp/" | head -30
```

Expected: a list of TypeScript errors in files that previously read `userOverrides.coverlineTemp`. These errors will be fixed by subsequent tasks. The `wasp/*` errors are environment-only and unrelated.

- [ ] **Step 3: Commit (broken intermediate state — explicitly OK because subsequent tasks fix it)**

```bash
git add app/src/cycle-tracking/interpretation/types.ts
git commit -m "refactor(interpretation): drop coverlineTemp from UserOverrides type

v2 derives coverline from raw days; user-entered coverlines are no longer
trusted. Stored DB values are ignored. Subsequent commits update the few
call sites that read this field."
```

---

## Task 5: Add `revertInterpretation` mutation

Backend mutation: clears `userOverrides`, demotes to SUGGESTED. Defensive: deletes the row if engine.status='none' at revert time.

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/interpretationOperations.ts`
- Modify: `app/main.wasp` (register the action)

- [ ] **Step 1: Read the current interpretationOperations.ts file to find the right place to add the new action**

Read `app/src/cycle-tracking/interpretation/interpretationOperations.ts` from line 290 to end, to see where existing user-action mutations live.

- [ ] **Step 2: Add the import for the new operation type**

In `app/src/cycle-tracking/interpretation/interpretationOperations.ts`, find the import block at the top (lines 4–14). Add `RevertInterpretation` to the list of imports from `wasp/server/operations`.

```typescript
import type {
  GetCycleInterpretation,
  UpsertCycleInterpretation,
  DeleteCycleInterpretation,
  ConfirmInterpretation,
  AdjustInterpretation,
  RevertInterpretation,    // NEW
  DismissInterpretation,
  ResolveReview,
  ResolveFalseRiseWarning,
  ResolveNudge,
} from 'wasp/server/operations';
```

- [ ] **Step 3: Add the `revertInterpretation` action implementation**

Append after the `adjustInterpretation` definition (around line 331), before `dismissInterpretation`:

```typescript
type RevertInput = { interpretationId: string };

/**
 * Revert an ADJUSTED interpretation to SUGGESTED, clearing userOverrides.
 *
 * Server-side preconditions (P1 — defense in depth, the UI also gates):
 * - The row's state MUST be 'ADJUSTED'. Calling revert on SUGGESTED, CONFIRMED,
 *   or DISMISSED is a 409 Conflict — there is nothing to revert.
 * - userOverrides.shiftDay MUST exist. An ADJUSTED row without a shiftDay
 *   override is malformed; treating it as revertable would silently destroy
 *   data the user did not intend to modify.
 *
 * Defensive (P1.B): if engineResult.status === 'none' at revert time AND
 * preconditions pass, delete the row entirely instead of demoting (mirrors
 * SUGGESTED+'none' deletion in upsertCycleInterpretation). The UI gating
 * prevents AdjustFlow from opening in that state, but the mutation is robust
 * to it (e.g., race conditions with concurrent data edits).
 */
export const revertInterpretation: RevertInterpretation<
  RevertInput,
  CycleInterpretation | null
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities,
  );

  // Precondition 1: state must be ADJUSTED
  if (interp.state !== 'ADJUSTED') {
    throw new HttpError(
      409,
      `Cannot revert: interpretation is in state '${interp.state}', not 'ADJUSTED'. There is no saved adjustment to revert.`,
    );
  }

  // Precondition 2: userOverrides.shiftDay must exist
  const overrides = interp.userOverrides as { shiftDay?: number } | null;
  if (overrides?.shiftDay == null) {
    throw new HttpError(
      409,
      'Cannot revert: ADJUSTED interpretation has no saved shiftDay override.',
    );
  }

  const engineResult = interp.engineResult as { status?: string } | null;
  if (engineResult?.status === 'none') {
    await context.entities.CycleInterpretation.delete({
      where: { id: args.interpretationId },
    });
    return null;
  }

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'SUGGESTED',
      userOverrides: Prisma.DbNull,
      needsReview: false,
      reviewReason: null,
      previousEngineResult: Prisma.DbNull,
    },
  });
};
```

- [ ] **Step 4: Register the action in main.wasp**

In `app/main.wasp`, find the existing `adjustInterpretation` action declaration (search for `action adjustInterpretation`). Add a new `revertInterpretation` action declaration immediately after it, copying the same pattern. The exact syntax depends on existing declarations — match the surrounding style (`fn:`, `entities:` etc.).

Example pattern (verify against existing):

```wasp
action revertInterpretation {
  fn: import { revertInterpretation } from "@src/cycle-tracking/interpretation/interpretationOperations.js",
  entities: [CycleInterpretation, Cycle]
}
```

- [ ] **Step 5: Verify the operation compiles**

The wasp environment generates the type for `RevertInterpretation` only after `wasp start` runs. Since the env is broken, verify by reading: there should be no TypeScript errors in `interpretationOperations.ts` *other than* the existing `wasp/*` import errors.

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "interpretationOperations" | grep -v "wasp/"
```

Expected: no output (no errors).

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/interpretation/interpretationOperations.ts app/main.wasp
git commit -m "feat(interpretation): add revertInterpretation mutation

Reverts ADJUSTED state to SUGGESTED, clearing userOverrides. Server-side
preconditions: state must be ADJUSTED and userOverrides.shiftDay must
exist; otherwise returns 409 Conflict. Defense in depth — UI also gates
the revert button on a saved adjustment.

Defensive: deletes the row outright if engine.status='none' at revert
time (mirrors SUGGESTED+'none' deletion in upsertCycleInterpretation)."
```

---

## Task 6: Update `upsertCycleInterpretation` ADJUSTED branch

Replace the `hasMaterialChange` check for ADJUSTED state with `shouldTriggerReviewForAdjusted`. The mutation needs `days[]` access — re-fetch from `cycleId` server-side.

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/interpretationOperations.ts:208-233`

- [ ] **Step 1: Add the import for the new function**

In `app/src/cycle-tracking/interpretation/interpretationOperations.ts`, near the existing imports (line 16), add:

```typescript
import { hasMaterialChange } from './materialChange';
import { shouldTriggerReviewForAdjusted } from './adjustReviewTrigger';
```

- [ ] **Step 2: Modify the ADJUSTED branch in upsertCycleInterpretation**

Find the existing `case 'CONFIRMED': case 'ADJUSTED':` block (lines ~208-233). Split it into two separate cases. The CONFIRMED case keeps the existing `hasMaterialChange` logic. The new ADJUSTED case uses `shouldTriggerReviewForAdjusted`.

Replace:

```typescript
    case 'CONFIRMED':
    case 'ADJUSTED':
      if (!materialChange) {
        // Core interpretation unchanged — silently refresh engine result,
        // monitoring, and nudges without triggering a review
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            engineResult: args.engineResult,
            postShiftMonitoring: args.postShiftMonitoring ?? undefined,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });
      }
      // Material change — enter review
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          needsReview: true,
          reviewReason: 'A data edit changed the engine\'s evaluation. Review the new result.',
          previousEngineResult: existing.engineResult as Prisma.InputJsonValue,
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });
```

with:

```typescript
    case 'CONFIRMED':
      if (!materialChange) {
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            engineResult: args.engineResult,
            postShiftMonitoring: args.postShiftMonitoring ?? undefined,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });
      }
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          needsReview: true,
          reviewReason: 'A data edit changed the engine\'s evaluation. Review the new result.',
          previousEngineResult: existing.engineResult as Prisma.InputJsonValue,
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });

    case 'ADJUSTED': {
      // P1.1 + P1.2: new review-trigger rule for ADJUSTED state.
      // Validates the user's override against current days; only triggers
      // review if their pick is invalid OR engine has lost the shift.
      const overrides = existing.userOverrides as { shiftDay?: number } | null;
      const userShiftDay = overrides?.shiftDay;
      if (userShiftDay == null) {
        // Defensive: ADJUSTED row without shiftDay is malformed. Just refresh.
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: { engineResult: args.engineResult },
        });
      }
      // Re-fetch days for validation (server-trusted source of truth)
      const cycleDays = await context.entities.CycleDay.findMany({
        where: { cycleId: args.cycleId },
        orderBy: { dayNumber: 'asc' },
      });
      const cycleDayInputs = cycleDays.map((d: any) => ({
        dayNumber: d.dayNumber,
        bbt: d.bbt,
        bbtTime: d.bbtTime,
        excludeFromInterpretation: d.excludeFromInterpretation,
        disturbanceFactors: d.disturbanceFactors ?? [],
        travelTimeDiff: d.travelTimeDiff,
      }));
      const decision = shouldTriggerReviewForAdjusted(
        cycleDayInputs, userShiftDay, args.engineResult,
      );
      if (!decision.trigger) {
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            engineResult: args.engineResult,
            postShiftMonitoring: args.postShiftMonitoring ?? undefined,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });
      }
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          needsReview: true,
          reviewReason: decision.reason,
          previousEngineResult: existing.engineResult as Prisma.InputJsonValue,
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });
    }
```

Note: the `materialChange` const declaration at line 194 stays — the CONFIRMED case still uses it.

- [ ] **Step 3: Verify the entities array on the upsertCycleInterpretation action declaration includes CycleDay**

In `app/main.wasp`, find the `upsertCycleInterpretation` action declaration. Ensure `CycleDay` is in the `entities:` list. If it's not, add it.

- [ ] **Step 4: Run all interpretation tests to confirm no regressions**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__
```

Expected: all existing tests still pass; the new validateAdjustment, getActiveCoverline, and adjustReviewTrigger tests all pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/interpretationOperations.ts app/main.wasp
git commit -m "feat(interpretation): new review-trigger rule for ADJUSTED state

Replaces hasMaterialChange (engine-result diff) with
shouldTriggerReviewForAdjusted (validates user's pick against current days).

Engine wobble (pending->confirmed at same shiftDay, or shiftDay shifting
without invalidating user's pick) no longer triggers review for ADJUSTED.
Only triggers when user's pick fails Sensiplan rules or engine loses shift."
```

---

## Task 7: Simplify `adjustInterpretation` mutation signature

Mutation now accepts only `{ shiftDay: number }`. Backward-compat: silently ignore stale `coverlineTemp` if a client sends it.

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/interpretationOperations.ts:311-331`

- [ ] **Step 1: Update the AdjustInput type and the function body**

Replace:

```typescript
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
```

with:

```typescript
type AdjustInput = {
  interpretationId: string;
  // v2: only shiftDay is accepted. Coverline is derived from raw days.
  // Backward-compat: clients may still send coverlineTemp; it's silently dropped.
  userOverrides: { shiftDay?: number; coverlineTemp?: number };
};

export const adjustInterpretation: AdjustInterpretation<
  AdjustInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  // Strip any stale coverlineTemp; persist only shiftDay.
  const sanitizedOverrides = args.userOverrides?.shiftDay != null
    ? { shiftDay: args.userOverrides.shiftDay }
    : null;

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'ADJUSTED',
      userOverrides: sanitizedOverrides ?? Prisma.DbNull,
    },
  });
};
```

- [ ] **Step 2: Verify TypeScript on this file**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "interpretationOperations" | grep -v "wasp/"
```

Expected: no errors (other than wasp/* env issues).

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/interpretationOperations.ts
git commit -m "refactor(interpretation): adjustInterpretation persists only shiftDay

Strips any stale coverlineTemp before writing. Old DB records keep their
existing coverlineTemp values but they're never read anymore (see
getActiveCoverline)."
```

---

## Task 8: Update `useInterpretation` hook

`activeCoverline` now uses `getActiveCoverline`. Add `revert` callback. Update `keptValues` extraction (since stored coverlineTemp is no longer trusted).

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts`

- [ ] **Step 1: Read the current hook to understand its structure**

```bash
cat app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts
```

Note where `activeCoverline` is computed, where mutations are imported, and where the actions object is built.

- [ ] **Step 2: Add imports for the new helpers and mutation**

Near the top of `useInterpretation.ts`, add:

```typescript
import { getActiveCoverline } from '../getActiveCoverline';
import { collectReferenceDays } from '../sensiplan/excludedDays';
```

- [ ] **Step 3: Replace the activeCoverline computation**

Find lines ~108–142 (the post-shift monitoring block where `activeCoverline` is computed). Replace the existing:

```typescript
const activeCoverline = overrides?.coverlineTemp
  ?? (shift && shift.status !== 'none' ? shift.coverlineTemp : null);
```

with:

```typescript
const activeCoverline = getActiveCoverline(days, interpretation, shift);
```

P2 note: `shift` is `engineResult?.thermalShift` and may be `undefined` (e.g., marked cycles or empty days when the client engine is skipped). `getActiveCoverline` accepts `ThermalShiftResult | null | undefined` (see Task 2) so this typechecks without needing an explicit fallback.

- [ ] **Step 4: Update keptValues extraction**

Find the `resolveReview` callback (around line 216–217). The existing code extracts `keptValues` from `userOverrides.coverlineTemp` or from `previousEngineResult.coverlineTemp`. Replace with:

```typescript
const keptValues = (() => {
  const overrides = interpretation.userOverrides as UserOverrides | null;
  const shiftDay = overrides?.shiftDay
    ?? (prev && prev.status !== 'none' ? prev.shiftDay : undefined);
  if (shiftDay == null) return undefined;
  const ref = collectReferenceDays(days, shiftDay);
  if (!ref) return undefined;
  return { shiftDay, coverlineTemp: ref.coverlineTemp };
})();
```

- [ ] **Step 5: Add the revert callback**

Find where the existing `adjust` callback is defined (around line 189). Add a `revert` callback nearby:

```typescript
const revert = useCallback(async () => {
  if (!interpretation) return;
  const { revertInterpretation } = await import('wasp/client/operations');
  await revertInterpretation({ interpretationId: interpretation.id });
}, [interpretation]);
```

Then add `revert` to the `actions` object that the hook returns.

- [ ] **Step 5b (P1.B): Update the `UseInterpretationReturn.actions` type to declare `revert`**

In `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts`, find the inline `actions` shape on `UseInterpretationReturn` (lines ~38–49). Add a new `revert` line. The full updated shape:

```typescript
  actions: {
    confirm: () => Promise<void>;
    adjust: (overrides: UserOverrides) => Promise<void>;
    revert: () => Promise<void>;                                                 // NEW
    dismiss: () => Promise<void>;
    resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
    resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
    resolveNudge: (day: number, response: 'yes_disturbed' | 'no_correct') => Promise<void>;
    reEvaluate: () => Promise<void>;
    markAnovulatory: () => Promise<void>;
    markUninterpretable: () => Promise<void>;
    unmarkClassification: () => Promise<void>;
  };
```

Make sure the `actions` object literal returned by the hook now includes `revert` so the literal satisfies this type.

- [ ] **Step 5c (P1.B): Update `PropositionCardProps.actions` to declare `revert`**

In `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx`, find the inline `actions` shape on `PropositionCardProps` (lines ~25–32). Add the `revert` member to match the hook's contract:

```typescript
actions: {
  confirm: () => Promise<void>;
  adjust: (overrides: UserOverrides) => Promise<void>;
  revert: () => Promise<void>;                                                 // NEW
  dismiss: () => Promise<void>;
  resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
  resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
};
```

(PropositionCard's actions prop is a structural subset of the hook's actions — it only declares the fields PropositionCard actually consumes.)

- [ ] **Step 6: Run all interpretation tests**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts
git commit -m "refactor(interpretation): hook uses getActiveCoverline helper

activeCoverline and keptValues are now derived via getActiveCoverline /
collectReferenceDays from raw days. Stale userOverrides.coverlineTemp is
no longer read. Adds revert action."
```

---

## Task 9: Update CycleChartPage chart annotation

Replace the `overrides?.coverlineTemp ?? engine.coverlineTemp` pattern with `getActiveCoverline`. Also pass `days` and `cycleStartDate` props down to PropositionCard.

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:566-603` (chart annotation)
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:2072-2086` (PropositionCard render)

- [ ] **Step 1: Add the import**

Near the top of `app/src/cycle-tracking/CycleChartPage.tsx`, add:

```typescript
import { getActiveCoverline } from './interpretation/getActiveCoverline';
```

- [ ] **Step 2: Replace the chart-annotation coverline derivation**

Find the IIFE at lines ~566–603. Replace the body so coverline derives from `getActiveCoverline`:

```typescript
yaxis: (() => {
  if (!interpretation || !engineResult) return [];
  const shift = engineResult.thermalShift;
  const state = interpretation.state;

  // P2.2: derive coverline from raw days for ADJUSTED; engine for SUGGESTED/CONFIRMED.
  const coverlineC = getActiveCoverline(cycleDayInputs, interpretation, shift);

  const isMarked =
    !!(cycle as any)?.markedAnovulatoryAt || !!(cycle as any)?.markedUninterpretableAt;
  if (coverlineC == null || state === 'DISMISSED' || isMarked) return [];

  // (rest of the existing code unchanged: convert to display unit, build annotation)
  const coverlineDisplay = settings.temperatureUnit === 'CELSIUS'
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
      position: 'right' as const,
      style: { color: style.color, fontSize: '10px', background: 'transparent' },
    },
  }];
})(),
```

- [ ] **Step 3: Pass days and cycleStartDate to PropositionCard**

Find the PropositionCard render (around line 2072–2086). Add two new props:

```tsx
<PropositionCard
  engineResult={engineResult}
  interpretation={interpretation}
  postShiftMonitoring={postShiftMonitoring}
  changeNotice={null}
  keepWatchingDismissed={keepWatchingDismissed}
  onKeepWatching={onKeepWatching}
  actions={interpretationActions}
  cycleIsActive={cycle.isActive}
  maxDayNumber={maxDayNumber}
  onReEvaluate={interpretationActions.reEvaluate}
  onMarkAnovulatory={interpretationActions.markAnovulatory}
  onMarkUninterpretable={interpretationActions.markUninterpretable}
  days={cycleDayInputs}                          // NEW
  cycleStartDate={new Date(cycle.startDate)}     // NEW
/>
```

- [ ] **Step 4: Verify TypeScript on the chart page**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "CycleChartPage" | grep -v "wasp/"
```

Expected: errors about PropositionCard not accepting `days` and `cycleStartDate` — fixed in next task.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "fix(chart): derive coverline via getActiveCoverline

Chart annotation now recomputes coverline from raw days for ADJUSTED state,
fixing two bugs: (1) ADJUSTED+engine.status='none' (KeptShiftCard) no longer
loses the coverline; (2) ADJUSTED with user shiftDay differing from engine
draws the user's coverline, not the engine's.

Also passes cycleDayInputs and cycle.startDate to PropositionCard."
```

---

## Task 10: PropositionCard — accept days/cycleStartDate, forward to AdjustFlow

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx`

- [ ] **Step 1: Update the props type**

In `PropositionCard.tsx`, add to the `PropositionCardProps` type:

```typescript
type PropositionCardProps = {
  // ... existing props ...
  days: CycleDayInput[];        // NEW
  cycleStartDate: Date;         // NEW
};
```

Add the import for `CycleDayInput` if not present:

```typescript
import type { InterpretationResult, PostShiftMonitoring, UserOverrides, CycleDayInput } from '../types';
```

- [ ] **Step 2: Destructure the new props**

In the function signature, add `days` and `cycleStartDate`:

```typescript
export function PropositionCard({
  engineResult, interpretation, postShiftMonitoring,
  changeNotice, keepWatchingDismissed, onKeepWatching, actions,
  cycleIsActive, maxDayNumber,
  onReEvaluate, onMarkAnovulatory, onMarkUninterpretable,
  days, cycleStartDate,    // NEW
}: PropositionCardProps) {
```

- [ ] **Step 3: Forward to AdjustFlow**

Find the AdjustFlow render block (around line 94–105) and replace `days={[]}` with the real prop. Also pass `cycleStartDate`:

```tsx
{adjustFlowOpen && (
  <AdjustFlow
    currentResult={thermalShift}
    days={days}
    cycleStartDate={cycleStartDate}
    existingOverrides={userOverrides ?? undefined}
    onSave={async (overrides) => {
      await actions.adjust(overrides);
      setAdjustFlowOpen(false);
    }}
    onRevert={async () => {
      await actions.revert();
      setAdjustFlowOpen(false);
    }}
    onCancel={() => setAdjustFlowOpen(false)}
  />
)}
```

(`onRevert` is new; AdjustFlow rewrite in next task adds it. The `actions.revert` callback was added to useInterpretation in Task 8.)

- [ ] **Step 4: Verify TypeScript**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "PropositionCard\|CycleChartPage" | grep -v "wasp/"
```

Expected: errors will remain in AdjustFlow about missing `cycleStartDate` and `onRevert` — fixed in Task 11.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
git commit -m "feat(interpretation): PropositionCard forwards days and cycleStartDate

Threads raw cycle data and start date through to AdjustFlow, replacing
the days={[]} placeholder. Also wires onRevert callback."
```

---

## Task 11: AdjustFlow.tsx full rewrite

The big one. New shift-day-only modal with live validation, reference-temps card, confirming-temps card, soft-warning banner, and revert button.

**Files:**
- Modify (full rewrite): `app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx`

- [ ] **Step 1: Replace the entire file contents**

```tsx
// app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx
import { useState, useMemo } from 'react';
import type { ThermalShiftResult, UserOverrides, CycleDayInput } from '../types';
import { btn, card, header, footer } from './cardStyles';
import { validateAdjustment, type AdjustValidation } from '../sensiplan/validateAdjustment';
import { fahrenheitToCelsius } from '../../utils';

type AdjustFlowProps = {
  currentResult: ThermalShiftResult;
  days: CycleDayInput[];
  cycleStartDate: Date;
  existingOverrides?: UserOverrides;
  onSave: (overrides: UserOverrides) => Promise<void>;
  onRevert: () => Promise<void>;
  onCancel: () => void;
};

function dateForDayNumber(start: Date, dayNumber: number): Date {
  const d = new Date(start);
  d.setDate(start.getDate() + (dayNumber - 1));
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function tempC(day: CycleDayInput): number | null {
  return day.bbt === null ? null : fahrenheitToCelsius(day.bbt);
}

function reasonMessage(v: Extract<AdjustValidation, { kind: 'invalid' }>, pickedDay: number): string {
  switch (v.reason) {
    case 'picked_day_no_temp':
      return `Day ${pickedDay} has no temperature recorded — it can't be the shift day.`;
    case 'picked_day_excluded':
      return `Day ${pickedDay} is marked excluded from interpretation. Un-exclude it first, or pick another day.`;
    case 'insufficient_lows':
      return `Sensiplan needs 6 valid low temps before the shift day. You have ${v.validLowsCount ?? '?'} (${v.missingDaysCount ?? 0} missing, ${v.excludedDaysCount ?? 0} excluded). Pick a later shift day, or add/un-exclude earlier temps.`;
    case 'not_above_coverline':
      return `Day ${pickedDay}'s temp isn't higher than the coverline. Sensiplan defines the shift as the *first temp above the coverline*. Pick a different day.`;
    case 'earlier_valid_shift_exists':
      return `Cycle Path detects a Sensiplan-valid shift earlier, at Day ${v.earlierShiftDay}. The thermal shift must be the *first* day where the 3-over-6 rule holds. To pick Day ${pickedDay} (later), mark the earlier confirming temps as excluded if you believe they were disturbed.`;
    case 'rule_broken':
      return `Day ${v.failedOnDay}'s temp dropped to/below the coverline, breaking the 3-consecutive-highs rule. This day can't be the shift under Sensiplan.`;
    case 'fourth_day_failed':
      return `Sensiplan requires the 3rd higher temp to reach coverline +0.2 °C, or a 4th consecutive higher temp. Neither holds for Day ${pickedDay}.`;
  }
}

export function AdjustFlow({
  currentResult, days, cycleStartDate, existingOverrides,
  onSave, onRevert, onCancel,
}: AdjustFlowProps) {
  const enginePick = currentResult.status !== 'none' ? currentResult.shiftDay : null;
  const defaultShiftDay = existingOverrides?.shiftDay ?? enginePick ?? 1;
  const [shiftDay, setShiftDay] = useState(defaultShiftDay);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(
    () => validateAdjustment(days, shiftDay),
    [days, shiftDay],
  );

  const canSave = validation.kind === 'valid' && !saving;
  const userDiffersFromEngine = enginePick !== null && shiftDay !== enginePick;
  // P1.A fix: Revert is only meaningful when there's a SAVED adjustment to revert.
  // Don't show the button just because the unsaved picker disagrees with the engine.
  // Otherwise opening AdjustFlow from a CONFIRMED card and experimenting with the
  // picker would let the user demote a persisted CONFIRMED row to SUGGESTED.
  const hasSavedAdjustment = existingOverrides?.shiftDay != null;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ shiftDay });
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    setSaving(true);
    try {
      await onRevert();
    } finally {
      setSaving(false);
    }
  };

  const dayMap = useMemo(() => {
    const m = new Map<number, CycleDayInput>();
    for (const d of days) m.set(d.dayNumber, d);
    return m;
  }, [days]);

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <span className="font-semibold text-sm text-violet-700">Adjust Thermal Shift Day</span>
        <p className="text-xs text-gray-500 mt-1">
          Pick the day of the first higher temperature. The coverline is calculated automatically from the 6 preceding low temps (Sensiplan rule).
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Section 1 — Shift day picker */}
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Shift day</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={shiftDay}
              onChange={(e) => setShiftDay(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-md border-2 border-violet-500 bg-violet-50 font-medium text-sm"
            />
            {enginePick !== null && (
              <span className="text-xs text-gray-500">Cycle Path suggests Day {enginePick}.</span>
            )}
          </div>
          {hasSavedAdjustment && (
            <button
              onClick={handleRevert}
              disabled={saving}
              className="text-xs text-violet-600 underline mt-2 disabled:opacity-50"
            >
              Revert to Cycle Path's suggestion
            </button>
          )}
        </div>

        {/* Section 2 — Validity panel */}
        {validation.kind === 'valid' && validation.status === 'confirmed' && (
          <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            ✓ <strong>Sensiplan thermal shift confirmed.</strong> Day {shiftDay} is the first higher temp. 3 confirming temps satisfy the rule.
          </div>
        )}
        {validation.kind === 'valid' && validation.status === 'pending' && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
            ⏳ <strong>Awaiting more temperatures.</strong> Day {shiftDay} is above the coverline.{' '}
            {(() => {
              // P3 fix: validation.confirmingDays already includes the picked shift day,
              // so 3 - length is the correct "more highs needed" count for the simple
              // 3-over-6 path. (4-day exception adds at most 1 more if 3rd doesn't clear,
              // which is fine — the message stays accurate as a minimum.)
              const remaining = Math.max(0, 3 - validation.confirmingDays.length);
              return remaining === 0
                ? 'Awaiting either a clearance to coverline +0.2 °C or a 4th consecutive high.'
                : `Need ${remaining} more high temp${remaining === 1 ? '' : 's'} to confirm (3rd must reach coverline +0.2 °C, or a 4th consecutive high temp confirms).`;
            })()}
            <p className="mt-1 italic text-xs">You can save this adjustment now — it'll finalize once more data is recorded.</p>
          </div>
        )}
        {validation.kind === 'invalid' && (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
            ✗ <strong>Not a valid Sensiplan shift.</strong>
            <p className="mt-1">{reasonMessage(validation, shiftDay)}</p>
          </div>
        )}

        {/* Section 2.5 — Soft warning for early shifts */}
        {validation.kind === 'valid' && validation.softWarning === 'early_shift' && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-300 text-xs text-amber-900">
            ⚠ <strong>Early shift — reference temps may include menstrual days.</strong> Sensiplan recommends the 6 reference temps come from the post-menstrual low phase. With a shift this early, your reference may include early-cycle days that carry leftover heat from your previous luteal phase. You can still save this — just review the reference temps below carefully.
          </div>
        )}

        {/* Section 3 — Reference temps card (only when validation has reference data) */}
        {validation.kind === 'valid' && (
          <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
            <div className="text-xs font-semibold text-gray-700 mb-2">6 preceding low temps (reference)</div>
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-left font-normal">Cycle day</th>
                  <th className="text-left font-normal">Temp</th>
                  <th className="text-left font-normal">Note</th>
                </tr>
              </thead>
              <tbody>
                {[...validation.referenceDays, ...validation.skippedDays]
                  .sort((a, b) => a - b)
                  .map((dayNum) => {
                    const d = dayMap.get(dayNum);
                    if (!d) return null;
                    const isReference = validation.referenceDays.includes(dayNum);
                    const tC = tempC(d);
                    const isCoverline = isReference && tC === validation.coverlineTemp;
                    return (
                      <tr key={dayNum} className={isReference ? '' : 'text-gray-400 line-through'}>
                        <td>{formatDate(dateForDayNumber(cycleStartDate, dayNum))}</td>
                        <td>Day {dayNum}</td>
                        <td>{tC === null ? '—' : `${tC.toFixed(2)} °C`}</td>
                        <td>
                          {!isReference && (d.excludeFromInterpretation ? 'excluded — skipped' : tC === null ? 'missing — skipped' : '')}
                          {isCoverline && <strong className="text-violet-700">← Coverline</strong>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* Section 4 — Confirming temps card (only when validation is valid) */}
        {validation.kind === 'valid' && (
          <div className="p-3 rounded-md bg-violet-50 border border-violet-200">
            <div className="text-xs font-semibold text-violet-700 mb-2">Confirming temps</div>
            <table className="text-xs w-full">
              <thead>
                <tr className="text-violet-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-left font-normal">Cycle day</th>
                  <th className="text-left font-normal">Temp</th>
                  <th className="text-left font-normal">Above</th>
                  <th className="text-left font-normal">Note</th>
                </tr>
              </thead>
              <tbody>
                {validation.confirmingDays.map((dayNum, idx) => {
                  const d = dayMap.get(dayNum);
                  if (!d) return null;
                  const tC = tempC(d);
                  if (tC === null) return null;
                  const above = tC - validation.coverlineTemp;
                  const isShift = idx === 0;
                  const isThird = idx === 2;
                  return (
                    <tr key={dayNum}>
                      <td>{formatDate(dateForDayNumber(cycleStartDate, dayNum))}</td>
                      <td>Day {dayNum}</td>
                      <td>{tC.toFixed(2)} °C</td>
                      <td>+{above.toFixed(2)} °C</td>
                      <td>
                        {isShift && <strong>1st higher (shift day)</strong>}
                        {idx === 1 && '2nd higher'}
                        {isThird && !validation.usedFourthDayException && (
                          above >= 0.2
                            ? <span className="text-emerald-700">3rd higher — clears +0.2 ✓</span>
                            : '3rd higher'
                        )}
                        {idx === 3 && validation.usedFourthDayException && (
                          <span className="text-emerald-700">4th-day exception ✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Section 5 — Engine comparison strip */}
        {userDiffersFromEngine && validation.kind === 'valid' && enginePick !== null && currentResult.status !== 'none' && (
          <div className="p-2 bg-violet-50 rounded-md text-xs text-violet-700 border border-violet-200">
            Cycle Path suggests Day {enginePick} (coverline {currentResult.coverlineTemp.toFixed(2)} °C). You're picking Day {shiftDay} (coverline {validation.coverlineTemp.toFixed(2)} °C).
          </div>
        )}
      </div>

      <div className={`${footer.base} bg-violet-50 border-violet-200`}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`${btn.base} ${btn.saveAdjust} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? 'Saving...' : 'Save Adjustment'}
        </button>
        <button onClick={onCancel} className={`${btn.base} ${btn.secondary}`}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "AdjustFlow\|PropositionCard" | grep -v "wasp/"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx
git commit -m "feat(adjust-flow): rewrite modal as shift-day picker with live validation

- Drops coverline input — coverline is now derived from raw days.
- Live validation via validateAdjustment as user changes shift day.
- Validity panel: confirmed (green), pending (amber), invalid (red).
- Reference-temps and confirming-temps tables show the 6 lows and
  3-4 highs with exact dates, cycle days, °C values, and which row
  represents the coverline.
- Soft warning for early shifts (pickedShiftDay <= 7).
- Revert button visible only when there's a saved adjustment to revert
  (existingOverrides?.shiftDay != null), preventing accidental demotion
  of CONFIRMED rows when user just experiments with the picker.
- Save disabled when validation is invalid (strict policy)."
```

---

## Task 12: UserAdjustedCard — drop coverlineTemp comparison; use derived coverline

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx`

- [ ] **Step 1: Update the component**

Replace the file contents:

```tsx
// app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx
import type { ThermalShiftConfirmed, ThermalShiftPending, UserOverrides, CycleDayInput } from '../types';
import { card, header, footer, btn } from './cardStyles';
import { collectReferenceDays } from '../sensiplan/excludedDays';

type Props = {
  result: ThermalShiftConfirmed | ThermalShiftPending;
  userOverrides: UserOverrides;
  days: CycleDayInput[];
  onAdjust: () => void;
  onReject: () => Promise<void>;
};

export function UserAdjustedCard({ result, userOverrides, days, onAdjust, onReject }: Props) {
  const activeShiftDay = userOverrides.shiftDay ?? result.shiftDay;
  const ref = collectReferenceDays(days, activeShiftDay);
  const activeCoverline = ref?.coverlineTemp ?? result.coverlineTemp;
  const isPending = result.status === 'pending';

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-600" />
          <span className="font-semibold text-sm">
            Thermal Shift — Adjusted{isPending ? ' (awaiting confirmation)' : ''}
          </span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-2 leading-relaxed">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span className="text-gray-500">Shift day:</span>
          <span className="font-medium">
            Day {activeShiftDay}
            {userOverrides.shiftDay && userOverrides.shiftDay !== result.shiftDay && (
              <span className="text-gray-400 text-xs ml-1">(Cycle Path suggested Day {result.shiftDay})</span>
            )}
          </span>
          <span className="text-gray-500">Coverline:</span>
          <span className="font-medium">{activeCoverline.toFixed(2)}°C</span>
        </div>
        <div className="text-xs text-amber-600 italic mt-2">
          ✎ You adjusted this interpretation
          {isPending && <span> — awaiting more temperatures to confirm.</span>}
        </div>
      </div>
      <div className={`${footer.base} bg-amber-50 border-amber-200`}>
        <button onClick={onAdjust} className={`${btn.base} ${btn.adjust}`}>Re-Adjust</button>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update PropositionCard to pass days to UserAdjustedCard**

In `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx`, find the `<UserAdjustedCard ... />` render block. Add `days={days}`:

```tsx
{!needsReview && state === 'ADJUSTED' && thermalShift.status !== 'none' && (
  <UserAdjustedCard
    result={thermalShift as any}
    userOverrides={userOverrides!}
    days={days}                            // NEW
    onAdjust={() => setAdjustFlowOpen(true)}
    onReject={actions.dismiss}
  />
)}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "UserAdjustedCard\|PropositionCard" | grep -v "wasp/"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
git commit -m "feat(interpretation): UserAdjustedCard derives coverline from raw days

Drops the engine-vs-user coverline comparison (no longer relevant since
coverline is always derived). Adds 'awaiting confirmation' indicator
for pending shifts."
```

---

## Task 13: KeptShiftCard — drop coverlineTemp display; derive from raw days

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx`

- [ ] **Step 1: Update the component**

Replace the file:

```tsx
// app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx
import type { UserOverrides, CycleDayInput } from '../types';
import { card, header, footer, btn } from './cardStyles';
import { collectReferenceDays } from '../sensiplan/excludedDays';

type Props = {
  userOverrides: UserOverrides;
  days: CycleDayInput[];
  onReject: () => Promise<void>;
};

export function KeptShiftCard({ userOverrides, days, onReject }: Props) {
  const shiftDay = userOverrides.shiftDay;
  const ref = shiftDay != null ? collectReferenceDays(days, shiftDay) : null;
  const coverline = ref?.coverlineTemp ?? null;

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-600" />
          <span className="font-semibold text-sm">Thermal Shift — Your Interpretation</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <div className="p-3 bg-amber-50 rounded-md border border-amber-200 text-xs text-amber-800">
          ℹ️ Cycle Path no longer detects a thermal shift with the current data. Your interpretation is preserved.
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {shiftDay != null && (
            <>
              <span className="text-gray-500">Shift day:</span>
              <span className="font-medium">Day {shiftDay}</span>
            </>
          )}
          {coverline != null && (
            <>
              <span className="text-gray-500">Coverline:</span>
              <span className="font-medium">{coverline.toFixed(2)}°C</span>
            </>
          )}
        </div>
        <div className="text-xs text-amber-600 italic">
          ✎ You adjusted this interpretation. To undo, click Reject.
        </div>
      </div>
      <div className={`${footer.base} bg-amber-50 border-amber-200`}>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update PropositionCard to pass days; remove unused onAdjust prop**

In `PropositionCard.tsx`, find the `<KeptShiftCard ... />` render and update:

```tsx
{!needsReview && state === 'ADJUSTED' && thermalShift.status === 'none' && userOverrides && (
  <KeptShiftCard
    userOverrides={userOverrides}
    days={days}                          // NEW
    onReject={actions.dismiss}
  />
)}
```

(Remove the `onAdjust={actions.adjust}` line — KeptShiftCard no longer accepts it.)

- [ ] **Step 3: Verify TypeScript**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "KeptShiftCard\|PropositionCard" | grep -v "wasp/"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
git commit -m "feat(interpretation): KeptShiftCard derives coverline from raw days

Drops dead onAdjust prop (KeptShiftCard never rendered an Adjust button).
Coverline is now recomputed from userOverrides.shiftDay + raw days, so
the card displays correctly even though engine.status='none'."
```

---

## Task 14: Final TypeScript sweep + interpretation test sweep

Make sure no dangling `userOverrides.coverlineTemp` reads remain anywhere in the codebase.

- [ ] **Step 1: Search for stale references**

```bash
cd app
grep -rn "coverlineTemp" src/cycle-tracking --include="*.ts" --include="*.tsx" | grep -v "test\|engineResult\|ThermalShift\|coverlineTemp:"
```

Expected: any remaining hits should be either (a) reading `engineResult.coverlineTemp` (legitimate), (b) part of a type definition (legitimate), or (c) in a test file. If any UI/hook code still reads `userOverrides.coverlineTemp` outside of the silent-ignore pattern, fix it.

- [ ] **Step 2: Full TypeScript check on cycle-tracking module**

```bash
cd app
npx tsc --noEmit -p . 2>&1 | grep "cycle-tracking" | grep -v "wasp/"
```

Expected: no output (no errors).

- [ ] **Step 3: Run all interpretation tests**

```bash
cd app
npx vitest run src/cycle-tracking/interpretation/__tests__
```

Expected: all tests pass, including the new 17+9+7 = 33 unit tests added in this plan, plus all pre-existing tests.

- [ ] **Step 4: Commit if any cleanup was needed**

```bash
git add -A
git diff --cached --stat
git commit -m "chore(interpretation): final cleanup pass for AdjustFlow v2"
```

(Skip the commit if the diff is empty.)

---

## Task 15: Manual UI verification checklist

The wasp dev server is broken in this env (missing `.wasp/out/db/`), so this task is a checklist for the human to run after `wasp clean && wasp start` in a working environment.

- [ ] **Verify each scenario by hand:**

| Scenario | Expected behavior |
|---|---|
| Open a cycle where Cycle Path detects a confirmed shift; click "Adjust" on ConfirmedCard | AdjustFlow opens with shiftDay = engine's pick. Reference and confirming temp cards visible. |
| Change the shift day to an earlier day with valid 3-over-6 | Validity panel turns green. Coverline updates live. Save enabled. |
| Change the shift day to a later day where engine has already confirmed an earlier shift | Validity panel turns red with "earlier valid shift exists" message. Save disabled. |
| Change the shift day to a day with insufficient lows (e.g., Day 4) | Red panel with "<6 valid low temps" message. Save disabled. |
| Change to a day with no temperature recorded | Red panel with "no temperature recorded". Save disabled. |
| Change to a day that's excluded | Red panel with "excluded from interpretation". Save disabled. |
| Pick a confirmed shift day ≤ 7 | Green panel + amber "early shift" warning banner. Save enabled. |
| Pick a pending shift (not enough confirming temps recorded yet) | Amber pending panel. Save enabled. Confirm by saving and verifying state=ADJUSTED with pending status indicator. |
| Click "Revert to Cycle Path's suggestion" | Modal closes. State demoted to SUGGESTED; engine's suggestion shown again. |
| Adjust a cycle, then edit a low temperature in the cycle so user's derived coverline changes (e.g., raise an early temp) | NeedsReviewCard appears with the user's pick possibly invalidated. |
| Adjust a cycle (state ADJUSTED), then add later temps that confirm the engine's same shift day (pending → confirmed) | No review prompt. State stays ADJUSTED, post-shift monitoring continues silently. |
| Cycle reaches KeptShiftCard state (engine='none', state=ADJUSTED) | No Adjust button visible. Coverline displayed correctly (derived from user's shift day). Reject is the only undo. |
| Cycle chart shows correct coverline for ADJUSTED state | Coverline line on the chart matches the derived coverline (not the engine's). |

- [ ] **Verify revertInterpretation server-side preconditions (curl/devtools or DB-direct):**

The UI gates the revert button to ADJUSTED-with-saved-override state. The server adds defense in depth. Verify by hand or with the network tab in devtools:

| Scenario | Expected response |
|---|---|
| Call `revertInterpretation` with an ID for a row in state SUGGESTED | 409 Conflict. Row unchanged. |
| Call `revertInterpretation` with an ID for a row in state CONFIRMED | 409 Conflict. Row unchanged. (Critical: this would otherwise cause data loss for confirmed interpretations.) |
| Call `revertInterpretation` with an ID for a row in state DISMISSED | 409 Conflict. Row unchanged. |
| Call `revertInterpretation` with an ID for a row in state ADJUSTED but `userOverrides.shiftDay = null` | 409 Conflict. Row unchanged. |
| Call `revertInterpretation` with an ID for a row in state ADJUSTED with `userOverrides.shiftDay = 14`, engine.status non-none | 200 OK. Row state demoted to SUGGESTED, userOverrides cleared. |
| Call `revertInterpretation` with an ID for a row in state ADJUSTED with `userOverrides.shiftDay = 14`, engine.status='none' | 200 OK. Row deleted entirely. |
| Call `revertInterpretation` with someone else's interpretationId | 403 Forbidden (existing ownership check). |
| Call `revertInterpretation` with a non-existent interpretationId | 404 Not Found (existing ownership check). |

- [ ] **If all scenarios pass, no further commit needed. If bugs found, file separate fix tickets per scenario.**

---

## Self-review notes

Done after writing. Spec coverage check: every spec section maps to a task. P1.A and P1.B fixes have explicit task lines (Task 1 step 13–17 covers earlier-valid-shift; Task 5 step 3 covers defensive revert). P2.2 fixes are in Task 9 (chart) and Task 8 (hook). P1.1 + P1.2 fixes are in Task 6.

Type consistency: `validateAdjustment` returns `AdjustValidation` discriminated union with `kind: 'valid' | 'invalid'`. Used consistently in Tasks 1, 3, 11. Property names match across tasks: `coverlineTemp`, `referenceDays`, `confirmingDays`, `softWarning`.

No placeholders.
