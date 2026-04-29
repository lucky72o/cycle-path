# AdjustFlow v2 — Design Spec

**Date:** 2026-04-26 (revised same day after first review pass)
**Status:** Spec finalized; implementation pending
**Related:** [2026-04-14 Sensiplan thermal shift engine design](./2026-04-14-sensiplan-thermal-shift-engine-design.md)

**Revision notes:**
- Added review-trigger logic for ADJUSTED state to handle data edits that change the user's derived coverline (P1.1) and to suppress unnecessary review on benign pending→confirmed transitions (P1.2).
- Added explicit fixes for chart and post-shift monitoring: recompute coverline from raw days for ADJUSTED state (P2.2).
- Confirmed always-SUGGESTED on revert (P2.1) — explicit user decision; trade-off documented.
- Added "Sensiplan stability principle" section explaining why the ADJUSTED review rule is intentionally narrow.
- **Second review pass:** added "first higher temp" check in validateAdjustment (P1.A) — rejects user picks when Cycle Path detects a confirmed earlier valid shift. Locked down AdjustFlow gating when engine.status='none' (P1.B) — modal never opens in that state; KeptShiftCard's Reject is the only undo path.

---

## Concept

The user picks a thermal-shift day; Cycle Path recomputes everything else (coverline, reference days, confirming days) live and tells the user immediately whether it's a Sensiplan-valid shift.

The user can save when the result is **confirmed** or **pending**. Save is blocked when the result is **failed** or otherwise invalid, with a plain-language explanation.

## Why this is more Sensiplan-aligned than today's design

In Sensiplan, the coverline is a deterministic function of the shift day, not a free variable. The current AdjustFlow lets users type an arbitrary coverline alongside a shift day, which can produce "shifts" that violate Sensiplan's 3-over-6 rule. Removing the coverline input and recomputing it from the shift day brings Adjust into line with the rule book.

Existing infrastructure supports this directly: [`collectReferenceDays`](../../../app/src/cycle-tracking/interpretation/sensiplan/excludedDays.ts) already takes a candidate day, scans back through valid (non-excluded, non-null) temps, stops at 6, and returns the coverline.

---

## Component sketch

### Header
**Adjust Thermal Shift Day**
*Subtitle:* Pick the day of the first higher temperature. The coverline is calculated automatically from the 6 preceding low temps (Sensiplan rule).

### Section 1 — Shift day picker
- Numeric input (or +/− stepper) for **Shift day**.
- Default value: existing `userOverrides.shiftDay` if set, else Cycle Path's `shiftDay`.
- Hint: *"Cycle Path suggests Day X."*
- **"Revert to Cycle Path's suggestion"** secondary link — only visible when the user's value differs from Cycle Path's.

*(AdjustFlow only opens when `engineResult.thermalShift.status !== 'none'` — see "Gating: when AdjustFlow can and cannot open" below. So the picker always has a Cycle Path suggestion to default to and revert to.)*

*(No chart-interaction hint text. Chart-tap is deferred as a separate stretch task.)*

### Section 2 — Validity panel (live, updates as user changes the picker)

Three possible states:

**A. Confirmed** (green)
> ✓ **Sensiplan thermal shift confirmed.**
> Day X is the first higher temp. 3 confirming temps satisfy the rule.

**B. Pending** (amber)
> ⏳ **Awaiting more temperatures.**
> Day X is above the coverline. Need N more high temps to confirm (3rd must reach coverline +0.2 °C, or a 4th consecutive high temp confirms).
> *You can save this adjustment now — it'll finalize once more data is recorded.*

**C. Invalid** (red, Save disabled, with specific reason)
See "Validity errors" below.

### Section 2.5 — Soft warning for early shift days

Banner shown *in addition to* a valid result, when `pickedShiftDay ≤ 7`:

> ⚠ **Early shift — reference temps may include menstrual days.**
> Sensiplan recommends the 6 reference temps come from the post-menstrual low phase. With a shift this early, your reference includes Day 1 / 2 / 3, which can carry leftover heat from your previous luteal phase and inflate the coverline.
> *You can still save this — just review the reference temps below carefully.*

(Save remains allowed.)

### Section 3 — The 6 preceding low temperatures

Card titled **"6 preceding low temps (reference)"** — table format:

| Date | Cycle day | Temp | Note |
|---|---|---|---|
| 15 Mar | Day 2 | 36.32 °C | |
| 16 Mar | Day 3 | 36.28 °C | |
| 17 Mar | Day 4 | — | *missing — skipped* |
| 18 Mar | Day 5 | 36.40 °C | *excluded — skipped* |
| 19 Mar | Day 6 | 36.35 °C | |
| 20 Mar | Day 7 | 36.45 °C | **← Coverline** |
| 21 Mar | Day 8 | 36.30 °C | |
| 22 Mar | Day 9 | 36.38 °C | |

The 6 valid rows are pulled into the calculation; skipped rows are dimmed/struck-through with the reason; the highest of the 6 gets a **"Coverline"** badge.

If <6 valid rows exist before the picked shift day, the panel collapses into a single error message and Save is disabled (see "Validity errors").

### Section 4 — The 3 (or 4) confirming high temperatures

Card titled **"Confirming temps"** — same table format:

| Date | Cycle day | Temp | Above coverline | Note |
|---|---|---|---|---|
| 21 Mar | Day 14 | 36.55 °C | +0.10 °C | **1st higher (shift day)** |
| 22 Mar | Day 15 | 36.50 °C | +0.05 °C | 2nd higher |
| 23 Mar | Day 16 | 36.70 °C | +0.25 °C | 3rd higher — clears +0.2 ✓ |

If 3rd doesn't clear +0.2 °C and a 4th temp confirms:

| 24 Mar | Day 17 | 36.55 °C | +0.10 °C | 4th-day exception ✓ |

If pending (not yet enough confirming temps), greyed-out placeholder rows: *"Day 17 — awaiting"*.

### Section 5 — Cycle Path comparison strip

Inline note when the user's value differs from Cycle Path's suggestion:
> *Cycle Path suggests Day 16 (coverline 36.45 °C). You're picking Day 14 (coverline 36.40 °C).*

### Footer
- **Save Adjustment** — disabled in invalid state.
- **Cancel** — close modal without saving.
- **Revert to Cycle Path's suggestion** — visible only when user's value differs from Cycle Path's.

---

## Validity errors (strict policy — Save disabled)

| Error | Message |
|---|---|
| <6 valid preceding temps | "Sensiplan needs 6 valid low temps before the shift day. You have N (M missing, K excluded). Pick a later shift day, or add/un-exclude earlier temps." |
| Picked day's temp is not above the computed coverline | "Day X's temp (36.40 °C) isn't higher than the coverline (36.45 °C). Sensiplan defines the shift as the *first temp above the coverline*. Pick a different day." |
| **Earlier valid shift exists (first-higher-temp rule)** | "Cycle Path detects a Sensiplan-valid shift earlier, at Day Y. The thermal shift must be the *first* day where the 3-over-6 rule holds. To pick Day X (later), mark the earlier confirming temps as excluded if you believe they were disturbed." |
| 3-over-6 confirmation fails (a confirming temp drops at/below coverline) | "Day Y's temp dropped to/below the coverline, breaking the 3-consecutive-highs rule. This day can't be the shift under Sensiplan." |
| 3rd doesn't clear +0.2 °C and 4th day fails too | "Sensiplan requires the 3rd higher temp to reach coverline +0.2 °C, or a 4th consecutive higher temp. Neither holds for Day X." |
| Picked day has no temperature recorded | "Day X has no temperature recorded — it can't be the shift day." |
| Picked day is excluded from interpretation | "Day X is marked excluded from interpretation. Un-exclude it first, or pick another day." |

**`pending` is NOT an error.** Save is allowed for `confirmed` and `pending`.

### Why the "earlier valid shift" check is needed (P1.A)

Sensiplan defines the shift day as the **first** temperature above the coverline (with 3-over-6 satisfied). The other validity checks above only confirm that the *picked* day is a valid candidate — they don't catch the case where an *earlier* day is also a valid candidate that the user has skipped past.

**Concrete example.** Days 1–7 are low (36.30 °C). Days 8–13 are high (36.50 °C). Day 14 is also high (36.60 °C). The user picks Day 14.

- 6 preceding lows of Day 14 = Days 8–13 (all high-phase).
- Coverline = max of Days 8–13 = 36.50 °C.
- Day 14's temp (36.60) > 36.50 ✓
- 3-over-6 from Day 14 might satisfy → validation passes under the old rules.

But Sensiplan-correct shift is Day 8: its own 6 preceding (Days 2–7) average 36.30, coverline = 36.30, Day 8's 36.50 clearly clears it, 3-over-6 holds easily. Day 8 is the actual first higher temp; Day 14 is not.

Without the new check, the user could save Day 14 as the shift, contradicting Sensiplan's "first higher temp" rule. The simple "is picked day above derived coverline" check doesn't catch this because the derived coverline is artificially inflated when the user picks a late day (the reference window includes high-phase days as if they were lows).

**The check:** run `detectThermalShift(days)` (the existing engine logic, which scans forward and returns the first day where the rule is satisfied). If it returns `status === 'confirmed'` AND `shiftDay < pickedShiftDay` → reject. Pending earlier candidates do *not* block (they haven't satisfied the rule yet); only confirmed earlier candidates do.

If the user genuinely believes the earlier candidate was disturbed (false rise from a fever, alcohol, etc.), they exclude those days first, then return to AdjustFlow. With those days excluded, `detectThermalShift` will skip them and find the next valid candidate.

---

## Behavior matrix

| User picks → | Save allowed? | Card after save |
|---|---|---|
| Confirmed shift day | ✓ Yes | UserAdjustedCard (status='confirmed', state='ADJUSTED') |
| Pending shift day | ✓ Yes | UserAdjustedCard, with "awaiting confirmation" indicator |
| Failed (rule broken) | ✗ No | n/a |
| <6 preceding lows | ✗ No | n/a |
| Picked day not above coverline | ✗ No | n/a |
| Day with no temp / excluded | ✗ No | n/a |
| Earlier confirmed valid shift exists (P1.A) | ✗ No | n/a |

After Save → state flips to `ADJUSTED`, `userOverrides = { shiftDay: pickedShiftDay }` only.
After Revert → `userOverrides = null`, state demotes to `SUGGESTED`. Cycle Path's current result becomes active again; user can re-confirm/adjust/dismiss from there.

**Revert trade-off (P2.1):** Always demoting to SUGGESTED means a user who had previously CONFIRMED (then later ADJUSTED then REVERTED) loses their confirmation. They have to click Confirm again. This is an explicit decision: simplicity over preservation of intermediate state. Re-confirmation is a single click and the engine result is unchanged, so the cost is small.

---

## Gating: when AdjustFlow can and cannot open (P1.B)

AdjustFlow only opens when there is a Cycle Path suggestion to anchor the modal to. Concretely:

> **AdjustFlow opens only when `engineResult.thermalShift.status !== 'none'`.**

Wired up in PropositionCard, this means Adjust buttons exist on:
- ConfirmedCard (engine has confirmed shift, state=SUGGESTED) ✓
- UserConfirmedCard (state=CONFIRMED, engine still detects shift) ✓
- UserAdjustedCard (state=ADJUSTED, engine still detects something — gated by `thermalShift.status !== 'none'`) ✓
- NeedsReviewCard (only when `thermalShift.status !== 'none'`, gated explicitly in `onAdjust` prop) ✓

And **does not** exist on:
- KeptShiftCard (state=ADJUSTED, engine.status='none' — user kept their override against an engine that no longer sees a shift). To **undo** a kept shift, the user clicks **Reject** on KeptShiftCard, which transitions state to DISMISSED. This is the only undo path for a kept shift.

### Why the gating matters

If AdjustFlow could open with engine.status='none':
- The "Cycle Path suggests Day X" hint has nothing to display.
- The "Revert to Cycle Path's suggestion" button has nothing to revert to. Clicking it would demote state to SUGGESTED, producing a row with state=SUGGESTED + engineResult.status='none'. On the next engine run, [`upsertCycleInterpretation` lines 137–141](../../../app/src/cycle-tracking/interpretation/interpretationOperations.ts#L137-L141) deletes that row outright (because SUGGESTED + 'none' = "no row needed"). That deletion is correct — but the transient invalid state should never have been written in the first place.

The gating prevents this. Combined with KeptShiftCard's lack of an Adjust button, the engine='none' + AdjustFlow combination is structurally impossible.

### Defensive: revert mutation behavior

Even though the UI doesn't allow it, the `revertInterpretation` mutation is given defensive logic:

> If, at the moment of revert, `engineResult.thermalShift.status === 'none'`, **delete the interpretation row entirely** instead of demoting to SUGGESTED.

This handles theoretical race conditions (e.g., the user had AdjustFlow open while another tab caused data changes that flipped engine to 'none'). The deletion mirrors `upsertCycleInterpretation`'s SUGGESTED+'none' handling — no card is shown, the cycle has no interpretation row, and the next engine run starts clean.

---

## Data flow

1. **Open AdjustFlow** with props:
   - `currentResult` (Cycle Path's output)
   - `existingOverrides` (user's previous adjustment, if any)
   - `days[]` (full cycle data, including exclusion flags)
   - `cycleStartDate` (so the modal can render calendar dates)
2. **Local state:** `pickedShiftDay`, initialized from override or Cycle Path's suggestion.
3. **On every change to `pickedShiftDay`** — pure recomputation:
   - Look up the picked day in `days[]`.
     - If missing-temp or excluded → invalid (specific error). Stop.
   - Call `collectReferenceDays(days, pickedShiftDay)`.
     - If `null` → invalid: "<6 preceding lows" error. Stop.
   - Check `pickedDay.tempC > coverline`.
     - If false → invalid: "not above coverline" error. Stop.
   - **(P1.A)** Run `detectThermalShift(days)`. If it returns `status === 'confirmed'` AND `shiftDay < pickedShiftDay` → invalid: "earlier valid shift exists" error. Stop.
   - Run `checkConfirmingTemps` from the picked day.
     - `failed` → invalid with "rule broken" error.
     - `pending` → valid, status=pending.
     - `confirmed` → valid, status=confirmed.
   - If valid AND `pickedShiftDay ≤ 7` → render Section 2.5 soft warning alongside the valid result.
4. **Render** Sections 2/2.5/3/4 with the computed result.
5. **On Save** (only enabled when valid):
   - Mutation called with `{ shiftDay: pickedShiftDay }` only — no `coverlineTemp`.
   - State flips to `ADJUSTED`.
   - Modal closes.
6. **On Revert:**
   - Mutation clears `userOverrides`.
   - State demoted to `SUGGESTED`.
   - Modal closes.
7. **On Cancel:**
   - No mutation. Modal closes. Existing record unchanged.

The validation logic in step 3 should be a **pure function**:

```ts
validateAdjustment(days: CycleDayInput[], pickedShiftDay: number): AdjustValidation
```

Returning a tagged union: `confirmed`, `pending`, or `invalid` with a specific reason code. Easy to unit-test and reusable on the server if we ever want to enforce validity backend-side.

---

## Affected files

**Frontend:**
- `app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx` — full rewrite. Drop coverline input. Add validity panel, reference-temps card, confirming-temps card, soft-warning banner, revert button.
- `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx` — accept and forward `days` and `cycleStartDate` props (currently passes `days={[]}` as a stub).
- `app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx` — drop coverline-override comparison rendering. Display the recomputed coverline. Add "awaiting confirmation" indicator when status is pending.
- `app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx` — drop `userOverrides.coverlineTemp` rendering. Display recomputed coverline using `collectReferenceDays(days, userOverrides.shiftDay)`.
- `app/src/cycle-tracking/CycleChartPage.tsx` — two changes:
  1. Pass `days={cycleDayInputs}` and `cycleStartDate={cycle.startDate}` into PropositionCard.
  2. **(P2.2)** Update the chart's coverline annotation logic ([CycleChartPage.tsx:572–574](../../../app/src/cycle-tracking/CycleChartPage.tsx#L572-L574)). Today it reads `overrides?.coverlineTemp ?? engineResult.coverlineTemp`. New logic: when state is ADJUSTED and `userOverrides.shiftDay` is set, recompute via `collectReferenceDays(days, userOverrides.shiftDay).coverlineTemp`. Fallback to engine's `coverlineTemp` only for SUGGESTED/CONFIRMED. Without this fix, ADJUSTED cycles with engine.status='none' (KeptShiftCard) lose the chart coverline entirely; ADJUSTED cycles with a different shift day from the engine draw the wrong coverline.

**Hooks / state:**
- `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts` — three changes:
  1. **(P2.2)** Active-coverline computation ([useInterpretation.ts:121–122](../../../app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts#L121-L122)) replaces `overrides?.coverlineTemp ?? shift.coverlineTemp` with: when state is ADJUSTED and `userOverrides.shiftDay` is set, recompute via `collectReferenceDays(days, userOverrides.shiftDay).coverlineTemp`. Same logic as the chart fix; reused for post-shift monitoring (false-rise detection).
  2. Drop the `keptValues` extraction logic that reads `userOverrides.coverlineTemp` (used by `resolveReview('keep_mine')`). Recompute from `userOverrides.shiftDay` instead.
  3. Add a `revert` callback that calls a new mutation (or `adjustInterpretation` with cleared overrides) and demotes state to SUGGESTED.

**Backend:**
- `app/src/cycle-tracking/interpretation/interpretationOperations.ts` — three changes:
  1. **(P1.1 + P1.2)** Update `upsertCycleInterpretation` ([interpretationOperations.ts:208–233](../../../app/src/cycle-tracking/interpretation/interpretationOperations.ts#L208-L233)). For state=ADJUSTED, replace the `hasMaterialChange` branch with new logic: trigger `needsReview` only if `validateAdjustment(days, userOverrides.shiftDay)` returns invalid (the user's pick has become Sensiplan-invalid given current data). Otherwise update silently. The state=CONFIRMED branch retains existing `hasMaterialChange` logic. Note: `upsertCycleInterpretation` does not currently receive `days[]` directly — it receives `engineResult` already computed from days. The validation needs `days[]`, so either (i) pass `days[]` into the mutation as a new arg, or (ii) re-fetch `CycleDay` records server-side from the cycleId. Recommend (ii) for safety (server-trusted source of truth).
  2. Add a `revertInterpretation` mutation that clears `userOverrides` and sets state back to `SUGGESTED`. **Defensive (P1.B):** if `engineResult.thermalShift.status === 'none'` at revert time, delete the interpretation row entirely instead of demoting (mirrors the SUGGESTED+'none' handling in `upsertCycleInterpretation`). This case shouldn't be reachable via the UI gating, but the mutation is robust to it.
  3. The `adjustInterpretation` mutation no longer needs to accept `coverlineTemp` (signature shrinks to `{ shiftDay: number }`). Backward-compat: silently ignore `coverlineTemp` if a stale client sends it.

**New pure function:**
- `app/src/cycle-tracking/interpretation/sensiplan/validateAdjustment.ts` — wraps `collectReferenceDays` + the temp-above-coverline check + **`detectThermalShift` "earlier valid shift" check (P1.A)** + `checkConfirmingTemps`. Returns a tagged union: `confirmed`, `pending`, or `invalid` with a specific reason code. Used by both AdjustFlow (for live validation as the user picks) and `upsertCycleInterpretation` (for ADJUSTED-state review-trigger logic).

**Type changes:**
- `app/src/cycle-tracking/interpretation/types.ts` — `UserOverrides` shrinks to `{ shiftDay?: number }`. The `coverlineTemp` field on stored records is silently ignored (see "Migration of stored coverline values" below).

---

## Migration of stored `userOverrides.coverlineTemp` values

Stored values are **left in the database, ignored by code**. No migration script.

**Why:**
- No risk of data loss — if the design changes again, old values are still there.
- No migration script to write, test, and run on production data.
- Self-healing — when a user opens an old adjusted cycle, new code recomputes coverline from their stored `shiftDay`. Old `coverlineTemp` field is invisible.
- Reversible — a code change is one PR; a migration is a one-way door.

---

## Cycle Path comparison: how the picker and Cycle Path coexist

Cycle Path runs its own Sensiplan detection on raw cycle data on every recompute — it never reads `userOverrides`. This is by design:
- The user's adjustment is preserved in `userOverrides`.
- Cycle Path's latest detection is preserved in `engineResult`.
- For ADJUSTED state, the active coverline is **recomputed from raw days** (`collectReferenceDays(days, userOverrides.shiftDay)`), not read from any stored field.
- Cycle Path's evolving opinion is visible to the user via the comparison strip in AdjustFlow (Section 5), but does **not** trigger review prompts in most cases (see below).

The contents of `userOverrides` change in v2 (shiftDay only), and the review-trigger logic for ADJUSTED state changes (see next section).

---

## Review-trigger logic for ADJUSTED state (revised)

### The rule

For ADJUSTED state, `upsertCycleInterpretation` triggers `needsReview` only when:

**(a)** `validateAdjustment(days, userOverrides.shiftDay)` returns invalid — the user's pick no longer satisfies Sensiplan rules with the current data, OR
**(b)** `engineResult.status` becomes `'none'` — Cycle Path has lost the shift entirely.

The previous `hasMaterialChange` check (which compared engine.shiftDay/coverlineTemp/status/4thday) is **dropped for ADJUSTED state**. Only the two conditions above apply.

For SUGGESTED and CONFIRMED states, `hasMaterialChange` continues to apply unchanged.

### Why this rule (Sensiplan stability principle)

Sensiplan is a manual method. Once the 3-over-6 rule is satisfied, the interpretation is **fixed**. The user reads their own chart by hand, identifies the shift day, and that's it. There is no concept in Sensiplan of "the algorithm reconsidering" because there is no algorithm.

In Cycle Path, the engine recomputes from scratch on every render. The result is **deterministic** for a given `days[]` input. Therefore:

> **If the engine's result moves, the raw data must have changed.**

Raw data only changes through user-initiated actions: backfilling a missed temperature, editing a temp value, toggling exclusion on a day. The user is aware of those edits — they just made them.

For an ADJUSTED user (who explicitly disagreed with the engine), the only thing that *actually matters* is whether their own pick is still Sensiplan-valid. That's what condition (a) catches. Cycle Path's evolving opinion about its own preferred shift day is irrelevant to the user's interpretation — they already disagreed with it.

Condition (b) catches the catastrophic case: Cycle Path has totally lost the shift (no Sensiplan-valid pattern detectable in current data). This is worth surfacing because the user's pick may also be at risk, and even if technically valid it's standing alone against zero supporting evidence.

### What this fixes

- **P1.1 (raw-data edits silently invalidate user's derived coverline).** Caught by (a): `validateAdjustment` recomputes coverline from current `days[]` and re-runs the 3-over-6 check. If the user excluded a low temp and now there are <6 valid pre-shift temps, (a) returns invalid → review.
- **P1.2 (pending→confirmed flips trigger review churn).** Suppressed: pending→confirmed is not material under the new rule. As long as the user's pick is still valid, the engine's status transition is silent.
- **General review churn from engine-wobble.** Eliminated: the engine moving its own pick from Day 16 to Day 20 doesn't trigger review for an ADJUSTED user. They can see the wobble in AdjustFlow's comparison strip if they look.

### What still triggers review (sanity check)

| Event | ADJUSTED review? | Why |
|---|---|---|
| User backfills a missed early temp; user's Day 14 pick still valid | No | (a) passes, engine still detects something |
| User excludes a low; now <6 valid pre-shift temps | Yes (a) | User's pick is structurally invalid |
| User edits a confirming temp downward; user's Day 14 confirming temps now break the 3-over-6 rule | Yes (a) | User's pick fails Sensiplan rule |
| Engine moves from Day 16 confirmed to Day 20 confirmed; user's Day 14 unchanged and still valid | No | Engine wobble; user's pick stands |
| Engine flips to status='none' (no shift detectable at all) | Yes (b) | Catastrophic — KeptShiftCard scenario |
| Engine status flips pending→confirmed at the same shift day | No | Natural finalization, not a Sensiplan event |

---

## Out of scope (deferred as separate tasks)

- **Chart-tap to set shift day.** v2 ships with the numeric picker only. Chart-tap is a follow-up if typing a day number feels clunky in practice.
- **Chart-drag for coverline.** Permanently dropped — coverline is computed.
- **Migration of stored `userOverrides.coverlineTemp` values.** Left in DB, ignored by code (see above).

---

## Test plan

### `validateAdjustment` pure function

Each case is a small synthetic `days[]` + `pickedShiftDay` pair:

1. Confirmed: 3 highs, 3rd clears +0.2 °C.
2. Confirmed via 4th-day exception: 3 highs, 3rd doesn't clear +0.2, 4th confirms.
3. Pending — 1 high recorded, awaiting more.
4. Pending — 2 highs, 2nd doesn't clear +0.2, awaiting 3rd or 4th.
5. Failed — confirming temp drops at/below coverline.
6. Failed — 3rd doesn't clear +0.2 and 4th also at/below coverline.
7. <6 valid preceding lows (some excluded, some missing).
8. Picked day excluded from interpretation.
9. Picked day has no temp recorded.
10. Picked day's temp ≤ computed coverline (not a "first higher").
11. Soft-warning trigger — confirmed shift but `pickedShiftDay ≤ 7`.
12. Skipped-day handling — exclusions inside the 6-back window are skipped, scan continues further back.
13. **(P1.A) Earlier valid shift exists** — engine auto-detects confirmed Day 8; user picks Day 14. Returns invalid with "earlier valid shift" reason.
14. **(P1.A) Earlier shift exists but pending only** — engine auto-detects pending Day 8 (only 1 confirming temp); user picks Day 14 confirmed. Returns valid (pending earlier candidates do not block).
15. **(P1.A) User picks earlier than engine** — engine auto-detects Day 16; user picks Day 14 (earlier, also Sensiplan-valid). Returns valid.
16. **(P1.A) User picks engine's exact pick** — engine auto-detects Day 16; user picks Day 16. Returns valid (no conflict).
17. **(P1.A) User excludes earlier days, then picks late** — engine had detected Day 8; after user excludes Days 8–10, engine now detects Day 14. User picks Day 14. Returns valid.

### `upsertCycleInterpretation` ADJUSTED review-trigger logic

(Numbering continued from above.)

18. ADJUSTED, raw days unchanged → silent update, no review.
19. ADJUSTED, user backfills missed pre-shift temp; user's pick still valid → silent update, no review.
20. ADJUSTED, user excludes a low; now <6 valid pre-shift temps → `needsReview` triggered with reason "<6 lows".
21. ADJUSTED, user edits a confirming temp downward, breaking 3-over-6 rule → `needsReview` triggered with reason "rule broken".
22. ADJUSTED, engine.status flips pending→confirmed at same shift day → silent update, no review (regression test for P1.2).
23. ADJUSTED, engine.shiftDay moves from 16 to 20 but user's Day 14 pick still valid → silent update, no review (regression test for engine-wobble).
24. ADJUSTED, engine.status flips to 'none' → `needsReview` triggered (KeptShiftCard scenario; existing behavior preserved).
25. **(P1.A) ADJUSTED, raw data changes such that engine now confirms a shift earlier than user's pick** → `needsReview` triggered with reason "earlier valid shift exists" (validateAdjustment returns invalid).

### `revertInterpretation` mutation

26. **(P1.B) Revert with engine.status non-none** → state demoted to SUGGESTED, userOverrides cleared, row preserved.
27. **(P1.B) Revert with engine.status='none' (defensive)** → row deleted entirely (mirrors SUGGESTED+'none' deletion in upsertCycleInterpretation).

---

## Open implementation questions (resolved)

1. **Where does the modal source `days[]` from?** Add `days` and `cycleStartDate` props on PropositionCard, forwarded from CycleChartPage. The data is already loaded there (`cycleDayInputs`, `cycle.startDate`) — no extra fetches.
2. **How are dates rendered?** Calendar dates derive from `cycleStartDate + (dayNumber − 1)`. Same pattern CycleChartPage already uses.
3. **Test fixtures.** See test plan above.
