# Chart Thermal-Shift Annotations — Design Spec

**Date:** 2026-05-01
**Status:** Spec finalized; implementation pending
**Related:** [2026-04-14 Sensiplan thermal shift engine design](./2026-04-14-sensiplan-thermal-shift-engine-design.md), [2026-04-26 AdjustFlow v2 design](./2026-04-26-adjust-flow-v2-design.md)

---

## Concept

The cycle chart already draws the **coverline** as a dashed horizontal line. It does not yet visualize the rest of the Sensiplan thermal-shift narrative — the 6 reference low temps, which of those is the coverline anchor, the first higher temp (shift day), and the 2–3 confirming temps that validate the shift.

This spec adds a four-layer annotation system that makes that narrative visible at a glance, without text labels on the chart itself, while preserving the existing temperature line and dot rendering.

## Visual elements

All four layers use the colour palette already in the chart (coverline purple `#8b5cf6`, dots stroke `#3b82f6`) plus a single new green family for the shift/confirming markings.

### 1. Reference-low halos (the 6 lows)

Soft circular halo behind each of the 6 reference-low dots.

- **Fill:** `#dbeafe` (Tailwind `blue-100`)
- **Stroke:** none
- **Radius:** 9 px
- **Opacity:** 0.85
- **Z-order:** behind the temperature dots

### 2. Coverline-anchor halo (the highest of the 6 lows)

The reference low whose temperature defines the coverline gets a halo in the **coverline's own colour** instead of the standard blue. Fill-only — no stroke ring.

- **Fill:** `#8b5cf6` (same purple as the coverline itself)
- **Stroke:** none
- **Radius:** 11 px (slightly larger than the blue halos)
- **Opacity:** 0.22
- **Z-order:** behind the temperature dots (and renders *instead of* the blue halo for that day, not in addition to it)

**Anchor selection.** `referenceDays` is a list of day numbers; the engine does not currently expose which one is the anchor. To pick deterministically:

1. For each `dayNumber` in `referenceDays`, convert that day's stored `bbt` (Fahrenheit) to Celsius via `fahrenheitToCelsius(day.bbt)`.
2. Find the day(s) whose Celsius temp equals `coverlineTemp` (exact equality is safe — the engine derives `coverlineTemp` from the same conversion in [excludedDays.ts:54-58](../../../app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts)).
3. **Tie-break:** if more than one day matches, pick the **latest** `dayNumber` (the one closest to the shift day). This keeps the anchor visually adjacent to the shift narrative.

Implementation note: a follow-up could have `collectReferenceDays` return a `coverlineAnchorDay` field directly, which would let both the chart and any future consumer skip step 1–3 and avoid the tie-break rule living in two places. Out of scope for this spec; if the implementation finds the chart-side derivation awkward, it may add that field as part of the same change.

### 3. Shift-window vertical band (two-tone)

A vertical band spanning the entire shift window — i.e. every day in `confirmingDays` from whichever source the data-sources matrix selects. `confirmingDays` already includes the shift day as its first element. Painted in two tones so the shift day reads as the "anchor" of the band.

- **Lighter band** — covers the full shift window (every entry in `confirmingDays`):
  - Fill: `#d1fae5` (Tailwind `emerald-100`)
  - Opacity: 0.55
  - Width: one day-column per included day
- **Darker stripe** — covers only the shift day (`confirmingDays[0]`), painted on top of the lighter band:
  - Fill: `#10b981` (Tailwind `emerald-500`)
  - Opacity: 0.18
  - Width: one day-column
- **Z-order:** behind the temperature line and behind the halos

No text labels on the band itself. Meaning is carried by the band's two-tone shading and the chevrons (next layer).

### 4. Numbered chevrons above the dots

Each elevated day in the shift window gets a small upward-pointing chevron with a number, positioned above the dot.

- **Chevron path:** apex pointing up, ~10 px wide
  - Stroke: `#10b981`, width 1.75 px, no fill
  - `stroke-linecap: round`, `stroke-linejoin: round`
- **Number:** below the chevron
  - Font-size: 9 px, font-weight: 700
  - Colour: `#047857` (Tailwind `emerald-700`)
- **Vertical placement:** the chevron's apex sits ~20 px above the dot; the chevron's feet sit ~14 px above the dot; the number's baseline sits ~4 px above the dot, so the number reads as the lower half of the chevron+number unit. The unit floats above the dot at a fixed pixel offset (does not track the dot if the dot is near the chart top — see "Dot near chart top" under Edge cases below).
- **Numbering:** chevron `#N` is drawn above the day at `confirmingDays[N-1]`.
  - **#1** = shift day (`confirmingDays[0]`), inside the darker stripe
  - **#2, #3, …** = subsequent confirming days, inside the lighter band
  - When the engine reports `usedFourthDayException: true`, `confirmingDays` has length 4 and chevron **#4** appears above the fourth entry
- **Z-order:** above everything else

The engine never includes a sub-coverline temperature in `confirmingDays` — `detectThermalShift` aborts the attempt and pushes to `failedAttempts` instead (see [thermalShift.ts:138-157](../../../app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts)). So there is no "dimmed chevron" case to render: every chevron is drawn at full opacity with a solid stroke.

## Data sources

The annotation source depends on the interpretation state, because `engineResult.thermalShift` is **not** the right source when the user has adjusted the shift day. ADJUSTED state can use a `userOverrides.shiftDay` that differs from the engine's shift, or that exists when the engine reports `status === 'none'`. `getActiveCoverline` handles this for the coverline value but does not return reference / confirming days.

Use this matrix:

| Interpretation state | Annotation source for reference + confirming days | Coverline temp |
|---|---|---|
| `null`, no interpretation, or engine status `'none'` (in SUGGESTED/CONFIRMED) | render no annotations | n/a |
| `SUGGESTED` or `CONFIRMED` (engine status `'pending'` or `'confirmed'`) | `engineResult.thermalShift` directly | `engineResult.thermalShift.coverlineTemp` |
| `ADJUSTED` | `validateAdjustment(days, interpretation.userOverrides.shiftDay)` — the `'valid'` branch returns `{ referenceDays, confirmingDays, coverlineTemp, usedFourthDayException }` derived from the user's pick | `coverlineTemp` from the same `validateAdjustment` result |
| `DISMISSED` | render no annotations | n/a |

In all rendering states the four layers consume the same shape (`referenceDays`, `confirmingDays`, `coverlineTemp`, `usedFourthDayException`), so once the right source is selected the rest of the rendering code is uniform.

Field-level details (apply to both sources):

- **`referenceDays`** — length 6, ascending dayNumber order. Drives the blue halos.
- **Anchor day** — derived from `referenceDays` + `coverlineTemp` per the anchor selection rule under §2 above.
- **`shiftDay` / `confirmingDays[0]`** — the shift day; for ADJUSTED, equal to `userOverrides.shiftDay`.
- **`confirmingDays`** — full shift window including the shift day at index 0. Length is 1–3 in `pending` (awaiting more temps along either the 3-over-2 or 4th-day-exception path), 3 in `confirmed` (3-over-2 path), or 4 in `confirmed` with `usedFourthDayException: true`. Iterate this array directly — do not prepend `shiftDay` separately.

ADJUSTED-state implementation note: `validateAdjustment` is already called by `upsertCycleInterpretation`, but its result isn't currently surfaced to the chart page. Plumbing the chart's annotation derivation through the same helper (rather than duplicating the rule logic chart-side) keeps Sensiplan rules in one place.

## Edge cases

- **Engine status = `none`** in SUGGESTED/CONFIRMED state (no shift detected and no user override): no chevrons, no band, no anchor halo, no reference-low halos. The chart reverts to the existing pre-shift rendering. (Failed attempts in `engineResult.thermalShift.failedAttempts` are also not rendered — see "Out of scope".) ADJUSTED state with `engine.status === 'none'` is *not* this case — see the Adjusted-state bullet below.
- **Engine status = `pending`** (shift day detected but not yet enough confirming temps): the band and chevrons span exactly the entries in `confirmingDays` — no more, no less. So length 1 produces only the darker stripe + chevron #1; length 2 adds one lighter-band column + chevron #2; length 3 adds two lighter-band columns + chevrons #2 and #3 (typically the 4th-day-exception path awaiting day 4).
- **4th-day exception fires** (`status === 'confirmed' && usedFourthDayException === true`): `confirmingDays.length === 4`, so the lighter band naturally spans one extra column and chevron #4 appears above the fourth entry. No special styling for the exception itself — the position alone signals it.
- **Dot near chart top:** the chevron unit uses a fixed pixel offset above the dot. If the dot is so close to the chart's top edge that the chevron would clip, the chart's top padding is increased to guarantee ~30 px of headroom above the highest expected dot. (Implementation detail; included here so the plan accounts for layout.)
- **Adjusted state:** annotations are sourced from `validateAdjustment` (see "Data sources"), not from the engine. This means the chart can show annotations for a user-picked shift even when the engine itself reports `status: 'none'`, and it will show annotations for the *user's* shift day rather than the engine's when the two differ.
- **Adjusted state but `validateAdjustment` returns `kind: 'invalid'`:** render no annotations. AdjustFlow normally blocks invalid saves, but stale ADJUSTED rows can become invalid after later edits to underlying days; in that case the existing review-trigger logic (per [AdjustFlow v2 design](./2026-04-26-adjust-flow-v2-design.md)) flips the row back to SUGGESTED on next interpretation pass. Until that happens, drawing partial / contradictory annotations would be misleading, so the chart shows nothing rather than guessing.

## Out of scope

- Tooltips on halos, band, or chevrons.
- Animation of the annotations appearing.
- Tap/click interaction on chevrons or halos (e.g. tapping a chevron to open AdjustFlow). May be a follow-up.
- Annotating the post-shift monitoring window (days after the confirming window).
- Rendering anything different for false-rise warnings — those remain handled by `FalseRiseWarningCard`.
- Visualizing `engineResult.thermalShift.failedAttempts` (prior shift candidates that failed validation). May be a follow-up.

## Visual reference

The committed mockup lives at [`./2026-05-01-chart-thermal-shift-annotations-mockup.html`](./2026-05-01-chart-thermal-shift-annotations-mockup.html) — open it in a browser. Every numeric value in this spec (colours, radii, opacities, offsets) is transcribed from that file.

Two scenarios are shown: **S1 typical** (3 elevated days) and **S2 4th-day exception**. An earlier brainstorming iteration also explored a "confirming day dips below coverline" scenario; that state is unreachable (see "Numbered chevrons" above), so it was excluded from the committed mockup and must not be rendered by the implementation.
