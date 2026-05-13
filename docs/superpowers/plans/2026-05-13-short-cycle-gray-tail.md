# Short-Cycle Gray-Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every ended cycle with a 28-day frame. For ended cycles where `recordedMaxDay < 28`, the cells beyond `recordedMaxDay` form a muted, inert "gray tail" — visually preserving the chart's rhythm while marking those days as definitively-empty.

**Architecture:** Single architectural change in `CycleChartPage.tsx`: unify `displayDayRange.maxDay` to `Math.max(28, recordedMaxDay)` for both active and ended cycles, then propagate a per-day `isTail = !cycle.isActive && dayNumber > recordedMaxDay` boolean through the existing render path. Every row's per-cell render gates styling and event handlers on `isTail`. The Sensiplan coverline (today an Apex `annotations.yaxis` line spanning the full plot width) is replaced with a custom React/SVG overlay limited to the recorded x-extent so it doesn't bleed into the tail.

**Tech Stack:** Wasp 0.19, React + TypeScript, Tailwind, ApexCharts (via `react-apexcharts`). Tests run with `npm test` (vitest) from the `app/` directory. Lint runs with `npm run lint`. Conventional commit prefixes (`feat`, `fix`, `refactor`, `docs`).

**Source spec:** [docs/superpowers/specs/2026-05-13-short-cycle-gray-tail-design.md](../specs/2026-05-13-short-cycle-gray-tail-design.md) — re-read it before starting; it explains every "why" and contains the visual treatment tables.

**Branch:** `fix/short-cycle-gray-tail` (already checked out in `/Users/olgapak/work/cycle-path`, currently 4 commits ahead of `main` — all spec/docs).

**Convention:** Always work from the `app/` directory for `npm test`, `npm run lint`. Commit after every green task.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/src/cycle-tracking/utils.ts` | modify | Add `isCycleDayInTail(cycle, dayNumber, recordedMaxDay)` pure predicate. |
| `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` | modify | Add a `describe('isCycleDayInTail', …)` block. |
| `app/src/cycle-tracking/CycleChartPage.tsx` | modify | All the visual + behavioral changes — unified `displayDayRange.maxDay`, memoized `recordedMaxDay`, gated `monthSpans` input, per-row `isTail`-gated styling, custom coverline overlay, inert hover/click in the tail. |

No new files. The custom coverline overlay lives inline in `CycleChartPage.tsx` for now; if it grows past ~40 lines, extract to a sibling component file.

---

## Task 1: Add `isCycleDayInTail` helper (TDD)

**Files:**
- Modify: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `app/src/cycle-tracking/__tests__/headerHelpers.test.ts`. Also update the import line at the top to include `isCycleDayInTail`:

```ts
// At the top of the file, replace the existing import:
import {
  getDayOfWeekAbbreviationChip,
  buildMonthSpans,
  computeContainerMinWidth,
  LEFT_PLOT_RESERVE_FALLBACK,
  RIGHT_PLOT_RESERVE,
  MIN_CELL_WIDTH,
  isCycleDayInTail,
  type MonthSpan,
} from '../utils';
```

Then append at the bottom of the file:

```ts
describe('isCycleDayInTail', () => {
  it('returns false for active cycles at any dayNumber', () => {
    const active = { isActive: true };
    expect(isCycleDayInTail(active, 1, 5)).toBe(false);
    expect(isCycleDayInTail(active, 5, 5)).toBe(false);
    expect(isCycleDayInTail(active, 28, 5)).toBe(false);
    expect(isCycleDayInTail(active, 6, 5)).toBe(false);
  });

  it('returns false for ended cycles within the recorded range', () => {
    const ended = { isActive: false };
    expect(isCycleDayInTail(ended, 1, 8)).toBe(false);
    expect(isCycleDayInTail(ended, 5, 8)).toBe(false);
    expect(isCycleDayInTail(ended, 8, 8)).toBe(false);
  });

  it('returns true for ended cycles beyond the recorded max day', () => {
    const ended = { isActive: false };
    expect(isCycleDayInTail(ended, 9, 8)).toBe(true);
    expect(isCycleDayInTail(ended, 14, 8)).toBe(true);
    expect(isCycleDayInTail(ended, 28, 8)).toBe(true);
  });

  it('returns false at the exact boundary (dayNumber === recordedMaxDay)', () => {
    expect(isCycleDayInTail({ isActive: false }, 8, 8)).toBe(false);
  });

  it('returns false for ended cycles whose recordedMaxDay >= 28 (long cycles)', () => {
    const ended = { isActive: false };
    expect(isCycleDayInTail(ended, 28, 35)).toBe(false);
    expect(isCycleDayInTail(ended, 35, 35)).toBe(false);
    // numbers above recordedMaxDay still tail, but in practice displayDayRange
    // wouldn't extend past recordedMaxDay for long cycles so the chart wouldn't ask.
    expect(isCycleDayInTail(ended, 36, 35)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -- headerHelpers.test.ts`

Expected: FAIL on the missing `isCycleDayInTail` export.

- [ ] **Step 3: Implement the helper**

In `app/src/cycle-tracking/utils.ts`, append after the existing `computeContainerMinWidth` function:

```ts
/**
 * True for cells beyond the last recorded day of an ENDED cycle.
 * Always false for active cycles — they keep today's full-color behavior
 * for padded future days, because "future" reads as "to be filled in,"
 * not "definitively empty."
 *
 * Used by CycleChartPage.tsx to gate gray-tail styling and inert
 * hover/click behavior. See docs/superpowers/specs/2026-05-13-short-cycle-gray-tail-design.md.
 */
export function isCycleDayInTail(
  cycle: { isActive: boolean },
  dayNumber: number,
  recordedMaxDay: number,
): boolean {
  return !cycle.isActive && dayNumber > recordedMaxDay;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm test -- headerHelpers.test.ts`

Expected: PASS — `isCycleDayInTail` block all green plus 27 previous tests still passing.

- [ ] **Step 5: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/utils.ts src/cycle-tracking/__tests__/headerHelpers.test.ts`

Expected: clean (any unrelated repo-wide lint errors are pre-existing).

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/headerHelpers.test.ts
git commit -m "feat(chart): add isCycleDayInTail predicate

Pure helper for gray-tail detection on ended short cycles. Drives the
visual mute + inert handlers in CycleChartPage.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Unify `displayDayRange.maxDay` formula and memoize `recordedMaxDay`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (lines 207–225)

- [ ] **Step 1: Read the current `displayDayRange` block**

The current implementation at `CycleChartPage.tsx:207-225` uses `cycle.endDate` (truthy means ended) to branch the formula. We're changing it to a single unified formula and exposing `recordedMaxDay` as a separate memo for downstream tasks to consume.

- [ ] **Step 2: Replace the `displayDayRange` block**

Replace lines 207–225 with:

```ts
const recordedMaxDay = useMemo(() => {
  if (!cycle || cycle.days.length === 0) return 0;
  return Math.max(...cycle.days.map((day: any) => day.dayNumber));
}, [cycle]);

const displayDayRange = useMemo(() => {
  if (!cycle) {
    return { minDay: 1, maxDay: 28 };
  }
  // Unified formula: every cycle (active or ended) shows at least 28 days.
  // For ended cycles where recordedMaxDay < 28, cells [recordedMaxDay+1..28]
  // form the gray tail (see isCycleDayInTail). For long cycles
  // (recordedMaxDay > 28), the range expands naturally to recordedMaxDay.
  return { minDay: 1, maxDay: Math.max(28, recordedMaxDay) };
}, [cycle, recordedMaxDay]);
```

- [ ] **Step 3: Run the full test suite to catch regressions**

Run: `cd app && npm test`

Expected: PASS for the cycle-tracking unit tests (NoteEditorSheet may fail due to a pre-existing React-duplication issue in this test setup — note in commit message if so).

- [ ] **Step 4: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

Expected: clean.

- [ ] **Step 5: Manual visual check (no tail styling yet — just confirm padding works)**

Start the dev server: `cd app && wasp start` (or, if a preview tool is available, use that).

Open Cycle #6 (the 8-day ended cycle). Confirm:
- The chart now renders **28 cells**, not 8.
- Cells 9–28 are completely empty (no chips, no underlines, no data) — they will look raw and wrong, which is fine because Task 4 onwards adds the styling.
- Cells 1–8 still show their recorded data in full color.

Don't worry about the visual ugliness — it gets fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): unify displayDayRange.maxDay to Math.max(28, recordedMaxDay)

Active and ended cycles now use the same range formula. recordedMaxDay
is memoized separately so downstream tasks (gutter clamp, isTail gates)
can reference it without re-deriving.

After this commit, short ended cycles render 28 cells but cells beyond
recordedMaxDay are empty/unstyled — fixed by subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Clamp `monthSpans` input for ended cycles

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (line 448 area — the `monthSpans` memo)

- [ ] **Step 1: Locate the `monthSpans` memo**

The memo currently lives at approximately `CycleChartPage.tsx:448`. It calls `buildMonthSpans(cycleStartDate, displayDayRange.minDay, displayDayRange.maxDay)`.

- [ ] **Step 2: Compute `gutterMaxDay` and pass it to `buildMonthSpans`**

Replace the current `monthSpans` memo with:

```ts
const monthSpans = useMemo(() => {
  // Defensive assertion: today's chart always passes minDay=1; if a future
  // caller violates this contract, the cycle-relative monthIndex coloring
  // breaks (see MonthSpan JSDoc in utils.ts).
  if (displayDayRange.minDay !== 1) {
    // eslint-disable-next-line no-console
    console.warn(
      'CycleChartPage: monthSpans assumes displayDayRange.minDay === 1 for cycle-relative coloring; got',
      displayDayRange.minDay,
    );
  }

  // For ended cycles, clamp the gutter range to recordedMaxDay so colored
  // month pills don't render over the gray tail. Active cycles keep the
  // full displayDayRange — their padded [recordedMaxDay+1..28] cells render
  // in full color (today's behavior). Long ended cycles
  // (recordedMaxDay >= 28) get a no-op clamp.
  const cycleStartDate = cycle ? new Date(cycle.startDate) : new Date();
  const gutterMaxDay = cycle?.isActive
    ? displayDayRange.maxDay
    : Math.min(displayDayRange.maxDay, recordedMaxDay);

  return buildMonthSpans(cycleStartDate, displayDayRange.minDay, gutterMaxDay);
}, [cycle, displayDayRange, recordedMaxDay]);
```

Note: keep the existing `cycleStartDate` construction style consistent with what the file already does — if there's a memoized `cycleStartDate` elsewhere, use it; otherwise inline as above.

- [ ] **Step 3: Manual visual check**

Refresh the dev server. Open Cycle #6 (8-day ended). Confirm:
- The "December" month pill above the date row spans only cells 1–7 (Dec 25–31).
- The "January" month pill spans only cell 8 (Jan 1).
- **No green or slate-colored month pill appears over cells 9–28.**

If a colored pill still appears over cells 9–28, the clamp isn't firing — check that `cycle.isActive` is false for Cycle #6 (it should be, since the cycle is ended).

- [ ] **Step 4: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): clamp month-gutter pills to recordedMaxDay for ended cycles

For short ended cycles padded to 28 cells, the month-gutter pills used
to render across the full 28-cell width — putting a colored January
pill over the gray-tail region. Now the gutter input is clamped to
min(displayMaxDay, recordedMaxDay) when !cycle.isActive. Active cycles
keep today's behavior (full-width pills).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Apply tail styling to the top three rows (Date / Week Day / Cycle Day)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (the Date, Week Day, and Cycle Day row renderers — search for the row labels)

- [ ] **Step 1: Find the row renderers**

Run `grep -n 'Date\|Week Day\|Cycle Day' app/src/cycle-tracking/CycleChartPage.tsx | head` from the repo root to locate the three row blocks. Each row is rendered via a `.map(...)` over `displayDayRange`'s day numbers, producing a styled cell per day.

- [ ] **Step 2: For each day cell, compute `isTail` and gate the styling**

For every per-day cell in the **Date row**, the **Week Day row**, and the **Cycle Day row**, add at the top of the map callback:

```ts
const isTail = isCycleDayInTail(cycle, dayNumber, recordedMaxDay);
```

(Import `isCycleDayInTail` at the top of the file if not already imported.)

Then wrap the existing styling with `isTail` branches.

**Date row tail styling:**

```tsx
// Cell background
<div
  className={clsx(
    'date-cell',  // your existing classes
    isTail && 'bg-[#f8fafc]',  // slate-50 tail background
  )}
>
  {/* Date number */}
  <span
    className={clsx(
      'text-xs',
      isTail ? 'text-[#94a3b8]' : palette.dateText,  // slate-400 in tail
    )}
  >
    {dateStr}
  </span>
  {/* Underline */}
  <div
    className="h-[2px] w-3"
    style={{ background: isTail ? '#cbd5e1' : palette.underline }}
  />
</div>
```

**Week Day row tail styling (chip):**

```tsx
<div className={clsx('weekday-cell', isTail && 'bg-[#f8fafc]')}>
  <span
    className="chip"
    style={
      isTail
        ? { background: '#e2e8f0', color: '#64748b' }  // slate-200 / slate-500
        : { background: palette.chipBg, color: palette.chipText }
    }
  >
    {weekdayLabel}
  </span>
</div>
```

**Cycle Day row tail styling (chip):**

```tsx
<div className={clsx('cycle-day-cell', isTail && 'bg-[#f8fafc]')}>
  <span
    className="chip"
    style={
      isTail
        ? { background: '#e2e8f0', color: '#64748b' }
        : { background: palette.chipBg, color: palette.chipText }
    }
  >
    {dayNumber}
  </span>
</div>
```

**Important:** the existing intercourse-color override on the Cycle Day chip (`dayData.hadIntercourse → text #ec4899`) must be skipped when `isTail` is true. There is no recorded data in the tail, so no intercourse can have occurred there.

- [ ] **Step 3: Disable hover wash and click in the tail (HTML cell level)**

In each of the three rows, wherever a click handler or hover-wash effect is attached, gate it on `!isTail`:

```tsx
onClick={isTail ? undefined : () => handleCellClick(dayNumber)}
onMouseEnter={isTail ? undefined : () => handleCellHover(dayNumber)}
style={{
  ...existingStyles,
  cursor: isTail ? 'default' : 'pointer',
}}
```

(The canvas-level handlers are gated in Task 8.)

- [ ] **Step 4: Manual visual check**

Refresh the dev server. Open Cycle #6 (8-day ended). Confirm:
- Cells 1–8: full color (blue chips for Dec, green for Jan 1) — unchanged from today.
- Cells 9–28 in **Date row**: slate-50 background, slate-400 date numbers, slate-300 underlines.
- Cells 9–28 in **Week Day row**: slate-50 background, slate-200 chips with slate-500 letters.
- Cells 9–28 in **Cycle Day row**: slate-50 background, slate-200 chips with slate-500 numbers.
- Hovering a tail cell does **not** light up the hover wash.
- Clicking a tail cell does **not** open the note editor.

- [ ] **Step 5: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): gray-tail styling for Date / Week Day / Cycle Day rows

For ended short cycles, cells beyond recordedMaxDay now render with
slate-50 backgrounds, slate-200 chips, slate-500 chip text, slate-400
date numbers, and slate-300 underlines. Hover wash and click handlers
are gated on !isTail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Apply tail styling to the lower rows

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (Time Stamp ~line 1894, LH Test ~1958, Intimacy ~2055, Cervical Fluid + Menstrual Flow ~2117, Disturbance ~2287, Notes ~2304)

- [ ] **Step 1: Compile the complete row list**

The lower rows (in render order):
1. Time Stamp (~line 1894)
2. LH Test (~line 1958)
3. Intimacy / Intercourse (~line 2055)
4. Cervical Fluid (~line 2117)
5. Menstrual Flow (~line 2117 — same block)
6. Disturbance (~line 2287)
7. Notes (~line 2304)

Each is rendered as an absolutely-positioned row below the BBT plot, looping over the displayed day range.

- [ ] **Step 2: Understand each row's existing interaction model — don't change it**

Today's lower rows have **different interaction patterns** that must be preserved. Do NOT add a generic `onClick` to every row.

> **Line-number caveat:** the line numbers below are snapshots taken at plan-write time. If the file has drifted, grep for the row's section comment (e.g. `Time Stamp Row`, `LH Test Row`, `Disturbance Row`) to relocate it. The pattern (grid-cell `pointerEvents` and presence/absence of `onClick`) is what matters, not the exact line.

| Row | Current `pointerEvents` (grid cell) | Current `onClick` |
|---|---|---|
| Time Stamp (line ~1894) | `none` (cell at line 1942) | none |
| LH Test (line ~1958) | `none` (cell at line 2044) | none |
| Intimacy (line ~2055) | `none` (cell at line 2104) | none |
| Cervical Fluid (line ~2117) | `none` (cell at line 2178) | none |
| Menstrual Flow (line ~2117) | `none` (cell at line 2391 — adjacent block) | none |
| Disturbance (line ~2287) | `none` (cell at line 2391) | none (pure visual) |
| Notes (line ~2304) | `auto` (cell at line 2453) | `() => setEditorOpenForDay(dayNumber)` (line 2438) |

Note: line 2325 has `pointerEvents: 'auto'` but that's the **Notes-row toggle label** (the row's left axis label that controls row collapse), not a grid cell. Don't touch it.

The rule is: **preserve each row's existing interaction; only gate existing handlers and content rendering on `isTail`.** Don't introduce new click handlers.

- [ ] **Step 3: For each row, apply the tail treatment to the cell**

The per-cell pattern (adapted to each row's existing structure):

```tsx
const isTail = isCycleDayInTail(cycle, dayNumber, recordedMaxDay);

return (
  <div
    key={dayNumber}
    className={clsx(
      'row-cell',  // existing classes — keep as-is
      isTail && 'bg-[#fafafa]',  // add tail background
    )}
    style={{
      ...existingPositionAndSize,
      // KEEP the existing pointerEvents value — do not change.
      // Only the Notes row's grid cells have pointerEvents: 'auto'
      // (line 2453); ALL other lower-row grid cells keep
      // pointerEvents: 'none' (including Disturbance at line 2391).
      // Don't override.
    }}
    // If the row had an existing onClick (only Notes today), wrap it:
    onClick={existingOnClick ? (isTail ? undefined : existingOnClick) : undefined}
  >
    {!isTail && (
      <>
        {/* existing row content — keep entirely as-is */}
      </>
    )}
  </div>
);
```

Concretely for each row:

**a. Time Stamp row (~line 1894):**
- Add `bg-[#fafafa]` to the cell className when `isTail`.
- Gate the existing `{timeData && ...}` content render with `!isTail && (...)` so the time text doesn't show in the tail.
- Don't touch `pointerEvents: 'none'`. Don't add an `onClick`.

**b. LH Test row (~line 1958):**
- Same pattern as Time Stamp. Gate the OPK chip render on `!isTail`. Keep `pointerEvents: 'none'`.

**c. Intimacy row (~line 2055):**
- Same pattern. Gate the intimacy marker (heart icon / dot) render on `!isTail`. Keep `pointerEvents: 'none'`.

**d. Cervical Fluid row (~line 2117):**
- Same pattern. Gate the fluid-quality icon/color render on `!isTail`. Keep `pointerEvents: 'none'`.

**e. Menstrual Flow row (~line 2117 — adjacent block):**
- Same pattern. Gate the flow bar render on `!isTail`. Keep `pointerEvents: 'none'`.

**f. Disturbance row (~line 2287):**
- The disturbance row's grid cells have `pointerEvents: 'none'` (line 2391) and no `onClick` — purely visual. Add `bg-[#fafafa]` for `isTail`; gate the disturbance pills render on `!isTail`. Keep `pointerEvents: 'none'` (no change).

**g. Notes row (~line 2304):**
- This is the only lower row with an existing onClick. At line 2438: `onClick={() => setEditorOpenForDay(dayNumber)}`. Wrap that with `isTail`:
  ```tsx
  onClick={isTail ? undefined : () => setEditorOpenForDay(dayNumber)}
  ```
- Add `bg-[#fafafa]` for `isTail`.
- Gate the note indicator render on `!isTail`.
- Keep `pointerEvents: 'auto'` for non-tail cells; effectively the `onClick` becoming `undefined` for tail cells means clicks are ignored, which is the desired inert behavior.

Key requirements per the spec:
- **No row content in the tail** — no period flow bars, OPK chips, intimacy markers, disturbance pills, cervical-fluid icons, time-stamp text, or note indicators. Verify each.
- **Row borders preserved** — the row's structural borders (top/bottom) stay so the row reads as the same row, just empty.
- **Same `#fafafa` background everywhere** — applied uniformly across all 7 lower rows in the tail.
- **No new click handlers introduced** — only the existing Notes-row onClick gets gated.

- [ ] **Step 4: Manual visual check**

Refresh the dev server. Open Cycle #6 (8-day ended). Confirm for each of the 7 lower rows:
- Cells 1–8: full content as before (any recorded data shows; click-to-open behavior on Notes unchanged).
- Cells 9–28: `#fafafa` background, **completely empty** (no icons, dots, or labels).
- Row borders visible across all 28 cells.

Pay specific attention to Cervical Fluid and Menstrual Flow — they're stacked in the same row block and easy to miss one. Also Disturbance, which often has subtle visual indicators that could leak through.

Additionally verify the Notes row interaction is preserved correctly:
- Click a recorded Notes cell (1–8) → note editor opens (today's behavior).
- Click a tail Notes cell (9–28) → nothing happens.

- [ ] **Step 5: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): gray-tail styling for the 7 lower rows

Time Stamp, LH Test, Intimacy, Cervical Fluid, Menstrual Flow,
Disturbance, and Notes rows now all show #fafafa backgrounds in the
gray tail with no row content rendered. Row borders preserved. Existing
interaction model preserved per row — most rows kept pointerEvents:
'none' with no onClick; only the Notes row had an existing onClick
(setEditorOpenForDay) which is now gated on !isTail. No new click
handlers introduced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Apply tail background to the BBT plot zone

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (the BBT plot region — search for `apexcharts` or the chart container near `plotAreaTop`/`plotAreaHeight`)

The BBT plot area is rendered by Apex inside an SVG canvas; we can't easily change its cell-by-cell background via the row-cell pattern. Instead, overlay a semi-transparent or solid `#fafafa` div over the tail portion of the plot area.

- [ ] **Step 1: Locate the chart container that wraps the BBT plot**

The chart container has `data-chart-container="cycle-chart"`. Inside it, the Apex chart sits between `plotAreaTop` and `plotAreaTop + plotAreaHeight`, spanning `plotAreaOffset` to `plotAreaOffset + plotAreaWidth` horizontally.

- [ ] **Step 2: Make the Apex chart background transparent**

In the chart options block (the same area as the `annotations` config, around line 700–880), explicitly set the chart background to transparent so a div positioned BEHIND the Apex SVG can show through:

```ts
chart: {
  // ... existing options ...
  background: 'transparent',
  // If a theme.mode setting is present, ensure it's compatible with the
  // transparent background — typically `theme.mode: 'light'` is fine.
},
```

This makes Apex's chart-area background empty pixels (transparent), so anything sitting behind the canvas shows through. By default Apex's plot area already doesn't fill itself with white; making it explicit guards against future regressions if Apex's defaults change.

- [ ] **Step 3: Add the tail background overlay BEHIND the Apex SVG**

Insert a new absolutely-positioned div as a sibling of the chart canvas, with `z-index: 0` so it sits behind the Apex SVG (which defaults to z-index `auto`, effectively above z-index `0`). The Apex SVG itself contains the gridlines and BBT line; the tail div sits behind it and shows through the chart's transparent background:

```tsx
{/* Gray-tail background — sits BEHIND the Apex SVG (z-index: 0). Because
    we set chart.background = 'transparent' (see Step 2), the chart-area
    pixels are transparent, so this div's #fafafa fill shows through in
    the tail region. Apex's gridlines and BBT line render inside the SVG
    above z-index 0, so they remain visible on top of the tail fill. */}
{cycle && !cycle.isActive && recordedMaxDay < displayDayRange.maxDay && plotAreaWidth > 0 && (
  <div
    aria-hidden="true"
    style={{
      position: 'absolute',
      top: `${plotAreaTop}px`,
      height: `${plotAreaHeight}px`,
      left: `${plotAreaOffset + (recordedMaxDay / (displayDayRange.maxDay - displayDayRange.minDay + 1)) * plotAreaWidth}px`,
      width: `${plotAreaWidth - (recordedMaxDay / (displayDayRange.maxDay - displayDayRange.minDay + 1)) * plotAreaWidth}px`,
      background: '#fafafa',
      pointerEvents: 'none',
      zIndex: 0, // explicitly behind the Apex SVG (which is z-index auto)
    }}
  />
)}
```

Explanation of the x-math: the plot area shows `numDays = displayDayRange.maxDay - displayDayRange.minDay + 1` cells. The tail starts at cell index `recordedMaxDay` (since dayNumbers are 1-indexed, the right edge of cell `recordedMaxDay` is at position `recordedMaxDay / numDays` × `plotAreaWidth` from the plot area's left edge).

The chart container that holds both the Apex chart and these overlays must have `position: relative` (it already does, since other overlays like the thermal-shift band rely on this — verify in code).

- [ ] **Step 4: Manual visual check**

Refresh the dev server. Open Cycle #6 (8-day ended). Confirm in the BBT plot region:
- Cells 1–8: white background as before, BBT line + dots visible.
- Cells 9–28: `#fafafa` gray background.
- **Horizontal gridlines run unbroken across all 28 cells, fully visible in the tail.** Verify this by eye — if any gridline disappears in the tail, the layering is wrong.
- BBT line **does NOT extend into the tail** (Apex naturally stops it at the last data point).

If gridlines disappear in the tail, that means Apex's SVG is not on top of the tail div. The most likely culprit is the Apex container having `z-index: 0` or `auto` while not being a positioned element. Verify the chart's wrapping element (`.apexcharts-canvas` or the React wrapper around `<Chart />`) is positioned and has a higher z-index than 0 — if not, give it `position: relative; z-index: 1`.

- [ ] **Step 5: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): tail background overlay for BBT plot region

For ended short cycles, the BBT plot region beyond recordedMaxDay now
shows a #fafafa background overlay. Implementation: set chart.background
to transparent so an absolutely-positioned div sitting BEHIND the Apex
SVG shows through. Horizontal gridlines continue unbroken through the
tail (they render inside the Apex SVG above the tail div); the BBT line
+ dots stop at recordedMaxDay naturally. The overlay is gated on
!cycle.isActive && recordedMaxDay < displayMaxDay so active cycles and
long ended cycles are unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Replace coverline Apex annotation with custom React/SVG overlay

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (lines 725–763 — the `annotations.yaxis` block; and the chart-container body — somewhere near the existing thermal-shift overlays)

The Apex `annotations.yaxis` coverline spans the full plot width. With `maxDay = 28`, it would draw straight through the gray tail. Replace it with a custom overlay that's limited to the recorded x-extent.

- [ ] **Step 1: Remove the existing Apex coverline annotation**

In the chart options block at lines 725–763, replace the body of the `annotations.yaxis` IIFE with `return [];`. Keep the surrounding `annotations: { yaxis: ... }` structure so any other yaxis annotations (currently none, but future-proof) still have a place to live. Or, if cleaner, remove the `annotations` key entirely if no other annotations exist.

Concretely, lines 725–763 currently look like:

```ts
annotations: {
  yaxis: (() => {
    if (!interpretation || !engineResult) return [];
    // ... 40+ lines of coverline annotation construction ...
    return [{
      y: coverlineDisplay,
      borderColor: style.color,
      // ...
    }];
  })(),
},
```

Replace with:

```ts
annotations: {
  yaxis: [], // Coverline moved to a custom React overlay — see "Coverline overlay" below.
},
```

**Don't delete the coverline-computation code yet** — we're going to reuse it in the next step.

- [ ] **Step 2: Compute the coverline data via a new memo**

Above the `annotations` block (somewhere near the existing memos), add:

```ts
// Coverline data for the custom React overlay (replaces the
// annotations.yaxis entry, which spanned the full plot width and
// drew through the gray tail). See spec section "BBT plot zone".
//
// IMPORTANT: guard !settings and !cycle at the top — this memo runs
// before the component's loading-return when only some deps have
// arrived, and we deref settings.temperatureUnit / cycle.* below.
const coverlineOverlay = useMemo(() => {
  if (!settings || !cycle || !interpretation || !engineResult) return null;
  const shift = engineResult.thermalShift;
  const state = interpretation.state;

  const coverlineC = getActiveCoverline(cycleDayInputs, interpretation, shift);
  const isMarked =
    !!(cycle as any).markedAnovulatoryAt || !!(cycle as any).markedUninterpretableAt;
  if (coverlineC == null || state === 'DISMISSED' || isMarked) return null;

  const coverlineDisplay = toDisplayTemperature(coverlineC, settings.temperatureUnit);

  const styleMap: Record<string, { color: string; dash: number; opacity: number }> = {
    SUGGESTED: { color: '#8b5cf6', dash: 6, opacity: 0.6 },
    CONFIRMED: { color: '#059669', dash: 0, opacity: 1 },
    ADJUSTED: { color: '#d97706', dash: 0, opacity: 1 },
  };
  const style = styleMap[state] ?? styleMap.SUGGESTED;

  return {
    yValue: coverlineDisplay,
    labelText: formatTemperature(coverlineC, settings.temperatureUnit),
    color: style.color,
    dash: style.dash,
    opacity: style.opacity,
  };
}, [settings, cycle, interpretation, engineResult, cycleDayInputs]);
```

- [ ] **Step 3: Render the coverline overlay inside the chart container**

Inside the same JSX block where the BBT tail background overlay lives (from Task 6), add the coverline overlay. Place it **after** the tail-background overlay so it sits on top of it (the coverline should be visible against the recorded portion's white background; it must NOT extend over the tail).

```tsx
{/* Custom Sensiplan coverline overlay. For ended short cycles with a
    gray tail, the line is clipped to the recorded x-extent and the
    label sits INSIDE the recorded portion. For all other cycles
    (active, or long ended with no tail), the line spans the full plot
    width and the label sits at the right edge — preserving today's
    visual appearance. Replaces the Apex annotations.yaxis line that
    used to span the full plot width. */}
{coverlineOverlay && plotAreaWidth > 0 && yAxisRange && cycle && (() => {
  const numDays = displayDayRange.maxDay - displayDayRange.minDay + 1;

  // Does this cycle have a gray tail? Only then do we clip.
  const hasTail = !cycle.isActive && recordedMaxDay < displayDayRange.maxDay;

  const lineX1 = plotAreaOffset;
  const lineX2 = hasTail
    ? plotAreaOffset + (recordedMaxDay / numDays) * plotAreaWidth
    : plotAreaOffset + plotAreaWidth; // active or long-ended: full width, today's behavior

  // Map yValue to a pixel y-coordinate. yAxisRange is { min, max }; the
  // plot's y-axis is inverted (min at the bottom, max at the top).
  const yFrac =
    (yAxisRange.max - coverlineOverlay.yValue) /
    (yAxisRange.max - yAxisRange.min);
  const lineY = plotAreaTop + yFrac * plotAreaHeight;

  // Label position: anchored to the right end of the line, but always
  // inside the recorded region for tail cycles. For non-tail cycles,
  // sit just past the line's right end (today's behavior).
  // Using SVG text-anchor='end' lets us right-align the label.
  const labelX = hasTail ? lineX2 - 4 : lineX2 + 4;
  const labelAnchor = hasTail ? 'end' : 'start';

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <line
        x1={lineX1}
        x2={lineX2}
        y1={lineY}
        y2={lineY}
        stroke={coverlineOverlay.color}
        strokeOpacity={coverlineOverlay.opacity}
        strokeWidth={1.5}
        strokeDasharray={coverlineOverlay.dash > 0 ? `${coverlineOverlay.dash}` : undefined}
      />
      <text
        x={labelX}
        y={lineY - 4}
        textAnchor={labelAnchor}
        fill={coverlineOverlay.color}
        fontSize="10"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
      >
        {coverlineOverlay.labelText}
      </text>
    </svg>
  );
})()}
```

If `yAxisRange` isn't yet exposed as a usable shape, look at how `ThermalShiftBand` consumes it (around line 1655) and follow the same pattern.

**Notes on the label position change:**
- For **active cycles** and **long ended cycles** (no tail): label remains at `lineX2 + 4` with `text-anchor='start'` — identical to today's visual (label just past the line's right end).
- For **short ended cycles** (with tail): line clips at `recordedMaxDay`, label sits at `lineX2 - 4` with `text-anchor='end'` — i.e. the label's right edge is just inside the line's right end. This keeps the label entirely within the recorded portion.
- The y-position shifted from `lineY + 4` (below the line) to `lineY - 4` (above the line) so that the right-anchored label doesn't overlap the line. Adjust per browser rendering if it looks off.

- [ ] **Step 4: Manual visual check**

Refresh the dev server. Open a cycle that has a confirmed coverline (e.g. a 28+ day cycle with thermal shift). Confirm:
- The coverline still appears as before, in the same color (purple/green/amber depending on state), at the same y-position.
- The label text appears immediately to the right of the line's right end.

Then open Cycle #6 (8-day ended). If Cycle #6 has a coverline (probably it doesn't, since 8 days is too short for Sensiplan to call a shift), no coverline should appear. If you have another short ended cycle that *does* have a coverline, confirm the line stops at `recordedMaxDay` and does NOT extend into the gray tail.

- [ ] **Step 5: Verify thermal-shift band and peak-day marker are not affected**

These are already React overlays keyed to recorded-data positions, but the spec calls out verifying. Open a cycle with a thermal-shift band visible. Confirm the band's left and right edges sit within the recorded portion (this should already be true).

- [ ] **Step 6: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): custom coverline overlay limited to recorded x-extent

Replaces the Apex annotations.yaxis line (which spanned the full plot
width) with a custom React/SVG overlay that stops at the recorded
boundary. Preserves the SUGGESTED / CONFIRMED / ADJUSTED color
styling and the trailing label. Necessary for the gray-tail design —
the old annotation would have drawn through the muted region.

Thermal-shift band and peak-day marker verified unaffected (they're
already React overlays keyed to recorded-data positions).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Add `isTail` guards to canvas hover, click, and touch handlers

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (the `useEffect` block starting at line ~939 — `resolveDay`, `handleMouseMove`, `handleClick`, `handleTouchStart`, `handleTouchMove`)

- [ ] **Step 1: Add an `isTail` early-return inside `resolveDay`**

`resolveDay` is defined at line ~953. After the existing day-resolution math (lines ~953–972) but **before** the `daysWithDataMap` check (line 974), add:

```ts
// Tail guard: in the gray tail of an ended short cycle, no tooltip
// or crosshair — the cell is decorative, not interactive. This is
// stricter than the daysWithDataMap check immediately below because
// it explicitly says "we mean for the tail to be inert," surviving
// any future change to daysWithDataMap's semantics.
if (isCycleDayInTail(cycle!, dayNumber, recordedMaxDay)) {
  lastTouchedDayRef.current = null;
  dismissTooltipRef.current();
  return;
}
```

- [ ] **Step 2: Add the same guard inside `handleClick`**

`handleClick` is defined at line ~987. After the day-resolution math (lines ~991–1007) and before `handleCellClickRef.current(dayNumber)` (line 1008), add:

```ts
if (isCycleDayInTail(cycle!, dayNumber, recordedMaxDay)) {
  // Click in the gray tail of an ended cycle — inert.
  dismissTooltipRef.current();
  return;
}
```

- [ ] **Step 3: Verify the touch handlers are covered**

`handleTouchStart` and `handleTouchMove` both route through `resolveDay` (lines ~1011, 1024), so the guard added in Step 1 automatically covers them. No additional changes needed.

If you find a touch handler that resolves a day independently of `resolveDay`, add the same guard there.

- [ ] **Step 4: Update the `useEffect` dependencies**

The `useEffect` that wires up these canvas listeners needs `recordedMaxDay` and `cycle` in its dependency array. Add them if not already present.

- [ ] **Step 5: Manual visual check**

Refresh the dev server. Open Cycle #6 (8-day ended). Confirm:
- Hovering over a cell in the **recorded** portion (cells 1–8) — crosshair + tooltip appear as before.
- Hovering over a cell in the **tail** (cells 9–28) — **no crosshair, no tooltip, no cursor change**. Even when moving the cursor over a tail cell's row.
- Clicking a cell in the recorded portion — opens the note editor as before.
- Clicking a cell in the tail — does nothing. Note editor does NOT open.
- Tapping (on a touch device or with touch-emulation) a tail cell — same: nothing happens.

- [ ] **Step 6: Lint**

Run: `cd app && npm run lint -- src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 7: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart): inert hover and click in the gray tail

Adds explicit isTail guards to the ApexCharts canvas listeners
(resolveDay, handleClick, touch handlers route through resolveDay).
In the tail of an ended short cycle, the crosshair, tooltip, and click
handler are all suppressed. The cursor stays at default.

The explicit guard is stricter than the existing
daysWithDataMap.get(dayNumber) check that already happened to dismiss
tooltips for no-data cells — survives any future change to that map's
semantics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: End-to-end browser smoke-test

**Files:** none — this is a verification task.

- [ ] **Step 1: Start the dev server**

```bash
cd app && wasp start
```

Wait for `Local: http://localhost:3000` and confirm the page loads at that URL.

- [ ] **Step 2: Verify Cycle #6 (8-day ended cycle) — the core target case**

Navigate to the chart for Cycle #6 (Dec 25 2025 – Jan 1 2026). Confirm every requirement from the spec's *Visual treatment* section:

**Month-label gutter:**
- "December" pill spans days 1–7.
- "January" pill spans day 8 only.
- No colored pill over days 9–28.

**Date row:**
- Cells 1–7: dates 25–31, blue underlines, dark text.
- Cell 8: date 1, green underline (Jan month boundary).
- Cells 9–28: slate-50 background, dates 2–21, slate-400 text, slate-300 underlines.

**Week Day row:**
- Cells 1–7: blue chips with weekday letters.
- Cell 8: green chip.
- Cells 9–28: slate-50 background, slate-200 chips, slate-500 letters.

**Cycle Day row:**
- Cells 1–7: blue chips numbered 1–7.
- Cell 8: green chip "8".
- Cells 9–28: slate-50 background, slate-200 chips numbered 9–28, slate-500 text.

**BBT plot:**
- BBT line + dots visible in cells 1–8, last dot at day 8.
- Cells 9–28: `#fafafa` background.
- **Horizontal gridlines run unbroken across all 28 cells** — critical check.
- No coverline visible (8-day cycle is too short for Sensiplan to detect a thermal shift).

**Lower rows (all 7):**
- Cells 1–8: any recorded data renders as before.
- Cells 9–28: `#fafafa` background, completely empty — no row content of any kind.

**Interactivity:**
- Hovering tail cells (any of the 9–28 range, any row): no crosshair, no tooltip, default cursor.
- Clicking tail cells: nothing happens (no note editor opens).
- Hovering recorded cells (1–8): crosshair + tooltip as before.
- Clicking recorded cells: note editor opens as before.

Take a screenshot of the chart for the record.

- [ ] **Step 3: Verify a 28-day ended cycle — no tail expected**

Navigate to a 28-day ended cycle (any cycle in your data with exactly 28 days). Confirm:
- 28 cells render.
- 0 gray-tail cells (all cells in full color).
- Visually identical to today's behavior (before this branch).

- [ ] **Step 4: Verify a long (35+ day) ended cycle — no tail expected**

Navigate to a 35+ day ended cycle. Confirm:
- All recorded days render in full color.
- No gray-tail cells.
- Horizontal scroll behavior preserved on a narrow viewport.

- [ ] **Step 5: Verify an active cycle — no tail expected**

Navigate to the currently-active cycle. Confirm:
- 28 cells (or more, if `recordedMaxDay > 28`) render.
- All cells in **full color**, including the padded future days (`recordedMaxDay+1..28`).
- Coverline (if present) renders normally.
- Today's behavior fully preserved — no regression.

- [ ] **Step 6: Verify a coverline on a longer ended cycle**

Find an ended cycle that has a Sensiplan thermal shift detected and a coverline rendered. Confirm:
- The coverline appears as a horizontal line at the expected y-position.
- The line color matches the state (purple/green/amber).
- The label appears immediately to the right.
- If the cycle is short and has a tail, the coverline **stops at `recordedMaxDay`** and does NOT extend into the tail.
- If the cycle is long with no tail, the coverline extends to the full recorded width as before.

- [ ] **Step 7: Lint the full directory**

Run from the repo root: `cd app && npm run lint`

Note any new lint errors introduced by this branch (pre-existing repo-wide errors are unrelated). Fix any new errors before commit.

- [ ] **Step 8: Final test run**

Run: `cd app && npm test`

Expected: cycle-tracking unit tests all pass. The NoteEditorSheet test file has a pre-existing React-duplication failure in this test environment — unrelated to this work.

- [ ] **Step 9: Document the smoke-test result**

Append a brief verification note to the spec's *Review log* section:

```markdown
- **2026-MM-DD — implementation verification:** All 9 implementation tasks complete. Browser smoke-test passed on Cycle #6 (8-day ended), a 28-day ended cycle, a 35+ day ended cycle, the currently-active cycle, and a long ended cycle with a Sensiplan coverline. No regressions observed; no lint errors introduced; cycle-tracking unit tests green (NoteEditorSheet failure is pre-existing and unrelated).
```

Commit it:

```bash
git add docs/superpowers/specs/2026-05-13-short-cycle-gray-tail-design.md
git commit -m "docs(spec): record implementation verification for gray-tail design

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Out of scope

- Any change to active-cycle rendering.
- Any change to long-ended-cycle (`recordedMaxDay ≥ 28`) rendering.
- Retroactive-data-entry feature for tail cells (they stay inert per the spec).
- Any new Sensiplan interpretation logic.
- Touching `MIN_CELL_WIDTH = 22`, `LEFT_PLOT_RESERVE_FALLBACK = 130`, `RIGHT_PLOT_RESERVE = 40`, or the long-cycle widening rule.
