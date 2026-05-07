# Celsius Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the canonical unit of `CycleDay.bbt` from Fahrenheit to Celsius so the rule engine works in the unit Sensiplan was built for. Fahrenheit becomes a display view, applied only at input parsing and output formatting.

**Architecture:** A single shared helper (`toDisplayTemperature`) replaces ad-hoc `unit === 'CELSIUS' ? fahrenheitToCelsius(bbt) : bbt` ternaries. The rule engine reads `bbt` as raw Celsius float, no conversion. All three BBT writers (`AddCycleDayPage`, `NewCyclePage`, CSV import) route through `convertToCelsiusForStorage`. The form preserves the raw stored float when the user does not edit BBT (preventing silent precision loss via `.toFixed(2)` round-trip). The fingerprint hashes raw floats with no rounding so that any engine-meaningful edit invalidates dismissed interpretations.

**Tech Stack:** Wasp 0.19, Prisma + Postgres, React + TypeScript (`strict: true`), Tailwind, ApexCharts, vitest. Tests run with `npm test` from the `app/` directory.

**Source spec:** [`../specs/2026-05-05-celsius-storage-migration-design.md`](../specs/2026-05-05-celsius-storage-migration-design.md) — re-read before starting; it explains every "why".

**Convention:** Work from the `app/` directory for `npm test`, `wasp db migrate-dev`, `wasp start`. Commit after every green task. Conventional commit prefixes follow this repo's history (`feat`, `refactor`, `chore`, `docs`, `test`).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/schema.prisma` | modify | Document `bbt` as Celsius (comment only — column unchanged) |
| `app/src/cycle-tracking/utils.ts` | modify | Rename + reverse `convertToFahrenheitForStorage`; reverse `formatTemperature`; add `toDisplayTemperature` |
| `app/src/cycle-tracking/__tests__/utils.celsius.test.ts` | create | Unit tests for the three modified/new helpers |
| `app/src/cycle-tracking/interpretation/types.ts` | modify | JSDoc on `CycleDayInput.bbt` flipped from "Fahrenheit" to "Celsius" |
| `app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts` | modify | Remove `fahrenheitToCelsius()` calls (lines 43, 134) |
| `app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts` | modify | Remove `fahrenheitToCelsius()` (line 55) |
| `app/src/cycle-tracking/interpretation/sensiplan/postShiftMonitoring.ts` | modify | Remove `fahrenheitToCelsius()` (line 45) |
| `app/src/cycle-tracking/interpretation/sensiplan/nudges.ts` | modify | Remove `fahrenheitToCelsius()` (lines 31, 71, 104, 114) |
| `app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts` | modify | Remove `fahrenheitToCelsius()` (lines 116, 183) |
| `app/src/cycle-tracking/interpretation/getActiveCoverline.ts` | modify | Remove `fahrenheitToCelsius()` in `collectReferenceDays` |
| `app/src/cycle-tracking/interpretation/getChartAnnotations.ts` | modify | Remove `fahrenheitToCelsius()` (line 32) |
| `app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx` | modify | Remove `fahrenheitToCelsius()` in the `tempC` accessor (line 29) |
| `app/src/cycle-tracking/interpretation/dataFingerprint.ts` | modify | Drop BBT rounding — hash raw float |
| `app/src/cycle-tracking/interpretation/__tests__/*.test.ts` | modify | Convert all fixture values to Celsius |
| `app/src/cycle-tracking/AddCycleDayPage.tsx` | modify | Submit handler with no-op preservation + clear-on-empty; prefill via `toDisplayTemperature` |
| `app/src/cycle-tracking/__tests__/AddCycleDayPage.celsius.test.tsx` | create | Form-behaviour regression tests |
| `app/src/cycle-tracking/NewCyclePage.tsx` | modify | Switch BBT submit to `convertToCelsiusForStorage(parseFloat(bbt), tempUnit)` |
| `app/src/cycle-tracking/operations.ts` | modify | Widen `bbt?: number` → `bbt?: number \| null` in `createOrUpdateCycleDay` args; CSV import path uses `convertToCelsiusForStorage` |
| `app/src/cycle-tracking/CycleChartPage.tsx` | modify | Six chart math sites + tooltip route through `toDisplayTemperature` / `toDisplayTemperature(...).toFixed(2)` |
| `app/src/cycle-tracking/CycleDaysPage.tsx` | modify | Replace `${day.bbt.toFixed(2)}°F` fallback with `formatTemperature(day.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT')` |
| `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx` | modify | Annotation Y position via `toDisplayTemperature` |

---

## Task 1: Add `toDisplayTemperature` helper to `utils.ts` (TDD, additive)

This task adds a new export only. No existing behaviour changes. Tests pass without touching anything else.

**Files:**
- Create: `app/src/cycle-tracking/__tests__/utils.celsius.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Write the failing test for `toDisplayTemperature`**

Create `app/src/cycle-tracking/__tests__/utils.celsius.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDisplayTemperature } from '../utils';

describe('toDisplayTemperature', () => {
  it('returns the Celsius value unchanged when unit is CELSIUS', () => {
    expect(toDisplayTemperature(36.5, 'CELSIUS')).toBe(36.5);
  });

  it('converts Celsius to Fahrenheit when unit is FAHRENHEIT', () => {
    // 36.5 °C = 97.7 °F
    expect(toDisplayTemperature(36.5, 'FAHRENHEIT')).toBeCloseTo(97.7, 10);
  });

  it('converts at full float precision (no rounding)', () => {
    // 36.6996 °C = 97.85928 °F
    const result = toDisplayTemperature(36.6996, 'FAHRENHEIT');
    expect(result).toBeCloseTo(97.85928, 10);
  });

  it('returns null for null input', () => {
    expect(toDisplayTemperature(null, 'CELSIUS')).toBeNull();
    expect(toDisplayTemperature(null, 'FAHRENHEIT')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toDisplayTemperature(undefined, 'CELSIUS')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/utils.celsius.test.ts
```

Expected: FAIL with `toDisplayTemperature is not exported from '../utils'` or similar import error.

- [ ] **Step 3: Implement `toDisplayTemperature` with explicit overloads**

Append to `app/src/cycle-tracking/utils.ts`:

```ts
/**
 * Convert a stored canonical-Celsius temperature to the user's preferred display unit.
 * Returns a raw number (no rounding) suitable for plotting, interpolation, and
 * positioning math. For human-readable strings with unit suffix, use formatTemperature.
 */
export function toDisplayTemperature(
  celsiusValue: number,
  unit: TemperatureUnit
): number;
export function toDisplayTemperature(
  celsiusValue: number | null | undefined,
  unit: TemperatureUnit
): number | null;
export function toDisplayTemperature(
  celsiusValue: number | null | undefined,
  unit: TemperatureUnit
): number | null {
  if (celsiusValue == null) return null;
  return unit === 'CELSIUS' ? celsiusValue : celsiusToFahrenheit(celsiusValue);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/utils.celsius.test.ts
```

Expected: PASS, all five cases.

- [ ] **Step 5: Run full test suite**

```bash
cd app
npm test
```

Expected: PASS (no regressions; the new helper has no callers yet).

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/utils.celsius.test.ts
git commit -m "feat(utils): add toDisplayTemperature helper for canonical-C → display-unit conversion"
```

---

## Task 2: Reverse `convertToFahrenheitForStorage` → `convertToCelsiusForStorage` (TDD)

The helper renames and the conversion direction reverses. Today: parses user input, converts to F, returns F. After: parses user input, converts to C, returns C. The existing call site in `AddCycleDayPage.tsx` is updated as part of this task to keep types consistent.

**Files:**
- Modify: `app/src/cycle-tracking/utils.ts`
- Modify: `app/src/cycle-tracking/__tests__/utils.celsius.test.ts`
- Modify: `app/src/cycle-tracking/AddCycleDayPage.tsx`

- [ ] **Step 1: Add a failing test for the new helper**

Append to `app/src/cycle-tracking/__tests__/utils.celsius.test.ts`:

```ts
import { convertToCelsiusForStorage } from '../utils';

describe('convertToCelsiusForStorage', () => {
  it('returns Celsius input unchanged', () => {
    expect(convertToCelsiusForStorage(36.5, 'CELSIUS')).toBe(36.5);
  });

  it('converts Fahrenheit input to Celsius at full precision', () => {
    // 97.7 °F = (97.7 - 32) * 5/9 = 36.5 °C exactly
    expect(convertToCelsiusForStorage(97.7, 'FAHRENHEIT')).toBeCloseTo(36.5, 10);
  });

  it('does not round the result', () => {
    // 97.97 °F → 36.65 °C exactly, but 97.55 °F → 36.41666… °C
    const result = convertToCelsiusForStorage(97.55, 'FAHRENHEIT');
    expect(result).toBeCloseTo(36.41666666, 6);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/utils.celsius.test.ts
```

Expected: FAIL with import error on `convertToCelsiusForStorage`.

- [ ] **Step 3: Rename and reverse the helper in `utils.ts`**

In `app/src/cycle-tracking/utils.ts`, replace the existing `convertToFahrenheitForStorage` function:

```ts
/**
 * Convert temperature to Celsius for storage (canonical unit).
 * If the user entered the value in Fahrenheit, convert at full float precision.
 * No rounding — the engine consumes the raw float.
 */
export function convertToCelsiusForStorage(temp: number, inputUnit: TemperatureUnit): number {
  if (inputUnit === 'FAHRENHEIT') {
    return fahrenheitToCelsius(temp);
  }
  return temp;
}
```

Delete the old `convertToFahrenheitForStorage` function entirely.

- [ ] **Step 4: Update the import and call site in `AddCycleDayPage.tsx`**

In `app/src/cycle-tracking/AddCycleDayPage.tsx` around line 11, change the import:

```ts
import { formatDateForInput, convertToCelsiusForStorage, fahrenheitToCelsius, formatTemperature } from './utils';
```

Around line ~99–101, change the submit conversion:

```ts
const bbtValue = bbt ? parseFloat(bbt) : undefined;
const bbtForStorage = bbtValue !== undefined && settings
  ? convertToCelsiusForStorage(bbtValue, settings.temperatureUnit)
  : bbtValue;
```

And rename the field passed to the operation from `bbtInFahrenheit` to `bbtForStorage`. (We will refine this submit handler further in Task 9 — for now, just keep it compiling and writing the right unit.)

- [ ] **Step 5: Run the unit tests for the helper**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/utils.celsius.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full test suite and the type checker**

```bash
cd app
npm test
npx tsc --noEmit
```

Expected: tests PASS (engine tests still pass because they construct `CycleDayInput` directly without going through the form). `tsc` PASSES (no implicit any, no missing types).

> Note: After this task, **the running app is in an inconsistent state** — the form now writes Celsius but the engine still treats `bbt` as Fahrenheit. This is fine for an in-progress branch; do not run `wasp start` against the dev DB until Task 5 lands.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/utils.celsius.test.ts app/src/cycle-tracking/AddCycleDayPage.tsx
git commit -m "refactor(utils): rename + reverse storage helper to convertToCelsiusForStorage"
```

---

## Task 3: Reverse `formatTemperature` to take Celsius input (TDD)

`formatTemperature` today receives Fahrenheit and outputs `XX.XX°C` or `XX.XX°F`. After: it receives Celsius and emits the same shape. Display callers will be updated in subsequent tasks.

**Files:**
- Modify: `app/src/cycle-tracking/utils.ts`
- Modify: `app/src/cycle-tracking/__tests__/utils.celsius.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `utils.celsius.test.ts`:

```ts
import { formatTemperature } from '../utils';

describe('formatTemperature (Celsius input)', () => {
  it('formats Celsius values directly', () => {
    expect(formatTemperature(36.5, 'CELSIUS')).toBe('36.50°C');
  });

  it('converts Celsius to Fahrenheit at display time', () => {
    // 36.5 °C = 97.7 °F
    expect(formatTemperature(36.5, 'FAHRENHEIT')).toBe('97.70°F');
  });

  it('rounds to two decimal places at the boundary, not before', () => {
    // 36.6996 °C → 36.70 °C / 98.06 °F (display rounding only)
    expect(formatTemperature(36.6996, 'CELSIUS')).toBe('36.70°C');
    expect(formatTemperature(36.6996, 'FAHRENHEIT')).toBe('98.06°F');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/utils.celsius.test.ts
```

Expected: FAIL — current `formatTemperature` interprets `36.5` as Fahrenheit.

- [ ] **Step 3: Reverse the helper in `utils.ts`**

Replace the existing `formatTemperature`:

```ts
/**
 * Format a canonical-Celsius temperature for display.
 * Takes a Celsius value and renders it in the user's preferred unit with a unit suffix.
 * Display rounding only — engine logic uses raw values.
 */
export function formatTemperature(celsiusValue: number, unit: TemperatureUnit): string {
  if (unit === 'FAHRENHEIT') {
    const fahrenheit = celsiusToFahrenheit(celsiusValue);
    return `${fahrenheit.toFixed(2)}°F`;
  }
  return `${celsiusValue.toFixed(2)}°C`;
}
```

- [ ] **Step 4: Run the unit tests**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/utils.celsius.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd app
npm test
```

Expected: existing display callers (`CycleDaysPage.tsx`, `AddCycleDayPage.tsx` line ~581) now render the *wrong* values until they're updated to pass Celsius. **Some tests may fail** at this point — that is expected; the chart/table tests do not exist as a unit test suite, so likely the `tsc` and unit tests still pass. Verify:

```bash
npx tsc --noEmit
```

Expected: PASS.

> Note: callers of `formatTemperature` still pass `day.bbt` (which is Fahrenheit until Task 5) — display will render visually wrong in dev until then. Don't worry; it's repaired by Task 5 + Task 9–11.

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/utils.celsius.test.ts
git commit -m "refactor(utils): reverse formatTemperature to take canonical Celsius input"
```

---

## Task 4: Schema and types comment update

A comment-only change to the source of truth on the canonical unit. Prepares the diff that future readers see.

**Files:**
- Modify: `app/schema.prisma`
- Modify: `app/src/cycle-tracking/interpretation/types.ts`

- [ ] **Step 1: Update `app/schema.prisma`**

Find the `CycleDay` model (~line 193) and add a triple-slash comment above the `bbt` field:

```prisma
model CycleDay {
  // ... existing fields ...
  /// Stored in Celsius (canonical unit). Fahrenheit is only a display view.
  /// See docs/superpowers/specs/2026-05-05-celsius-storage-migration-design.md
  bbt Float?
  // ... rest ...
}
```

The column type and nullability are unchanged; only the comment is added.

- [ ] **Step 2: Update `app/src/cycle-tracking/interpretation/types.ts`**

Find the `CycleDayInput` interface around line 8 and update the comment on `bbt`:

```ts
export interface CycleDayInput {
  // ...
  bbt: number | null;             // Celsius (as stored in DB)
  // ...
}
```

(Old comment said `// Fahrenheit (as stored in DB)`.)

- [ ] **Step 3: Run the type checker**

```bash
cd app
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/schema.prisma app/src/cycle-tracking/interpretation/types.ts
git commit -m "docs(schema): document CycleDay.bbt as canonical Celsius"
```

---

## Task 5: Engine layer — flip all eight files together with their tests

This is the load-bearing task. Each engine file currently calls `fahrenheitToCelsius()` at the start of every BBT-related operation; we remove those and treat `bbt` as Celsius directly. Test fixtures that encode Fahrenheit values are rewritten to Celsius. After this task the engine + engine tests are consistent in Celsius.

**Files:**
- Modify (engine): `interpretation/sensiplan/thermalShift.ts`, `excludedDays.ts`, `postShiftMonitoring.ts`, `nudges.ts`, `validateAdjustment.ts`, `interpretation/getActiveCoverline.ts`, `interpretation/getChartAnnotations.ts`, `interpretation/components/AdjustFlow.tsx`
- Modify (tests with `celsiusToFahrenheit` wrapper — drop the wrapper): `validateAdjustment.test.ts`, `getActiveCoverline.test.ts`, `getChartAnnotations.test.ts`, `adjustReviewTrigger.test.ts`
- Modify (tests with raw F fixtures — rewrite numbers in C): `thermalShift.test.ts`, `excludedDays.test.ts`, `postShiftMonitoring.test.ts`, `integration.test.ts`, `nudges.test.ts`, `measurementTime.test.ts`, `classificationDecisions.test.ts`, `dataFingerprint.test.ts`

- [ ] **Step 1: Remove `fahrenheitToCelsius` from `thermalShift.ts`**

In `app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts`:

- Remove the import of `fahrenheitToCelsius`.
- At line ~43: replace `const candidateTempC = fahrenheitToCelsius(candidateDay.bbt);` with `const candidateTempC = candidateDay.bbt;`.
- At line ~134: replace `const tempC = fahrenheitToCelsius(d.bbt);` with `const tempC = d.bbt;`.
- The constant `THRESHOLD_C = 0.2` stays.
- If `candidateTempC` / `tempC` end up nullable in TS, narrow with the existing `bbt !== null` guards already in scope.

- [ ] **Step 2: Remove `fahrenheitToCelsius` from `getActiveCoverline.ts`**

In `app/src/cycle-tracking/interpretation/getActiveCoverline.ts`:

- Remove the import.
- Inside `collectReferenceDays` where each day's BBT is converted, drop the conversion and use `day.bbt` directly.

- [ ] **Step 3: Remove `fahrenheitToCelsius` from the remaining six engine files**

Apply the same pattern to:

- `interpretation/sensiplan/excludedDays.ts` (line ~55)
- `interpretation/sensiplan/postShiftMonitoring.ts` (line ~45)
- `interpretation/sensiplan/nudges.ts` (lines ~31, 71, 104, 114 — all four)
- `interpretation/sensiplan/validateAdjustment.ts` (lines ~116, 183)
- `interpretation/getChartAnnotations.ts` (line ~32)
- `interpretation/components/AdjustFlow.tsx` (line ~29 — the `tempC` accessor returns `day.bbt` directly)

In each file: drop the `fahrenheitToCelsius` import and replace each `fahrenheitToCelsius(x.bbt)` with `x.bbt`.

- [ ] **Step 4: Verify engine grep gate (narrow)**

```bash
cd app
grep -rn "fahrenheitToCelsius" \
  src/cycle-tracking/interpretation/sensiplan \
  src/cycle-tracking/interpretation/getActiveCoverline.ts \
  src/cycle-tracking/interpretation/getChartAnnotations.ts \
  src/cycle-tracking/interpretation/components/AdjustFlow.tsx
```

Expected: no matches in those engine sources.

> Why narrowed: `interpretation/components/ThermalShiftAnnotations.tsx` is a display-layer site (it does chart Y-position math) and is intentionally still using `fahrenheitToCelsius` until Task 13. Test files under `__tests__/` may also still import the helper — fixture rewrite in this task only changes call sites, not necessarily every leftover import. The full repo-wide grep gate runs in Task 15.

- [ ] **Step 5: Update tests that already author in Celsius via the `celsiusToFahrenheit` wrapper**

In each of:
- `interpretation/__tests__/validateAdjustment.test.ts`
- `interpretation/__tests__/getActiveCoverline.test.ts`
- `interpretation/__tests__/getChartAnnotations.test.ts`
- `interpretation/__tests__/adjustReviewTrigger.test.ts`

Change the `day` factory from:
```ts
bbt: tC === null ? null : celsiusToFahrenheit(tC),
```
to:
```ts
bbt: tC,
```

Drop the now-unused `celsiusToFahrenheit` import. (In `getChartAnnotations.test.ts`, also drop the `fahrenheitToCelsius` import if it becomes unused.)

- [ ] **Step 6: Rewrite raw-F fixtures in Celsius — `thermalShift.test.ts`**

Open `interpretation/__tests__/thermalShift.test.ts`. Every numeric `bbt` value is currently in Fahrenheit (e.g. `97.5`, `97.8`, `98.0`). Convert each to Celsius using `(F − 32) × 5/9` rounded to two decimals, OR replace the fixture sequence with a canonical Sensiplan-handbook sequence. Recommended replacement when the test only checks "is there a confirmed shift" rather than specific values:

| Day type | Use this Celsius value |
|---|---|
| pre-shift baseline | `36.40 – 36.55 °C` (vary across days) |
| shift candidate | `36.70 °C` |
| 3rd reading (must clear threshold) | `36.75 °C` |
| 3rd reading (just under threshold, for false-positive guards) | `36.69 °C` |

Run the file:

```bash
cd app
npm test -- src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts
```

Iterate fixtures until green.

- [ ] **Step 7: Rewrite raw-F fixtures in the seven remaining engine test files**

Repeat the pattern for:
- `excludedDays.test.ts`
- `postShiftMonitoring.test.ts`
- `integration.test.ts`
- `nudges.test.ts`
- `measurementTime.test.ts`
- `classificationDecisions.test.ts`
- `dataFingerprint.test.ts`

Run each individually as you go:
```bash
cd app
npm test -- src/cycle-tracking/interpretation/__tests__/<file>.test.ts
```

- [ ] **Step 8: Run the entire engine test suite**

```bash
cd app
npm test -- src/cycle-tracking/interpretation
```

Expected: all engine tests PASS in Celsius.

- [ ] **Step 9: Run the full test suite and tsc**

```bash
cd app
npm test
npx tsc --noEmit
```

Expected: PASS. Display callers will render visually wrong in dev (until Tasks 9–11), but no test should fail.

- [ ] **Step 10: Commit**

```bash
git add app/src/cycle-tracking/interpretation app/src/cycle-tracking/interpretation/__tests__
git commit -m "refactor(engine): read CycleDay.bbt as canonical Celsius; rewrite fixtures"
```

---

## Task 6: New engine precision-edge regression tests

Three tests in `thermalShift.test.ts` that lock in the threshold behaviour against future changes.

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts`

- [ ] **Step 1: Append the three new tests**

Add a new `describe` block at the end of the file:

```ts
describe('thermalShift — precision-edge guards', () => {
  it('does NOT confirm at 0.199 °C above cover line (false-positive guard)', () => {
    // Cover line 36.50 °C, third reading 36.699 °C → delta 0.199 °C
    const days = [
      day(1, 36.45), day(2, 36.50), day(3, 36.45),
      day(4, 36.40), day(5, 36.50), day(6, 36.45),
      day(7, 36.70), day(8, 36.75), day(9, 36.699),
    ];
    const result = detectThermalShift(days);
    expect(result.status).not.toBe('CONFIRMED');
  });

  it('DOES confirm at exactly 0.200 °C above cover line', () => {
    // Cover line 36.50 °C, third reading 36.700 °C → delta 0.200 °C exactly
    const days = [
      day(1, 36.45), day(2, 36.50), day(3, 36.45),
      day(4, 36.40), day(5, 36.50), day(6, 36.45),
      day(7, 36.70), day(8, 36.75), day(9, 36.700),
    ];
    const result = detectThermalShift(days);
    expect(result.status).toBe('CONFIRMED');
  });

  it('Fahrenheit user input at 97.97°F → 36.65°C delivers 0.15 °C above cover line and does NOT confirm', () => {
    // Simulate the input-pipeline conversion: 97.97 °F → 36.65 °C.
    // With cover line 36.50 °C, delta is 0.15 °C — under threshold.
    const fahrenheitInput = 97.97;
    const candidateC = (fahrenheitInput - 32) * (5 / 9); // == 36.65
    const days = [
      day(1, 36.45), day(2, 36.50), day(3, 36.45),
      day(4, 36.40), day(5, 36.50), day(6, 36.45),
      day(7, 36.70), day(8, 36.75), day(9, candidateC),
    ];
    const result = detectThermalShift(days);
    expect(result.status).not.toBe('CONFIRMED');
  });
});
```

(Adjust the helper `day(...)` and `detectThermalShift` import to whatever the existing test file uses.)

- [ ] **Step 2: Run the file**

```bash
cd app
npm test -- src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts
```

Expected: all three new cases PASS. If they don't, the existing `thermalShift.ts` rule does not match the spec — investigate before proceeding.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts
git commit -m "test(engine): add precision-edge regression tests for 0.2 °C threshold"
```

---

## Task 7: Fingerprint — drop BBT rounding and add multi-pair regression test

The fingerprint must mirror the engine's input. Any rounding step leaves a band of threshold-straddling values that hash-collide. Hash the raw float.

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/dataFingerprint.ts`
- Modify: `app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts`

- [ ] **Step 1: Write the failing regression test**

Append to `interpretation/__tests__/dataFingerprint.test.ts`:

```ts
describe('computeCycleDataFingerprint — threshold-edge precision', () => {
  it('produces different fingerprints for 36.699 vs 36.700', () => {
    const a = [day(1, 36.699)];
    const b = [day(1, 36.700)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces different fingerprints for 36.6996 vs 36.7004 (3-dp would have collapsed)', () => {
    const a = [day(1, 36.6996)];
    const b = [day(1, 36.7004)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces different fingerprints for 36.69999 vs 36.70001 (deep float territory)', () => {
    const a = [day(1, 36.69999)];
    const b = [day(1, 36.70001)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd app
npm test -- src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts
```

Expected: at least the 3-dp case (`36.6996` vs `36.7004`) FAILS — both round to `36.70` under the current `toFixed(2)`.

- [ ] **Step 3: Remove BBT rounding from the fingerprint**

In `app/src/cycle-tracking/interpretation/dataFingerprint.ts`, find the line:

```ts
t: d.bbt !== null ? Number(d.bbt.toFixed(2)) : null,
```

Replace with:

```ts
t: d.bbt,  // raw stored Celsius float, no rounding (mirrors engine input exactly)
```

- [ ] **Step 4: Run the regression test**

```bash
cd app
npm test -- src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts
```

Expected: all three new cases PASS. Existing tests still PASS (raw-float hashing is at least as discriminating as 2-dp).

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/dataFingerprint.ts app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts
git commit -m "fix(fingerprint): hash raw bbt float so threshold-edge edits invalidate dismissals"
```

---

## Task 8: Input writer — `NewCyclePage`

The minor BBT writer; route through the storage helper for consistency.

**Files:**
- Modify: `app/src/cycle-tracking/NewCyclePage.tsx`

- [ ] **Step 1: Update the import**

Around line 11 in `NewCyclePage.tsx`:

```ts
import { formatDateForInput, convertToCelsiusForStorage } from './utils';
```

(Drop `celsiusToFahrenheit` from the import list.)

- [ ] **Step 2: Update the BBT submit conversion**

Around line ~189, replace:

```ts
const bbtInFahrenheit = bbt
  ? (isCelsius ? celsiusToFahrenheit(parseFloat(bbt)) : parseFloat(bbt))
  : undefined;
```

with:

```ts
const bbtForStorage = bbt
  ? convertToCelsiusForStorage(parseFloat(bbt), tempUnit)
  : undefined;
```

And rename the property name in the operation call (around line ~195) from `bbt: bbtInFahrenheit` to `bbt: bbtForStorage`.

> Use the existing local `tempUnit` ([line 38](../../../app/src/cycle-tracking/NewCyclePage.tsx:38) — `settings?.temperatureUnit || 'FAHRENHEIT'`), not `settings.temperatureUnit`. The latter is `possibly 'undefined'` while loading.

- [ ] **Step 3: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run the test suite**

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/NewCyclePage.tsx
git commit -m "refactor(new-cycle): write BBT through convertToCelsiusForStorage"
```

---

## Task 9: AddCycleDayPage — submit handler with no-op preservation, clearing, prefill via toDisplayTemperature

The most behaviour-rich form change. Adds:
- Prefill via `toDisplayTemperature(...).toFixed(2)` (no unit suffix; valid for `<input type="number">`).
- "Capture prefilled string at the moment of prefill" so we can detect a no-op edit on submit.
- Submit handler that:
  - preserves `existingDay.bbt` raw when `bbt === prefilledBbt` and an existingDay exists;
  - sends `null` (not `undefined`) when the user clears the field on an existingDay;
  - parses + converts via `convertToCelsiusForStorage` otherwise.
- Widens the operation's payload type to accept `null`.

**Files:**
- Modify: `app/src/cycle-tracking/AddCycleDayPage.tsx`
- Modify: `app/src/cycle-tracking/operations.ts`

- [ ] **Step 1: Widen the `createOrUpdateCycleDay` args type in `operations.ts`**

Around `operations.ts` line 330, in the type definition for `createOrUpdateCycleDay`:

```ts
type CreateOrUpdateCycleDayArgs = {
  // ...
  bbt?: number | null;   // was: bbt?: number;
  // ...
};
```

The inline `data: { bbt: args.bbt, ... }` literals in the action body (around lines 392 and 412) accept `number | null | undefined` already from Prisma's generated types — no separate change needed once the args type is wider. Verify `npx tsc --noEmit` passes.

- [ ] **Step 2: Add a `prefilledBbt` ref in `AddCycleDayPage.tsx`**

Near the other `useState` declarations, add:

```ts
const [prefilledBbt, setPrefilledBbt] = useState<string>('');
```

- [ ] **Step 3: Update the prefill effect to use `toDisplayTemperature` and capture `prefilledBbt`**

Find the `useEffect` that prefills from `existingDay` (around line 60–75) and replace the BBT block:

```ts
if (existingDay && settings) {
  setDate(formatDateForInput(new Date(existingDay.date)));

  if (existingDay.bbt != null) {
    // Inside this branch existingDay.bbt is `number`, so the non-nullable
    // overload of toDisplayTemperature applies and .toFixed(2) type-checks.
    const display = toDisplayTemperature(existingDay.bbt, settings.temperatureUnit).toFixed(2);
    setBbt(display);
    setPrefilledBbt(display);
  } else {
    setBbt('');
    setPrefilledBbt('');
  }

  // ... rest of prefill (bbtTime, hadIntercourse, etc.) unchanged ...
}
```

Update the import at the top of the file to include `toDisplayTemperature`:

```ts
import { formatDateForInput, convertToCelsiusForStorage, toDisplayTemperature, formatTemperature } from './utils';
```

(Drop `fahrenheitToCelsius` from the import list — no longer used in this file.)

- [ ] **Step 4: Update the submit handler with no-op preservation + clear handling**

In `handleSubmit` (around line 90–115), replace the BBT block:

```ts
const bbtChanged = bbt !== prefilledBbt;
const bbtForStorage: number | null | undefined =
  existingDay && !bbtChanged
    ? existingDay.bbt                                       // preserve raw stored value
    : bbt === ''
      ? (existingDay ? null : undefined)                    // explicit clear vs new-day-no-input
      : convertToCelsiusForStorage(parseFloat(bbt), settings.temperatureUnit);

await createOrUpdateCycleDay({
  cycleId,
  date,
  bbt: bbtForStorage,
  // ... rest unchanged ...
});
```

(Remove the old `bbtValue` / `bbtInFahrenheit` lines from Task 2.)

- [ ] **Step 5: Run the type checker**

```bash
cd app
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Run all tests (sanity)**

```bash
cd app
npm test
```

Expected: PASS — no regressions; new behaviour is exercised by Task 10's tests.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/AddCycleDayPage.tsx app/src/cycle-tracking/operations.ts
git commit -m "feat(add-day): preserve raw bbt on no-op edits; send null on clear; widen payload type"
```

---

## Task 10: AddCycleDayPage — form behaviour regression tests

Four tests covering: no-op preserve (°C user), no-op preserve (°F user), genuine edit reparses, clear persists `null`.

**Files:**
- Create: `app/src/cycle-tracking/__tests__/AddCycleDayPage.celsius.test.tsx`

- [ ] **Step 1: Determine the existing test patterns**

Inspect any existing tests under `app/src/cycle-tracking/__tests__/` that render React components with mocked Wasp operations — that's the pattern to follow. Look for an existing form/page test that mocks `createOrUpdateCycleDay`. Replicate the harness (mock pattern, render helper, etc.) in the new file.

If no existing pattern exists, use the standard React Testing Library + vitest setup with `vi.mock('wasp/client/operations', ...)` to capture the call arguments.

- [ ] **Step 2: Write the four tests**

Create `app/src/cycle-tracking/__tests__/AddCycleDayPage.celsius.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// Adjust imports/mocks to match the codebase's existing test setup.

const createOrUpdateCycleDay = vi.fn();
vi.mock('wasp/client/operations', () => ({
  createOrUpdateCycleDay: (...args: unknown[]) => createOrUpdateCycleDay(...args),
  // ... other ops mocked as identity / no-op ...
}));

describe('AddCycleDayPage — BBT no-op preservation and clearing', () => {
  beforeEach(() => createOrUpdateCycleDay.mockReset());

  it('preserves raw bbt when the BBT input string is unchanged (Celsius user)', async () => {
    // existingDay.bbt = 36.6996; user opens edit, changes only cervical observation, saves.
    // Expect the operation receives bbt: 36.6996 (raw), not 36.7.
    // (Wire the test to render with existingDay = { bbt: 36.6996, ... } and settings = { temperatureUnit: 'CELSIUS' }.)
    // ... setup ...
    fireEvent.change(screen.getByLabelText(/cervical/i), { target: { value: 'creamy' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(createOrUpdateCycleDay).toHaveBeenCalled());
    expect(createOrUpdateCycleDay.mock.calls[0][0]).toMatchObject({ bbt: 36.6996 });
  });

  it('preserves raw bbt when the BBT input string is unchanged (Fahrenheit user)', async () => {
    // existingDay.bbt = 36.65555 (stored Celsius); display in °F = 97.98°F.
    // User saves without touching BBT. Expect raw 36.65555 persists.
    // ... setup with settings = { temperatureUnit: 'FAHRENHEIT' } and existingDay.bbt = 36.65555 ...
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(createOrUpdateCycleDay).toHaveBeenCalled());
    expect(createOrUpdateCycleDay.mock.calls[0][0].bbt).toBeCloseTo(36.65555, 10);
  });

  it('reparses and stores a new value when the user actually edits BBT', async () => {
    // existingDay.bbt = 36.6996; user changes input from "36.70" to "36.85".
    // Expect bbt: 36.85 (freshly converted).
    // ... setup ...
    fireEvent.change(screen.getByLabelText(/bbt/i), { target: { value: '36.85' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(createOrUpdateCycleDay).toHaveBeenCalled());
    expect(createOrUpdateCycleDay.mock.calls[0][0].bbt).toBe(36.85);
  });

  it('persists bbt: null when the user clears the field on an existing day', async () => {
    // existingDay.bbt = 36.50; user clears the input ("") and saves.
    // Expect bbt: null (not undefined — undefined is a Prisma no-op).
    // ... setup ...
    fireEvent.change(screen.getByLabelText(/bbt/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(createOrUpdateCycleDay).toHaveBeenCalled());
    expect(createOrUpdateCycleDay.mock.calls[0][0]).toHaveProperty('bbt', null);
  });
});
```

(Replace placeholder selectors and mock setup with whatever matches the existing test harness.)

- [ ] **Step 3: Run the new tests**

```bash
cd app
npm test -- src/cycle-tracking/__tests__/AddCycleDayPage.celsius.test.tsx
```

Expected: all four PASS. If any selector differs from the actual page, fix the selector — do not change the assertion.

- [ ] **Step 4: Run the full suite**

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/__tests__/AddCycleDayPage.celsius.test.tsx
git commit -m "test(add-day): cover no-op preservation, edits, and clear-to-null"
```

---

## Task 11: CSV import path — route through `convertToCelsiusForStorage`

The third BBT writer; move it onto the canonical helper.

**Files:**
- Modify: `app/src/cycle-tracking/operations.ts`

- [ ] **Step 1: Update the conversion in `importCycleCsv`**

Around line ~605–615, replace:

```ts
const detectedUnit = inferTemperatureUnit(parsedTemps);
const convertTemperature = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return detectedUnit === 'CELSIUS' ? celsiusToFahrenheit(value) : value;
};
```

with:

```ts
const detectedUnit = inferTemperatureUnit(parsedTemps);
const convertTemperature = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return convertToCelsiusForStorage(value, detectedUnit);
};
```

Update the import at the top of `operations.ts`:

```ts
import { celsiusToFahrenheit, convertToCelsiusForStorage, getDayOfWeek } from './utils';
```

(`celsiusToFahrenheit` may stay if it's used elsewhere in the file; otherwise drop it.)

- [ ] **Step 2: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 4: Verify the writer-consistency grep**

```bash
cd app
grep -rn "convertToCelsiusForStorage" src/cycle-tracking
```

Expected: matches in `utils.ts` (definition) plus the three writers (`AddCycleDayPage.tsx`, `NewCyclePage.tsx`, `operations.ts` for CSV).

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/operations.ts
git commit -m "refactor(csv-import): route BBT through convertToCelsiusForStorage"
```

---

## Task 12: Display layer — `CycleChartPage` six math sites + tooltip

Replace every inline `unit === 'CELSIUS' ? fahrenheitToCelsius(bbt) : bbt` ternary with `toDisplayTemperature(...)` (or `toDisplayTemperature(...).toFixed(2)` for the tooltip number).

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 1: Update the import**

Around line 8, change:

```ts
import { fahrenheitToCelsius, celsiusToFahrenheit, formatDate, /* ... */, getTempNodeLabel } from './utils';
```

to:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, /* ... */, getTempNodeLabel } from './utils';
```

(Drop `fahrenheitToCelsius` and `celsiusToFahrenheit` — neither should be referenced from this file after the refactor. `formatTemperature` is added because the coverline label in Step 5 uses it.)

- [ ] **Step 2: Replace plotting site (line ~178) and drop the 2-dp rounding**

Find (the ternary plus the rounding line that follows):

```ts
const temp = tempUnit === 'CELSIUS'
  ? fahrenheitToCelsius(day.bbt!)
  : day.bbt!;
const tempValue = Number(temp.toFixed(2));
```

Replace with:

```ts
const tempValue = toDisplayTemperature(day.bbt!, tempUnit);
```

The `Number(temp.toFixed(2))` rounding is intentionally removed: per the spec, plotting/positioning math uses raw numbers and rounding only happens at the human-readable boundary (tooltip text, axis tick labels, table cells). ApexCharts handles full-precision numeric series fine. Verify visually in the smoke test (Task 15) that the chart still renders cleanly — there should be no perceptible difference because thermometer resolution (~0.05 °C) dominates over float noise.

- [ ] **Step 3: Replace interpolation site (lines ~339–340)**

Find:

```ts
const t1 = settings.temperatureUnit === 'CELSIUS' ? fahrenheitToCelsius(p1.bbt) : p1.bbt;
const t2 = settings.temperatureUnit === 'CELSIUS' ? fahrenheitToCelsius(p2.bbt) : p2.bbt;
```

Replace with:

```ts
const t1 = toDisplayTemperature(p1.bbt, settings.temperatureUnit);
const t2 = toDisplayTemperature(p2.bbt, settings.temperatureUnit);
```

- [ ] **Step 4: Replace coverline render Y position (lines ~633–635)**

Find:

```ts
const coverlineDisplay = settings.temperatureUnit === 'CELSIUS'
  ? coverlineC
  : celsiusToFahrenheit(coverlineC);
```

Replace with:

```ts
const coverlineDisplay = toDisplayTemperature(coverlineC, settings.temperatureUnit);
```

- [ ] **Step 5: Update the coverline annotation label text (line ~651)**

A few lines below the coverline Y position, ApexCharts' annotation `label.text` renders the displayed value next to the line. It currently hardcodes `°C` against the raw `coverlineC`:

Find:

```ts
label: {
  text: `${coverlineC.toFixed(2)}°C`,
  position: 'right' as const,
  style: { color: style.color, fontSize: '10px', background: 'transparent' },
},
```

Replace with:

```ts
label: {
  text: formatTemperature(coverlineC, settings.temperatureUnit),
  position: 'right' as const,
  style: { color: style.color, fontSize: '10px', background: 'transparent' },
},
```

`formatTemperature` returns a string like `36.50°C` for °C users and `97.70°F` for °F users — both the value and the suffix track the active unit, so a Fahrenheit chart no longer draws the line at `~97.70 °F` while labeling it `36.50°C`.

If `formatTemperature` is not yet imported in this file, add it to the import line updated in Step 1.

- [ ] **Step 6: Replace peak/segment overlay anchor (line ~1336)**

Find:

```ts
const temp = settings?.temperatureUnit === 'CELSIUS'
  ? fahrenheitToCelsius(day.bbt)
  : day.bbt;
```

Replace with:

```ts
const temp = toDisplayTemperature(day.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT');
```

- [ ] **Step 7: Replace tooltip number (line ~1461)**

Find:

```ts
const temp = bbtDay?.bbt
  ? (settings?.temperatureUnit === 'CELSIUS'
      ? fahrenheitToCelsius(bbtDay.bbt).toFixed(2)
      : bbtDay.bbt.toFixed(2))
  : null;
```

Replace with:

```ts
const temp = bbtDay?.bbt != null
  ? toDisplayTemperature(bbtDay.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT').toFixed(2)
  : null;
```

(Inside the `!= null` narrow, the non-nullable overload is selected and `.toFixed(2)` type-checks.)

> Do **not** use `formatTemperature` here — that helper appends a unit suffix, but the tooltip already concatenates `tempUnit` separately on the next line (search for `tempUnit = settings?.temperatureUnit === 'CELSIUS' ? '°C' : '°F'`).

- [ ] **Step 8: Replace peak-day overlay Y position (line ~1596)**

Find:

```ts
const temp = settings?.temperatureUnit === 'CELSIUS'
  ? fahrenheitToCelsius(day.bbt)
  : day.bbt;
```

Replace with:

```ts
const temp = toDisplayTemperature(day.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT');
```

- [ ] **Step 9: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: PASS. If any unused-import warnings come up, drop the now-unused symbols.

- [ ] **Step 10: Run the full suite**

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "refactor(chart): route every BBT math site through toDisplayTemperature; label coverline in active unit"
```

---

## Task 13: Display layer — `CycleDaysPage` and `ThermalShiftAnnotations`

Two smaller display sites that bypass the helpers today.

**Files:**
- Modify: `app/src/cycle-tracking/CycleDaysPage.tsx`
- Modify: `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx`

- [ ] **Step 1: Replace the `CycleDaysPage` fallback (lines 117 and 196)**

In `CycleDaysPage.tsx`, find both occurrences of:

```tsx
{settings ? formatTemperature(day.bbt, settings.temperatureUnit) : `${day.bbt.toFixed(2)}°F`}
```

Replace with:

```tsx
{formatTemperature(day.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT')}
```

Rationale: the fallback hardcodes `°F` on what is now a Celsius value. Routing through `formatTemperature` with a default unit keeps the value-and-suffix consistent.

- [ ] **Step 2: Replace `ThermalShiftAnnotations.tsx` (line ~93)**

Find:

```ts
const tempC = temperatureUnit === 'CELSIUS'
  ? fahrenheitToCelsius(day.bbt)
  : day.bbt;
```

(Or whatever the line ~93 ternary is — the variable name may differ; the structure is the same.) Replace with:

```ts
const display = toDisplayTemperature(day.bbt, temperatureUnit);
```

Update the import to use `toDisplayTemperature` instead of `fahrenheitToCelsius`. Verify any references downstream of this variable still make sense (it is now in the user's display unit, not Celsius).

- [ ] **Step 3: Type-check**

```bash
cd app
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run the full suite**

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleDaysPage.tsx app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
git commit -m "refactor(display): route remaining BBT renders through formatTemperature/toDisplayTemperature"
```

---

## Task 14: Schema migration — drop and recreate dev data

The column type doesn't change, so Prisma will not auto-create a migration. Existing dev rows still hold Fahrenheit values, which the engine now interprets as Celsius (e.g. a stored `97.7` would be read as `97.7 °C` — clearly wrong). Reset the dev DB.

**Files:**
- (no source file changes — Prisma migration command + manual seed re-entry)

- [ ] **Step 1: Stop any running `wasp start`**

```bash
# In whatever terminal has wasp running:
# Ctrl-C
```

- [ ] **Step 2: Reset the dev DB**

```bash
cd app
wasp db reset
```

Confirm the prompt. This drops all rows in the local dev DB.

- [ ] **Step 3: Generate a no-op migration to record the comment change** (optional)

Because the only schema change is a triple-slash comment (Task 4), Prisma may detect "no changes". If so, skip migration generation. If it does create a migration with no operations, that's fine too. The goal is to ensure `wasp db migrate-dev` runs cleanly.

```bash
cd app
wasp db migrate-dev
```

If prompted for a migration name, use `bbt_canonical_celsius_documentation`.

- [ ] **Step 4: Run the full suite once more**

```bash
cd app
npm test
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit any migration files created**

```bash
git add app/migrations
git commit -m "chore(db): reset dev DB and document Celsius-canonical bbt"
```

(Skip if no migration file was generated.)

---

## Task 15: Manual smoke test on running app

Final verification that the migration is end-to-end correct in both unit settings.

**Files:**
- (no code changes — manual UI verification)

- [ ] **Step 1: Start the app**

```bash
cd app
wasp start
```

- [ ] **Step 2: Smoke test as a Celsius user**

In the running app:
1. Sign up or log in.
2. Settings → set temperature unit to Celsius.
3. Create a new cycle starting today.
4. Add 10–14 cycle days with a clear thermal shift, e.g.:
   - Days 1–6: `36.45, 36.50, 36.55, 36.40, 36.45, 36.50` (low phase, varied)
   - Day 7 onward: `36.70, 36.75, 36.80, 36.75, 36.70` (post-shift)
5. Open the chart. **Expect:**
   - All Y-axis labels in `°C`, range roughly `36.3–36.9`.
   - Plotted points at the correct heights.
   - Cover line drawn at `36.50 °C`.
   - Thermal-shift annotation lands on day 7 (or whenever the 3-over-6 rule confirms).
6. Reopen any day's edit form. **Expect** the BBT input to read the same value you entered (e.g. `36.50`), no `°C` suffix in the field.
7. Edit a cervical observation only and save. **Expect** no visible change to the BBT chart and no jump in stored value (verify via DB query if needed: `SELECT bbt FROM "CycleDay" WHERE id = …;`).
8. Clear the BBT field on a day and save. **Expect** that day's point to disappear from the chart.

- [ ] **Step 3: Smoke test as a Fahrenheit user**

1. Settings → switch to Fahrenheit.
2. Re-open the same chart. **Expect:**
   - All Y-axis labels in `°F`, range roughly `97.3–98.6`.
   - Plotted points at the correct heights (visually consistent with the Celsius view).
   - Cover line drawn at `97.70 °F`.
3. Add a new day, type `97.97` in the input. Save. **Expect** the chart updates and reading back shows `97.97 °F` (round-trip exact).
4. Switch settings back to Celsius. Reopen the same day. **Expect** `36.65 °C` (= `(97.97 − 32) × 5/9 = 36.65`).

- [ ] **Step 4: Run the verification grep gates**

```bash
cd app
echo "--- engine F→C grep (expect: no matches) ---"
grep -rn "fahrenheitToCelsius" src/cycle-tracking/interpretation/ || echo OK

echo "--- F→C on .bbt anywhere (expect: no matches) ---"
grep -rn "fahrenheitToCelsius(.*\.bbt" src/ || echo OK

echo "--- C→F on .bbt outside helpers (expect: no matches) ---"
grep -rn "celsiusToFahrenheit(.*\.bbt" src/ || echo OK

echo "--- raw .bbt.toFixed (expect: no matches) ---"
grep -rn "\.bbt.toFixed" src/ || echo OK

echo "--- All three writers go through convertToCelsiusForStorage ---"
grep -rn "convertToCelsiusForStorage" src/cycle-tracking/
```

Expected:
- First four greps return no matches (or the literal `OK`).
- The fifth grep shows the helper definition in `utils.ts` plus three call sites: `AddCycleDayPage.tsx`, `NewCyclePage.tsx`, `operations.ts`.

- [ ] **Step 5: Commit any incidental cleanups discovered during the smoke test**

If the smoke test surfaces a leftover (stray import, unused variable), commit a small follow-up:

```bash
git commit -m "chore(post-migration): remove leftover X discovered during smoke test"
```

Otherwise, no commit needed.

---

## Definition of done

- All 15 tasks complete and committed.
- `cd app && npm test` is green.
- `cd app && npx tsc --noEmit` is green.
- All five verification grep gates from Task 15 pass.
- Manual smoke test passes for both Celsius and Fahrenheit users.
- No `fahrenheitToCelsius` calls remain in `interpretation/`.
- All three BBT writers (`AddCycleDayPage`, `NewCyclePage`, CSV import) flow through `convertToCelsiusForStorage`.
- Fingerprint hashes raw `bbt` floats with no rounding step.
- Form preserves `existingDay.bbt` raw on no-op edits and persists `null` on clear.
