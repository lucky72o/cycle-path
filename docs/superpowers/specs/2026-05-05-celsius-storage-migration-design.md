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
- Y-axis range definition flipped to Celsius-canonical, converted for °F users at render time.
- Test fixtures rewritten in Celsius to match Sensiplan handbook examples.
- Three new precision-edge regression tests.

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

1. **[`AddCycleDayPage.tsx`](app/src/cycle-tracking/AddCycleDayPage.tsx)** (line ~101)
   - Today: `convertToFahrenheitForStorage(bbtValue, settings.temperatureUnit)`.
   - After: `convertToCelsiusForStorage(bbtValue, settings.temperatureUnit)`.
   - Also update the **prefill path** (line ~66) which reads `existingDay.bbt`, currently runs `fahrenheitToCelsius()` for °C users and uses the raw value for °F users; after migration it must do the reverse — use raw for °C users, `celsiusToFahrenheit()` for °F users.

2. **[`NewCyclePage.tsx`](app/src/cycle-tracking/NewCyclePage.tsx)** (line ~189)
   - Today: bypasses the helper and calls `celsiusToFahrenheit(parseFloat(bbt))` inline for °C users.
   - After: use `convertToCelsiusForStorage(parseFloat(bbt), settings.temperatureUnit)` so this path is consistent with `AddCycleDayPage`.

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
export function toDisplayTemperature(celsiusValue, unit) {
  if (celsiusValue == null) return null;
  return unit === 'CELSIUS' ? celsiusValue : celsiusToFahrenheit(celsiusValue);
}
```

**Two helpers, two purposes:**
- `toDisplayTemperature(value, unit)` — returns a `number`. Used wherever the chart needs the value for math (plotting Y position, interpolation between points, overlay anchoring, picking values to feed `getTempNodeLabel`).
- `formatTemperature(value, unit)` — returns a `string`, two decimals. Used wherever a human reads the value (form input prefill, tooltip text, settings preview, CSV cell).

**Sites that must move to the new helper.** All currently use the soon-to-be-inverted ternary on raw `bbt`:

| Location | Today's pattern | After |
|---|---|---|
| [`CycleChartPage.tsx:178`](app/src/cycle-tracking/CycleChartPage.tsx:178) — plotting points | `tempUnit === 'CELSIUS' ? fahrenheitToCelsius(day.bbt!) : day.bbt!` | `toDisplayTemperature(day.bbt!, tempUnit)` |
| [`CycleChartPage.tsx:339-340`](app/src/cycle-tracking/CycleChartPage.tsx:339) — interpolating between gap days | same ternary on `p1.bbt` and `p2.bbt` | `toDisplayTemperature(p1.bbt, settings.temperatureUnit)` etc. |
| [`CycleChartPage.tsx:633-635`](app/src/cycle-tracking/CycleChartPage.tsx:633) — coverline render Y position | `unit === 'CELSIUS' ? coverlineC : celsiusToFahrenheit(coverlineC)` | `toDisplayTemperature(coverlineC, settings.temperatureUnit)` |
| [`CycleChartPage.tsx:1336`](app/src/cycle-tracking/CycleChartPage.tsx:1336) — peak/segment overlay anchor | same ternary | `toDisplayTemperature(...)` |
| [`CycleChartPage.tsx:1461`](app/src/cycle-tracking/CycleChartPage.tsx:1461) — tooltip text | inline `fahrenheitToCelsius(bbtDay.bbt).toFixed(2)` ternary | `formatTemperature(bbtDay.bbt, settings.temperatureUnit)` (string output) |
| [`CycleChartPage.tsx:1596`](app/src/cycle-tracking/CycleChartPage.tsx:1596) — peak-day overlay Y position | same ternary | `toDisplayTemperature(...)` |
| [`AddCycleDayPage.tsx:66`](app/src/cycle-tracking/AddCycleDayPage.tsx:66) — form prefill | `unit === 'CELSIUS' ? fahrenheitToCelsius(existingDay.bbt).toFixed(2) : existingDay.bbt.toFixed(2)` | `formatTemperature(existingDay.bbt, settings.temperatureUnit)` (or `toDisplayTemperature(...).toFixed(2)` if a numeric value is needed for the input) |
| [`interpretation/components/ThermalShiftAnnotations.tsx:93`](app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx:93) — annotation Y position | `unit === 'CELSIUS' ? fahrenheitToCelsius(day.bbt) : day.bbt` | `toDisplayTemperature(day.bbt, temperatureUnit)` |

Other display surfaces — cycle-day card, settings preview, any CSV export — stay on `formatTemperature` because they emit strings, not numeric positions. None of them currently bypass the helper, but they should be re-checked during the verification grep.

**Verification gates** (added to the Verification section):

- `grep -rn "fahrenheitToCelsius(.*\.bbt" app/src` returns no matches. (After the migration, no display code should be calling F → C on a `bbt` value — the value is already °C.)
- `grep -rn "celsiusToFahrenheit(.*\.bbt" app/src` returns no matches. (All such conversions go through `toDisplayTemperature` or `formatTemperature`.)
- `grep -rn "temperatureUnit === 'CELSIUS' \?" app/src/cycle-tracking/CycleChartPage.tsx` returns no matches in chart code.

### Interpretation-state fingerprint — precision must match the engine

[`interpretation/dataFingerprint.ts`](app/src/cycle-tracking/interpretation/dataFingerprint.ts) computes a stable hash of cycle data so that dismissed interpretations can auto-recover when the data underlying them changes. Today it rounds `bbt` to **2 decimal places** before hashing:

```ts
t: d.bbt !== null ? Number(d.bbt.toFixed(2)) : null,
```

Why this is fine in Fahrenheit storage: 2 decimal places of °F is `0.01 °F ≈ 0.0056 °C`, which is ~36× finer than the `0.2 °C` engine threshold, so any edit big enough to flip the thermal-shift verdict also changes the fingerprint.

Why this **breaks under Celsius storage:** 2 decimal places of °C is `0.01 °C`, which is only 20× finer than the threshold, but more importantly it creates threshold-aligned edges. An edit from `36.699 °C` (engine: shift not confirmed, delta = 0.199) to `36.700 °C` (engine: shift confirmed, delta = 0.200) both round to `36.70` and produce the **same fingerprint** — so a previously-dismissed interpretation would not auto-recover even though the engine result has flipped.

**Fix:** bump the precision to **3 decimal places** (`d.bbt.toFixed(3)`).

- 3 dp = `0.001 °C`, 200× finer than the threshold. Any engine-meaningful edit changes the fingerprint.
- Still well above realistic thermometer resolution (`0.05 °C`), so meaningless input jitter does not produce spurious fingerprint changes.
- Trivial change; no schema or downstream consumer impact (fingerprint is opaque).

**Regression test:** add a test in [`__tests__/dataFingerprint.test.ts`](app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts):

> *"a 0.001 °C edit across the threshold edge produces a different fingerprint"* — two cycles identical except day N has `bbt: 36.699` vs `bbt: 36.700`; expect `computeCycleDataFingerprint(a) !== computeCycleDataFingerprint(b)`.

### Chart Y-axis range

Wherever the Y-axis range is defined today (currently in Fahrenheit), define it in Celsius:

- Canonical range: roughly `35.5 °C – 37.5 °C` with the existing buffer/auto-bump behaviour preserved.
- For °F users, convert tick values to Fahrenheit at render time only.
- The "yAxisRange bump convergence" routine (per recent commits) operates entirely in Celsius and emits Celsius bounds; the renderer converts.

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

Three regression tests guarding the property the user explicitly raised:

1. **`thermalShift — false-positive guard at 0.199 °C above cover line`**
   Cover line `36.50 °C`, third reading `36.699 °C` → must NOT confirm.

2. **`thermalShift — exact-threshold confirm at 0.200 °C above cover line`**
   Cover line `36.50 °C`, third reading `36.700 °C` → MUST confirm.

3. **`thermalShift — Fahrenheit user input at threshold edge`**
   Simulate the input pipeline end-to-end: a Fahrenheit user enters `97.97 °F` for the third reading; cover line is `36.50 °C`. The input-boundary helper produces `(97.97 − 32) × 5/9 = 36.65 °C`, which is `0.15 °C` above the cover line — under the `0.2 °C` threshold. Must NOT confirm. Exercises the input-boundary conversion + engine threshold together.

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
| Fingerprint stays at 2 dp → dismissed interpretations fail to auto-recover near threshold. | Bump to 3 dp; new fingerprint test covers `36.699` vs `36.700`. |

## Verification (definition of done)

- All existing interpretation tests pass with Celsius fixtures.
- Three new precision-edge thermal-shift tests pass.
- New fingerprint regression test (`36.699 → 36.700` produces different fingerprint) passes.
- `grep -rn "fahrenheitToCelsius" app/src/cycle-tracking/interpretation/` returns no matches (engine files only — the helper itself stays in `utils.ts` for display callers).
- `grep -rn "fahrenheitToCelsius(.*\.bbt" app/src` returns no matches anywhere (display code now reads `bbt` as Celsius; F → C on a `bbt` value is meaningless after migration).
- `grep -rn "celsiusToFahrenheit(.*\.bbt" app/src` returns no matches outside `toDisplayTemperature` / `formatTemperature` (no inline C → F conversions on stored values).
- `grep -rn "temperatureUnit === 'CELSIUS'" app/src/cycle-tracking/CycleChartPage.tsx` returns no matches in the chart's plotting / interpolation / overlay / coverline / tooltip blocks (all replaced by `toDisplayTemperature` / `formatTemperature`).
- All three BBT write paths (`AddCycleDayPage`, `NewCyclePage`, CSV import) flow through `convertToCelsiusForStorage`.
- All chart numeric-math sites listed in the Display boundary table now call `toDisplayTemperature(...)`; tooltip sites call `formatTemperature(...)`.
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
