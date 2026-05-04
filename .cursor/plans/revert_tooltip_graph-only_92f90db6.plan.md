---
name: Revert tooltip graph-only
overview: Revert tooltip/crosshair activation to graph-section-only (removing table cell triggers), add disturbance factor emoji display in tooltips for days without temperature, and update README documentation.
todos:
  - id: update-data-map
    content: Add disturbance factors check to `daysWithDataMap` useMemo
    status: completed
  - id: remove-cell-handlers
    content: Remove hover/touch/click handlers and pointer-events from all 7 table cell row types (Date, WeekDay, CycleDay, TimeStamp, LH, Intimacy, CF/Menstrual)
    status: completed
  - id: add-emoji-mapping
    content: Add DISTURBANCE_EMOJI mapping constant and render emojis in tooltip content
    status: completed
  - id: update-readme
    content: Update app/README.md Interactive Crosshair & Tooltip section
    status: completed
isProject: false
---

# Revert Tooltip/Crosshair to Graph-Only and Add Disturbance Factor Display

## Context

The recent "Enhanced Crosshair & Tooltip" changes made table cells (Date, Week Day, Cycle Day, Time Stamp, LH Test, Intimacy, CF/Menstrual) trigger the tooltip/crosshair. The user wants to revert to graph-section-only activation while keeping:

- The stable cell-centre positioning (anti-chase Edit button)
- The hover bridge/shield mechanism
- The touch pinning on mobile
- The custom React tooltip (not ApexCharts built-in)

Additionally, days without temperature but with recorded data should show tooltip with Date, Cycle Day, and disturbance factor emojis when hovering the graph plot area.

All changes are in [app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx) and [app/README.md](app/README.md).

## Changes

### 1. Update `daysWithDataMap` to include disturbance factors

In the `daysWithDataMap` useMemo (~line 316-331), add a check for disturbance factors so days with only disturbance info become hoverable in the graph area:

```typescript
const hasDisturbance = (day?.disturbanceFactors?.length ?? 0) > 0;
map.set(dayNumber, hasBBT || hasTime || hasOPK || hasIntercourse || hasCF || hasMenstrual || hasDisturbance);
```

### 2. Remove hover/touch/click handlers from all table cell rows

Remove `onMouseEnter`, `onMouseLeave`, `onTouchStart`, `onClick` event handlers and `pointerEvents`/`cursor` style props from every cell in the following rows. Keep the `isHovered` visual highlighting so cells still respond visually when graph-hover sets `hoveredDayNumber`:


| Row                | Lines (approx) |
| ------------------ | -------------- |
| Date cells         | ~928-946       |
| Week Day cells     | ~948-967       |
| Cycle Day cells    | ~969-990       |
| Time Stamp cells   | ~1340-1366     |
| LH Test cells      | ~1447-1467     |
| Intimacy cells     | ~1511-1534     |
| CF/Menstrual cells | ~1592-1608     |


For each cell, remove these lines (example from Date cell):

```
pointerEvents: daysWithDataMap.get(dayNumber) ? 'auto' : 'none',
cursor: daysWithDataMap.get(dayNumber) ? 'pointer' : 'default'
```

```
onMouseEnter={() => handleCellMouseEnter(dayNumber)}
onMouseLeave={handleCellMouseLeave}
onTouchStart={() => handleCellMouseEnter(dayNumber)}
onClick={() => handleCellClick(dayNumber)}
```

### 3. Add disturbance factor emoji mapping and tooltip display

Add a constant mapping object near the top of the component (or as a module-level const):

```typescript
const DISTURBANCE_EMOJI: Record<string, string> = {
  POOR_SLEEP: '\u{1F319}',       // 🌙
  TRAVEL: '\u{2708}\uFE0F',      // ✈️
  STRESS: '\u{1F635}',           // 😵
  ILLNESS_FEVER: '\u{1F912}',    // 🤒
  DIFFERENT_WAKE_TIME: '\u{23F0}', // ⏰
  ALCOHOL: '\u{1F377}',          // 🍷
  MEDICATION: '\u{1F48A}',       // 💊
  HOT_COLD_ROOM: '\u{1F321}\uFE0F', // 🌡️
};
```

In the tooltip rendering section (~line 1206-1214), add disturbance factor display after the existing fields:

```typescript
{day.disturbanceFactors?.length > 0 && (
  <div className="text-xs mt-1">
    {day.disturbanceFactors.map((f: string) => DISTURBANCE_EMOJI[f] || '').filter(Boolean).join(' ')}
  </div>
)}
```

### 4. Keep all anti-chase mechanisms (no changes needed)

These remain untouched:

- **Hover bridge** (~lines 1197-1204): `cancelClose()`/`scheduleClose()` on tooltip wrapper
- **Hover shield** (~lines 1187-1196): 56px padding extending toward cursor
- **Stable cell-centre X** (~line 1173): `baseX = tooltipCrosshairX`
- **Overflow flip** (~lines 1174-1178): flips tooltip to left when near edge
- **Touch pinning** (~lines 691-712): `handleTouchStart` pins day on tap
- **Touch dismiss** (~lines 746-761): document-level touchstart clears pin

### 5. Keep graph-area native mousemove handler (no changes needed)

The native mousemove/touch handlers on `.apexcharts-canvas` (~lines 630-743) remain unchanged. They already provide full-column hover detection within the plot area, which is exactly what's needed for days missing temperature. The `daysWithDataMap` check (line 657) will now also include days with disturbance factors due to change #1.

### 6. Update `app/README.md`

Update the "Interactive Crosshair & Tooltip System" section (~lines 73-87) to reflect:

- Activation is graph-section-only (remove "Multi-Source Activation" / table cell mentions)
- Days without temperature but with recorded data still activate tooltip via graph hover
- Disturbance factors displayed as emoji symbols in tooltip
- Keep documentation of all anti-chase mechanisms (hover bridge, shield, stable positioning)

