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
- **Coverline, thermal-shift band, peak-day marker:** all driven by recorded data; they naturally end at or before `recordedMaxDay`. No code change needed.
- **Y-axis temperature labels (left side):** unchanged. Same range, same labels, same width.

### Lower rows — Period / Fluid / Intercourse / Notes

- **Tail background:** `#fafafa` (same neutral very-light gray as the BBT zone — visually unified across the chart's lower half).
- **No icons, dots, period flow bars, or markers** in the tail (no data to render).
- **Row borders** preserved so the row structure stays visible.

### No vertical divider

The recorded/unrecorded boundary is communicated entirely through the styling change — no dashed or solid vertical line is drawn at `recordedMaxDay + 0.5`.

---

## Interactivity

### Hover crosshair and tooltip

- Crosshair line **stops at the recorded boundary**. Mousing over the tail does **not** draw a crosshair, does **not** show a tooltip, and does **not** change the cursor.
- The recorded portion's hover behavior is fully preserved (today's crosshair + tooltip).
- Implementation: the existing `onMouseMove` handler in `CycleChartPage.tsx` already computes the cursor's X position relative to the chart container. Add a derived "which day is the cursor over" computation and short-circuit when that day is a tail cell.

### Click handlers

- Tail cells are **inert** — no click handler attached.
- `cursor: default` on tail cells (rather than `cursor: pointer`).
- Today's click-to-open-note-editor remains intact on recorded cells.
- No confirmation dialog, no "this cycle has ended" message — clicking a tail cell simply does nothing.

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
| `app/src/cycle-tracking/CycleChartPage.tsx` | 1) Unify `displayDayRange.maxDay` formula. 2) Memoize `recordedMaxDay` once (defined as the max `dayNumber` across `cycle.days`, the same value `getCycleDayCount` already returns for ended cycles). 3) In each row's per-day render (Date / Week Day / Cycle Day / Period / Fluid / Intercourse / Notes), compute `isTail` and apply tail styling. 4) In click handlers, early-return when `isTail`. 5) In the `onMouseMove` handler, suppress crosshair + tooltip when the cursor maps to a tail cell. 6) BBT data series unchanged — last point at `recordedMaxDay` ends the Apex line naturally. |

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

None at spec time. All four core design questions (frame size, active-cycle behavior, visual style, click behavior) were resolved during the brainstorming session on 2026-05-13.
