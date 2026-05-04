---
name: Disturbance Row Chart
overview: Add a "Disturbance" row to the lower table on the chart page, positioned below the "Dry" row, displaying disturbance factor emojis (or a count + warning if multiple factors are recorded), styled with a light violet CF-style cell pattern.
todos:
  - id: disturbance-map
    content: Add disturbanceMap useMemo in CycleChartPage.tsx
    status: completed
  - id: disturbance-label
    content: Add 'Disturbance' row label div at +234px offset
    status: completed
  - id: disturbance-grid
    content: Add disturbance grid row with emoji/count rendering logic
    status: completed
  - id: container-height
    content: Verify/adjust the outer chart container height to include the new row
    status: completed
  - id: disturbance-cell-style
    content: Restyle Disturbance cells to match CF cell pattern — light violet rounded squares, white gaps, no visible borders
    status: completed
  - id: readme-update
    content: Update app/README.md to document the new Disturbance row feature
    status: completed
isProject: false
---

# Disturbance Row on Chart Page

## Key File

All changes live in a single file: `[app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx)`

## Current Layout

The lower table rows are absolutely-positioned divs stacked at `plotAreaTop + chartHeight + Npx`:

- Time Stamp: `+0px`, height 38px
- LH Test: `+38px`, height 28px
- Intimacy: `+66px`, height 28px
- CF/Menstrual rows (Eggwhite → Dry, 5 × 28px = 140px): `+94px`

The new **Disturbance** row goes at `+234px` (94 + 140), height 28px.

## Existing Assets

- `DISTURBANCE_EMOJI` map already exists at the top of the file (lines 12–21)
- `disturbanceFactors: String[]` and `travelTimeDiff: Int?` are already on each `CycleDay` and available through `allCycleDaysMap`

## Changes

### 1. `disturbanceMap` useMemo — DONE

Maps each day number to `{ factors: string[], travelTimeDiff: number | null }`.

### 2. Row label — DONE

Separate sibling `<div>` at `top: plotAreaTop + chartHeight + 234px`, label text "Disturbance", `bg-slate-50` with right/bottom borders (matching other CF row labels).

### 3. Grid row with emoji/count logic — DONE (needs restyling, see §5)

Iterates over days; current cell logic:

- 0 factors → empty
- 1 factor → single emoji (travel direction-aware via `scaleX(-1)`)
- 2+ factors → `N⚠️`

### 4. Container padding — DONE

`paddingBottom` increased from `234px` → `262px`.

### 5. Cell styling update — DONE

Cells match the CF cell visual pattern: light violet rounded squares with white gaps, no visible borders.

- Outer column `<div>`: white background, no border
- Inner fill `<div>`: `0.5px` inset on all sides, `height: 27px`, `borderRadius: 2px`, `backgroundColor: '#f3e8ff'` (light violet), `opacity: 0.7` on hover
- Emoji/count rendered on top via `relative z-10`
- Row label uses `backgroundColor: '#f5f3ff'` (violet-50), matching the cell hue

## Display rules summary

- 0 disturbances: empty cell (violet background square still visible)
- 1 disturbance: one emoji centered (travel direction-aware)
- 2+ disturbances: `N⚠️` centered
- Flipped travel: `transform: scaleX(-1)` on a `display: inline-block` span

