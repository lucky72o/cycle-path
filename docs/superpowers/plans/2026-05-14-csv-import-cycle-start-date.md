# CSV Import — Correct Cycle Start Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `importCycleCsv` so that when a CSV's first row has a `cd` (cycle day) value greater than 1, the cycle's `startDate` is back-computed to the true cycle-day-1 date instead of being set to the first row's date. This restores the app-wide invariant `cycleDay.date == cycle.startDate + (cycleDay.dayNumber - 1) days`, which the chart, "Add Cycle Day" page, and several helpers all rely on.

**Architecture:** Extract one pure helper `computeCycleStartDate(firstRowDate, firstDayNumber)` into `app/src/cycle-tracking/utils.ts` and call it from `importCycleCsv` in `app/src/cycle-tracking/operations.ts`. The import's cycle lookup tries the back-computed `startDate` first; if that misses and differs from the CSV's first-row date, it falls back to the pre-fix key (the first-row date) and **updates that cycle's `startDate` in place** so re-importing the same CSV repairs an already-broken cycle instead of duplicating it. No schema change, no UI change, no migration script. Pre-existing `CycleDay` rows with negative `dayNumber` (an artefact of "Add Cycle Day" against the buggy `startDate`) are **not** auto-renumbered — they must be deleted manually via the `/days` page after the cycle repair. Auto-renumber is intentionally out of scope here (see PR description's rollout section).

**Tech Stack:** Wasp 0.19, TypeScript, Prisma. Tests run with `npm test` (vitest) from the `app/` directory. Lint with `npm run lint`. Conventional commit prefixes (`fix`, `test`, `docs`).

**Source context:** No standalone spec doc; the full problem analysis lives in the GitHub branch conversation that produced this plan. Companion issue [lucky72o/cycle-path#10](https://github.com/lucky72o/cycle-path/issues/10) tracks the related hardening of `createOrUpdateCycleDay` against negative `dayNumber`s (deliberately out of scope here).

**Branch:** `fix/csv-import-cycle-start-date` (already checked out in `/Users/olgapak/work/cycle-path/.claude/worktrees/hungry-mayer-1998bd`, currently at the same commit as `main`).

**Convention:** Always work from the `app/` directory for `npm test`, `npm run lint`. Commit after every green task.

---

## Background — what "alignment rule" means

The app stores two things per cycle:
- `Cycle.startDate` — one calendar date, the cycle's day 1.
- Many `CycleDay` records, each with a `dayNumber` (1, 2, 3, …) and a `date`.

The unspoken rule the rest of the app relies on:

> For every `CycleDay`, `date === cycle.startDate + (dayNumber − 1) days`.

We'll call this the **alignment rule**. Concrete example: if `startDate = 2025-01-12`, then `dayNumber = 16` must have `date = 2025-01-27`.

The chart's date header row, `AddCycleDayPage`'s `cycleDayNumber` calculation, and `resolveCycleDayIsoDate` all assume this invariant. `importCycleCsv` currently violates it when the CSV does not start at `cd = 1`.

## Root cause

In [app/src/cycle-tracking/operations.ts:594-619](app/src/cycle-tracking/operations.ts:594), the import sets `cycle.startDate = firstDate` where `firstDate` is the earliest date in the CSV. Then in [app/src/cycle-tracking/operations.ts:630-633](app/src/cycle-tracking/operations.ts:630), it stores the day's `dayNumber` straight from the CSV's `cd` column.

For Cycle #1's CSV (first row: `2025-01-27, cd=16`), this produces:
- `cycle.startDate = 2025-01-27`
- `CycleDay { dayNumber: 16, date: 2025-01-27 }` ← violates the alignment rule

The chart then draws its date header as `startDate + (column − 1) days` for columns 1..28, producing Jan 27 → Feb 23. Every datapoint lands 15 columns to the right of where its date header reads.

## Fix

Back-compute the cycle's `startDate` from the first row:

```
cycleStartDate = firstRowDate − (firstRowCd − 1) days
```

For Cycle #1: `cycleStartDate = Jan 27 − 15 days = Jan 12`. Then `dayNumber=16, date=Jan 27` is consistent with the alignment rule.

CSVs that already start at `cd = 1` (Cycles #2–#5) reduce to `cycleStartDate = firstRowDate`, i.e. unchanged behavior.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `app/src/cycle-tracking/utils.ts` | modify | Add pure helper `computeCycleStartDate(firstRowDate, firstDayNumber)`. |
| `app/src/cycle-tracking/__tests__/computeCycleStartDate.test.ts` | create | Unit tests for the new helper. |
| `app/src/cycle-tracking/operations.ts` | modify | Use the helper inside `importCycleCsv` for both lookup and create paths. |
| `docs/superpowers/plans/2026-05-14-csv-import-cycle-start-date.md` | already exists (this file) | — |

No UI changes. No schema migration. No database backfill script.

---

## Task 1: Add `computeCycleStartDate` helper (TDD)

**Files:**
- Create: `app/src/cycle-tracking/__tests__/computeCycleStartDate.test.ts`
- Modify: `app/src/cycle-tracking/utils.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/src/cycle-tracking/__tests__/computeCycleStartDate.test.ts` with this exact content:

```ts
import { describe, it, expect } from 'vitest';
import { computeCycleStartDate } from '../utils';

describe('computeCycleStartDate', () => {
  it('returns the first row date unchanged when firstDayNumber is 1', () => {
    const firstRowDate = new Date(2025, 1, 9); // 2025-02-09, local-calendar
    const result = computeCycleStartDate(firstRowDate, 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February (0-indexed)
    expect(result.getDate()).toBe(9);
  });

  it('back-computes the start date for a mid-cycle first row', () => {
    // Cycle #1 case: first CSV row is 2025-01-27 with cd=16.
    // Day 1 should be 15 days earlier: 2025-01-12.
    const firstRowDate = new Date(2025, 0, 27); // 2025-01-27
    const result = computeCycleStartDate(firstRowDate, 16);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(12);
  });

  it('handles month boundaries correctly', () => {
    // First row 2025-03-02 with cd=5 -> start date = 2025-02-26
    const firstRowDate = new Date(2025, 2, 2);
    const result = computeCycleStartDate(firstRowDate, 5);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(26);
  });

  it('does not mutate the input date', () => {
    const firstRowDate = new Date(2025, 0, 27);
    const originalTime = firstRowDate.getTime();
    computeCycleStartDate(firstRowDate, 16);
    expect(firstRowDate.getTime()).toBe(originalTime);
  });

  it('returns a date with the same time-of-day as the input (no UTC drift)', () => {
    // Guard against accidental UTC arithmetic. Input is 2025-01-27 00:00 local;
    // result must be 2025-01-12 00:00 local, not shifted by the TZ offset.
    const firstRowDate = new Date(2025, 0, 27, 0, 0, 0, 0);
    const result = computeCycleStartDate(firstRowDate, 16);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && npm test -- computeCycleStartDate
```

Expected: FAIL with a message about `computeCycleStartDate` not being exported from `../utils`.

- [ ] **Step 3: Implement the helper**

Append to `app/src/cycle-tracking/utils.ts` (after `isCycleDayInTail`, before EOF):

```ts
/**
 * Back-compute the cycle's `startDate` (== day 1's calendar date) from the
 * first row of an imported CSV. The CSV may not start at cycle day 1 — e.g. a
 * user importing a partial cycle whose earliest row is `cd=16, date=2025-01-27`
 * should produce a cycle whose `startDate` is `2025-01-12` so that the
 * app-wide invariant `cycleDay.date === cycle.startDate + (dayNumber - 1) days`
 * continues to hold.
 *
 * Pure function: returns a fresh Date, does not mutate the input. Uses
 * local-calendar arithmetic (Date.prototype.setDate) so it is DST-safe.
 */
export function computeCycleStartDate(firstRowDate: Date, firstDayNumber: number): Date {
  const result = new Date(firstRowDate);
  result.setDate(firstRowDate.getDate() - (firstDayNumber - 1));
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app && npm test -- computeCycleStartDate
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full test suite + lint to make sure nothing else broke**

```bash
cd app && npm test && npm run lint
```

Expected: full suite green; lint clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/__tests__/computeCycleStartDate.test.ts
git commit -m "test(import): add computeCycleStartDate helper with tests"
```

---

## Task 2: Use `computeCycleStartDate` inside `importCycleCsv`

**Files:**
- Modify: `app/src/cycle-tracking/operations.ts:594-619`

Before this task: `importCycleCsv` uses `firstDate` (the earliest CSV row's date) as both the lookup key for an existing cycle and the `startDate` of a freshly created cycle. We replace both usages with the back-computed `cycleStartDate`.

- [ ] **Step 1: Add the import at the top of `operations.ts`**

Find the existing import line (around line 20):

```ts
import { convertToCelsiusForStorage, getDayOfWeek } from './utils';
```

Replace it with:

```ts
import { computeCycleStartDate, convertToCelsiusForStorage, getDayOfWeek } from './utils';
```

- [ ] **Step 2: Replace the cycle-lookup-and-create block**

Find this block in `importCycleCsv` (around lines 594-623):

```ts
  const firstDate = parsedRows[0].parsedDate as Date;
  if (!firstDate) {
    throw new HttpError(400, 'First row is missing a valid date.');
  }

  // Determine the last date from parsed rows (used for endDate hints)
  const lastDate = parsedRows[parsedRows.length - 1].parsedDate as Date;

  // Find cycle by matching startDate to the first date; if not found, create a new one
  let cycle = await context.entities.Cycle.findFirst({
    where: {
      userId: context.user.id,
      startDate: firstDate
    }
  });

  let createdCycle = false;
  if (!cycle) {
    cycle = await context.entities.Cycle.create({
      data: {
        userId: context.user.id,
        startDate: firstDate,
        endDate: null, // Will be set after importing days
        isActive: true, // Will be adjusted based on date comparison
        cycleNumber: 1 // Temporary, will be recalculated
      }
    });

    createdCycle = true;
  }
```

Replace it with:

```ts
  const firstRow = parsedRows[0];
  const firstDate = firstRow.parsedDate as Date;
  if (!firstDate) {
    throw new HttpError(400, 'First row is missing a valid date.');
  }

  // Determine the last date from parsed rows (used for endDate hints)
  const lastDate = parsedRows[parsedRows.length - 1].parsedDate as Date;

  // Back-compute the cycle's true start date (== day 1's calendar date).
  // The CSV's first row may not be cycle-day-1 (e.g. a partial-cycle import
  // starting at cd=16). The rest of the app relies on the invariant
  // `cycleDay.date === cycle.startDate + (dayNumber - 1) days`, so the
  // cycle's startDate must be the day-1 date, not the first row's date.
  const firstDayNumberRaw = firstRow.raw.cd ?? firstRow.raw.CD ?? firstRow.raw.cycleDay;
  const firstDayNumber = firstDayNumberRaw
    ? Number.parseInt(String(firstDayNumberRaw), 10)
    : 1;
  const cycleStartDate = Number.isFinite(firstDayNumber) && firstDayNumber >= 1
    ? computeCycleStartDate(firstDate, firstDayNumber)
    : firstDate;

  // Find cycle by matching startDate to the back-computed cycle start date.
  // Re-imports of a CSV that was already imported with the fixed code land
  // on the same cycle because the back-computation is deterministic.
  let cycle = await context.entities.Cycle.findFirst({
    where: {
      userId: context.user.id,
      startDate: cycleStartDate
    }
  });

  // Repair path: a CSV imported BEFORE this fix produced a cycle whose
  // `startDate` equals the CSV's first row date (the pre-fix buggy value),
  // not the back-computed value. When the two differ and the corrected-key
  // lookup misses, fall back to the old key so the user can repair their
  // existing cycle by simply re-importing the same CSV (instead of getting
  // a duplicate cycle).
  if (!cycle && cycleStartDate.getTime() !== firstDate.getTime()) {
    const legacyCycle = await context.entities.Cycle.findFirst({
      where: {
        userId: context.user.id,
        startDate: firstDate
      }
    });
    if (legacyCycle) {
      cycle = await context.entities.Cycle.update({
        where: { id: legacyCycle.id },
        data: { startDate: cycleStartDate }
      });
    }
  }

  let createdCycle = false;
  if (!cycle) {
    cycle = await context.entities.Cycle.create({
      data: {
        userId: context.user.id,
        startDate: cycleStartDate,
        endDate: null, // Will be set after importing days
        isActive: true, // Will be adjusted based on date comparison
        cycleNumber: 1 // Temporary, will be recalculated
      }
    });

    createdCycle = true;
  }
```

- [ ] **Step 3: Run the full test suite + lint**

```bash
cd app && npm test && npm run lint
```

Expected: full suite green; lint clean. (No new unit test added in this task — the change is a wiring-only application of the helper from Task 1 plus a fallback branch. The fallback path is exercised in Task 3's end-to-end verification.)

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/operations.ts
git commit -m "fix(import): back-compute cycle startDate; repair legacy mis-imported cycles"
```

---

## Task 3: End-to-end verification with the Cycle #1 CSV

This task is a manual smoke-test against the real CSV file in the repo. It verifies both the **fresh-import** path and the **legacy-repair** path end-to-end without requiring DB mocking infrastructure.

**Files (read-only):**
- `My-Cycles-Data/Cycle #1 (Starting 12:01:25).csv`

### Part A: Fresh-import path (no pre-existing cycle)

- [ ] **A.1: Start the dev server**

From the repo root:

```bash
cd app && wasp start
```

Wait for the server to log "Web app server running on http://localhost:3000" (or similar).

- [ ] **A.2: Ensure no Cycle #1 exists in the local DB**

Open the app, log in, go to the Cycles page. If a Cycle #1 already exists, delete it via the UI before continuing. (We want to test the fresh-create branch in this part.)

- [ ] **A.3: Import the Cycle #1 CSV via the UI**

Use the import UI to upload `My-Cycles-Data/Cycle #1 (Starting 12:01:25).csv`.

- [ ] **A.4: Verify the `/days` page**

Navigate to Cycle #1's `/days` page. Expected:
- Header: `Started: 12/01/2025 - Ended: 08/02/2025` (note: **Jan 12**, not Jan 27).
- Row for day 16: `Cycle Day = 16`, `Date = Jan 27 2025`, `Week Day = Monday`, no BBT (the CSV has an empty BBT for this row).
- Row for day 17: `Cycle Day = 17`, `Date = Jan 28 2025`, `Week Day = Tuesday`, BBT shown.
- Last row: `Cycle Day = 28`, `Date = Feb 8 2025`, `Week Day = Saturday`.
- No row with `Cycle Day = -14` (this part starts from an empty DB).

- [ ] **A.5: Verify the chart page**

Navigate to Cycle #1's chart (`/cycles/<id>/chart`). Expected:
- Date header row starts at `Jan 12` and ends at `Feb 8` (28 columns).
- Cycle Day row reads `1, 2, 3, …, 28`.
- The first recorded BBT dot sits under date `Jan 28` / cycle day `17` (not under `Feb 12`).
- Hovering that dot shows tooltip `28 Jan 2025, Tuesday, Cycle Day 17`.

### Part B: Legacy-repair path (pre-existing cycle with the old wrong startDate)

This part proves the fallback lookup added in Task 2 actually repairs in place instead of creating a duplicate.

- [ ] **B.1: Delete the cycle created in Part A**

From the Cycles UI, delete Cycle #1.

- [ ] **B.2: Plant a broken cycle that mimics the pre-fix state**

Use the Prisma Studio (or a SQL client connected to the local DB) to insert a cycle representing what the old buggy code would have produced. From `app/`:

```bash
npx wasp db studio
```

In Studio, create a `Cycle` row for your user with `startDate = 2025-01-27` (the buggy value), `isActive = false`, `cycleNumber = 1`, `endDate = 2025-02-08`. Then add a single `CycleDay` row pointing at that cycle: `dayNumber = -14`, `date = 2025-01-12`, `dayOfWeek = 'Sunday'`, no BBT — this simulates the stray "Add Cycle Day" row seen on remote.

(If editing in Studio is awkward, equivalently run a small `npx wasp db seed` script or two `prisma.cycle.create` / `prisma.cycleDay.create` calls in a one-off `npx tsx` snippet. The plan does not prescribe a tool — the goal is a `Cycle` with `startDate=2025-01-27` plus one `CycleDay` at `(dayNumber=-14, date=2025-01-12)`.)

- [ ] **B.3: Re-import the same Cycle #1 CSV via the UI**

Use the import UI to upload `My-Cycles-Data/Cycle #1 (Starting 12:01:25).csv` again.

- [ ] **B.4: Verify there is only one Cycle #1 (no duplicate)**

On the Cycles page, confirm exactly one cycle covering Jan 2025 / Feb 2025. The legacy-repair path should have **updated the existing cycle in place**, not created a second one.

- [ ] **B.5: Verify the cycle's startDate is now corrected**

Open the cycle's `/days` page. Header should read `Started: 12/01/2025 - Ended: 08/02/2025`. Days 16–28 match Part A. The CSV-imported rows (days 16–28) are now correctly aligned because the cycle's `startDate` was updated to Jan 12.

- [ ] **B.6: Acknowledge the stray `dayNumber = -14, date = 2025-01-12` row**

Scroll the `/days` table. The pre-existing stray row still has `Cycle Day = -14` because **this fix does not auto-renumber existing `CycleDay` records**. The CSV does not contain a row for Jan 12, and the import upserts only rows that appear in the CSV. The schema's unique constraint is `@@unique([cycleId, dayNumber])`, not `(cycleId, date)`, so there is no automatic re-key path.

To finish the repair, click **Delete** on the `Cycle Day -14` row in the `/days` page (this is the user-facing repair step documented in the PR's Rollout section). Then optionally re-create a day for Jan 12 via the "Add Cycle Day" page — with the corrected `startDate = Jan 12`, the auto-computed dayNumber will be 1.

- [ ] **B.7: Stop the dev server**

`Ctrl+C` in the terminal running `wasp start`.

- [ ] **B.8 (no commit needed for this task)**

This task is verification-only; no code changes.

---

## Task 4: Update onboarding / project notes (lightweight)

**Files:**
- Modify (optional): `README.md` if it mentions the import flow, or skip if it does not.

- [ ] **Step 1: Decide whether a note is warranted**

Search the README for any reference to the CSV import flow:

```bash
grep -n -i "import\|csv" README.md
```

If the README does not document the import flow, **skip the rest of this task** — no change needed.

If it does, add a single sentence under the import section:

> CSVs may start at any `cd` value; the importer back-computes the cycle's start date from the first row.

- [ ] **Step 2: Commit (only if a change was made in Step 1)**

```bash
git add README.md
git commit -m "docs(readme): note that CSV import back-computes cycle startDate"
```

---

## Task 5: Open PR for review

- [ ] **Step 1: Push the branch**

```bash
git push -u origin fix/csv-import-cycle-start-date
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "fix(import): back-compute cycle startDate from CSV cd column" --body "$(cat <<'EOF'
## Summary

- `importCycleCsv` now back-computes `cycle.startDate` from the first CSV row's `cd` value, restoring the alignment rule (`cycleDay.date === cycle.startDate + (dayNumber - 1) days`).
- Adds a legacy-repair lookup path so re-importing a CSV that was originally imported with the pre-fix buggy logic updates the existing cycle's `startDate` in place rather than creating a duplicate cycle.
- Adds a pure helper `computeCycleStartDate` in `utils.ts` plus unit tests.
- Companion deferred work tracked in #10 (harden `createOrUpdateCycleDay` against negative dayNumbers).

## Why

Importing a CSV whose first row is mid-cycle (e.g. Cycle #1 starts at `cd=16, date=2025-01-27`) previously set `cycle.startDate` to the first row's date. That broke the alignment rule and caused the chart's date header to render 15 columns offset from the actual data.

## Rollout — repairing cycles imported before this fix

For each environment that imported a partial-cycle CSV (one whose first row's `cd` > 1) before this PR landed:

1. **Re-import the same CSV via the UI.** The import looks for an existing cycle at the back-computed `startDate` first; when that misses, it falls back to the pre-fix `startDate` (the CSV's first row date) and **updates that cycle's `startDate` in place** to the corrected value. After this step the chart and the `/days` header show the correct dates and no duplicate cycle is created.
2. **Manually delete any stray pre-existing `CycleDay` rows with `dayNumber ≤ 0`.** These rows are typically the product of "Add Cycle Day" being used with the wrong cycle `startDate` (e.g. the `dayNumber = -14, date = 2025-01-12` row seen on remote for Cycle #1). They are **not auto-renumbered** by this PR — the CSV does not contain a row for that date, and the schema's unique constraint is `@@unique([cycleId, dayNumber])`, so the importer has no row to match on. Use the **Delete** button on the `/days` page. Optionally re-create the day via "Add Cycle Day" after deletion; with the corrected `startDate`, its dayNumber will compute correctly.
3. **For environments without a partial-cycle import, no action is required.**

Auto-renumbering existing `CycleDay` rows on `startDate` change is deliberately out of scope here (uniform-shift renumbering can hit `@@unique([cycleId, dayNumber])` mid-loop, and the realistic data only has at most one stray row). If we see this pattern recur for other users, file a follow-up issue for an explicit renumber pass.

## Test plan

- [ ] `cd app && npm test` — green
- [ ] `cd app && npm run lint` — clean
- [ ] Manual (fresh import): import `My-Cycles-Data/Cycle #1 (Starting 12:01:25).csv` against a clean DB, verify `/days` header shows `Started: 12/01/2025`, chart's date row spans Jan 12 → Feb 8.
- [ ] Manual (legacy repair): plant a `Cycle { startDate=2025-01-27 }` plus a stray `CycleDay { dayNumber=-14, date=2025-01-12 }` via Prisma Studio, then re-import the same CSV. Verify: (a) only one Cycle #1 exists (no duplicate), (b) its `startDate` was updated to `2025-01-12`, (c) the stray `Cycle Day -14` row is still present and must be deleted via the UI.
- [ ] Manual: import any of Cycles #2–#5 (which start at `cd=1`), verify unchanged behavior.

EOF
)"
```

Capture the PR URL from the output to share back.

---

## Self-review checklist (already applied)

- **Spec coverage:** every part of the fix described in the plan header has a corresponding task (helper + tests in Task 1, wiring + legacy-repair fallback in Task 2, E2E for both fresh-import and legacy-repair paths in Task 3).
- **Placeholders:** none.
- **Type consistency:** `computeCycleStartDate(firstRowDate: Date, firstDayNumber: number): Date` is defined in Task 1 and called with the same signature in Task 2.
- **Lookup safety:** when the corrected-key lookup misses, the fallback to the old `firstDate` key only fires if `cycleStartDate !== firstDate`. This prevents the fallback from doing a redundant lookup (and prevents weird interactions with `cd=1` CSVs).
- **Rollout honesty:** PR description's Rollout section explicitly states that pre-existing `CycleDay` rows with `dayNumber ≤ 0` must be deleted manually via the `/days` page after re-import. No claim of automatic renumbering.
- **Out-of-scope reminders:** `createOrUpdateCycleDay` hardening is intentionally deferred (issue #10). Auto-renumbering of existing `CycleDay` rows on `startDate` change is also out of scope (would need to handle `@@unique([cycleId, dayNumber])` collisions during a uniform shift; realistic data only has at most one stray row, so a manual delete is cheaper than building this safely).
