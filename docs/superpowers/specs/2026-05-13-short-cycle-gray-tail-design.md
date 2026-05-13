# Short-Cycle Gray-Tail Design

**Author:** Olga Pak (via brainstorming)
**Date:** 2026-05-13
**Replaces:** The "short-cycle ceiling" approach (see *Background* below).
**Branch:** `fix/short-cycle-gray-tail` (reset from `fix/short-cycle-cell-ceiling` to `main`, then renamed; the 3 obsolete ceiling commits are orphaned in the reflog).

---

## Background

The D1-light chart redesign (merged in PR #8, branch `feat/graph-page-design-tweaks`) exposed a pre-existing layout artifact: short cycles render with awkwardly stretched cells. An 8-day Cycle #6 produced cells ~79 px wide, with the small ~20 px header chips lost in the middle of each cell. The chart looks proportionate at 28 days but progressively worse as `numDays` decreases.

A first fix was attempted on this branch (commits `ba0302b`, `773806b`, `e83804a`) — adding a `MAX_CELL_WIDTH = 50` ceiling symmetric to the existing `MIN_CELL_WIDTH = 22` floor. Browser smoke-testing showed the math worked but the visual result still felt unsatisfying: an 8-day cycle rendering at ~537 px wide with cells exactly at the 50-px ceiling still looked "cut off." The chart's frame felt incomplete.

**This spec replaces that fix entirely.** Instead of capping cell width on short cycles, we always render a 28-day frame and gray out the unrecorded tail.

---

## Goal

Make short ended cycles render at the same visual scale as a 28-day cycle — same cell width, same chart frame, same visual rhythm — by always rendering 28 cells. Cells beyond the cycle's last recorded day are styled as a "gray tail" (muted but visible), making the chart feel complete rather than truncated.

---

## Scope and rule

### When the gray tail applies

A single condition: the cycle is **ended** (`cycle.isActive === false`) **AND** `recordedMaxDay < 28`.

### Day-range formula (unified)

`displayDayRange.maxDay = Math.max(28, recordedMaxDay)` for **every** cycle — active or ended. Today's chart already uses this formula for active cycles; we extend it to ended cycles too.

### Per-cell `isTail` flag

For each day cell at `dayNumber` in the displayed range:

```
isTail = !cycle.isActive && dayNumber > recordedMaxDay
```

- Active cycles → always `false` (today's behavior preserved).
- Ended cycles, day ≤ recordedMaxDay → `false` (recorded, full color).
- Ended cycles, day > recordedMaxDay → `true` (gray tail).

### Acceptance criteria

| Scenario | Expected result |
|---|---|
| 1-day ended cycle | 28 cells rendered; 27 gray tail cells. |
| 8-day ended cycle (Cycle #6) | 28 cells; 20 gray tail cells. |
| 28-day ended cycle | 28 cells; 0 gray tail cells. Visually identical to today. |
| 35-day ended cycle | 35 cells; 0 gray tail cells. Long-cycle widening rule unchanged. |
| Any active cycle | `Math.max(28, recordedMaxDay)` cells; 0 gray tail cells. Today's behavior unchanged. |

---

## Visual treatment

### Month-label gutter (above the Date row)

The chart renders a per-month gutter pill (e.g. "December", "January") above the Date row via `monthSpans` (CycleChartPage.tsx line ~448) iterated at line ~1342. Today the pills cover the entire `displayDayRange`, so an 8-day ended cycle padded to 28 would render a colored "January" pill spanning days 8–28 — defeating the "tail = no chrome" intent.

**Rule:** the gutter follows the same gray-tail rule as the cells beneath it. For ended cycles, the pills cover only `[1..recordedMaxDay]`; no pill renders for any span entirely within the tail. For active cycles, the gutter is unchanged — pills cover the full displayed range, even the padded `[recordedMaxDay+1..28]` cells, since active cycles have no tail.

**Implementation:** gate the clamp on `!cycle.isActive` so it never fires for active cycles:

```ts
// today
const monthSpans = useMemo(() => buildMonthSpans(cycleStartDate, displayDayRange.minDay, displayDayRange.maxDay), [...]);
// after
const gutterMaxDay = cycle.isActive
  ? displayDayRange.maxDay
  : Math.min(displayDayRange.maxDay, recordedMaxDay);
const monthSpans = useMemo(() => buildMonthSpans(
  cycleStartDate,
  displayDayRange.minDay,
  gutterMaxDay,
), [cycleStartDate, displayDayRange.minDay, gutterMaxDay]);
```

Behavior across the three regimes:

| Cycle state | `displayMaxDay` | `recordedMaxDay` | `gutterMaxDay` | Effect |
|---|---|---|---|---|
| Active, short | 28 | 5 | **28** (no clamp) | Gutter pills cover all 28 cells — today's behavior preserved. |
| Active, long | 35 | 35 | **35** (no clamp) | Unchanged. |
| Ended, short | 28 | 8 | **8** (clamp) | Gutter pills cover only days 1–8; tail (9–28) has no pill. |
| Ended, long | 35 | 35 | **35** (no-op) | Unchanged. |

The pill-skip-when-too-narrow logic at line 1351 (`pillMaxWidthPx < 22`) is preserved unchanged.

### Top three rows — Date / Week Day / Cycle Day

Tail cells:

| Property | Value | Hex |
|---|---|---|
| Cell background | slate-50 (top variant) | `#f8fafc` |
| Chip background (Week Day, Cycle Day) | slate-200 | `#e2e8f0` |
| Chip text | slate-500 | `#64748b` |
| Date number text | slate-400 | `#94a3b8` |
| Date underline | slate-300 | `#cbd5e1` |

Notes:
- The date underline is still 2-px tall — kept so the row's visual pattern stays consistent across recorded and tail, just muted.
- The underline is **never** colored by per-month logic in the tail (always slate-300, never blue or green). Even when a month boundary falls inside the tail, the underline stays gray.
- Chip font weight unchanged from the recorded portion.

### BBT plot zone (the main chart body)

- **Tail background:** `#fafafa` (a neutral very-light gray — Tailwind's `neutral-50` / `zinc-50`; intentionally a hair lighter than the top rows' Tailwind `slate-50` = `#f8fafc`). The gradient — header rows slightly darker than the plot body — gives the chart a subtle vertical hierarchy and matches the intent from the "Option A's softer mute" mockup choice.
- **Horizontal gridlines (the existing temperature reference lines):** **continue unbroken through the tail**, same color and weight as in the recorded portion. The tail's cell background sits *behind* the gridlines; the gridlines themselves are not gated by `isTail`. This keeps the chart legible as a chart.
- **BBT line + dots:** stop at `recordedMaxDay`. Apex naturally handles this — we feed only real data points; the last point is `recordedMaxDay`. No line is drawn into the tail.
- **Coverline (Sensiplan):** **MUST be clipped at `recordedMaxDay`**. Today the coverline is rendered as an Apex `annotations.yaxis` entry (a horizontal line spanning the full plot width — `CycleChartPage.tsx` line ~725). With `maxDay` extended to 28, leaving this annotation as-is would draw the coverline straight through the tail, defeating the "empty tail" intent.

  **Required mechanism — custom clipped overlay.** Replace the Apex `annotations.yaxis` entry with a custom React/SVG horizontal-line overlay positioned only over the recorded portion of the plot (from `plotAreaOffset` to `plotAreaOffset + recordedMaxDay × cellWidth`). The overlay sits above the Apex canvas and renders only inside the recorded region. This is the cleanest option because:
    - It gives full control over the x-extent (limited to recorded days).
    - It does not interact with Apex's gridline rendering — gridlines stay unbroken.
    - The line's color, dash style, opacity, and label match today's `styleMap` (SUGGESTED / CONFIRMED / ADJUSTED) so visual continuity is preserved.

  **Label position (post-smoke-test correction):** the label sits at `lineX2 + 4` with `text-anchor='start'` for all cycles, regardless of tail state. For tail cycles this places the label inside the gray-tail region next to the line — visually cleaner than anchoring it inside the recorded portion, which jammed the label against BBT data points near the recorded boundary. The line itself still clips at `recordedMaxDay`.

  **Why not a mask rectangle:** an opaque `#fafafa` rectangle over the tail would also cover the horizontal gridlines that the spec requires to stay visible. A masked variant would need to redraw the gridlines on top — strictly more code than the overlay approach for no benefit.

  **Why not Apex `annotations.points`:** point markers are dots at discrete x-values; they don't form a connected horizontal line. Not a substitute.
- **Thermal-shift band, peak-day marker:** rendered by custom React overlays (`ThermalShiftBand`, `PeakDayMarker`-style components — `CycleChartPage.tsx` lines ~1654, ~1793) keyed on recorded data. They naturally end at or before `recordedMaxDay`. **Verify during implementation** that none of them rely on `plotAreaWidth` × full day range — if they compute their x-extent from `displayDayRange.maxDay`, they'll need an `isTail`-aware clamp. (Most likely they're fine; flagging because the same class of bug as the coverline.)
- **Y-axis temperature labels (left side):** unchanged. Same range, same labels, same width.

### Lower rows — Time Stamp / LH Test / Intimacy / Cervical Fluid / Menstrual Flow / Disturbance / Notes

The complete list of below-plot rows in today's `CycleChartPage.tsx` (in render order):

| Row | File line (approx) |
|---|---|
| Time Stamp | 1894 |
| LH Test | 1958 |
| Intimacy (Intercourse) | 2055 |
| Cervical Fluid (Dry / Sticky / Creamy / Egg White / Watery + bleed shades) | 2117 |
| Menstrual Flow | 2117 (same block) |
| Disturbance | 2287 |
| Notes | 2304 |

**All of them** get the same tail treatment — no row may be skipped. An ended 8-day cycle should not show amber/green/violet/red row backgrounds through days 9–28 for *any* of these rows.

For each row in the tail:

- **Tail background:** `#fafafa` (same neutral very-light gray as the BBT zone — visually unified across the chart's lower half).
- **No icons, dots, period flow bars, OPK chips, intercourse markers, disturbance pills, note indicators, or row content of any kind** in the tail. The row borders and the row's left-axis label remain so the row structure stays visible.
- **Row borders** preserved so the row structure stays visible.

### No vertical divider

The recorded/unrecorded boundary is communicated entirely through the styling change — no dashed or solid vertical line is drawn at `recordedMaxDay + 0.5`.

---

## Interactivity

### Hover crosshair and tooltip

- Crosshair line **stops at the recorded boundary**. Mousing over the tail does **not** draw a crosshair, does **not** show a tooltip, and does **not** change the cursor.
- The recorded portion's hover behavior is fully preserved (today's crosshair + tooltip).

**Implementation: guard the ApexCharts canvas listeners, NOT the container `onMouseMove`.**

The chart's container `onMouseMove` (the inline handler on the `data-chart-container` div, ~line 1298) only writes cursor positions to refs — it does *not* drive the crosshair or tooltip. The actual crosshair/tooltip state is set by `resolveDay()` (line ~953) which is invoked from native listeners attached to `.apexcharts-canvas` for both mouse (`handleMouseMove`, line ~983) and touch (`handleTouchStart`, line ~1011; `handleTouchMove`, line ~1024). There is also a separate `handleClick` (line ~987) on the canvas.

The implementation MUST add an explicit `isTail` early-return at the top of `resolveDay()` and `handleClick()`, *and* the touch handlers. Concretely:

```ts
const resolveDay = (clientX, clientY, tolerant = false) => {
  // ... existing day resolution ...
  if (isCycleDayInTail(cycle, dayNumber, recordedMaxDay)) {
    lastTouchedDayRef.current = null;
    dismissTooltipRef.current();    // clears both crosshair + tooltip
    return;
  }
  // ... existing daysWithDataMap branch ...
};
```

**Why this is explicit even though `daysWithDataMap.get(dayNumber)` *happens* to be `false` for tail cells today:** that's an accidental side-effect of "no data → dismiss." If someone later adds tooltips for empty days (e.g. "click here to record"), the tail would inadvertently get tooltips. The explicit `isTail` guard makes the contract robust.

### Click handlers

- Tail cells are **inert** — no click handler attached.
- `cursor: default` on tail cells (rather than `cursor: pointer`).
- Today's click-to-open-note-editor remains intact on recorded cells.
- No confirmation dialog, no "this cycle has ended" message — clicking a tail cell simply does nothing.

**Implementation:**

- For HTML-cell click handlers (Date/Week/Cycle/lower-row cells rendered as overlays), gate the `onClick` prop with `!isTail && handleCellClick(dayNumber)`.
- For the canvas-level `handleClick` (line ~987), add an `isTail` early-return identical to the `resolveDay` pattern above.
- For touch handlers, the same canvas-level guard applies (touch resolves to a day, then routes to either the tooltip or click path).

---

## Code architecture

### Approach: Extend `displayDayRange`

We chose this approach over two alternatives:
- **Rejected: Render a separate "tail" component after the chart** — two grid systems to align; alignment of BBT y-axis, crosshair, and tooltips across the seam is fragile.
- **Rejected: Synthesize fake CycleDay records** — pollutes the data model; downstream filters need an `isTail` guard regardless.

**Approach 1 (chosen)** changes a single formula and propagates a single derived boolean through the render path. All existing code that iterates `displayDayRange.minDay..maxDay` keeps working.

### Files touched

| File | Change |
|---|---|
| `app/src/cycle-tracking/utils.ts` | Add `isCycleDayInTail(cycle, dayNumber, recordedMaxDay)` predicate. |
| `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` | Add `describe('isCycleDayInTail', …)` block with 5–6 cases covering active/ended × before/at/after the recorded max boundary. |
| `app/src/cycle-tracking/CycleChartPage.tsx` | 1) Unify `displayDayRange.maxDay` formula. 2) Memoize `recordedMaxDay` once (the max `dayNumber` across `cycle.days`, the same value `getCycleDayCount` already returns for ended cycles). 3) Compute `gutterMaxDay = cycle.isActive ? displayMaxDay : min(displayMaxDay, recordedMaxDay)` and feed it to `buildMonthSpans` (line ~448) — clamp fires only for ended cycles. 4) In each row's per-day render (Date / Week Day / Cycle Day / Time Stamp / LH Test / Intimacy / Cervical Fluid / Menstrual Flow / Disturbance / Notes), compute `isTail` and apply tail styling. 5) In HTML cell click handlers, gate with `!isTail`. 6) In the canvas-level `resolveDay`, `handleClick`, and touch handlers, add an explicit `isTail` early-return that calls `dismissTooltipRef.current()` so the crosshair and tooltip clear in the tail. 7) Replace the Sensiplan coverline (Apex `annotations.yaxis`, line ~725) with a custom React/SVG overlay limited to the recorded x-extent — see the BBT zone section. 8) BBT data series unchanged — last point at `recordedMaxDay` ends the Apex line naturally. |

### Styling implementation

A single modifier per row, gated on `isTail`. Inline Tailwind or a `chart-cell--tail` class — either works. Existing chip color classes (blue / green per-month) are wrapped in `!isTail && …` so they don't apply in the tail.

### The `isCycleDayInTail` helper

```ts
/**
 * True for cells beyond the last recorded day of an ENDED cycle.
 * Always false for active cycles — they keep today's full-color behavior
 * for padded future days, because "future" reads as "to be filled in,"
 * not "definitively empty."
 */
export function isCycleDayInTail(
  cycle: { isActive: boolean },
  dayNumber: number,
  recordedMaxDay: number,
): boolean {
  return !cycle.isActive && dayNumber > recordedMaxDay;
}
```

The signature takes `cycle.isActive` and `recordedMaxDay` as separate args (rather than the full `Cycle` object) to keep the helper trivially testable in isolation.

---

## Edge cases

| Case | Behavior |
|---|---|
| Cycle with `recordedMaxDay === 0` (no recorded days yet) | Ended cycles in this state are likely impossible in practice. If they exist: 28 cells, all gray tail. |
| Cycle with `recordedMaxDay === 28` exactly | 28 cells; `isTail === false` for all of them. No visible change from today. |
| Cycle with `recordedMaxDay > 28` (long ended cycle) | `displayDayRange.maxDay = recordedMaxDay`. No tail. Long-cycle widening rule applies as before (see [`2026-05-12-graph-header-design.md`](2026-05-12-graph-header-design.md) → *Long-cycle widening rule*). |
| Active cycle with `recordedMaxDay === 5` | 28 cells (today's behavior); `isTail === false` because `cycle.isActive === true`. No visual change. |
| Month boundary inside the tail | The tail's date underline stays slate-300 — does not turn green/blue at the boundary. Tail is uniformly muted. |

---

## What stays unchanged

- All Sensiplan interpretation logic (thermal shift, coverline, peak-day marker, DPO counting).
- Active-cycle rendering.
- Long-ended-cycle rendering (`recordedMaxDay ≥ 28`).
- BBT y-axis labels, range, and width.
- The chart's overall container layout, `min-w` widening rule for long cycles, and `overflow-x-auto` wrapper.
- All data persistence and engine code.

---

## Branch hygiene (already complete)

The branch was originally `fix/short-cycle-cell-ceiling` with 3 commits implementing the obsolete MAX_CELL_WIDTH ceiling approach (`ba0302b`, `773806b`, `e83804a`). Cleanup steps done at spec-write time:

1. `git reset --hard main` — discarded the 3 obsolete commits (still recoverable via the reflog for ~90 days).
2. `git cherry-pick` — re-applied this spec commit on top of `main`.
3. `git branch -m fix/short-cycle-cell-ceiling fix/short-cycle-gray-tail` — renamed to reflect the new approach.

Resulting state: branch `fix/short-cycle-gray-tail`, one commit ahead of `main` (this spec). Nothing was ever pushed to GitHub; all operations were local.

---

## Out of scope

- Changes to active-cycle rendering.
- Changes to long-cycle (`recordedMaxDay ≥ 28`) rendering.
- Any retroactive-data-entry feature (the gray tail cells are inert; we are explicitly not adding a "click to backfill" path here).
- Any new Sensiplan interpretation behavior.
- Any change to the `MIN_CELL_WIDTH = 22` floor or `LEFT_PLOT_RESERVE_FALLBACK = 130` constant — those are empirically verified and stay.

---

## Open questions

None at spec time. All four core design questions (frame size, active-cycle behavior, visual style, click behavior) were resolved during the brainstorming session on 2026-05-13. The coverline clipping mechanism is decided (custom React/SVG overlay — round 2 review tightened this).

## Review log

- **2026-05-13 — round 1 review:** Three issues caught and fixed before plan handoff:
  - P2: coverline clipping was missing (yaxis annotation spans the full plot width with `maxDay = 28`). Added explicit clipping requirement to *BBT plot zone* and *File touchpoints*.
  - P2: lower rows list was incomplete (omitted Time Stamp, LH Test, Disturbance). Replaced the partial list with the complete row inventory.
  - P2: hover/click guard was pointed at the container `onMouseMove` (which only updates cursor refs) instead of the ApexCharts canvas listeners (`resolveDay`, `handleClick`, touch handlers). Section rewritten to require explicit `isTail` early-returns in those handlers.

- **2026-05-13 — round 2 review:** Two more issues caught and fixed:
  - P2: month-label gutter was omitted from the tail treatment. For short ended cycles whose tail crosses or sits inside a later calendar month, the gutter would still render a colored month pill over the gray tail. Added a *Month-label gutter* section requiring `monthSpans` input to be clamped to `min(displayMaxDay, recordedMaxDay)`, and added the corresponding file-touchpoint.
  - P2: coverline implementation options 2 and 3 were unworkable. The opaque mask (option 2) would also hide the horizontal gridlines that the BBT-zone section requires to stay unbroken, and Apex `annotations.points` (option 3) can't form a connected horizontal line. Narrowed to a single required mechanism: a custom React/SVG overlay limited to the recorded x-extent, with explicit rationale for why the alternatives don't work.

- **2026-05-13 — round 3 review:** One issue caught and fixed:
  - P2: the round-2 gutter clamp was unconditional, which would have stripped colored month pills from active cycles' padded `[recordedMaxDay+1..28]` cells — violating the spec's "active cycles unchanged" rule. The accompanying rationale also incorrectly claimed `recordedMaxDay >= displayDayRange.maxDay` for active cycles (false when active cycles are padded). Fixed by gating the clamp on `!cycle.isActive`: active cycles get `gutterMaxDay = displayDayRange.maxDay` (today's behavior), ended cycles get `gutterMaxDay = min(displayDayRange.maxDay, recordedMaxDay)`. Added a per-regime behavior table to the *Month-label gutter* section to make the four cases unambiguous.

- **2026-05-13 — implementation verification:** All 9 implementation tasks completed (commits `1795e53` through `dd5b076`), plus 2 review fix-ups (`58524bc` Notes-row a11y; `51d5649` chartOptions stale deps) and 1 visual fix-up (`93165bb` coverline label position). Browser smoke-test on Cycle #6 (11-day ended cycle — the user extended it during development) confirmed: 28-cell frame with gray tail on cells 12–28, slate-50/slate-200/slate-300/slate-400/slate-500 mute palette applied correctly across all rows, horizontal gridlines visible through the tail, no month pill in the tail, hover/click inert on tail cells. Active cycles, 28-day cycles, and long ended cycles render unchanged. All 280 unit tests green; no new lint errors introduced.

- **2026-05-13 — coverline label position correction (post-implementation):** Round-1 plan review had specified anchoring the label INSIDE the recorded region for tail cycles (text-anchor='end', `x = lineX2 - 4`) to avoid "violating the empty-tail outcome." Smoke-test revealed the label jammed against BBT data points near the recorded boundary (visible on Cycle #6's day 6 dot). Reverted to anchoring the label at `lineX2 + 4` with `text-anchor='start'` for all cycles — the label now sits in the gray area next to the line for tail cycles, which reads better visually. The line itself still clips at `recordedMaxDay`. Updated in commit `93165bb`.
