# Sensiplan Thermal Shift Engine — Design Spec

## Overview

A hybrid interpretation engine for CyclePath that detects thermal shifts using Sensiplan rules and presents suggestions to the user for confirmation, adjustment, or rejection. The engine runs client-side (frontend only), evaluates cycle data in real time, and persists interpretation state via a new backend model.

Throughout this document, features are labeled as either **[Sensiplan Core]** (follows official Sensiplan guidelines) or **[CyclePath Enhancement]** (our addition, clearly labeled in the UI).

## Scope — First Iteration

- Thermal shift detection only (no mucus peak or fertile window close)
- Sequential scan algorithm aligned with Sensiplan
- Proposition card UI with user actions (Confirm, Adjust, Reject, Track This)
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

### Temperature Handling

- All temps stored in Fahrenheit (existing behavior)
- Engine converts to Celsius (full precision, no rounding) for evaluation
- The 0.2°C threshold is the exact Sensiplan value
- Display converts back to user's preferred unit
- Future: migrate storage to Celsius, then engine works directly with stored values

### Engine Result Type

```typescript
type ThermalShiftResult = {
  status: 'confirmed' | 'pending' | 'none';
  shiftDay: number | null;
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
| Excluded day is the highest of the 6 | Excluded, so removed. Engine reaches back for a replacement. Coverline recalculates to the highest of the new 6 valid temps (will be lower since the highest was removed). |
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
| SUGGESTED (pending) | Engine found a potential shift but needs more confirming temps | Track This · Adjust · Reject This Pattern |
| SUGGESTED (confirmed) | Engine fully confirmed a shift, awaiting user decision | Confirm · Adjust · Reject |
| CONFIRMED | User accepted the engine's interpretation | Adjust · Reject |
| ADJUSTED | User modified the shift day and/or coverline | Adjust (re-adjust) · Reject |
| DISMISSED | User rejected the interpretation | (Engine may re-suggest if data changes produce a materially different result — different shift day) |

### "Track This" (pending only)

A UI-level acknowledgment that collapses the pending proposition card to a minimal indicator. The engine continues monitoring. The underlying state stays SUGGESTED — this is not a new database state, just a local UI treatment (e.g., a `tracked` boolean in component state or localStorage). When the user reopens the chart, the card re-expands if new data has arrived since tracking.

### Adjust (available at every stage)

User can override:
- **Shift day**: pick a different day (tap on chart or dropdown)
- **Coverline temperature**: enter a value or drag the line on chart

The engine recalculates downstream effects in real-time (preview). After saving, state changes to ADJUSTED. The engine continues monitoring against the user's values, not its own.

### Reject / Dismiss behavior

- "Reject This Pattern" (pending) and "Reject" (confirmed) both set state to DISMISSED
- Chart overlay disappears, raw data only
- If the engine later produces a **materially different** result (different shift day), it creates a new SUGGESTED interpretation
- If the engine finds the same shift the user already rejected, it stays quiet

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

### Needs Review triggers (only these two)

**Scenario A — False Rise [CyclePath Enhancement]:**
3+ consecutive unexplained post-shift temps below coverline. Engine nudges about disturbances first. Only warns if dips remain unexplained.

**Scenario B — Retroactive Data Edit:**
User changes a temp reading, marks/unmarks a disturbance, adds/removes a day that affects the engine's inputs. Engine re-evaluates and flags if the result conflicts with the user's confirmed/adjusted interpretation.

### Needs Review card

Shows side-by-side comparison:
- "Your confirmed" values (shift day, coverline, confirming days)
- "Engine now suggests" values
- Reason for the discrepancy
- Actions: Keep Mine · Accept New · Adjust

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
3. Calculate the mean measurement time for this cycle
4. Window = mean ± 1 hour (based on Sensiplan educator guidance)
5. **Travel segmentation**: If a travel event with `travelTimeDiff` exists, compute separate means for pre-travel and post-travel periods. Each day is compared against its segment's mean.

### Edge cases

- Missing `bbtTime` entries: skip in mean calculation. If the outlier day itself has no time, fall back to spike-severity-only rule.
- Gradually drifting times: acceptable — a gradual drift within the cycle doesn't trigger false alerts.

---

## 8. Post-Shift Monitoring [CyclePath Enhancement]

Active from shift confirmation until cycle ends. Sensiplan doesn't monitor post-confirmation — this is a CyclePath safety net.

### Flow

1. Post-shift temp below coverline detected
2. Has disturbance factors? → Yes → Explained dip, don't count
3. No disturbance → Nudge: "Was this disturbed?"
4. User says "Yes, disturbed" → Explained, don't count
5. User says "No, correct" or ignores → Count as unexplained dip
6. A disturbed day between two unexplained dips **breaks the chain** (resets consecutive count)
7. **3+ consecutive unexplained dips** → trigger false rise warning

### False rise warning

Message: "Temperatures on Days 20–22 fell below the coverline without recorded disturbances. This may indicate the thermal shift on Day 15 was a false rise. Consider rejecting this shift and waiting for a new pattern."

Must include disclaimer: "Note: This is a CyclePath safety feature, not a standard Sensiplan rule."

Actions: Reject Shift · Keep Shift

### Post-shift monitoring result type

```typescript
type PostShiftMonitoring = {
  isActive: boolean;
  warning: string | null;
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

  engineResult          Json                // ThermalShiftResult serialized
  userOverrides         Json?               // { coverlineTemp?: number, shiftDay?: number }

  needsReview           Boolean             @default(false)
  reviewReason          String?
  previousEngineResult  Json?

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
| User opens chart, engine runs | If no interpretation exists → create with state SUGGESTED. If one exists → re-evaluate, compare with stored engineResult. |
| Engine result unchanged | No database write |
| Engine result changed + SUGGESTED | Update engineResult |
| Engine result changed + CONFIRMED/ADJUSTED | Set needsReview = true, store previousEngineResult, write reviewReason |
| Engine result changed + DISMISSED | If materially different (different shift day) → replace with new SUGGESTED. Otherwise → no change. |
| User clicks Confirm/Adjust/Reject | Update state (and userOverrides if adjusted) |
| User responds to nudge | Update pendingNudges, re-run engine |

### Frontend operations

1. **Query**: `getCycleInterpretation(cycleId, type)` — returns the current interpretation
2. **Mutation**: `updateInterpretationState(interpretationId, state, userOverrides?)` — user actions
3. **Mutation**: `upsertCycleInterpretation(cycleId, type, engineResult, pendingNudges?)` — engine persistence

The engine itself runs client-side as a pure function over cycle data.

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

**Pending card**: Shows possible shift day, coverline, reference temps, and "X of 3 confirming temps recorded." Actions: Track This · Adjust · Reject This Pattern.

**Confirmed-by-engine card**: Shows shift day, coverline, reference temps, per-day clearance breakdown for confirming temps, confidence badge with disclaimer. Actions: Confirm · Adjust · Reject.

**4th-day exception variation**: Same as confirmed, with extra row showing the 4th day and an explanatory note: "The 3rd temp didn't reach +0.2°C. A 4th consecutive elevated temp confirms the shift (standard Sensiplan rule)."

**Needs Review card**: Red border, side-by-side comparison of user's values vs engine's new values, reason for discrepancy. Actions: Keep Mine · Accept New · Adjust.

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

### Button color coding

| Button | Color | Usage |
|--------|-------|-------|
| Confirm | Green (#059669) bg, white text | Accept interpretation |
| Adjust | Amber (#c2410c) text on light amber (#fff7ed) bg | Modify interpretation (all cards) |
| Reject / Reject This Pattern | Red (#dc2626) text on light red (#fee2e2) bg | Dismiss interpretation |
| Track This | Secondary style (white bg, grey border) | Acknowledge pending, keep watching |
| Keep Mine | Green (#059669) bg, white text | Keep user's confirmed values (needs review) |
| Accept New | Purple (#8b5cf6) bg, white text | Accept engine's new suggestion (needs review) |
| Save Adjustment | Amber (#d97706) bg, white text | Commit user's adjusted values |

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
