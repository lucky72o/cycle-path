# Duplicate Day Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Add Daily Entry page, warn when the chosen date is already recorded, never erase saved fields that the new entry leaves empty, and confirm field-level conflicts (Replace / Keep existing / Cancel) before overwriting.

**Architecture:** A pure comparison module (`duplicateDay.ts`) classifies each field of the form against the saved `CycleDay` as keep / fill-in / same / conflict and builds the save payload for each choice. A small Radix dialog renders the conflicts. `AddCycleDayPage` shows the date notice and routes Save through the comparison. On the server, `createOrUpdateCycleDay` gains a `preserveExisting` flag that strips empty values before updating an existing row, so even a stale client can't erase data.

**Tech Stack:** Wasp, React 18, TypeScript, Prisma, `@radix-ui/react-dialog` (already a dependency), Tailwind, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-16-duplicate-day-warning-design.md`

## Global Constraints

- Notice copy (exact): `You already have an entry for {DD/MM} (Day {n}). Saving here will replace existing data.` followed by the link text `Edit that entry instead`.
- Dialog title (exact): `Overwrite existing data for {DD/MM}?`
- Dialog body (exact): `This day already has an entry. Saving will replace these fields:`
- Kept line (exact prefix): `✓ Kept as is: ` + comma-separated `Label (value)`; omit the line when nothing is kept.
- Buttons, in order: `Cancel` · `Keep existing` · `Replace` (Replace is the warning-coloured primary).
- Dialog table columns: `Field` | `Saved` | `New`; saved value struck through.
- Field labels: `BBT`, `BBT Time`, `Intercourse`, `Exclude from BBT-based interpretation`, `Menstrual Flow`, `Cervical Fluid · Appearance`, `Cervical Fluid · Sensation`, `Ovulation Predictor Kit`, `Disturbance Factor`, `Travel time difference`, `Notes`.
- BBT equality: compare at 2 decimals in the user's display unit.
- Checkboxes never conflict; unticked = empty (keep).
- Travel time difference is empty only when TRAVEL isn't ticked in the new entry; with TRAVEL ticked, 0 is a real value.
- Edit page (`?dayId=`) and chart notes panel behaviour must not change. No schema change, no new dependencies.
- Edit link target: `/cycles/{cycleId}/add-day?dayId={day.id}`.

## Review Focus

1. **Initial load on an already-recorded today:** the notice must show immediately, not only after the date changes. Covered in Task 4 manual check (a), and by `findSavedDayForDate` tests in Task 2.
2. **°F user with a saved °C value equal at display precision** (e.g. saved 36.45 °C, typed 97.61 °F) must not raise a conflict. Test in Task 2.
3. **Travel ticked on both sides with the default 0 vs saved +3:** must conflict as its own row, not slip through. Test in Task 2.
4. **Stale client** (day added elsewhere after the page loaded) saving the full form must not clear saved fields. Server test in Task 1 (`stripEmptyFields` with a full Add-page payload).
5. **Date before the cycle start** (day number < 1) must never match a saved day or show the notice. Test in Task 2.

---

### Task 1: Server — `preserveExisting` strips empty values

**Files:**
- Modify: `app/src/cycle-tracking/cycleDayDataBuilders.ts` (add `stripEmptyFields`)
- Modify: `app/src/cycle-tracking/operations.ts:329-390` (`CreateOrUpdateCycleDayArgs`, update branch)
- Test: `app/src/cycle-tracking/__tests__/cycleDayDataBuilders.test.ts`

**Interfaces:**
- Produces: `stripEmptyFields(args: CycleDayPartialArgs): CycleDayPartialArgs`. It returns a copy without keys whose value is `undefined`, `null`, `''` (after trim for `bbtTime`/`notes`), `false` (booleans), or `[]` (`disturbanceFactors`). `travelTimeDiff` is removed whenever `disturbanceFactors` is absent from the result or doesn't include `'TRAVEL'`; otherwise it's kept, including `0`.
- Produces: `createOrUpdateCycleDay` accepts optional `preserveExisting?: boolean`. When true **and** a row exists, the update uses `buildCycleDayUpdateData(stripEmptyFields(args), …)`. The create path ignores the flag.

- [ ] **Step 1: Write failing tests** in a new `describe('stripEmptyFields')` block:
  - `it('drops null, undefined, empty string, false and empty array')`: input `{ bbt: null, bbtTime: '', hadIntercourse: false, excludeFromInterpretation: false, cervicalAppearance: null, cervicalSensation: null, opkStatus: null, menstrualFlow: null, disturbanceFactors: [], travelTimeDiff: null, notes: '   ' }` → `{}`.
  - `it('keeps filled values')`: `{ bbt: 36.7, bbtTime: '07:15', hadIntercourse: true, cervicalAppearance: 'STICKY', notes: 'x' }` round-trips unchanged.
  - `it('keeps travelTimeDiff 0 when TRAVEL is ticked')`: `{ disturbanceFactors: ['TRAVEL'], travelTimeDiff: 0 }` → same object.
  - `it('drops travelTimeDiff when TRAVEL is not ticked')`: `{ disturbanceFactors: ['STRESS'], travelTimeDiff: 3 }` → `{ disturbanceFactors: ['STRESS'] }`.
  - `it('full Add-page payload with only BBT keeps only BBT')`: the full payload shape `AddCycleDayPage` sends today, with `bbt: 36.7` and every other field empty → `{ bbt: 36.7 }`.
- [ ] **Step 2: Run, expect FAIL** (`stripEmptyFields` is not exported)
  Run: `cd app && npx vitest run src/cycle-tracking/__tests__/cycleDayDataBuilders.test.ts`
- [ ] **Step 3: Implement `stripEmptyFields`** in `cycleDayDataBuilders.ts`, and add `preserveExisting?: boolean` to `CreateOrUpdateCycleDayArgs`, applied only in the `if (existingDay)` branch of `operations.ts`. Destructure `preserveExisting` out before passing args to the builders so it never reaches Prisma.
- [ ] **Step 4: Run, expect PASS**, then the full suite: `cd app && npx vitest run` (baseline: 315 passing).
- [ ] **Step 5: Commit**: `feat(duplicate-day): server never erases fields on preserveExisting saves`

---

### Task 2: Comparison module

**Files:**
- Create: `app/src/cycle-tracking/duplicateDay.ts`
- Modify: `app/src/cycle-tracking/utils.ts` (add `formatDateDDMM`)
- Test: `app/src/cycle-tracking/__tests__/duplicateDay.test.ts`

**Interfaces:**
- Consumes: `CycleDayPartialArgs` and `stripEmptyFields` (Task 1, `cycleDayDataBuilders.ts`; the latter in tests only), `convertToCelsiusForStorage`, `toDisplayTemperature`, `formatTemperature` from `utils.ts`.
- Produces:
  ```ts
  export type DayFormValues = {
    bbt: string;              // raw input, display unit
    bbtTime: string;
    hadIntercourse: boolean;
    excludeFromInterpretation: boolean;
    cervicalAppearance: string; // '' = unselected
    cervicalSensation: string;
    opkStatus: string;
    menstrualFlow: string;
    disturbanceFactors: string[];
    travelTimeDiff: number;
    notes: string;
  };
  export type SavedDay = Pick<CycleDay, 'id' | 'dayNumber' | 'date' | 'bbt' | 'bbtTime' | 'hadIntercourse'
    | 'excludeFromInterpretation' | 'cervicalAppearance' | 'cervicalSensation' | 'opkStatus'
    | 'menstrualFlow' | 'disturbanceFactors' | 'travelTimeDiff' | 'notes'>;
  export type FieldRow = { label: string; saved: string; next: string };
  export type DuplicateComparison = {
    conflicts: FieldRow[];        // shown in the table
    kept: { label: string; saved: string }[]; // shown in the green line
    fillIns: CycleDayPartialArgs;     // saved empty, new filled
    replacements: CycleDayPartialArgs; // conflicting new values
  };
  export function findSavedDayForDate<T extends { dayNumber: number }>(
    days: T[], cycleStartDate: Date | string, isoDate: string): T | null;
  export function compareWithSavedDay(
    form: DayFormValues, saved: SavedDay, unit: TemperatureUnit): DuplicateComparison;
  export function buildDuplicateSavePayload(
    c: DuplicateComparison, choice: 'replace' | 'keep'): CycleDayPartialArgs;
  // utils.ts
  export function formatDateDDMM(isoDate: string): string; // "2026-05-14" -> "14/05", split the string; never via Date local fields
  ```
- Rules come from the spec table. The display value of each field uses the Add page's option labels (e.g. `STICKY` → `Sticky`, `peak` → `Peak LH – Surge`, `VERY_HEAVY` → `Very Heavy`). Disturbances are shown as labels without emoji, joined by `, `. Travel is shown as `+3h` / `-2h` / `0h`. BBT uses `formatTemperature`. Booleans in `kept` show as `yes`. Export one `ENUM_LABELS` map from this module. `AddCycleDayPage` is not refactored to use it (YAGNI).
- `findSavedDayForDate` uses the same day-number formula as `AddCycleDayPage.tsx:92-96`, returns `null` for day number < 1, and otherwise returns the matching `dayNumber`.
- `buildDuplicateSavePayload('replace')` = `{...fillIns, ...replacements}`; `'keep'` = `fillIns`. BBT in payloads is Celsius via `convertToCelsiusForStorage`. Travel is coupled both ways so it survives Task 1's `stripEmptyFields`: when `disturbanceFactors` is in a payload and includes TRAVEL, the payload also includes the form's `travelTimeDiff`; and **whenever `travelTimeDiff` is in a payload, the payload also includes the form's full `disturbanceFactors`**, even if that set compared equal. Travel time depends on the factor set: when the saved day has no TRAVEL but the factor set itself is a **conflict** (e.g. saved `['STRESS']`, new `['TRAVEL']`), `travelTimeDiff` is classified with that conflict. It goes into `replacements` only, gets no separate dialog row (the `Disturbance Factor` row covers it), and the `'keep'` payload contains neither `disturbanceFactors` nor `travelTimeDiff`. Travel time is a fill-in only when the saved factor set is empty.

- [ ] **Step 1: Write failing tests.** Fixture `saved`: dayNumber 2, bbt 36.45, bbtTime '06:30', cervicalAppearance 'STICKY', notes 'note', everything else empty/false/[]. Tests:
  - `spec example`: form bbt '36.70', bbtTime '07:15', rest empty, unit CELSIUS → `conflicts` equals `[{label:'BBT',saved:'36.45°C',next:'36.70°C'},{label:'BBT Time',saved:'06:30',next:'07:15'}]`; `kept` labels equal `['Cervical Fluid · Appearance','Notes']`; `fillIns` equals `{}`.
  - `no conflicts when only empty fields`: an all-empty form → `conflicts` `[]`, `fillIns` `{}`.
  - `fill-in`: form menstrualFlow 'LIGHT' → `conflicts` `[]`, `fillIns` `{ menstrualFlow: 'LIGHT' }`.
  - `same value is not a conflict`: form bbt '36.45' → no BBT row.
  - `fahrenheit equal at display precision`: unit FAHRENHEIT, form bbt equal to `toDisplayTemperature(36.45,'FAHRENHEIT').toFixed(2)` → no BBT row.
  - `checkbox never conflicts`: saved hadIntercourse true, form false → no conflict, `kept` includes `Intercourse`; saved false, form true → `fillIns.hadIntercourse === true`.
  - `disturbances compared as set`: saved ['STRESS','ALCOHOL'], form ['ALCOHOL','STRESS'] → no row; form ['STRESS'] → a `Disturbance Factor` row.
  - `travel 0 vs saved +3 conflicts`: saved ['TRAVEL'], travelTimeDiff 3; form ['TRAVEL'], 0 → a row `{label:'Travel time difference', saved:'+3h', next:'0h'}`.
  - `travel-only replace survives the server guard`: same fixture → `stripEmptyFields(buildDuplicateSavePayload(c,'replace'))` equals `{ disturbanceFactors: ['TRAVEL'], travelTimeDiff: 0 }`.
  - `keep existing never overwrites a conflicting factor set`: saved ['STRESS'], form ['TRAVEL'], 0 → `buildDuplicateSavePayload(c,'keep')` has neither `disturbanceFactors` nor `travelTimeDiff`; `stripEmptyFields(buildDuplicateSavePayload(c,'replace'))` equals `{ disturbanceFactors: ['TRAVEL'], travelTimeDiff: 0 }`; `conflicts` has a `Disturbance Factor` row and no `Travel time difference` row.
  - `payloads`: for the spec example, `buildDuplicateSavePayload(c,'keep')` equals `{}`; `'replace'` has `bbtTime: '07:15'` and `bbt` close to 36.70.
  - `findSavedDayForDate`: start '2026-05-13'; '2026-05-14' with a day of dayNumber 2 → that day; '2026-05-12' → `null`; '2026-05-20' with no day 8 → `null`.
  - `formatDateDDMM('2026-05-14')` → `'14/05'` (string-based, so stored UTC-midnight dates never shift a day west of UTC).
- [ ] **Step 2: Run, expect FAIL**: `cd app && npx vitest run src/cycle-tracking/__tests__/duplicateDay.test.ts`
- [ ] **Step 3: Implement** `duplicateDay.ts` and `formatDateDDMM`, iterating over a single ordered field table (label + empty test + equality + display) so the conflict order follows the form order.
- [ ] **Step 4: Run, expect PASS**, then the full suite.
- [ ] **Step 5: Commit**: `feat(duplicate-day): field-level comparison of new entry vs saved day`

---

### Task 3: Confirmation dialog component

**Files:**
- Create: `app/src/cycle-tracking/components/DuplicateDayDialog.tsx`
- Test: `app/src/cycle-tracking/__tests__/DuplicateDayDialog.test.tsx`

**Interfaces:**
- Consumes: `FieldRow` and `DuplicateComparison['kept']` (Task 2).
- Produces:
  ```ts
  export function DuplicateDayDialog(props: {
    open: boolean;
    dateLabel: string;           // "14/05"
    conflicts: FieldRow[];
    kept: { label: string; saved: string }[];
    busy?: boolean;              // disables buttons while saving
    onReplace: () => void;
    onKeepExisting: () => void;
    onCancel: () => void;        // also fired on Esc / overlay click
  }): JSX.Element;
  ```
- Build on `@radix-ui/react-dialog` directly (same primitive as `components/ui/sheet.tsx`), centred, `max-w-md`, phone-safe (`w-[calc(100%-2rem)]`). Amber for Replace (match the approved mockup `.superpowers/brainstorm/17185-1792153801/content/duplicate-day-flow.html`, Step 2 option B).

- [ ] **Step 1: Write failing tests** (pattern: `NoteEditorSheet.test.tsx`):
  - renders title `Overwrite existing data for 14/05?` and the exact body copy.
  - renders a row per conflict with saved and new text; the saved cell has class `line-through`.
  - renders `✓ Kept as is: Cervical Fluid · Appearance (Sticky), Notes (note)` when `kept` is given; the text is absent when `kept` is `[]`.
  - clicking `Replace` / `Keep existing` / `Cancel` calls the matching handler once.
  - buttons are disabled when `busy`.
- [ ] **Step 2: Run, expect FAIL**: `cd app && npx vitest run src/cycle-tracking/__tests__/DuplicateDayDialog.test.tsx`
- [ ] **Step 3: Implement** the component.
- [ ] **Step 4: Run, expect PASS**, then the full suite.
- [ ] **Step 5: Commit**: `feat(duplicate-day): overwrite confirmation dialog`

---

### Task 4: Wire into the Add Daily Entry page

**Files:**
- Modify: `app/src/cycle-tracking/AddCycleDayPage.tsx` (date row ~line 333-355, `handleSubmit` lines 98-157, render the dialog)

**Interfaces:**
- Consumes: `findSavedDayForDate`, `compareWithSavedDay`, `buildDuplicateSavePayload`, `formatDateDDMM` (Task 2); `DuplicateDayDialog` (Task 3); `preserveExisting` (Task 1).

Behaviour (only when `dayId` is absent; the edit path stays byte-for-byte the same):
- `duplicateDay = !dayId && cycle ? findSavedDayForDate(cycle.days, cycle.startDate, date) : null`.
- When `duplicateDay`, render the notice under the date/Cycle Day row (amber: `border-amber-300 bg-amber-50 text-amber-900`, dark-mode equivalents) with the exact copy, `formatDateDDMM(date)` (the selected `YYYY-MM-DD` input value, not the stored `Date`), `Day {duplicateDay.dayNumber}`, and a `<Link>` to `/cycles/{cycleId}/add-day?dayId={duplicateDay.id}` (append `&returnTo=chart` if `returnTo === 'chart'`). On this route change the page must re-initialise from `existingDay`. Verify the existing `useEffect` does this, since `dayId` changes on the same component.
- Submit with `duplicateDay`: build `DayFormValues` from state and call `compareWithSavedDay`. With no conflicts, save `buildDuplicateSavePayload(c,'replace')` immediately. With conflicts, open the dialog and keep the comparison in state. Replace / Keep existing save the matching payload; Cancel closes the dialog and leaves the form as typed.
- Every Add-mode save (duplicate or not) sends `preserveExisting: true`. A duplicate save sends `{ cycleId, date, ...payload, preserveExisting: true }`.
- After a successful save, keep the current reset + navigate behaviour.

- [ ] **Step 1: Implement** as above.
- [ ] **Step 2: Type-check, lint and run tests**:
  Run: `cd app && npx tsc --noEmit -p . && npm run lint && npx vitest run`
  Expected: no new type or lint errors in touched files; all tests pass.
- [ ] **Step 3: Manual check in the running local app** (`http://localhost:3000`, signed-in dev account; use a past cycle or a throwaway day so real data isn't damaged):
  (a) open Add Day when today is already recorded → notice is visible on load;
  (b) the link opens the Edit page with saved values filled in;
  (c) a duplicate date with only empty fields saves with no dialog, and saved fluid/notes survive;
  (d) a different BBT and time → dialog with exactly those two rows plus the kept line; Cancel leaves the form intact; Keep existing leaves BBT unchanged; Replace updates it;
  (e) Travel +3 saved vs Travel 0 new → `Travel time difference` row;
  (f) the Edit page clearing a note still clears it;
  (g) phone width (~400px): notice and dialog fit without horizontal scroll.
  Capture screenshots of (a) and (d).
- [ ] **Step 4: Commit**: `feat(duplicate-day): warn and confirm before overwriting a recorded day`
