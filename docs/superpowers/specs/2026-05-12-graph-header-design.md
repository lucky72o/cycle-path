# Graph Header — Date / Weekday / Cycle-Day Row Redesign

**Date:** 2026-05-12
**Status:** Spec for review
**Branch:** `feat/graph-page-design-tweaks`

## Summary

Redesign the top three rows of the cycle chart table (Date, Week Day, Cycle Day) on `CycleChartPage` to be cleaner, more compact, and easier to read. Key changes:

- **A new month-label gutter** sits above the Date row. Each calendar month gets a small rounded pill ("October", "November") anchored on a thin hairline at the start of that month's span. This replaces the current `26/10` cycle-start and `1/11` month-boundary date strings, which crowd 2-digit / 2-digit dates into a ~28 px cell.
- **The Date, Week Day, and Cycle Day rows become flat white cells.** The Date row carries a soft 2-px colored underline beneath each day number. The Week Day letters and Cycle Day numbers each sit inside a small colored chip.
- **Color splits by month, cycle-relative.** Days in the first calendar month of the cycle take a blue family; days in the second take a green family. Pill, underline, and chip all pick up the correct hue per day. The Cycle Day row stays unified with the column it sits in (no extra color logic — same chip color as the Weekday cell above).

This is variant **D1-light** from the brainstorming session ([mockups archived under `.superpowers/brainstorm/`](../../../.superpowers/brainstorm/)). The visual companion's session content can be discarded after merge.

## User-facing description

Today's chart header is three colored bands stacked vertically: a blue Date row showing `26/10 27 28 29 30 31 1/11 2 3 4 5 6 7`, a slate Week Day row showing `M T W Th F Sat Sun …`, and a white Cycle Day row showing `1 2 3 …`. The `26/10` and `1/11` cells are visibly cramped at typical chart widths, and the three solid bands compete for attention.

After this change:

- A thin gutter at the very top shows two pills — e.g. **October** in light blue, **November** in light green — each one positioned where that month begins.
- The Date row shows just the day numbers (`26 27 28 29 30 31 1 2 3 4 5 6 7`). Under each number is a soft 2-px line, blue for October days, green for November days.
- The Week Day row shows `M T W Th F Sat Sun M T W …` — each letter inside a small rounded pill matching its month's color.
- The Cycle Day row shows `1 2 3 …` in the same pill style, also color-matched to the month.
- The page background and the area inside the chart strip are white. The only colors are the pills (a few), the underlines (one per day), and the chips (two per day).

The end result: less visual chrome, no cramped date strings, and the calendar month is communicated by an explicit label instead of by squeezing `/11` into a cell.

## Scope (in)

- Replace the top-three-rows rendering on `CycleChartPage` with the D1-light design.
- Add a new "month gutter" row containing one or more month pills, positioned over the day columns they cover.
- Rewrite the `datesMap` helper so it only emits day-of-month numbers (no `/MM` suffix). Add a new `monthSpans` helper that returns the list of `{ monthLabel, startDayNumber, endDayNumber }` covering the displayed range.
- Apply the cycle-relative two-color palette (first month = blue, second month = green) to: pill, date underline, weekday chip, cycle-day chip.
- Preserve the existing intercourse-day color treatment on the Cycle Day row (pink text — currently `color: '#ec4899'`).
- Preserve the existing hover-column highlight, adapted to the new design (see "Hover" below).
- Preserve all existing left-axis row labels ("Date", "Week Day", "Cycle Day"). They sit in white cells with their current slate text.

## Scope (out)

- Lower-table rows (Time Stamp, LH Test, Intimacy, Cervical Fluid, Disturbance, Notes) — untouched.
- The plot area itself, axis labels, BBT data, and any annotations — untouched.
- Dark mode — the chart is light-mode-only today; this change does not introduce dark-mode styling.
- Re-theming the rest of the app — out of scope.

## Visual design — exact specification

All distances in CSS px, all colors as Tailwind class names (or raw hex where the Tailwind class is awkward).

### Layout

```
                  (full-chart coord space — left:0 = container's left edge)
┌─────────────────────────────────────────────────────────────────────┐
│ left-axis     │  plot-area: full-chart x ∈ [plotAreaOffset, width)  │
│ ◄──── 70 ────►│                                                      │
├──────────────┬┴─────────────────────────────────────────────────────┤
│   (blank)    │  ─── hairline ───   [pill]      [pill]      ←── 22 px│  gutter row    top:  0
├──────────────┼──────────────────────────────────────────────────────┤
│ Date         │  26   27   28   ...   1    2    ...                  │  36 px         top: 22
├──────────────┼──────────────────────────────────────────────────────┤
│ Week Day     │ (M) (T) (W) ...  (Sun)(M) ...                        │  36 px         top: 58
├──────────────┼──────────────────────────────────────────────────────┤
│ Cycle Day    │ (1) (2) (3) ...  (7) (8) ...                         │  36 px         top: 94
└──────────────┴──────────────────────────────────────────────────────┘

Total header height: 22 + 36 + 36 + 36 = 130 px (was 108 px → +22 px).
```

**Coordinate space**: everything in this header — left-axis labels, gutter pills, day-column cells, and the hairline — is rendered as an absolutely-positioned descendant of the existing `chartContainerRef` (the *full* chart container, including the 70-px left-axis area). The `top` and `left` values above are in that full-chart coordinate space. This matches the current rendering pattern at lines 1238–1318 of `CycleChartPage.tsx`, where the left-axis label container (top:0, width:plotAreaOffset) and the cells container (top:0, left:0, right:0) live side-by-side as parallel absolute children of the same parent.

### Gutter row (new)

The gutter occupies the band `top: 0 → top: 22` in the full-chart coord space, and is rendered as **two parallel absolute-positioned children** of `chartContainerRef`, matching the existing pattern used for the row labels and the day-cells:

1. **Left-axis gutter cell** — added as a new first child of the existing left-axis label container at lines 1238–1248 (so all three row labels — Date, Week Day, Cycle Day — sit *below* it):
   - Position: `top: 0`, width: `plotAreaOffset`, height: `22 px`.
   - Background: white, right-border `border-slate-300`, bottom-border `border-slate-300`.
   - Content: empty.
2. **Plot-area gutter content** — added as a new sibling of the existing cells container, also rooted at `top: 0`, `left: 0`, `right: 0`, `height: 22px`, with `zIndex: 1`. Contains the hairline + one pill per `monthSpan`.

In addition, the existing Date / Week Day / Cycle Day absolute offsets shift down by 22 px so the rows still align with their left-axis labels:

| Cell        | Current `top` | New `top` |
| ----------- | ------------- | --------- |
| Date        | `0`           | `22`      |
| Week Day    | `36`          | `58`      |
| Cycle Day   | `72`          | `94`      |

#### Hairline

- Rendered inside the plot-area gutter container as an absolutely-positioned child.
- `left: plotAreaOffset; right: 0; top: 11px; height: 1px;` (top: 11 = centered in the 22-px gutter band).
- Background `#cbd5e1` (slate-300).

#### Pill

For each month in `monthSpans`:

- Rendered inside the plot-area gutter container as an absolutely-positioned child (so its `left` is also in the full-chart coord space).
- `top: 4px` (so the pill sits visually centered on the hairline that runs at top: 11).
- Height: `14 px`, line-height `14px`.
- Padding: `0 8px`.
- Border-radius: `9px` (full pill).
- Font: `10 px`, font-weight `600`, letter-spacing `0.02em`, white-space `nowrap`.
- Text content: full month name in English, e.g. `October`.
- **Color (cycle-relative):**
  - 1st month in the cycle: background `bg-blue-100` (`#dbeafe`), text `text-blue-900` (`#1e3a8a`).
  - 2nd month in the cycle: background `bg-green-100` (`#dcfce7`), text `text-green-900` (`#14532d`).
  - 3rd month in the cycle (rare, see open question below): background `bg-slate-100` (`#f1f5f9`), text `text-slate-700` (`#334155`).

### Date row

- Height: **36 px** (unchanged from current).
- Cell background: **white**.
- Cell vertical border: `border-right: 1px solid #f1f5f9` (slate-100 — very faint).
- Row bottom border: `1px solid #e2e8f0` (slate-200).
- Cell content: just the day-of-month number (e.g. `26`, `27`, … `1`, `2`, …), centered, `text-xs` (12 px), color `text-slate-700` (`#334155`), regular weight.
- **2 px colored underline** below the number, full-cell width inset by 4 px each side:
  - 1st-month days: `background: #60a5fa` (blue-400).
  - 2nd-month days: `background: #4ade80` (green-400).
  - (3rd-month days: `background: #94a3b8` (slate-400).)

### Week Day row

- Height: **36 px**.
- Cell background: **white**.
- Cell vertical border: `border-right: 1px solid #f1f5f9` (slate-100).
- Row bottom border: `1px solid #e2e8f0` (slate-200).
- Cell content: the existing weekday abbreviation (`M`, `T`, `W`, `Th`, `F`, `Sat`, `Sun` — from `getDayOfWeekAbbreviation`) wrapped in a **chip**:
  - `min-width: 20px`, `height: 18px`, `padding: 0 4px`, `border-radius: 9px`, `line-height: 18px`.
  - Font: `10 px`, **font-weight `400` (regular)** — this is the "light" part of D1-light; chips do not get medium weight.
  - Color (cycle-relative, same mapping as pills):
    - 1st-month: background `#dbeafe`, text `#1e3a8a`.
    - 2nd-month: background `#dcfce7`, text `#14532d`.
    - (3rd-month: background `#f1f5f9`, text `#334155`.)
- Chip sizing fits the realistic minimum column width. The chart's `min-w-[800px]` with a ~80 px `plotAreaOffset` and a 28–30 day cycle yields a `cellWidth` of roughly **24 px**. "Sat" / "Sun" at 10 px ≈ 14–15 px text + 8 px padding ≈ 22–23 px chip, which fits a 24-px cell with a small margin on each side. If a future change moves to shorter columns (cellWidth < 20 px), revisit chip sizing.

### Cycle Day row

- Height: **36 px**.
- Cell background: white.
- Cell vertical border: `border-right: 1px solid #f1f5f9`.
- Row bottom border: `1px solid #e2e8f0` separating it from the BBT plot below.
- Cell content: cycle-day number (`1`, `2`, …) wrapped in a chip identical in style to the Week Day chip (`min-width: 20px`, `height: 18px`, `padding: 0 4px`, `border-radius: 9px`, `font-size: 10px`, `font-weight: 400`) and using the same per-month color mapping.
- **Intercourse override:** when `dayData.hadIntercourse === true`, the chip text color switches to `#ec4899` (preserving today's behavior). The chip background is unchanged. This keeps the intercourse signal visible without inventing a new visual treatment.

### Left-axis label cells

- Width: `plotAreaOffset` (unchanged — whatever the current value is).
- Background: white, right-border `border-slate-300`, bottom-border `border-slate-300`.
- Text: existing labels (`Date`, `Week Day`, `Cycle Day`), right-aligned, padding-right 8 px, `text-xs` (12 px), font-weight 500, color `#334155`.

### Hover, crosshair, and tooltip (all preserved)

Three independent hover features exist on the chart today. All three continue to work under the new header design:

1. **Header column-highlight** — currently changes all three header cells to `bg-[#bfdbfe]` when `hoveredDayNumber === dayNumber` (line 92, applied at lines 1269/1285/1301). In the new design this becomes **a light tint matching the month color**: `#dbeafe` (blue-100) for 1st-month days, `#dcfce7` (green-100) for 2nd-month days, `#f1f5f9` (slate-100) for 3rd-month days. The tint applies as a full-cell wash; chips and underlines render on top.

2. **Vertical dashed crosshair line** — drawn at lines 1469–1481 as `top: 0; height: 100%; border-left: 1px dashed #b6b6b6`. Because the crosshair already spans the full container height, it automatically extends through the new 22-px gutter. **No code change needed.**

3. **Pinnable React tooltip overlay** — rendered at lines 1483+ using `plotAreaTop` (measured dynamically at line 835 as `plotRect.top - containerRect.top`). When `paddingTop` bumps from 108 to 130, `plotAreaTop` re-measures correctly on next layout, so tooltip positioning adapts without code change.

#### Hover-tint placement note

Because chips already use the -100 family for their backgrounds, the hover wash will read as a slight "the chip merges with its cell" effect. That's the intended look — it tells the user "this whole column is now active" without introducing a third color.

## Data / logic changes

All work is inside `app/src/cycle-tracking/CycleChartPage.tsx` and (potentially) `app/src/cycle-tracking/utils.ts`.

### 1. `datesMap` — simplify

**Current behavior** (lines 385–408): emits `${dayOfMonth}/${month}` on the first day of the displayed range and on every month change; otherwise emits `${dayOfMonth}`.

**New behavior**: always emits just `${dayOfMonth}` (1 or 2 chars). The `/MM` suffix is removed — that information now lives in the gutter pill.

### 2. New `monthSpans` helper

```ts
type MonthSpan = {
  monthIndex: number;       // 0 = first month in cycle, 1 = second, ...
  monthLabel: string;       // "October", "November", "December"
  startDayNumber: number;   // first cycle-day-number of this month in the displayed range
  endDayNumber: number;     // last cycle-day-number of this month in the displayed range (inclusive)
};

function buildMonthSpans(
  cycleStartDate: Date,
  displayMinDay: number,
  displayMaxDay: number,
): MonthSpan[];
```

- Iterates the displayed range, groups consecutive days that fall in the same calendar month, and emits one `MonthSpan` per group.
- `monthLabel` is the full English month name (`date.toLocaleString('en-US', { month: 'long' })`).
- `monthIndex` enables the cycle-relative coloring (0 → blue, 1 → green, 2+ → slate).

### 3. New `monthIndexByDay` lookup

A `Map<number, number>` derived from `monthSpans`, mapping every displayed day-number to its `monthIndex`. Used by:
- Date-row underline color selection.
- Weekday and Cycle-day chip color selection.
- Hover wash color selection.

### 4. Pill positioning

Pills are absolutely positioned within the plot-area gutter container, in the full-chart coordinate space (same coord space as the existing day cells). For each `MonthSpan`:

```ts
const numDays = displayMaxDay - displayMinDay + 1;
const cellWidth = plotAreaWidth / numDays;
const leftEdge = plotAreaOffset + (monthSpan.startDayNumber - displayMinDay) * cellWidth;
const pillLeft = leftEdge + 4; // 4-px inset from the column's left edge
```

The pill does *not* span the full month width — it is anchored at the start. This matches the reference (Read Your Body) and prevents the pill from stretching unreadably on long months. Because the pill is positioned in full-chart coords, it lines up exactly with the column it labels.

### 5. Color tokens

To avoid spreading raw hex codes through the JSX, introduce a small per-`monthIndex` token object:

```ts
const MONTH_PALETTE: Record<number, { pillBg: string; pillText: string; chipBg: string; chipText: string; underline: string; hoverWash: string }> = {
  0: { pillBg: '#dbeafe', pillText: '#1e3a8a', chipBg: '#dbeafe', chipText: '#1e3a8a', underline: '#60a5fa', hoverWash: '#dbeafe' },
  1: { pillBg: '#dcfce7', pillText: '#14532d', chipBg: '#dcfce7', chipText: '#14532d', underline: '#4ade80', hoverWash: '#dcfce7' },
  2: { pillBg: '#f1f5f9', pillText: '#334155', chipBg: '#f1f5f9', chipText: '#334155', underline: '#94a3b8', hoverWash: '#f1f5f9' },
};

const paletteFor = (monthIndex: number) => MONTH_PALETTE[Math.min(monthIndex, 2)];
```

This collocates the palette and lets a future tweak ("make second-month green a touch warmer") land in one place.

## Edge cases

- **Single-month cycle**: `monthSpans.length === 1`. One pill, all chips/underlines blue. No green anywhere.
- **Cycle starts mid-month**: handled — `startDayNumber` of the first span is the first displayed day.
- **3-month cycle (rare)**: 3rd month falls back to slate (`monthIndex = 2`). Documented as a v1 limitation; we don't introduce a third bright hue.
- **Year boundary (Dec → Jan)**: the pill text is just the month name (`January`). The year is implicit from the cycle context. v1 does not show year in the pill.
- **Display range extends beyond cycle end** (forecasted/post-cycle days, if applicable): those days still get a chip + underline based on their `monthIndex`. They follow the same coloring as cycle days in the same calendar month.
- **Very narrow columns** (long cycle on small screens, cellWidth → ~22 px): chips with `min-width: 20px` still fit. Pills are absolutely positioned and do not depend on column width — they may overflow into adjacent columns on very narrow charts, which is acceptable and matches the reference design.
- **Intercourse marker**: pink text color on the cycle-day chip persists; this overrides only the *text* color, not the chip background.

## Open questions / decisions to confirm

None unresolved at this point.

- **Branch name**: `feat/graph-page-design-tweaks` — confirmed.
- **Worktree**: no new worktree, work in the main tree — confirmed.
- **Color mapping**: cycle-relative (first month in cycle = blue, second = green) — confirmed.
- **3-month cycles**: 3rd month falls back to slate. Documented above. Not blocking.
- **Hover color**: tint matches month family (blue or green wash). Documented above.

## Implementation notes (not the plan — that comes next)

- The cell-rendering loop in `CycleChartPage.tsx` at lines 1234–1320 will be split:
  - **Gutter content** — rendered once, *outside* the per-day-number loop. Two new pieces sit at `top: 0`: (a) a blank 22 × `plotAreaOffset` cell prepended to the left-axis label container at lines 1238–1248; (b) a new plot-area gutter container containing the hairline + one DOM element per `MonthSpan`.
  - **Per-day cells** — the existing loop's three cells (Date / Week Day / Cycle Day) shift their `top` from `0/36/72` to `22/58/94`. Cell *content* changes per the visual spec (no `/MM` suffix on dates, chips on weekday + cycle-day, colored underline on date).
- The `paddingTop` on `chartContainerRef` (currently `'108px'` at line 1225) becomes `'130px'` to accommodate the gutter.
- The vertical dashed crosshair at lines 1469–1481 already uses `top: 0; height: 100%`, so it auto-extends through the new gutter — no change.
- `plotAreaTop` (line 835) is measured dynamically; it re-computes on layout, so tooltip positioning at lines 1483+ adapts automatically.
- Hover logic — currently driven by `hoveredDayNumber` state and applied per cell — is unchanged in structure; only the conditional background color is swapped from `'bg-[#bfdbfe]'` to the per-month wash from `MONTH_PALETTE`.

## Testing notes

Visual regression on the chart at three states:

1. Cycle entirely within one calendar month (no second pill, all blue).
2. Cycle spanning two months (the canonical case — Oct→Nov, Jan→Feb, etc.).
3. Cycle spanning three months (rare — but verify the slate fallback applies correctly).

Plus interaction checks:

- Hover any day; whole column tints to that month's wash. Move mouse out; column returns to white.
- Day with `hadIntercourse: true`: cycle-day chip text is pink, chip background is the month color.
- Resize browser narrower so columns get tight: chips still readable, pills don't break layout.

No Sensiplan interpretation behavior changes — this is presentation-only.
