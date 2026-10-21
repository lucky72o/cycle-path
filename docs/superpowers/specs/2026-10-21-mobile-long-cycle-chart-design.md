# Mobile Long-Cycle Chart — Foldable Month Pills below 1024 px

**Date:** 2026-10-21
**Status:** Design, approved in brainstorm (pending owner sign-off of this document)
**Branch:** `feat/mobile-long-cycle-chart` (from `main` after PR #18)
**Builds on:** `docs/superpowers/specs/2026-10-21-long-cycle-graph-view-design.md` (the shipped
desktop/tablet folding). Everything in that spec stays true unless this one changes it.
**Mock-up:** interactive, on the owner's real 103-day cycle, in the gitignored brainstorm folder
(`.superpowers/brainstorm/81722-1792598554/content/interactive-abc-v5.html`, phone "B"). It embeds
personal data and must not be copied into `docs/`. The static comparison of the four original
variations is `docs/superpowers/notes/2026-10-21-mobile-long-cycle-chart-mockup.html`.

## Intent

PR #18 gave long cycles (over 40 days) month folding on screens of 1024 px and wider, with folded
months drawn as full-height ribbons inside the chart. Below 1024 px there is no folding at all: a
103-day cycle is a 2,400 px strip the user swipes through on a 390 px phone, and the only help is
that a current cycle opens on its latest day.

This work brings folding to every screen narrower than 1024 px (phones upright and sideways,
iPads upright) with a control that fits a touch screen and costs no chart width: the month pills
in the chart's gutter row become the fold controls, and the whole row of pills floats at the left
edge of the chart so every month stays represented and reachable without scrolling the chart,
whatever is scrolled. (A merged pill opens one month per tap; see Overflow.)

Presentation only. Interpretation (Sensiplan thermal shift, coverline, peak day, classification)
runs on the whole cycle and is untouched. Folding is a CyclePath enhancement on top of the
Sensiplan chart, not part of the method; nothing here may alter what the method shows.

## Decisions taken in the brainstorm (2026-10-21)

Four variations were compared as interactive mock-ups on the owner's real cycle:
A merged ribbon · B chip strip above the chart · C two-month pages · D zoom + pan. The owner
chose B and then moved the chips into the gutter row itself ("foldable gutter pills", the old
A3 prototype idea), with these rulings:

1. Pills below 1024 px, ribbons from 1024 px up (iPad sideways, laptops). The 768–1023 px band
   that had no folding gets pills.
2. The whole pill strip floats: pinned to the chart's left edge, calendar order, regardless of
   scroll position. Open months stay visible too.
3. No vertical line in the gutter row above "Date".
4. Overflow rule: when the strip does not fit, merge folded months into one pill in groups of
   up to three ("+ Jul–Sep 86"), starting from the side farthest from the open block.
5. A merged pill takes the colour of its first month (reading 1 of 2 offered): an unmerged pill
   always matches its month's columns, and a merged pill carries its first month's colour with
   the other months shown by its label and the edge stub's segments.
6. Default open block below 1024 px: whole months from the anchor until at least 14 days are
   open (the "phone frame"), instead of desktop's 40.
7. Current cycles open on the latest recorded day; past cycles on day 1, first month open.
   Required for every state of every variation.
8. Whether desktop should also switch from ribbons to pills is deferred until the owner has
   used the pills on a phone. Nothing on desktop changes in this work.

## Goals

- On every screen narrower than 1024 px, a cycle over 40 days spanning more than one calendar
  month can be folded and opened by month with controls that are tappable (22 px tall pills in a
  30 px row), always visible, and that never take plot width.
- A current cycle opens on its latest recorded day; a past cycle on day 1. Every fold, open,
  Show all and Collapse all leaves the chart on the side the user expects (same rules as desktop).
- Hidden months are always signalled: by their pills, by "N days folded", and by a colour stub
  at the chart's edge.
- Nothing regresses for cycles of 40 days or fewer, on any screen; they get no folding, no taller
  gutter, no strip.
- Desktop (1024 px and up) is pixel-identical to today.

## Non-goals

- Changing desktop from ribbons to pills (deferred, see decision 8).
- Independent (non-contiguous) month open/close; see the parked backlog note.
- Pinch-zoom, chart paging, remembering fold state between visits.
- A sticky label / y-axis column on phones (parked for desktop too).
- The three known pre-existing phone issues (hamburger overlapping the title at 400 px, two
  padded future columns visible right of the latest day, the coverline label clipped at the
  chart's right edge). Record them; do not fix them here unless a change lands on the same line.
- Any change to the Days list, CSV import/export, or interpretation.

## Anti-goals (would make this a failure even if it works)

- A pill the user cannot hit with a thumb, or one that pins a tooltip when tapped.
- Any chart mark drawn for a day inside a folded month (overlays keep the range guard from the
  desktop spec).
- Columns that change width when a month folds or opens.
- A current cycle that opens on day 1, or a past cycle anywhere but day 1.
- A folded month with no visible trace: no pill, no stub, no count.
- An unmerged pill whose colour differs from its month's day columns, or a merged pill whose
  colour is not its first month's.

## Constraints

- Same architecture as the desktop spec: ApexCharts draws the temperature line; every other
  row and overlay is React positioned by `plotAreaOffset + (dayNumber − minDay) × cellWidth`.
  Folding changes the displayed day range, not the day-to-x mapping.
- Existing pure rules in `app/src/cycle-tracking/monthFolding.ts` (`defaultOpenBlock`,
  `foldMonth`, `openMonth`, `canFold`, `allOpenBlock`, `collapsedBlock`, `visibleDayRange`,
  `foldedDayCount`, `standardCellWidth`, `foldedContainerWidth`, `monthPaletteIndex`) and the
  hook `useMonthFolding.ts` (state, scroll intents `'start' | 'end' | 'end-of-range'`, the
  `(min-width: 1024px)` gate) are reused. The gate changes; the rules gain parameters.
- Tailwind breakpoints: `md` 768, `lg` 1024. The side nav collapses below `lg`.
- Below 1024 px the card is 308 px wide on a 390 px phone and about 450 px at 768 px, so
  `standardCellWidth` always floors to `MIN_CELL_WIDTH` (22 px). The label column measures
  97 px on the owner's phone; `RIGHT_PLOT_RESERVE` is 40 px.
- Verify against a long local test cycle (over 40 days, several calendar months). Real cycle
  data is personal; never commit it.

## Behaviour (decided)

### Terms

As in the desktop spec: open month, folded month, anchor side (latest day for an active cycle,
day 1 for an ended one), open block (always one contiguous run of months). New:

- **Mode** — `'ribbons'` (1024 px and up), `'pills'` (below 1024 px), or `'off'`.
- **Frame** — the number of days the default open block aims for: 40 in ribbons mode, 14 in
  pills mode.
- **Strip** — the row of month pills in the gutter in pills mode.
- **Merged pill** — one pill standing for two or three consecutive folded months.

### When folding is available

Unchanged eligibility: displayed length over 40 days (`max(28, recordedMaxDay)` for active
cycles, `recordedMaxDay` for ended) **and** more than one calendar month. The mode is chosen by
`matchMedia('(min-width: 1024px)')`, live on resize: match → ribbons, else pills. Rotating a
phone from upright to sideways stays in pills mode; an iPad rotated to sideways switches to
ribbons. A mode switch resets the fold state to the default block for the new mode and re-arms
the scroll to the anchor side (the hook's existing key-change reset covers this if the mode is
part of the key).

Cycles that are not eligible render exactly as today on every screen.

### Default open block

Open whole months from the anchor side until at least **frame** days are open, including the
month that crosses the boundary. At least the anchor month is always open. Frame is 40 in
ribbons mode (unchanged) and **14 in pills mode**.

Examples, pills mode, cycle 7 Jul → 19 Oct active: October (19 days ≥ 14) alone. Same cycle on
2 November: November (2) + October (31). Same cycle ended: July (25) alone, scrolled to day 1.

Fold state resets on page load, cycle change and mode change.

### Column width and container width (pills mode)

As desktop, without ribbon slots: `cellWidth = standardCellWidth(scrollClientWidth, leftReserve)`
(floors to 22 px on every screen below 1024 px) and the container's explicit width and min-width
are `leftReserve + RIGHT_PLOT_RESERVE + openDays × cellWidth`. Apex grid padding stays
`left: 50, right: 40` (no `ribbonsLeft` / `ribbonsRight`). Pills never reserve a timeline slot.

### The gutter row (pills mode only)

- Height **30 px** instead of 22 (header 138 px instead of 130; the chart container's
  `paddingTop` and every header `top` value shift by 8 px; the Date row starts at 30, Week Day
  at 66, Cycle Day at 102). The 30 px row applies only when `mode === 'pills'` **and** the cycle
  is eligible; ribbons mode and non-folding charts keep 22 px and today's pills, so desktop and
  short cycles stay pixel-identical.
- Hairline at `top: 29px` (the row's 1 px bottom border line), full container width from x = 0,
  so it also runs under the strip where it floats over the label column.
- The label column's gutter cell has **no right border** (decision 3). Its bottom border stays.
- No pills at natural timeline positions. The month is still identifiable per column by the
  Date underline, Week Day and Cycle Day chips in the month's colour, as today.

### The strip

- One pill per calendar month of the whole cycle (or per merged group, below), in calendar
  order, left to right, 4 px gap, starting 4 px from the scroll container's **visible** left edge:
  `x = scrollLeft + 4` in chart coordinates, updated on scroll with the same
  `requestAnimationFrame` pattern as `FoldRibbonLayer`. The strip therefore floats over whatever
  is beneath: the label column's gutter cell at scroll 0, day columns' gutter cells elsewhere.
- Pill geometry: **22 px tall**, vertically centred in the 30 px row (`top: 4px`), fully rounded
  (11 px radius), 11 px text, weight 600, letter-spacing 0.02em, nowrap. Padding `0 8px 0 5px`
  with a sign, `0 9px` without.
- **Open month:** background `pillBg`, text `pillText`, 1 px border in `pillBg`. Label
  `− Sep 30` (3-letter month, space, day count). The "−" is the 12 px white `SignDot`, shown
  **only when the month can fold**: it is the first or last month of the open block and the block
  has more than one month (`canFold`). A lone open month shows a plain filled pill, not tappable.
- **Folded month:** background white, text `pillText`, **1 px border in the month's `underline`
  colour**, label `+ Jul 25`. The "+" is drawn in `pillText` with no dot (a white dot on a white
  pill is invisible). Tapping opens that month and, because the block stays contiguous, every
  month between it and the block.
- A 2 px white outline (`box-shadow: 0 0 0 2px #fff`) separates pills from the hairline and from
  anything they float over.
- Pills are `<button>`s (`aria-label`: "Show September, 30 days" / "Fold September" /
  "September is open" for a lone open month, `title` the same), with keyboard focus, and they
  stop pointer and touch propagation so a tap never reaches the chart's hit-test.
- Month colour: `paletteFor(monthIndex)` of the month, cycle-relative, cycling blue → green →
  slate as today.

### Overflow: merging, then compact, then scroll

Let `available = scrollClientWidth − 8` (4 px margin each side). The strip's width is the sum of
its pills' widths plus gaps. Apply, in order, only as far as needed to fit:

1. **Merge folded months in threes.** Within each folded group (before the open block, after
   it), starting from the end farthest from the open block, replace up to three consecutive
   folded months with one merged pill, label `+ Jul–Sep 86` (first and last 3-letter month with
   an en dash, space, total days). With July–September folded and October open, one merge gives
   `+ Jul–Sep 86 · Oct 19`. With January–September folded: `+ Jan–Mar 90 · + Apr–Jun 91 ·
   + Jul–Sep 92 · Oct 19`, merging the earliest first; stop merging as soon as the strip fits,
   so a partially merged strip like `+ Jan–Mar 90 · + Apr 30 · + May 31 · …` is valid. Open
   months are never merged.
2. **Drop the day counts** on every pill (`+ Jul`, `+ Jan–Mar`, `− Oct`).
3. **Let the strip scroll sideways** inside the gutter (its own horizontal overflow, scrollbar
   hidden), left-aligned so the earliest pill is visible first. Expected only for very long
   cycles with most months open.

A merged pill takes the colour of its **first** month (decision 5). Tapping it opens the month
of the group **nearest the open block** only (September in `+ Jul–Sep`), after which the group
is re-evaluated (`+ Jul–Aug 56`). `aria-label`: "Show September, 30 days (July–September folded,
86 days)".

The merge decision is a pure function `mergeStrip(months, widths, available)` so it can be
unit-tested. Widths of every candidate label (full, merged, compact) are measured off-screen
with `canvas.measureText` plus the known padding, not from live pills, so one render per state
change suffices (the mock-up measures live pills and re-renders; that is the loop this rules
out). When both a before-group and an after-group exist, merge the before-group first, then the
after-group, stopping as soon as the strip fits. The steps run strictly in order: no retrying
fewer merges after compacting.

Merging and compacting are re-evaluated on every fold/open and on resize, from the full
un-merged strip each time.

### Edge stubs

Where months are hidden on a side, a **4 px** wide vertical stub runs from the bottom of the
gutter row (y = 30) to the bottom of the Notes row, pinned to the scroll container's visible
left edge (before-group) or right edge (after-group). The after-stub is clamped to the chart
container's own right edge when the chart is narrower than the card (e.g. Collapse all on a
two-day anchor month), the same `min(natural, viewport edge)` rule as the desktop after-ribbon,
so it never floats in empty card space. `z-index` above overlays and the crosshair,
below the tooltip, `pointer-events: none`. It is split vertically into one equal segment per
hidden month, top to bottom in calendar order, each in that month's `underline` colour
(blue, green, slate…), opacity 0.9. No stub when nothing is hidden on that side.

### Toolbar

As desktop, above the chart inside the Temperature Chart card: `N days folded` on the left when
N > 0, **Show all** (disabled when every month is open) and **Collapse all** (anchor month only)
on the right. Same styling as `FoldToolbar`. Rendered only when folding is available.

### Scrolling

Identical intents to desktop: page load / cycle change / mode change → anchor side; opening a
month before the block → start; after the block → end of the scroll range; Show all / Collapse
all → anchor side. "End" means the latest **recorded** day at the right edge followed by the
40 px reserve; padded future days of an active cycle are never the landing view on load or after
Show all / Collapse all. Opening a month after the block scrolls to the full range end
(`scrollWidth`), padded days included, exactly as desktop does and as its spec accepts. Scroll
runs ~350 ms after the chart re-rendered, as today, and never while the user is merely looking.

### Touch and tooltips

Today a tap on the plot or a grid cell pins a tooltip; that stays. Pills, Show all and Collapse
all stop propagation so they never pin. The existing tooltip guard applies unchanged in both
modes: hover and pinned state clear when the first displayed day shifts (every column moves) or
when the pinned day leaves the displayed range; a pin on a day that stays displayed at the same
x survives, as it does on desktop today (e.g. opening a month after the block, or folding a
month that does not contain the pinned day). No desktop behaviour changes.

### Month colours, range guard, geometry of other rows

Unchanged from the desktop spec: `paletteFor(monthIndex % 3)`, spans built once for the whole
cycle and clipped to the visible range, every overlay skips days outside
`[chartData.minDay, chartData.maxDay]`, lower-table row heights and offsets unchanged (they are
measured from the plot, so the 8 px taller header moves them automatically).

### Past cycles

Anchor is day 1: the default block opens the first month(s) until 14 days are open, scrolled to
day 1; later months fold into pills on the right of the strip (they are still in the strip,
calendar order) and an after-stub at the right edge. Opening a later month scrolls to the end
of the range. The gray tail of a short ended cycle is irrelevant here (short cycles never fold).

### Accessibility

All controls are real buttons with descriptive labels and keyboard focus. State is never colour
only: open vs folded is also filled vs outlined, "−" vs "+", and the label. Pills are 22 px tall
in a 30 px row; the whole 30 px row height is the hit area of the pill (padding on the button,
or an invisible extended hit box), so a thumb landing on the row edge still hits the pill.

## What's left to the builder

- How the mode enters the hook: a `mode` value in `useMonthFolding` (deriving `frame`, whether
  ribbons or pills render, and the key that resets state) is a reasonable shape; the existing
  `useIsWideViewport` becomes the mode selector.
- Component shape: a `MonthPillStrip` (strip + stubs, owning the scroll-position state like
  `FoldRibbonLayer`) rendered as a sibling of the Apex container; a pure `mergeStrip(months,
  widths, available)` in `monthFolding.ts`.
- Exact pill typography within the constraints above; whether the folded "+" uses `SignDot`
  with a transparent background or plain text.
- How the two gutter heights are expressed (a `GUTTER_HEIGHT` derived from mode, replacing the
  literal 22s in the header).
- Test strategy, within these minimums: unit tests for the default block with frame 14 (active
  short anchor month → two months; active long anchor month → one; ended → first month(s);
  single-month and ≤ 40-day cycles → disabled), the merge rule (no merge when it fits, one
  merge, several merges, partial merge, merge from the far side, never merging open months,
  compact fallback, scroll fallback), merged-pill label and colour, tap target of a merged pill
  (nearest month), the mode gate at 1023/1024 px and its state reset, strip x on scroll, stub
  presence and segment colours, the tooltip guard in pills mode (a pin clears when its month
  folds and survives when another month folds or opens after it). The
  existing suite stays green except the one assertion that folding "is disabled below 1024px"
  in `__tests__/useMonthFolding.test.tsx`, which becomes "pills mode below 1024 px".
- A manual check on the owner's real cycle at 390×844 and 430×932 (Playwright MCP, dev server
  session trick: set `wasp:sessionId` in localStorage if the page shows "Loading…"), and at
  768 and 1024 px to see the band edges; plus one ended long cycle from local test data.

## Out-of-scope follow-ups (recorded, not planned)

- Desktop: ribbons vs pills (decision 8).
- Sticky label / y-axis column on all sizes.
- Independent month open/close (backlog note).
- The three known phone issues listed under Non-goals.
- The future native app may reuse the pill strip and the folding hook; keep them free of
  page-specific state.
