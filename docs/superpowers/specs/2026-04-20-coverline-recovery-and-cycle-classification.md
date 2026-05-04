# Coverline Recovery & Cycle Classification — Design Spec

## Overview

This spec extends the Sensiplan thermal shift engine ([2026-04-14 spec](./2026-04-14-sensiplan-thermal-shift-engine-design.md)) to fix two classes of problems identified after initial testing:

1. **Coverline recovery:** Users can become permanently locked out of a coverline suggestion after dismissing an interpretation, with no path to retry. We add explicit recovery mechanisms (auto-recovery on data change + manual "Re-evaluate" action).

2. **Cycle classification:** Users currently have no way to acknowledge the Sensiplan-recognized states where a cycle has no coverline by design — **anovulatory cycles** (no ovulation occurred) or **uninterpretable data** (disturbances too severe to evaluate). We add two cycle-level flags with clear UI distinctions.

Features are labeled **[Sensiplan Core]** (follows official Sensiplan guidelines), **[CyclePath Enhancement]** (our addition), or **[Bug Fix]** (correcting existing behavior).

Throughout, this spec maintains strict alignment with Sensiplan principles verified via official sources (Arbeitsgruppe NFP / Malteser Deutschland publications, sensiplan.de, mynfp.de) and UK/German fertility-awareness community resources (Fertility UK, wearetheladies.de).

---

## 1. Problem Statement

### 1.1 The DISMISSED state trap [Bug]

Current persistence logic in `upsertCycleInterpretation`:

- When state is `DISMISSED` and engine returns a shift on the **same day** the user rejected → no-op (`"Same shift day the user rejected — stay quiet"`)
- When state is `DISMISSED` and engine returns `none` → no-op (`"Preserve dismiss memory"`)
- The UI hides DISMISSED interpretations entirely (`PropositionCard` returns `null`)

**Consequence:** If a user rejects an interpretation and subsequent data edits still point to the same shift day (or no shift), the coverline is permanently invisible with no recovery UI.

### 1.2 No path to classify cycles without coverlines [Gap]

Sensiplan recognizes three scenarios where a coverline legitimately cannot be drawn:

1. **Not yet evaluable** — cycle is ongoing, < 6 low-phase temps recorded, or the 3-over-6 rule can't yet be satisfied. Resolved by continued recording.
2. **Anovulatory cycle** — the cycle ended without a biphasic shift ever being detected (monophasic pattern). Retrospective diagnosis only.
3. **Uninterpretable data** — disturbances, exclusions, or data gaps prevent reliable evaluation even after proper bracketing.

The current implementation handles #1 correctly (returns `status: 'none'` silently before 6 temps exist). It does not surface #2 or #3 to the user.

### 1.3 Sensiplan constraints on mid-cycle anovulatory declaration

Per official Sensiplan sources (Arbeitsgruppe NFP; myNFP forum guidance):

> *"A cycle is per definition anovulatory only after menstruation has occurred without an ovulation having taken place, which you can see on the cycle sheet by the absence of a temperature elevation in that cycle."*

Mid-cycle declaration of anovulation is explicitly discouraged — ovulation can be delayed indefinitely by stress, illness, travel, etc. This directly constrains our UI: we cannot offer "Mark as Anovulatory" for active cycles.

"Uninterpretable data" faces no equivalent Sensiplan restriction — it corresponds to the "nicht auswertbar wegen Störungen" (unevaluable due to disturbances) state, which can apply at any point.

---

## 2. Goals

**G1.** A user must never be permanently locked out of seeing a coverline suggestion. Dismissal and rejection are always reversible.

**G2.** The user can explicitly classify a past cycle as **anovulatory** (no ovulation occurred) with a distinct note, distinct from the engine's technical finding of "no shift detected."

**G3.** The user can classify any cycle (active or past) as having **uninterpretable data**, removing interpretation attempts intentionally.

**G4.** Both classifications are fully reversible — the user can remove a mark at any time and return to the prior state.

**G5.** UI messaging differentiates clearly between:
- Engine's technical finding ("No thermal shift detected")
- User's retrospective diagnosis ("This cycle was anovulatory")
- User's acknowledgment of data quality ("Data too unreliable to interpret")

**G6.** All behavior remains Sensiplan-consistent. Specifically: no mid-cycle anovulatory declarations; user agency channels through excluded-day marking and rule-based re-evaluation, not rule override.

---

## 3. Recovery Mechanisms

### 3.1 Auto-recovery on data change [Bug Fix]

**Current behavior (broken):**
```
DISMISSED + engine finds same shiftDay → no-op (permanent trap)
DISMISSED + engine returns none → no-op (permanent trap)
```

**New behavior:**
```
DISMISSED + engine finds same shiftDay + data has changed since dismissal → reset to SUGGESTED
DISMISSED + engine finds same shiftDay + data unchanged → stay DISMISSED (respect user intent)
DISMISSED + engine returns none + data has changed since dismissal → stay DISMISSED but keep row fresh
DISMISSED + engine returns none + data unchanged → stay DISMISSED
```

**Mechanism: data fingerprint**

Add `dismissedDataFingerprint: String?` to the `CycleInterpretation` model. When a user dismisses, we compute a hash of the cycle's relevant data (day count, excluded-day set, temperature values, disturbance factors) and store it. On each engine re-evaluation, we compare the current fingerprint to the stored one. A material difference triggers auto-recovery.

The fingerprint covers:
- Number of days recorded
- Set of day numbers marked `excludeFromInterpretation: true`
- Temperature values (to 2 decimal places, to avoid noise from floating-point variance)
- Set of disturbance factors per day
- Travel time differences

It excludes: intercourse flags, cervical observations, OPK status (these don't affect thermal shift evaluation).

### 3.2 Manual "Re-evaluate" action [CyclePath Enhancement]

A minimal "dismissed" card is shown in the UI when `state === 'DISMISSED'`:

> *"Thermal shift suggestion was dismissed."*
> **[Re-evaluate]** · (if engine's latest result is `no_shift_detected`) **[Mark Data as Unreliable]** · (if inactive cycle AND engine's latest result is `no_shift_detected`) **[Mark as Anovulatory]**
>
> See §5.3.4 for precise button visibility rules — both mark buttons require the engine's current result to be `none + no_shift_detected` to avoid overriding a detected shift.

**Re-evaluate action:**
- Deletes the `CycleInterpretation` row entirely
- The engine re-runs on the next render cycle and creates a fresh `SUGGESTED` row if it finds a pattern, or creates nothing if it doesn't

This differs from auto-recovery: it's user-initiated and unconditional. It's the user explicitly saying "I want to reconsider."

### 3.3 Sensiplan alignment

Both mechanisms align with Sensiplan's workflow philosophy. Sensiplan says: if the user believes data is unreliable, the correct path is to bracket (exclude) specific disturbed days and re-apply the rules. Our auto-recovery mirrors this: when data changes, re-evaluate. Our manual "Re-evaluate" button is the UI analog of "I've adjusted my exclusions, please check again."

No Sensiplan rule is overridden. The 3-over-6 rule is still the only path to shift confirmation; we simply remove an artificial lock that prevented re-evaluation.

---

## 4. Cycle Classification

### 4.1 Schema changes

Add two nullable timestamp fields to the `Cycle` model:

```prisma
model Cycle {
  // ... existing fields
  markedAnovulatoryAt     DateTime?
  markedUninterpretableAt DateTime?
}
```

Using timestamps (not booleans) gives us:
- Easy null check for "is this marked?"
- Audit trail (when did the user mark it?)
- Mutual exclusivity: if `markedAnovulatoryAt != null`, `markedUninterpretableAt` must be `null`, and vice versa (enforced at the operation level, not the schema level — a cycle can only be one or the other at a time)

### 4.2 Anovulatory classification

**Availability:**
- ✅ Past/inactive cycles only (`isActive === false`)
- ❌ Active cycles — disabled per Sensiplan (cannot declare anovulation mid-cycle)
- ✅ Only when the engine's current evaluation returns `status: 'none'` with `reason: 'no_shift_detected'` — i.e., the engine has enough data and has concluded no biphasic shift exists. A cycle with `insufficient_data` (too few temps) cannot be marked anovulatory — there's no observational basis.
- ✅ Accepted starting states: no interpretation row, `SUGGESTED` with `none` engineResult, `DISMISSED` with `none` engineResult (as long as the server-side re-evaluation confirms `no_shift_detected`).
- ❌ Rejected: state is `CONFIRMED` / `ADJUSTED`, or engine currently detects a pending/confirmed shift (user must adjust exclusions and Re-evaluate, not override via mark).

**Action:** "Mark as Anovulatory"
- Sets `cycle.markedAnovulatoryAt = now()`
- Deletes any existing `CycleInterpretation` row for that cycle (safe because the guards in §6.2 ensure the row doesn't represent a user-confirmed or engine-viable shift)
- Returns the cycle in its new state

**Action:** "Remove Mark"
- Sets `cycle.markedAnovulatoryAt = null`
- Does NOT automatically restore a previous interpretation (the engine will re-run on next render and create a fresh one if appropriate)
- User can re-mark at any time afterward

**Mutual exclusivity:**
- If user clicks "Mark as Anovulatory" on a cycle already marked `Uninterpretable`, we switch — clear the old mark, set the new one
- This is explicit, not silent: the UI asks confirmation

### 4.3 Uninterpretable data classification

**Availability:**
- ✅ Past/inactive cycles
- ✅ Active cycles — allowed per Sensiplan (this is effectively an explicit form of "nicht auswertbar wegen Störungen")

**Gating — where the "Mark Data as Unreliable" button appears:**

To avoid casual use while still being reachable, the button is shown on every card type where the user has *already attempted* interpretation and the engine *could* return `no_shift_detected`. Specifically:

| Card | Button shown? | Rationale |
|---|---|---|
| `NoShiftCard` (inactive, engine `no_shift_detected`) | ✅ | Engine tried and failed |
| `InfoCard` / "No thermal shift detected yet" (active, `no_shift_detected`, day ≥ 7) | ✅ | Engine tried and failed; user can acknowledge the data is unreliable now |
| `DismissedCard` | ✅ only if engine's **latest** result is `no_shift_detected` | Prevents the dismiss→mark-unreliable bypass on pending/confirmed suggestions |
| `PendingCard`, `ConfirmedCard`, `SuggestedCard`, `AdjustedCard`, `NeedsReviewCard` | ❌ | Engine has a viable suggestion; the Sensiplan-correct path is to adjust exclusions, not mark unreliable |
| `AnovulatoryCard`, `UninterpretableCard` | ❌ | Already marked |

**Server-side enforcement (defense in depth):**

The `markCycleUninterpretable` operation does **not** rely on the client-supplied engine result. Instead it re-runs the interpretation engine server-side against the cycle's stored days and rejects with 409 unless the server's own evaluation confirms `status === 'none'` AND `reason === 'no_shift_detected'`. See §6.2 for full operation details.

This catches every bypass path a client-side-only gate would miss:

| Bypass attempt | Client gate alone | Server re-evaluation |
|---|---|---|
| Active cycle with `insufficient_data` (no row) | ❌ Passes (no row to check) | ✅ Rejects (engine says `insufficient_data`, not `no_shift_detected`) |
| DISMISSED cycle where latest result is pending/confirmed | ❌ Passes state-only check | ✅ Rejects (engine re-evaluation returns pending/confirmed) |
| Stale client state after data edits | ❌ May pass | ✅ Rejects based on current data |
| Direct API call with forged payload | ❌ No check | ✅ Server is source of truth |

The DismissedCard button is still **conditionally rendered** client-side (based on the current engine result) for UX reasons — we don't want to show a button that will return 409. But the server-side re-evaluation is the authoritative gate.

**Action:** "Mark Data as Unreliable"
- Sets `cycle.markedUninterpretableAt = now()`
- Deletes any existing `CycleInterpretation` row
- Returns the cycle in its new state

**Action:** "Remove Mark"
- Sets `cycle.markedUninterpretableAt = null`
- Engine re-runs on next render

### 4.4 Cross-cycle anovulatory nudge [CyclePath Enhancement]

**Goal:** Prompt retrospective classification at the natural moment — when a new cycle begins.

**Trigger conditions (all must be true):**
- Current cycle is active
- The previous cycle (by `cycleNumber`) exists and is inactive
- Previous cycle has no confirmed `CycleInterpretation` (i.e., state is not `CONFIRMED` or `ADJUSTED`)
- Previous cycle is not already marked anovulatory or uninterpretable
- The user has not dismissed the banner for this session (see below)

**Banner placement:** Top of the active cycle's chart page, above the chart.

**Banner content:**
> *"Your previous cycle (Cycle N) ended without a confirmed thermal shift. If ovulation didn't occur, consider marking it as anovulatory."*
>
> **[Review Cycle N]** · **[Dismiss for Now]**

- **Review Cycle N:** Navigates to the previous cycle's chart page.
- **Dismiss for Now:** Session-scoped dismissal (stored in `sessionStorage`). The banner re-appears on next app load but not during the current session. We deliberately do not offer permanent dismissal — if the user hasn't classified the cycle, the reminder is still relevant.
- Banner disappears permanently once the previous cycle is marked (anovulatory or uninterpretable).

**Rationale for session-only dismissal:** Classification matters for the user's cycle history and pattern recognition (e.g., detecting recurrent anovulation as a health indicator). Making it easy to dismiss permanently would defeat the purpose.

---

## 5. UI Behavior by State

### 5.1 State matrix

| Cycle state | Engine result | User marking | UI rendering |
|---|---|---|---|
| Active | `insufficient_data` (< 6 valid temps) | None | Silent — no card |
| Active | `no_shift_detected` + cycle day < 7 | None | Silent — no card (see 5.2) |
| Active | `no_shift_detected` + cycle day ≥ 7 | None | InfoCard: *"No thermal shift detected yet. Continue recording daily temperatures."* |
| Active | `pending` | None | PendingCard (existing) |
| Active | `confirmed` | None | ConfirmedCard / SuggestedCard (existing) |
| Active or inactive | Any | Marked anovulatory | AnovulatoryCard (see 5.3) |
| Active or inactive | Any | Marked uninterpretable | UninterpretableCard (see 5.3) |
| Inactive | `no_shift_detected` | None | NoShiftCard (see 5.3) |
| Inactive | `confirmed` + user Confirmed | None | ConfirmedCard (existing) |
| Any | Any | DISMISSED (state) | DismissedCard (see 5.3) |
| Any | `needsReview: true` | None | NeedsReviewCard (existing) |

### 5.2 "No shift detected yet" gating [CyclePath Enhancement]

The message *"No thermal shift detected yet. Continue recording daily temperatures."* is shown only when:

1. Engine returns `status: 'none'` with `reason: 'no_shift_detected'` (not `'insufficient_data'`), **AND**
2. The current cycle has at least 7 days recorded (`max(dayNumber) >= 7`)

**Rationale:** Before day 7, showing "no shift detected" is noisy and not actionable. The 3-over-6 rule requires 6 low-phase temps before any shift is theoretically detectable — the earliest possible shift day is day 7. Gating on cycle day ≥ 7 avoids showing a message that is trivially true.

This is Sensiplan-consistent: the 6-temp floor is the method's own computational prerequisite. Showing "no shift detected yet" before this floor would be misleading.

### 5.3 New card components

#### 5.3.1 NoShiftCard (inactive cycles, engine found no shift)

```
┌─────────────────────────────────────────────┐
│ No thermal shift detected                   │
│                                             │
│ The engine could not identify a biphasic    │
│ temperature pattern in the available data.  │
│                                             │
│ [Mark as Anovulatory]  [Mark Data as        │
│                         Unreliable]         │
└─────────────────────────────────────────────┘
```

Shown when: cycle is inactive AND engine returned `no_shift_detected` AND cycle is not marked AND state is not DISMISSED.

#### 5.3.2 AnovulatoryCard

```
┌─────────────────────────────────────────────┐
│ Cycle marked as anovulatory                 │
│                                             │
│ You marked this cycle as anovulatory.       │
│ No ovulation occurred — the temperature     │
│ pattern remained monophasic throughout.     │
│                                             │
│ [Remove Mark]                               │
└─────────────────────────────────────────────┘
```

Shown when: `cycle.markedAnovulatoryAt != null`.

#### 5.3.3 UninterpretableCard

```
┌─────────────────────────────────────────────┐
│ Data marked as unreliable                   │
│                                             │
│ You marked this cycle's data as unreliable  │
│ for interpretation. Too many disturbances   │
│ or exclusions prevent a reliable thermal    │
│ shift assessment.                           │
│                                             │
│ [Remove Mark]                               │
└─────────────────────────────────────────────┘
```

Shown when: `cycle.markedUninterpretableAt != null`.

#### 5.3.4 DismissedCard

```
┌─────────────────────────────────────────────┐
│ Thermal shift suggestion was dismissed      │
│                                             │
│ [Re-evaluate]                               │
│ (if engine's latest result is               │
│  no_shift_detected) [Mark Data as           │
│                      Unreliable]            │
│ (if inactive cycle AND engine's latest      │
│  result is no_shift_detected)               │
│   [Mark as Anovulatory]                     │
└─────────────────────────────────────────────┘
```

Shown when: `state === 'DISMISSED'` AND cycle is not marked anovulatory/uninterpretable.

**Button visibility:**
- **[Re-evaluate]** — always shown
- **[Mark Data as Unreliable]** — shown only when `engineResult.status === 'none'` AND `engineResult.reason === 'no_shift_detected'`. Hidden when the engine has a pending or confirmed suggestion.
- **[Mark as Anovulatory]** — shown only when `cycle.isActive === false` AND `engineResult.status === 'none'` AND `engineResult.reason === 'no_shift_detected'`. Hidden when the engine has a pending or confirmed suggestion.

**Why both mark buttons use the same engine-result gate:** Per §10.1, no mark action overrides a detected shift. The Sensiplan-correct path when the user disagrees with a detected shift is: exclude the disturbed days that produced the false rise, then Re-evaluate. A DISMISSED cycle whose latest engine result still shows pending/confirmed means the engine still has a viable suggestion — the user should Re-evaluate (and adjust exclusions if needed), not reach for a mark action that would silently discard the engine's finding.

This **replaces** the current behavior where `PropositionCard` returns `null` for DISMISSED.

#### 5.3.5 InfoCard (active cycle, no shift detected yet, day ≥ 7)

```
┌─────────────────────────────────────────────┐
│ No thermal shift detected yet               │
│                                             │
│ Continue recording daily temperatures.      │
│                                             │
│ [Mark Data as Unreliable]                   │
└─────────────────────────────────────────────┘
```

Shown when: cycle is active AND engine returned `no_shift_detected` AND `max(dayNumber) >= 7` AND no interpretation row exists AND cycle is not marked.

The "Mark Data as Unreliable" button is included here specifically so active cycles with genuine `no_shift_detected` results have a reachable path to classification (previously the spec left this case with no actions, making active-cycle uninterpretable marking unreachable in practice).

#### 5.3.6 CrossCycleAnovulatoryBanner

Placed at top of chart page, above the chart, when trigger conditions are met (see 4.4).

### 5.4 Cycle title badge [CyclePath Enhancement]

When a cycle is marked, a badge is displayed in three places for consistency:

1. **Chart page header** — next to the cycle title:
   `Cycle 3 · 24 days · [Anovulatory]`

2. **Cycle switcher / navigation dropdown:**
   `Cycle 3 (24 days) [Anovulatory]`

3. **Cycles overview list (if/when implemented):** same badge

**Badge styles:**
- **Anovulatory** — amber background (`bg-amber-100`), amber text (`text-amber-800`), pill shape, 12px text
- **Unreliable data** — gray background (`bg-gray-200`), gray text (`text-gray-700`), pill shape, 12px text

The badge is purely informational. Clicking it does not navigate anywhere; the user interacts with the card on the chart page.

### 5.5 Chart coverline rendering

When a cycle is marked (anovulatory or uninterpretable):
- Coverline annotation is removed from the chart (no line drawn)
- Shift day highlight is removed
- Post-shift monitoring is not run
- No nudges are generated

When state is DISMISSED:
- Coverline annotation is removed
- Shift day highlight is removed
- Nudges continue to update (e.g., the user might still want to see pre-shift outlier nudges)
- Post-shift monitoring is NOT run (there's no active coverline)

---

## 6. Server Operations

### 6.1 New operations

```typescript
// Mark a cycle as anovulatory (inactive cycles only)
markCycleAnovulatory(args: { cycleId: string }): Cycle

// Mark a cycle's data as uninterpretable (active or inactive)
markCycleUninterpretable(args: { cycleId: string }): Cycle

// Remove either mark (generic — internally checks which was set)
unmarkCycleClassification(args: { cycleId: string }): Cycle

// Re-evaluate: delete the CycleInterpretation row so the engine creates a fresh one
reEvaluateCycleInterpretation(args: { cycleId: string, type: 'THERMAL_SHIFT' }): void
```

### 6.2 Operation details

#### `markCycleAnovulatory`
1. Verify cycle ownership (existing `context.user.id` check)
2. **Guard:** Reject with 400 if `cycle.isActive === true` (Sensiplan: no mid-cycle anovulatory declaration)
3. **Guard:** Fetch the existing `CycleInterpretation` for this cycle + `THERMAL_SHIFT` type. Reject with 409 if its state is `CONFIRMED` or `ADJUSTED` (protects user investment — user must explicitly Reject the confirmed shift first if they want to reclassify)
4. **Server-side re-evaluation gate** (same pattern as `markCycleUninterpretable`):
   - Fetch the cycle's `CycleDay` records
   - Convert to `CycleDayInput[]`
   - Call `runInterpretation(days)` from `app/src/cycle-tracking/interpretation/sensiplan/index.ts`
   - Reject with 409 unless `result.thermalShift.status === 'none'` AND `result.thermalShift.reason === 'no_shift_detected'`
   - Rationale: anovulatory means "no ovulation occurred" — a retrospective conclusion requiring that the engine, given adequate data, found no biphasic shift. If the engine still detects a viable shift (pending/confirmed), the user shouldn't silently override it via a mark action — the Sensiplan path is to adjust exclusions and Re-evaluate. If the engine says `insufficient_data`, the cycle doesn't have enough temps to diagnose anovulation from — marking would be speculation, not observation.
5. Set `cycle.markedAnovulatoryAt = now()`, `cycle.markedUninterpretableAt = null`
6. Delete the `CycleInterpretation` row (if any) — safe now because of guards above
7. Return updated cycle

Callers should not see 409s under normal UI flow because the UI only renders "Mark as Anovulatory" from cards where the engine result is `no_shift_detected` (`NoShiftCard`, `DismissedCard` with the engine-result gate). The server-side guard is defense in depth.

#### `markCycleUninterpretable`
1. Verify cycle ownership
2. **Guard:** Fetch existing `CycleInterpretation` for this cycle + `THERMAL_SHIFT`. Reject with 409 if its state is `CONFIRMED` or `ADJUSTED` (user investment protection — user must explicitly Reject first via the review flow)
3. **Server-side re-evaluation gate:**
   - Fetch the cycle's `CycleDay` records (all days with `bbt`, `excludeFromInterpretation`, `disturbanceFactors`, `travelTimeDiff`, `bbtTime`)
   - Convert to `CycleDayInput[]`
   - Call `runInterpretation(days)` from the existing engine module (`app/src/cycle-tracking/interpretation/sensiplan/index.ts`)
   - Reject with 409 if **either**:
     - `result.thermalShift.status !== 'none'`, **OR**
     - `result.thermalShift.status === 'none'` but `result.thermalShift.reason !== 'no_shift_detected'` (e.g., `insufficient_data`)
   - Rationale: "unreliable data" is only meaningful when the engine actually tried and failed. `insufficient_data` means not enough temps to even try — the user should record more data, not mark unreliable. Pending/confirmed means the engine has a viable suggestion — the user should Reject or Adjust, per Sensiplan workflow.
4. Set `cycle.markedUninterpretableAt = now()`, `cycle.markedAnovulatoryAt = null`
5. Delete the `CycleInterpretation` row (if any)
6. Return updated cycle

**Why server-side re-evaluation and not a client-supplied `engineResult` argument?** The engine is a pure function (§15 in the 2026-04-14 spec), and the cycle's source data is already in the database. Re-running the engine server-side is cheap and makes the server the authoritative source of truth — a forged or stale client payload cannot bypass the gate.

**Implementation note:** The engine module imports no React or browser-only APIs, so it runs unmodified in Node. The server-side operation should import `runInterpretation` from the shared path and pass a properly-shaped `CycleDayInput[]` derived from `CycleDay` rows.

**Summary of acceptable starting states (both operations now use the same engine-result gate):**

For `markCycleAnovulatory`:
- Cycle is inactive (`isActive === false`) — strict Sensiplan requirement
- AND state is NOT `CONFIRMED` / `ADJUSTED`
- AND server-side engine re-evaluation returns `status: 'none'` with `reason: 'no_shift_detected'`
- This rejects: active cycles, CONFIRMED/ADJUSTED cycles, cycles where the engine still detects a pending/confirmed shift, and cycles with `insufficient_data`.

For `markCycleUninterpretable`:
- State is NOT `CONFIRMED` / `ADJUSTED`
- AND server-side engine re-evaluation returns `status: 'none'` with `reason: 'no_shift_detected'`
- Active and inactive cycles both allowed.

Both operations now close every bypass the reviews identified (pending/confirmed after dismissal, `insufficient_data` with no row, stale client state, direct API calls). The only structural difference is the `isActive === false` precondition for anovulatory (Sensiplan: cannot declare anovulation mid-cycle).

#### `unmarkCycleClassification`
1. Verify cycle ownership
2. Set both `markedAnovulatoryAt` and `markedUninterpretableAt` to `null`
3. Return updated cycle
4. (Engine will re-run on next render and create a fresh interpretation if applicable)

#### `reEvaluateCycleInterpretation`
1. Verify cycle ownership
2. Delete the `CycleInterpretation` row for the given cycle + type
3. Return void
4. (Engine will re-run on next render and create a fresh `SUGGESTED` if it finds a pattern)

### 6.3 Updated operation: `upsertCycleInterpretation`

Add fingerprint logic:

```typescript
// On every upsert call, accept a dataFingerprint argument:
upsertCycleInterpretation(args: {
  cycleId: string;
  type: 'THERMAL_SHIFT';
  engineResult: any;
  postShiftMonitoring?: any;
  pendingNudges?: any;
  dataFingerprint: string;  // NEW
})
```

Update the `DISMISSED` branches:

```typescript
// DISMISSED + engine finds non-none with same shiftDay:
if (existing.dismissedShiftDay === args.engineResult.shiftDay) {
  if (existing.dismissedDataFingerprint !== args.dataFingerprint) {
    // Data has changed since dismissal — reset to SUGGESTED
    return update(...{ state: 'SUGGESTED', dismissedShiftDay: null, dismissedDataFingerprint: null, ... });
  }
  // Data unchanged — respect dismissal, refresh engine result silently
  return update(...{ engineResult: args.engineResult });  // NEW: was a no-op before
}

// DISMISSED + engine returns none:
// Always update the engine result to keep it fresh; state stays DISMISSED
return update(...{ engineResult: args.engineResult });  // NEW: was a no-op before
```

**Key change:** The `existing` row is always updated with the latest `engineResult` so the UI has fresh data when the user clicks "Re-evaluate" or when the dismissal is auto-recovered. The state remains DISMISSED unless the fingerprint proves data has materially changed.

### 6.4 Updated operation: `dismissInterpretation` and `resolveReview` (reject branch)

Both actions now also record the data fingerprint at dismissal time:

```typescript
// When setting state to DISMISSED:
data: {
  state: 'DISMISSED',
  dismissedShiftDay: args.dismissedShiftDay,
  dismissedDataFingerprint: args.dataFingerprint,  // NEW
  userOverrides: Prisma.DbNull,
}
```

The client passes the current fingerprint when calling these actions.

### 6.5 Updated operation: `upsertCycleInterpretation` — cycle mark check

Before doing any work, check if the cycle is marked:

```typescript
if (cycle.markedAnovulatoryAt || cycle.markedUninterpretableAt) {
  // Cycle is classified — engine results are ignored
  // Delete any existing interpretation row (defensive cleanup)
  if (existing) {
    await context.entities.CycleInterpretation.delete({ where: { id: existing.id } });
  }
  return null;
}
```

This ensures a classified cycle never has an interpretation row, avoiding state conflicts.

---

## 7. Data Fingerprint Implementation

### 7.1 Fingerprint function

```typescript
/**
 * Compute a stable fingerprint of cycle data that affects thermal shift evaluation.
 * Two cycles with the same fingerprint should produce identical engine results.
 */
function computeCycleDataFingerprint(days: CycleDayInput[]): string {
  const normalized = days
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map(d => ({
      n: d.dayNumber,
      t: d.bbt !== null ? Number(d.bbt.toFixed(2)) : null,
      x: d.excludeFromInterpretation ? 1 : 0,
      f: [...d.disturbanceFactors].sort(),
      v: d.travelTimeDiff,
    }));
  return sha1(JSON.stringify(normalized));  // or equivalent hash
}
```

### 7.2 When the fingerprint is computed

- At every engine run (in `useInterpretation` hook), the fingerprint is computed from the current days array and passed to `upsertCycleInterpretation`
- When the user dismisses or rejects, the same computed fingerprint is passed to `dismissInterpretation` / `resolveReview`

### 7.3 Stability guarantees

- Only the 5 listed fields contribute (day number, temp to 2 decimal places, exclusion flag, disturbance factors, travel time)
- Temperature precision (`.toFixed(2)`) prevents floating-point noise from triggering false recovery
- Sort order is normalized (by dayNumber; disturbance factors sorted alphabetically)
- Adding, removing, or changing any of these fields for any day → new fingerprint → auto-recovery kicks in
- Changing unrelated fields (intercourse, cervical, OPK, menstrual flow) → fingerprint unchanged → DISMISSED respected

---

## 8. Client Orchestration

### 8.1 `useInterpretation` hook changes

```typescript
// Compute fingerprint once per render
const dataFingerprint = useMemo(() => computeCycleDataFingerprint(days), [days]);

// Pass to upsertCycleInterpretation on each run
upsertCycleInterpretation({
  cycleId,
  type: 'THERMAL_SHIFT',
  engineResult,
  postShiftMonitoring,
  pendingNudges,
  dataFingerprint,  // NEW
});

// When user clicks Dismiss or Reject, pass the current fingerprint
dismissInterpretation({
  interpretationId,
  dismissedShiftDay,
  dataFingerprint,  // NEW
});

// When user clicks Re-evaluate:
reEvaluateCycleInterpretation({ cycleId, type: 'THERMAL_SHIFT' });

// When user marks anovulatory / uninterpretable:
markCycleAnovulatory({ cycleId });
// or
markCycleUninterpretable({ cycleId });

// When user removes a mark:
unmarkCycleClassification({ cycleId });
```

### 8.1.1 Persistence dedupe reset after row-deleting actions [P1 correctness]

The `useInterpretation` hook currently dedupes persistence writes via a `lastPersistedRef` (keyed on a hash of engineResult + postShiftMonitoring + nudges). This is correct for normal rerun loops, but it creates a hazard for the new delete-then-recreate actions: `reEvaluateCycleInterpretation` and `unmarkCycleClassification` both delete the existing row server-side. If the engine result on the next render is identical to what was last persisted, the hook will dedupe away the follow-up `upsertCycleInterpretation` call — and the row will stay deleted instead of being recreated as a fresh `SUGGESTED`.

**Required fix in the hook:**

After any of these operations succeed, the client must invalidate the dedupe cache so the next engine run will unconditionally upsert:

```typescript
// After reEvaluateCycleInterpretation, unmarkCycleClassification, markCycleAnovulatory,
// or markCycleUninterpretable returns successfully:
lastPersistedRef.current = null;
```

For `markCycleAnovulatory` and `markCycleUninterpretable`, the dedupe reset is paired with an early-skip in the next render (see 8.2) — so resetting the ref is harmless but keeps the cache consistent if the user later unmarks.

For `reEvaluateCycleInterpretation` and `unmarkCycleClassification`, the reset is critical: without it, the common case (same engine result before and after) leaves the cycle without an interpretation row when the user expected a fresh suggestion.

**Implementation note:** These action handlers should be wrapped in the hook so the ref reset is not forgotten by component-level callers. E.g., expose `reEvaluate()`, `markAnovulatory()`, `markUninterpretable()`, `unmark()` from `useInterpretation` rather than having components call the Wasp operations directly.

### 8.2 Skip engine execution when marked

In the hook, if `cycle.markedAnovulatoryAt || cycle.markedUninterpretableAt`, skip calling `runInterpretation` and skip the upsert. Return early so no engine work happens for classified cycles.

### 8.3 Card routing (`PropositionCard`)

```typescript
if (cycle.markedAnovulatoryAt) return <AnovulatoryCard ... />;
if (cycle.markedUninterpretableAt) return <UninterpretableCard ... />;
if (interpretation?.state === 'DISMISSED') {
  // DismissedCard conditionally renders [Mark Data as Unreliable] based on
  // engineResult.status === 'none' && engineResult.reason === 'no_shift_detected'
  return <DismissedCard interpretation={interpretation} cycle={cycle} engineResult={engineResult} />;
}
if (interpretation?.needsReview) return <NeedsReviewCard ... />;
if (!interpretation && !isActive && engineResult.status === 'none' && engineResult.reason === 'no_shift_detected') {
  // Inactive cycle, engine found nothing — offers [Mark as Anovulatory] and [Mark Data as Unreliable]
  return <NoShiftCard cycle={cycle} />;
}
if (!interpretation && isActive && engineResult.status === 'none' && engineResult.reason === 'no_shift_detected' && maxDayNumber >= 7) {
  // Active cycle, engine found nothing, day ≥ 7 — offers [Mark Data as Unreliable]
  // so active-cycle uninterpretable marking is actually reachable
  return <InfoCard cycle={cycle} message="No thermal shift detected yet. Continue recording daily temperatures." />;
}
// ... existing routing for SUGGESTED, CONFIRMED, ADJUSTED
```

---

## 9. Cross-Cycle Banner Logic

### 9.1 Query

A new query or an extension to the existing cycle query that returns, for each active cycle, the previous cycle's summary:

```typescript
getActiveCycleWithPrevious(): {
  cycle: Cycle;
  previousCycle: {
    id: string;
    cycleNumber: number;
    isMarked: boolean;  // anovulatory OR uninterpretable
    hasConfirmedShift: boolean;
  } | null;
}
```

### 9.2 Component logic

```typescript
function CrossCycleAnovulatoryBanner({ previousCycle }: Props) {
  // Hooks must run unconditionally (React rules of hooks), so the useState
  // initializer must be null-safe. We cannot early-return before the hook call.
  const [dismissedThisSession, setDismissedThisSession] = useState(() => {
    if (!previousCycle) return false;
    return sessionStorage.getItem(`anovulatory-banner-${previousCycle.id}`) === 'true';
  });

  if (!previousCycle) return null;
  if (previousCycle.isMarked) return null;
  if (previousCycle.hasConfirmedShift) return null;
  if (dismissedThisSession) return null;

  return (
    <div className="banner">
      Your previous cycle (Cycle {previousCycle.cycleNumber}) ended without
      a confirmed thermal shift. If ovulation didn't occur, consider marking
      it as anovulatory.

      <button onClick={() => navigate(`/cycles/${previousCycle.id}`)}>
        Review Cycle {previousCycle.cycleNumber}
      </button>

      <button onClick={() => {
        sessionStorage.setItem(`anovulatory-banner-${previousCycle.id}`, 'true');
        setDismissedThisSession(true);
      }}>
        Dismiss for Now
      </button>
    </div>
  );
}
```

### 9.3 Sensiplan note

The banner text explicitly frames anovulation as a possibility to consider, not a diagnosis. The decision is the user's. We do not auto-mark — this would violate Sensiplan's retrospective-only principle if the user's judgment was wrong (e.g., ovulation happened but the temperature chart missed it due to disturbances).

---

## 10. Sensiplan Compliance Verification

This section documents how each design element aligns with official Sensiplan guidance.

| Design element | Sensiplan alignment |
|---|---|
| Auto-recovery on data change | ✅ Mirrors Sensiplan workflow: re-bracket → re-evaluate. No rule override. |
| Manual "Re-evaluate" button | ✅ User-initiated re-check. No different from adjusting exclusions and viewing a fresh chart. |
| "Mark as Anovulatory" only on inactive cycles | ✅ Strictly aligned. Sensiplan forbids mid-cycle anovulatory declaration — ovulation can be delayed indefinitely. |
| "Mark Data as Unreliable" on active cycles | ✅ Corresponds to Sensiplan's "nicht auswertbar wegen Störungen" (unevaluable due to disturbances). Can apply at any time. |
| Requires engine `no_shift_detected` before either mark action | ✅ Prevents casual use and prevents either mark from overriding a detected shift. Aligned with Sensiplan's preference: bracket specific days and re-evaluate before giving up. Enforced server-side via engine re-evaluation for both operations. |
| Cross-cycle banner at new cycle start | ✅ Retrospective classification prompt at the natural moment. User decides — not auto-marked. |
| "No shift detected yet" only when cycle day ≥ 7 | ✅ Aligns with the 3-over-6 rule's own computational prerequisite (6 low temps required before any shift is detectable). |
| DismissedCard does not hide the dismissed state | ✅ Preserves user intent (the dismissal is recorded) while providing a recovery path (the "Re-evaluate" button). |
| Mutual exclusivity of anovulatory vs uninterpretable | ✅ These are different Sensiplan concepts: anovulatory = no ovulation; uninterpretable = data insufficient. A cycle should not be both. |
| Both marks reversible | ✅ Medical understanding evolves; no hard commitment. User can change their mind as they learn more about their own patterns (Sensiplan emphasizes multi-cycle observation). |

### 10.1 What we explicitly do NOT do

- **We do not auto-mark cycles as anovulatory.** Only the user can mark.
- **We do not allow overriding a confirmed shift via a "mark" action.** If the engine confirms a shift via the 3-over-6 rule, the path to disagreement is still: exclude disturbed days and let the engine re-evaluate. "Mark as Anovulatory" and "Mark Data as Unreliable" are not shown when the engine has a confirmed or pending shift, and the server operations reject with 409 as defense in depth (see §6.2).
- **We do not set thresholds for auto-marking (e.g., "if 50% of days are excluded, auto-mark unreliable").** Sensiplan has no such threshold. The user retains judgment.

---

## 11. Persistence Rules — Full Matrix

Updated table integrating the new classifications:

| State | Cycle marked? | Engine result | Action |
|---|---|---|---|
| (no row) | Anovulatory or Uninterpretable | Any | No-op (skip engine entirely in client) |
| (no row) | No | `none` + `insufficient_data` | No-op |
| (no row) | No | `none` + `no_shift_detected` | No-op (display only; no DB row) |
| (no row) | No | `pending` or `confirmed` | Create `SUGGESTED` |
| `SUGGESTED` | Anovulatory or Uninterpretable | Any | Delete row |
| `SUGGESTED` | No | `none` | Delete row |
| `SUGGESTED` | No | `pending` / `confirmed` | Update engineResult |
| `CONFIRMED` / `ADJUSTED` | Anovulatory or Uninterpretable | Any | Delete row |
| `CONFIRMED` / `ADJUSTED` | No | Material change | Set `needsReview`, store `previousEngineResult` |
| `CONFIRMED` / `ADJUSTED` | No | No material change | Silent update |
| `DISMISSED` | Anovulatory or Uninterpretable | Any | Delete row |
| `DISMISSED` | No | Different shiftDay | Reset to `SUGGESTED` (existing logic) |
| `DISMISSED` | No | Same shiftDay + fingerprint changed | Reset to `SUGGESTED` (NEW) |
| `DISMISSED` | No | Same shiftDay + fingerprint unchanged | Update engineResult, stay DISMISSED (CHANGED) |
| `DISMISSED` | No | `none` + fingerprint changed | Update engineResult, stay DISMISSED |
| `DISMISSED` | No | `none` + fingerprint unchanged | Update engineResult, stay DISMISSED (CHANGED) |

Key: "NEW" = new branch. "CHANGED" = modified behavior. Rows without markers are unchanged from the original spec.

**Note on unreachable rows:** Per §6.2, the mark operations reject with 409 when existing interpretation is `CONFIRMED` / `ADJUSTED`, and `markCycleUninterpretable` additionally rejects (via server-side engine re-evaluation) when the current engine result is anything other than `none + no_shift_detected`. So the `CONFIRMED / ADJUSTED + marked` and `SUGGESTED with pending/confirmed engineResult + marked` rows are not reachable via normal flow. They remain in this matrix as **defense in depth** — if a stale client or race condition ever produces this state, the upsert path defensively deletes the orphan row rather than leaving inconsistent data.

---

## 12. Testing Strategy

### 12.1 New unit tests

- `materialChange.test.ts` — already exists
- `dataFingerprint.test.ts` — new
  - Same days → same fingerprint
  - Different temp values → different fingerprint
  - Different exclusion flags → different fingerprint
  - Different disturbance factors → different fingerprint
  - Different intercourse flag → SAME fingerprint
  - Different cervical observations → SAME fingerprint
  - Day order doesn't affect fingerprint (sort-stable)
  - Floating-point noise (36.1 vs 36.10000000001) → same fingerprint

### 12.2 New integration tests

- `coverlineRecovery.test.ts` — new
  - DISMISSED + same shiftDay + fingerprint unchanged → stays DISMISSED
  - DISMISSED + same shiftDay + fingerprint changed → resets to SUGGESTED
  - DISMISSED + none + fingerprint changed → stays DISMISSED (note: per spec, since engine can't suggest anything anyway)
  - Re-evaluate action → deletes row, engine creates fresh on next run
  - Marking cycle anovulatory → deletes interpretation
  - Marking cycle uninterpretable → deletes interpretation
  - Unmarking → engine re-runs fresh
  - Cannot mark active cycle anovulatory (400 error)
  - `markCycleUninterpretable` server-side re-evaluation gate:
    - Reject 409 when cycle has `insufficient_data` (< 6 valid temps, no row exists)
    - Reject 409 when state is DISMISSED but current engine result is `pending` or `confirmed`
    - Reject 409 when state is DISMISSED but current engine result is `none + insufficient_data`
    - Reject 409 when state is CONFIRMED or ADJUSTED (regardless of engine result)
    - Accept when state is DISMISSED AND engine result is `none + no_shift_detected`
    - Accept when no row exists AND engine result is `none + no_shift_detected`
    - Accept when state is SUGGESTED AND engine result is `none + no_shift_detected`
  - `markCycleAnovulatory` server-side re-evaluation gate (same pattern, plus `isActive === false` precondition):
    - Reject 400 when cycle is active (regardless of everything else)
    - Reject 409 when inactive cycle has `insufficient_data`
    - Reject 409 when inactive + state is DISMISSED but current engine result is `pending` or `confirmed` (closes the specific bypass identified in review: dismissed cycle with viable latest suggestion)
    - Reject 409 when inactive + state is DISMISSED but current engine result is `none + insufficient_data`
    - Reject 409 when inactive + state is CONFIRMED or ADJUSTED
    - Accept when inactive + state is DISMISSED AND engine result is `none + no_shift_detected`
    - Accept when inactive + no row exists AND engine result is `none + no_shift_detected`
    - Accept when inactive + state is SUGGESTED AND engine result is `none + no_shift_detected`

### 12.3 E2E scenario coverage

1. **Cycle 3 recovery scenario** (from user report):
   - Confirm shift
   - Exclude days until engine returns none
   - Reject the review
   - Add days back so engine re-detects shift
   - Verify coverline returns (auto-recovery)

2. **Anovulatory classification flow:**
   - Cycle ends without shift
   - Banner appears on new active cycle
   - User clicks Review, navigates, marks as anovulatory
   - Banner disappears, AnovulatoryCard shows
   - Cycle badge visible in navigation

3. **Uninterpretable classification flow:**
   - Active cycle, engine returns none with no_shift_detected
   - User marks unreliable from DismissedCard or NoShiftCard
   - UninterpretableCard shows
   - User removes mark, engine re-runs

---

## 13. Out of Scope

- Pre-marking ("I expect this cycle to be anovulatory based on symptoms"): not supported. Sensiplan only supports retrospective classification.
- Auto-detection of PCOS or hormonal irregularities from patterns: not addressed.
- Cycle-level notes/comments (beyond the two classification flags): future enhancement.
- Detecting pregnancy patterns (18+ high temps): future enhancement. Not part of this spec.
- Historical cycle reclassification when Sensiplan rule interpretation changes: not addressed.

---

## 14. Open Questions

None at spec time. All design questions Q1–Q8 have been answered.

---

## 15. File Changes Summary

### New files
- `app/src/cycle-tracking/interpretation/dataFingerprint.ts`
- `app/src/cycle-tracking/interpretation/components/NoShiftCard.tsx`
- `app/src/cycle-tracking/interpretation/components/AnovulatoryCard.tsx`
- `app/src/cycle-tracking/interpretation/components/UninterpretableCard.tsx`
- `app/src/cycle-tracking/interpretation/components/DismissedCard.tsx`
- `app/src/cycle-tracking/interpretation/components/CrossCycleAnovulatoryBanner.tsx`
- `app/src/cycle-tracking/interpretation/components/CycleBadge.tsx`
- `app/src/cycle-tracking/cycleClassificationOperations.ts` (imports `runInterpretation` server-side for both `markCycleAnovulatory` and `markCycleUninterpretable` engine-result gates)
- `app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts`
- `app/src/cycle-tracking/interpretation/__tests__/coverlineRecovery.test.ts`

### Modified files
- `app/schema.prisma` — add `markedAnovulatoryAt`, `markedUninterpretableAt` to Cycle; add `dismissedDataFingerprint` to CycleInterpretation
- `app/main.wasp` — declare new operations
- `app/src/cycle-tracking/interpretation/interpretationOperations.ts` — update `upsertCycleInterpretation`, `dismissInterpretation`, `resolveReview`; new operations
- `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts` — compute fingerprint; skip engine when cycle marked; new action handlers
- `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx` — routing logic for new cards
- `app/src/cycle-tracking/CycleChartPage.tsx` — cross-cycle banner; badge in title; coverline hidden when marked
- (wherever cycle navigation lives) — badge in switcher/dropdown

---

## 16. Migration Plan

1. Prisma migration: add three nullable fields (all nullable, non-breaking)
2. No data backfill required — existing cycles are naturally "unmarked" (null)
3. No behavior change for existing CONFIRMED/ADJUSTED/SUGGESTED interpretations
4. Existing DISMISSED rows: `dismissedDataFingerprint` is null, so auto-recovery will treat ANY fingerprint as "changed" on the next engine run → DISMISSED will be reset to SUGGESTED. **This is intentional and desirable** — it unsticks any existing traps (including user's Cycle 3).
