# Backlog: independent month folding on the cycle chart

**Status:** parked on 2026-10-21 during the long-cycle graph-view brainstorm
(branch `feat/long-cycle-graph-view`). Pick up after the contiguous-folding
version ships.

## What was wanted

On the chart for a cycle longer than 40 days (desktop only), the user wants to
open or close **any single month on its own**:

- With July, August and September folded and October open, clicking the
  August ribbon (or "+ Aug" pill) opens **only August**. July stays folded on
  the left; September stays folded **between** August and October.
- Clicking "−" on any open month folds just that month, even one in the middle
  of other open months.
- "Show all" / "Collapse all" keep their meaning (every month open / only the
  anchor month open).

Today the open months are always one unbroken block, so opening August also
opens September. That was accepted as a stop-gap, twice, because the fix is a
bigger change than the rest of the feature.

## Why it is a bigger change

The whole chart (`app/src/cycle-tracking/CycleChartPage.tsx`) assumes the
displayed days are consecutive: every row, overlay and hit-test positions a day
at `(dayNumber - chartData.minDay) * cellWidth`, and the ApexCharts x-axis is a
plain numeric `min..max` range. A folded month in the middle means the x-axis
must be a *compressed* one: visible days packed side by side, with a fixed-width
gap (ribbon or pill column) where each folded month sits.

Estimated at about a day of careful work when scoped in the brainstorm.

## Prompt to resume with

> On branch `feat/long-cycle-graph-view`, make month folding on the cycle chart
> work per-month instead of as one contiguous block. Read
> `docs/superpowers/notes/2026-10-21-independent-month-folding-backlog.md`
> first. Approach: replace `displayDayRange` with an explicit list of visible
> day numbers plus a "layout units" map (`unitsOf(dayNumber)`); every folded
> month in the middle takes one column of units (A2 ribbon) and the ApexCharts
> x values become `unitsOf(day) + 0.5` with `min: 0, max: totalUnits`. Then
> update every `(dayNumber - chartData.minDay)` call site, the touch/mouse
> hit-tests (inverse mapping units → day), the thermal-shift layers
> (`interpretation/components/ThermalShiftAnnotations.tsx`, pass an `xOf`
> function instead of `minDay`/`maxDay`), and the temperature series (break the
> line at a folded gap rather than drawing across it). Keep the 22 px standard
> column width, the fill-the-40-column-frame default view, and the colour
> cycling. Verify with the local long cycle `local-long-cycle-8` (103 days,
> Jul–Oct 2026) in A2 and A3 and in the "view as past cycle" mode.

## Decisions already taken that still apply

- Temperature line breaks at a folded gap; no dashed bridge.
- A3 middle folds: one narrow column with the "+ Mon" pill above it (edge
  folds stay zero-width pills).
- Colours cycle blue → green → slate by month position in the cycle.
