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
- Rewrite of `formatTemperature` and `getTempNodeLabel` to take Celsius input and convert outwards.
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

**[`app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts`](app/src/cycle-tracking/interpretation/sensiplan/thermalShift.ts)**

- Remove every `fahrenheitToCelsius()` call. Read `cycleDay.bbt` directly — it is already Celsius.
- `THRESHOLD_C = 0.2` constant remains exactly as is.
- The function signature `detectThermalShift()` stays the same; only the body shrinks.

**[`app/src/cycle-tracking/interpretation/getActiveCoverline.ts`](app/src/cycle-tracking/interpretation/getActiveCoverline.ts)**

- `collectReferenceDays()` reads `bbt` directly as Celsius.
- Coverline math (max of 6 reference days) is unchanged.

After this layer is done, no rule code references Fahrenheit at all.

### Conversion layer

**[`app/src/cycle-tracking/utils.ts`](app/src/cycle-tracking/utils.ts)**

Two helper changes:

1. **Rename + reverse:** `convertToFahrenheitForStorage(value, unit)` → `convertToCelsiusForStorage(value, unit)`.
   - If `unit === CELSIUS` → return parsed number unchanged.
   - If `unit === FAHRENHEIT` → return `(value − 32) × 5/9` at full float precision. No rounding.

2. **Reverse the formatters:**
   - `formatTemperature(celsiusValue: number, unit: TemperatureUnit): string` — input is now Celsius. If unit is Fahrenheit, convert via `c × 9/5 + 32`, then `.toFixed(2)`. If Celsius, `.toFixed(2)` directly.
   - `getTempNodeLabel(celsiusValue, unit)` — same shape, `.toFixed(1)`.

Both helpers handle `null`/`undefined` input the same way they do today.

### Input boundary

**[`app/src/cycle-tracking/pages/AddCycleDayPage.tsx`](app/src/cycle-tracking/pages/AddCycleDayPage.tsx)** (and any other place a BBT value is submitted)

- Replace `convertToFahrenheitForStorage` with `convertToCelsiusForStorage` at the form submit handler.
- The form's input field continues to display the user's chosen unit and validates against unit-appropriate ranges. Only the value sent to the server changes.
- No UI/UX change visible to the user.

### Display boundary

Every place that today reads `cycleDay.bbt` and formats it:

- Cycle chart (Y-axis labels, plotted points, tooltips, node labels).
- Cycle day card / form preview.
- CSV / data export (if present today).
- Coverline annotation render (computed coverline is already Celsius internally; format on render).
- Settings page preview.

All routed through `formatTemperature` / `getTempNodeLabel`. A grep audit (see Verification) confirms no widget reads `cycleDay.bbt` directly and formats inline.

### Chart Y-axis range

Wherever the Y-axis range is defined today (currently in Fahrenheit), define it in Celsius:

- Canonical range: roughly `35.5 °C – 37.5 °C` with the existing buffer/auto-bump behaviour preserved.
- For °F users, convert tick values to Fahrenheit at render time only.
- The "yAxisRange bump convergence" routine (per recent commits) operates entirely in Celsius and emits Celsius bounds; the renderer converts.

## Testing

### Fixture rewrite

Existing tests in [`app/src/cycle-tracking/interpretation/`](app/src/cycle-tracking/interpretation/) and elsewhere likely encode BBT fixture values in Fahrenheit. Rewrite them in Celsius using the canonical Sensiplan handbook style:

```ts
// before:
const day1 = { bbt: 97.5, /* ... */ };
// after:
const day1 = { bbt: 36.39, /* ... */ };  // pre-shift baseline
```

Use realistic Sensiplan-handbook sequences in tests where possible (e.g. baseline `36.45–36.55 °C`, shift to `36.70 °C`, third reading `36.75 °C`).

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
| A widget reads `cycleDay.bbt` directly and formats it inline, missing the canonical unit flip. | Grep audit on `\.bbt` reads outside `formatTemperature` / `getTempNodeLabel` / engine code. Optionally, an ESLint rule. |
| Round-trip drift surprises a Fahrenheit user (e.g. `97.55 → 36.41666… → 97.55000000001`). | `.toFixed(2)` at the display layer kills any visible drift. Float drift is ~1e-13 °F. |
| Tests still pass for the wrong reason (e.g. fixture happens to also work in F). | The three new precision-edge tests catch silent regressions. |
| Y-axis range looks off after flipping canonical unit. | Smoke test on both unit settings before merge. |
| Coverline annotation misaligned because annotation Y-coordinate uses cached F value. | Audit annotation code together with chart code; coverline is already computed in C, so this is a render-only adjustment. |

## Verification (definition of done)

- All existing interpretation tests pass with Celsius fixtures.
- Three new precision-edge tests pass.
- Grep audit returns no raw `\.bbt` reads outside the formatter helpers and the engine.
- Manual smoke test passes for both °C and °F users.
- No remaining usage of `fahrenheitToCelsius` inside rule-engine files (it can remain in `utils.ts` as a public conversion helper used by display code, if needed).
- Schema comment in [`app/schema.prisma`](app/schema.prisma) documents Celsius as canonical and links to this spec.

## References

- [Sensiplan — official site (Malteser Arbeitsgruppe NFP)](https://www.sensiplan.de/en)
- *Natural & Safe: The Handbook* (Cycleforth/Malteser, English Sensiplan handbook)
- [Tempdrop — Sensiplan overview confirming Celsius is the native unit](https://www.tempdrop.com/blogs/resources/sensiplan-fertility-awareness-method-overview)
- [Daysy — NFP rules summary including 0.2 °C / 0.1 °C distinctions across methods](https://usa.daysy.me/learn-more/learn-your-cycle/nfp-rules/)
- [memory/feedback_sensiplan_alignment.md](../../../../.claude/projects/-Users-olgapak-work-cycle-path/memory/feedback_sensiplan_alignment.md) — all interpretation features must follow Sensiplan guidelines
- Prior specs:
  - [2026-04-14-sensiplan-thermal-shift-engine-design.md](2026-04-14-sensiplan-thermal-shift-engine-design.md)
  - [2026-04-20-coverline-recovery-and-cycle-classification.md](2026-04-20-coverline-recovery-and-cycle-classification.md)
