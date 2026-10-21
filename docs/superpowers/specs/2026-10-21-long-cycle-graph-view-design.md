# Long-Cycle Graph View — Month Folding and Open-on-Latest

**Date:** 2026-10-21
**Status:** Design, approved in brainstorm (pending owner sign-off of this document)
**Branch:** `feat/long-cycle-graph-view`
**Prototype:** throwaway spike on the same branch (`app/src/cycle-tracking/chartFolding.tsx` plus
hooks in `CycleChartPage.tsx`). It is the visual reference, not the implementation. Variant **A2
(ribbons)** was chosen; the A3 "pills" variant, the in-page variant switch and the
"view as past cycle" checkbox are prototype-only and must not ship.

## Intent

The cycle chart was designed around a 28–40 day cycle. Long cycles (PCOS, post-pill,
late ovulation — the user's own current cycle is 103+ days) turn it into a wide strip
the user has to scroll along, and it always opens on day 1, which for a *current*
cycle is the least useful place.

Two changes:

1. **Open on the latest day.** A current cycle that needs horizontal scrolling opens
   scrolled so the last day is visible. All screen sizes.
2. **Fold by calendar month (desktop and landscape tablet, ≥ 1024 px).** On cycles longer than 40 days,
   each calendar month can be folded into a narrow coloured ribbon and opened again,
   so the user sees one or two months at a readable size and can reach the rest in a
   click. Current cycles open with the *latest* months; past cycles with the *first*.

Both are presentation only. Interpretation (Sensiplan thermal shift, coverline,
peak day, cycle classification) keeps running on the whole cycle and is unchanged.
Folding is a CyclePath enhancement on top of the Sensiplan chart, not part of the
method; nothing it does may alter what the method shows.

## Goals

- A long current cycle opens on today, at the chart's normal column width, on every
  screen size.
- On ≥ 1024 px screens, cycles over 40 days can be folded/unfolded by month with the
  controls on the chart itself, and the chart never stretches or squeezes columns
  as months open and close.
- Nothing already on the chart (overlays, tooltips, touch, interpretation cards)
  regresses for cycles of 40 days or fewer. They don't get folding at all.

## Non-goals

- Opening/closing any month independently (non-contiguous open set). Parked; see
  `docs/superpowers/notes/2026-10-21-independent-month-folding-backlog.md`.
- Phone-width folding. Parked; planned as a follow-up where all folded months on a
  side merge into one ribbon ("+ Jul–Sep · 86 days").
- Pinch-zoom, chart splitting into pages, or remembering fold state between visits.
- Any change to the Days list page, CSV import/export, or interpretation.

## Anti-goals (would make this a failure even if it works)

- Columns that change width when a month folds or opens. Column width is fixed (see
  below); the chart scrolls instead.
- Any chart mark (thermal-shift bands/chevrons, missing-temperature ×, peak flowers,
  fertile-window gradient, coverline, crosshair, tooltip) drawn for a day that is
  inside a folded month. The y-axis legend area must stay clean.
- A current cycle that opens on day 1, or a past cycle that opens anywhere but day 1.
- A folded month the user can't tell is there.

## Constraints

- Wasp + React + ApexCharts chart (`CycleChartPage.tsx`, ~2,900 lines). ApexCharts
  draws the temperature line and dots; every other row and overlay is React
  positioned by `plotAreaOffset + (dayNumber − minDay) × cellWidth`, where
  `cellWidth = plotAreaWidth / numDays` and `plotAreaWidth` is measured from the
  rendered Apex grid. That contract stays; folding works by changing the displayed
  day range, not by re-mapping days.
- Existing floor: `MIN_CELL_WIDTH = 22` (`utils.ts:312`), via
  `computeContainerMinWidth`. No existing maximum.
- Month labels, colours and spans come from `buildMonthSpans` (`utils.ts`) and
  `MONTH_PALETTE` (`CycleChartPage.tsx`). The chart's month-index contract assumes
  `displayMinDay === 1`; folding breaks that, so spans must be built once for the
  whole cycle and clipped to the visible range (prototype does this).
- Tailwind breakpoints in `app/tailwind.config.js`: `lg` = 1024 px. Below it the
  side nav collapses and the card is too narrow (~450 px at 768 px) for a 40-day frame,
  which is why folding starts at 1024 px (owner decision, 2026-10-21).
- The dev database is Postgres in Docker (`wasp-dev-db-CyclePath-*`); the branch
  owner's local DB has cycle `local-long-cycle-8` (103 days, 7 Jul – 19 Oct 2026)
  loaded for testing. It is personal data and must not be committed.

## Behaviour (decided)

### Terms

- **Open month** — a calendar month whose days are displayed.
- **Folded month** — a calendar month shown only as a ribbon.
- **Anchor side** — the end of the cycle the view favours: the *latest* day for an
  active cycle, *day 1* for an ended cycle.
- **Open block** — the open months; always one contiguous run of calendar months.
- **Standard column width** — `max(MIN_CELL_WIDTH, (cardPlotWidth) / 40)` where
  `cardPlotWidth` is the scroll container's width minus the left label reserve and
  the right reserve (`LEFT_PLOT_RESERVE_FALLBACK` / measured offset,
  `RIGHT_PLOT_RESERVE`). A 40-day frame — the width of one paper Sensiplan sheet.
  On the owner's 1,440 px screen this evaluates to 21.7 px and floors to 22 px.

### When folding is available

- Screen ≥ 1024 px wide (`matchMedia('(min-width: 1024px)')`, live-updated on
  resize), **and**
- the cycle's displayed length is > 40 days (`max(28, recordedMaxDay)` for active
  cycles; `recordedMaxDay` for ended ones), **and**
- the cycle spans more than one calendar month.

Otherwise the chart renders exactly as today (plus open-on-latest, below).

### Default open block

Open whole months from the anchor side until at least 40 days are open, *including*
the month that crosses the 40-day boundary (it simply scrolls). At least the anchor
month is always open.

Example, cycle 7 Jul → 19 Oct, active: October has 19 days < 40, so September opens
too (49 days). Scrolled to the end, the user sees ~18 Sep → 19 Oct with the rest of
September reachable by scrolling. Same cycle, ended: July (25) + August (31) open,
scrolled to day 1.

Fold state resets on every page load and whenever the cycle id changes.

### Column width and container width

When folding is available, the chart container's width is set explicitly to
`leftReserve + ribbonsLeft + ribbonsRight + rightReserve + openDays × standardColumnWidth`
(and `min-width` to the same, so the existing 800 px floor cannot stretch it). Columns
are therefore always the standard width: fewer open days leaves empty card space on
the right; more open days scrolls. "Show all" on a 103-day cycle gives a 22 px-column
chart that scrolls, the same as today's chart for that cycle.

When folding is not available, nothing about widths changes.

### Ribbons (folded months)

- One ribbon per folded month, **24 px** wide, full chart height (all rows, top of the
  month row to the bottom of the Notes row). Order follows the calendar.
- **Position (owner decision, 2026-10-21): each ribbon group has a reserved natural
  slot on the timeline *and* is pinned so it never scrolls out of view.** One
  invariant, two parts:

  1. **Reserved slots.** As in the prototype, the Apex grid padding grows by the
     ribbon widths on each side (`left: 50 + ribbonsLeft`, `right: 40 + ribbonsRight`)
     and the explicit container width includes them (see "Column width"). So the
     before-group's natural x is `plotAreaOffset − ribbonsLeft` (immediately left of
     the first open day, right of the label column) and the after-group's natural x
     is `plotAreaOffset + plotAreaWidth` (immediately right of the last open day).
     No day column ever sits under a natural slot.
  2. **Clamped pinning.** Let `sl = scrollLeft`, `cw = clientWidth` of the scroll
     container, `wL`/`wR` the group widths (24 px × count). Rendered x, in chart
     coordinates:
     - before-group: `x = max(naturalLeft, sl)`
     - after-group: `x = min(naturalRight, sl + cw − wR)`

     Scrolled fully to the start, the before-group is at its natural slot; scrolled
     right, it sticks to the viewport's left edge and overlays the day columns there.
     Scrolled fully to the end, the after-group is at its natural slot; otherwise it
     sticks to the viewport's right edge. When the chart is narrower than the
     container (e.g. after Collapse all), `naturalRight < sl + cw − wR`, so the
     after-group simply rests just past the last open day with empty card space to
     its right. Rationale: in the default view (Sep + Oct open, scrolled to today)
     the before-group's natural slot is ~260 px off-screen, and a folded month the
     user can't see fails the anti-goal above.
- Implementation note: the position is derived from the scroll container's
  `scrollLeft`/`clientWidth`, updated on scroll via `requestAnimationFrame` (the
  prototype already does this for the A3 pills). Render ribbons above the day columns
  and overlays (`z-index` above the grid cells, below the tooltip). Ribbons are
  `<button>`s that stop pointer/touch propagation, so a click or tap on a pinned
  ribbon never reaches the chart canvas's hit-test (which would otherwise pin a
  tooltip on the day column beneath it).
- Fill: the month's `pillBg`; 1 px white borders left and right; a 3 px bar in the
  month's `underline` colour along the bottom.
- Content: a 12 px white "+" dot at the top, centred on the month-row line (see
  geometry), then the label written vertically, bottom-to-top: `Sep · 30 days`
  (3-letter month, middle dot, day count), in the month's `pillText` colour, 11 px,
  600 weight.
- The **entire ribbon** is one `<button>` (`aria-label="Show September, 30 days"`,
  `title` the same). Clicking anywhere on it opens that month — and, because the open
  block stays contiguous, every month between it and the block.
- Hover: slight darkening (`brightness(0.95)`); cursor pointer.
- Ribbons live outside the Apex plot area (reserved slots above); dots and overlays
  therefore stay aligned with the day columns without any re-mapping.

### Open-month labels ("−")

- The existing month pill in the month row gains a 12 px white "−" dot on its left
  **only when that month can be folded**: it is the first or last month of the open
  block *and* the block has more than one month. Clicking the pill folds it. Pills
  without "−" are not clickable.
- Labels stay left-aligned at their month's first open day (today's behaviour).

### Toolbar

Above the chart, inside the Temperature Chart card, one row:

- Left: `N days folded` in small muted text, only when N > 0.
- Right: two outline buttons in the navy used elsewhere on the chart page
  (`#1e3a8a` border/text, white background, 12 px semibold):
  **Show all** (disabled when every month is open) and **Collapse all**
  (opens only the anchor month).
- The row renders only when folding is available.

### Scrolling

The chart's horizontal scroll container is the existing `overflow-x-auto` wrapper.
The page scrolls it programmatically **only** on these events, ~350 ms after the
chart has re-rendered (Apex re-measures on resize):

- page load / cycle change: to the anchor side (end for active, start for ended);
- after opening a folded-before month: to the start; a folded-after month: to the end;
- after Show all / Collapse all: to the anchor side.

Never while the user is merely looking or hovering.

### Open on the latest day (all sizes)

An active cycle whose chart is wider than its scroll container opens scrolled to the
end. On phones this requires that the **chart**, not the page, is what scrolls
sideways. Today the page column (`<div className="flex-1 p-4 md:p-8 max-w-6xl">`,
`CycleChartPage.tsx:~1274`) is a flex child with `min-width: auto`, so it grows to the
chart's 800 px floor and the whole page becomes ~1,150 px wide on a 400 px phone.

**Owner decision (2026-10-21): constrain that column to the viewport (e.g. `min-w-0`)
so the chart scrolls inside its card, for every cycle.** Accepted consequences:

- the title, banner and interpretation cards now wrap to the phone's width instead of
  being laid out for a 1,150 px page;
- every cycle's chart on a phone scrolls inside the card rather than the page sliding
  sideways — short cycles included (they always needed sideways scrolling because of
  the 800 px floor; only *what* scrolls changes).

The builder must check the phone layout of the whole chart page once after the change
(header, banner, thermal-shift card, Notes editor) since parts of it have only ever
rendered on an over-wide page. Goal 3 ("no regressions for ≤ 40-day cycles") is read
with this one accepted change.

### Month row geometry (all charts, folding or not)

The month-row hairline and pills move down so they sit on the same line as the border
above "Date" in the label column:

- hairline `top: 21px, height: 1px` (the 22 px gutter cell's 1 px bottom border
  occupies y = 21–22);
- month pills (14 px tall) `top: 14.5px` so their centre is at y = 21.5;
- ribbon "+" dots (12 px) `top: 15.5px`, same centre.

This is a deliberate global tweak the owner approved; it applies to every cycle chart.

### Month colours (all charts)

`paletteFor(monthIndex)` becomes `MONTH_PALETTE[monthIndex % 3]`: blue, green, slate,
blue, green, slate … for however many months the cycle has. `monthIndex` is
cycle-relative (0 = the cycle's first calendar month) regardless of which months are
open — build spans for the full cycle, then clip to the visible range.

### Overlay range guard (the bug class this feature exposes)

Every React overlay that converts a day number to an x position must skip days
outside `[chartData.minDay, chartData.maxDay]`. Known offenders found in the
prototype and already guarded there:

- `interpretation/components/ThermalShiftAnnotations.tsx` — `dotPosition` and
  `columnRect` (bands, halos, chevrons for the shift/reference days);
- `missingBBTDaysOnLine` in `CycleChartPage.tsx` (the small × on the line).

The builder must audit the remaining overlays (fertile-window gradient and label,
peak-day flowers, coverline overlay, gray tail, crosshair/tooltip pinning, touch
hit-test) and add the same guard wherever a day outside the range could be drawn.
Looping `for day = minDay..maxDay` is already safe; looking up a day from
interpretation data or `allDaysMap` is not.

### Accessibility

Ribbons and "−" pills are buttons with descriptive `aria-label`s and keyboard focus.
Show all / Collapse all are ordinary buttons. No colour-only state: folded months are
also identified by the "+" dot and the written label.

## What's left to the builder

- Where the folding state and geometry helpers live (a hook like the prototype's
  `useMonthFolding` is a reasonable shape; it should be unit-testable without the DOM
  for the default-block and fold/open rules).
- Exact ribbon typography and hover treatment within the constraints above.
- How the toolbar row is composed with the existing card header.
- Test strategy, within these minimums: unit tests for the default open block
  (active/ended, short anchor month, single-month cycle, ≤ 40 days → disabled),
  fold/open contiguity and the at-least-one-open rule, the pinned-ribbon position
  maths (scrolled to start / middle / end, and chart narrower than the container),
  colour cycling, and the overlay range
  guard in `ThermalShiftAnnotations`; the existing suite stays green.
- Clearing hover/pinned-tooltip state when the day it refers to folds away.
- A way to verify by eye on a real long cycle without committing personal data (a
  documented manual step against the local DB is acceptable).

## Out-of-scope follow-ups (recorded, not planned)

- Phone-width folding with merged ribbons.
- Independent (non-contiguous) month open/close — see the backlog note.
- Chip strip above the chart for the future native mobile app.
