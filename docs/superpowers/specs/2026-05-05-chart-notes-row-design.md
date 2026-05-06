# Chart Notes Row — Design

**Date:** 2026-05-05
**Status:** Spec for review

## Summary

Add a free-text **Notes** row at the bottom of the lower table on the cycle chart. Each day can carry up to 150 characters of plain text. The row is **collapsible**: by default it sits at 28 px showing only a small walnut pencil glyph on days that have a note; expanded, it grows to 120 px and displays the note text vertically (Sensiplan paper-chart style). The expand/collapse preference is saved per-user. Notes are edited either by tapping a cell on the chart (opens a Sheet editor) or via a new section on the AddCycleDay form.

## User-facing description

Imagine you want to record context for a day — "bad cramps morning, took ibuprofen", "travel to Berlin, slept 4 h", "stressful argument at work". Today the chart has nowhere for that. After this change:

- Below the existing Disturbance row, you see a new row labelled **▶ Notes**.
- A small ✎ in walnut brown appears on each day where a note exists.
- Tapping any day's cell opens an editor where you type, save, or delete the note (max 150 chars, character counter included).
- Clicking the **▶ Notes** label expands the row so the text becomes visible inline (read bottom-up, like in a paper Sensiplan chart). Click again to collapse.
- The same field also appears on the AddCycleDay form, after Disturbance Factor, so you can fill it in alongside the rest of the day's data.
- The expanded/collapsed choice is remembered for next time, on every device you log into.

## Scope (in)

- One free-text note per day (max 150 chars), stored per `CycleDay`.
- New row in the lower table on `CycleChartPage` (collapsible).
- New `NoteEditorSheet` component reachable from the chart row.
- New "Notes" section on `AddCycleDayPage`.
- Persisted user preference for the expand/collapse state.

## Scope (out / v1.1)

- **Hover-preview tooltip** in collapsed mode (showing the first ~80 chars on hover) — punted to v1.1.
- **Multiple notes per day**, **note history**, **rich text / markdown**, **note tags or symptoms list** — out of scope.
- **Notes search / filter** across cycles — out of scope.

## Data model

### `CycleDay` — add one column

```prisma
model CycleDay {
  // ...existing fields...
  notes String?
}
```

- Optional (`String?`) — most days will have no note.
- 150-char limit is enforced at the **API layer** (Wasp action / validation), not the database. Postgres `text` is unbounded, but a runtime check produces clearer errors than a DB constraint.

### `UserSettings` — add one column

```prisma
model UserSettings {
  // ...existing fields...
  notesRowExpanded Boolean @default(false)
}
```

- Default `false`: first-time users see the compact 28 px row, matching everyone else's existing chart density.

### Migration

A single Prisma migration with two `ALTER TABLE` statements; no backfill needed (both columns are nullable / defaulted).

## Chart row UI

### Position

The new row goes at the **very bottom** of the lower table, immediately below the Disturbance row.

**Top offset for the row:** `plotAreaTop + chartHeight + 262` (existing 234 px Disturbance offset + 28 px Disturbance row).

**Bottom padding of the chart container** ([CycleChartPage.tsx:1189](app/src/cycle-tracking/CycleChartPage.tsx:1189) — currently `paddingBottom: '262px'`): the lower-table rows are absolutely positioned, and the container reserves exactly the existing total height. Adding the Notes row requires this padding to grow dynamically:

| State | Notes row height | Chart bottom padding |
|---|---|---|
| Collapsed (default) | 28 px | `262 + 28 = 290 px` |
| Expanded | 120 px | `262 + 120 = 382 px` |

In code, replace the literal `'262px'` with a derived value:

```tsx
const NOTES_ROW_HEIGHT = notesRowExpanded ? 120 : 28;
const LOWER_TABLE_PADDING_BOTTOM = 262 + NOTES_ROW_HEIGHT;
// ...
style={{ paddingTop: '108px', paddingBottom: `${LOWER_TABLE_PADDING_BOTTOM}px` }}
```

Without this, the new row will overflow the chart container — most visibly the 120 px expanded state will overlap whatever sits below the chart on the page.

### Row label (left column, in the y-axis label area)

Same styling as the existing Time / LH / CF / Disturbance labels (right-aligned, `text-xs font-medium`, `bg-slate-50`, `border-slate-300`):

```
▶ Notes  ⓘ
```

- The `▶` chevron is part of the label and rotates 90° when the row is expanded.
- Clicking **anywhere on the label area** (not just the chevron) toggles the row — bigger tap target, better on mobile.
- The ⓘ shows a tooltip explaining the row.

### Cell colours

| Element | Colour | Purpose |
|---|---|---|
| Cell background | `#f5f5f4` (Tailwind stone-100) | rounded 2 px fill, mirrors CF / Disturbance pattern |
| Pencil glyph & note text | `#78350f` (walnut) | indicator + text colour |

This is a colour family **not yet used** by any other row (existing rows use blue, pink, green, violet, red, amber). Stone + walnut reads as "journal / paper / note" without crowding the existing colour-meaning vocabulary.

### Two visual states

**Collapsed (default, 28 px tall):**
- Each cell has the stone background, rounded 2 px.
- Days *with* a note: a small ✎ pencil glyph centered, walnut, font-size ~12 px.
- Days *without* a note: just the empty stone cell.
- Tap on any cell → opens the Sheet editor for that day.

**Expanded (120 px tall):**
- Same stone cell background.
- Days *with* a note: vertical text using `writing-mode: vertical-rl; transform: rotate(180deg)` so it reads bottom-up (Sensiplan-classic). Font-size ~9.5 px, walnut colour, `padding: 4px 2px`. Long notes truncate with `text-overflow: ellipsis`.
- Days *without* a note: empty stone cell.
- Tap on any cell → opens the Sheet editor for that day.

### Implementation notes

- **Source of truth for "does this day have a note?":** read from `allCycleDaysMap` (built from `cycle.days` in [CycleChartPage.tsx:375](app/src/cycle-tracking/CycleChartPage.tsx:375)), **not** `chartData.allDaysMap`. The latter only contains days that have a BBT, so days with notes-but-no-BBT would render as empty in the Notes row.
- **Pointer events:** all existing lower-table cells use `pointerEvents: 'none'` so the chart canvas underneath catches click events. The Notes cells must opt back into pointer events (`pointerEvents: 'auto'` on the cell wrapper) and attach an explicit click/touch handler that opens the Sheet for that day. The same applies to the row label area for the expand/collapse toggle. Without this, taps will fall through to the chart and the sheet will never open.

### Toggle interaction

- User clicks the row label / chevron → row flips immediately (optimistic update); `updateUserSettings({ notesRowExpanded: !current })` fires in the background.
- On mutation failure: revert the flip + show a toast.
- Initial value comes from the existing `useQuery(getUserSettings)`. While settings load, render the row in its **collapsed** (default) state — never blank — and swap to expanded only if the loaded value is `true`. This avoids a flicker between "nothing" and the persisted state.

## Sheet editor (`NoteEditorSheet`)

### Trigger

Tap any Notes-row cell — collapsed *or* expanded mode, with or without an existing note. The Sheet opens for that specific day.

### Component

Built on the existing radix-based `Sheet` primitive in `app/src/components/ui/sheet.tsx`.

### Breakpoint behaviour

- Mobile (`<768 px`): Sheet slides up from the **bottom**, ~50 % viewport height, rounded top corners.
- Desktop (`≥768 px`): Sheet slides in from the **right**, fixed width ~420 px, full height.

In this codebase, `Sheet` is the radix dialog root and the `side` variant lives on `SheetContent` (see [app/src/components/ui/sheet.tsx](app/src/components/ui/sheet.tsx)). The component therefore wraps with:

```tsx
<Sheet open={...} onOpenChange={...}>
  <SheetContent side={isMobile ? 'bottom' : 'right'}>
    {/* header / textarea / footer */}
  </SheetContent>
</Sheet>
```

`isMobile` comes from a `useMediaQuery('(max-width: 767px)')` hook (or `matchMedia` directly).

### Layout

```
┌────────────────────────────────────┐
│  Note · Day 5 (Mon, May 4)      ✕  │   header
├────────────────────────────────────┤
│                                    │
│  ┌──────────────────────────────┐  │
│  │ Bad cramps morning, took     │  │   textarea
│  │ ibuprofen at 9. Stressful…   │     (autofocus, cursor at end)
│  │                              │  │
│  └──────────────────────────────┘  │
│                       42 / 150     │   live counter
│                                    │
├────────────────────────────────────┤
│  Delete    │   Cancel   │   Save   │   footer
└────────────────────────────────────┘
```

### Behaviour

- **Header title:** `Note · Day {dayNumber} ({short date})` — same date format used elsewhere in the app. ✕ closes (same as Cancel).
- **Textarea:** shadcn `Textarea`, `maxLength={150}`, autofocus on open, cursor at end of any existing text, ~5 visible rows. Plain text only.
- **Counter:** updates live. Colours:
  - 0–129 chars: default slate
  - 130–149: amber `#d97706`
  - 150: red `#dc2626`
- **Save button:** primary; disabled when text is unchanged from the initial value. On click → `createOrUpdateCycleDay({ ..., notes: trimmed })`, close sheet, success toast. Loading spinner during in-flight mutation.
- **Cancel button:** secondary; closes without saving. **If text differs from the initial value**, show an inline "Discard changes?" confirmation before closing.
- **Delete button:** only shown when the day already has a note. Inline confirm — first tap morphs the button into "Tap again to delete", second tap calls `createOrUpdateCycleDay({ ..., notes: null })`, closes sheet, toast.
- **Empty save:** if the user clears the text and hits Save, treat as Delete (`notes: null`).
- **Trim & whitespace:** save the trimmed value; if trim → empty, store `null`.
- **Server validation:** API rejects strings >150 chars even if the client `maxLength` is bypassed. The user sees a non-blocking error toast and the sheet stays open with text intact.

## AddCycleDay form integration

### Where

A new **"Notes"** section, placed right after the existing "Disturbance Factor" section. Mirrors the chart-row position (both at the bottom).

### Layout

```
┌─ Notes ─────────────────────────────┐
│  ┌───────────────────────────────┐  │
│  │ (textarea, 5 rows)            │  │
│  └───────────────────────────────┘  │
│                       42 / 150      │
└─────────────────────────────────────┘
```

### Behaviour

- Section header `<h3>Notes</h3>` matching the styling of the existing "Disturbance Factor" header.
- Same shadcn `Textarea` component used elsewhere, `maxLength={150}`, `rows={5}`.
- Same live counter (default → amber at >130 → red at 150).
- Same trim rules on submit: store `value.trim() || null`.
- **No Save / Cancel / Delete buttons** here — the value rides along with the rest of the form on the existing Save action.
- Pre-fills from `existingDay.notes` on edit, just like `disturbanceFactors` and other fields do.

### State plumbing in `AddCycleDayPage.tsx`

- New `useState<string>('')` for `notes`, alongside the existing `disturbanceFactors`, `travelTimeDiff`, etc.
- Hydrate from `existingDay.notes ?? ''` in the same `useEffect` that already hydrates the other fields.
- Include `notes: notes.trim() || null` in the `createOrUpdateCycleDay` payload.
- Reset to `''` after a successful submit, alongside the other resets.

## Operations / mutations

### `createOrUpdateCycleDay` — extend with `notes`

Add `notes` to the args type:

```ts
type CreateOrUpdateCycleDayArgs = {
  // ...existing fields...
  disturbanceFactors?: string[];
  travelTimeDiff?: number | null;
  notes?: string | null;        // NEW — null clears the note
};
```

Inside the operation:
- **Validation:** if `notes` is provided and `notes.length > 150` → throw `HttpError(400, 'Note too long')`.
- **Trim server-side too** (`notes?.trim() || null`) — the client also trims, but doing it again on the server prevents a buggy client from writing pure-whitespace notes.

#### Update path: switch every optional field to "set only if present in args"

The current update branch in [operations.ts:387–403](app/src/cycle-tracking/operations.ts:387) writes **every** optional field unconditionally — for example `disturbanceFactors: args.disturbanceFactors ?? []` and `travelTimeDiff: args.travelTimeDiff ?? null`. That works today only because the **only** caller (the AddCycleDay form) always sends every field.

The Notes Sheet is a partial-update caller: it sends `{ cycleId, dayNumber, date, notes }` and nothing else. With the current op, that would silently clear `disturbanceFactors`, `travelTimeDiff`, and reset `bbt`/`cervicalAppearance`/etc to `undefined`. To prevent that data loss, **every optional field on the update path must be conditionally included** — set only if the matching key was present in `args`:

```ts
const data: Prisma.CycleDayUpdateInput = { date: entryDate, dayOfWeek };
if ('bbt' in args)                       data.bbt = args.bbt;
if ('bbtTime' in args)                   data.bbtTime = args.bbtTime;
if ('hadIntercourse' in args)            data.hadIntercourse = args.hadIntercourse;
if ('excludeFromInterpretation' in args) data.excludeFromInterpretation = args.excludeFromInterpretation;
if ('cervicalAppearance' in args)        data.cervicalAppearance = args.cervicalAppearance;
if ('cervicalSensation' in args)         data.cervicalSensation = args.cervicalSensation;
if ('opkStatus' in args)                 data.opkStatus = args.opkStatus;
if ('menstrualFlow' in args)             data.menstrualFlow = args.menstrualFlow;
if ('disturbanceFactors' in args)        data.disturbanceFactors = args.disturbanceFactors;
if ('travelTimeDiff' in args)            data.travelTimeDiff = args.travelTimeDiff;
if ('notes' in args)                     data.notes = args.notes?.trim() || null;
await context.entities.CycleDay.update({ where: { id: existingDay.id }, data });
```

Use `'key' in args` rather than `args.key !== undefined` so an explicit `null` (e.g. clearing a note) is preserved.

To reflect this in the type, **change `hadIntercourse` and `excludeFromInterpretation` from required to optional** in `CreateOrUpdateCycleDayArgs` — the form caller still sends them; the sheet caller may omit them on update.

#### Create path: defaults for required fields when creating from a partial payload

The chart can be tapped on a cell that has **no `CycleDay` record yet** (a padded day in `displayDayRange` that was never logged). For that case, the sheet payload looks like `{ cycleId, dayNumber, date, notes }` — no booleans. When `existingDay === null`, the create branch must:

1. Compute `date` from `cycle.startDate + (dayNumber - 1) * 86400000` if the caller didn't pass one. (The sheet *will* pass it; this is defence-in-depth.)
2. Default `hadIntercourse` and `excludeFromInterpretation` to `false` when not provided. The Prisma schema already has `@default(false)` for both, so the simplest implementation is to omit them from the `create` data when they're absent in `args` and let Prisma fill the default.

```ts
const createData: Prisma.CycleDayCreateInput = {
  cycle: { connect: { id: args.cycleId } },
  dayNumber,
  date: entryDate,
  dayOfWeek,
  // include each optional field only if present in args, same as update
  ...(('bbt' in args) && { bbt: args.bbt }),
  // ...etc...
  ...(('notes' in args) && { notes: args.notes?.trim() || null }),
};
await context.entities.CycleDay.create({ data: createData });
```

This makes the op safe for both the existing form caller (full payload) and the new sheet caller (partial payload, possibly creating a fresh row).

This single op now covers:
- **AddCycleDay form save** — full payload, all fields present, behaves as today.
- **Sheet save on an existing day** — only `notes` changes; every other field is preserved.
- **Sheet save on a blank padded day** — creates a new `CycleDay` with just the note (and Prisma-default booleans).

### Rename `updateUserTemperaturePreference` → `updateUserSettings`

Generalise the existing op to accept any subset of UserSettings fields:

```ts
type UpdateUserSettingsArgs = {
  temperatureUnit?: TemperatureUnit;
  notesRowExpanded?: boolean;
};
```

- Only fields present in `args` get written to the DB.
- Update the one existing call-site (`SettingsPage`) to pass `{ temperatureUnit }` to the renamed op.
- Update the Wasp declaration in `main.wasp` (rename the action; entities are unchanged).

**Why generalise rather than add a second op:** we're already adding a second preference, and a third (e.g. chart zoom level, default view) is a likely next step. Generalising now means the next preference is one line of code, not a whole new action + import + Wasp declaration. The risk is tiny — exactly one call-site moves to the new name, and Wasp's typing turns any miss into a compile error.

### Client side

- `NoteEditorSheet` calls `createOrUpdateCycleDay({ cycleId, dayNumber, date, notes })` — only the four fields it actually changes / needs for routing. The op's new conditional update path preserves every other field; the create path falls back to Prisma defaults for booleans when no `CycleDay` exists yet.
- `date` is computed by the chart when opening the sheet: if the day already has a `CycleDay` record, use its `date`; otherwise compute `cycle.startDate + (dayNumber - 1) * 86_400_000` (millis). The op tolerates either path.
- The chevron toggle calls `updateUserSettings({ notesRowExpanded })` — single-field call, optimistic.
- Existing query invalidation (Wasp's `entities` declaration on each action) handles cache refresh — no manual `invalidateQueries`.

### Failure modes

- Save fails → toast `"Couldn't save note. Try again."`, sheet stays open with text intact.
- Toggle fails → revert the optimistic flip + toast.

## Acceptance checklist

- [ ] Schema migration adds `CycleDay.notes` (nullable text) and `UserSettings.notesRowExpanded` (boolean, default false). `prisma migrate dev` runs cleanly on a fresh DB.
- [ ] `createOrUpdateCycleDay` accepts and persists `notes` (with 150-char server-side validation and trim).
- [ ] On the **update** path, every optional field is now set only when present in `args` (using `'key' in args`). Saving a note on a day that has Disturbance, Travel, BBT, CF etc. preserves every existing value — verified by an integration test that updates only `notes` and asserts the rest of the row is unchanged.
- [ ] On the **create** path, calling `createOrUpdateCycleDay` for a day that has no existing `CycleDay` record with only `{ cycleId, dayNumber, date, notes }` succeeds and creates a row with `hadIntercourse = false`, `excludeFromInterpretation = false` (Prisma defaults).
- [ ] `hadIntercourse` and `excludeFromInterpretation` are no longer required in `CreateOrUpdateCycleDayArgs`. The form caller still sends them; the sheet caller may omit them.
- [ ] The chart container's bottom padding grows from `262 px` to `290 px` (collapsed) or `382 px` (expanded) so the Notes row doesn't overflow into following content. Verified by visually inspecting both states with content directly below the chart.
- [ ] `<SheetContent side={...}>` (not `<Sheet side={...}>`) is what receives the responsive `'bottom' | 'right'` value, matching the `sheetVariants` API in [app/src/components/ui/sheet.tsx](app/src/components/ui/sheet.tsx).
- [ ] The Notes row reads from `allCycleDaysMap` (all `CycleDay` records), **not** `chartData.allDaysMap` (BBT-only). A day with a note but no BBT must still render the ✎ glyph / vertical text.
- [ ] Notes-row cells and the row label opt into `pointerEvents: 'auto'` and have explicit click/touch handlers — taps actually open the Sheet / toggle the row instead of falling through to the chart canvas.
- [ ] `updateUserTemperaturePreference` is renamed to `updateUserSettings`, accepts any subset of fields. SettingsPage still works.
- [ ] Chart shows the new Notes row at the bottom of the lower table, with the correct stone/walnut palette, label, and chevron.
- [ ] Collapsed mode shows a walnut ✎ on days with notes, nothing on days without.
- [ ] Expanded mode shows the note text vertically, bottom-up, truncating with ellipsis when too long.
- [ ] Clicking the row label (anywhere) toggles expand/collapse and persists the choice; the choice survives a page reload and is consistent across devices.
- [ ] Tapping any cell opens the Sheet editor for that day, on mobile (bottom) and desktop (right).
- [ ] Sheet editor: header shows day + date, textarea autofocuses, counter colours change at 130 / 150, Save / Cancel / Delete behave as specified, Cancel-with-changes prompts a discard confirmation, Delete uses an inline tap-again confirm.
- [ ] AddCycleDayPage shows the new Notes section after Disturbance, hydrates and saves correctly, with the same counter behaviour.
- [ ] Empty / whitespace-only notes are stored as `null`.
- [ ] Server rejects > 150 chars with a 400 error; client surfaces a toast and keeps the sheet open.

## Open questions

None — every choice was settled in the brainstorming session preceding this spec.

## Notes

- v1.1 candidate: hover-preview tooltip in collapsed mode (first ~80 chars of the note shown on hover, so users don't have to open the Sheet just to peek).
- The 150-char limit is a soft choice based on a sample-text comparison during brainstorming; it can be revisited later by changing the constant in one place (server validation) and updating the client `maxLength`.
