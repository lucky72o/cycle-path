---
name: Disturbance Factor Section
overview: Add a multi-select "Disturbance Factor" section to the Add Day page, with tooltips, a two-column layout, and a travel time-difference stepper. Backed by two new Prisma fields on CycleDay.
todos:
  - id: schema
    content: Add disturbanceFactors String[] and travelTimeDiff Int? to CycleDay in schema.prisma
    status: completed
  - id: backend
    content: Extend CreateOrUpdateCycleDayArgs and both upsert branches in operations.ts
    status: completed
  - id: frontend
    content: Add Disturbance Factor section UI, state, toggle logic, travel stepper, and submit wiring in AddCycleDayPage.tsx
    status: completed
  - id: readme
    content: Document the new Disturbance Factor section in app/README.md
    status: completed
isProject: false
---

# Disturbance Factor Section — Add Day Page

## Summary

Add a new "Disturbance Factor" form section to `[app/src/cycle-tracking/AddCycleDayPage.tsx](app/src/cycle-tracking/AddCycleDayPage.tsx)`, persisted via two new columns in the `CycleDay` Prisma model.

## Data Model Changes — `[app/schema.prisma](app/schema.prisma)`

Add two fields to `model CycleDay`:

```prisma
disturbanceFactors  String[]  @default([])
travelTimeDiff      Int?      // -12 to +12 hours, only relevant when TRAVEL is selected
```

`String[]` maps to a native PostgreSQL text array. Values stored are plain string keys:
`POOR_SLEEP`, `TRAVEL`, `STRESS`, `ILLNESS_FEVER`, `DIFFERENT_WAKE_TIME`, `ALCOHOL`, `MEDICATION`, `HOT_COLD_ROOM`

After the schema change, run `wasp db migrate-dev "add disturbance factors"`.

## Backend Changes — `[app/src/cycle-tracking/operations.ts](app/src/cycle-tracking/operations.ts)`

Extend `CreateOrUpdateCycleDayArgs`:

```ts
disturbanceFactors?: string[];
travelTimeDiff?: number | null;
```

Add both fields to the `data` object in both the `update` and `create` branches (lines 337–367).

## Frontend Changes — `[app/src/cycle-tracking/AddCycleDayPage.tsx](app/src/cycle-tracking/AddCycleDayPage.tsx)`

### New state

```ts
const [disturbanceFactors, setDisturbanceFactors] = useState<string[]>([]);
const [travelTimeDiff, setTravelTimeDiff] = useState<number>(0);
```

### Pre-populate on edit (in the `useEffect` that loads `existingDay`)

```ts
setDisturbanceFactors(existingDay.disturbanceFactors ?? []);
setTravelTimeDiff(existingDay.travelTimeDiff ?? 0);
```

### Toggle helper

```ts
const toggleDisturbance = (key: string) => {
  setDisturbanceFactors(prev =>
    prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
  );
};
```

### Section UI (new `<div>` block, placed after OPK section and before the submit button area)

- **Section heading** with an inline hover tooltip on the title text itself (same `group`/`opacity-0 → group-hover:opacity-100` pattern as `InfoTooltip`, but wrapping the title `<h3>`).
- **8 checkboxes** in a responsive two-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-2`). Each row: `Checkbox` + `Label` (text) + `InfoTooltip` (item-level tooltip).
- **Travel time stepper** — conditionally rendered when `disturbanceFactors.includes('TRAVEL')`:

```tsx
  <div className="col-span-1 sm:col-span-2 flex items-center gap-2 pl-6 mt-1">
    <span className="text-sm text-muted-foreground">Time difference (optional):</span>
    <button onClick={() => setTravelTimeDiff(v => Math.max(-12, v - 1))}>–</button>
    <span className="w-8 text-center text-sm">{travelTimeDiff}</span>
    <button onClick={() => setTravelTimeDiff(v => Math.min(12, v + 1))}>+</button>
    <span className="text-sm text-muted-foreground">hours</span>
  </div>
  

```

  Buttons use `type="button"` to prevent accidental form submission. Styled with the existing `border border-input` / `rounded` classes.

### Submit changes

Pass the two new fields in `handleSubmit`:

```ts
disturbanceFactors,
travelTimeDiff: disturbanceFactors.includes('TRAVEL') ? travelTimeDiff : null,
```

## README Update — `[app/README.md](app/README.md)`

Add a "Disturbance Factor Tracking" subsection under "Daily Data Entry" documenting the 8 factors, multi-select behavior, the hover tooltips, and the travel time-difference stepper.

## File Change Summary

- `[app/schema.prisma](app/schema.prisma)` — 2 new fields on `CycleDay`
- `[app/src/cycle-tracking/operations.ts](app/src/cycle-tracking/operations.ts)` — extend args type + upsert data
- `[app/src/cycle-tracking/AddCycleDayPage.tsx](app/src/cycle-tracking/AddCycleDayPage.tsx)` — new section UI + state + submit wiring
- `[app/README.md](app/README.md)` — doc update

