# Coverline Recovery & Cycle Classification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the DISMISSED state trap and add cycle classification (Anovulatory / Uninterpretable) so users are never locked out of a coverline suggestion and can explicitly record Sensiplan-recognized no-coverline states.

**Architecture:** Four new server operations (`markCycleAnovulatory`, `markCycleUninterpretable`, `unmarkCycleClassification`, `reEvaluateCycleInterpretation`), a data-fingerprint mechanism for auto-recovery, updated `upsertCycleInterpretation` persistence rules, two new Prisma fields on `Cycle` and one on `CycleInterpretation`, new card components (NoShiftCard, AnovulatoryCard, UninterpretableCard, DismissedCard, InfoCard, CrossCycleAnovulatoryBanner, CycleBadge), and hook-level action wrappers that reset the persistence dedupe cache after row-deleting actions.

**Tech Stack:** TypeScript, React 18, Wasp 0.18, Prisma (PostgreSQL), Vitest

**Spec:** [`docs/superpowers/specs/2026-04-20-coverline-recovery-and-cycle-classification.md`](../specs/2026-04-20-coverline-recovery-and-cycle-classification.md)

**Depends on prior engine implementation:** [`docs/superpowers/specs/2026-04-14-sensiplan-thermal-shift-engine-design.md`](../specs/2026-04-14-sensiplan-thermal-shift-engine-design.md) and [`docs/superpowers/plans/2026-04-14-sensiplan-thermal-shift-engine.md`](./2026-04-14-sensiplan-thermal-shift-engine.md) (assumed complete)

---

## File Structure

### New files to create

```
app/src/cycle-tracking/interpretation/
  dataFingerprint.ts                — computeCycleDataFingerprint(days): stable hash
  __tests__/
    dataFingerprint.test.ts
    coverlineRecovery.test.ts       — DISMISSED state transitions, auto-recovery
    classificationDecisions.test.ts — guards for mark ops (active-cycle 400, CONFIRMED/ADJUSTED 409, engine gate 409, mutual-exclusivity of marks)
  components/
    NoShiftCard.tsx                 — Inactive cycle, engine found no shift
    AnovulatoryCard.tsx             — Cycle marked anovulatory
    UninterpretableCard.tsx         — Cycle marked unreliable
    DismissedCard.tsx               — Dismissed state with Re-evaluate and mark buttons
    InfoCard.tsx                    — Active cycle, no_shift_detected + day ≥ 7
    CrossCycleAnovulatoryBanner.tsx — Banner on new cycle when prior cycle unconfirmed
    CycleBadge.tsx                  — [Anovulatory] / [Unreliable data] pill
app/src/cycle-tracking/
  classificationDecisions.ts        — Pure decision functions (decideMarkAnovulatory, decideMarkUninterpretable) — all guard logic, fully testable without Wasp
  cycleClassificationOperations.ts  — Thin Wasp-op shells that fetch, call decision, translate to HttpError, perform DB writes
```

### Files to modify

```
app/schema.prisma                   — Add fields to Cycle and CycleInterpretation
app/main.wasp                       — Declare new query + actions
app/src/cycle-tracking/interpretation/interpretationOperations.ts
                                    — Add cycle-mark guard, fingerprint logic, update DISMISSED branches, dismiss/resolveReview accept fingerprint
app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts
                                    — Compute fingerprint, pass to upsert/dismiss/resolveReview, skip engine when cycle marked, new action wrappers (reEvaluate, markAnovulatory, markUninterpretable, unmark), reset lastPersistedRef after row-deleting actions
app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
                                    — Route to new cards based on cycle marks and engine result
app/src/cycle-tracking/CycleChartPage.tsx
                                    — Render CrossCycleAnovulatoryBanner, CycleBadge in header, hide coverline annotation when marked
```

### Files that must NOT change

```
app/src/cycle-tracking/interpretation/sensiplan/*
  — The engine itself is unchanged. It is imported from the server-side cycleClassificationOperations.ts for the mark gate.
```

---

## Task 1: Prisma schema — add classification and fingerprint fields

**Spec reference:** §4.1, §7.2, §11

**Files:**
- Modify: `app/schema.prisma`

- [ ] **Step 1: Add fields to `Cycle` and `CycleInterpretation`**

Edit `app/schema.prisma`:

```prisma
model Cycle {
  // ... existing fields
  markedAnovulatoryAt       DateTime?
  markedUninterpretableAt   DateTime?
}

model CycleInterpretation {
  // ... existing fields
  dismissedDataFingerprint  String?
}
```

All three fields are nullable — no backfill required. Existing rows are naturally "unmarked" (null). Existing DISMISSED rows have `dismissedDataFingerprint = null`, which is treated as "fingerprint unknown" → auto-recovery will reset them on next engine run. This intentionally unsticks any existing traps (including the reported Cycle 3 scenario).

- [ ] **Step 2: Run migration**

```
cd app && wasp db migrate-dev --name add_cycle_classification_and_fingerprint
```

- [ ] **Step 3: Verify migration applied**

Check that `prisma migrate status` shows the migration applied cleanly and that `Cycle.markedAnovulatoryAt`, `Cycle.markedUninterpretableAt`, and `CycleInterpretation.dismissedDataFingerprint` exist in the generated client types.

---

## Task 2: Data fingerprint module + tests

**Spec reference:** §7.1, §7.3, §12.1

**Files:**
- Create: `app/src/cycle-tracking/interpretation/dataFingerprint.ts`
- Create: `app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts`

- [ ] **Step 1: Create the fingerprint module**

```typescript
// app/src/cycle-tracking/interpretation/dataFingerprint.ts
import type { CycleDayInput } from './types';

/**
 * Compute a stable fingerprint of cycle data that affects thermal shift
 * evaluation. Two cycles with identical fingerprints should produce identical
 * engine results.
 *
 * Contributing fields: dayNumber, bbt (to 2dp), excludeFromInterpretation,
 * disturbanceFactors (sorted), travelTimeDiff.
 *
 * Excluded from fingerprint: intercourse, cervical observations, OPK, menstrual
 * flow — these do not affect thermal shift interpretation.
 */
export function computeCycleDataFingerprint(days: CycleDayInput[]): string {
  const normalized = days
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => ({
      n: d.dayNumber,
      t: d.bbt !== null ? Number(d.bbt.toFixed(2)) : null,
      x: d.excludeFromInterpretation ? 1 : 0,
      f: [...d.disturbanceFactors].sort(),
      v: d.travelTimeDiff,
    }));
  // Simple non-cryptographic hash — we just need a stable short identifier
  return djb2(JSON.stringify(normalized));
}

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0; // force to 32-bit unsigned
  }
  return hash.toString(36);
}
```

We use a simple djb2 hash rather than SHA-1 to avoid pulling in a crypto dependency. Collisions are acceptable — a collision just means a false "data unchanged" signal, which keeps DISMISSED stable (the same outcome as today's no-op).

- [ ] **Step 2: Create test file**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts
import { describe, it, expect } from 'vitest';
import { computeCycleDataFingerprint } from '../dataFingerprint';
import type { CycleDayInput } from '../types';

function day(n: number, bbt: number | null, overrides: Partial<CycleDayInput> = {}): CycleDayInput {
  return {
    dayNumber: n,
    bbt,
    bbtTime: null,
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
    ...overrides,
  };
}

describe('computeCycleDataFingerprint', () => {
  it('returns the same hash for identical inputs', () => {
    const a = [day(1, 97.3), day(2, 97.4), day(3, 97.2)];
    const b = [day(1, 97.3), day(2, 97.4), day(3, 97.2)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('returns the same hash regardless of input order', () => {
    const a = [day(1, 97.3), day(2, 97.4), day(3, 97.2)];
    const b = [day(3, 97.2), day(1, 97.3), day(2, 97.4)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when a temperature changes', () => {
    const a = [day(1, 97.3)];
    const b = [day(1, 97.4)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('ignores floating-point noise beyond 2 decimal places', () => {
    const a = [day(1, 97.30)];
    const b = [day(1, 97.30000000001)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when an exclusion flag changes', () => {
    const a = [day(1, 97.3, { excludeFromInterpretation: false })];
    const b = [day(1, 97.3, { excludeFromInterpretation: true })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when disturbance factors change', () => {
    const a = [day(1, 97.3, { disturbanceFactors: ['ILLNESS_FEVER'] })];
    const b = [day(1, 97.3, { disturbanceFactors: ['POOR_SLEEP'] })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('is order-insensitive for disturbance factors', () => {
    const a = [day(1, 97.3, { disturbanceFactors: ['ILLNESS_FEVER', 'POOR_SLEEP'] })];
    const b = [day(1, 97.3, { disturbanceFactors: ['POOR_SLEEP', 'ILLNESS_FEVER'] })];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when travelTimeDiff changes', () => {
    const a = [day(1, 97.3, { travelTimeDiff: null })];
    const b = [day(1, 97.3, { travelTimeDiff: 120 })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('treats null bbt differently from 0', () => {
    const a = [day(1, null)];
    const b = [day(1, 0)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when a day is added', () => {
    const a = [day(1, 97.3)];
    const b = [day(1, 97.3), day(2, 97.4)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces non-empty string for empty input', () => {
    expect(computeCycleDataFingerprint([])).toMatch(/^[a-z0-9]+$/);
  });
});
```

- [ ] **Step 3: Run tests and verify all pass**

```
cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/dataFingerprint.test.ts
```

---

## Task 3: Update `upsertCycleInterpretation` — fingerprint logic + cycle-mark guard

**Spec reference:** §6.3, §6.5, §11

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/interpretationOperations.ts`

- [ ] **Step 1: Update the UpsertInput type**

Add `dataFingerprint: string` to the `UpsertInput` type:

```typescript
type UpsertInput = {
  cycleId: string;
  type: 'THERMAL_SHIFT';
  engineResult: any;
  postShiftMonitoring?: any;
  pendingNudges?: any;
  dataFingerprint: string;  // NEW — required for DISMISSED auto-recovery
};
```

- [ ] **Step 2: Add cycle-mark guard at the top of `upsertCycleInterpretation`**

Immediately after the ownership check and before reading the existing interpretation, add:

```typescript
// If the cycle is classified (anovulatory or uninterpretable), the engine
// result is irrelevant. Defensive cleanup: delete any orphan interpretation row.
if (cycle.markedAnovulatoryAt || cycle.markedUninterpretableAt) {
  const existing = await context.entities.CycleInterpretation.findUnique({
    where: { cycleId_type: { cycleId: args.cycleId, type: args.type } },
  });
  if (existing) {
    await context.entities.CycleInterpretation.delete({ where: { id: existing.id } });
  }
  return null;
}
```

- [ ] **Step 3: Update the DISMISSED branch**

Replace the existing DISMISSED branch (which had same-shift-day = no-op and none = no-op) with fingerprint-aware logic:

```typescript
case 'DISMISSED': {
  const oldEngineResult = existing.engineResult as any;
  const dismissedDay = existing.dismissedShiftDay ?? (oldEngineResult?.shiftDay ?? null);
  const fingerprintChanged = existing.dismissedDataFingerprint !== args.dataFingerprint;

  // If the engine found a shift on a DIFFERENT day than the one the user rejected
  // → replace with new SUGGESTED (preserves existing behavior)
  if (
    args.engineResult?.status !== 'none' &&
    dismissedDay !== null &&
    args.engineResult?.shiftDay !== dismissedDay
  ) {
    return context.entities.CycleInterpretation.update({
      where: { id: existing.id },
      data: {
        state: 'SUGGESTED',
        engineResult: args.engineResult,
        userOverrides: Prisma.DbNull,
        dismissedShiftDay: null,
        dismissedDataFingerprint: null,
        needsReview: false,
        reviewReason: null,
        previousEngineResult: Prisma.DbNull,
        postShiftMonitoring: args.postShiftMonitoring ?? Prisma.DbNull,
        pendingNudges: args.pendingNudges ?? Prisma.DbNull,
      },
    });
  }

  // Same shift day or none result — check fingerprint
  if (fingerprintChanged && args.engineResult?.status !== 'none') {
    // Data has changed AND engine still detects a shift on the same day
    // → reset to SUGGESTED (auto-recovery)
    return context.entities.CycleInterpretation.update({
      where: { id: existing.id },
      data: {
        state: 'SUGGESTED',
        engineResult: args.engineResult,
        userOverrides: Prisma.DbNull,
        dismissedShiftDay: null,
        dismissedDataFingerprint: null,
        needsReview: false,
        reviewReason: null,
        previousEngineResult: Prisma.DbNull,
        postShiftMonitoring: args.postShiftMonitoring ?? Prisma.DbNull,
        pendingNudges: args.pendingNudges ?? Prisma.DbNull,
      },
    });
  }

  // Either fingerprint unchanged OR engine still returns none — respect the
  // dismissal but keep engineResult fresh so Re-evaluate/UI have current data
  return context.entities.CycleInterpretation.update({
    where: { id: existing.id },
    data: {
      engineResult: args.engineResult,
      // postShiftMonitoring and pendingNudges are not persisted for DISMISSED
      // since there's no active coverline; leave them unchanged
    },
  });
}
```

- [ ] **Step 4: Update `dismissInterpretation` to accept and store fingerprint**

Update the input type and the data fields:

```typescript
export const dismissInterpretation: DismissInterpretation<
  IdInput & { dismissedShiftDay: number; dataFingerprint: string },
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');
  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);
  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'DISMISSED',
      dismissedShiftDay: args.dismissedShiftDay,
      dismissedDataFingerprint: args.dataFingerprint,
      userOverrides: Prisma.DbNull,
    },
  });
};
```

- [ ] **Step 5: Update `resolveReview` (reject branch) to accept and store fingerprint**

Update the input type:

```typescript
type ResolveReviewInput = {
  interpretationId: string;
  action: 'keep_mine' | 'accept_new' | 'reject';
  latestEngineResult: any;
  keptValues?: { shiftDay: number; coverlineTemp: number };
  dismissedShiftDay?: number;
  dataFingerprint: string;  // NEW
};
```

In the `case 'reject':` branch, add `dismissedDataFingerprint: args.dataFingerprint` to the update data.

- [ ] **Step 6: Verify existing tests still compile**

```
cd app && npx tsc --noEmit
```

No runtime test changes yet — we'll add targeted tests in Task 4.

---

## Task 4: Coverline recovery tests (server-side branches)

**Spec reference:** §12.2

**Files:**
- Create: `app/src/cycle-tracking/interpretation/__tests__/coverlineRecovery.test.ts`

Since `interpretationOperations.ts` pulls in Wasp's env schema, we test the pure DISMISSED-branch logic by extracting a small pure helper. Extract the fingerprint decision into a testable function:

- [ ] **Step 1: Extract the DISMISSED decision helper**

In `interpretationOperations.ts`, extract the core DISMISSED decision into a pure helper (preserving the existing import boundary so tests don't need Wasp env):

Create a new file `app/src/cycle-tracking/interpretation/dismissedDecision.ts`:

```typescript
/**
 * Given an existing DISMISSED interpretation and a new engine result,
 * decide what the next persistence action should be. Pure function — no DB.
 */
export type DismissedAction =
  | { kind: 'reset_to_suggested' }  // Data changed OR different shift day
  | { kind: 'refresh_engine_result' };  // Stay DISMISSED, keep engineResult current

export function decideDismissedAction(
  existingEngineResult: any,
  dismissedShiftDay: number | null,
  existingFingerprint: string | null,
  incomingEngineResult: any,
  incomingFingerprint: string,
): DismissedAction {
  const oldShiftDay = dismissedShiftDay ?? (existingEngineResult?.shiftDay ?? null);

  // Different shift day always resets (existing logic)
  if (
    incomingEngineResult?.status !== 'none' &&
    oldShiftDay !== null &&
    incomingEngineResult?.shiftDay !== oldShiftDay
  ) {
    return { kind: 'reset_to_suggested' };
  }

  // Same shift day + fingerprint changed + engine still finds a shift → auto-recover
  const fingerprintChanged = existingFingerprint !== incomingFingerprint;
  if (fingerprintChanged && incomingEngineResult?.status !== 'none') {
    return { kind: 'reset_to_suggested' };
  }

  return { kind: 'refresh_engine_result' };
}
```

Then import and use it in `upsertCycleInterpretation`'s DISMISSED branch.

- [ ] **Step 2: Create the test file**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/coverlineRecovery.test.ts
import { describe, it, expect } from 'vitest';
import { decideDismissedAction } from '../dismissedDecision';

describe('decideDismissedAction', () => {
  const confirmedResult = { status: 'confirmed', shiftDay: 15, coverlineTemp: 36.3 };
  const noneResult = { status: 'none', reason: 'no_shift_detected' };

  it('stays dismissed when fingerprint unchanged and engine finds same shift', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', confirmedResult, 'abc');
    expect(action.kind).toBe('refresh_engine_result');
  });

  it('resets to SUGGESTED when fingerprint changed and engine finds same shift', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', confirmedResult, 'xyz');
    expect(action.kind).toBe('reset_to_suggested');
  });

  it('stays dismissed when fingerprint changed but engine returns none', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', noneResult, 'xyz');
    expect(action.kind).toBe('refresh_engine_result');
  });

  it('stays dismissed when fingerprint unchanged and engine returns none', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', noneResult, 'abc');
    expect(action.kind).toBe('refresh_engine_result');
  });

  it('resets to SUGGESTED when engine finds a DIFFERENT shift day', () => {
    const newShift = { status: 'confirmed', shiftDay: 17, coverlineTemp: 36.4 };
    const action = decideDismissedAction(confirmedResult, 15, 'abc', newShift, 'abc');
    expect(action.kind).toBe('reset_to_suggested');
  });

  it('existing fingerprint null (legacy row) + new fingerprint present → treats as changed', () => {
    const action = decideDismissedAction(confirmedResult, 15, null, confirmedResult, 'abc');
    expect(action.kind).toBe('reset_to_suggested');
  });

  it('prefers engineResult.shiftDay when dismissedShiftDay is null', () => {
    const action = decideDismissedAction(confirmedResult, null, 'abc', confirmedResult, 'abc');
    expect(action.kind).toBe('refresh_engine_result');
  });
});
```

- [ ] **Step 3: Run tests and verify all pass**

```
cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/coverlineRecovery.test.ts
```

---

## Task 5: Cycle classification operations (server-side)

**Spec reference:** §6.1, §6.2, §10.1

**Files:**
- Create: `app/src/cycle-tracking/classificationDecisions.ts`
- Create: `app/src/cycle-tracking/cycleClassificationOperations.ts`
- Modify: `app/main.wasp`

- [ ] **Step 1: Create the pure decisions module**

This module owns ALL guard logic for the mark operations: active-cycle check, existing-state check, server-side engine re-evaluation, and the output data shape (what to update, what to delete). It has no Wasp or Prisma dependencies, so every branch is unit-testable (see Task 6).

```typescript
// app/src/cycle-tracking/classificationDecisions.ts
import { runInterpretation } from './interpretation/sensiplan';
import type { CycleDayInput } from './interpretation/types';

type InterpretationSummary = { id: string; state: 'SUGGESTED' | 'CONFIRMED' | 'ADJUSTED' | 'DISMISSED' };

type MarkAnovulatoryInput = {
  cycleIsActive: boolean;
  existingInterpretation: InterpretationSummary | null;
  days: CycleDayInput[];
  now: Date;
};

type MarkUninterpretableInput = {
  existingInterpretation: InterpretationSummary | null;
  days: CycleDayInput[];
  now: Date;
};

export type MarkDecision =
  | {
      kind: 'reject';
      status: 400 | 409;
      detail: string;
    }
  | {
      kind: 'proceed';
      cycleUpdate: {
        markedAnovulatoryAt: Date | null;
        markedUninterpretableAt: Date | null;
      };
      deleteInterpretationId: string | null;
    };

const ENGINE_GATE_DETAIL =
  'Cycle cannot be classified: the engine has not concluded no_shift_detected. ' +
  'Re-evaluate after adjusting exclusions, or Reject the current suggestion first.';

const ACTIVE_CYCLE_DETAIL =
  'Cannot mark an active cycle as anovulatory. Anovulation can only be determined ' +
  'retrospectively after the cycle ends.';

const CONFIRMED_ADJUSTED_DETAIL =
  'Cycle has a confirmed or adjusted interpretation. Reject it first before classifying.';

function engineSaysNoShiftDetected(days: CycleDayInput[]): boolean {
  const result = runInterpretation(days);
  const ts = result.thermalShift;
  return ts.status === 'none' && ts.reason === 'no_shift_detected';
}

function isConfirmedOrAdjusted(i: InterpretationSummary | null): boolean {
  return !!i && (i.state === 'CONFIRMED' || i.state === 'ADJUSTED');
}

export function decideMarkAnovulatory(input: MarkAnovulatoryInput): MarkDecision {
  if (input.cycleIsActive) {
    return { kind: 'reject', status: 400, detail: ACTIVE_CYCLE_DETAIL };
  }
  if (isConfirmedOrAdjusted(input.existingInterpretation)) {
    return { kind: 'reject', status: 409, detail: CONFIRMED_ADJUSTED_DETAIL };
  }
  if (!engineSaysNoShiftDetected(input.days)) {
    return { kind: 'reject', status: 409, detail: ENGINE_GATE_DETAIL };
  }
  return {
    kind: 'proceed',
    cycleUpdate: {
      markedAnovulatoryAt: input.now,
      markedUninterpretableAt: null, // mutual exclusivity: clear the other mark
    },
    deleteInterpretationId: input.existingInterpretation?.id ?? null,
  };
}

export function decideMarkUninterpretable(input: MarkUninterpretableInput): MarkDecision {
  if (isConfirmedOrAdjusted(input.existingInterpretation)) {
    return { kind: 'reject', status: 409, detail: CONFIRMED_ADJUSTED_DETAIL };
  }
  if (!engineSaysNoShiftDetected(input.days)) {
    return { kind: 'reject', status: 409, detail: ENGINE_GATE_DETAIL };
  }
  return {
    kind: 'proceed',
    cycleUpdate: {
      markedUninterpretableAt: input.now,
      markedAnovulatoryAt: null, // mutual exclusivity
    },
    deleteInterpretationId: input.existingInterpretation?.id ?? null,
  };
}
```

**Why this structure:**
- Every rejection case has a concrete test target (no "trivially correct" hand-waving).
- The mutual-exclusivity invariant (one mark clears the other) is encoded in the decision output, so it's verified by tests, not relying on the caller to remember.
- `deleteInterpretationId` is explicitly null-or-id in the output — the Wasp shell just executes whatever the decision says.
- `now` is an input, not `new Date()` internally, so tests can assert exact timestamps.
- The engine gate runs as part of the decision (server-side re-evaluation), keeping the authoritative check alongside the other guards.

- [ ] **Step 2: Create the operations file (thin Wasp shells)**

```typescript
// app/src/cycle-tracking/cycleClassificationOperations.ts
import { HttpError } from 'wasp/server';
import type {
  MarkCycleAnovulatory,
  MarkCycleUninterpretable,
  UnmarkCycleClassification,
  ReEvaluateCycleInterpretation,
} from 'wasp/server/operations';
import type { Cycle } from 'wasp/entities';
import type { CycleDayInput } from './interpretation/types';

type MarkInput = { cycleId: string };

async function getOwnedCycle(cycleId: string, userId: string, entities: any) {
  const cycle = await entities.Cycle.findUnique({
    where: { id: cycleId },
    include: { days: true },
  });
  if (!cycle) throw new HttpError(404, 'Cycle not found');
  if (cycle.userId !== userId) throw new HttpError(403, 'Not authorized');
  return cycle;
}

function daysToInput(rawDays: any[]): CycleDayInput[] {
  return rawDays.map((d) => ({
    dayNumber: d.dayNumber,
    bbt: d.bbt,
    bbtTime: d.bbtTime,
    excludeFromInterpretation: d.excludeFromInterpretation,
    disturbanceFactors: d.disturbanceFactors ?? [],
    travelTimeDiff: d.travelTimeDiff,
  }));
}

// ===== MARK OPERATIONS =====
// Both operations follow a "fetch → decide (pure) → act" pattern.
// The decision logic lives in ./classificationDecisions.ts and is
// fully unit-testable without Wasp. See Task 6.

import { decideMarkAnovulatory, decideMarkUninterpretable } from './classificationDecisions';

export const markCycleAnovulatory: MarkCycleAnovulatory<MarkInput, Cycle> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    const cycle = await getOwnedCycle(args.cycleId, context.user.id, context.entities);
    const existingInterpretation = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: 'THERMAL_SHIFT' } },
    });

    const decision = decideMarkAnovulatory({
      cycleIsActive: cycle.isActive,
      existingInterpretation: existingInterpretation
        ? { id: existingInterpretation.id, state: existingInterpretation.state }
        : null,
      days: daysToInput(cycle.days),
      now: new Date(),
    });

    if (decision.kind === 'reject') {
      throw new HttpError(decision.status, decision.detail);
    }

    if (decision.deleteInterpretationId) {
      await context.entities.CycleInterpretation.delete({
        where: { id: decision.deleteInterpretationId },
      });
    }

    return context.entities.Cycle.update({
      where: { id: args.cycleId },
      data: decision.cycleUpdate,
    });
  };

export const markCycleUninterpretable: MarkCycleUninterpretable<MarkInput, Cycle> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    const cycle = await getOwnedCycle(args.cycleId, context.user.id, context.entities);
    const existingInterpretation = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: 'THERMAL_SHIFT' } },
    });

    const decision = decideMarkUninterpretable({
      existingInterpretation: existingInterpretation
        ? { id: existingInterpretation.id, state: existingInterpretation.state }
        : null,
      days: daysToInput(cycle.days),
      now: new Date(),
    });

    if (decision.kind === 'reject') {
      throw new HttpError(decision.status, decision.detail);
    }

    if (decision.deleteInterpretationId) {
      await context.entities.CycleInterpretation.delete({
        where: { id: decision.deleteInterpretationId },
      });
    }

    return context.entities.Cycle.update({
      where: { id: args.cycleId },
      data: decision.cycleUpdate,
    });
  };

export const unmarkCycleClassification: UnmarkCycleClassification<MarkInput, Cycle> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    await getOwnedCycle(args.cycleId, context.user.id, context.entities);

    return context.entities.Cycle.update({
      where: { id: args.cycleId },
      data: {
        markedAnovulatoryAt: null,
        markedUninterpretableAt: null,
      },
    });
  };

// ===== RE-EVALUATE =====

type ReEvalInput = { cycleId: string; type: 'THERMAL_SHIFT' };

export const reEvaluateCycleInterpretation: ReEvaluateCycleInterpretation<ReEvalInput, void> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    const cycle = await context.entities.Cycle.findUnique({
      where: { id: args.cycleId },
    });
    if (!cycle) throw new HttpError(404, 'Cycle not found');
    if (cycle.userId !== context.user.id) throw new HttpError(403, 'Not authorized');

    const existing = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: args.type } },
    });
    if (existing) {
      await context.entities.CycleInterpretation.delete({ where: { id: existing.id } });
    }
  };
```

- [ ] **Step 3: Declare operations in `main.wasp`**

After the existing interpretation actions, add:

```wasp
action markCycleAnovulatory {
  fn: import { markCycleAnovulatory } from "@src/cycle-tracking/cycleClassificationOperations",
  entities: [Cycle, CycleInterpretation, CycleDay]
}

action markCycleUninterpretable {
  fn: import { markCycleUninterpretable } from "@src/cycle-tracking/cycleClassificationOperations",
  entities: [Cycle, CycleInterpretation, CycleDay]
}

action unmarkCycleClassification {
  fn: import { unmarkCycleClassification } from "@src/cycle-tracking/cycleClassificationOperations",
  entities: [Cycle]
}

action reEvaluateCycleInterpretation {
  fn: import { reEvaluateCycleInterpretation } from "@src/cycle-tracking/cycleClassificationOperations",
  entities: [Cycle, CycleInterpretation]
}
```

- [ ] **Step 4: Run `wasp start` to verify generated types resolve**

The Wasp build must succeed with all four new actions. Stop the server once generation succeeds.

---

## Task 6: Classification decision tests

**Spec reference:** §12.2, §6.2 "Summary of acceptable starting states"

**Files:**
- Create: `app/src/cycle-tracking/interpretation/__tests__/classificationDecisions.test.ts`

These tests cover the actual guard logic that lives in `classificationDecisions.ts`: active-cycle rejection, CONFIRMED/ADJUSTED rejection, engine-result gating (all four engine outcomes), mutual exclusivity of the two mark types, and correct deletion behavior. The Wasp-shell operations in `cycleClassificationOperations.ts` are thin IO wrappers that just execute whatever the decision returns, so covering the decisions covers the behavior.

The `runInterpretation` engine is pure and has its own test suite — we don't re-test it here. We test the DECISION that consumes it.

- [ ] **Step 1: Create the test file**

```typescript
// app/src/cycle-tracking/interpretation/__tests__/classificationDecisions.test.ts
import { describe, it, expect } from 'vitest';
import {
  decideMarkAnovulatory,
  decideMarkUninterpretable,
} from '../../classificationDecisions';
import type { CycleDayInput } from '../types';

// ---- Data-shape helpers ----

function day(n: number, bbtF: number | null, opts: Partial<CycleDayInput> = {}): CycleDayInput {
  return {
    dayNumber: n,
    bbt: bbtF,
    bbtTime: null,
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9) / 5 + 32; }

/** Days that force engine → none + no_shift_detected (zigzag, no biphasic). */
function daysWithNoShift(): CycleDayInput[] {
  const d: CycleDayInput[] = [];
  for (let i = 1; i <= 24; i++) {
    d.push(day(i, cToF(36.3 + (i % 2 === 0 ? 0.05 : -0.05))));
  }
  return d;
}

/** Days that force engine → none + insufficient_data (< 6 valid temps). */
function daysWithInsufficientData(): CycleDayInput[] {
  return [day(1, cToF(36.3)), day(2, cToF(36.2)), day(3, cToF(36.3))];
}

/** Days that force engine → confirmed (clear biphasic). */
function daysWithConfirmedShift(): CycleDayInput[] {
  const d: CycleDayInput[] = [];
  for (let i = 1; i <= 6; i++) d.push(day(i, cToF(36.2)));
  d.push(day(7, cToF(36.55)));
  d.push(day(8, cToF(36.55)));
  d.push(day(9, cToF(36.50)));
  return d;
}

/** Days that force engine → pending (candidate, no confirmation). */
function daysWithPendingShift(): CycleDayInput[] {
  const d: CycleDayInput[] = [];
  for (let i = 1; i <= 6; i++) d.push(day(i, cToF(36.2)));
  d.push(day(7, cToF(36.55)));
  return d;
}

const NOW = new Date('2026-04-20T12:00:00Z');

// ============================================================
// decideMarkAnovulatory
// ============================================================

describe('decideMarkAnovulatory', () => {
  // ---- Rejection: active cycle (Sensiplan strict) ----

  it('rejects 400 when cycle is active, regardless of engine result', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: true,
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') {
      expect(decision.status).toBe(400);
      expect(decision.detail).toMatch(/anovulation.*retrospectively/i);
    }
  });

  // ---- Rejection: CONFIRMED/ADJUSTED state ----

  it('rejects 409 when existing interpretation is CONFIRMED', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'CONFIRMED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when existing interpretation is ADJUSTED', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'ADJUSTED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  // ---- Rejection: engine gate ----

  it('rejects 409 when engine returns confirmed (viable shift)', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithConfirmedShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns pending', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithPendingShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns none + insufficient_data', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: null,
      days: daysWithInsufficientData(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  // ---- Acceptance: happy paths ----

  it('accepts when inactive + no existing row + engine says no_shift_detected', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedAnovulatoryAt).toEqual(NOW);
      expect(decision.cycleUpdate.markedUninterpretableAt).toBeNull();
      expect(decision.deleteInterpretationId).toBeNull();
    }
  });

  it('accepts when inactive + state is DISMISSED + engine says no_shift_detected', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i-dismissed', state: 'DISMISSED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.deleteInterpretationId).toBe('i-dismissed');
    }
  });

  it('accepts when inactive + state is SUGGESTED (engine-none) + engine says no_shift_detected', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i-sugg', state: 'SUGGESTED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.deleteInterpretationId).toBe('i-sugg');
    }
  });

  // ---- Mutual exclusivity ----

  it('always sets markedUninterpretableAt to null on proceed (mutual exclusivity)', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedUninterpretableAt).toBeNull();
    } else {
      throw new Error('expected proceed');
    }
  });
});

// ============================================================
// decideMarkUninterpretable
// ============================================================

describe('decideMarkUninterpretable', () => {
  it('accepts on ACTIVE cycle + engine says no_shift_detected (no active-cycle guard)', () => {
    // Note: unlike anovulatory, uninterpretable is allowed on active cycles per §4.3
    // The decision itself takes no cycleIsActive arg — that guard doesn't exist here.
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
  });

  it('rejects 409 when existing interpretation is CONFIRMED', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'CONFIRMED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when existing interpretation is ADJUSTED', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'ADJUSTED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns confirmed (closes dismiss→mark bypass)', () => {
    // Explicit regression test: DISMISSED cycle whose latest engine result
    // is still a viable confirmed shift should be blocked.
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithConfirmedShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns pending (closes bypass for pending shifts)', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithPendingShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns insufficient_data (active cycle, no row)', () => {
    // Regression: the original bypass path — active cycle with too little data
    // shouldn't be marked unreliable because the engine hasn't actually had a chance.
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithInsufficientData(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('accepts + proposes deleting existing DISMISSED row', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i-dismiss', state: 'DISMISSED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedUninterpretableAt).toEqual(NOW);
      expect(decision.cycleUpdate.markedAnovulatoryAt).toBeNull();
      expect(decision.deleteInterpretationId).toBe('i-dismiss');
    }
  });

  it('accepts + no delete when no existing row', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.deleteInterpretationId).toBeNull();
    }
  });

  // ---- Mutual exclusivity ----

  it('always sets markedAnovulatoryAt to null on proceed (mutual exclusivity)', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedAnovulatoryAt).toBeNull();
    } else {
      throw new Error('expected proceed');
    }
  });
});
```

**Coverage summary — what each describe block verifies:**

| Operation / rule | Covered by test |
|---|---|
| Active-cycle 400 (anovulatory) | ✅ "rejects 400 when cycle is active" |
| CONFIRMED 409 (both ops) | ✅ two tests, one per op |
| ADJUSTED 409 (both ops) | ✅ two tests, one per op |
| Engine gate: confirmed → 409 (both ops) | ✅ |
| Engine gate: pending → 409 (both ops) | ✅ |
| Engine gate: insufficient_data → 409 (both ops) | ✅ |
| Engine gate: no_shift_detected → proceed (both ops) | ✅ |
| DISMISSED→mark bypass closed (explicitly) | ✅ "closes dismiss→mark bypass" test |
| Deletion of existing interpretation row on proceed | ✅ |
| Mutual exclusivity: anovulatory clears uninterpretable | ✅ |
| Mutual exclusivity: uninterpretable clears anovulatory | ✅ |
| Timestamp is exactly `now` | ✅ (via `toEqual(NOW)`) |
| No delete when no existing row | ✅ |
| Uninterpretable allowed on active cycle | ✅ |

**What is NOT covered here and why:**

- **Ownership check** — lives in the Wasp shell (`getOwnedCycle`), not in the pure decision. It's a straightforward `cycle.userId === context.user.id` check and is consistent with the existing `getOwnedInterpretation` pattern already used throughout `interpretationOperations.ts`. Verified via E2E in Task 15.
- **Unmark behavior** — trivial (set both timestamps to null, no guards), covered via E2E in Task 15.
- **Re-evaluate behavior** — just "delete the row", covered via E2E in Task 15.
- **Actual Prisma writes** — the shell passes the decision output directly to `update` / `delete`. The decision output shape is fully tested above. Covered end-to-end in Task 15.

- [ ] **Step 2: Run tests and verify all pass**

```
cd app && npx vitest run src/cycle-tracking/interpretation/__tests__/classificationDecisions.test.ts
```

Expected: ~20 tests, all green.

---

## Task 7: Update `useInterpretation` hook — fingerprint + action wrappers + dedupe reset

**Spec reference:** §8.1, §8.1.1, §8.2

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/hooks/useInterpretation.ts`

- [ ] **Step 1: Accept cycle object (for isActive, marks) and compute fingerprint**

Update the hook signature so it has access to the cycle's classification fields:

```typescript
type UseInterpretationArgs = {
  cycleId: string | undefined;
  days: CycleDayInput[];
  cycleIsActive: boolean;
  markedAnovulatoryAt: Date | null;
  markedUninterpretableAt: Date | null;
};

export function useInterpretation(args: UseInterpretationArgs): UseInterpretationReturn {
  const { cycleId, days, cycleIsActive, markedAnovulatoryAt, markedUninterpretableAt } = args;
  // ... rest of hook
}
```

(Callers will pass these from the existing cycle query — see Task 11.)

Import and compute the fingerprint:

```typescript
import { computeCycleDataFingerprint } from '../dataFingerprint';

const dataFingerprint = useMemo(() => computeCycleDataFingerprint(days), [days]);
```

- [ ] **Step 2: Skip engine when cycle is marked**

Wrap the `runInterpretation` call. Also update the return type to reflect that `engineResult` is nullable — callers (see Task 13) must guard on null before passing to `PropositionCard`.

```typescript
type UseInterpretationReturn = {
  engineResult: InterpretationResult | null;  // null when isMarked OR days.length === 0
  interpretation: CycleInterpretation | null;
  postShiftMonitoring: PostShiftMonitoring | null;
  isLoading: boolean;
  keepWatchingDismissed: boolean;
  onKeepWatching: () => void;
  actions: {
    // existing +
    reEvaluate: () => Promise<void>;
    markAnovulatory: () => Promise<void>;
    markUninterpretable: () => Promise<void>;
    unmarkClassification: () => Promise<void>;
  };
};

const isMarked = !!markedAnovulatoryAt || !!markedUninterpretableAt;

const engineResult = useMemo(() => {
  if (days.length === 0 || isMarked) return null;
  return runInterpretation(days);
}, [days, isMarked]);
```

Also skip the persistence effect:

```typescript
useEffect(() => {
  if (!cycleId || !engineResult || isMarked) return;
  // ... rest of effect
}, [cycleId, engineResult, postShiftMonitoring, isMarked, dataFingerprint]);
```

- [ ] **Step 3: Pass fingerprint to upsert**

Inside the persistence effect, include `dataFingerprint: dataFingerprint`:

```typescript
await upsertCycleInterpretation({
  cycleId,
  type: 'THERMAL_SHIFT',
  engineResult: engineResult.thermalShift,
  postShiftMonitoring: postShiftMonitoring ?? undefined,
  pendingNudges: engineResult.nudges,
  dataFingerprint,
});
```

Also update the dedupe key to include the fingerprint so data changes always retry:

```typescript
const payload = {
  ts: engineResult.thermalShift,
  psm: postShiftMonitoring,
  n: engineResult.nudges,
  fp: dataFingerprint,  // include so fingerprint changes force a new write
};
```

- [ ] **Step 4: Pass fingerprint to dismiss and resolveReview (reject)**

Update the `dismiss` action to pass `dataFingerprint`:

```typescript
const dismiss = useCallback(async () => {
  if (!interpretation || !engineResult) return;
  // ... existing shiftDay computation
  const { dismissInterpretation } = await import('wasp/client/operations');
  await dismissInterpretation({
    interpretationId: interpretation.id,
    dismissedShiftDay: shiftDay,
    dataFingerprint,
  });
}, [interpretation, engineResult, dataFingerprint]);
```

Update `resolveReviewAction` similarly — pass `dataFingerprint` to the operation call.

- [ ] **Step 5: Add action wrappers for mark/unmark/re-evaluate with dedupe reset**

Add new callbacks and include them in the returned `actions` object:

```typescript
const reEvaluate = useCallback(async () => {
  if (!cycleId) return;
  const { reEvaluateCycleInterpretation } = await import('wasp/client/operations');
  await reEvaluateCycleInterpretation({ cycleId, type: 'THERMAL_SHIFT' });
  lastPersistedRef.current = null;  // force next persistence to re-run
}, [cycleId]);

const markAnovulatory = useCallback(async () => {
  if (!cycleId) return;
  const { markCycleAnovulatory } = await import('wasp/client/operations');
  await markCycleAnovulatory({ cycleId });
  lastPersistedRef.current = null;
}, [cycleId]);

const markUninterpretable = useCallback(async () => {
  if (!cycleId) return;
  const { markCycleUninterpretable } = await import('wasp/client/operations');
  await markCycleUninterpretable({ cycleId });
  lastPersistedRef.current = null;
}, [cycleId]);

const unmarkClassification = useCallback(async () => {
  if (!cycleId) return;
  const { unmarkCycleClassification } = await import('wasp/client/operations');
  await unmarkCycleClassification({ cycleId });
  lastPersistedRef.current = null;
}, [cycleId]);
```

Extend the return type and the returned `actions`:

```typescript
actions: {
  confirm,
  adjust,
  dismiss,
  resolveReview: resolveReviewAction,
  resolveFalseRise,
  resolveNudge: resolveNudgeAction,
  reEvaluate,            // NEW
  markAnovulatory,       // NEW
  markUninterpretable,   // NEW
  unmarkClassification,  // NEW
}
```

- [ ] **Step 6: Verify the hook type-checks**

```
cd app && npx tsc --noEmit
```

---

## Task 8: New card components

**Spec reference:** §5.3

**Files:**
- Create: `app/src/cycle-tracking/interpretation/components/NoShiftCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/AnovulatoryCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/UninterpretableCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/DismissedCard.tsx`
- Create: `app/src/cycle-tracking/interpretation/components/InfoCard.tsx`

Each card is a thin presentational component. Wire action buttons to props.

- [ ] **Step 1: NoShiftCard**

```tsx
// NoShiftCard.tsx
// Shown when: cycle is inactive AND engine returned no_shift_detected AND not marked AND not DISMISSED
type Props = {
  onMarkAnovulatory: () => void;
  onMarkUninterpretable: () => void;
};

export function NoShiftCard({ onMarkAnovulatory, onMarkUninterpretable }: Props) {
  return (
    <div className={cardBase}>
      <h3 className={cardTitle}>No thermal shift detected</h3>
      <p className={cardBody}>
        The engine could not identify a biphasic temperature pattern in the available data.
      </p>
      <div className={cardActions}>
        <button className={btnPrimary} onClick={onMarkAnovulatory}>
          Mark as Anovulatory
        </button>
        <button className={btnSecondary} onClick={onMarkUninterpretable}>
          Mark Data as Unreliable
        </button>
      </div>
    </div>
  );
}
```

Use the existing `cardStyles.ts` constants.

- [ ] **Step 2: AnovulatoryCard**

```tsx
type Props = { onRemoveMark: () => void };

export function AnovulatoryCard({ onRemoveMark }: Props) {
  return (
    <div className={cardBase}>
      <h3 className={cardTitle}>Cycle marked as anovulatory</h3>
      <p className={cardBody}>
        You marked this cycle as anovulatory. No ovulation occurred — the temperature
        pattern remained monophasic throughout.
      </p>
      <div className={cardActions}>
        <button className={btnSecondary} onClick={onRemoveMark}>Remove Mark</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: UninterpretableCard**

```tsx
type Props = { onRemoveMark: () => void };

export function UninterpretableCard({ onRemoveMark }: Props) {
  return (
    <div className={cardBase}>
      <h3 className={cardTitle}>Data marked as unreliable</h3>
      <p className={cardBody}>
        You marked this cycle's data as unreliable for interpretation. Too many
        disturbances or exclusions prevent a reliable thermal shift assessment.
      </p>
      <div className={cardActions}>
        <button className={btnSecondary} onClick={onRemoveMark}>Remove Mark</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: DismissedCard**

Both mark buttons require the engine's current result to be `no_shift_detected`:

```tsx
import type { ThermalShiftResult } from '../types';

type Props = {
  engineResult: ThermalShiftResult;
  cycleIsActive: boolean;
  onReEvaluate: () => void;
  onMarkAnovulatory: () => void;
  onMarkUninterpretable: () => void;
};

export function DismissedCard({
  engineResult,
  cycleIsActive,
  onReEvaluate,
  onMarkAnovulatory,
  onMarkUninterpretable,
}: Props) {
  const engineIsNoShiftDetected =
    engineResult.status === 'none' && engineResult.reason === 'no_shift_detected';

  const showMarkAnovulatory = !cycleIsActive && engineIsNoShiftDetected;
  const showMarkUninterpretable = engineIsNoShiftDetected;

  return (
    <div className={cardBase}>
      <p className={cardBody}>Thermal shift suggestion was dismissed.</p>
      <div className={cardActions}>
        <button className={btnPrimary} onClick={onReEvaluate}>Re-evaluate</button>
        {showMarkUninterpretable && (
          <button className={btnSecondary} onClick={onMarkUninterpretable}>
            Mark Data as Unreliable
          </button>
        )}
        {showMarkAnovulatory && (
          <button className={btnSecondary} onClick={onMarkAnovulatory}>
            Mark as Anovulatory
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: InfoCard**

Shown on active cycles when engine returned `no_shift_detected` AND `maxDayNumber >= 7`:

```tsx
type Props = { onMarkUninterpretable: () => void };

export function InfoCard({ onMarkUninterpretable }: Props) {
  return (
    <div className={cardBaseInfo}>
      <h3 className={cardTitle}>No thermal shift detected yet</h3>
      <p className={cardBody}>Continue recording daily temperatures.</p>
      <div className={cardActions}>
        <button className={btnSecondary} onClick={onMarkUninterpretable}>
          Mark Data as Unreliable
        </button>
      </div>
    </div>
  );
}
```

---

## Task 9: CycleBadge component

**Spec reference:** §5.4

**Files:**
- Create: `app/src/cycle-tracking/interpretation/components/CycleBadge.tsx`

- [ ] **Step 1: Create the badge component**

```tsx
// CycleBadge.tsx
type Props = {
  markedAnovulatoryAt: Date | null;
  markedUninterpretableAt: Date | null;
};

export function CycleBadge({ markedAnovulatoryAt, markedUninterpretableAt }: Props) {
  if (markedAnovulatoryAt) {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
        Anovulatory
      </span>
    );
  }
  if (markedUninterpretableAt) {
    return (
      <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
        Unreliable data
      </span>
    );
  }
  return null;
}
```

- [ ] **Step 2: Snapshot-style test (optional but useful)**

A small test ensuring the component renders expected text and class combinations. Skip if no existing precedent for component tests in this codebase.

---

## Task 10: CrossCycleAnovulatoryBanner component

**Spec reference:** §9

**Files:**
- Create: `app/src/cycle-tracking/interpretation/components/CrossCycleAnovulatoryBanner.tsx`

- [ ] **Step 1: Create the component with a session-storage read that stays current with `previousCycle.id`**

Two subtle correctness requirements:

1. **Null-safe on render.** `previousCycle` can be null (first cycle ever, or query still loading). Hooks must run unconditionally.
2. **Reactive to `previousCycle.id` changes.** A single `useState(() => sessionStorage.getItem(...))` initializer runs only once at mount. If `previousCycle` transitions from null to a real cycle (query loads) or from Cycle A to Cycle B (user navigates without remounting), the initial state becomes stale — potentially hiding a banner that was dismissed for a *different* cycle, or showing a banner that was already dismissed for the current one.

We solve this by reading `sessionStorage` directly during render (it's a cheap synchronous lookup) and using `useState` only as a re-render trigger when the user dismisses.

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';

type PreviousCycleSummary = {
  id: string;
  cycleNumber: number;
  isMarked: boolean;
  hasConfirmedShift: boolean;
};

type Props = {
  previousCycle: PreviousCycleSummary | null;
};

const bannerKey = (id: string) => `anovulatory-banner-${id}`;

export function CrossCycleAnovulatoryBanner({ previousCycle }: Props) {
  // `dismissVersion` bumps on dismiss to force a re-render after we update
  // sessionStorage. Reading sessionStorage directly below each render keeps
  // the check current with previousCycle.id (no stale initial state).
  const [, setDismissVersion] = useState(0);

  if (!previousCycle) return null;
  if (previousCycle.isMarked) return null;
  if (previousCycle.hasConfirmedShift) return null;

  // Fresh read per render — never stale for the current previousCycle.id
  const isDismissed = sessionStorage.getItem(bannerKey(previousCycle.id)) === 'true';
  if (isDismissed) return null;

  const onDismiss = () => {
    sessionStorage.setItem(bannerKey(previousCycle.id), 'true');
    setDismissVersion((v) => v + 1);  // re-render; next render's sessionStorage read returns 'true'
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mb-4">
      <p className="text-sm text-amber-900 mb-2">
        Your previous cycle (Cycle {previousCycle.cycleNumber}) ended without a confirmed
        thermal shift. If ovulation didn't occur, consider marking it as anovulatory.
      </p>
      <div className="flex gap-2">
        <Link
          to={`/cycles/${previousCycle.id}/chart`}
          className="text-sm text-amber-900 underline"
        >
          Review Cycle {previousCycle.cycleNumber}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm text-amber-900 underline"
        >
          Dismiss for Now
        </button>
      </div>
    </div>
  );
}
```

**Why not use `useEffect` to reset state on `previousCycle.id` change?** An effect would work, but it introduces a render-then-reset flicker — the first render with the new id would use the old dismissed state before the effect runs. Reading sessionStorage per render avoids the flicker and is simpler. It's also correct under SSR boundaries (if we ever add them), since the check will happen client-side only.

**Route path:** `/cycles/:cycleId/chart` — this is the `CycleChartRoute` declared in `main.wasp` (line 327). The Link's `to` prop uses `` `/cycles/${previousCycle.id}/chart` `` accordingly.

---

## Task 11: Wire query for previous cycle summary

**Spec reference:** §9.1

**Files:**
- Modify: `app/src/cycle-tracking/cycleOperations.ts` (or wherever cycle queries live)
- Modify: `app/main.wasp`

- [ ] **Step 1: Locate the existing cycle query**

Find where `getActiveCycle`, `getCycleById`, or equivalent is defined. The minimal change: extend the existing active-cycle query to include previous-cycle summary OR add a new `getPreviousCycleSummary` query.

- [ ] **Step 2: Add a new query `getPreviousCycleSummary`**

```typescript
// In the cycle operations file
type Input = { cycleNumber: number };

type PreviousCycleSummary = {
  id: string;
  cycleNumber: number;
  isMarked: boolean;
  hasConfirmedShift: boolean;
} | null;

export const getPreviousCycleSummary: GetPreviousCycleSummary<Input, PreviousCycleSummary> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    if (args.cycleNumber <= 1) return null;

    const prev = await context.entities.Cycle.findFirst({
      where: {
        userId: context.user.id,
        cycleNumber: args.cycleNumber - 1,
      },
      include: {
        interpretations: {
          where: { type: 'THERMAL_SHIFT' },
          select: { state: true },
        },
      },
    });

    if (!prev) return null;

    const isMarked = !!prev.markedAnovulatoryAt || !!prev.markedUninterpretableAt;
    const hasConfirmedShift = prev.interpretations.some(
      (i) => i.state === 'CONFIRMED' || i.state === 'ADJUSTED'
    );

    return {
      id: prev.id,
      cycleNumber: prev.cycleNumber,
      isMarked,
      hasConfirmedShift,
    };
  };
```

- [ ] **Step 3: Declare the query in `main.wasp`**

```wasp
query getPreviousCycleSummary {
  fn: import { getPreviousCycleSummary } from "@src/cycle-tracking/cycleOperations",
  entities: [Cycle, CycleInterpretation]
}
```

---

## Task 12: Update `PropositionCard` routing

**Spec reference:** §8.3

**Files:**
- Modify: `app/src/cycle-tracking/interpretation/components/PropositionCard.tsx`

- [ ] **Step 1: Update the `PropositionCard` contract — engineResult is required non-null here**

`PropositionCard` is responsible for cards that depend on engine output (DISMISSED, needsReview, no-shift, pending, confirmed, adjusted). Cards that do NOT depend on engine output (AnovulatoryCard, UninterpretableCard) are rendered earlier in `CycleChartPage` (see Task 13) — so the caller must not render `PropositionCard` at all for marked cycles, and must not render it when `engineResult` is null.

Props type:

```tsx
type PropositionCardProps = {
  interpretation: CycleInterpretation | null;
  engineResult: InterpretationResult;  // NOT nullable — caller must guard
  cycleIsActive: boolean;
  maxDayNumber: number;
  onReEvaluate: () => void;
  onMarkAnovulatory: () => void;
  onMarkUninterpretable: () => void;
  // existing action callbacks (confirm, adjust, dismiss, resolveReview, etc.)
};
```

`markedAnovulatoryAt` / `markedUninterpretableAt` / `onUnmarkClassification` are NOT passed into `PropositionCard` — those are handled by `CycleChartPage`.

- [ ] **Step 2: Implement the routing logic (no marked branch, no null engineResult branch)**

Replace the top of the component body:

```tsx
// Priority 1: DISMISSED state
// Both mark buttons gated on engine's current result per §5.3.4.
if (interpretation?.state === 'DISMISSED') {
  return (
    <DismissedCard
      engineResult={engineResult.thermalShift}
      cycleIsActive={cycleIsActive}
      onReEvaluate={onReEvaluate}
      onMarkAnovulatory={onMarkAnovulatory}
      onMarkUninterpretable={onMarkUninterpretable}
    />
  );
}

// Priority 2: needsReview (existing)
if (interpretation?.needsReview) {
  return <NeedsReviewCard ... />;
}

// Priority 3: no row + engine returned no_shift_detected
const engineNoShift =
  engineResult.thermalShift.status === 'none' &&
  engineResult.thermalShift.reason === 'no_shift_detected';

if (!interpretation && !cycleIsActive && engineNoShift) {
  return (
    <NoShiftCard
      onMarkAnovulatory={onMarkAnovulatory}
      onMarkUninterpretable={onMarkUninterpretable}
    />
  );
}

if (!interpretation && cycleIsActive && engineNoShift && maxDayNumber >= 7) {
  return <InfoCard onMarkUninterpretable={onMarkUninterpretable} />;
}

if (!interpretation && cycleIsActive && engineNoShift && maxDayNumber < 7) {
  return null;  // silent — too early to say anything useful
}

// Priority 5: existing SUGGESTED / CONFIRMED / ADJUSTED routing (unchanged)
// ... existing logic
```

Remove the old `if (state === 'DISMISSED') return null;` line — DISMISSED now renders the DismissedCard.

- [ ] **Step 3: Type-check**

```
cd app && npx tsc --noEmit
```

---

## Task 13: Update `CycleChartPage`

**Spec reference:** §5.4, §5.5, §9

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 1: Pass cycle classification fields into the `useInterpretation` hook**

Update the hook call to pass the new args:

```tsx
const {
  engineResult,
  interpretation,
  postShiftMonitoring,
  actions,
  // ...
} = useInterpretation({
  cycleId: cycle.id,
  days,
  cycleIsActive: cycle.isActive,
  markedAnovulatoryAt: cycle.markedAnovulatoryAt,
  markedUninterpretableAt: cycle.markedUninterpretableAt,
});
```

- [ ] **Step 2: Render CycleBadge in the chart header**

Next to the cycle title:

```tsx
<h1 className="text-xl">
  Cycle {cycle.cycleNumber}
  <span className="ml-2">
    <CycleBadge
      markedAnovulatoryAt={cycle.markedAnovulatoryAt}
      markedUninterpretableAt={cycle.markedUninterpretableAt}
    />
  </span>
</h1>
```

- [ ] **Step 3: Render the CrossCycleAnovulatoryBanner**

Only on active cycles. Use the new `getPreviousCycleSummary` query:

```tsx
const { data: previousCycle } = useQuery(
  getPreviousCycleSummary,
  { cycleNumber: cycle.cycleNumber },
  { enabled: cycle.isActive }
);

// Above the chart:
{cycle.isActive && (
  <CrossCycleAnovulatoryBanner previousCycle={previousCycle ?? null} />
)}
```

- [ ] **Step 4: Hide coverline annotation when cycle is marked**

The existing coverline overlay logic needs a guard:

```tsx
const showCoverline =
  !cycle.markedAnovulatoryAt &&
  !cycle.markedUninterpretableAt &&
  interpretation?.state !== 'DISMISSED' &&
  /* existing conditions */;
```

Pass through to the ApexCharts annotations.

- [ ] **Step 5: Render marked cards at the page level; gate `PropositionCard` on non-null engineResult**

The hook returns `engineResult: null` when the cycle is marked or when `days.length === 0`. `PropositionCard` expects a non-null `engineResult` (see Task 12). So the page is responsible for:
- Rendering `AnovulatoryCard` / `UninterpretableCard` when the cycle is marked (these don't need engine output)
- Rendering `PropositionCard` **only** when `engineResult` is non-null AND the cycle is not marked

```tsx
// Replace wherever PropositionCard was previously rendered unconditionally:
{cycle.markedAnovulatoryAt ? (
  <AnovulatoryCard onRemoveMark={actions.unmarkClassification} />
) : cycle.markedUninterpretableAt ? (
  <UninterpretableCard onRemoveMark={actions.unmarkClassification} />
) : engineResult ? (
  <PropositionCard
    interpretation={interpretation}
    engineResult={engineResult}
    cycleIsActive={cycle.isActive}
    maxDayNumber={days.length > 0 ? Math.max(...days.map((d) => d.dayNumber)) : 0}
    onReEvaluate={actions.reEvaluate}
    onMarkAnovulatory={actions.markAnovulatory}
    onMarkUninterpretable={actions.markUninterpretable}
    // existing props (confirm/adjust/dismiss/resolveReview/resolveFalseRise/resolveNudge)
  />
) : null /* no days recorded yet — nothing to show */}
```

This arrangement guarantees:
1. Marked cycles always render their marked card regardless of engineResult
2. `PropositionCard` is never called with `engineResult === null`
3. Empty cycles (no days) render nothing, which is the correct behavior — there's no proposition or classification to display

- [ ] **Step 6: Update the cycle query to select the new fields**

Wherever the cycle is fetched (e.g., `getCycleById`), ensure `markedAnovulatoryAt` and `markedUninterpretableAt` are included. If using Prisma default select (returns all scalars), no change is needed.

---

## Task 14: Cycle switcher / navigation badge

**Spec reference:** §5.4 (placement 2)

**Files:**
- Modify: wherever cycle navigation / switcher lives (search for cycle list rendering)

- [ ] **Step 1: Find the cycle switcher component**

```
cd app && rg -n "cycleNumber" src/cycle-tracking/ | head -20
```

Likely candidates: `CycleSwitcher.tsx`, a dropdown in the header, or a cycle list page.

- [ ] **Step 2: Render the badge next to each cycle entry**

```tsx
<span>
  Cycle {c.cycleNumber} ({durationDays} days)
  <CycleBadge
    markedAnovulatoryAt={c.markedAnovulatoryAt}
    markedUninterpretableAt={c.markedUninterpretableAt}
  />
</span>
```

- [ ] **Step 3: Verify the query returning cycles includes the new fields**

If the switcher uses `getAllCycles` or similar, ensure it selects the mark fields.

---

## Task 15: End-to-end verification

**Spec reference:** §12.3

- [ ] **Step 1: Start the app**

```
cd app && wasp start
```

Wait for generation to complete without errors.

- [ ] **Step 2: E2E scenario — Cycle 3 recovery**

This directly addresses the original user-reported bug.

1. Open an existing cycle that has a CONFIRMED thermal shift
2. Exclude enough days that the engine returns `none`
3. Verify a "Needs Review" card appears
4. Click "Reject" — verify state becomes DISMISSED and a DismissedCard appears
5. Un-exclude some days so the engine finds a shift on the same day again
6. Verify the card transitions from DismissedCard → SuggestedCard (auto-recovery)
7. Verify the coverline is visible on the chart again

Existing DISMISSED rows (from before migration) should also auto-recover on first engine run because their `dismissedDataFingerprint` is null.

- [ ] **Step 3: E2E scenario — Anovulatory classification flow**

1. Find or create a past cycle with no shift detected
2. Navigate to that cycle — verify NoShiftCard appears
3. Click "Mark as Anovulatory" — verify AnovulatoryCard appears, coverline hidden
4. Verify the [Anovulatory] badge shows in the cycle title and switcher
5. Start a new cycle — verify CrossCycleAnovulatoryBanner does NOT appear (because previous is now marked)
6. Click "Remove Mark" on Cycle N — verify return to NoShiftCard
7. Verify the banner now appears on the new active cycle

- [ ] **Step 4: E2E scenario — Uninterpretable classification flow (active cycle)**

1. On an active cycle with ≥ 7 days recorded and `no_shift_detected`, verify InfoCard shows
2. Click "Mark Data as Unreliable" — verify UninterpretableCard appears
3. Verify coverline is hidden
4. Verify the [Unreliable data] badge in cycle title
5. Click "Remove Mark" — engine re-runs fresh

- [ ] **Step 5: E2E scenario — Mark buttons correctly gated**

1. On a cycle where the engine has a pending or confirmed shift, verify:
   - No NoShiftCard (engine has a suggestion, different card is shown)
   - If state is DISMISSED, the DismissedCard does NOT show [Mark as Anovulatory] or [Mark Data as Unreliable]
2. Attempt a direct API call to `markCycleUninterpretable` on such a cycle — verify 409 response

- [ ] **Step 6: E2E scenario — Active cycle anovulatory blocked**

1. On an active cycle, verify [Mark as Anovulatory] never appears anywhere
2. Attempt direct API call to `markCycleAnovulatory` — verify 400 response

- [ ] **Step 7: Run all unit tests**

```
cd app && npx vitest run
```

All tests — existing and new — should pass with no failures or skips.

---

## Task 16: Verification checklist before merge

- [ ] `app/schema.prisma` has all three new fields, migration applied
- [ ] `app/main.wasp` declares `markCycleAnovulatory`, `markCycleUninterpretable`, `unmarkCycleClassification`, `reEvaluateCycleInterpretation`, `getPreviousCycleSummary`
- [ ] `upsertCycleInterpretation` no longer has any hard no-op branches for DISMISSED (other than the fingerprint-unchanged case, which now still refreshes engineResult)
- [ ] `dismissInterpretation` and `resolveReview` accept and store `dataFingerprint`
- [ ] `useInterpretation` hook exposes `reEvaluate`, `markAnovulatory`, `markUninterpretable`, `unmarkClassification` and each resets `lastPersistedRef.current = null` on success
- [ ] `useInterpretation` skips `runInterpretation` when cycle is marked
- [ ] `PropositionCard` has a **non-nullable** `engineResult` prop; typechecker enforces this
- [ ] `PropositionCard` handles all 5 engine-dependent card variants (DismissedCard, NeedsReviewCard, NoShiftCard, InfoCard, existing Suggested/Confirmed/Adjusted)
- [ ] Marked cycles render `AnovulatoryCard` / `UninterpretableCard` in `CycleChartPage` (NOT via `PropositionCard`)
- [ ] `CycleChartPage` does not render `PropositionCard` when `engineResult === null` (marked or empty cycles)
- [ ] `DismissedCard` gates both mark buttons on `engineResult.status === 'none' && reason === 'no_shift_detected'`
- [ ] Guard logic lives in `classificationDecisions.ts` as pure functions (`decideMarkAnovulatory`, `decideMarkUninterpretable`); Wasp operations are thin shells that call the decision and execute the result
- [ ] `classificationDecisions.test.ts` covers all rejection branches (active-cycle 400, CONFIRMED/ADJUSTED 409, engine-gate 409 for pending/confirmed/insufficient_data) AND all acceptance branches AND mutual-exclusivity invariants — ~20 tests
- [ ] `markCycleAnovulatory` rejects active cycles with 400
- [ ] Both mark operations reject CONFIRMED/ADJUSTED state with 409
- [ ] `CrossCycleAnovulatoryBanner` reads `sessionStorage` directly on each render (keyed by `previousCycle.id`), uses `useState` only as a re-render trigger on dismiss; no stale initial state when `previousCycle` transitions null→value or A→B
- [ ] `CycleBadge` rendered in chart header AND cycle switcher/navigation
- [ ] Coverline annotation hidden on chart when cycle is marked OR state is DISMISSED
- [ ] All tests pass: `cd app && npx vitest run`
- [ ] Wasp build succeeds: `cd app && wasp start` with no errors
- [ ] E2E scenarios in Task 15 all pass manually
- [ ] Original Cycle 3 coverline recovers on first load (because legacy null fingerprint auto-resets)

---

## Out of scope

These are explicitly NOT part of this plan (per spec §13):

- Pre-marking cycles as anovulatory before they end
- Auto-detection of PCOS / hormonal irregularities
- Cycle-level notes beyond the two classification flags
- Pregnancy pattern detection (18+ high temps)
- Historical reclassification when Sensiplan interpretation changes
