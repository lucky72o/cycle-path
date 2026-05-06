# Celsius Storage Migration — Design

**Date:** 2026-05-05
**Status:** Spec for review

## Summary

Migrate basal body temperature (BBT) storage from Fahrenheit to Celsius so that the canonical unit in the database, business logic, and rule engine matches the unit Sensiplan was designed in. Fahrenheit becomes a *view* of the underlying Celsius value, applied only at the input and display boundaries. The rule engine uses raw Celsius floats at full precision; rounding happens only at the moment a value is rendered for a human (chart, form field, CSV cell). The headline Sensiplan threshold (3-over-6 rule, third reading ≥ 0.2 °C above the cover line) is applied to a value that was either born in Celsius or converted to Celsius once at the input gate, never re-converted.

## Background and motivation

Sensiplan was developed by the German *Arbeitsgruppe NFP* (Malteser working group) entirely in Celsius. The official handbook ([sensiplan.de](https://www.sensiplan.de/en); *Natural & Safe: The Handbook*, Cycleforth/Malteser) defines every rule in Celsius. There is no official Sensiplan-in-Fahrenheit; third-party Fahrenheit methods such as TCOYF or SymptoPro use *different* thresholds (e.g. 0.2 °F ≈ 0.11 °C, roughly half as strict).

Today the codebase stores `CycleDay.bbt` as `Float` interpreted as Fahrenheit. The rule engine ([thermalShift.ts](app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts), [getActiveCoverline.ts](app/src/cycle-tracking/interpretation/getActiveCoverline.ts)) converts F → C at the start of every evaluation using full-precision arithmetic. This works correctly today but has two problems:

1. **Conceptual mismatch.** The canonical unit of the method is not the canonical unit of the storage. Every Celsius user's input is needlessly round-tripped through Fahrenheit.
2. **Risk surface.** Any future contributor who adds a rule must remember to convert F → C before applying a Sensiplan threshold. The risk is not float imprecision — float gives ~15 significant digits, dwarfing the ~0.05 °C resolution of real BBT thermometers — but human error if a future code path uses the raw `bbt` value as if it were Celsius.

## Guiding principle

**Raw precision lives in the database and engine; rounded values appear only in things humans read.** Nothing inside rule logic ever sees a rounded value. This protects against the artificial-threshold case (e.g. `0.19 °C` rounding up to `0.20 °C` and falsely confirming a thermal shift).

## Architecture

```
[User input in chosen unit]
        │
        ▼  parse + (if °F) convert to °C, full precision, no rounding
[DB: CycleDay.bbt — Float, Celsius, canonical]
        │
        ▼  read directly, no conversion
[Rule engine — Celsius, full float precision]
        │
        ▼  format helper: (if °F) convert to °F, then .toFixed(N)
[Chart label / form field / CSV cell]
```

## Scope (in)

- Schema field `CycleDay.bbt` reinterpreted as Celsius (same `Float` type, same column).
- Removal of F → C conversions inside rule engine code.
- Rename of `convertToFahrenheitForStorage` → `convertToCelsiusForStorage`; behaviour reversed.
- Rewrite of `formatTemperature` to take Celsius input and convert outwards.
- New shared helper `toDisplayTemperature(celsiusValue, unit)` that returns the user-unit number for math and rendering. Existing inline `unit === 'CELSIUS' ? fahrenheitToCelsius(bbt) : bbt` ternaries in `CycleChartPage.tsx` are replaced with calls to this helper. `getTempNodeLabel` is unchanged and continues to take a display-unit number from its caller.
- Y-axis range remains display-unit based, derived from `toDisplayTemperature` outputs (the chart's coordinate system is uniformly the user's display unit; see Chart Y-axis range section).
- Test fixtures rewritten in Celsius to match Sensiplan handbook examples.
- New regression tests: three precision-edge tests for the engine threshold; four form-behaviour tests (no-op preserve for °C user, no-op preserve for °F user, genuine edit reparses, clear persists `null`); multi-pair fingerprint test.
- AddCycleDayPage submit handler preserves `existingDay.bbt` raw when the BBT input string is unchanged from prefill, and sends explicit `null` (not `undefined`) when the user clears the field.
- `bbt` payload type widened to `number | null` in `operations.ts` and `cycleDayDataBuilders.ts`.

## Scope (out)

- Production data backfill (no production users yet — confirmed during brainstorm).
- Changes to the user preference enum `temperatureUnit` (still `FAHRENHEIT | CELSIUS`).
- Any change to the user-facing default unit on signup.
- New thermometer integrations or input modalities.
- Decimal-precision changes to display formatting (still 2 decimals on form/CSV, 1 on chart node).

## Data model

`CycleDay.bbt` — keep type, change interpretation:

```prisma
// app/schema.prisma
model CycleDay {
  // ...
  /// Stored in Celsius (canonical unit). Fahrenheit is only a display view.
  /// See docs/superpowers/specs/2026-05-05-celsius-storage-migration-design.md
  bbt Float?
  // ...
}
```

No column rename, no type change. Existing dev/staging rows are dropped via Prisma migration reset; production has no users yet.

## Code changes by layer

### Engine layer (the simplifying change)

Every interpretation/rule file currently calls `fahrenheitToCelsius()` at the start because `bbt` is stored in °F. After the migration, `bbt` is already Celsius and **every one of these `fahrenheitToCelsius()` calls must be removed**. Missing any one of these would silently corrupt that path: a stored value of `36.5` °C would be re-converted as if it were °F, producing `2.5` °C and breaking that rule's logic.

Files and call sites to update (the full list, verified by grep):

| File | Call sites today | Action |
|---|---|---|
| [`interpretation/sensiplan/thermalShift.ts`](app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts) | lines 43, 134 | Remove `fahrenheitToCelsius()`; read `bbt` directly. `THRESHOLD_C = 0.2` stays. |
| [`interpretation/getActiveCoverline.ts`](app/src/cycle-tracking/interpretation/getActiveCoverline.ts) | inside `collectReferenceDays()` | Remove conversion; coverline math unchanged. |
| [`interpretation/sensiplan/excludedDays.ts`](app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts) | line 55 | Remove conversion. |
| [`interpretation/sensiplan/postShiftMonitoring.ts`](app/src/cycle-tracking/interpretation/sensiplan/postShiftMonitoring.ts) | line 45 | Remove conversion. |
| [`interpretation/sensiplan/nudges.ts`](app/src/cycle-tracking/interpretation/sensiplan/nudges.ts) | lines 31, 71, 104, 114 | Remove all four conversions. |
| [`interpretation/sensiplan/validateAdjustment.ts`](app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts) | lines 116, 183 | Remove both conversions. |
| [`interpretation/getChartAnnotations.ts`](app/src/cycle-tracking/interpretation/getChartAnnotations.ts) | line 32 | Remove conversion (annotation anchor selection compares to coverline, which is Celsius). |
| [`interpretation/components/AdjustFlow.tsx`](app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx) | line 29 | Remove conversion in the `tempC` accessor; the field is already Celsius. |
| [`interpretation/types.ts`](app/src/cycle-tracking/interpretation/types.ts) | line 8 (comment) | Update comment from "Fahrenheit (as stored in DB)" to "Celsius (as stored in DB)". |

`fahrenheitToCelsius()` itself **stays** in `utils.ts` — it is still needed by the display layer for callers that want a converted value (see Display boundary). Engine code, however, no longer imports it.

[`interpretation/components/ThermalShiftAnnotations.tsx`](app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx) (line 93) is a display-layer call — it converts a stored value to the user's preferred unit. Its logic must invert: today it converts F → C for Celsius users; after migration it must convert C → F for Fahrenheit users. Treat it together with the Display boundary section.

After this layer is done, no engine/rule code references Fahrenheit at all.

### Conversion layer

**[`app/src/cycle-tracking/utils.ts`](app/src/cycle-tracking/utils.ts)**

Four helper changes (one renamed, one reversed, one new, one left alone):

1. **Rename + reverse:** `convertToFahrenheitForStorage(value, unit)` → `convertToCelsiusForStorage(value, unit)`.
   - If `unit === CELSIUS` → return parsed number unchanged.
   - If `unit === FAHRENHEIT` → return `(value − 32) × 5/9` at full float precision. No rounding.

2. **Reverse `formatTemperature`:**
   - `formatTemperature(celsiusValue: number, unit: TemperatureUnit): string` — input is now Celsius. If unit is Fahrenheit, convert via `c × 9/5 + 32`, then `.toFixed(2)`. If Celsius, `.toFixed(2)` directly.

3. **New: `toDisplayTemperature(celsiusValue, unit): number`** — see the Display boundary section for the signature, callers, and rationale. Distinct from `formatTemperature` because the chart needs a `number` for plotting/positioning math; only the tooltip/label sites want a `string`.

4. **Preserve `getTempNodeLabel` semantics — do NOT change its signature or rounding rule.**
   The current contract is intentional and tested: `getTempNodeLabel` takes an *already-converted display temperature* and emits a compact label that shows only the tenths digit (`98.3 → "3"`) or the integer part on `.0` values (`98.0 → "98"`). Changing it to `.toFixed(1)` would crowd the chart with full temperatures like `36.7` / `98.1` and break [`__tests__/getTempNodeLabel.test.ts`](app/src/cycle-tracking/__tests__/getTempNodeLabel.test.ts).
   - The function itself stays unchanged.
   - **Callers** must convert from canonical Celsius to display unit first, using `toDisplayTemperature`. Example:
     ```ts
     getTempNodeLabel(toDisplayTemperature(day.bbt, settings.temperatureUnit));
     ```
   - Today the chart passes `day.bbt` (Fahrenheit) directly to `getTempNodeLabel` for °F users and converts inline for °C users. After migration, every call goes through `toDisplayTemperature` with no inline ternary.

All four helpers handle `null`/`undefined` input the same way they do today.

### Input boundary — every BBT writer, not just AddCycleDayPage

There are **three** code paths that write a BBT value into the database. All three must use the new helper, otherwise newly-created rows will continue to land in Fahrenheit while the column is now interpreted as Celsius.

1. **[`AddCycleDayPage.tsx`](app/src/cycle-tracking/AddCycleDayPage.tsx)** (lines ~66 and ~99–101)
   - **Submit path** (line ~101): replace `convertToFahrenheitForStorage(bbtValue, settings.temperatureUnit)` with `convertToCelsiusForStorage(bbtValue, settings.temperatureUnit)`.
   - **Prefill path** (line ~66): use `toDisplayTemperature(existingDay.bbt, settings.temperatureUnit).toFixed(2)` (already specified in the Display boundary table).
   - **No-op edit preservation — required.** The prefill formats through `.toFixed(2)`, which loses precision below the second decimal. If the user opens an existing day, edits something other than BBT, and saves, the form must persist `existingDay.bbt` raw (the original full-precision Celsius float). Otherwise a stored value of e.g. `36.6996 °C` prefills as `"36.70"`, parses on submit as `36.7`, and the float silently changes — flipping both the engine threshold result *and* the (no-rounding) fingerprint, even though the user never touched the BBT field.

     **How to implement:** when prefilling, capture the prefilled string (`prefilledBbt`). On submit, branch:
     ```ts
     // submit handler
     const bbtChanged = bbt !== prefilledBbt;
     const bbtForStorage: number | null | undefined =
       existingDay && !bbtChanged
         ? existingDay.bbt                                     // preserve raw stored value
         : bbt === ''
           ? null                                              // user explicitly cleared the field
           : bbt
             ? convertToCelsiusForStorage(parseFloat(bbt), settings.temperatureUnit)
             : undefined;
     ```
     - `prefilledBbt` is the exact string we placed in the input (`"36.70"`, `""`, etc.). String equality is the right check — it captures both "user never touched the field" and "user typed something then typed it back".
     - If there is no `existingDay` (i.e. creating a new day), the preservation branch does not apply; we always parse the entered string.
     - If the user clears the field on an existing day, `bbt === ""` and `prefilledBbt !== ""` — `bbtForStorage` is `null`, **not** `undefined`. See "Clearing semantics" below for why this distinction matters.

     **Clearing semantics — `null` vs `undefined`:** Prisma treats `undefined` in an update as "do not modify this field" and treats `null` as "set this field to NULL". The current `createOrUpdateCycleDay` payload type at [`operations.ts:330`](app/src/cycle-tracking/operations.ts:330) declares `bbt?: number`, and [`cycleDayDataBuilders.ts:31`](app/src/cycle-tracking/cycleDayDataBuilders.ts:31) writes `data.bbt = args.bbt` only when `'bbt' in args`. If the form sends `bbt: undefined` to clear the field, the builder passes `undefined` through and the column is *not* cleared. To actually clear BBT we must:

     - Widen the payload field type from `bbt?: number` to `bbt?: number | null` in:
       - [`operations.ts:330`](app/src/cycle-tracking/operations.ts:330) (`createOrUpdateCycleDay` args type)
       - [`cycleDayDataBuilders.ts:5`](app/src/cycle-tracking/cycleDayDataBuilders.ts:5) (builder args type, both update and create variants)
     - Send `bbt: null` (not `undefined`) from the AddCycleDayPage submit handler when the user clears the field on an existing day. The builder's `'bbt' in args` guard is preserved, so callers that simply omit `bbt` (e.g. patching unrelated fields) still produce a no-op for the BBT column.
     - Same logic for `bbtTime` if the user clears the time field — out of scope here, but worth flagging while the form is being touched.

     **Tests for this** (added to the Testing section):
     - No-op edit on a `36.6996 °C` stored value preserves the raw float.
     - Clearing the BBT input on an existing day persists `bbt: null` and the column reads `NULL` after save.

2. **[`NewCyclePage.tsx`](app/src/cycle-tracking/NewCyclePage.tsx)** (line ~189)
   - Today: bypasses the helper and calls `celsiusToFahrenheit(parseFloat(bbt))` inline for °C users.
   - After: use `convertToCelsiusForStorage(parseFloat(bbt), tempUnit)` so this path is consistent with `AddCycleDayPage`. Pass the component's local [`tempUnit`](app/src/cycle-tracking/NewCyclePage.tsx:38) variable (`= settings?.temperatureUnit || 'FAHRENHEIT'`) — *not* `settings.temperatureUnit`, which is `possibly 'undefined'` under strict because `settings` itself can be undefined while loading.

3. **CSV import in [`operations.ts`](app/src/cycle-tracking/operations.ts)** (`importCycleCsv`, line ~605–615)
   - Today: detects unit via `inferTemperatureUnit`, then converts °C inputs to °F via `celsiusToFahrenheit`.
   - After: invert. If detected unit is °F, convert to °C via `fahrenheitToCelsius` at full precision. If detected °C, store as-is. The unit-inference function itself does not change.

The user-visible UI stays identical — input fields still display the user's chosen unit, validation ranges still match the unit. Only the value persisted to the database changes.

### Display boundary

The chart code today contains many copies of the same ternary, e.g.:

```ts
const temp = settings.temperatureUnit === 'CELSIUS'
  ? fahrenheitToCelsius(day.bbt)
  : day.bbt;
```

After migration the conversion direction must flip in every one of those copies. Rather than ask each call site to remember to flip the ternary correctly, the spec introduces a shared helper and routes every site through it.

**New helper in [`utils.ts`](app/src/cycle-tracking/utils.ts):**

```ts
/**
 * Convert a stored canonical-Celsius temperature to the user's preferred display unit.
 * Returns a raw number (no rounding) suitable for plotting, interpolation, and
 * positioning math. For human-readable strings, use formatTemperature instead.
 */
export function toDisplayTemperature(
  celsiusValue: number,
  unit: TemperatureUnit
): number;
export function toDisplayTemperature(
  celsiusValue: number | null | undefined,
  unit: TemperatureUnit
): number | null;
export function toDisplayTemperature(
  celsiusValue: number | null | undefined,
  unit: TemperatureUnit
): number | null {
  if (celsiusValue == null) return null;
  return unit === 'CELSIUS' ? celsiusValue : celsiusToFahrenheit(celsiusValue);
}
```

Note: the implementation signature must carry explicit types — `app/tsconfig.json` has `"strict": true`, so the previously-shown shorthand `(celsiusValue, unit) => ...` would fail with implicit-any errors. Two narrow overloads plus the wider implementation signature are required.

Calling `.toFixed(2)` on the result also requires care under strict. The nullable overload returns `number | null`, so `toDisplayTemperature(day.bbt, unit).toFixed(2)` will not type-check — `.toFixed` doesn't exist on `null`. Two acceptable patterns:

```ts
// (a) guard at the call site
const display = toDisplayTemperature(existingDay.bbt, settings.temperatureUnit);
if (display != null) setBbt(display.toFixed(2));

// (b) narrow first via the existing null check on bbt
if (existingDay.bbt != null) {
  setBbt(toDisplayTemperature(existingDay.bbt, settings.temperatureUnit).toFixed(2));
  // ^ here the non-nullable overload picks up because the argument is `number`
}
```

Pattern (b) is cleaner where there is already a `bbt != null` branch in the surrounding code (which is the case at `AddCycleDayPage.tsx:65–66`).

**Two helpers, two purposes:**
- `toDisplayTemperature(value, unit)` — returns a `number`. Used wherever the chart needs the value for math (plotting Y position, interpolation between points, overlay anchoring, picking values to feed `getTempNodeLabel`). Also used for any *unit-symbol-free* string output (form input prefill, tooltip number when the unit suffix is rendered separately) — call `.toFixed(2)` on the result.
- `formatTemperature(value, unit)` — returns a `string` like `36.50°C` / `97.50°F` *with the unit suffix*. Used wherever a single human-readable string with a unit is what's needed (cycle-day card, settings preview, CSV cell). Not safe for `<input type="number">` fields, which reject the suffix.

**Sites that must move to the new helper.** All currently use the soon-to-be-inverted ternary on raw `bbt`:

| Location | Today's pattern | After |
|---|---|---|
| [`CycleChartPage.tsx:178`](app/src/cycle-tracking/CycleChartPage.tsx:178) — plotting points | `tempUnit === 'CELSIUS' ? fahrenheitToCelsius(day.bbt!) : day.bbt!` | `toDisplayTemperature(day.bbt!, tempUnit)` |
| [`CycleChartPage.tsx:339-340`](app/src/cycle-tracking/CycleChartPage.tsx:339) — interpolating between gap days | same ternary on `p1.bbt` and `p2.bbt` | `toDisplayTemperature(p1.bbt, settings.temperatureUnit)` etc. |
| [`CycleChartPage.tsx:633-635`](app/src/cycle-tracking/CycleChartPage.tsx:633) — coverline render Y position | `unit === 'CELSIUS' ? coverlineC : celsiusToFahrenheit(coverlineC)` | `toDisplayTemperature(coverlineC, settings.temperatureUnit)` |
| [`CycleChartPage.tsx:1336`](app/src/cycle-tracking/CycleChartPage.tsx:1336) — peak/segment overlay anchor | same ternary | `toDisplayTemperature(...)` |
| [`CycleChartPage.tsx:1461`](app/src/cycle-tracking/CycleChartPage.tsx:1461) — tooltip number (unit suffix is rendered separately on the next line) | inline `fahrenheitToCelsius(bbtDay.bbt).toFixed(2)` ternary | `toDisplayTemperature(bbtDay.bbt, settings.temperatureUnit).toFixed(2)` — keep the `°C` / `°F` suffix concatenation as it is today. **Do not** use `formatTemperature` here, because that helper would inject a duplicate unit suffix. |
| [`CycleChartPage.tsx:1596`](app/src/cycle-tracking/CycleChartPage.tsx:1596) — peak-day overlay Y position | same ternary | `toDisplayTemperature(...)` |
| [`AddCycleDayPage.tsx:66`](app/src/cycle-tracking/AddCycleDayPage.tsx:66) — form prefill into `<input type="number">` | `unit === 'CELSIUS' ? fahrenheitToCelsius(existingDay.bbt).toFixed(2) : existingDay.bbt.toFixed(2)` | Inside the existing `if (existingDay.bbt)` branch: `toDisplayTemperature(existingDay.bbt, settings.temperatureUnit).toFixed(2)` (string of digits, no `°C`/`°F` suffix). The `if (existingDay.bbt)` narrows `bbt` to `number`, which selects the non-nullable overload of `toDisplayTemperature` so `.toFixed(2)` type-checks under strict. **Must not** use `formatTemperature` here — the BBT input is `type="number"` ([line 346](app/src/cycle-tracking/AddCycleDayPage.tsx:346)) and rejects any non-numeric suffix, so a `36.50°C`-shaped string would silently fail to populate the field. |
| [`interpretation/components/ThermalShiftAnnotations.tsx:93`](app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx:93) — annotation Y position | `unit === 'CELSIUS' ? fahrenheitToCelsius(day.bbt) : day.bbt` | `toDisplayTemperature(day.bbt, temperatureUnit)` |

Other display surfaces — cycle-day card, settings preview, any CSV export — stay on `formatTemperature` because they emit strings, not numeric positions. None of them currently bypass the helper, but they should be re-checked during the verification grep.

**Verification gates** (added to the Verification section):

- `grep -rn "fahrenheitToCelsius(.*\.bbt" app/src` returns no matches. (After the migration, no display code should be calling F → C on a `bbt` value — the value is already °C.)
- `grep -rn "celsiusToFahrenheit(.*\.bbt" app/src` returns no matches. (All such conversions go through `toDisplayTemperature` or `formatTemperature`.)
- **Manual audit** of the chart math blocks listed in the Display boundary table (plotting at `:178`, interpolation at `:339`, coverline at `:633`, peak/segment overlay at `:1336`, peak overlay at `:1596`). Each should now read through `toDisplayTemperature(...)` and have **no inline `temperatureUnit === 'CELSIUS' ? ... : ...` ternary that wraps a temperature *number*.** A blanket `grep "temperatureUnit === 'CELSIUS'"` across `CycleChartPage.tsx` will *not* be empty after the migration — legitimate display-unit branches remain (e.g. unit suffix `?'°C':'°F'` at [`:555`](app/src/cycle-tracking/CycleChartPage.tsx:555), tick label precision `?value.toFixed(1):value.toFixed(2)` at [`:750`](app/src/cycle-tracking/CycleChartPage.tsx:750)), so this gate is a manual audit of the listed line ranges, not a blanket grep.

### Interpretation-state fingerprint — match the engine exactly

[`interpretation/dataFingerprint.ts`](app/src/cycle-tracking/interpretation/dataFingerprint.ts) computes a stable hash of cycle data so dismissed interpretations can auto-recover when the data underlying them changes. The contract is: *if the engine would now produce a different result, the fingerprint must change.* Today the function rounds `bbt` to 2 decimal places before hashing:

```ts
t: d.bbt !== null ? Number(d.bbt.toFixed(2)) : null,
```

Any rounding step inside the fingerprint creates a class of edits where the rounded value is unchanged but the engine result flips. Bumping the precision shrinks that class but does not eliminate it — for any chosen `N` decimal places, two raw values `(threshold − 5×10⁻ⁿ⁻¹)` and `(threshold + 5×10⁻ⁿ⁻¹)` straddle the engine threshold yet round to the same string. Concretely at 3 dp: `36.6996` vs `36.7004` both round to `36.700` and produce the same fingerprint, while the engine flips its shift verdict between them.

The engine uses raw float values at full precision. The only way to guarantee the fingerprint matches the engine is to feed the fingerprint the same raw value the engine sees.

**Fix:** remove the BBT rounding entirely. Hash the raw stored float.

```ts
// before:
t: d.bbt !== null ? Number(d.bbt.toFixed(2)) : null,
// after:
t: d.bbt,  // raw stored Celsius float, no rounding
```

**Why this is safe (no spurious fingerprint changes):**

- The input boundary controls how floats are produced. `convertToCelsiusForStorage` is either pass-through (Celsius input) or one full-precision multiply/subtract (Fahrenheit input). The same user input always produces the same float.
- Re-saving a cycle day **without editing BBT** writes the same float — *only because* the AddCycleDayPage submit path is required (see Input boundary, AddCycleDayPage entry) to detect a no-op BBT edit and persist `existingDay.bbt` raw, bypassing the parse / round-trip through `.toFixed(2)`. Without that preservation rule, prefilled values like `"36.70"` would get re-parsed as `36.7`, mutating a stored `36.6996` even though the user never touched the field.
- `JSON.stringify` produces a deterministic decimal representation of any IEEE-754 float, so the hash is stable across runs and platforms.

The fingerprint's no-rounding correctness depends on the form's no-op-preservation rule. They must ship together.

**Regression test:** add to [`__tests__/dataFingerprint.test.ts`](app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts):

> *"any BBT edit across the threshold edge produces a different fingerprint, regardless of decimal precision"* — table-driven, with at least these pairs (cover line `36.50 °C` for all):
> - `36.699` vs `36.700` (the 3 dp edge case)
> - `36.6996` vs `36.7004` (the case 3 dp would have collapsed)
> - `36.69999` vs `36.70001` (well into float territory)
>
> Each pair must produce different fingerprints.

**Why not just keep some rounding "for safety":**

- 2 dp collapses `36.699` and `36.700` (the literal handbook-precision case).
- 3 dp collapses `36.6996` and `36.7004`.
- N dp collapses any pair within `5×10⁻ⁿ⁻¹` of the threshold.
- Float-precision (no rounding) collapses nothing meaningful — the engine and the fingerprint see the same value.

The fingerprint should mirror the engine's input, not approximate it.

### Chart Y-axis range and the chart's coordinate system

**The chart's internal coordinate system is the user's display unit, not Celsius.** ApexCharts plots series values, axis tick positions, axis bounds, overlay anchors, and coverline annotations on a single linear axis — all of those numbers must be in the same unit. Today everything in the chart is Fahrenheit. After migration the chart code switches to "everything is whatever `settings.temperatureUnit` is": series values, `yAxisRange.min/max`, overlay positions, coverline. Tick labels and tooltip text already reflect the same unit because they read the same numbers.

The migration is therefore:

- Series values come from `toDisplayTemperature(day.bbt, unit)` (Display boundary table). Already specified.
- The Y-axis range derivation routine — including the existing buffer/auto-bump-convergence behaviour — continues to operate on the *display-unit* values it gets from the points it sees. The routine itself does not need a unit-awareness change; it sees the same shape of input as before, just sourced via `toDisplayTemperature` instead of via the old inline ternary. Its output (`yAxisRange.min/max`) is therefore in display unit and matches the series values.
- Coverline render position uses `toDisplayTemperature(coverlineC, unit)` (Display boundary table). Same coordinate system.
- All overlay/annotation Y positions use `toDisplayTemperature(...)` (Display boundary table). Same coordinate system.

**Why not the alternative (chart-in-Celsius, label-only conversion)?** That would require splitting axis numbers from axis labels via `yaxis.labels.formatter`, splitting tooltip numbers from tooltip text, and rewriting overlay/coverline positioning from "compare against display-unit `yAxisRange`" to "always Celsius". It's more code change and more risk of one site falling out of sync, for the same end-user result. The display-unit-coordinate approach matches what the chart already does.

**Engine output → chart input is the only conversion crossing.** `coverlineC` from the engine is Celsius; the chart immediately runs it through `toDisplayTemperature` at the render boundary. Same for any other engine-derived overlay value (peak day temperature, threshold delta annotations, etc.). The conversion never happens twice.

## Testing

### Fixture rewrite

Existing tests fall into two groups, both verified by grep:

1. **Tests already authored in Celsius via `celsiusToFahrenheit()` wrapper.**
   Files: [`validateAdjustment.test.ts`](app/src/cycle-tracking/interpretation/__tests__/validateAdjustment.test.ts), [`getActiveCoverline.test.ts`](app/src/cycle-tracking/interpretation/__tests__/getActiveCoverline.test.ts), [`getChartAnnotations.test.ts`](app/src/cycle-tracking/interpretation/__tests__/getChartAnnotations.test.ts), [`adjustReviewTrigger.test.ts`](app/src/cycle-tracking/interpretation/__tests__/adjustReviewTrigger.test.ts).
   These have helpers like `bbt: tC === null ? null : celsiusToFahrenheit(tC)`. Simply drop the wrapper: `bbt: tC`.

2. **Tests with raw numeric Fahrenheit fixtures.**
   Files: [`thermalShift.test.ts`](app/src/cycle-tracking/interpretation/__tests__/thermalShift.test.ts), [`excludedDays.test.ts`](app/src/cycle-tracking/interpretation/__tests__/excludedDays.test.ts), [`postShiftMonitoring.test.ts`](app/src/cycle-tracking/interpretation/__tests__/postShiftMonitoring.test.ts), [`integration.test.ts`](app/src/cycle-tracking/interpretation/__tests__/integration.test.ts), [`nudges.test.ts`](app/src/cycle-tracking/interpretation/__tests__/nudges.test.ts), [`measurementTime.test.ts`](app/src/cycle-tracking/interpretation/__tests__/measurementTime.test.ts), [`classificationDecisions.test.ts`](app/src/cycle-tracking/interpretation/__tests__/classificationDecisions.test.ts), [`dataFingerprint.test.ts`](app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts).
   Rewrite the numbers in Celsius using canonical Sensiplan-handbook style:
   ```ts
   // before:
   const day1 = { bbt: 97.5, /* ... */ };
   // after:
   const day1 = { bbt: 36.39, /* ... */ };  // pre-shift baseline
   ```

Use realistic handbook sequences in any rewritten fixture (e.g. baseline `36.45 – 36.55 °C`, shift day `36.70 °C`, third reading `36.75 °C`). The chart-node label test [`getTempNodeLabel.test.ts`](app/src/cycle-tracking/__tests__/getTempNodeLabel.test.ts) takes display-temp inputs and is unit-agnostic — leave it as is.

### New precision-edge tests

Three regression tests guarding the engine threshold property:

1. **`thermalShift — false-positive guard at 0.199 °C above cover line`**
   Cover line `36.50 °C`, third reading `36.699 °C` → must NOT confirm.

2. **`thermalShift — exact-threshold confirm at 0.200 °C above cover line`**
   Cover line `36.50 °C`, third reading `36.700 °C` → MUST confirm.

3. **`thermalShift — Fahrenheit user input at threshold edge`**
   Simulate the input pipeline end-to-end: a Fahrenheit user enters `97.97 °F` for the third reading; cover line is `36.50 °C`. The input-boundary helper produces `(97.97 − 32) × 5/9 = 36.65 °C`, which is `0.15 °C` above the cover line — under the `0.2 °C` threshold. Must NOT confirm. Exercises the input-boundary conversion + engine threshold together.

### No-op edit preservation tests

In `AddCycleDayPage.test.tsx` (or a new test file co-located with the page):

4. **`AddCycleDayPage — no-op BBT edit preserves raw stored float (Celsius user)`**
   Existing day stored with `bbt = 36.6996`. Render the edit form; expect the BBT input to read `"36.70"`. Change the cervical observation only and submit. Assert the operation receives `bbt: 36.6996` (raw stored value), not `36.7`.

5. **`AddCycleDayPage — no-op BBT edit preserves raw stored float (Fahrenheit user)`**
   Same shape, with a stored Celsius value whose °F display rounds at the second decimal — e.g. stored `bbt = 36.65555…`, display `(36.65555 × 9/5 + 32) = 97.98°F`, prefilled `"97.98"`. Submit unchanged; assert raw `36.65555…` is persisted.

6. **`AddCycleDayPage — actual BBT edit reparses and stores new value`**
   Existing day stored with `bbt = 36.6996`. Render, then change the input from `"36.70"` to `"36.85"`. Submit. Assert the operation receives the freshly converted value, not `existingDay.bbt`.

7. **`AddCycleDayPage — clearing the BBT input persists null`**
   Existing day stored with `bbt = 36.50`. Render, clear the input (`""`). Submit. Assert the operation receives `bbt: null` (not `undefined` — `undefined` would be a no-op against Prisma) and that the column reads `NULL` after save. Covers the `Prisma update.undefined === no-op` trap.

### Manual smoke test

Before merge, log in as both a °C user and a °F user, enter a full cycle (10–14 days with a clear shift), and confirm:

- Coverline appears at the expected position on the chart in both unit settings.
- Thermal shift annotation lands on the same calendar day in both unit settings.
- Form input round-trips: enter `97.55 °F`, save, reopen the form — see `97.55 °F`. Switch settings to Celsius and reopen — see `36.42 °C`.

## Migration / rollout

Production has no users yet, so:

1. Branch from `main`.
2. Add Prisma migration that updates the schema comment (the column itself is unchanged); run `prisma migrate reset` in dev.
3. Code changes in this order: utils → engine → input boundary → display boundary → chart → tests.
4. Manual smoke test (above).
5. Merge to `main`.

A future post-launch backfill (if/when production has real data) is out of scope here. The shape of that future migration is straightforward — multiply each stored value by `5/9` after subtracting 32 — but it deserves its own spec at that time.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A chart call site keeps the old `unit === 'CELSIUS' ? fahrenheitToCelsius(bbt) : bbt` ternary and silently inverts (Celsius users see °C-as-°C math, Fahrenheit users see broken numbers). | Replace every chart ternary with `toDisplayTemperature(...)` (per the Display boundary table). Verification grep below catches any leftover. |
| A widget reads `cycleDay.bbt` directly and formats it inline, missing the canonical unit flip. | Grep audit on `\.bbt` reads outside `formatTemperature` / `toDisplayTemperature` / `getTempNodeLabel` / engine code. |
| Round-trip drift surprises a Fahrenheit user (e.g. `97.55 → 36.41666… → 97.55000000001`). | `.toFixed(2)` at the display layer kills any visible drift. Float drift is ~1e-13 °F. |
| Tests still pass for the wrong reason (e.g. fixture happens to also work in F). | The new precision-edge tests catch silent regressions. |
| Y-axis range looks off after flipping canonical unit. | Smoke test on both unit settings before merge. |
| Coverline annotation misaligned because annotation Y-coordinate uses cached F value. | Audit annotation code together with chart code; coverline is already computed in C, so this is a render-only adjustment. |
| One of the eight engine `fahrenheitToCelsius()` call sites missed during refactor → that rule silently re-converts a °C value as if it were °F. | Engine-files grep `grep -rn "fahrenheitToCelsius" app/src/cycle-tracking/interpretation/` returns zero matches as a verification gate. Engine tests that exercise each rule must be present before the refactor (existing coverage already covers all eight). |
| One of the three BBT write paths missed → new rows land in Fahrenheit while column is now Celsius. | All three writers (AddCycleDayPage, NewCyclePage, CSV import) call `convertToCelsiusForStorage`. Verification: grep `bbt:` writes in operations.ts and ensure each comes from the helper. |
| Fingerprint rounds BBT before hashing → any chosen precision leaves a band of threshold-straddling pairs that hash-collide, so dismissed interpretations fail to auto-recover near the threshold. | Remove BBT rounding from the fingerprint entirely; hash the raw stored float. New fingerprint test covers multiple pair widths (`36.699/36.700`, `36.6996/36.7004`, `36.69999/36.70001`). |
| Chart coordinate-system unit drift: series in display unit but `yAxisRange` in Celsius (or vice-versa) so points and axis disagree. | Spec specifies the chart coordinate system is uniformly the user's display unit. Both series and `yAxisRange` derive from `toDisplayTemperature` outputs. Smoke test with both unit settings catches mismatches. |
| Form prefill uses `formatTemperature` and silently fails to populate `<input type="number">` because of the unit suffix. | Display boundary table requires `toDisplayTemperature(...).toFixed(2)` for the input prefill. Smoke test step "edit existing day" catches this. |
| No-op BBT edit silently rewrites raw float: stored `36.6996` prefills as `"36.70"`, parses on submit as `36.7`, mutating engine input even though the user never touched the field. | AddCycleDayPage submit path required to detect "BBT input string unchanged from prefill" and persist `existingDay.bbt` raw in that case. Regression test in `AddCycleDayPage.test.tsx` covers this. |
| Form clears the BBT field but the column does not become NULL because `bbt: undefined` is a Prisma no-op. | Widen payload type to `bbt?: number \| null`; submit handler sends explicit `null` on clear. Regression test asserts the column reads NULL after a clear-and-save. |

## Verification (definition of done)

- All existing interpretation tests pass with Celsius fixtures.
- Three new precision-edge thermal-shift tests pass.
- New fingerprint regression tests pass: `36.699/36.700`, `36.6996/36.7004`, and `36.69999/36.70001` each produce different fingerprints. The fingerprint function uses the raw `bbt` float with no rounding step.
- Chart smoke test with `temperatureUnit = CELSIUS`: series points sit on tick lines, coverline lines up with the `36.50 °C` reading, peak/overlay anchors land on their points.
- Chart smoke test with `temperatureUnit = FAHRENHEIT`: same checks, axis labels read in °F, all coordinates consistent.
- Edit-existing-day smoke test on both unit settings: the BBT input field populates with the stored value (e.g. `36.50` or `97.70`), no `°C`/`°F` suffix in the field.
- `grep -rn "fahrenheitToCelsius" app/src/cycle-tracking/interpretation/` returns no matches (engine files only — the helper itself stays in `utils.ts` for display callers).
- `grep -rn "fahrenheitToCelsius(.*\.bbt" app/src` returns no matches anywhere (display code now reads `bbt` as Celsius; F → C on a `bbt` value is meaningless after migration).
- `grep -rn "celsiusToFahrenheit(.*\.bbt" app/src` returns no matches outside `toDisplayTemperature` / `formatTemperature` (no inline C → F conversions on stored values).
- Manual audit of `CycleChartPage.tsx` math blocks (lines listed in the Display boundary table): each now calls `toDisplayTemperature(...)` with no inline `temperatureUnit === 'CELSIUS' ? ... : ...` ternary wrapping a temperature *number*. Legitimate display-unit branches for label text (`'°C'/'°F'`) and tick precision (`toFixed(1)/toFixed(2)`) remain — they are not in scope.
- All three BBT write paths (`AddCycleDayPage`, `NewCyclePage`, CSV import) flow through `convertToCelsiusForStorage`.
- AddCycleDayPage submit handler preserves `existingDay.bbt` raw when the BBT input string equals the prefilled string. New regression test covers a no-op edit on a stored `36.6996 °C` value (Celsius user) and an analogous case for a Fahrenheit user (stored value whose °F display rounds at the second decimal).
- All chart numeric-math sites listed in the Display boundary table now call `toDisplayTemperature(...)`. The tooltip site (CycleChartPage.tsx:1461) and the form prefill site (AddCycleDayPage.tsx:66) call `toDisplayTemperature(...).toFixed(2)`. The cycle-day card and settings preview continue to use `formatTemperature(...)` (with unit suffix).
- Manual smoke test passes for both °C and °F users.
- Schema comment in [`app/schema.prisma`](app/schema.prisma) documents Celsius as canonical and links to this spec.
- `CycleDayInput.bbt` JSDoc in [`interpretation/types.ts`](app/src/cycle-tracking/interpretation/types.ts) updated from "Fahrenheit" to "Celsius".

## References

- [Sensiplan — official site (Malteser Arbeitsgruppe NFP)](https://www.sensiplan.de/en)
- *Natural & Safe: The Handbook* (Cycleforth/Malteser, English Sensiplan handbook)
- [Tempdrop — Sensiplan overview confirming Celsius is the native unit](https://www.tempdrop.com/blogs/resources/sensiplan-fertility-awareness-method-overview)
- [Daysy — NFP rules summary including 0.2 °C / 0.1 °C distinctions across methods](https://usa.daysy.me/learn-more/learn-your-cycle/nfp-rules/)
- [memory/feedback_sensiplan_alignment.md](../../../../.claude/projects/-Users-olgapak-work-cycle-path/memory/feedback_sensiplan_alignment.md) — all interpretation features must follow Sensiplan guidelines
- Prior specs:
  - [2026-04-14-sensiplan-thermal-shift-engine-design.md](2026-04-14-sensiplan-thermal-shift-engine-design.md)
  - [2026-04-20-coverline-recovery-and-cycle-classification.md](2026-04-20-coverline-recovery-and-cycle-classification.md)
