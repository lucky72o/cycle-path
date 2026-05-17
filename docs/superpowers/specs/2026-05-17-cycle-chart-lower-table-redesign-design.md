# Cycle Chart — Lower Table Visual Redesign

**Date:** 2026-05-17
**Status:** Spec for review
**Branch:** `main`

## Summary

Redesign the **lower table** of the cycle chart on `CycleChartPage` (the rows below the temperature graph: Time Stamp, LH Test, Intimacy, the five Cervical-Fluid sub-rows, Disturbance, Notes) so it feels as light as the upper calendar header and the graph, instead of the current heavy stack of strong colour bands boxed by grey grid lines.

Key changes:

- **Remove every cell border line.** The 1 px `border-slate-300` (`#cbd5e1`) grid that boxes each cell is deleted everywhere, including the Time Stamp / LH Test / Intimacy rows.
- **White-gap separation instead of lines.** Each day cell becomes its own softly-rounded tile with ~3 px of white space around it (cells "breathe" via whitespace, not borders).
- **Soft pale row tints.** Each row keeps a colour identity but as a very pale tint (so a row is still scannable by colour) rather than a strong band.
- **Coloured title column.** Each left-hand row label sits on the same pale tint as its row, so the colour runs edge to edge. Title text is the upper-table dark blue `#1e3a8a`, set in **Montserrat 600**.
- **Time-stamp numbers in lighter blue** `#3b82f6` (two-line hours-over-minutes, unchanged layout).
- **New LH Test symbol set ("Set A").** Clean line symbols: Low = bottom-aligned dash, Rising = up-right arrow, Declining = down-right arrow (all blue `#3b82f6`); Peak = upward arrow in lighter green `#16a34a` topped with an amber `#f59e0b` dot.
- **Softened 5-row Cervical Fluid.** The five real sub-rows (Eggwhite / Watery / Creamy / Sticky / Dry) are preserved; the appearance palette is muted to pastels.
- **Preserved behaviour:** the hover crosshair, tooltip, and full-column highlight must keep working, adapted to the new tile look.
- **One graph tweak only:** the "Fertile Window" label font changes to Montserrat to match the titles. Nothing else in the plot area changes.

This is the design validated in the brainstorming session; mockups are archived under [`.superpowers/brainstorm/`](../../../.superpowers/brainstorm/) (final: `full-chart-v4.html`). The visual-companion session content can be discarded after merge.

## User-facing description

Today the lower table is six (really ten, counting the CF sub-rows) solid colour bands running edge to edge, every cell boxed by a light-grey grid line, even on days with no data. It visually competes with the lighter calendar header and graph above it.

After this change:

- Each row is a barely-there tint of its colour. You can still tell at a glance "this whole row is the Intimacy row" by its faint pink, but it no longer shouts.
- There are no grid lines. Each day is a small rounded tile with white space around it.
- The Cervical Fluid block clearly reads as its five states (Eggwhite, Watery, Creamy, Sticky, Dry); a day's entry rises as a soft stacked column from Dry up to its quality.
- LH test days show crisp little symbols: a low dash sitting on the cell floor, blue trend arrows, and a green "peak" arrow capped with a small amber dot for the key positive reading.
- Row titles on the left are set in an elegant Montserrat face, in the same dark blue used by the calendar header.
- Hovering a day still lights up the whole column and shows the crosshair/tooltip exactly as before.

## Scope (in)

- Restyle the lower-table rendering in `CycleChartPage.tsx` (`~lines 2015–2636`): Time Stamp, LH Test, Intimacy, Cervical Fluid (5 sub-rows), Disturbance, Notes — both the y-axis row-label cells and the per-day grid cells.
- Remove `border-r border-b border-slate-300` from every lower-table cell and every lower-table row label.
- Apply the pale row tints, the coloured (tinted) title column, the dark-blue Montserrat title text, and the rounded-tile + 3 px white-gap treatment.
- Replace the LH symbol set (`~lines 2119–2156`) with Set A, including the bottom-aligned Low dash and the green-arrow + amber-dot Peak.
- Soften the Cervical Fluid palette (`getCFBarColor`, `~lines 559–568`) and keep the five sub-rows; keep `CF_ROW_HEIGHT = 28`.
- Recolour Time-Stamp values to `#3b82f6`.
- Adapt the existing hover-column highlight and tail/out-of-cycle ("`isCycleDayInTail`") styling to the new tile look, **without** changing the cell layout math (`cellWidth`, `leftEdge`, `plotAreaOffset`) so the crosshair/tooltip keep working.
- Add the **Montserrat** webfont to the app (weights 500 & 600).
- Change only the "Fertile Window" label's font to Montserrat (`CycleChartPage.tsx:1665–1678`).

## Scope (out)

- The temperature curve, dots, dashed coverline, thermal-shift band/halos, the green fertile-window gradient, axes, and tooltip *contents/data* — untouched. Only the Fertile-Window text label's `font-family` changes.
- The upper calendar header (Month gutter / Date / Week Day / Cycle Day) — untouched (already redesigned in the 2026-05-12 spec).
- Any interpretation / Sensiplan logic — untouched. This is purely visual; the meaning of every symbol and CF state is unchanged.
- Dark mode — chart is light-mode only; no dark-mode styling introduced.
- **Menstruation / flow row redesign** — explicitly deferred. "Set B" (signal-bars) from brainstorming is parked as the leading candidate for that future work; do not implement it here, but keep the mockup for reference.

## Visual design — exact specification

All colours as hex; all distances CSS px. The current implementation positions each cell as an absolutely-positioned `div` at `left = plotAreaOffset + i*cellWidth`, `width = cellWidth`. **Keep that positioning maths unchanged.** The new tile/gap look is produced by an *inner* element inset inside the existing positioned box, so `cellWidth`, crosshair X, `MIN_CELL_WIDTH = 22`, and `computeContainerMinWidth` all stay valid.

### Per-row tints and title text

| Row | Cell + label tint (resting) | Old (being replaced) |
|---|---|---|
| Time Stamp | `#fffdf2` | `bg-amber-50` |
| LH Test | `#f2faf3` | `#e8f5e9` |
| Intimacy | `#fdf2f8` | `bg-pink-50` |
| Cervical Fluid (all 5 sub-rows) | `#f3f8ff` | `#e7f1ff` |
| Disturbance | `#faf5ff` | `#f3e8ff` |
| Notes | `#fafaf9` | `#f5f5f4` |

- **Title text:** `#1e3a8a` (blue-900, the upper-table dark blue), `font-family: 'Montserrat'`, `font-weight: 600`, `font-size: 11px`, `letter-spacing: 0.02em`. The label cell background = the row tint above (coloured title column). Remove the old grey/boxed label styling and its borders.
- **Time-Stamp values:** keep the two-line hours-over-minutes layout; set text colour `#3b82f6` (blue-500). Hours `font-weight: 500`.

### Tile / gap

- Delete `border-r border-b border-slate-300` on all lower-table cells and labels.
- Inner tile inset ~1.5 px each side (≈3 px visible white gap between adjacent cells and rows), `border-radius: 3px`, background = the row tint (or appearance colour for CF, see below).
- Row label cell uses the same inset/radius/tint so the colour is continuous with its row.

### LH Test — Set A symbols

Symbols are SVG, drawn in a `24×24` viewBox unless noted. Base (Low/Rising/Declining) stroke colour `#3b82f6`; Peak stroke `#16a34a` with amber dot `#f59e0b`.

- **Low** — short horizontal dash, **bottom-aligned** (not vertically centered): a `stroke-width:2.5`, `stroke-linecap:round` line spanning ~x6→x18, positioned ~3–4 px above the cell's bottom edge, horizontally centered. (Replaces the current centered dash.)
- **Rising** — `line (6,17)→(17,7)` + arrowhead `polyline 11,7 17,7 17,13`, `stroke-width:2`, round caps/joins, centered.
- **Declining** — `line (6,7)→(17,17)` + arrowhead `polyline 17,11 17,17 11,17`, `stroke-width:2`, round, centered.
- **Peak** — vertical `line (12,19)→(12,6)` + head `polyline 7,11 12,6 17,11`, `stroke:#16a34a`, `stroke-width:2.4`, round; plus `circle cx=12 cy=3 r=2 fill=#f59e0b` (amber dot just above the arrow tip), centered.

"No test" days render nothing (empty tinted cell). Symbol meanings are unchanged from today's `opkStatus` values (`low` / `rising` / `peak` / `declining`).

### Cervical Fluid — 5 sub-rows, softened palette

Keep the five real sub-rows in order top→bottom: **Eggwhite, Watery, Creamy, Sticky, Dry**, each `CF_ROW_HEIGHT = 28`px, each labelled (coloured title column, same dark-blue Montserrat). A day's entry fills as a stacked column from the Dry row upward to its quality level, every filled tile in that day's *appearance* colour:

| Appearance | Fills rows (from Dry up) | Softened colour | Old (`getCFBarColor`) |
|---|---|---|---|
| EGGWHITE | all 5 | `#8fd9e6` | `#0cc0df` |
| WATERY | Watery→Dry (4) | `#bfe9f3` | `#86d9ec` |
| CREAMY | Creamy→Dry (3) | `#cdeef0` | `#7bdcdf` |
| STICKY | Sticky→Dry (2) | `#dcf0f1` | `#c0eef0` |
| DRY | Dry only (1) | `#e2e8f0` | n/a |
| NONE / not logged | none | transparent (row tint shows) | `#D4D8DA` |

Filled tiles use the same rounded-tile + 3 px gap treatment, so the column reads as five soft stacked segments rather than one hard bar.

### Hover (must be preserved)

The existing hover machinery (`hoveredDayNumber`, `setCrosshairX`, the mouse-move handlers and tooltip) **must keep working unchanged** — only the *visual* of the highlighted column adapts. On hover of a day, every row's cell in that column deepens to a richer tint of its own colour, and the Cycle-Day number gets an emphasis chip:

| Row | Hover (deepened) |
|---|---|
| Time Stamp | `#fdf0c8` |
| LH Test | `#dff0e2` |
| Intimacy | `#f9d6e8` |
| Cervical Fluid (empty tiles) | `#dce8fb` |
| Disturbance | `#ece0fb` |
| Notes | `#edebe7` |
| Cycle-Day chip | bg `#e2e8f0`, text `#1e293b`, bold |

CF tiles already filled with an appearance colour keep that colour on hover (the surrounding empty tiles + cycle-day chip carry the column highlight). This replaces today's per-row `isHovered` ternaries (e.g. Time Stamp `bg-[#fde68a]`, LH `#c8e6c9`, etc.).

### Tail / out-of-cycle days

Cells where `isCycleDayInTail(...)` is true render a quiet grey tile `#f1f5f9`, day number `#cbd5e1`, no symbols/data — so they recede. (Replaces the current `#fafafa`.)

### Graph — single change

`CycleChartPage.tsx:1665–1678`, the "Fertile Window" `<span>`: add `fontFamily: "'Montserrat', sans-serif"` to its inline style. Keep its existing `fontSize:12`, `fontWeight:600`, `color:'#2e7d32'`, and text-shadow. No other graph element changes.

## Font loading — Montserrat

The app self-hosts fonts via `@font-face` in `src/client/Main.css` (files in `public/fonts/`, e.g. Satoshi). Two options:

- **A (recommended): self-host Montserrat.** Add `Montserrat-Medium.woff2` (500) and `Montserrat-SemiBold.woff2` (600) to `public/fonts/`, add two `@font-face` blocks in `Main.css` (mirroring the Satoshi block, `font-display: swap`), and optionally register under `theme.extend.fontFamily` in `tailwind.config.js`.
  - *Pros:* matches the existing pattern; no third-party request; works offline; no layout shift surprises. *Cons:* must add the binary font files to the repo.
- **B: Google Fonts link/@import.** Add `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600&display=swap')` (or a `<link>`).
  - *Pros:* one line, no binaries. *Cons:* external runtime request, offline/privacy considerations, slight inconsistency with the self-hosted pattern already in the codebase.

**Recommendation: Option A**, to stay consistent with how Satoshi is already handled. (Note: this is a CSS/asset change, not an npm dependency — the Wasp version-pinning constraint does not apply here.)

## Constraints / alignment

- **Sensiplan:** purely visual. No change to temperature interpretation, coverline, thermal-shift, fertile-window logic, LH status semantics, or CF state semantics. Every symbol/state means exactly what it means today.
- **Layout math invariant:** the 3 px gap is an inner inset; `cellWidth`, `leftEdge`, `plotAreaOffset`, `MIN_CELL_WIDTH = 22`, `computeContainerMinWidth`, and the `overflow-x-auto` horizontal scroll are all unchanged, guaranteeing the crosshair/tooltip stay aligned.

## Open / deferred

- **Menstruation (flow) row redesign** — future work. Brainstorming "Set B" (signal-bars) is the parked candidate; mockup retained under `.superpowers/brainstorm/`.
