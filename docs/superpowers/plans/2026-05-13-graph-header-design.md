# Graph Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the top three rows of the chart (Date, Week Day, Cycle Day) into the **D1-light** treatment — a month-pill gutter, flat white cells, colored 2-px date underlines, and weekday/cycle-day numbers in small colored chips. The header expresses calendar months via cycle-relative coloring (1st month = blue, 2nd = green, 3rd-or-later = slate fallback).

**Architecture:** All work is in two files. Three pure helpers go into `app/src/cycle-tracking/utils.ts` (chip-label abbreviation, month-span builder, container min-width math) and are fully unit-tested. Visual changes land in `app/src/cycle-tracking/CycleChartPage.tsx` — new constants, two new `useMemo`s for `monthSpans` and `monthIndexByDay`, a new gutter row, and edits to the existing Date/Weekday/Cycle-Day cell renderers. The dynamic `min-w` rule guarantees `cellWidth ≥ 22 px` even for 50-day PCOS cycles using the runtime-measured `plotAreaOffset` (with a 130-px fallback before measurement).

**Tech Stack:** Wasp 0.19, React + TypeScript, Tailwind. Tests run with `npm test` (vitest) from the `app/` directory. Lint runs with `npm run lint`. The repo's ESLint extends `@typescript-eslint/recommended`, which **flags unused module-level vars and unused imports** — every task in this plan is structured so the file is lint-clean at commit time. Conventional commit prefixes (`feat`, `refactor`, `chore`, `docs`).

**Source spec:** [docs/superpowers/specs/2026-05-12-graph-header-design.md](../specs/2026-05-12-graph-header-design.md) — re-read this before starting; it explains every "why".

**Branch:** `feat/graph-page-design-tweaks` (already checked out in the main tree at `/Users/olgapak/work/cycle-path`).

**Convention:** Always work from the `app/` directory for `npm test`, `npm run lint`. Commit after every green task.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/src/cycle-tracking/utils.ts` | modify | Add three pure helpers: `getDayOfWeekAbbreviationChip`, `buildMonthSpans`, `computeContainerMinWidth`. Existing helpers (incl. `getDayOfWeekAbbreviation`) stay untouched. |
| `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` | create | Vitest unit tests for the three new helpers. |
| `app/src/cycle-tracking/CycleChartPage.tsx` | modify | Constants, `monthSpans` + `monthIndexByDay` memos, gutter render, cell-offset shift, cell-content rewrites, dynamic `min-w`, hover-wash recolor, `data-chart-container` attribute. Inline comments at Apex `grid.padding`. |

---

## Task 1: Add `getDayOfWeekAbbreviationChip` helper (TDD)

**Files:**
- Create: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Write the failing test**

Create `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getDayOfWeekAbbreviationChip } from '../utils';

describe('getDayOfWeekAbbreviationChip', () => {
  it.each([
    ['Monday',    'M'],
    ['Tuesday',   'T'],
    ['Wednesday', 'W'],
    ['Thursday',  'Th'],
    ['Friday',    'F'],
    ['Saturday',  'Sa'],
    ['Sunday',    'Su'],
  ])('returns chip-sized abbreviation for %s -> %s', (input, expected) => {
    expect(getDayOfWeekAbbreviationChip(input)).toBe(expected);
  });

  it('returns the input unchanged for unknown values', () => {
    expect(getDayOfWeekAbbreviationChip('not-a-day')).toBe('not-a-day');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- headerHelpers.test.ts
```

Expected: FAIL on the missing export.

- [ ] **Step 3: Implement the helper**

In `app/src/cycle-tracking/utils.ts`, add immediately **after** `getDayOfWeekAbbreviation` (around line 211):

```ts
/**
 * Convert full day name to a chip-sized abbreviation (M, T, W, Th, F, Sa, Su).
 *
 * Identical to {@link getDayOfWeekAbbreviation} except Saturday/Sunday return
 * the 2-letter Sa/Su instead of 3-letter Sat/Sun. Used by the chart's weekday
 * chips so every chip fits within the realistic minimum cellWidth (~22 px).
 */
export function getDayOfWeekAbbreviationChip(dayName: string): string {
  const abbreviations: Record<string, string> = {
    Monday: 'M',
    Tuesday: 'T',
    Wednesday: 'W',
    Thursday: 'Th',
    Friday: 'F',
    Saturday: 'Sa',
    Sunday: 'Su',
  };
  return abbreviations[dayName] ?? dayName;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- headerHelpers.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts
git commit -m "feat(chart): add getDayOfWeekAbbreviationChip helper for chip rendering"
```

---

## Task 2: Add `buildMonthSpans` helper (TDD)

**Files:**
- Modify: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Add type and failing tests**

Append to `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`:

```ts
import { buildMonthSpans, type MonthSpan } from '../utils';

describe('buildMonthSpans', () => {
  it('returns a single span for a cycle that stays within one month', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 1), 1, 15);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October', startDayNumber: 1, endDayNumber: 15 },
    ]);
  });

  it('returns two spans for a cycle crossing a month boundary', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 26), 1, 13);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October',  startDayNumber: 1, endDayNumber: 6 },
      { monthIndex: 1, monthLabel: 'November', startDayNumber: 7, endDayNumber: 13 },
    ]);
  });

  it('returns four spans for a long cycle crossing three boundaries', () => {
    const spans = buildMonthSpans(new Date(2026, 8, 25), 1, 70);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'September', startDayNumber: 1,  endDayNumber: 6  },
      { monthIndex: 1, monthLabel: 'October',   startDayNumber: 7,  endDayNumber: 37 },
      { monthIndex: 2, monthLabel: 'November',  startDayNumber: 38, endDayNumber: 67 },
      { monthIndex: 3, monthLabel: 'December',  startDayNumber: 68, endDayNumber: 70 },
    ]);
  });

  it('handles cycle range starting at minDay > 1', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 1), 10, 20);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October', startDayNumber: 10, endDayNumber: 20 },
    ]);
  });

  it('handles year boundary (Dec → Jan)', () => {
    const spans = buildMonthSpans(new Date(2026, 11, 20), 1, 20);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'December', startDayNumber: 1,  endDayNumber: 12 },
      { monthIndex: 1, monthLabel: 'January',  startDayNumber: 13, endDayNumber: 20 },
    ]);
  });

  it('returns an empty array when displayMaxDay < displayMinDay', () => {
    expect(buildMonthSpans(new Date(2026, 9, 1), 5, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- headerHelpers.test.ts
```

Expected: FAIL on the missing exports.

- [ ] **Step 3: Implement helper and type**

In `app/src/cycle-tracking/utils.ts`, add **after** `getDayOfWeekAbbreviationChip`:

```ts
/**
 * One contiguous calendar-month segment of the displayed cycle range.
 *
 * `monthIndex` is **0-indexed from the first month present in the
 * `[displayMinDay, displayMaxDay]` range** (not from the cycle's first
 * calendar month). The chart's "cycle-relative" coloring contract (blue
 * for 0, green for 1, slate fallback for 2+) holds ONLY when the caller
 * passes `displayMinDay === cycle's first day`. Today's chart always
 * passes `displayMinDay = 1`, so window-relative and cycle-relative
 * indices coincide. If a future caller displays a window starting after
 * the cycle's first day (e.g. a "month 2 onwards" detail view), the
 * helper as written would emit `monthIndex = 0` for whatever month
 * starts the window — producing blue for what is actually the cycle's
 * 2nd or 3rd month. Either pass `displayMinDay = 1` or wrap the helper
 * with an offset adjustment.
 */
export type MonthSpan = {
  monthIndex: number;
  monthLabel: string;     // full English month name, e.g. "October"
  startDayNumber: number; // first cycle-day-number in this span (inclusive)
  endDayNumber: number;   // last cycle-day-number in this span (inclusive)
};

/**
 * Group the displayed cycle days into contiguous calendar-month spans.
 *
 * Walks each day in `[displayMinDay, displayMaxDay]`, projects it onto a
 * calendar date relative to `cycleStartDate`, and emits one span per
 * consecutive run of days in the same calendar month. See {@link MonthSpan}
 * for the `monthIndex` contract.
 */
export function buildMonthSpans(
  cycleStartDate: Date,
  displayMinDay: number,
  displayMaxDay: number,
): MonthSpan[] {
  if (displayMaxDay < displayMinDay) return [];

  const spans: MonthSpan[] = [];
  let currentSpan: MonthSpan | null = null;
  let nextMonthIndex = 0;

  for (let dayNumber = displayMinDay; dayNumber <= displayMaxDay; dayNumber++) {
    const date = new Date(cycleStartDate);
    date.setDate(cycleStartDate.getDate() + (dayNumber - 1));
    const monthLabel = date.toLocaleString('en-US', { month: 'long' });

    if (!currentSpan || currentSpan.monthLabel !== monthLabel) {
      currentSpan = {
        monthIndex: nextMonthIndex++,
        monthLabel,
        startDayNumber: dayNumber,
        endDayNumber: dayNumber,
      };
      spans.push(currentSpan);
    } else {
      currentSpan.endDayNumber = dayNumber;
    }
  }

  return spans;
}
```

- [ ] **Step 4: Run the tests**

```bash
npm test -- headerHelpers.test.ts
```

Expected: all `buildMonthSpans` tests PASS plus the Task-1 tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts
git commit -m "feat(chart): add buildMonthSpans helper for month-pill gutter"
```

---

## Task 3: Add `computeContainerMinWidth` helper + constants (TDD)

**Files:**
- Modify: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Add failing tests**

Append to `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`:

```ts
import { computeContainerMinWidth, LEFT_PLOT_RESERVE_FALLBACK, RIGHT_PLOT_RESERVE, MIN_CELL_WIDTH } from '../utils';

describe('computeContainerMinWidth', () => {
  it('returns the 800-px floor for typical 28-day cycles before measurement', () => {
    expect(computeContainerMinWidth(28, 0)).toBe(800);
  });

  it('scales with numDays when the floor is exceeded', () => {
    expect(computeContainerMinWidth(32, 0)).toBe(874);
    expect(computeContainerMinWidth(40, 0)).toBe(1050);
    expect(computeContainerMinWidth(50, 0)).toBe(1270);
  });

  it('prefers measured plotAreaOffset when larger than the fallback', () => {
    expect(computeContainerMinWidth(40, 145)).toBe(1065);
  });

  it('keeps the fallback when measured offset is smaller', () => {
    expect(computeContainerMinWidth(40, 100)).toBe(1050);
  });

  it('exports the constants so the chart component can re-use them', () => {
    expect(LEFT_PLOT_RESERVE_FALLBACK).toBe(130);
    expect(RIGHT_PLOT_RESERVE).toBe(40);
    expect(MIN_CELL_WIDTH).toBe(22);
  });
});
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- headerHelpers.test.ts
```

Expected: FAIL on the missing exports.

- [ ] **Step 3: Implement helper + constants**

In `app/src/cycle-tracking/utils.ts`, add **after** `buildMonthSpans`:

```ts
/**
 * Minimum chart-container width required to keep `cellWidth ≥ 22 px` so the
 * new header chips always fit, regardless of cycle length or runtime y-axis
 * label width.
 *
 * Reserves both the left non-plot region (Apex y-axis labels + grid.padding.left)
 * and the right non-plot region (grid.padding.right). The left side uses the
 * runtime-measured `plotAreaOffset` when available, falling back to a
 * conservative constant before the first Apex layout. The `Math.max` over
 * measured + fallback ensures we never under-reserve.
 *
 * Why these specific numbers — see the "Long-cycle widening rule" in
 * docs/superpowers/specs/2026-05-12-graph-header-design.md.
 */
export const LEFT_PLOT_RESERVE_FALLBACK = 130;
export const RIGHT_PLOT_RESERVE = 40;
export const MIN_CELL_WIDTH = 22;

export function computeContainerMinWidth(
  numDays: number,
  measuredPlotAreaOffset: number,
): number {
  const effectiveLeftReserve = Math.max(LEFT_PLOT_RESERVE_FALLBACK, measuredPlotAreaOffset);
  return Math.max(
    800,
    effectiveLeftReserve + RIGHT_PLOT_RESERVE + MIN_CELL_WIDTH * numDays,
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- headerHelpers.test.ts
```

Expected: all 5 `computeContainerMinWidth` tests PASS; earlier suites still PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts
git commit -m "feat(chart): add computeContainerMinWidth for long-cycle widening"
```

---

## Task 4: Wire `weekDaysMap` to the chip helper and remove the now-unused import

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

This task swaps one function call and removes the now-orphaned import in the *same commit*, so lint stays green.

- [ ] **Step 1: Update the import (replace `getDayOfWeekAbbreviation` with `getDayOfWeekAbbreviationChip`)**

In `app/src/cycle-tracking/CycleChartPage.tsx` at line 8, the import currently reads:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviation, getDayOfWeek, getCycleDayCount, getTempNodeLabel } from './utils';
```

Change to (note: **remove** `getDayOfWeekAbbreviation`, **add** `getDayOfWeekAbbreviationChip`):

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel } from './utils';
```

- [ ] **Step 2: Switch `weekDaysMap` to use the new helper**

At line 275 (inside the `weekDaysMap` useMemo), change:

```ts
      const abbreviation = getDayOfWeekAbbreviation(getDayOfWeek(date));
```

to:

```ts
      const abbreviation = getDayOfWeekAbbreviationChip(getDayOfWeek(date));
```

- [ ] **Step 3: Lint + test**

```bash
npm run lint
npm test
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "refactor(chart): use chip-sized weekday abbreviations in weekDaysMap"
```

---

## Task 5: Simplify `datesMap` — drop the `/MM` suffix

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (~lines 385-408)

- [ ] **Step 1: Replace the body of `datesMap`**

Replace the entire `datesMap` useMemo block (lines 385–408) with:

```ts
  // Build labels for dates across the full displayed range using the cycle
  // start date. Each value is just the day-of-month (1..31) as a string;
  // the calendar month is now communicated by the gutter pill above the row.
  const datesMap = useMemo(() => {
    if (!cycle) return new Map<number, string>();

    const map = new Map<number, string>();
    const startDate = new Date(cycle.startDate);

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (dayNumber - 1));
      map.set(dayNumber, String(date.getDate()));
    }

    return map;
  }, [cycle, displayDayRange]);
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "refactor(chart): datesMap emits day-of-month only (month moves to gutter)"
```

---

## Task 6: Dynamic `containerMinWidth`, paddingTop bump, Apex inline comments, and `data-chart-container` attribute

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

This task:
1. Adds the `containerMinWidth` memo (uses `computeContainerMinWidth` immediately, so no unused-var concern).
2. Replaces the static `min-w-[800px]` with the dynamic style.
3. Bumps `paddingTop` from `'108px'` to `'130px'`.
4. Adds a stable `data-chart-container="cycle-chart"` attribute so devtools / tests can find this exact element unambiguously (referenced by the Task 10 verification snippet).
5. Adds inline comments at the Apex `grid.padding` lines tying their values to the constants in `utils.ts`.

- [ ] **Step 1: Update the import**

In the import from `./utils` (line 8), add `computeContainerMinWidth`:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel, computeContainerMinWidth } from './utils';
```

- [ ] **Step 2: Add `containerMinWidth` memo**

Place this immediately after the `datesMap` memo from Task 5:

```ts
  // Minimum chart-container width — guarantees cellWidth ≥ 22 px so the
  // weekday/cycle-day chips fit, even on 40-50 day cycles or with wider
  // y-axis labels (e.g. some Celsius/Fahrenheit values). Uses the
  // runtime-measured plotAreaOffset when available, falling back to a
  // conservative reserve before the first Apex measurement.
  const containerMinWidth = useMemo(() => {
    const numDays = displayDayRange.maxDay - displayDayRange.minDay + 1;
    return computeContainerMinWidth(numDays, plotAreaOffset);
  }, [displayDayRange, plotAreaOffset]);
```

- [ ] **Step 3: Replace `min-w-[800px]`, bump `paddingTop`, and add `data-chart-container`**

Find the chart container around line 1222–1225. It currently reads:

```tsx
            <div
              ref={chartContainerRef}
              className="relative min-w-[800px]"
              style={{ paddingTop: '108px', paddingBottom: `${LOWER_TABLE_PADDING_BOTTOM}px` }}
              onMouseMove={(e) => {
```

Change to:

```tsx
            <div
              ref={chartContainerRef}
              className="relative"
              data-chart-container="cycle-chart"
              style={{ minWidth: `${containerMinWidth}px`, paddingTop: '130px', paddingBottom: `${LOWER_TABLE_PADDING_BOTTOM}px` }}
              onMouseMove={(e) => {
```

Four changes here: drop `min-w-[800px]` from `className`; add `data-chart-container` attribute; add `minWidth` to the inline `style`; change `paddingTop` from `'108px'` to `'130px'`.

- [ ] **Step 4: Add inline comments at the Apex `grid.padding` lines**

Find `grid: { padding: { left: 50, right: 40 } }` around lines 640–644. Replace the padding block with:

```ts
      grid: {
        padding: {
          // NOTE: If you change `left`, also revisit LEFT_PLOT_RESERVE_FALLBACK
          // in utils.ts — the chart's min-w math depends on this value.
          left: 50,
          // NOTE: If you change `right`, also update RIGHT_PLOT_RESERVE in
          // utils.ts — the chart's min-w math reserves exactly this many px.
          right: 40,
        },
        show: true,
        clipMarkers: false,
        xaxis: {
          lines: {
            show: false
          }
        }
      },
```

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Visual smoke test**

`wasp start` from the repo root. Open the cycle chart. Expected:

- Chart still renders (no white screen).
- Date row no longer shows `26/10` or `1/11` — every cell shows just the day-of-month.
- The Apex chart area sits ~22 px lower than before (the rest of the new design still missing).
- On long cycles (≥ 36 days), the chart is now wider than 800 px and scrolls horizontally inside the viewport.

The Date / Week Day / Cycle Day cells are still at their **old** offsets (`top: 0/36/72`) and still have their **old** colored backgrounds. That visual misalignment is corrected in Task 7.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): dynamic min-w, paddingTop=130, data-chart-container attr"
```

---

## Task 7: Shift Date / Week Day / Cycle Day rows to their new offsets (22 / 58 / 94)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (the left-axis label container ~lines 1238-1248, and the per-day-cell loop ~lines 1265-1317)

This task moves both the left-axis labels AND the data cells down by 22 px and prepends a blank gutter cell to the label column. After this task, the chart has a 22-px blank band at the top and the three existing rows sit below it. **No content/style change yet — the old colored backgrounds remain.** This produces a non-colliding intermediate state.

- [ ] **Step 1: Replace the left-axis label container**

The existing block at lines 1238–1248 currently reads:

```tsx
                  <div className="absolute top-0 left-0" style={{ width: `${plotAreaOffset}px`, zIndex: 2 }}>
                    <div className="flex items-center justify-end px-3 h-9 text-xs font-medium bg-blue-50 border-b border-slate-300 border-r border-slate-300">
                      Date
                    </div>
                    <div className="flex items-center justify-end px-3 h-9 text-xs font-medium bg-slate-100 border-b border-slate-300 border-r border-slate-300">
                      Week Day
                    </div>
                    <div className="flex items-center justify-end px-3 h-9 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300">
                      Cycle Day
                    </div>
                  </div>
```

Replace with (adds a blank 22-px gutter cell on top; converts the three label cells to white background and explicit 36-px height):

```tsx
                  <div className="absolute top-0 left-0" style={{ width: `${plotAreaOffset}px`, zIndex: 2 }}>
                    {/* Gutter cell — blank; the hairline + month pills live in the gutter overlay container (Task 8). */}
                    <div className="bg-white border-b border-slate-300 border-r border-slate-300" style={{ height: '22px' }} />
                    <div className="flex items-center justify-end px-3 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300" style={{ height: '36px' }}>
                      Date
                    </div>
                    <div className="flex items-center justify-end px-3 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300" style={{ height: '36px' }}>
                      Week Day
                    </div>
                    <div className="flex items-center justify-end px-3 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300" style={{ height: '36px' }}>
                      Cycle Day
                    </div>
                  </div>
```

- [ ] **Step 2: Shift the three per-day data cell `top` offsets**

In the per-day-cell loop body (around lines 1265-1317), find the three `style={{...top: 0, height: '36px'...}}` / `top: '36px'` / `top: '72px'` blocks. Change each `top` value:

- Date cell: `top: 0` → `top: '22px'`
- Week Day cell: `top: '36px'` → `top: '58px'`
- Cycle Day cell: `top: '72px'` → `top: '94px'`

Leave everything else (background classes, content, hover logic) **unchanged** — Task 9 rewrites the cell bodies entirely.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Visual smoke test**

Reload the chart. Expected:

- 22-px blank strip at the top (gutter — will be filled by Task 8).
- Below the strip: the old colored Date row (blue-50), Week Day row (slate-100), Cycle Day row (white) — still using their existing backgrounds.
- The three rows align correctly with their left-axis labels (the white-background labels).
- Hover behaviour still works (column tint with `bg-[#bfdbfe]`).
- No overlap, no visual collision.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "refactor(chart): shift header rows to 22/58/94 + blank gutter cell"
```

---

## Task 8: Add `MONTH_PALETTE`, `monthSpans` memo, and render the gutter overlay (hairline + pills)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

This task introduces three things and **uses all of them in the same commit** to keep lint clean: `MONTH_PALETTE` (used by pills), `paletteFor` (used by pills), and `monthSpans` memo (used by pills).

- [ ] **Step 1: Update the import**

In the import from `./utils` (line 8), add `buildMonthSpans`:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel, computeContainerMinWidth, buildMonthSpans } from './utils';
```

- [ ] **Step 2: Add `MONTH_PALETTE` and `paletteFor` near the top of the file**

Place this immediately **before** the component declaration (after the imports block — co-locate with any other module-level constants like `LOWER_TABLE_PADDING_BOTTOM` if those exist):

```ts
/**
 * Per-month-index color tokens for the cycle chart header.
 *
 * monthIndex 0 = first calendar month present in the displayed cycle range,
 * 1 = second, 2+ = fallback (rare; only triggers for cycles spanning three
 * calendar months). Drives the pill, the date underline, the weekday chip,
 * the cycle-day chip, and the hover wash for every cell in the column.
 *
 * Why these specific hues — see the "Color tokens" section in
 * docs/superpowers/specs/2026-05-12-graph-header-design.md.
 */
const MONTH_PALETTE: Record<number, {
  pillBg: string;
  pillText: string;
  chipBg: string;
  chipText: string;
  underline: string;
  hoverWash: string;
}> = {
  0: { pillBg: '#dbeafe', pillText: '#1e3a8a', chipBg: '#dbeafe', chipText: '#1e3a8a', underline: '#60a5fa', hoverWash: '#dbeafe' }, // blue (1st month)
  1: { pillBg: '#dcfce7', pillText: '#14532d', chipBg: '#dcfce7', chipText: '#14532d', underline: '#4ade80', hoverWash: '#dcfce7' }, // green (2nd month)
  2: { pillBg: '#f1f5f9', pillText: '#334155', chipBg: '#f1f5f9', chipText: '#334155', underline: '#94a3b8', hoverWash: '#f1f5f9' }, // slate (3rd+ month)
};

function paletteFor(monthIndex: number) {
  return MONTH_PALETTE[Math.min(monthIndex, 2)];
}
```

- [ ] **Step 3: Add `monthSpans` memo inside the component**

Place this immediately after the `containerMinWidth` memo from Task 6:

```ts
  // One element per contiguous calendar-month segment of the displayed range.
  // Drives the month-label pills in the gutter row.
  //
  // Cycle-relative coloring contract: monthIndex 0 == cycle's first calendar
  // month, 1 == second, etc. This only holds because displayDayRange.minDay
  // is always 1 in the current chart. If that ever changes (e.g. a "month 2
  // onwards" detail view), update buildMonthSpans usage to offset monthIndex
  // by the number of months skipped — see MonthSpan JSDoc in utils.ts.
  const monthSpans = useMemo(() => {
    if (!cycle) return [];
    // Defensive assertion: today's chart always passes minDay=1; if a future
    // change breaks that, the colors will silently shift, so fail loudly.
    if (displayDayRange.minDay !== 1) {
      // eslint-disable-next-line no-console
      console.warn(
        'CycleChartPage: monthSpans assumes displayDayRange.minDay === 1 for cycle-relative coloring; got',
        displayDayRange.minDay,
      );
    }
    return buildMonthSpans(
      new Date(cycle.startDate),
      displayDayRange.minDay,
      displayDayRange.maxDay,
    );
  }, [cycle, displayDayRange]);
```

- [ ] **Step 4: Render the gutter overlay**

Inside the `{chartData && plotAreaWidth > 0 && (...)}` block (around line 1235), **between** the left-axis label container (the one we modified in Task 7) and the cells container (the `<div className="absolute top-0" style={{ left: 0, right: 0, zIndex: 1 }}>` block), add this new sibling:

```tsx
                  {/* Gutter overlay — hairline + month-label pills. Lives in
                      the full-chart coord space (left:0 = container's left
                      edge); hairline starts at plotAreaOffset, pills are
                      positioned by monthSpans. */}
                  <div className="absolute top-0 left-0 right-0" style={{ height: '22px', zIndex: 1 }}>
                    {/* Hairline running through the gutter band, plot-area only */}
                    <div
                      className="absolute"
                      style={{
                        left: `${plotAreaOffset}px`,
                        right: 0,
                        top: '11px',
                        height: '1px',
                        background: '#cbd5e1',
                      }}
                    />
                    {/* One pill per calendar-month span */}
                    {monthSpans.map((span) => {
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (span.startDayNumber - chartData.minDay) * cellWidth;
                      const palette = paletteFor(span.monthIndex);
                      return (
                        <span
                          key={span.startDayNumber}
                          className="absolute"
                          style={{
                            top: '4px',
                            left: `${leftEdge + 4}px`,
                            height: '14px',
                            lineHeight: '14px',
                            padding: '0 8px',
                            borderRadius: '9px',
                            background: palette.pillBg,
                            color: palette.pillText,
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {span.monthLabel}
                        </span>
                      );
                    })}
                  </div>
```

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Visual smoke test**

Reload the chart. Expected:

- 22-px gutter strip now contains a thin grey hairline (slate-300), starting at the left edge of the plot area.
- One blue pill labeled with the first calendar month sits at the start of that month's columns.
- For cycles crossing a month boundary, a second green pill sits at the start of the next month's columns.
- Pills don't overlap the y-axis label area on the left.
- The three rows below the gutter still show the old colored backgrounds — that's expected; Task 9 finishes them.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): MONTH_PALETTE + monthSpans + gutter overlay (hairline + pills)"
```

---

## Task 9: Add `monthIndexByDay` memo and replace cell content (underlines, chips, hover wash)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

Final visual task — introduces `monthIndexByDay` and immediately uses it to color the underlines/chips/hover wash.

- [ ] **Step 1: Add `monthIndexByDay` memo inside the component**

Place this immediately after the `monthSpans` memo from Task 8:

```ts
  // Lookup: dayNumber -> monthIndex (0 for 1st month of cycle, 1 for 2nd, ...).
  // Drives per-cell color selection (date underline, weekday chip, cycle-day
  // chip, hover wash) without re-scanning monthSpans on every cell.
  const monthIndexByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const span of monthSpans) {
      for (let d = span.startDayNumber; d <= span.endDayNumber; d++) {
        map.set(d, span.monthIndex);
      }
    }
    return map;
  }, [monthSpans]);
```

- [ ] **Step 2: Replace the three cell-rendering blocks in the per-day loop**

Find the per-day loop body (around lines 1265-1317) — the three `<div className="absolute ..."` blocks for Date / Week Day / Cycle Day cells, all wrapped in `<Fragment key={dayNumber}>`. Replace the body of the Fragment with:

```tsx
                        <Fragment key={dayNumber}>
                          {(() => {
                            const monthIndex = monthIndexByDay.get(dayNumber) ?? 0;
                            const palette = paletteFor(monthIndex);
                            const cellBackground = isHovered ? palette.hoverWash : '#ffffff';
                            return (
                              <>
                                {/* Date cell — flat white with a 2-px colored underline spanning the full cell, inset by 4 px each side */}
                                <div
                                  className="absolute flex items-center justify-center text-xs"
                                  style={{
                                    left: `${leftEdge}px`,
                                    width: `${cellWidth}px`,
                                    top: '22px',
                                    height: '36px',
                                    background: cellBackground,
                                    color: '#334155',
                                    borderRight: '1px solid #f1f5f9',
                                    borderBottom: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {dateLabel}
                                  {/* Full-cell-width 2-px underline (per spec): absolutely
                                      positioned in the cell, NOT inside the text span. */}
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      position: 'absolute',
                                      left: '4px',
                                      right: '4px',
                                      bottom: '4px',
                                      height: '2px',
                                      borderRadius: '1px',
                                      background: palette.underline,
                                    }}
                                  />
                                </div>

                                {/* Week Day cell — flat white, letter wrapped in a colored chip */}
                                <div
                                  className="absolute flex items-center justify-center"
                                  style={{
                                    left: `${leftEdge}px`,
                                    width: `${cellWidth}px`,
                                    top: '58px',
                                    height: '36px',
                                    background: cellBackground,
                                    borderRight: '1px solid #f1f5f9',
                                    borderBottom: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: '20px',
                                      height: '18px',
                                      padding: '0 4px',
                                      borderRadius: '9px',
                                      lineHeight: '18px',
                                      fontSize: '10px',
                                      fontWeight: 400,
                                      background: palette.chipBg,
                                      color: palette.chipText,
                                    }}
                                  >
                                    {weekDay}
                                  </span>
                                </div>

                                {/* Cycle Day cell — flat white, number wrapped in a colored chip; intercourse override = pink text */}
                                <div
                                  className="absolute flex items-center justify-center"
                                  style={{
                                    left: `${leftEdge}px`,
                                    width: `${cellWidth}px`,
                                    top: '94px',
                                    height: '36px',
                                    background: cellBackground,
                                    borderRight: '1px solid #f1f5f9',
                                    borderBottom: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: '20px',
                                      height: '18px',
                                      padding: '0 4px',
                                      borderRadius: '9px',
                                      lineHeight: '18px',
                                      fontSize: '10px',
                                      fontWeight: 400,
                                      background: palette.chipBg,
                                      color: hasIntercourse ? '#ec4899' : palette.chipText,
                                    }}
                                  >
                                    {dayNumber}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </Fragment>
```

Key changes from the previous body:

- Backgrounds are now controlled per-cell via `cellBackground` (per-month hover wash on hover, white otherwise) — the old `bg-blue-50` / `bg-slate-100` / `bg-white` / `bg-[#bfdbfe]` Tailwind classes are gone.
- Cell vertical border becomes `1px solid #f1f5f9` (slate-100, very faint).
- **Date underline** is rendered as a direct absolutely-positioned child of the cell div with `left: 4px; right: 4px; bottom: 4px` — full-cell-width inset 4 px each side, exactly as the spec requires (not as wide as the day number).
- Weekday and cycle-day text are wrapped in chip `<span>`s using the per-month palette.
- Intercourse override (`color: hasIntercourse ? '#ec4899' : palette.chipText`) is preserved on the cycle-day chip only.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Visual smoke test (full interaction sweep)**

Reload the chart. Expected:

- Date row: white cells, day-of-month centered; soft 2-px line beneath each number, extending nearly the full cell width (4-px inset each side). Blue for 1st-month days, green for 2nd-month days.
- Week Day row: white cells; each letter inside a small rounded chip — `M`, `T`, `W`, `Th`, `F`, `Sa`, `Su`. Blue chips on 1st-month columns, green on 2nd-month.
- Cycle Day row: white cells; each number inside a chip matching its month color.
- **Hover any day-column**: all three cells in that column get a light tint matching the month (blue or green wash). Move mouse out: column returns to white.
- **Days with `hadIntercourse: true`**: cycle-day chip text is pink, chip background is the month color.
- **Vertical dashed crosshair** still appears on hover, spans from gutter top through plot area.
- **Pinned tooltip** (tap a day) appears at the correct vertical position.

If any check fails, debug before moving on.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): apply D1-light row treatments (underline + chips + hover wash)"
```

---

## Task 10: Width-rule verification (Celsius & Fahrenheit on a long cycle) — REQUIRED BEFORE MERGE

**Files:**
- (No code changes unless verification reveals a bumped fallback constant — this task is empirical.)

The unit tests in Task 3 verify the **math** is correct (given a `plotAreaOffset`, the formula reserves the right amount of width). They do **not** verify that the real Apex `plotAreaOffset` at runtime stays within the 130-px `LEFT_PLOT_RESERVE_FALLBACK`. That depends on font rendering, y-axis label width, locale, and unit formatting — none of which the unit tests can simulate. This task closes that gap and is a **hard prerequisite for merging the branch**. Do not skip.

The chart container has a stable `data-chart-container="cycle-chart"` attribute (added in Task 6), so the snippet below targets it unambiguously.

- [ ] **Step 1: Seed a 40-day cycle (required)**

If your local dev database does not already have a cycle of ≥ 40 days, create one before running the verification. Two ways:

**Option A — through the app UI** (slow but no DB access needed):

1. Navigate to "New Cycle" and create a cycle with a start date 40 days ago (e.g. today minus 40 days).
2. Use "Add Cycle Day" to add a single entry on the cycle's day 40 (any temperature). `displayDayRange.maxDay` will pick this up via `Math.max(DEFAULT_DAYS, recordedMaxDay)`.

**Option B — through Prisma Studio** (faster):

1. From `app/`, run `wasp db studio`.
2. In the `Cycle` table, create a new row: `startDate` = today minus 40 days, `userId` = your dev-user id, `isActive` = `true`.
3. In the `CycleDay` table, create one row referencing that cycle: `dayNumber` = `40`, `date` = the cycle start date plus 39 days, `bbt` (any value within the BBT range).
4. Reload the cycle chart page.

Either way, the chart should now render a 40-column-wide header. Note the cycle's exact `numDays` (40) for the verification snippet.

- [ ] **Step 2: Verify in Celsius**

1. Open Settings, set temperature unit to **Celsius**.
2. Open the long cycle's chart page; confirm 40 columns are visible.
3. Open browser devtools, paste this into the Console:

```js
(() => {
  const container = document.querySelector('[data-chart-container="cycle-chart"]');
  if (!container) { console.error('Could not find chart container — is the chart visible?'); return; }
  const grid = container.querySelector('.apexcharts-grid');
  if (!grid) { console.error('Could not find .apexcharts-grid inside the chart container.'); return; }
  const containerRect = container.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const plotAreaOffset = gridRect.left - containerRect.left;
  const plotAreaWidth = gridRect.width;
  const numDaysStr = prompt('Enter numDays for this cycle (e.g. 40):');
  const numDays = parseInt(numDaysStr ?? '', 10);
  if (!Number.isFinite(numDays) || numDays <= 0) { console.error('numDays not provided.'); return; }
  const cellWidth = plotAreaWidth / numDays;
  console.log({ plotAreaOffset, plotAreaWidth, numDays, cellWidth });
  console.assert(cellWidth >= 22, `cellWidth ${cellWidth.toFixed(2)} is below 22 px floor`);
})();
```

Confirm `cellWidth >= 22`. Record the printed `plotAreaOffset`.

- [ ] **Step 3: Verify in Fahrenheit**

Settings → temperature unit = **Fahrenheit**. Re-run the snippet. Record the new `plotAreaOffset`. Confirm `cellWidth >= 22`.

- [ ] **Step 4: Bump fallback constant if either offset exceeds 130**

If the highest observed `plotAreaOffset` is **> 130**, raise `LEFT_PLOT_RESERVE_FALLBACK` in `app/src/cycle-tracking/utils.ts` to `Math.ceil(highest_observed / 10) * 10 + 10` (round up to next 10 and add 10 px safety margin). Then:

1. Update the matching expectations in `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`.
2. Re-run `npm test` and `npm run lint`.
3. Re-run the verification snippet to confirm `cellWidth >= 22`.

- [ ] **Step 5: Record verification result in the spec**

Verification is part of the merge gate. Record the observed values in the spec's *Long-cycle widening rule* section so future readers can see they were empirically confirmed. Open `docs/superpowers/specs/2026-05-12-graph-header-design.md` and append at the end of that section:

```markdown
> **Empirical verification (YYYY-MM-DD)**: on a 40-day cycle, measured plotAreaOffset = <NN> px in Celsius, <NN> px in Fahrenheit; resulting cellWidth = <NN> px (≥ 22 px floor). Highest offset stays under LEFT_PLOT_RESERVE_FALLBACK = <NN>.
```

Then commit:

If a fallback bump was needed:

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts docs/superpowers/specs/2026-05-12-graph-header-design.md
git commit -m "fix(chart): raise LEFT_PLOT_RESERVE_FALLBACK to <bumped value> per measured offset"
```

If no bump was needed:

```bash
git add docs/superpowers/specs/2026-05-12-graph-header-design.md
git commit -m "docs(spec): record measured plotAreaOffset for Celsius/Fahrenheit on 40-day cycle"
```

**This commit is required to land on the branch before merging** — it documents that the empirical verification was run.

---

## Task 11: Full test + lint + final smoke test

**Files:**
- (No code changes — this is the green-light gate.)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, including the new `headerHelpers.test.ts`. No existing regressions.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors and no warnings.

- [ ] **Step 3: Manual smoke test — full interaction sweep**

Start dev server, open a representative cycle:

1. **Single-month cycle**: confirm one pill, all chips blue.
2. **Two-month cycle**: confirm Oct pill blue, Nov pill green; underlines and chips switch color at the boundary.
3. **Three-month cycle** (if available): third month falls back to slate.
4. **Hover**: column tints with the month wash; leave restores white.
5. **Pin tooltip**: tap a day, tooltip pins; tap elsewhere, tooltip unpins.
6. **Crosshair**: vertical dashed line spans from gutter top through the plot area.
7. **Resize browser narrower**: chart scrolls horizontally inside its wrapper; chips never overflow.
8. **Year boundary** (if a Dec→Jan cycle exists): pills read "December" and "January" — no year suffix.

- [ ] **Step 4: Final cleanup commit (if anything changed during smoke testing)**

If smoke-testing required tweaks:

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "chore(chart): smoke-test cleanup for header redesign"
```

- [ ] **Step 5: Confirm branch state**

```bash
git log --oneline main..HEAD
git status
```

Expected: clean working tree; commits on `feat/graph-page-design-tweaks` covering tasks 1–11. Branch ready to merge / open a PR.
