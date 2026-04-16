# Sensiplan Thermal Shift Engine — Design Spec

## Overview

A hybrid interpretation engine for CyclePath that detects thermal shifts using Sensiplan rules and presents suggestions to the user for confirmation, adjustment, or rejection. The engine runs client-side (frontend only), evaluates cycle data in real time, and persists interpretation state via a new backend model.

Throughout this document, features are labeled as either **[Sensiplan Core]** (follows official Sensiplan guidelines) or **[CyclePath Enhancement]** (our addition, clearly labeled in the UI).

## Scope — First Iteration

- Thermal shift detection only (no mucus peak or fertile window close)
- Sequential scan algorithm aligned with Sensiplan
- Proposition card UI with user actions (Confirm, Adjust, Reject, Keep Watching)
- Chart overlays (coverline, day highlights)
- Nudges for data quality (pre-shift outliers, post-shift dips)
- Post-shift monitoring for false rise detection
- Re-evaluation on data changes

---

## 1. Core Algorithm — Sequential Thermal Shift Detection [Sensiplan Core]

The engine scans forward through cycle days, one at a time. It finds the first valid thermal shift and stops.

### Steps

1. For each day D (starting when at least 6 prior valid temps exist):
   - Collect the 6 valid (non-excluded) temperatures immediately before D
   - Skip excluded days, reach back further to fill 6
   - If fewer than 6 valid temps exist before D → skip, can't evaluate

2. Calculate **coverline = highest of those 6 valid temps** (in °C, full precision)

3. Is D's temp above the coverline?
   - No → move to next day
   - Yes → D is a potential first higher temperature

4. Check the next 2 valid temps after D (skip excluded days):
   - 2nd higher temp: must be above coverline
   - 3rd higher temp: must be **≥ coverline + 0.2°C**

5. **4th-day exception**: If 3rd is above coverline but doesn't clear +0.2°C → check 4th valid temp. 4th only needs to be above coverline (NOT +0.2°C). If yes → shift confirmed.

6. If any temp drops below coverline during confirmation → attempt **FAILED**. Record as failed attempt (for educational display). Resume scanning from the day after the failure.

7. If all conditions met → **SHIFT CONFIRMED. Stop scanning.**

8. **Pending detection**: If the scan reaches the end of available data while a candidate is mid-confirmation, return `status: 'pending'`. This applies to any of these mid-confirmation states:
   - D is above coverline but only 1 or 2 of the 3 required confirming temps have been recorded
   - All 3 confirming temps are recorded but the 3rd is above coverline without clearing +0.2°C, and no 4th valid temp exists yet (4th-day exception in progress)

   The pending result includes the candidate's shift day, coverline, reference days, confirming days so far, and `usedFourthDayException: false` (not yet resolved). It represents the latest (most recent) viable candidate — any earlier candidates that failed are recorded in `failedAttempts`. Only one candidate can be pending at a time: the one currently mid-confirmation when data runs out.

### Temperature Handling

- All temps stored in Fahrenheit (existing behavior)
- Engine converts to Celsius (full precision, no rounding) for evaluation
- The 0.2°C threshold is the exact Sensiplan value
- Display converts back to user's preferred unit
- Future: migrate storage to Celsius, then engine works directly with stored values

### Engine Result Type

```typescript
// Discriminated union — shape depends on status
type ThermalShiftResult =
  | ThermalShiftNone
  | ThermalShiftPending
  | ThermalShiftConfirmed;

type ThermalShiftNone = {
  status: 'none';
  reason: 'insufficient_data' | 'no_shift_detected';  // why no result
  failedAttempts: FailedAttempt[];                     // patterns that were tried and rejected
};

type ThermalShiftPending = {
  status: 'pending';
  shiftDay: number;                 // candidate shift day
  coverlineTemp: number;            // °C, full precision
  referenceDays: number[];          // which 6 cycle days were used
  confirmingDays: number[];         // 1-3 confirming temps recorded so far
  skippedDays: number[];            // excluded days that were skipped in reference
  usedFourthDayException: boolean;  // false while pending (not yet resolved)
  confidence: 'high' | 'low';
  confidenceReasons: string[];
  failedAttempts: FailedAttempt[];
};

type ThermalShiftConfirmed = {
  status: 'confirmed';
  shiftDay: number;
  coverlineTemp: number;            // °C, full precision
  referenceDays: number[];          // which 6 cycle days were used
  confirmingDays: number[];         // the 3 (or 4) higher temp days
  skippedDays: number[];            // excluded days that were skipped in reference
  usedFourthDayException: boolean;
  confidence: 'high' | 'low';
  confidenceReasons: string[];
  failedAttempts: FailedAttempt[];
};

type FailedAttempt = {
  attemptedShiftDay: number;
  coverlineTemp: number;
  referenceDays: number[];
  failureReason: string;
  failedOnDay: number;
};
```

---

## 2. Excluded Day Handling [Sensiplan Core]

| Scenario | Engine Behavior |
|----------|----------------|
| 1-2 excluded in reference 6 | Skip and reach back to fill 6 valid temps. Standard evaluation — fully trusted by Sensiplan. |
| Excluded day is the highest of the 6 | Excluded — a disturbed temperature is not taken into account at all. It is not one of the 6 reference temps. Engine reaches back one more valid, non-disturbed day to complete the 6 reference lows. Coverline recalculates to the highest of the new 6 valid temps. **Example:** If Days 9-14 are candidates but Day 11 (36.5°C) is disturbed, it is skipped entirely. Engine uses Day 8 instead: Days 8 (36.1), 9 (36.2), 10 (36.3), 12 (36.2), 13 (36.3), 14 (36.3). Highest valid = 36.3°C, so coverline = 36.3°C (lower than the 36.5°C that was excluded). |
| Excluded day right before rise | Skip it. 6th valid low is one day earlier. Rise starts at first temp above new coverline. |
| 3+ excluded in reference window | Engine can still evaluate (reach back further), but flags as Low confidence. No official Sensiplan limit exists, but data is sparse. |
| Excluded day in the 3 highs | Skip it. Extend count — need additional valid temps to complete confirmation. E.g., if Day 16 excluded: Day 15 = 1st, Day 17 = 2nd, Day 18 = 3rd. |
| Fewer than 6 valid temps available | Cannot evaluate. No proposition generated. |

---

## 3. Confidence Levels [CyclePath Enhancement]

Confidence reflects data quality, not whether Sensiplan rules were met — they were. Sensiplan evaluation is binary (meets rules or doesn't). This is a CyclePath addition to help users assess data quality.

| Level | Criteria |
|-------|---------|
| **High** | 0-2 excluded days in reference 6. With or without 4th-day exception. Sensiplan treats all of these as standard, valid evaluation. |
| **Low** | 3+ excluded days in the reference window. While Sensiplan does not set a specific limit, reaching far back for reference temps may reduce their relevance to the current cycle. |
| **Cannot evaluate** | Fewer than 6 valid temps available before the potential shift. No proposition generated. |

What does NOT affect confidence: which Sensiplan rule was used (standard 3-day vs 4th-day exception), how much clearance above +0.2°C, or post-shift temp stability.

The UI must state: "Confidence reflects data quality (a CyclePath enhancement). It does not indicate whether the Sensiplan rules were met — they were."

---

## 4. Interpretation States & User Actions

| State | Meaning | Available Actions |
|-------|---------|-------------------|
| SUGGESTED (pending) | Engine found a potential shift but needs more confirming temps | Keep Watching · Adjust · Reject This Pattern |
| SUGGESTED (confirmed) | Engine fully confirmed a shift, awaiting user decision | Confirm · Adjust · Reject |
| CONFIRMED | User accepted the engine's interpretation | Adjust · Reject |
| ADJUSTED | User modified the shift day and/or coverline | Adjust (re-adjust) · Reject |
| DISMISSED | User rejected the interpretation | (Engine may re-suggest if data changes produce a materially different result — different shift day) |

### "Keep Watching" (pending only)

A UI-level acknowledgment that collapses the pending proposition card to a minimal indicator. The engine continues monitoring. The underlying state stays SUGGESTED — this is not a new database state, just a local UI treatment (e.g., a `keepWatching` boolean in component state or localStorage). When the user reopens the chart, the card re-expands if new data has arrived since the user clicked Keep Watching.

### Adjust (available at every stage)

User can override:
- **Shift day**: pick a different day (tap on chart or dropdown)
- **Coverline temperature**: enter a value or drag the line on chart

The engine recalculates downstream effects in real-time (preview). After saving, state changes to ADJUSTED. Post-shift monitoring (Section 8) uses the user's adjusted values as the active interpretation — dips are evaluated against the user's coverline, not the engine's.

### Reject / Dismiss behavior

- "Reject This Pattern" (pending) and "Reject" (confirmed) both set state to DISMISSED
- The rejected shift day is recorded in `dismissedShiftDay` for future comparison
- Chart overlay disappears, raw data only
- If the engine later produces a **materially different** result (different shift day than `dismissedShiftDay`), it creates a new SUGGESTED interpretation
- If the engine finds the same shift day the user already rejected, it stays quiet

---

## 5. Re-evaluation [CyclePath Enhancement]

The engine re-evaluates every time data changes (new day added, temp edited, exclusion toggled). It never silently overrides a user decision.

### Behavior by state

| Current State | Engine result changes | Behavior |
|---------------|----------------------|----------|
| SUGGESTED | New result differs | Auto-update. Show change notice referencing the specific user edit that caused the change. |
| CONFIRMED / ADJUSTED | New result differs | Set `needsReview = true`. Show "Interpretation Needs Review" card with reason. |
| DISMISSED | New result is materially different (different shift day) | Create new SUGGESTED. |
| DISMISSED | Same shift day | Stay quiet. |

### Change notice

Appears when the engine result changed while in SUGGESTED state. Always references the specific user action: "You changed the temperature for Day 12 from 36.3°C to 36.2°C. This affected the reference temperatures, and the engine has recalculated."

Change notices persist until the user acts on the proposition card.

### Review triggers

There are two distinct review scenarios. They use **different cards and different actions** because the nature of the problem is different.

**Scenario A — Retroactive Data Edit (Needs Review card):**
User changes a temp reading, marks/unmarks a disturbance, adds/removes a day that affects the engine's inputs. Engine re-evaluates and the result conflicts with the user's confirmed/adjusted interpretation. Sets `needsReview = true`.

**Scenario B — False Rise Warning (False Rise card) [CyclePath Enhancement]:**
3+ consecutive unexplained post-shift temps below coverline. Engine nudges about disturbances first. Only warns if dips remain unexplained. This does NOT set `needsReview` — it uses a separate `falseRiseWarning` flag (see Section 8 for the full flow and persistence).

### Needs Review card (Scenario A only)

Shows side-by-side comparison:
- "Your confirmed" values (shift day, coverline, confirming days)
- "Engine now suggests" values
- Reason for the discrepancy
- Actions: Keep Mine · Accept New · Adjust

### Needs Review resolution — state transitions

**When engine has a new result (different shift):**

| Action | State after | engineResult | userOverrides | previousEngineResult | needsReview |
|--------|-------------|-------------|---------------|---------------------|-------------|
| **Keep Mine** | ADJUSTED (see note below) | Updated to the new engine result (latest evaluation) | Set to the user's kept values (see note) | Cleared | Set to `false` |
| **Accept New** | CONFIRMED | Updated to the new engine result | Cleared (`null`) — user is now accepting engine's values | Cleared | Set to `false` |
| **Adjust** | Opens adjust flow → on save: ADJUSTED | Updated to the new engine result | Set to user's new values | Cleared | Set to `false` |

**Keep Mine promotes CONFIRMED → ADJUSTED.** When the user originally confirmed and now clicks Keep Mine, their kept values (shift day, coverline from `previousEngineResult`) must be saved into `userOverrides` — otherwise they'd be lost when `engineResult` is overwritten. This is semantically correct: the user is now asserting values that differ from the engine's current evaluation, which is exactly what ADJUSTED means. If the row was already ADJUSTED, `userOverrides` is already populated and stays as-is.

**When engine returns `none` (shift no longer detectable):**

| Action | State after | engineResult | userOverrides | previousEngineResult | needsReview |
|--------|-------------|-------------|---------------|---------------------|-------------|
| **Keep Mine** | ADJUSTED | Set to the `none` result | Set to the user's kept values (from `previousEngineResult`) | Cleared | Set to `false` |
| **Reject** | DISMISSED | Set to the `none` result | Cleared | Cleared | Set to `false` |

No "Accept New" is available because there is no new shift to accept. Reject transitions to DISMISSED (not row deletion) — same semantics as every other reject. This preserves the memory of which shift day the user rejected, so the engine can stay quiet if that same shift day reappears later.

In all cases, `reviewReason` is also cleared. The key principle: `engineResult` always reflects the latest engine evaluation regardless of which action the user takes. The user's active values always live in `userOverrides` when they differ from the engine (ADJUSTED state), or are implied by `engineResult` when they match (CONFIRMED state).

---

## 6. Nudges — Data Quality Prompts [CyclePath Enhancement]

Nudges are questions about input data quality, separate from the proposition card. A 💬 icon appears above the temp node on the chart. User clicks to reveal the full nudge. Nudges persist until the user acts ("Yes, disturbed" or "No, correct").

### Pre-shift nudge: Suspicious outlier in low phase

Fires when a temp is **≥ 0.2°C above its neighbors** (up to 2 temps on each side, skipping excluded days).

| Spike ≥ 0.2°C? | Within normal time window? | Action |
|-----------------|---------------------------|--------|
| Yes | Yes | Nudge (temp spike is unusual regardless of timing) |
| Yes | No | Nudge + mention timing: "taken outside your usual time window" |
| No | Any | No nudge |

### Post-shift nudge: Below coverline

Fires when any post-shift temp is below coverline without disturbance factors marked.

Message: "Day 20 temperature (36.3°C) dropped below your coverline (36.4°C) with no disturbance recorded. Was it affected by a disturbance?"

### User responses

- "Yes, disturbed" → engine marks the day as excluded, re-runs evaluation, nudge resolved
- "No, correct" → engine keeps the temp as-is, nudge resolved, counts as unexplained dip
- User ignores → engine treats the temp as valid (same as "no"), nudge stays visible

---

## 7. Measurement Time Window [CyclePath Enhancement]

Calculated **per cycle** (not globally across cycles) to handle travel/timezone changes.

### How it works

1. Collect all `bbtTime` entries for the current cycle
2. Require **5+ data points** before establishing a window (before that, don't use timing in nudge decisions)
3. Calculate the mean measurement time for this cycle using **circular time averaging** to handle midnight crossings correctly:
   - Convert each time to minutes since midnight (0–1439)
   - Convert minutes to an angle: `θ = (minutes / 1440) × 2π`
   - Sum `sin(θ)` and `cos(θ)` across all data points
   - Mean angle: `atan2(Σsin, Σcos)`
   - Convert back to minutes: `meanMinutes = (meanAngle / 2π) × 1440` (normalize to 0–1439)
   - This ensures 23:30 and 00:30 correctly average to midnight, not noon
4. Window = mean ± 1 hour (based on Sensiplan educator guidance)
5. **Travel segmentation**: If a travel event with `travelTimeDiff` exists, compute separate means for pre-travel and post-travel periods. Each day is compared against its segment's mean. Each segment uses the same circular averaging method.

### Edge cases

- Missing `bbtTime` entries: skip in mean calculation. If the outlier day itself has no time, fall back to spike-severity-only rule.
- Gradually drifting times: acceptable — a gradual drift within the cycle doesn't trigger false alerts.

---

## 8. Post-Shift Monitoring [CyclePath Enhancement]

Active from shift confirmation until cycle ends. Sensiplan doesn't monitor post-confirmation — this is a CyclePath safety net.

### Active values principle

Post-shift monitoring always runs against the **active interpretation values** — not the engine's own detection. The active values are:
- **CONFIRMED state**: the engine's shift day and coverline (since the user accepted them)
- **ADJUSTED state**: the user's overridden shift day and/or coverline from `userOverrides`

This means: if the user adjusted the coverline from 36.4°C to 36.5°C, dips are evaluated against 36.5°C. The monitoring result is stored in its own `postShiftMonitoring` field on the model, separate from `engineResult`.

### Flow

1. Post-shift temp below coverline detected
2. Has disturbance factors? → Yes → Explained dip, don't count
3. No disturbance → Nudge: "Was this disturbed?"
4. User says "Yes, disturbed" → Explained, don't count
5. User says "No, correct" or ignores → Count as unexplained dip
6. A disturbed day between two unexplained dips **breaks the chain** (resets consecutive count)
7. **3+ consecutive unexplained dips** → trigger false rise warning

### False rise warning

Displayed as a **separate card from the Needs Review card** — this is not a data-edit conflict, it's a pattern-quality concern. The card appears alongside (below) the existing proposition card, not replacing it.

Message: "Temperatures on Days 20–22 fell below the coverline without recorded disturbances. This may indicate the thermal shift on Day 15 was a false rise. Consider rejecting this shift and waiting for a new pattern."

Must include disclaimer: "Note: This is a CyclePath safety feature, not a standard Sensiplan rule."

Actions: Reject Shift · Keep Shift

### False rise resolution — state transitions

| Action | State after | falseRiseWarning | What happens |
|--------|-------------|-----------------|-------------|
| **Reject Shift** | DISMISSED | Cleared | Interpretation dismissed. Engine may re-suggest if new data produces a different shift. |
| **Keep Shift** | Stays CONFIRMED or ADJUSTED (unchanged) | Set to `dismissed` (warning hidden but monitoring continues) | User acknowledged the warning and chose to keep the shift. If additional consecutive unexplained dips occur beyond the original warning, a new warning may surface. |

The `falseRiseWarning` field lives in the `PostShiftMonitoring` JSON stored in the model's `postShiftMonitoring` field (separate from `engineResult`). It can be `null` (no warning), `active` (warning visible), or `dismissed` (user chose Keep Shift).

### Post-shift monitoring result type

```typescript
type PostShiftMonitoring = {
  isActive: boolean;
  falseRiseWarning: 'active' | 'dismissed' | null;  // null = no warning triggered
  daysMonitored: number;
  dipsBelow: {
    day: number;
    temp: number;
    explained: boolean;
    factors: string[];
  }[];
  consecutiveUnexplainedDips: number;
};
```

---

## 9. Data Model

### New Prisma model

```prisma
model CycleInterpretation {
  id                    String              @id @default(uuid())
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  cycle                 Cycle               @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  cycleId               String

  type                  InterpretationType
  state                 InterpretationState @default(SUGGESTED)

  @@unique([cycleId, type])              // One interpretation per cycle per type

  engineResult          Json                // ThermalShiftResult serialized (engine's own shift detection)
  userOverrides         Json?               // { coverlineTemp?: number, shiftDay?: number }

  dismissedShiftDay     Int?                // When DISMISSED: the shift day that was rejected, for "stay quiet" comparison
  needsReview           Boolean             @default(false)
  reviewReason          String?
  previousEngineResult  Json?

  postShiftMonitoring   Json?               // PostShiftMonitoring — computed against ACTIVE values (see below)
  pendingNudges         Json?               // [{ day, message, type, resolved }]
}

enum InterpretationType {
  THERMAL_SHIFT
  // MUCUS_PEAK        — future
  // FERTILE_WINDOW    — future
}

enum InterpretationState {
  SUGGESTED
  CONFIRMED
  ADJUSTED
  DISMISSED
}
```

### Relation to Cycle

```prisma
model Cycle {
  // ... existing fields
  interpretations  CycleInterpretation[]
}
```

### Persistence rules

| Event | What happens |
|-------|-------------|
| User opens chart, engine runs | Engine evaluates cycle data. If result is `status: 'none'` (no detectable or evaluable shift) → **do not persist**. No database row is created and no proposition card is shown. If result is `status: 'confirmed'` or `status: 'pending'` → create/update as follows: If no interpretation exists → create with state SUGGESTED. If one exists → re-evaluate, compare with stored engineResult. |
| Engine result unchanged | No database write |
| Engine now returns `none` + SUGGESTED | Delete the interpretation row. No user investment in this suggestion — the candidate simply disappeared. No card shown. |
| Engine now returns `none` + CONFIRMED/ADJUSTED | Set needsReview = true, store previousEngineResult, update engineResult to `none`, write reviewReason = "The data no longer supports a thermal shift. The engine cannot detect a valid pattern with the current readings." Show a Needs Review card with only the user's side (no "engine suggests" side) and actions: Keep Mine · Reject. No "Accept New" because there is nothing to accept. |
| Engine now returns `none` + DISMISSED | No change. Keep the DISMISSED row as-is — it preserves the memory of which shift day the user rejected. If data changes later and that same shift day reappears, the engine will stay quiet. |
| Engine result changed (not `none`) + SUGGESTED | Update engineResult |
| Engine result changed (not `none`) + CONFIRMED/ADJUSTED | Set needsReview = true, store previousEngineResult, write reviewReason |
| Engine result changed (not `none`) + DISMISSED | If materially different (different shift day) → replace with new SUGGESTED. Otherwise → no change. |
| User clicks Confirm/Adjust/Reject | Update state (and userOverrides if adjusted) |
| User responds to nudge | Update pendingNudges, re-run engine |

### Frontend operations

**Query:**

1. `getCycleInterpretation(cycleId, type)` — returns the current interpretation (or null)

**Engine persistence mutations** (called by engine after evaluation):

2. `upsertCycleInterpretation(cycleId, type, engineResult, postShiftMonitoring?, pendingNudges?)` — create or update the engine's evaluation. Handles the `none`-vs-existing logic described in persistence rules.
3. `deleteCycleInterpretation(interpretationId)` — for `none` + SUGGESTED cleanup.

**User action mutations** (called when user clicks a button):

4. `confirmInterpretation(interpretationId)` — sets state to CONFIRMED. Clears nothing else.
5. `adjustInterpretation(interpretationId, userOverrides)` — sets state to ADJUSTED, stores `userOverrides`. Triggers post-shift monitoring recomputation against new active values.
6. `dismissInterpretation(interpretationId)` — sets state to DISMISSED, records `dismissedShiftDay` (from userOverrides or engineResult), clears `userOverrides`.
7. `resolveReview(interpretationId, action)` — where `action` is one of:
   - `'keep_mine'`: sets state to ADJUSTED, updates engineResult to latest, populates `userOverrides` with the kept values (from existing `userOverrides` if already ADJUSTED, or extracted from `previousEngineResult` if was CONFIRMED), clears needsReview + reviewReason + previousEngineResult.
   - `'accept_new'`: sets state to CONFIRMED, updates engineResult, clears userOverrides + needsReview + reviewReason + previousEngineResult.
   - `'reject'`: sets state to DISMISSED, records `dismissedShiftDay` (from userOverrides or previousEngineResult), updates engineResult, clears userOverrides + needsReview + reviewReason + previousEngineResult. (Used for the `none` review case.)
8. `resolveFalseRiseWarning(interpretationId, action)` — where `action` is one of:
   - `'reject_shift'`: sets state to DISMISSED, records `dismissedShiftDay`, clears postShiftMonitoring + userOverrides.
   - `'keep_shift'`: sets `falseRiseWarning` to `'dismissed'` in postShiftMonitoring. State unchanged.
9. `resolveNudge(interpretationId, day, response)` — where `response` is `'yes_disturbed'` or `'no_correct'`. Updates pendingNudges, triggers engine re-run.

The engine itself runs client-side as a pure function over cycle data. These mutations are Wasp operations (actions/queries) that the frontend calls after the engine computes its result or when the user interacts with the UI.

---

## 10. UI Design

### Chart overlays

**Coverline styles by state:**

| State | Style |
|-------|-------|
| Suggested | Dashed line, purple (#8b5cf6), 60% opacity |
| Confirmed | Solid line, green (#059669) |
| Adjusted | Solid line, amber (#d97706). Ghost dashed grey line shows engine's original. |
| Needs Review | Solid line, red (#dc2626) with ⚠️ indicator |

**Day column highlights:**

| Element | Color |
|---------|-------|
| Reference 6 days | Blue tint (#eff6ff) with blue border (#bfdbfe) |
| Shift point | Thin purple (#8b5cf6) vertical line |
| Confirming 3 (or 4) days | Purple tint (#f5f3ff) with purple border (#c4b5fd) |

**Color system (no conflicts with existing palette):**
- Purple (#8b5cf6) = interpretation color family
- Existing blue (#3b82f6) = temp line (unchanged)
- Existing green (#4caf50, 0.35) = fertile window / OPK (unchanged)
- Existing pink (#ec4899) = intercourse (unchanged)
- Existing grey (#6B7280) = excluded temps (unchanged)

### Nudge display

- 💬 icon appears above the temp node on the chart for days with active nudges
- User clicks the icon to expand the nudge below the day row
- Nudge has two compact buttons: "Yes, disturbed" and "No, correct"
- Nudges persist until user acts

### Proposition card

Located below existing data rows (cervical fluid, disturbances, intercourse, OPK).

**Pending card**: Shows possible shift day, coverline, reference temps, and progress status. Progress text is dynamic:
- Standard confirmation: "X of 3 confirming temps recorded."
- 4th-day exception in progress (3rd temp above coverline but below +0.2°C): "3 of 3 recorded, but 3rd doesn't clear +0.2°C. Awaiting 4th temp to confirm (Sensiplan 4th-day rule)."
Actions: Keep Watching · Adjust · Reject This Pattern.

**Confirmed-by-engine card**: Shows shift day, coverline, reference temps, per-day clearance breakdown for confirming temps, confidence badge with disclaimer. Actions: Confirm · Adjust · Reject.

**4th-day exception variation**: Same as confirmed, with extra row showing the 4th day and an explanatory note: "The 3rd temp didn't reach +0.2°C. A 4th consecutive elevated temp confirms the shift (standard Sensiplan rule)."

**Needs Review card** (retroactive data edit only): Red border, side-by-side comparison of user's values vs engine's new values, reason for discrepancy. Actions: Keep Mine · Accept New · Adjust. When engine returns `none`, only shows the user's side with: Keep Mine · Reject.

**False Rise Warning card** [CyclePath Enhancement]: Amber/red border, separate from the Needs Review card. Shows which days dipped below coverline, disclaimer that this is a CyclePath safety feature. Actions: Reject Shift · Keep Shift.

**Adjust flow**: Expanded card with shift day picker, coverline temperature input, collapsible reference/confirming temps detail, collapsible "How is the coverline calculated?" Sensiplan explanation, live preview, engine comparison. Actions: Save Adjustment · Cancel.

**Failed attempts section**: Collapsed by default, expandable. Shows rejected patterns with reasons. Educational label. Dismissible (✕ button). Not actionable.

**Change notice**: Blue info banner referencing the specific user edit that caused the engine to recalculate.

### Page layout order

1. Temperature Chart (with coverline overlay + 💬 nudge icons above relevant nodes)
2. Cycle Day Row (with reference/confirming day highlights)
3. Expanded nudge messages (when user clicks 💬 icon)
4. Change notice (if engine recalculated due to data edit)
5. Cervical fluid bars · Disturbance row · Intercourse · OPK (existing, unchanged)
6. Proposition Card (thermal shift details + action buttons)
7. False Rise Warning card (if post-shift monitoring triggered, below the proposition card)

### Button color coding

| Button | Color | Usage |
|--------|-------|-------|
| Confirm | Green (#059669) bg, white text | Accept interpretation |
| Adjust | Amber (#c2410c) text on light amber (#fff7ed) bg | Modify interpretation (all cards) |
| Reject / Reject This Pattern | Red (#dc2626) text on light red (#fee2e2) bg | Dismiss interpretation |
| Keep Watching | Secondary style (white bg, grey border) | Acknowledge pending, collapse card while engine monitors |
| Keep Mine | Green (#059669) bg, white text | Keep user's values, promote to ADJUSTED (needs review) |
| Accept New | Purple (#8b5cf6) bg, white text | Accept engine's new suggestion (needs review) |
| Save Adjustment | Amber (#d97706) bg, white text | Commit user's adjusted values |
| Reject Shift | Red (#dc2626) text on light red (#fee2e2) bg | Dismiss shift due to false rise warning |
| Keep Shift | Secondary style (white bg, grey border) | Acknowledge false rise warning, keep current shift |

---

## 11. Architecture — File Structure

```
app/src/cycle-tracking/interpretation/
  types.ts                  — shared types (ThermalShiftResult, PostShiftMonitoring, etc.)
  sensiplan/
    thermalShift.ts         — core sequential scan algorithm
    excludedDays.ts         — excluded temp handling, reaching back logic
    fourthDayException.ts   — 4th-day exception rule
    postShiftMonitoring.ts  — false rise detection (CyclePath enhancement)
    confidence.ts           — confidence level calculation (CyclePath enhancement)
    nudges.ts               — outlier detection, timing analysis (CyclePath enhancement)
    measurementTime.ts      — per-cycle time window calculation
    index.ts                — orchestrates all rules, returns full interpretation
  __tests__/
    thermalShift.test.ts    — core algorithm tests (all 8 excluded day scenarios)
    postShiftMonitoring.test.ts
    confidence.test.ts
    nudges.test.ts
    measurementTime.test.ts
    integration.test.ts     — full engine with real cycle data scenarios
```

This structure keeps each concern isolated and testable. The `sensiplan/` folder is self-contained — future methods (TCOYF, Marquette) would get their own sibling folders with the same interface.

---

## 12. Testing Strategy

### Unit tests (per module)

- `thermalShift.test.ts`: All 8 excluded day scenarios, standard 3-over-6, 4th-day exception, failed attempts, resume scanning after failure, pending vs confirmed status
- `postShiftMonitoring.test.ts`: Explained dips, unexplained dips, mixed chains, 3+ consecutive threshold, chain breaking
- `confidence.test.ts`: High (0-2 excluded), Low (3+), cannot evaluate
- `nudges.test.ts`: Pre-shift outlier detection, threshold behavior, timing window integration
- `measurementTime.test.ts`: Per-cycle calculation, travel segmentation, insufficient data, missing times

### Integration tests

- Full cycle scenarios: textbook shift, staircase with false start, heavy exclusions, anovulatory cycle
- Re-evaluation: data edit changes result, state transitions, needs review flow
- Dismiss → re-suggest with materially different result

---

## 13. Future Considerations (Out of Scope)

- Mucus peak identification and combined fertile window close rule
- Minus-8 rule for fertile window opening
- Celsius storage migration (simplifies engine, separate task)
- Additional method support (TCOYF, Marquette) via sibling folders
- Cervical position tracking
- Cross-cycle history analysis
