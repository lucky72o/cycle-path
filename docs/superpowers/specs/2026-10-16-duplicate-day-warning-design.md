# Duplicate day warning — design

**Date:** 2026-10-16
**Branch:** `feat/duplicate-day-warning`
**Status:** Draft for approval

## Why

The user found that adding a daily entry for a date that's already recorded silently overwrites the saved entry. It's actually worse than replacing the BBT: the Add Daily Entry page sends every field, including empty ones, so a second entry with only a temperature also **erases** the saved cervical fluid, menstrual flow, OPK, disturbances and notes, and resets intercourse to "no". Nothing warns the user.

Today's code paths:

- `app/src/cycle-tracking/AddCycleDayPage.tsx:114-132`: the submit handler sends all fields, with empty ones as `null` / `false` / `[]`.
- `app/src/cycle-tracking/operations.ts:376-390`: `createOrUpdateCycleDay` finds the existing row by `(cycleId, dayNumber)` and updates it in place.
- `app/src/cycle-tracking/cycleDayDataBuilders.ts:25-45`: the update data includes every key present in `args`, so an explicit `null` clears the stored value.
- BBT is the one exception. When the BBT input is empty and there's no `dayId`, `computeBbtForStorage` returns `undefined`, the key is omitted, and the saved BBT survives.

The database already allows only one row per day (`schema.prisma`: `@@unique([cycleId, dayNumber])`). There's no duplicate *row* problem, only silent overwriting and erasing.

## Goals

1. Warn the user **before** they type, as soon as the chosen date already has an entry, and offer a way to edit that entry instead.
2. Never erase saved data because a field on the Add page was left empty.
3. When the new entry really conflicts with saved values, show exactly which fields will change (saved value → new value) and let the user decide.

## Non-goals

- **New-cycle overlap** (separate follow-up feature). Starting a new cycle on a date that the previous cycle already has days for leaves those days in both cycles. That's a cross-cycle duplicate, not an overwrite, and the user asked for it to be handled separately.
- **CSV import.** The page already says it overwrites matching days. Unchanged.
- **Chart notes panel.** It's opened from a specific day, shows that day's note and only edits the note, so it's already an edit. Unchanged.
- **Edit Daily Entry page** (`AddCycleDayPage` with a `dayId`). No warning, and clearing a field there still clears it.
- **History or undo** of replaced values. Once the user confirms Replace, old values are gone; the user confirmed this is fine.

## Anti-goals

- A warning that pops up when nothing would actually change (it trains people to click through).
- Any path where the user loses data without seeing it listed first.
- Changing behaviour of the Edit page or chart notes panel as a side effect.

## Behaviour

Running example: Cycle #7 started 13/05/2026. 14/05 (Day 2) is saved with BBT 36.45 °C at 06:30, Cervical Fluid · Appearance Sticky, and a note. The user opens Add Daily Entry and enters 14/05 with BBT 36.70 at 07:15 and nothing else.

### Step 1 — notice when the date is set (C)

Applies to the Add Daily Entry page only (no `dayId`).

Whenever the date field resolves to a day that already has a `CycleDay` in this cycle, show a notice directly under the date / Cycle Day row. This includes the initial load, since the page defaults to today and today may already be recorded:

> ⚠️ You already have an entry for **14/05 (Day 2)**. Saving here will replace existing data. [Edit that entry instead]

- Exact copy (user-approved): "You already have an entry for {DD/MM} (Day {n}). Saving here will replace existing data. Edit that entry instead". "Edit that entry instead" is a link.
- The link navigates to that day's existing Edit page (the same route the Days list uses for editing). Anything typed on the Add page is dropped; carrying values over is not required.
- Style: amber/warning notice, matching the approved mockup (`.superpowers/brainstorm/17185-1792153801/content/duplicate-day-flow.html`, Step 1).
- The notice hides as soon as the date changes to a free day.
- Detection uses the cycle's days the page already has loaded, matched the same way the server matches: by day number computed from the cycle start date.

### Step 2 — confirmation at Save (B)

When the user presses Save on the Add page and the date already has an entry, compare the form with the saved day field by field.

**Rules, per field:**

| New entry | Saved day | Result |
|---|---|---|
| empty | anything | **keep** saved value (never erased) |
| filled | empty | **fill in** (no conflict) |
| filled, same value | filled | no change |
| filled, different value | filled | **conflict** |

What "empty" and "same" mean for each field:

- **BBT:** empty input = empty. "Same" is compared at display precision (2 decimals in the user's unit), so °F↔°C storage rounding never creates a false conflict.
- **BBT Time:** empty string = empty; compare as strings.
- **Cervical appearance, sensation, menstrual flow, OPK:** unselected = empty.
- **Notes:** blank after trim = empty; compare the normalised text.
- **Disturbance factors:** none ticked = empty. When ticked, compare as a set; a different set is a conflict.
- **Travel time difference:** a field of its own, with its own dialog row ("Travel time difference", e.g. Saved +3h → New 0h). It counts as empty only when TRAVEL is not ticked in the new entry. When the new entry ticks TRAVEL, its hour value (including 0, which is a valid "no time-zone shift") is a real value: it fills in if the saved day had no TRAVEL, and conflicts if the saved day had TRAVEL with different hours. *(Builder/Claude call.)*
- **Had intercourse, Exclude from interpretation (checkboxes):** unticked = empty (keeps the saved value). Ticked fills in. Because the Add page can't tell "unticked" from "deliberately no", these never conflict. *(Builder/Claude call. Flag if wrong.)*

**Outcomes:**

- **No conflicts:** save immediately with no dialog. Saved values are kept for every field left empty; filled-in fields are added.
- **One or more conflicts:** open the confirmation dialog (version B, user-approved):

  - Title: **"Overwrite existing data for {DD/MM}?"**
  - Grey text (exact, user-approved): **"This day already has an entry. Saving will replace these fields:"**
  - Table with columns **Field | Saved | New**, one row per conflicting field. The saved value is struck through in a readable dark grey (slate-600, `#475569`), not a pale grey. The new value is bold navy blue `#1e3a8a`, the text colour of the graph's Week Day / Cycle Day chips (`CycleChartPage.tsx` `MONTH_PALETTE[0].chipText`). Field names use the Add page's own labels (e.g. "BBT", "BBT Time", "Cervical Fluid · Appearance"). *(Colours revised 2026-10-17, user-approved mockup `.superpowers/brainstorm/31473-1792262571/content/button-order-colours-v8.html`.)*
  - Below the table, a green line listing saved fields that will be kept because the new entry left them empty: "✓ Kept as is: Cervical Fluid · Appearance (Sticky), Notes". Omit the line when nothing is kept.
  - Buttons, in this order on every screen size (left to right on desktop, top to bottom on phones): **Keep existing** · **Replace** · **Back to form**. *(Order and colours revised 2026-10-17; "Cancel" renamed "Back to form" the same day because "Cancel" didn't say what happens. User-approved mockup `.superpowers/brainstorm/31473-1792262571/content/button-order-colours-v8.html`.)*
    - **Keep existing:** pale green fill, green text, green outline (emerald-50 / emerald-600 / emerald-600).
    - **Replace:** the Thermal Shift "Reject This Pattern" look (pale red fill `bg-red-50`, red text `text-red-600`), with a strong red outline (`border-red-600`) instead of that button's light `border-red-200`.
    - **Back to form:** navy text and navy outline, no fill: the Week Day chip navy `#1e3a8a` (`CycleChartPage.tsx` `MONTH_PALETTE[0].chipText`).
    - **Replace:** save conflicting fields with the new values, plus all fill-ins. Kept fields stay.
    - **Keep existing:** save only the fill-ins. Conflicting fields keep their saved values.
    - **Back to form:** save nothing, close the dialog, and leave the form as typed (Esc / tapping outside do the same).

After any successful save, the page behaves as it does now (form reset, then redirect to the days page or chart according to `returnTo`).

The dialog must work at phone width (~400 px): the table may wrap or stack, and the buttons wrap.

### Server — safety net

The database model is unchanged: still one row per `(cycleId, dayNumber)`, updated in place.

`createOrUpdateCycleDay` must support saving from the Add page in a way where **empty / missing values never clear an existing row's fields**, so that a stale client (e.g. another tab added the day after this page loaded its day list) can't erase data either. The Edit page and chart notes panel must keep today's semantics, where an explicit `null` clears a field.

How to express "Add-page save" to the server (a flag on the action, or the client omitting empty keys plus a server-side guard) is left to the builder. The requirement is that both the client and the server enforce "empty never erases" for Add-page saves.

Known and accepted: if the client's day list is stale, the conflict dialog can be skipped. The server still won't erase anything, but a filled-in conflicting value would replace the saved one without the dialog. This is acceptable for v1.

### Interpretation

Changing a saved BBT or other sign through Replace goes through the same update path as an edit today, so the existing interpretation re-review logic (`useInterpretation` / `upsertCycleInterpretation`) applies unchanged. No Sensiplan rules change.

## Constraints

- Wasp app; follow existing patterns in `app/src/cycle-tracking`. There's no shared dialog component in `src/components/ui` yet (`sheet.tsx` is the closest Radix-based piece). Existing confirms use `window.confirm`, which can't show a table or three buttons, so a small custom dialog is needed.
- Keep `@@unique([cycleId, dayNumber])`. No schema change or migration expected.
- Dependency versions must match `.wasp/out/web-app/package.json` if anything new is added (prefer not adding anything).

## Left to the builder

- Where the comparison logic lives (a pure helper that's easy to unit-test is preferred) and how it's tested, including e2e coverage in `e2e-tests/` if practical.
- The exact server mechanism for "empty never erases" on Add-page saves (see above).
- Dialog implementation and component structure.
- Exact date formatting in the notice and title, matching how the app already shows DD/MM dates.

## Calls made by Claude (not explicitly decided by the user)

- Checkboxes (intercourse, exclude) never conflict; unticked keeps the saved value.
- BBT equality at 2-decimal display precision.
- Disturbance factors compared as a set.
- Travel time difference is its own field and row; 0h with TRAVEL ticked is a real value, not "empty".
- Stale-client gap accepted for v1, with the server-side guard preventing erasure.
- Back to form (formerly Cancel) keeps the typed form intact.
