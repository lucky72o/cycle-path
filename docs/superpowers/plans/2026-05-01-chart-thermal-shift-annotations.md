# Chart Thermal-Shift Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four annotation layers to the cycle chart — reference-low halos, coverline-anchor halo, two-tone shift-window band, and numbered chevrons over confirming days — so the Sensiplan thermal-shift narrative is visible at a glance.

**Architecture:** Render the four layers as **two SVG overlays** sandwiching the ApexCharts component — a *background* overlay (band + halos, mirroring the existing fertile-window pattern at `CycleChartPage.tsx:1233-1305` so it paints behind the temperature line) and a *foreground* overlay (chevrons, painting on top of the chart). Both overlays use the same coordinate system and share helpers. A pure selector (`getChartAnnotations`) returns annotation data from either `engineResult.thermalShift` or `validateAdjustment(...)` depending on interpretation state, hiding the SUGGESTED/CONFIRMED ↔ ADJUSTED branch from the rendering code.

**Why two overlays, not one:** the chart container is `position: relative` and `ReactApexChart` is a sibling of the absolute-positioned overlays. CSS stacking means an overlay rendered *before* the chart in DOM order with `zIndex: 0` paints behind the chart (see fertile-window at line 1233-1305), while an overlay rendered *after* the chart paints in front. Layers 1–3 (band, blue halos, anchor halo) belong behind the temperature line; Layer 4 (chevrons) belongs in front.

**Tech Stack:** React, TypeScript, ApexCharts (read-only — we draw alongside it via raw SVG), Vitest. No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-05-01-chart-thermal-shift-annotations-design.md](../specs/2026-05-01-chart-thermal-shift-annotations-design.md). Visual reference: [docs/superpowers/specs/2026-05-01-chart-thermal-shift-annotations-mockup.html](../specs/2026-05-01-chart-thermal-shift-annotations-mockup.html).

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `app/src/cycle-tracking/interpretation/getChartAnnotations.ts` | **create** | Pure selector — given `cycleDayInputs`, `interpretation`, `engineResult`, returns `{ referenceDays, anchorDay, confirmingDays, coverlineTemp } \| null`. Encapsulates state-based source selection (engine vs `validateAdjustment`) and anchor-day derivation. |
| `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts` | **create** | Vitest suite covering every row of the spec's data-source matrix plus the anchor tie-break rule. |
| `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx` | **create** | Exports two components — `ThermalShiftBackgroundLayer` (band + halos, renders before the chart in DOM order so it paints behind it) and `ThermalShiftForegroundLayer` (chevrons, renders after the chart so it paints in front). Shares helpers and prop types between them. |
| `app/src/cycle-tracking/CycleChartPage.tsx` | **modify** | Wire selector + both overlays into the chart container. Bump `yAxisRange.max` by enough temp units to give chevrons ≥30 px of pixel headroom above the highest dot, derived from the fixed chart height. |

The selector and the overlays are split because the selector is pure and easy to unit-test, while the overlays are thin DOM-render layers verified by inspection.

---

## Task 1: Selector — `getChartAnnotations`, no-shift cases

**Files:**
- Create: `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`
- Test: `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`

This task establishes the selector's signature, return shape, and the simplest cases (null inputs, DISMISSED, engine status `none` outside ADJUSTED).

- [ ] **Step 1: Write the failing tests for null/no-shift cases**

Create `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getChartAnnotations } from '../getChartAnnotations';
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

const engineNone: ThermalShiftResult = {
  status: 'none',
  reason: 'no_shift_detected',
  failedAttempts: [],
};

describe('getChartAnnotations', () => {
  const days = buildDays(Array.from({ length: 21 }, () => 36.3));

  it('returns null when interpretation is null', () => {
    expect(getChartAnnotations(days, null, engineNone)).toBeNull();
  });

  it('returns null for DISMISSED state', () => {
    const interp = { state: 'DISMISSED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, engineNone)).toBeNull();
  });

  it('returns null for SUGGESTED with engine status=none', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, engineNone)).toBeNull();
  });

  it('returns null for CONFIRMED with engine status=none', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, engineNone)).toBeNull();
  });

  it('returns null when engineResult is null/undefined and state is not ADJUSTED', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, null)).toBeNull();
    expect(getChartAnnotations(days, interp, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the selector with the no-shift branches only**

Create `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`:

```typescript
import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';

export type ChartAnnotationData = {
  referenceDays: number[];   // length 6, ascending
  anchorDay: number;         // dayNumber of the coverline anchor (highest of the 6)
  confirmingDays: number[];  // length 1-4, ascending; index 0 is the shift day
  coverlineTemp: number;     // °C, full precision
};

export function getChartAnnotations(
  days: CycleDayInput[],
  interpretation: { state: string; userOverrides: UserOverrides | null } | null,
  engineResult: ThermalShiftResult | null | undefined,
): ChartAnnotationData | null {
  if (!interpretation) return null;
  if (interpretation.state === 'DISMISSED') return null;

  if (interpretation.state === 'ADJUSTED') {
    // Implemented in Task 2
    return null;
  }

  // SUGGESTED or CONFIRMED
  if (!engineResult || engineResult.status === 'none') return null;

  // Implemented in Task 3
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/getChartAnnotations.ts app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts
git commit -m "feat(chart): scaffold getChartAnnotations selector"
```

---

## Task 2: Selector — anchor-day derivation helper

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`
- Modify: `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`

The anchor day is the latest `dayNumber` in `referenceDays` whose Fahrenheit-stored temp converts to a Celsius value equal to `coverlineTemp`. Per spec §2.

- [ ] **Step 1: Write failing tests for `pickAnchorDay` directly**

Append to `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`:

```typescript
import { pickAnchorDay } from '../getChartAnnotations';

describe('pickAnchorDay', () => {
  it('returns the only day matching coverlineTemp', () => {
    const days = buildDays([36.30, 36.32, 36.28, 36.30, 36.32, 36.40]);
    const anchor = pickAnchorDay(days, [1, 2, 3, 4, 5, 6], 36.40);
    expect(anchor).toBe(6);
  });

  it('returns the latest day when multiple days tie at coverlineTemp', () => {
    // Days 2 and 5 both at 36.40 — anchor must be the latest (5)
    const days = buildDays([36.30, 36.40, 36.28, 36.30, 36.40, 36.32]);
    const anchor = pickAnchorDay(days, [1, 2, 3, 4, 5, 6], 36.40);
    expect(anchor).toBe(5);
  });

  it('throws when no day matches coverlineTemp (engine invariant violation)', () => {
    const days = buildDays([36.30, 36.32, 36.28, 36.30, 36.32, 36.30]);
    expect(() => pickAnchorDay(days, [1, 2, 3, 4, 5, 6], 36.99)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts -t "pickAnchorDay"`
Expected: FAIL — `pickAnchorDay` is not exported.

- [ ] **Step 3: Implement `pickAnchorDay`**

Add to `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`:

```typescript
import { fahrenheitToCelsius } from '../utils';

// Add at the top of the file alongside the existing imports:
//   import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';

/**
 * Pick the coverline anchor — the reference-low day whose Celsius temp equals
 * coverlineTemp. On ties, the latest dayNumber wins (the one closest to the
 * shift, which keeps the anchor visually adjacent to the shift narrative).
 *
 * Throws if no day matches: this would mean the engine produced a coverlineTemp
 * not present in referenceDays, which is an invariant violation in
 * collectReferenceDays.
 */
export function pickAnchorDay(
  days: CycleDayInput[],
  referenceDays: number[],
  coverlineTemp: number,
): number {
  const dayMap = new Map(days.map((d) => [d.dayNumber, d]));
  let anchor: number | null = null;
  for (const dayNumber of referenceDays) {
    const day = dayMap.get(dayNumber);
    if (!day || day.bbt === null) continue;
    if (fahrenheitToCelsius(day.bbt) === coverlineTemp) {
      anchor = dayNumber; // overwrite to keep the latest match
    }
  }
  if (anchor === null) {
    throw new Error(
      `pickAnchorDay: no reference day matches coverlineTemp ${coverlineTemp}`,
    );
  }
  return anchor;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts -t "pickAnchorDay"`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/getChartAnnotations.ts app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts
git commit -m "feat(chart): add pickAnchorDay helper with latest-tie rule"
```

---

## Task 3: Selector — SUGGESTED / CONFIRMED branch

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`
- Modify: `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`

For SUGGESTED/CONFIRMED with a real engine shift, return the engine's data plus the derived anchor day.

- [ ] **Step 1: Write failing tests for SUGGESTED/CONFIRMED branch**

Append to `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`:

```typescript
const confirmedShift: ThermalShiftResult = {
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

const pendingShift: ThermalShiftResult = {
  status: 'pending',
  shiftDay: 15,
  coverlineTemp: 36.32,
  referenceDays: [9, 10, 11, 12, 13, 14],
  confirmingDays: [15],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
};

// Days 9-14 with day 14 = coverline temp (36.32)
const fullCycleDays = buildDays([
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28,
  36.30, 36.32, 36.28, 36.30, 36.30, 36.30,
  36.30, 36.32,                              // day 14 = anchor
  36.55, 36.60, 36.58,                       // days 15, 16, 17
]);

describe('getChartAnnotations — SUGGESTED/CONFIRMED', () => {
  it('returns engine annotations for CONFIRMED state', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    const result = getChartAnnotations(fullCycleDays, interp, confirmedShift);
    expect(result).toEqual({
      referenceDays: [9, 10, 11, 12, 13, 14],
      anchorDay: 14,
      confirmingDays: [15, 16, 17],
      coverlineTemp: 36.32,
    });
  });

  it('returns engine annotations for SUGGESTED state', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    const result = getChartAnnotations(fullCycleDays, interp, confirmedShift);
    expect(result?.anchorDay).toBe(14);
    expect(result?.referenceDays).toEqual([9, 10, 11, 12, 13, 14]);
  });

  it('returns pending data with confirmingDays length 1', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    const result = getChartAnnotations(fullCycleDays, interp, pendingShift);
    expect(result?.confirmingDays).toEqual([15]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts -t "SUGGESTED/CONFIRMED"`
Expected: FAIL — selector returns null in those branches.

- [ ] **Step 3: Implement the SUGGESTED/CONFIRMED branch**

In `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`, replace the trailing `return null;` (the one currently following the `engineResult.status === 'none'` check) with:

```typescript
  // SUGGESTED or CONFIRMED with engine pending/confirmed shift
  return {
    referenceDays: engineResult.referenceDays,
    anchorDay: pickAnchorDay(days, engineResult.referenceDays, engineResult.coverlineTemp),
    confirmingDays: engineResult.confirmingDays,
    coverlineTemp: engineResult.coverlineTemp,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`
Expected: PASS — all SUGGESTED/CONFIRMED tests plus prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/getChartAnnotations.ts app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts
git commit -m "feat(chart): selector returns engine annotations for SUGGESTED/CONFIRMED"
```

---

## Task 4: Selector — ADJUSTED branch via `validateAdjustment`

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`
- Modify: `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`

ADJUSTED state must derive annotations from `validateAdjustment(days, userOverrides.shiftDay)` so the chart shows the *user's* shift, even when the engine reports `status: 'none'` or has a different shift day. If `validateAdjustment` returns `kind: 'invalid'`, render none.

- [ ] **Step 1: Write failing tests for ADJUSTED branch**

Append to `app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`:

```typescript
describe('getChartAnnotations — ADJUSTED', () => {
  // 21-day cycle where the user picked day 15 as the shift day.
  // Days 9-14 are valid lows; day 14 is the highest (anchor).
  const adjustedDays = buildDays([
    36.30, 36.32, 36.28, 36.30, 36.32, 36.28,
    36.30, 36.32, 36.28, 36.30, 36.30, 36.30,
    36.30, 36.32,
    36.55, 36.60, 36.58,
    36.55, 36.55, 36.55, 36.55,
  ]);

  it('uses validateAdjustment when state is ADJUSTED — even if engine has none', () => {
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 15 } } as any;
    const result = getChartAnnotations(adjustedDays, interp, engineNone);
    expect(result).not.toBeNull();
    expect(result?.confirmingDays[0]).toBe(15);
    expect(result?.referenceDays).toHaveLength(6);
  });

  it('uses the user shift day, not the engine shift day, when they differ', () => {
    const otherShift: ThermalShiftResult = {
      ...confirmedShift,
      shiftDay: 16,            // engine says 16
      confirmingDays: [16, 17],
    };
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 15 } } as any;
    const result = getChartAnnotations(adjustedDays, interp, otherShift);
    expect(result?.confirmingDays[0]).toBe(15);
  });

  it('returns null for ADJUSTED with no userOverrides.shiftDay', () => {
    const interp = { state: 'ADJUSTED', userOverrides: null } as any;
    expect(getChartAnnotations(adjustedDays, interp, engineNone)).toBeNull();
    const interp2 = { state: 'ADJUSTED', userOverrides: {} } as any;
    expect(getChartAnnotations(adjustedDays, interp2, engineNone)).toBeNull();
  });

  it('returns null when validateAdjustment is invalid (stale ADJUSTED)', () => {
    // userOverrides points at day 1 — too early to have 6 reference days
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 1 } } as any;
    expect(getChartAnnotations(adjustedDays, interp, engineNone)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts -t "ADJUSTED"`
Expected: FAIL — ADJUSTED branch currently returns null unconditionally.

- [ ] **Step 3: Implement the ADJUSTED branch**

In `app/src/cycle-tracking/interpretation/getChartAnnotations.ts`, add the import:

```typescript
import { validateAdjustment } from './sensiplan/validateAdjustment';
```

Replace the placeholder ADJUSTED branch (`return null;` inside `if (interpretation.state === 'ADJUSTED')`) with:

```typescript
  if (interpretation.state === 'ADJUSTED') {
    const shiftDay = interpretation.userOverrides?.shiftDay;
    if (shiftDay == null) return null;
    const result = validateAdjustment(days, shiftDay);
    if (result.kind !== 'valid') return null;
    return {
      referenceDays: result.referenceDays,
      anchorDay: pickAnchorDay(days, result.referenceDays, result.coverlineTemp),
      confirmingDays: result.confirmingDays,
      coverlineTemp: result.coverlineTemp,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/interpretation/getChartAnnotations.ts app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts
git commit -m "feat(chart): selector returns adjustment-derived annotations for ADJUSTED state"
```

---

## Task 5: Overlay scaffold — shared helpers + background layer with reference halos

**Files:**
- Create: `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx`

This task creates the file with shared helpers and the `ThermalShiftBackgroundLayer` component containing the reference-low halos (Layer 1). The other layers, and the foreground component, are added in subsequent tasks.

The background layer mirrors the fertile-window overlay (`CycleChartPage.tsx:1233-1305`): an absolute-positioned SVG rendered *before* the chart in DOM order with `zIndex: 0`, so the chart paints on top of it.

- [ ] **Step 1: Create the file with shared helpers and the background layer**

Create `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx`:

```typescript
import type { CycleDayInput } from '../types';
import type { ChartAnnotationData } from '../getChartAnnotations';
import { fahrenheitToCelsius } from '../../utils';

export type ThermalShiftLayerProps = {
  data: ChartAnnotationData;
  days: CycleDayInput[];
  /** Display unit for converting day.bbt before the temp→y projection */
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT';
  /** Geometry of the chart plot area (px, relative to the chart container) */
  plotAreaOffset: number;
  plotAreaWidth: number;
  plotAreaTop: number;
  plotAreaHeight: number;
  /** Y-axis range in the same display unit as the chart */
  yAxisRange: { min: number; max: number };
  /** Day-axis range from chartData */
  minDay: number;
  maxDay: number;
};

const REFERENCE_HALO_COLOR = '#dbeafe';
const REFERENCE_HALO_RADIUS = 9;
const REFERENCE_HALO_OPACITY = 0.85;

/**
 * Build the day→x and temp→y projection plus a `dotPosition` lookup for the
 * given props. Used by both the background and foreground layer components.
 */
function useChartProjection(props: ThermalShiftLayerProps) {
  const {
    days,
    temperatureUnit,
    plotAreaOffset,
    plotAreaWidth,
    plotAreaTop,
    plotAreaHeight,
    yAxisRange,
    minDay,
    maxDay,
  } = props;

  const numDays = maxDay - minDay + 1;
  const cellWidth = plotAreaWidth / numDays;

  const dayToX = (dayNumber: number): number => {
    const dayIndex = dayNumber - minDay;
    return plotAreaOffset + (dayIndex + 0.5) * cellWidth; // column centre
  };

  const tempToY = (tempInDisplayUnit: number): number =>
    plotAreaTop +
    ((yAxisRange.max - tempInDisplayUnit) / (yAxisRange.max - yAxisRange.min)) *
      plotAreaHeight;

  const dayMap = new Map(days.map((d) => [d.dayNumber, d]));

  const dotPosition = (dayNumber: number): { x: number; y: number } | null => {
    const day = dayMap.get(dayNumber);
    if (!day || day.bbt === null) return null;
    const tempInDisplay =
      temperatureUnit === 'CELSIUS' ? fahrenheitToCelsius(day.bbt) : day.bbt;
    return { x: dayToX(dayNumber), y: tempToY(tempInDisplay) };
  };

  return { cellWidth, dayToX, tempToY, dotPosition };
}

/**
 * Background layer: band + halos. Render this BEFORE <ReactApexChart /> in DOM
 * order so the chart's temperature line paints on top of it.
 */
export function ThermalShiftBackgroundLayer(props: ThermalShiftLayerProps) {
  const { data } = props;
  const { dotPosition } = useChartProjection(props);

  // Layer 1: reference-low halos — render every reference day EXCEPT the
  // anchor (the anchor gets the purple halo in Task 6).
  const referenceLowHalos = data.referenceDays
    .filter((dayNumber) => dayNumber !== data.anchorDay)
    .map((dayNumber) => {
      const pos = dotPosition(dayNumber);
      if (!pos) return null;
      return (
        <circle
          key={`ref-halo-${dayNumber}`}
          cx={pos.x}
          cy={pos.y}
          r={REFERENCE_HALO_RADIUS}
          fill={REFERENCE_HALO_COLOR}
          opacity={REFERENCE_HALO_OPACITY}
        />
      );
    });

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        zIndex: 0, // mirrors fertile-window overlay; sits behind the chart
      }}
    >
      <g>{referenceLowHalos}</g>
      {/* Band + anchor halo added in Tasks 6 & 7 */}
    </svg>
  );
}

/**
 * Foreground layer: numbered chevrons. Render this AFTER <ReactApexChart /> in
 * DOM order so the chevrons paint on top of the chart's temperature line.
 *
 * Implemented in Task 8.
 */
export function ThermalShiftForegroundLayer(_props: ThermalShiftLayerProps) {
  return null;
}
```

- [ ] **Step 2: Verify the file type-checks**

Run: `cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ThermalShiftAnnotations" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
git commit -m "feat(chart): scaffold thermal-shift overlay layers with reference halos"
```

---

## Task 6: Background layer — coverline-anchor halo

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx`

Add the purple halo for the anchor day. Renders *instead of* the blue halo (the Task 5 filter already excludes the anchor from the blue-halo list). Lives in `ThermalShiftBackgroundLayer` so the chart paints on top.

- [ ] **Step 1: Add anchor halo constants and rendering**

Near the other halo constants in `ThermalShiftAnnotations.tsx`:

```typescript
const ANCHOR_HALO_COLOR = '#8b5cf6';
const ANCHOR_HALO_RADIUS = 11;
const ANCHOR_HALO_OPACITY = 0.22;
```

Inside `ThermalShiftBackgroundLayer`, after the `referenceLowHalos` block:

```typescript
  const anchorHalo = (() => {
    const pos = dotPosition(data.anchorDay);
    if (!pos) return null;
    return (
      <circle
        cx={pos.x}
        cy={pos.y}
        r={ANCHOR_HALO_RADIUS}
        fill={ANCHOR_HALO_COLOR}
        opacity={ANCHOR_HALO_OPACITY}
      />
    );
  })();
```

In the returned JSX, add a `<g>` for the anchor halo right after the reference halos group:

```typescript
      <g>{referenceLowHalos}</g>
      {/* Layer 2: coverline-anchor halo (purple) */}
      <g>{anchorHalo}</g>
```

- [ ] **Step 2: Verify type-checks**

Run: `cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ThermalShiftAnnotations" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
git commit -m "feat(chart): add coverline anchor halo to background layer"
```

---

## Task 7: Background layer — two-tone shift band

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx`

The lighter band spans every day in `confirmingDays`. The darker stripe overlays only `confirmingDays[0]` (the shift day). Both rects span the full plot height. Lives in `ThermalShiftBackgroundLayer`.

Within the background layer, the band must render *first* (lowest in this layer's stack) so the halos paint on top of it.

- [ ] **Step 1: Add band constants and rendering**

In `ThermalShiftAnnotations.tsx`, near the other constants:

```typescript
const BAND_LIGHT_COLOR = '#d1fae5';
const BAND_LIGHT_OPACITY = 0.55;
const BAND_DARK_COLOR = '#10b981';
const BAND_DARK_OPACITY = 0.18;
```

Add a `columnRect` helper inside `useChartProjection` so both layer components can use it. Replace the existing `useChartProjection` `return` with:

```typescript
  const columnRect = (
    dayNumber: number,
    fill: string,
    opacity: number,
    key: string,
  ) => {
    const dayIndex = dayNumber - minDay;
    const x = plotAreaOffset + dayIndex * cellWidth;
    return (
      <rect
        key={key}
        x={x}
        y={plotAreaTop}
        width={cellWidth}
        height={plotAreaHeight}
        fill={fill}
        opacity={opacity}
      />
    );
  };

  return { cellWidth, dayToX, tempToY, dotPosition, columnRect };
```

Update the `useChartProjection` call inside `ThermalShiftBackgroundLayer` to destructure `columnRect` as well:

```typescript
  const { dotPosition, columnRect } = useChartProjection(props);
```

Build the band JSX inside `ThermalShiftBackgroundLayer` (before the `referenceLowHalos` block so it sits earlier in the JSX tree):

```typescript
  const lighterBand = data.confirmingDays.map((dayNumber) =>
    columnRect(dayNumber, BAND_LIGHT_COLOR, BAND_LIGHT_OPACITY, `band-light-${dayNumber}`),
  );
  const darkerStripe = columnRect(
    data.confirmingDays[0],
    BAND_DARK_COLOR,
    BAND_DARK_OPACITY,
    `band-dark-${data.confirmingDays[0]}`,
  );
```

In the returned JSX of `ThermalShiftBackgroundLayer`, the band must render BEFORE the halos so the halos appear on top:

```typescript
      {/* Layer 3: shift band (renders first within this layer so halos paint on top) */}
      <g>{lighterBand}</g>
      <g>{darkerStripe}</g>
      {/* Layer 1: reference-low halos */}
      <g>{referenceLowHalos}</g>
      {/* Layer 2: coverline-anchor halo */}
      <g>{anchorHalo}</g>
```

- [ ] **Step 2: Verify type-checks**

Run: `cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ThermalShiftAnnotations" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
git commit -m "feat(chart): add two-tone shift band to background layer"
```

---

## Task 8: Foreground layer — numbered chevrons

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx`

Each entry in `confirmingDays` gets a chevron (apex up) + number, positioned at a fixed pixel offset above the dot. Chevron #1 = shift day, #2 onward = subsequent confirming days. Numbering is `1..confirmingDays.length`. No dimming — the engine never produces a sub-coverline confirming entry.

This layer must paint **on top of the chart's temperature line**, so it lives in `ThermalShiftForegroundLayer` (rendered after `<ReactApexChart />` in DOM order; see Task 9 wire-up).

- [ ] **Step 1: Add chevron constants and implement `ThermalShiftForegroundLayer`**

In `ThermalShiftAnnotations.tsx`, near the other constants:

```typescript
const CHEVRON_STROKE = '#10b981';
const CHEVRON_STROKE_WIDTH = 1.75;
const CHEVRON_NUMBER_COLOR = '#047857';
const CHEVRON_NUMBER_FONT_SIZE = 9;
const CHEVRON_NUMBER_FONT_WEIGHT = 700;
const CHEVRON_OFFSET_ABOVE_DOT = 18; // px from dot to chevron apex
```

Replace the placeholder `ThermalShiftForegroundLayer` function with the real implementation. The chevron path `M-5,4 L0,-2 L5,4` has its apex at `(0,-2)` and feet at `(±5, 4)` in its local frame, so when translated to `(dotX, dotY - CHEVRON_OFFSET_ABOVE_DOT)` the apex sits 20 px above the dot.

```typescript
export function ThermalShiftForegroundLayer(props: ThermalShiftLayerProps) {
  const { data } = props;
  const { dotPosition } = useChartProjection(props);

  const chevrons = data.confirmingDays.map((dayNumber, i) => {
    const pos = dotPosition(dayNumber);
    if (!pos) return null;
    const tx = pos.x;
    const ty = pos.y - CHEVRON_OFFSET_ABOVE_DOT;
    return (
      <g key={`chevron-${dayNumber}`} transform={`translate(${tx},${ty})`}>
        <path
          d="M-5,4 L0,-2 L5,4"
          stroke={CHEVRON_STROKE}
          strokeWidth={CHEVRON_STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          y={14}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui"
          fontSize={CHEVRON_NUMBER_FONT_SIZE}
          fontWeight={CHEVRON_NUMBER_FONT_WEIGHT}
          fill={CHEVRON_NUMBER_COLOR}
        >
          {i + 1}
        </text>
      </g>
    );
  });

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        // No explicit zIndex — relying on DOM order. Rendered after
        // <ReactApexChart /> so it paints on top of the chart's SVG.
      }}
    >
      <g>{chevrons}</g>
    </svg>
  );
}
```

- [ ] **Step 2: Verify type-checks**

Run: `cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ThermalShiftAnnotations" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
git commit -m "feat(chart): add foreground chevron layer"
```

---

## Task 9: Wire both overlays into `CycleChartPage`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

The two overlays must straddle `<ReactApexChart />` in DOM order. The background layer renders **before** the chart (so the chart paints on top of it). The foreground layer renders **after** the chart (so it paints on top of the chart).

- [ ] **Step 1: Add the imports and the annotation memo (placed before `yAxisRange`)**

In `CycleChartPage.tsx`, add these imports near the existing `getActiveCoverline` import on line 21:

```typescript
import { getChartAnnotations } from './interpretation/getChartAnnotations';
import {
  ThermalShiftBackgroundLayer,
  ThermalShiftForegroundLayer,
} from './interpretation/components/ThermalShiftAnnotations';
```

Add the annotation-data memo **immediately before** the existing `yAxisRange` memo (currently at line 242). Task 10 will gate the y-axis headroom bump on this value, so it must be computed first:

```typescript
  const annotationData = useMemo(() => {
    return getChartAnnotations(
      cycleDayInputs,
      interpretation,
      engineResult?.thermalShift ?? null,
    );
  }, [cycleDayInputs, interpretation, engineResult]);
```

The memo's only inputs are `cycleDayInputs`, `interpretation`, and `engineResult` — none of which depend on `yAxisRange`, so reordering is safe.

- [ ] **Step 2: Render the background layer between the fertile gradient and the chart**

Locate the fertile-gradient block at `CycleChartPage.tsx:1233-1305` and the related "Fertile Window Label" block that follows at `:1307-` (begins `{/* Fertile Window Label - positioned behind chart */}`). Insert the background layer **immediately after** the fertile-window label block, before any other content and well before `<ReactApexChart />`:

```tsx
              {/* Fertile Window Label - positioned behind chart */}
              {/* (existing block ends here) */}

              {/* Thermal-shift annotations: BACKGROUND layer (band + halos) */}
              {annotationData && chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && settings && (
                <ThermalShiftBackgroundLayer
                  data={annotationData}
                  days={cycleDayInputs}
                  temperatureUnit={settings.temperatureUnit}
                  plotAreaOffset={plotAreaOffset}
                  plotAreaWidth={plotAreaWidth}
                  plotAreaTop={plotAreaTop}
                  plotAreaHeight={plotAreaHeight}
                  yAxisRange={yAxisRange}
                  minDay={chartData.minDay}
                  maxDay={chartData.maxDay}
                />
              )}
```

**Why after, not before:** the existing fertile-gradient SVG uses `zIndex: 0`. Our background layer also uses `zIndex: 0`. When positioned siblings share a z-index, the later-in-DOM-order one paints on top. Putting thermal background *after* the fertile gradient means the green shift band wins over the gradient on overlap (e.g. when OPK rising/peak days fall inside the confirming window) — which matches the spec's intent that thermal-shift annotations are the more specific information. The thermal background still paints behind `<ReactApexChart />` because the chart, despite being later in DOM, has no explicit z-index and inherits the document-flow stacking that the fertile pattern was designed around.

**Known limitation — fertile label can overlay the band:** the existing "Fertile Window" text label (`CycleChartPage.tsx:1344-1361`) is a `<div>` at `zIndex: 1`, not a `zIndex: 0` SVG. So it paints above our `zIndex: 0` background regardless of DOM order. In overlap zones, the small green text label can sit on top of the lighter band. This is intentional for now: the label's white text-shadow keeps it readable, and there is no clean z-index swap that produces a strictly better outcome — equalizing the label to `zIndex: 0` would put the band *on top of* the label (because the thermal background is inserted later in DOM order than the label), and raising the band's z-index above 1 would also raise it above the chart. If visual verification in Task 11 shows poor readability against the darker stripe, treat it as a separate UX call rather than tweaking the layering inside this task.

- [ ] **Step 3: Render the foreground layer after the chart**

Locate the `<ReactApexChart>` element (around `CycleChartPage.tsx:1482-1487`). Insert the foreground layer **immediately after** the closing `</ReactApexChart>` tag, before the existing "Flower Markers" block (around line 1489). This keeps it on top of the chart's SVG but below other foreground decorations such as flower markers, which is the correct stacking order:

```tsx
              {/* ApexChart */}
              <ReactApexChart
                options={chartOptions}
                series={chartData.series}
                type="line"
                height={400}
              />

              {/* Thermal-shift annotations: FOREGROUND layer (chevrons) */}
              {annotationData && chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && settings && (
                <ThermalShiftForegroundLayer
                  data={annotationData}
                  days={cycleDayInputs}
                  temperatureUnit={settings.temperatureUnit}
                  plotAreaOffset={plotAreaOffset}
                  plotAreaWidth={plotAreaWidth}
                  plotAreaTop={plotAreaTop}
                  plotAreaHeight={plotAreaHeight}
                  yAxisRange={yAxisRange}
                  minDay={chartData.minDay}
                  maxDay={chartData.maxDay}
                />
              )}

              {/* Flower Markers for Peak LH Days - positioned above chart */}
              {/* (existing block continues here, untouched) */}
```

- [ ] **Step 4: Run typecheck and existing tests**

Run: `cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20`
Expected: no new errors.

Run: `cd app && npx vitest run`
Expected: all existing tests pass; new selector tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): render thermal-shift overlays around ApexChart"
```

---

## Task 10: Top-padding adjustment for chevron headroom

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

Per spec edge case "Dot near chart top": chevrons sit ~20 px above the highest dot. If the highest temp is right at the top of `yAxisRange`, the chevron + its number can clip the chart top. We need ≥30 px of pixel clearance.

The bump is computed in *pixel space* and converted to temp units using the post-bump y-axis scale. Because adding `bump` widens the range from `R` to `R + bump`, the per-pixel temp delta after bumping is `(R + bump) / plotHeight`. To get exactly `HEADROOM_PX` worth of pixel clearance from the highest dot to the top of the plot:

```
HEADROOM_PX = (bump / (R + bump)) × plotHeight
⇒ bump = (HEADROOM_PX × R) / (plotHeight − HEADROOM_PX)
```

`plotAreaHeight` is already measured at runtime by the existing ResizeObserver and stored in state (`CycleChartPage.tsx:53` declares it; `:730+` measures it). Use the measured value whenever it's available. On the first render before the observer has fired, `plotAreaHeight === 0` — in that case, fall back to a deliberately *small* assumed height so the initial bump errs on the side of more clearance rather than less. The chart's `height={400}` prop and current axis configuration (no bottom labels, x-axis at top) yield a plot area of roughly 350–370 px in practice, so a fallback of 280 px is comfortably below the real value and guarantees first-render chevrons clear the top even if the eventual measured height comes in lower than expected.

For the default Celsius range (1.5 °C, 36.0–37.5) at the 280 px fallback: `(30 × 1.5) / (280 − 30) = 0.18 °C`. At a measured plot height of 360 px: `(30 × 1.5) / 330 ≈ 0.14 °C`. The bump shrinks once the real plot height is known, but never under-shoots the 30 px target.

- [ ] **Step 1: Gate a chevron-headroom bump on `annotationData`**

In `CycleChartPage.tsx`, replace the `yAxisRange` memo (currently around lines 242-267) with:

```typescript
  const yAxisRange = useMemo(() => {
    if (!chartData || !settings) return null;

    const allTemperatures = chartData.series.flatMap((series) =>
      series.data.map((point: { x: number; y: number }) => point.y),
    );

    const defaultRange =
      settings.temperatureUnit === 'CELSIUS'
        ? { min: 36.0, max: 37.5 }
        : { min: 96.8, max: 99.5 };

    if (allTemperatures.length === 0) {
      return defaultRange;
    }

    const actualMin = Math.min(...allTemperatures);
    const actualMax = Math.max(...allTemperatures);

    const min = Math.min(defaultRange.min, actualMin);
    let max = Math.max(defaultRange.max, actualMax);

    // Headroom for the thermal-shift chevrons — only when chevrons will
    // actually render. DISMISSED / engine-none cycles must keep the existing
    // chart layout, so we leave yAxisRange untouched in that case.
    //
    // Chevron apex sits ~20 px above the dot plus the number underneath, so
    // we want ≥30 px clearance from the highest dot to the top of the plot.
    // Solving the px↔temp equation *after* the bump widens the range gives:
    //   bump = (HEADROOM_PX × range) / (plotHeight − HEADROOM_PX)
    //
    // Use the measured plotAreaHeight when the ResizeObserver has populated
    // it. Before that fires (initial render), fall back to a deliberately
    // small height (280 px) — smaller-than-real means a bigger-than-needed
    // first bump, which clears the chevrons safely even if the real measured
    // plot turns out smaller than expected.
    if (annotationData) {
      const HEADROOM_PX = 30;
      const FALLBACK_PLOT_HEIGHT_PX = 280;
      const effectivePlotHeight =
        plotAreaHeight > 0 ? plotAreaHeight : FALLBACK_PLOT_HEIGHT_PX;
      const range = max - min;
      const bumpTempUnits =
        (HEADROOM_PX * range) / (effectivePlotHeight - HEADROOM_PX);
      if (max - actualMax < bumpTempUnits) {
        max += bumpTempUnits;
      }
    }

    return { min, max };
  }, [chartData, settings, annotationData, plotAreaHeight]);
```

The dependency on `plotAreaHeight` means once the ResizeObserver populates the measured height, `yAxisRange` recomputes once with the more accurate value. The chart re-renders, but the resulting plot-area height change is sub-pixel because the y-axis tick labels round at 0.1 °C / 0.01 °F (`CycleChartPage.tsx:699-704`), so the loop converges immediately rather than oscillating.

Two gates work together to keep the existing chart layout untouched whenever no chevrons would render:

1. `annotationData` is `null` for DISMISSED, engine-`'none'` (without a user override), and any null/missing inputs — so the entire `if` block is skipped and `max` stays at its pre-existing value.
2. Within the `if`, the bump still only fires when `actualMax` is within `bumpTempUnits` of `max`, so cycles whose dots sit comfortably below the top of the y-axis are unaffected even when annotations exist.

The bump scales with the data range, so wider y-axis ranges automatically get proportionally larger temp bumps. `annotationData` is added to the memo's dependency array so the layout updates if the interpretation state changes.

- [ ] **Step 2: Run typecheck and tests**

Run: `cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10`
Expected: no errors.

Run: `cd app && npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): add y-axis headroom bump derived from chevron pixel target"
```

---

## Task 11: Visual verification

**Files:** none (manual verification)

Run the dev server and inspect the chart in each interpretation state. The implementation must match the [committed mockup](../specs/2026-05-01-chart-thermal-shift-annotations-mockup.html).

- [ ] **Step 1: Start the dev server**

Run: `cd app && npm run start` (or whatever the project's dev command is — check `package.json`).

Open the app in a browser and navigate to the cycle chart. Pick a cycle that exercises each scenario; if the seed/test data doesn't cover all four cases, edit a cycle's temps to produce them.

- [ ] **Step 2: Verify SUGGESTED state with confirmed shift**

Find or set up a cycle where the engine has detected a confirmed shift. Confirm:
- 6 blue halos behind reference-low dots (one is replaced by purple)
- 1 purple halo behind the anchor dot (the highest of the 6, latest tied)
- Lighter green band over shift day + 2 confirming days
- Darker green stripe just over the shift day
- Chevrons numbered 1, 2, 3 above the elevated dots
- Coverline (existing dashed purple line) still visible

Take a screenshot and compare visually to S1 in the mockup. Numbers, colours, and proportions should match.

- [ ] **Step 3: Verify SUGGESTED with pending shift**

Find or set up a cycle with `engineResult.thermalShift.status === 'pending'`. Confirm:
- All Layer-1/2 halos visible
- Band length matches `confirmingDays.length` exactly (e.g. 1 column = darker stripe only, 2 columns = stripe + 1 lighter, etc.)
- Chevrons numbered 1..N where N = confirmingDays.length

- [ ] **Step 4: Verify CONFIRMED with 4th-day exception**

Find or set up a cycle where `usedFourthDayException === true`. Confirm:
- Lighter band spans 4 columns total
- Chevron #4 is present and looks the same as the other chevrons (no special styling)
- Match S2 in the mockup

- [ ] **Step 5: Verify ADJUSTED state**

In a cycle with `interpretation.state === 'ADJUSTED'`, confirm:
- Annotations follow the *user's* shift day, not the engine's (verify by adjusting to a different day and reloading)
- Annotations still render even if the engine reports `status: 'none'`

- [ ] **Step 6: Verify no annotations in DISMISSED / engine-none-without-override**

Confirm the chart renders cleanly with no halos, band, or chevrons in:
- DISMISSED state
- SUGGESTED with `engineResult.thermalShift.status === 'none'`

- [ ] **Step 7: Verify chevron headroom**

Inspect a cycle whose highest temperature is near the top of the y-axis. Chevron #N must be fully visible above the dot, not clipped.

- [ ] **Step 7b: Verify fertile-window label readability against the band**

If the cycle has both a thermal shift and OPK rising/peak days, check the overlap zone where the "Fertile Window" text overlays the lighter band (or, worst case, the darker stripe). The text should still be clearly readable thanks to its white text-shadow. If readability is poor, this is a UX call to make separately — there is no clean z-index swap that preserves both visuals (lowering the label below the band hides the label; the band can't be raised without painting over the chart). Flag it as a follow-up rather than fixing inside this task.

- [ ] **Step 8: Commit any final polish**

If the visual review reveals colour/spacing tweaks, fix them in `ThermalShiftAnnotations.tsx`, re-verify, and commit. No commit needed if the implementation matches the mockup as-is.

```bash
# Only if changes were needed:
git add app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
git commit -m "fix(chart): polish thermal-shift annotation rendering"
```

---

## Self-review summary

**Spec coverage:**
- Layer 1 (reference-low halos) — Task 5 ✓
- Layer 2 (anchor halo + selection rule) — Tasks 2, 6 ✓
- Layer 3 (two-tone band) — Task 7 ✓
- Layer 4 (chevrons + numbering rule) — Task 8 ✓
- Data sources matrix (SUGGESTED/CONFIRMED + ADJUSTED + DISMISSED + none) — Tasks 1, 3, 4 ✓
- Edge: pending lengths 1–3 — Task 3 (test) + Task 7/8 (renders driven by `confirmingDays.length`) ✓
- Edge: 4th-day exception — Task 11 (visual) + Tasks 7/8 (no special branch needed) ✓
- Edge: ADJUSTED with engine `'none'` — Task 4 (test) ✓
- Edge: ADJUSTED with `validateAdjustment` invalid — Task 4 (test) ✓
- Edge: dot near chart top — Task 10 ✓
- Out-of-scope items (tooltips, animation, click, post-shift, false-rise, failedAttempts) — not implemented ✓

**Type consistency:** `ChartAnnotationData`, `ThermalShiftLayerProps`, `ThermalShiftBackgroundLayer`, `ThermalShiftForegroundLayer`, and the `pickAnchorDay` signature are referenced consistently across tasks. `temperatureUnit` is the same union (`'CELSIUS' | 'FAHRENHEIT'`) used elsewhere in the chart page. The shared `useChartProjection` helper grows in Task 7 (adds `columnRect` to its return) and is used unchanged thereafter — no shape drift between tasks.

**Stacking correctness:** Tasks 5–7 (background) live in an SVG with `zIndex: 0` rendered before `<ReactApexChart />` in DOM order, mirroring the established fertile-window pattern that already paints behind the chart. Task 8 (chevrons) lives in an SVG rendered *after* the chart, so it paints on top. Halos and band cannot tint the temperature line; chevrons are not occluded by it.
