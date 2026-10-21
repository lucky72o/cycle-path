# Long-Cycle Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the cycle chart, a long current cycle opens on its latest day on every screen size, and on screens ≥ 1024 px cycles longer than 40 days can be folded by calendar month into pinned coloured ribbons without the day columns ever changing width.

**Architecture:** All folding *rules* (which months are open, default block, standard column width, ribbon pinning maths) live in a new pure module `monthFolding.ts` with unit tests. A thin hook `useMonthFolding.ts` holds the React state, the ≥ 1024 px media query and the scroll position. `CycleChartPage.tsx` keeps its existing `plotAreaOffset + (day − minDay) × cellWidth` contract untouched: folding only narrows `displayDayRange` to the open block and sets an explicit container width; ribbons and the toolbar are two small presentational components. Overlays that look up days from interpretation data get an in-range guard.

**Tech Stack:** Wasp 0.x · React 18 · TypeScript · ApexCharts 3.41 (react-apexcharts 1.4.1) · Tailwind · Vitest 1.6 + @testing-library/react 14.3 (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-21-long-cycle-graph-view-design.md` — the plan argues from it; read both. The throwaway prototype is saved (gitignored) in `.superpowers/prototype/long-cycle-prototype.patch` and `.superpowers/prototype/chartFolding.tsx` as a *visual* reference only.

## Global Constraints

- Folding is available only when **all** hold: viewport ≥ **1024 px** (`matchMedia('(min-width: 1024px)')`, live), displayed cycle length > **40** days (`max(28, recordedMaxDay)` active / `recordedMaxDay` ended), and the cycle spans > 1 calendar month. Otherwise the chart renders exactly as today.
- Standard column width = `max(MIN_CELL_WIDTH /* 22 */, cardPlotWidth / 40)`, `cardPlotWidth = scrollContainerClientWidth − leftReserve − RIGHT_PLOT_RESERVE /* 40 */`, `leftReserve = max(LEFT_PLOT_RESERVE_FALLBACK /* 130 */, measuredPlotAreaOffset − ribbonsLeft)`.
- Ribbons are **24 px** wide, full chart height, one per folded month, calendar order; before-group natural x = `plotAreaOffset − ribbonsLeft`, after-group natural x = `plotAreaOffset + plotAreaWidth`; pinned: before `x = max(naturalLeft, scrollLeft)`, after `x = min(naturalRight, scrollLeft + clientWidth − groupWidth)`.
- Apex grid padding: `left: 50 + ribbonsLeft`, `right: 40 + ribbonsRight`. Explicit container width (and min-width) when folding: `leftReserve + ribbonsLeft + ribbonsRight + RIGHT_PLOT_RESERVE + openDays × standardCellWidth`.
- Open block is one contiguous run of months; only its first/last month can fold, and only when it has > 1 month. Default block: from the anchor side (latest month for active, first month for ended) add whole months until ≥ 40 days are open, *including* the crossing month. Fold state resets on load and on cycle-id change; nothing persisted.
- Month colours: `MONTH_PALETTE[monthIndex % 3]` (blue, green, slate, …), monthIndex cycle-relative (first calendar month of the cycle = 0) regardless of what is open.
- Month row geometry on **every** chart: hairline `top: 21px`, month pills `top: 14.5px`, ribbon "+" dot `top: 15.5px`.
- Toolbar copy, exact: `Show all`, `Collapse all`, `{N} days folded`. Button style: 12 px semibold, `#1e3a8a` text + 1 px border, white background, `rounded-md`, `px-3 py-1`; Show all disabled when every month is open.
- Ribbon copy, exact: `+` dot; vertical label `{Mon} · {N} days` (`{N} day` when N = 1); `aria-label` and `title`: `Show {Month}, {N} days` (`1 day` singular).
- Open-month pill gets a `−` dot only when foldable; `aria-label`: `Fold {Month}`.
- Programmatic horizontal scroll only on: load/cycle change → anchor side; open a before-month → start; open an after-month → end; Show all / Collapse all → anchor side. Delay ≈ 350 ms after render.
- Phone fix: the page column `<div className="flex-1 p-4 md:p-8 max-w-6xl">` gets `min-w-0`, so the chart scrolls inside its card on every cycle.
- No change to interpretation, Days page, CSV, or any behaviour for ≤ 40-day cycles beyond the month-row geometry, colour cycling and the phone fix.
- Personal cycle data (the owner's local `local-long-cycle-8`) is never committed.

## Review Focus

1. **A cycle whose first calendar month is a single day** (starts on the 31st): the ribbon must read `Jul · 1 day` and the default block must still open ≥ 40 days — pinned in Task 1 (`ribbonLabel` singular test, `defaultOpenBlock` with a 1-day span).
2. **A 41–60 day cycle where the default block already opens every month**: no ribbons, `Show all` disabled, `Collapse all` still folds back to the anchor month — pinned in Task 1 (`allOpen` test) and Task 6 (toolbar disabled state).
3. **Viewport crossing 1024 px while months are folded**: folding switches off → full range shown; switching back on → default block again, never a stale block — pinned in Task 4 (hook test with a mutable matchMedia stub).
4. **A hovered or pinned-tooltip day that folds away**: hover/pinned state must clear, or the tooltip would point at a column that no longer exists — pinned in Task 7 (effect + manual check) with the pure helper tested in Task 1 (`isDayInRange`).
5. **Chart narrower than the scroll container after Collapse all** (19 open days ≈ 418 px in a ~900 px card): after-ribbons must rest just past the last day, not at the card's far edge, and nothing may stretch — pinned in Task 1 (`ribbonGroupX` narrow case) and Task 6 (manual).

---

### Task 1: Pure folding rules module

**Files:**
- Create: `app/src/cycle-tracking/monthFolding.ts`
- Test: `app/src/cycle-tracking/__tests__/monthFolding.test.ts`
- Delete (prototype, already saved under `.superpowers/prototype/`): `app/src/cycle-tracking/chartFolding.tsx`; also `git checkout -- app/src/cycle-tracking/CycleChartPage.tsx` to drop the prototype edits (the `ThermalShiftAnnotations.tsx` edit stays — Task 3 tests it).

**Interfaces:**
- Consumes: `MonthSpan`, `buildMonthSpans`, `MIN_CELL_WIDTH`, `RIGHT_PLOT_RESERVE`, `LEFT_PLOT_RESERVE_FALLBACK` from `./utils`.
- Produces (all exported, no React):
  ```ts
  export const FOLD_MIN_DAYS = 40;
  export const STANDARD_FRAME_DAYS = 40;
  export const RIBBON_WIDTH = 24;
  export const FOLD_MIN_VIEWPORT_PX = 1024;
  export type OpenBlock = { from: number; to: number }; // inclusive month indices
  export function isFoldingEligible(lastDay: number, spans: MonthSpan[]): boolean; // lastDay > 40 && spans.length > 1
  export function defaultOpenBlock(spans: MonthSpan[], anchorLatest: boolean): OpenBlock;
  export function canFold(block: OpenBlock, monthIndex: number): boolean;
  export function foldMonth(block: OpenBlock, monthIndex: number): OpenBlock; // no-op when !canFold
  export function openMonth(block: OpenBlock, monthIndex: number): OpenBlock; // extends to include monthIndex
  export function allOpenBlock(spans: MonthSpan[]): OpenBlock;
  export function collapsedBlock(spans: MonthSpan[], anchorLatest: boolean): OpenBlock;
  export function isAllOpen(block: OpenBlock, spans: MonthSpan[]): boolean;
  export function visibleDayRange(block: OpenBlock, spans: MonthSpan[]): { minDay: number; maxDay: number };
  export function isDayInRange(day: number, range: { minDay: number; maxDay: number }): boolean;
  export function foldedDayCount(block: OpenBlock, spans: MonthSpan[]): number;
  export function standardCellWidth(scrollClientWidth: number, leftReserve: number): number;
  export function foldedContainerWidth(args: { leftReserve: number; ribbonsLeft: number; ribbonsRight: number; openDays: number; cellWidth: number }): number;
  export function ribbonGroupX(args: { side: 'before' | 'after'; naturalX: number; groupWidth: number; scrollLeft: number; clientWidth: number }): number;
  export function ribbonLabel(span: MonthSpan): string;      // "Sep · 30 days" / "Jul · 1 day"
  export function ribbonAriaLabel(span: MonthSpan): string;  // "Show September, 30 days" / "…, 1 day"
  export function monthPaletteIndex(monthIndex: number): 0 | 1 | 2; // monthIndex % 3
  ```

- [ ] **Step 1: Remove the prototype from the working tree**

Run: `cd app && git checkout -- src/cycle-tracking/CycleChartPage.tsx && rm src/cycle-tracking/chartFolding.tsx && git status --short`
Expected: only ` M src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx` remains modified.

- [ ] **Step 2: Write the failing tests**

Use a helper `spans(startIso, lastDay)` = `buildMonthSpans(new Date(startIso), 1, lastDay)`. Fixture A = `spans('2026-07-07', 105)` → July 1–25, Aug 26–56, Sep 57–86, Oct 87–105.

```ts
describe('isFoldingEligible', () => {
  it('needs > 40 days and > 1 month', () => {
    expect(isFoldingEligible(40, spans('2026-07-07', 40))).toBe(false);
    expect(isFoldingEligible(41, spans('2026-07-07', 41))).toBe(true);
    expect(isFoldingEligible(60, [{ monthIndex: 0, monthLabel: 'July', startDayNumber: 1, endDayNumber: 60 }])).toBe(false);
  });
});
describe('defaultOpenBlock', () => {
  it('active: opens latest months until >= 40 days, including the crossing month', () => {
    expect(defaultOpenBlock(spansA, true)).toEqual({ from: 2, to: 3 }); // Sep+Oct = 49 days
  });
  it('ended: opens first months until >= 40 days', () => {
    expect(defaultOpenBlock(spansA, false)).toEqual({ from: 0, to: 1 }); // Jul+Aug = 56 days
  });
  it('a 1-day first month keeps adding months until >= 40 days are open', () => {
    const s = spans('2026-07-31', 70); // Jul = 1 day, Aug = 31, Sep = 30, Oct = 8
    expect(defaultOpenBlock(s, false)).toEqual({ from: 0, to: 2 }); // 1 + 31 = 32 < 40 → add Sep
  });
  it('a 41-day two-month cycle opens everything', () => {
    const s = spans('2026-07-07', 41);
    expect(defaultOpenBlock(s, true)).toEqual({ from: 0, to: 1 });
    expect(isAllOpen({ from: 0, to: 1 }, s)).toBe(true);
  });
});
describe('fold/open', () => {
  it('only edge months of a multi-month block can fold', () => {
    expect(canFold({ from: 1, to: 3 }, 1)).toBe(true);
    expect(canFold({ from: 1, to: 3 }, 3)).toBe(true);
    expect(canFold({ from: 1, to: 3 }, 2)).toBe(false);
    expect(canFold({ from: 3, to: 3 }, 3)).toBe(false);
  });
  it('foldMonth shrinks from the folded edge and is a no-op otherwise', () => {
    expect(foldMonth({ from: 1, to: 3 }, 1)).toEqual({ from: 2, to: 3 });
    expect(foldMonth({ from: 1, to: 3 }, 3)).toEqual({ from: 1, to: 2 });
    expect(foldMonth({ from: 3, to: 3 }, 3)).toEqual({ from: 3, to: 3 });
  });
  it('openMonth keeps the block contiguous', () => {
    expect(openMonth({ from: 3, to: 3 }, 1)).toEqual({ from: 1, to: 3 });
    expect(openMonth({ from: 0, to: 0 }, 2)).toEqual({ from: 0, to: 2 });
  });
  it('collapsedBlock is the anchor month only', () => {
    expect(collapsedBlock(spansA, true)).toEqual({ from: 3, to: 3 });
    expect(collapsedBlock(spansA, false)).toEqual({ from: 0, to: 0 });
    expect(allOpenBlock(spansA)).toEqual({ from: 0, to: 3 });
  });
});
describe('ranges and counts', () => {
  it('visibleDayRange and foldedDayCount', () => {
    expect(visibleDayRange({ from: 2, to: 3 }, spansA)).toEqual({ minDay: 57, maxDay: 105 });
    expect(foldedDayCount({ from: 2, to: 3 }, spansA)).toBe(56);
    expect(isDayInRange(56, { minDay: 57, maxDay: 105 })).toBe(false);
    expect(isDayInRange(57, { minDay: 57, maxDay: 105 })).toBe(true);
  });
});
describe('geometry', () => {
  it('standardCellWidth is card plot width / 40, floored at MIN_CELL_WIDTH', () => {
    expect(standardCellWidth(1038, 130)).toBe(22);          // (1038-130-40)/40 = 21.7 → 22
    expect(standardCellWidth(2000, 130)).toBeCloseTo(45.75); // (2000-130-40)/40
  });
  it('foldedContainerWidth sums reserves, ribbons and open days', () => {
    expect(foldedContainerWidth({ leftReserve: 130, ribbonsLeft: 48, ribbonsRight: 0, openDays: 49, cellWidth: 22 })).toBe(130 + 48 + 0 + 40 + 1078);
  });
  it('ribbonGroupX pins before-group to the viewport left edge once scrolled past it', () => {
    const args = { side: 'before' as const, naturalX: 82, groupWidth: 48, clientWidth: 1038 };
    expect(ribbonGroupX({ ...args, scrollLeft: 0 })).toBe(82);
    expect(ribbonGroupX({ ...args, scrollLeft: 258 })).toBe(258);
  });
  it('ribbonGroupX pins after-group to the viewport right edge until its slot is in view', () => {
    const args = { side: 'after' as const, naturalX: 1296, groupWidth: 48, clientWidth: 1038 };
    expect(ribbonGroupX({ ...args, scrollLeft: 0 })).toBe(1038 - 48);
    expect(ribbonGroupX({ ...args, scrollLeft: 300 })).toBe(300 + 1038 - 48); // slot still off-screen
    expect(ribbonGroupX({ ...args, scrollLeft: 400 })).toBe(1296);            // slot in view
  });
  it('ribbonGroupX leaves the after-group at its slot when the chart is narrower than the container', () => {
    expect(ribbonGroupX({ side: 'after', naturalX: 600, groupWidth: 72, scrollLeft: 0, clientWidth: 1038 })).toBe(600);
  });
});
describe('labels and colours', () => {
  it('ribbonLabel / ribbonAriaLabel pluralise', () => {
    expect(ribbonLabel(spansA[2])).toBe('Sep · 30 days');
    expect(ribbonAriaLabel(spansA[2])).toBe('Show September, 30 days');
    const one = spans('2026-07-31', 40)[0];
    expect(ribbonLabel(one)).toBe('Jul · 1 day');
    expect(ribbonAriaLabel(one)).toBe('Show July, 1 day');
  });
  it('monthPaletteIndex cycles every three months', () => {
    expect([0, 1, 2, 3, 4, 5].map(monthPaletteIndex)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/monthFolding.test.ts`
Expected: FAIL — module `../monthFolding` not found.

- [ ] **Step 4: Implement `monthFolding.ts`**

Pure functions with the signatures in Interfaces. `defaultOpenBlock`: start at the anchor month, add neighbours away from the anchor while the open total is `< STANDARD_FRAME_DAYS`. `ribbonGroupX`: `before → Math.max(naturalX, scrollLeft)`, `after → Math.min(naturalX, scrollLeft + clientWidth − groupWidth)`. Labels use `span.monthLabel.slice(0, 3)` and the full `monthLabel`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/monthFolding.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/monthFolding.ts app/src/cycle-tracking/__tests__/monthFolding.test.ts
git commit -m "feat(chart-folding): pure month-folding rules and geometry"
```

---

### Task 2: Month colours cycle and month-row geometry (all charts)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:66-68` (`paletteFor`), `:1345` (hairline `top`), `:1377` (pill `top`), `:8` (imports)

**Interfaces:**
- Consumes: `monthPaletteIndex` from Task 1.
- Produces: `paletteFor(monthIndex)` now returns `MONTH_PALETTE[monthPaletteIndex(monthIndex)]`; comment on `MONTH_PALETTE[2]` changes from "3rd+ month" to "3rd month, then repeats".

- [ ] **Step 1: Change `paletteFor` and the two `top` values**

`paletteFor` → `MONTH_PALETTE[monthPaletteIndex(monthIndex)]`. Hairline `top: '11px'` → `'21px'` with a comment that the 22 px gutter cell's 1 px bottom border is at y = 21–22. Pill `top: '4px'` → `'14.5px'`.

- [ ] **Step 2: Type-check and run the existing suite**

Run: `cd app && npx tsc --noEmit -p . && npx vitest run`
Expected: tsc clean; all tests pass (no test covers these pixels; `monthPaletteIndex` is covered by Task 1).

- [ ] **Step 3: Verify by eye**

Run `wasp start` (already running on :3000), open any cycle's chart at desktop width. Expected: the month hairline is flush with the border above "Date" (measure with devtools: both at y = 21–22 inside the chart container); a cycle spanning 4 months shows blue, green, slate, blue.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): cycle month colours every 3 months; level month row with Date border"
```

---

### Task 3: Overlay in-range guards

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx:86-110` (guard already present from the prototype — keep; this task tests it)
- Modify: `app/src/cycle-tracking/utils.ts` (add `computeMissingBbtDaysOnLine`), `CycleChartPage.tsx:416-444` (replace the memo body with a call)
- Test: `app/src/cycle-tracking/interpretation/__tests__/thermalShiftAnnotationsRange.test.tsx`, `app/src/cycle-tracking/__tests__/missingBbtDays.test.ts`

**Interfaces:**
- Produces in `utils.ts`:
  ```ts
  export function computeMissingBbtDaysOnLine(
    days: Array<{ dayNumber: number; bbt: number | null; excludeFromInterpretation: boolean }>,
    range: { minDay: number; maxDay: number },
    toDisplay: (bbt: number) => number,
  ): Array<{ dayNumber: number; interpolatedTemp: number }>;
  ```
  Behaviour as today's memo (interpolate between consecutive *included* days with BBT, only for days with no BBT at all) but considering only days with `minDay ≤ dayNumber ≤ maxDay`.

- [ ] **Step 1: Write the failing tests**

```tsx
// thermalShiftAnnotationsRange.test.tsx
it('draws nothing for confirming/reference days outside [minDay, maxDay]', () => {
  const data = { anchorDay: 22, referenceDays: [12,13,14,16,19,21], confirmingDays: [22,23,24], coverline: 36.66 } as any; // shape per ThermalShiftLayerProps['data']
  const days = Array.from({ length: 60 }, (_, i) => ({ dayNumber: i + 1, bbt: 36.5 + (i >= 21 ? 0.3 : 0), excludeFromInterpretation: false })) as any;
  const common = { data, days, temperatureUnit: 'celsius' as const, plotAreaOffset: 100, plotAreaWidth: 880, plotAreaTop: 130, plotAreaHeight: 300, yAxisRange: { min: 36, max: 37.5 } };
  const { container: inRange } = render(<svg><ThermalShiftForegroundLayer {...common} minDay={1} maxDay={40} /></svg>);
  const { container: folded } = render(<svg><ThermalShiftForegroundLayer {...common} minDay={26} maxDay={60} /></svg>);
  expect(inRange.querySelectorAll('g[transform]').length).toBeGreaterThan(0);  // chevrons
  expect(folded.querySelectorAll('g[transform]').length).toBe(0);
  const { container: bg } = render(<svg><ThermalShiftBackgroundLayer {...common} minDay={26} maxDay={60} /></svg>);
  expect(bg.querySelectorAll('rect').length).toBe(0);
});
```
Read the real prop shape from `ThermalShiftAnnotations.tsx:14-30` and `getChartAnnotations` before finalising `data`.

```ts
// missingBbtDays.test.ts
const days = [
  { dayNumber: 32, bbt: 37.08, excludeFromInterpretation: false },
  { dayNumber: 33, bbt: null, excludeFromInterpretation: false },
  { dayNumber: 34, bbt: 36.99, excludeFromInterpretation: false },
  { dayNumber: 35, bbt: 36.9, excludeFromInterpretation: false },
  // day 36 absent entirely
  { dayNumber: 37, bbt: 36.7, excludeFromInterpretation: false },
];
it('interpolates missing days only inside the displayed range', () => {
  expect(computeMissingBbtDaysOnLine(days, { minDay: 1, maxDay: 105 }, (t) => t)).toEqual([
    { dayNumber: 33, interpolatedTemp: (37.08 + 36.99) / 2 },
    { dayNumber: 36, interpolatedTemp: (36.9 + 36.7) / 2 },
  ]);
  expect(computeMissingBbtDaysOnLine(days, { minDay: 34, maxDay: 40 }, (t) => t)).toEqual([
    { dayNumber: 36, interpolatedTemp: (36.9 + 36.7) / 2 },
  ]);
});
```
Note: today's memo emits a day when it is *absent* from the map or has `bbt === null` and lies strictly between two consecutive included days with BBT; keep that (day 33 has `bbt: null`, day 36 is absent). Days before the first / after the last included day are never emitted.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/thermalShiftAnnotationsRange.test.tsx src/cycle-tracking/__tests__/missingBbtDays.test.ts`
Expected: first passes already if the prototype guard is still in the working tree (that's fine — it proves the guard), second FAILS: `computeMissingBbtDaysOnLine` not exported.

- [ ] **Step 3: Implement `computeMissingBbtDaysOnLine` in `utils.ts` and use it in `CycleChartPage.tsx:416-444`**

The memo becomes `computeMissingBbtDaysOnLine(Array.from(chartData.allDaysMap.values()), { minDay: chartData.minDay, maxDay: chartData.maxDay }, (t) => toDisplayTemperature(t, settings.temperatureUnit))`.

- [ ] **Step 4: Run tests + tsc**

Run: `cd app && npx tsc --noEmit -p . && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Audit the remaining overlays in `CycleChartPage.tsx` and record the result**

Check each of: fertile-window gradient (`:1542`), fertile-window label (`:1614`), peak flowers (`:1920`), coverline overlay, gray tail (`:1809` region), crosshair/tooltip (`:1689`), touch hit-test (`:960-1015`). Those that loop `minDay..maxDay` or derive `dayNumber` from an x position are safe; any that look up a day from interpretation data must get `isDayInRange` (Task 1). Add a one-paragraph note of what was checked to the commit message.

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/CycleChartPage.tsx app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx app/src/cycle-tracking/interpretation/__tests__/thermalShiftAnnotationsRange.test.tsx app/src/cycle-tracking/__tests__/missingBbtDays.test.ts
git commit -m "fix(chart): never draw thermal-shift marks or missing-BBT markers for days outside the displayed range"
```

---

### Task 4: `useMonthFolding` hook

**Files:**
- Create: `app/src/cycle-tracking/useMonthFolding.ts`
- Test: `app/src/cycle-tracking/__tests__/useMonthFolding.test.tsx`

**Interfaces:**
- Consumes: everything from Task 1; `buildMonthSpans` from `./utils`.
- Produces:
  ```ts
  export function useIsWideViewport(): boolean; // matchMedia(`(min-width: ${FOLD_MIN_VIEWPORT_PX}px)`), updates on change
  export type MonthFolding = {
    enabled: boolean;
    spans: MonthSpan[];               // full cycle, cycle-relative monthIndex
    block: OpenBlock;
    visible: { minDay: number; maxDay: number } | null; // null when !enabled
    foldedBefore: MonthSpan[]; foldedAfter: MonthSpan[];
    foldedDays: number; allOpen: boolean;
    canFold(monthIndex: number): boolean;
    fold(monthIndex: number): void; open(monthIndex: number): void;
    showAll(): void; collapseAll(): void;
    scrollIntent: React.MutableRefObject<'start' | 'end' | null>; // set by the actions, consumed by the page
  };
  export function useMonthFolding(args: { cycleId: string | undefined; cycleStartDate: Date | null; lastDay: number; anchorLatest: boolean }): MonthFolding;
  ```
  Actions set `scrollIntent`: `open(before-month)` → `'start'`, `open(after-month)` → `'end'`, `showAll`/`collapseAll` → anchor side; cycle-id change → anchor side. `fold` leaves it `null`.

- [ ] **Step 1: Write the failing tests** (use `renderHook` + `act` from `@testing-library/react`; override `window.matchMedia` per test to return `matches: true/false` and capture the `change` listener)

```tsx
const args = { cycleId: 'c8', cycleStartDate: new Date('2026-07-07'), lastDay: 105, anchorLatest: true };
it('is disabled below 1024px and exposes the full range', () => { stubMatchMedia(false); const { result } = renderHook(() => useMonthFolding(args)); expect(result.current.enabled).toBe(false); expect(result.current.visible).toBeNull(); });
it('opens the default block and sets scrollIntent to the anchor side', () => { stubMatchMedia(true); const { result } = renderHook(() => useMonthFolding(args)); expect(result.current.block).toEqual({ from: 2, to: 3 }); expect(result.current.scrollIntent.current).toBe('end'); });
it('open/fold/showAll/collapseAll update block and scrollIntent', () => { /* open(0) → {0,3} + 'start'; collapseAll → {3,3} + 'end'; fold(3) no-op; showAll → {0,3} + 'end' */ });
it('resets to the default block when the cycle id changes', () => { /* rerender with cycleId 'c9' after collapseAll → block back to default */ });
it('returns to the default block after the viewport drops below and above 1024px', () => { /* collapseAll; fire change(false) → enabled false; fire change(true) → block equals defaultOpenBlock, not {3,3} */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/useMonthFolding.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

State: `userBlock: OpenBlock | null` (null = use default). Reset `userBlock` to null on `cycleId`/`anchorLatest` change and whenever `enabled` flips. `spans` via `useMemo(buildMonthSpans(start, 1, lastDay))`. Derive everything else from Task 1 functions.

- [ ] **Step 4: Run tests + tsc**

Run: `cd app && npx tsc --noEmit -p . && npx vitest run src/cycle-tracking/__tests__/useMonthFolding.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/useMonthFolding.ts app/src/cycle-tracking/__tests__/useMonthFolding.test.tsx
git commit -m "feat(chart-folding): useMonthFolding hook with viewport gate and scroll intents"
```

---

### Task 5: Ribbon and toolbar components

**Files:**
- Create: `app/src/cycle-tracking/components/FoldRibbon.tsx`, `app/src/cycle-tracking/components/FoldToolbar.tsx`, `app/src/cycle-tracking/components/SignDot.tsx`
- Test: `app/src/cycle-tracking/__tests__/FoldRibbon.test.tsx`, `app/src/cycle-tracking/__tests__/FoldToolbar.test.tsx`

**Interfaces:**
- Consumes: `ribbonLabel`, `ribbonAriaLabel`, `monthPaletteIndex`, `RIBBON_WIDTH` (Task 1).
- Produces:
  ```tsx
  export function SignDot(props: { sign: '+' | '−'; color: string }): JSX.Element; // 12×12 white dot
  export function FoldRibbon(props: { span: MonthSpan; x: number; height: number; palette: { pillBg: string; pillText: string; underline: string }; onOpen: () => void }): JSX.Element;
  // <button type="button" aria-label={ribbonAriaLabel(span)} title=…> absolutely positioned at left:x, top:0, width RIBBON_WIDTH, height; stops propagation of click/pointerdown/touchstart; "+" dot at top 15.5px; vertical label; 3px underline bar; hover brightness(0.95).
  export function FoldToolbar(props: { foldedDays: number; allOpen: boolean; onShowAll: () => void; onCollapseAll: () => void }): JSX.Element;
  ```
  `MONTH_PALETTE` moves from `CycleChartPage.tsx:52-64` to `utils.ts` (export `MONTH_PALETTE` and `paletteFor`), so components and the page share it.

- [ ] **Step 1: Write the failing tests**

```tsx
// FoldRibbon.test.tsx
it('renders an accessible button with the month label and calls onOpen on click anywhere', () => {
  const onOpen = vi.fn();
  render(<FoldRibbon span={sep} x={82} height={900} palette={paletteFor(2)} onOpen={onOpen} />);
  const btn = screen.getByRole('button', { name: 'Show September, 30 days' });
  expect(btn).toHaveTextContent('Sep · 30 days');
  fireEvent.click(btn);
  expect(onOpen).toHaveBeenCalledTimes(1);
});
it('stops click propagation so the chart hit-test never sees it', () => { /* wrap in a div with onClick spy; expect spy not called */ });
// FoldToolbar.test.tsx
it('shows the folded count and disables Show all when everything is open', () => {
  render(<FoldToolbar foldedDays={56} allOpen={false} onShowAll={vi.fn()} onCollapseAll={vi.fn()} />);
  expect(screen.getByText('56 days folded')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show all' })).toBeEnabled();
  render(<FoldToolbar foldedDays={0} allOpen onShowAll={vi.fn()} onCollapseAll={vi.fn()} />);
  expect(screen.queryByText(/days folded/)).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Show all' })[1]).toBeDisabled();
});
```

- [ ] **Step 2: Run to verify they fail** — `cd app && npx vitest run src/cycle-tracking/__tests__/Fold*.test.tsx` → FAIL, modules not found.

- [ ] **Step 3: Implement the three components and move `MONTH_PALETTE`/`paletteFor` to `utils.ts`** (update the import at `CycleChartPage.tsx:8`; keep the type annotation).

- [ ] **Step 4: Run tests + tsc** — `cd app && npx tsc --noEmit -p . && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/components/FoldRibbon.tsx app/src/cycle-tracking/components/FoldToolbar.tsx app/src/cycle-tracking/components/SignDot.tsx app/src/cycle-tracking/utils.ts app/src/cycle-tracking/CycleChartPage.tsx app/src/cycle-tracking/__tests__/FoldRibbon.test.tsx app/src/cycle-tracking/__tests__/FoldToolbar.test.tsx
git commit -m "feat(chart-folding): FoldRibbon, FoldToolbar and shared month palette"
```

---

### Task 6: Wire folding into the chart page (range, widths, ribbons, toolbar, "−" pills)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` — `:208-222` (`displayDayRange`), `:467-470` (`containerMinWidth`), `:480-503` (`monthSpans`), `:742-745` (Apex grid padding), `:865` (options deps), `:928` (resize-effect deps), `:1302-1308` (scroll container + explicit width), `:1320` and the 8 other `width: \`${plotAreaOffset}px\`` label-column cells (use `labelColWidth`), `:1334-1400` (gutter overlay: pointer-events, "−" pills), plus ribbon + toolbar render.

**Interfaces:**
- Consumes: Task 4 hook, Task 5 components, Task 1 geometry.
- Produces: page-level values used by Task 7: `scrollContainerRef: RefObject<HTMLDivElement>`, `fold: MonthFolding`, `ribbonsLeft/ribbonsRight: number` (px), `labelColWidth: number`.

- [ ] **Step 1: Hook in and narrow the displayed range**

In `CycleChartPage` after `recordedMaxDay`: `const fold = useMonthFolding({ cycleId: cycle?.id, cycleStartDate: cycle ? new Date(cycle.startDate) : null, lastDay: cycle ? (cycle.isActive ? Math.max(28, recordedMaxDay) : recordedMaxDay) : 0, anchorLatest: !!cycle?.isActive })`. `displayDayRange` returns `fold.visible` when non-null (add to deps). `ribbonsLeft = fold.foldedBefore.length * RIBBON_WIDTH`, `ribbonsRight` likewise; `labelColWidth = plotAreaOffset − ribbonsLeft`.

- [ ] **Step 2: Month spans clipped, not rebuilt**

`monthSpans`: when `fold.enabled`, filter `fold.spans` to those intersecting `displayDayRange` and clamp `startDayNumber`/`endDayNumber` to it (keeps cycle-relative `monthIndex`); otherwise today's code. Drop the `minDay !== 1` console warning (it is now expected); keep the ended-cycle `gutterMaxDay` clamp for the non-folding path.

- [ ] **Step 3: Widths and grid padding**

Add `const [scrollClientWidth, setScrollClientWidth]` measured with a `ResizeObserver` on `scrollContainerRef` (new `useRef`). `leftReserve = Math.max(LEFT_PLOT_RESERVE_FALLBACK, plotAreaOffset − ribbonsLeft)`; `cellWidth = standardCellWidth(scrollClientWidth, leftReserve)`; `explicitWidth = fold.enabled && scrollClientWidth > 0 ? foldedContainerWidth({ leftReserve, ribbonsLeft, ribbonsRight, openDays, cellWidth }) : null`. Container style: `width: explicitWidth ?? undefined`, `minWidth: explicitWidth ?? containerMinWidth`. Apex grid padding `left: 50 + ribbonsLeft`, `right: 40 + ribbonsRight`; add both to the chart-options deps (`:865`) and to the resize-effect deps (`:928`) so Apex re-measures when ribbons appear.

- [ ] **Step 4: Gutter overlay and "−" pills**

Gutter overlay container: `pointerEvents: 'none'`, `zIndex: 4`; each month pill `pointerEvents: 'auto'`. For a span with `fold.canFold(span.monthIndex)`: render `<SignDot sign="−" …/>` before the label, `padding: '0 8px 0 3px'`, `role="button"`, `aria-label={\`Fold ${span.monthLabel}\`}`, `tabIndex={0}`, `onClick`/`Enter` → `fold.fold(span.monthIndex)`, `cursor-pointer hover:brightness-95`.

- [ ] **Step 5: Ribbons (natural slots only — pinning is Task 7) and toolbar**

Inside the chart container, after the gutter overlay: `fold.foldedBefore.map((s, i) => <FoldRibbon span={s} x={plotAreaOffset − ribbonsLeft + i * RIBBON_WIDTH} height={containerHeight} palette={paletteFor(s.monthIndex)} onOpen={() => fold.open(s.monthIndex)} />)` and the after-group at `plotAreaOffset + plotAreaWidth + i * RIBBON_WIDTH`. `containerHeight` = the chart container's measured `offsetHeight` (measure in the existing resize effect alongside `chartHeight`). Render `<FoldToolbar …/>` above the `overflow-x-auto` div when `fold.enabled`. Set `ref={scrollContainerRef}` on that div.

- [ ] **Step 6: Type-check and run the suite** — `cd app && npx tsc --noEmit -p . && npx vitest run` → PASS.

- [ ] **Step 7: Verify by eye on the local long cycle** (owner's DB has `local-long-cycle-8`; otherwise load one with the method in the spec's "Constraints")

At 1440 px: default shows Sep + Oct at 22 px columns with "+ Jul · 25 days" and "+ Aug · 31 days" ribbons left of 1 Sep; `56 days folded`; Collapse all → only October, chart narrower than the card, columns still 22 px; Show all → 103 columns, scrolls; clicking anywhere on a ribbon opens it; "− September" folds it; colours Jul blue, Aug green, Sep slate, Oct blue; no marks left of the plot with July folded. At 1000 px: no toolbar, no ribbons, chart as on `main`.

- [ ] **Step 8: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart-folding): fold long cycles by month with ribbons, toolbar and fixed column width (desktop >= 1024px)"
```

---

### Task 7: Pinned ribbons, programmatic scrolling, hover-state clearing

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (Task 6 wiring)
- Test: `app/src/cycle-tracking/__tests__/monthFolding.test.ts` (already covers `ribbonGroupX`; no new unit tests — behaviour is verified by eye and the hook tests)

**Interfaces:**
- Consumes: `ribbonGroupX` (Task 1), `fold.scrollIntent` (Task 4).

- [ ] **Step 1: Track scroll position**

`const [chartScrollLeft, setChartScrollLeft] = useState(0)`; `useEffect` adding a passive `scroll` listener on `scrollContainerRef.current` that updates via `requestAnimationFrame` (deps: `[chartData]`).

- [ ] **Step 2: Pin the ribbon groups**

Before-group x: `ribbonGroupX({ side: 'before', naturalX: plotAreaOffset − ribbonsLeft, groupWidth: ribbonsLeft, scrollLeft: chartScrollLeft, clientWidth: scrollClientWidth })`, each ribbon at `x + i * RIBBON_WIDTH`; after-group likewise with `naturalX: plotAreaOffset + plotAreaWidth`. Ribbons get `zIndex: 6` (above grid cells/overlays at ≤ 5, below the tooltip which must be checked and raised if needed).

- [ ] **Step 3: Programmatic scroll on intent**

`useEffect` on `[chartData, plotAreaWidth, fold.block]`: if `scrollContainerRef.current && fold.scrollIntent.current`, `setTimeout(350)` then `el.scrollLeft = intent === 'end' ? el.scrollWidth : 0` and clear the intent; clean up the timer. On mount with `fold.enabled === false` (phones, short cycles) the hook still sets the intent to the anchor side on cycle-id change, so active cycles wider than the container open at the end on every screen size.

- [ ] **Step 4: Clear hover/pinned state for folded days**

`useEffect` on `[displayDayRange]`: if `hoveredDayNumber`/`pinnedDayNumber` is outside the range, reset them (and `pinnedCrosshairX`, `crosshairX`, the matching refs at `:136-141`).

- [ ] **Step 5: tsc + suite** — `cd app && npx tsc --noEmit -p . && npx vitest run` → PASS.

- [ ] **Step 6: Verify by eye**

Default view (scrolled to today): "+ Jul" "+ Aug" ribbons sit at the chart's visible left edge over the September columns; scroll left → they slide until they rest left of 1 Sep; scroll right again → they stick. Past-cycle check (temporarily mark the long cycle ended in the local DB, or use an ended long cycle): opens on day 1 with after-ribbons at the visible right edge; scroll to the end → they rest past the last day. Pin a tooltip on 20 Sep, fold September → tooltip gone. Clicking a pinned ribbon does **not** pin a tooltip on the column under it.

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart-folding): pin ribbons to the visible edges; scroll to the anchor side on load and fold actions"
```

---

### Task 8: Phone fix — chart scrolls inside its card; open on latest everywhere

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:1193` (page column class)

- [ ] **Step 1: Constrain the page column**

`className="flex-1 p-4 md:p-8 max-w-6xl"` → `className="flex-1 min-w-0 p-4 md:p-8 max-w-6xl"`.

- [ ] **Step 2: Verify at 400 px wide** (Playwright/devtools device mode)

`document.documentElement.scrollWidth === window.innerWidth` on the chart page; the chart's `overflow-x-auto` div has `scrollWidth > clientWidth` and, for the active long cycle, `scrollLeft === scrollWidth − clientWidth` ~0.5 s after load (day 105 visible). Title, "Cycle +" button, the yellow banner, the thermal-shift card and its Confirm/Adjust/Reject buttons all fit the viewport. Open a ≤ 40-day cycle: the chart scrolls inside the card; nothing else moved. Open the Notes editor sheet from a day — it still renders correctly.

- [ ] **Step 3: tsc + suite** — `cd app && npx tsc --noEmit -p . && npx vitest run` → PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "fix(chart): let the chart scroll inside its card on phones so long cycles open on the latest day"
```

---

### Task 9: Final verification and branch finish

**Files:** none new.

- [ ] **Step 1: Full checks** — `cd app && npx tsc --noEmit -p . && npx vitest run` → all green; `git status` clean apart from gitignored `.superpowers/`, `.codex-reviews/`.

- [ ] **Step 2: Regression pass on short cycles at 1440 px and 1000 px** — a 28-day ended cycle (gray tail intact), a 34-day cycle; thermal-shift card, hover tooltip, touch (devtools) all as on `main`; only differences: month-row line at y = 21 and ≥ 4-month colour cycling.

- [ ] **Step 3: Confirm nothing personal is staged** — `git log --stat main..HEAD | grep -i "sql\|cycle8\|local-long"` → no output.

- [ ] **Step 4: Hand over** — use `superpowers:finishing-a-development-branch`.
