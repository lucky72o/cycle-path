# Graph Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the top three rows of the chart (Date, Week Day, Cycle Day) into the **D1-light** treatment — a month-pill gutter, flat white cells, colored 2-px date underlines, and weekday/cycle-day numbers in small colored chips. The header expresses calendar months via cycle-relative coloring (1st month = blue, 2nd = green, 3rd-or-later = slate fallback).

**Architecture:** All work is in two files. Three pure helpers go into `app/src/cycle-tracking/utils.ts` (chip-label abbreviation, month-span builder, container min-width math) and are fully unit-tested. Visual changes land in `app/src/cycle-tracking/CycleChartPage.tsx` — new constants near the existing module-level constants, two new `useMemo`s for `monthSpans` and `monthIndexByDay`, a new gutter row, and edits to the existing Date/Weekday/Cycle-Day cell renderers. The dynamic `min-w` rule guarantees `cellWidth ≥ 22 px` even for 50-day PCOS cycles using the runtime-measured `plotAreaOffset` (with a 130-px fallback before measurement).

**Tech Stack:** Wasp 0.19, React + TypeScript, Tailwind. Tests run with `npm test` (vitest) from the `app/` directory. Lint runs with `npm run lint`. Conventional commit prefixes match repo history (`feat`, `refactor`, `chore`, `docs`).

**Source spec:** [docs/superpowers/specs/2026-05-12-graph-header-design.md](../specs/2026-05-12-graph-header-design.md) — re-read this before starting; it explains every "why".

**Branch:** `feat/graph-page-design-tweaks` (already checked out in the main tree at `/Users/olgapak/work/cycle-path`).

**Convention:** Always work from the `app/` directory for `npm test`, `npm run lint`. Commit after every green task. Use exact filenames shown below.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/src/cycle-tracking/utils.ts` | modify | Add three pure helpers: `getDayOfWeekAbbreviationChip`, `buildMonthSpans`, `computeContainerMinWidth`. Existing helpers (incl. `getDayOfWeekAbbreviation`) stay untouched. |
| `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` | create | Vitest unit tests for the three new helpers. |
| `app/src/cycle-tracking/CycleChartPage.tsx` | modify | Constants, `monthSpans` + `monthIndexByDay` memos, gutter render, cell-offset shift, cell-content rewrites, dynamic `min-w`, hover-wash recolor. Inline comments at Apex `grid.padding`. |

---

## Task 1: Add `getDayOfWeekAbbreviationChip` helper (TDD)

**Files:**
- Create: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Write the failing test**

Create `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` with this initial content (we'll grow it across tasks 1–3):

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

From `app/`:

```bash
npm test -- headerHelpers.test.ts
```

Expected: FAIL with a message about `getDayOfWeekAbbreviationChip` not being exported (or similar import error).

- [ ] **Step 3: Implement the helper**

In `app/src/cycle-tracking/utils.ts`, add immediately **after** the existing `getDayOfWeekAbbreviation` function (around line 211):

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

Expected: 8 tests PASS (7 it.each rows + 1 fallback).

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

- [ ] **Step 1: Add the type and failing tests**

Append to `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`:

```ts
import { buildMonthSpans, type MonthSpan } from '../utils';

describe('buildMonthSpans', () => {
  it('returns a single span for a cycle that stays within one month', () => {
    // Cycle starts Oct 1, 2026; show days 1..15 → all October
    const spans = buildMonthSpans(new Date(2026, 9, 1), 1, 15);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October', startDayNumber: 1, endDayNumber: 15 },
    ]);
  });

  it('returns two spans for a cycle crossing a month boundary', () => {
    // Cycle starts Oct 26, 2026; show days 1..13 → Oct 26..31 then Nov 1..7
    const spans = buildMonthSpans(new Date(2026, 9, 26), 1, 13);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October',  startDayNumber: 1, endDayNumber: 6 },
      { monthIndex: 1, monthLabel: 'November', startDayNumber: 7, endDayNumber: 13 },
    ]);
  });

  it('returns three spans for a long cycle crossing two boundaries', () => {
    // Cycle starts Sep 25, 2026; show days 1..70 → Sep 25..30, Oct 1..31, Nov 1..Dec 3
    const spans = buildMonthSpans(new Date(2026, 8, 25), 1, 70);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'September', startDayNumber: 1,  endDayNumber: 6  }, // Sep 25..30
      { monthIndex: 1, monthLabel: 'October',   startDayNumber: 7,  endDayNumber: 37 }, // Oct 1..31
      { monthIndex: 2, monthLabel: 'November',  startDayNumber: 38, endDayNumber: 67 }, // Nov 1..30
      { monthIndex: 3, monthLabel: 'December',  startDayNumber: 68, endDayNumber: 70 }, // Dec 1..3
    ]);
  });

  it('handles cycle starting mid-display-range (minDay > 1)', () => {
    // Cycle starts Oct 1; show days 10..20 → Oct 10..20 (still single span)
    const spans = buildMonthSpans(new Date(2026, 9, 1), 10, 20);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October', startDayNumber: 10, endDayNumber: 20 },
    ]);
  });

  it('handles year boundary (Dec → Jan)', () => {
    // Cycle starts Dec 20, 2026; show days 1..20 → Dec 20..31 then Jan 1..8
    const spans = buildMonthSpans(new Date(2026, 11, 20), 1, 20);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'December', startDayNumber: 1,  endDayNumber: 12 },
      { monthIndex: 1, monthLabel: 'January',  startDayNumber: 13, endDayNumber: 20 },
    ]);
  });

  it('returns an empty array when displayMaxDay < displayMinDay', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 1), 5, 3);
    expect(spans).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- headerHelpers.test.ts
```

Expected: FAIL with an import error for `buildMonthSpans` / `MonthSpan`.

- [ ] **Step 3: Implement the helper**

In `app/src/cycle-tracking/utils.ts`, add **after** `getDayOfWeekAbbreviationChip`:

```ts
/**
 * One contiguous calendar-month segment of the displayed cycle range.
 *
 * `monthIndex` is **cycle-relative**: 0 for the first calendar month present
 * in the displayed range, 1 for the second, etc. The chart uses this to pick
 * the per-month color (blue for 0, green for 1, slate fallback for 2+).
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
 * consecutive run of days in the same calendar month.
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

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- headerHelpers.test.ts
```

Expected: all `buildMonthSpans` tests PASS plus the previously-passing `getDayOfWeekAbbreviationChip` tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts
git commit -m "feat(chart): add buildMonthSpans helper for month-pill gutter"
```

---

## Task 3: Add `computeContainerMinWidth` helper (TDD)

**Files:**
- Modify: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Add failing tests for the width rule**

Append to `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`:

```ts
import { computeContainerMinWidth, LEFT_PLOT_RESERVE_FALLBACK, RIGHT_PLOT_RESERVE, MIN_CELL_WIDTH } from '../utils';

describe('computeContainerMinWidth', () => {
  it('returns the 800-px floor for typical 28-day cycles before measurement', () => {
    // numDays=28, measured offset not yet known (0) → fallback used
    // 130 + 40 + 22*28 = 786 → clamped to 800
    expect(computeContainerMinWidth(28, 0)).toBe(800);
  });

  it('scales with numDays when the floor is exceeded', () => {
    // numDays=32 → 130 + 40 + 22*32 = 874
    expect(computeContainerMinWidth(32, 0)).toBe(874);
    // numDays=40 → 130 + 40 + 22*40 = 1050
    expect(computeContainerMinWidth(40, 0)).toBe(1050);
    // numDays=50 → 130 + 40 + 22*50 = 1270
    expect(computeContainerMinWidth(50, 0)).toBe(1270);
  });

  it('prefers measured plotAreaOffset when larger than the fallback', () => {
    // measured=145 > fallback=130 → use measured
    // 145 + 40 + 22*40 = 1065
    expect(computeContainerMinWidth(40, 145)).toBe(1065);
  });

  it('keeps the fallback when measured offset is smaller', () => {
    // measured=100 < fallback=130 → fallback wins (we never under-reserve)
    // 130 + 40 + 22*40 = 1050
    expect(computeContainerMinWidth(40, 100)).toBe(1050);
  });

  it('exports the constants so the chart component can re-use them', () => {
    expect(LEFT_PLOT_RESERVE_FALLBACK).toBe(130);
    expect(RIGHT_PLOT_RESERVE).toBe(40);
    expect(MIN_CELL_WIDTH).toBe(22);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- headerHelpers.test.ts
```

Expected: FAIL on the new `computeContainerMinWidth` / constant imports.

- [ ] **Step 3: Implement helper and constants**

In `app/src/cycle-tracking/utils.ts`, add **after** the `buildMonthSpans` block:

```ts
/**
 * Minimum chart-container width required to keep `cellWidth ≥ 22 px` so that
 * the new header chips always fit, regardless of cycle length or runtime
 * y-axis label width.
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

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- headerHelpers.test.ts
```

Expected: all 5 `computeContainerMinWidth` tests PASS; previous suites still PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts
git commit -m "feat(chart): add computeContainerMinWidth for long-cycle widening"
```

---

## Task 4: Add `MONTH_PALETTE` color tokens in `CycleChartPage.tsx`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 1: Add palette + helper near the top of the component file**

In `app/src/cycle-tracking/CycleChartPage.tsx`, find the existing `LOWER_TABLE_PADDING_BOTTOM` constant (or the first module-level constant near the top of the file — search for `const LOWER_TABLE_PADDING_BOTTOM` if it exists, otherwise place after the imports block). Add **immediately after** the imports / before the component declaration:

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

- [ ] **Step 2: Verify lint passes**

From `app/`:

```bash
npm run lint
```

Expected: no errors. (Unused `paletteFor` warning is acceptable — it gets used in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): add MONTH_PALETTE tokens for header redesign"
```

---

## Task 5: Wire `weekDaysMap` to the new chip helper

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (~line 275)

- [ ] **Step 1: Update the import**

In `app/src/cycle-tracking/CycleChartPage.tsx` at line 8 (the existing import from `./utils`), add `getDayOfWeekAbbreviationChip` to the imported names. The import currently looks like:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviation, getDayOfWeek, getCycleDayCount, getTempNodeLabel } from './utils';
```

Change to:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviation, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel } from './utils';
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

- [ ] **Step 3: Verify it builds**

From `app/`:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "refactor(chart): use chip-sized weekday abbreviations in weekDaysMap"
```

---

## Task 6: Simplify `datesMap` — drop the `/MM` suffix

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (~lines 385-408)

- [ ] **Step 1: Replace the body of `datesMap`**

The current implementation (lines 385–408) builds a map keyed by `dayNumber` whose value is either `"${dayOfMonth}/${month}"` (on cycle start and month change) or `"${dayOfMonth}"`. The new design moves the month to the gutter pill, so the map only needs to emit `${dayOfMonth}`.

Replace the entire `datesMap` useMemo block with:

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

- [ ] **Step 2: Build the app to make sure nothing referenced the old format**

From `app/`:

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

## Task 7: Add `monthSpans` and `monthIndexByDay` memos in the component

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 1: Update the import**

In the import from `./utils` (line 8), add `buildMonthSpans`:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviation, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel, buildMonthSpans } from './utils';
```

- [ ] **Step 2: Add the two memos right after `datesMap`**

Immediately after the `datesMap` useMemo block (which now ends earlier than before — the new block is shorter), add:

```ts
  // One element per contiguous calendar-month segment of the displayed range.
  // Drives the month-label pills in the gutter row.
  const monthSpans = useMemo(() => {
    if (!cycle) return [];
    return buildMonthSpans(
      new Date(cycle.startDate),
      displayDayRange.minDay,
      displayDayRange.maxDay,
    );
  }, [cycle, displayDayRange]);

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

- [ ] **Step 3: Verify it builds**

```bash
npm run lint
```

Expected: no errors. (Both new variables are unused at this point — that's fine, Task 8 consumes them.)

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): add monthSpans + monthIndexByDay memos"
```

---

## Task 8: Replace static `min-w-[800px]` with dynamic `containerMinWidth` and bump `paddingTop` to 130

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (~lines 1221-1225, also line 641-643 for inline comments)

- [ ] **Step 1: Update the import**

In the import from `./utils`, add `computeContainerMinWidth`:

```ts
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviation, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel, buildMonthSpans, computeContainerMinWidth } from './utils';
```

(`LEFT_PLOT_RESERVE_FALLBACK` and `RIGHT_PLOT_RESERVE` are referenced *by name* in the inline comments in Step 4, but as plain comment text — no import needed.)

- [ ] **Step 2: Add `containerMinWidth` memo**

Immediately after the `monthIndexByDay` memo from Task 7, add:

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

- [ ] **Step 3: Replace `min-w-[800px]` and bump `paddingTop`**

Find the chart container around line 1222–1225. It currently looks like:

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
              style={{ minWidth: `${containerMinWidth}px`, paddingTop: '130px', paddingBottom: `${LOWER_TABLE_PADDING_BOTTOM}px` }}
              onMouseMove={(e) => {
```

(Two changes: `min-w-[800px]` removed from `className`, replaced by `minWidth` in the inline `style`; `paddingTop: '108px'` → `paddingTop: '130px'`.)

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

- [ ] **Step 5: Build + lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Visual smoke test**

Start the dev server (`wasp start` from the repo root) and open the cycle chart. Verify:

- The chart still renders (no white screen).
- The header is now 22 px taller (you'll see a blank strip above the Date row — that's the empty gutter waiting for Task 9 to fill it).
- The chart no longer shows `26/10` or `1/11` — every date cell shows just the day-of-month number.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): dynamic min-w + paddingTop=130 for new gutter"
```

---

## Task 9: Render the gutter row (left-axis blank cell + overlay container with hairline + pills)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (around lines 1238-1248 for the left-axis label container, and add a new sibling element)

- [ ] **Step 1: Add the blank gutter cell to the left-axis label container**

The existing left-axis label container is around lines 1238–1248 and currently renders three labels in order (Date / Week Day / Cycle Day). Find this block:

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

Replace it with:

```tsx
                  <div className="absolute top-0 left-0" style={{ width: `${plotAreaOffset}px`, zIndex: 2 }}>
                    {/* Gutter cell — blank; the hairline + month pills live in the gutter overlay container below */}
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

(Four changes: a new 22-px blank cell prepended; the three label cells lose `bg-blue-50` / `bg-slate-100` / `bg-white` and pick up a uniform `bg-white`; they drop the `h-9` class and use explicit `height: '36px'` to match the new cell offsets; their bottom border becomes `border-slate-200` to match the new design.)

- [ ] **Step 2: Add the gutter overlay container as a new sibling**

Immediately **after** the closing `</div>` of the left-axis label container (and before the cells container that starts with `<div className="absolute top-0" style={{ left: 0, right: 0, zIndex: 1 }}>`), add:

```tsx
                  {/* Gutter overlay — hairline + month-label pills. Lives in the
                      full-chart coord space (left:0 = container's left edge);
                      hairline starts at plotAreaOffset, pills positioned by
                      monthSpans. */}
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

- [ ] **Step 3: Lint + visual check**

```bash
npm run lint
```

Then `wasp start` and reload the cycle chart. Verify:

- The blank strip above the Date row now contains a thin grey hairline (slate-300, 1 px), starting at the left edge of the plot area.
- One blue pill labeled "October" (or whatever the cycle's first month is) sits at the start of October's columns.
- For two-month cycles, a second green pill labeled with the next month sits at that month's start.
- Pills don't overlap the y-axis label area on the left.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): render month-pill gutter above date row"
```

---

## Task 10: Shift Date / Week Day / Cycle Day cell offsets and rewrite cell contents

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (lines ~1265-1317)

- [ ] **Step 1: Replace the three cell-rendering blocks in the per-day loop**

Find the per-day loop body around lines 1265–1317. Currently it renders three absolutely-positioned cells at `top: 0` (Date), `top: '36px'` (Week Day), `top: '72px'` (Cycle Day). Replace the three cell blocks (everything between the opening `<Fragment key={dayNumber}>` and its closing `</Fragment>`) with:

```tsx
                        <Fragment key={dayNumber}>
                          {(() => {
                            const monthIndex = monthIndexByDay.get(dayNumber) ?? 0;
                            const palette = paletteFor(monthIndex);
                            const cellBackground = isHovered ? palette.hoverWash : '#ffffff';
                            return (
                              <>
                                {/* Date cell — flat white with a 2-px colored underline */}
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
                                    position: 'absolute',
                                  }}
                                >
                                  <span style={{ position: 'relative', display: 'inline-block' }}>
                                    {dateLabel}
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        bottom: '-6px',
                                        height: '2px',
                                        borderRadius: '1px',
                                        background: palette.underline,
                                      }}
                                    />
                                  </span>
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

(Key changes from the previous body:

- `top` offsets shift from `0 / 36 / 72` to `22 / 58 / 94`.
- Cell `background` is now controlled by the per-month hover wash + white default instead of `bg-blue-50` / `bg-slate-100` / `bg-white` / `bg-[#bfdbfe]` Tailwind classes.
- Cell vertical border becomes `1px solid #f1f5f9` (slate-100, very faint).
- Date cell content is wrapped in a positioned `<span>` so we can render the 2-px underline beneath the number.
- Weekday and cycle-day numbers are wrapped in chip `<span>`s with the per-month palette.
- The intercourse override (currently `color: hasIntercourse ? '#ec4899' : undefined` on the Cycle Day cell at line 1309) is preserved on the chip's text color.)

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Visual smoke test**

`wasp start` and reload the chart. Verify:

- Date row: white cells, day-of-month centered, soft 2-px line beneath each number (blue for 1st-month days, green for 2nd-month days).
- Week Day row: white cells, each letter inside a small rounded chip (`M`, `T`, `W`, `Th`, `F`, `Sa`, `Su`). Blue chips on 1st-month columns, green on 2nd-month.
- Cycle Day row: white cells, each number inside a small chip in the same color as the weekday chip above it.
- Hover any day-column: all three cells in that column light up in the matching month wash (blue or green tint). Move mouse out: column returns to white.
- Days with `hadIntercourse: true`: cycle-day chip text is pink, chip background is the month color.
- The vertical dashed crosshair line still appears on hover and extends from the top of the gutter to the bottom of the chart.
- The pinned tooltip (tap a day) appears at the right vertical position — measured `plotAreaTop` should have re-flowed automatically.

If any of those don't work, debug before continuing.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): apply D1-light row treatments (underline + chips + hover wash)"
```

---

## Task 11: Width-rule verification (Celsius & Fahrenheit on a long cycle)

**Files:**
- (No code changes unless verification fails — this task is empirical.)

- [ ] **Step 1: Pick or create a long test cycle**

In the dev app, either select an existing cycle of ≥ 40 days, or create one (use the "Add Cycle Day" flow and seed enough days that `displayDayRange.maxDay >= 40`). The exact path will depend on the seed data — if no long cycle exists, document this in the commit and move to step 5.

- [ ] **Step 2: Verify in Celsius**

1. Go to Settings, set temperature unit to **Celsius**.
2. Open the long cycle's chart page.
3. Open browser devtools console.
4. Paste:

```js
const grid = document.querySelector('.apexcharts-grid');
const container = document.querySelector('[class*="relative"]'); // the chartContainerRef div
const containerRect = container.getBoundingClientRect();
const gridRect = grid.getBoundingClientRect();
const plotAreaOffset = gridRect.left - containerRect.left;
const plotAreaWidth  = gridRect.width;
const numDays = ... /* eyeball from the chart, or compute */ ;
const cellWidth = plotAreaWidth / numDays;
console.log({ plotAreaOffset, plotAreaWidth, numDays, cellWidth });
```

5. Confirm `cellWidth >= 22`. Record the printed `plotAreaOffset`.

- [ ] **Step 3: Verify in Fahrenheit**

Repeat step 2 with temperature unit set to **Fahrenheit**. Record the new `plotAreaOffset`.

- [ ] **Step 4: Bump fallback constant if either offset exceeds 130**

If the highest observed `plotAreaOffset` is **> 130**, raise `LEFT_PLOT_RESERVE_FALLBACK` in `app/src/cycle-tracking/utils.ts` to `Math.ceil(highest_observed / 10) * 10 + 10` (round up to next 10 and add 10 px safety margin). Re-run the verification. Update the `headerHelpers.test.ts` expectations for `computeContainerMinWidth` accordingly.

- [ ] **Step 5: Commit verification result**

```bash
git add docs/superpowers/specs/2026-05-12-graph-header-design.md  # if you noted the observed values in the spec
git commit -m "docs(spec): record measured plotAreaOffset for Celsius/Fahrenheit"
```

(If no changes needed because the verification passed, skip this commit — just continue.)

---

## Task 12: Full test + lint + final smoke test

**Files:**
- (No code changes — this is the green-light gate.)

- [ ] **Step 1: Run the full test suite**

From `app/`:

```bash
npm test
```

Expected: all tests pass, including the new `headerHelpers.test.ts` suites. No existing test regressions.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors. If any unused-import warnings remain from earlier tasks (e.g. the constants imported only for inline comments), either reference them in code or remove them — do not commit lint warnings.

- [ ] **Step 3: Manual smoke test — full interaction sweep**

Start dev server, open a representative cycle in the browser:

1. **Single-month cycle**: confirm one pill, all chips blue.
2. **Two-month cycle**: confirm Oct pill blue, Nov pill green; underlines and chips switch color at the boundary.
3. **Three-month cycle** (if available): third month falls back to slate.
4. **Hover**: column tints with the month wash; leave restores white.
5. **Pin tooltip**: tap a day, tooltip pins; tap elsewhere, tooltip unpins.
6. **Crosshair**: vertical dashed line spans from gutter top through the plot area.
7. **Resize browser narrower**: chart scrolls horizontally inside its wrapper; chips never overflow.
8. **Year boundary** (if a Dec→Jan cycle exists): pills read "December" and "January" — no year suffix.

- [ ] **Step 4: Final commit (cleanup if anything changed)**

If any clean-up edits were needed during smoke testing:

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "chore(chart): smoke-test cleanup for header redesign"
```

- [ ] **Step 5: Confirm branch state**

```bash
git log --oneline main..HEAD
git status
```

Expected: a clean working tree, ~12 commits on `feat/graph-page-design-tweaks` covering tasks 1–12. Branch is ready to merge / PR at your discretion.
