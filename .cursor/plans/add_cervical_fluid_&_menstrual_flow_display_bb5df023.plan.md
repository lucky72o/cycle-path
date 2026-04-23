---
name: Add Cervical Fluid & Menstrual Flow Display
overview: Add 5 new rows below the Time Stamp row to display Cervical Fluid appearance categories and Menstrual Flow data with visual indicators, tooltips, and extended crosshair/hover interactions.
todos:
  - id: add-css-pattern
    content: Add CSS class with inline SVG pattern for soft rounded square tile background
    status: completed
  - id: create-cf-menstrual-map
    content: Create cervicalMenstrualMap useMemo hook to process CF and menstrual data
    status: completed
  - id: add-row-labels
    content: Add 5 row labels with info icons and hover tooltips for CF descriptions
    status: completed
  - id: add-grid-cells
    content: Add grid cells for Eggwhite, Watery, Creamy, Sticky, Dry rows with pattern background
    status: completed
  - id: implement-cf-bars
    content: Implement cervical fluid bars spanning multiple rows with correct heights and colors
    status: completed
  - id: implement-menstrual-indicators
    content: Implement menstrual flow indicators (droplets, partial/full squares) on Dry row
    status: completed
  - id: extend-crosshair-hover
    content: Extend crosshair height and hover highlighting to cover all 5 new rows
    status: completed
  - id: update-container-padding
    content: Update container paddingBottom to accommodate new rows (228px total)
    status: completed
isProject: false
---

# Add Cervical Fluid and Menstrual Flow Display Rows

## Overview

Add 5 new rows (36px each) below the Time Stamp row to display Cervical Fluid appearance and Menstrual Flow data. The rows from top to bottom are: **Eggwhite**, **Watery**, **Creamy**, **Sticky**, **Dry**. Menstrual flow completely overrides cervical fluid display when present.

## Data Source

From `[app/schema.prisma](app/schema.prisma)`:

- `cervicalAppearance`: NONE | STICKY | CREAMY | WATERY | EGGWHITE
- `menstrualFlow`: SPOTTING | LIGHT | MEDIUM | HEAVY | VERY_HEAVY

## Implementation Steps

### 1. Create CSS Pattern for Cell Backgrounds

Add a CSS class for the soft rounded square tile pattern using an **inline SVG data URI** in the `<style>` tag (around line 708):

```css
.cf-cell-pattern {
  background-color: white;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='10' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0.5' y='0.5' width='9' height='9' rx='2' ry='2' fill='%23e7f1ff'/%3E%3C/svg%3E");
  background-size: 10px 10px;
  background-repeat: repeat;
}
```

**Why SVG Pattern?**

- Creates true **rounded square tiles** with precise corner radius (`rx="2" ry="2"`)
- The 0.5px offset creates **subtle white gaps** between tiles (negative space)
- Produces the **"soft textured canvas" effect** described in the spec
- No borders - differentiation through slight shading only
- Works in all modern browsers
- Easy to adjust: tile size (width/height), corner roundness (rx/ry), gap size (x/y offset)

**Pattern Characteristics:**

- Tile color: `#e7f1ff` (soft blue)
- Background: solid white (visible through gaps)
- Tile size: 10px × 10px with ~1px white gap
- Corner radius: 2px (subtle rounded corners)
- Result: Minimalist, airy, "breathable" texture

### 2. Create Cervical Fluid/Menstrual Data Map

Add a new `useMemo` hook after `timeStampsMap` to process CF and menstrual data:

```typescript
const cervicalMenstrualMap = useMemo(() => {
  if (!cycle || !chartData) return new Map();
  
  const map = new Map<number, {
    cervicalAppearance: string | null;
    menstrualFlow: string | null;
  }>();
  
  for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
    const day = chartData.allDaysMap.get(dayNumber);
    map.set(dayNumber, {
      cervicalAppearance: day?.cervicalAppearance || null,
      menstrualFlow: day?.menstrualFlow || null
    });
  }
  
  return map;
}, [cycle, chartData, displayDayRange]);
```

### 3. Add Row Label Section with Tooltips

Add row labels with info icons and tooltips in the y-axis area. Each row needs:

- Title text
- Small info icon (i or ?)
- Tooltip on hover with meaning

**Row Meanings (for tooltips):**

- **Eggwhite**: "Clear, slippery, stretchy mucus. Peak fertility."
- **Watery**: "Clear, flowing, high-fertility mucus"
- **Creamy**: "Lotion-like mucus, moderate fertility"
- **Sticky**: "Sticky, paste-like mucus, low fertility"
- **Dry**: "No visible mucus AND dry sensation"

### 4. Add Grid Cells for 5 New Rows

Position 5 new rows below the Time Stamp row:

- Each row: 36px height
- Total additional height: 5 x 36px = 180px
- Use `plotAreaTop + chartHeight + 48px` (Time Stamp height) as starting position
- Each subsequent row adds 36px

**CRITICAL: Pattern Application**The `cf-cell-pattern` class must be applied to the **parent grid container**, NOT to individual cells:❌ **Wrong approach:**

```tsx
{[0, 1, 2, 3, 4].map((rowIdx) => (
  <div className="cf-cell-pattern" .../>  // Pattern on each cell
))}
```

**Problem**: Pattern resets at every cell boundary, creating visual discontinuity. Each cell starts its own 10px×10px pattern origin.✅ **Correct approach:**

```tsx
<div className="cf-cell-pattern" style={{ /* container styles */ }}>
  {/* Individual cells inside - transparent backgrounds */}
  <div className="border..." />
  <div className="border..." />
</div>
```

**Solution**: Pattern applied to parent creates one continuous "canvas" underneath all cells. Cell borders create the grid structure on top.**Why this matters:**

- The rounded square tiles must flow **continuously** across the entire 5-row grid
- Pattern should act as a unified texture, not repeat per cell
- Individual cells should only provide border structure, not background

### 5. Implement Cervical Fluid Bars (Spanning Multiple Rows)

Create absolutely positioned bars that span across row boundaries:| CF Type | Rows Spanned | Height | Color ||---------|--------------|--------|-------|| NONE (Dry) | 1 (Dry only) | 36px | #D4D8DA || STICKY | 2 (Dry + Sticky) | 72px | #c0eef0 || CREAMY | 3 (Dry + Sticky + Creamy) | 108px | #7bdcdf || WATERY | 4 (All but Eggwhite) | 144px | #86d9ec || EGGWHITE | 5 (All rows) | 180px | #0cc0df |Bars are positioned from the bottom (Dry row) and extend upward. Use `position: absolute` with calculated `bottom` and `height`.

### 6. Implement Menstrual Flow Indicators

On the **Dry row only**, display menstrual indicators (overrides CF when present):| Flow Level | Visual | Height | Color ||------------|--------|--------|-------|| SPOTTING | 3 teardrop icons | - | #d65866 || LIGHT | Rounded square | 1/3 cell (12px) | #d65866 || MEDIUM | Rounded square | 1/2 cell (18px) | #d65866 || HEAVY | Full rounded square | 36px | #d65866 || VERY_HEAVY | Full rounded square | 36px | #c82739 |All rounded squares are **bottom-aligned** in the cell.

### 7. Update Crosshair Height

Extend crosshair from `calc(100% + 48px)` to `calc(100% + 48px + 180px)` to cover all new rows.

### 8. Extend Hover Highlighting

Add hover state highlighting for all 5 new rows using the existing `hoveredDayNumber` state.

### 9. Update Container Padding

Change `paddingBottom` from `48px` to `228px` (48px Time Stamp + 180px CF/Menstrual rows).

## Visual Structure

```javascript
+----------------+------------------------------------------+
| Time Stamp     | [HH] [HH] [HH] [HH] ...                   | 48px
|                | [MM] [MM] [MM] [MM] ...                   |
+----------------+------------------------------------------+
| Eggwhite (i)   | [pattern] [bar] [pattern] [pattern] ...  | 36px
+----------------+------------------------------------------+
| Watery (i)     | [pattern] [bar] [pattern] [pattern] ...  | 36px
+----------------+------------------------------------------+
| Creamy (i)     | [pattern] [bar] [pattern] [pattern] ...  | 36px
+----------------+------------------------------------------+
| Sticky (i)     | [pattern] [bar] [pattern] [pattern] ...  | 36px
+----------------+------------------------------------------+
| Dry (i)        | [pattern] [bar] [menstrual] [pattern] .. | 36px
+----------------+------------------------------------------+
```

## Component Structure for CF Bars

The cervical fluid bars need to be positioned absolutely within a container that spans all 5 rows. For each day column:

```tsx
{/* CF Bar Container - spans all 5 rows */}
<div style={{ position: 'relative', height: '180px' }}>
  {cfData?.cervicalAppearance && !cfData?.menstrualFlow && (
    <div 
      className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded"
      style={{
        width: '70%',
        height: getCFBarHeight(cfData.cervicalAppearance),
        backgroundColor: getCFBarColor(cfData.cervicalAppearance)
      }}
    />
  )}
</div>
```

## Helper Functions Needed

```typescript
const CF_ROW_HEIGHT = 36;

const getCFBarHeight = (appearance: string): number => {
  switch (appearance) {
    case 'NONE': return CF_ROW_HEIGHT * 1;      // 36px
    case 'STICKY': return CF_ROW_HEIGHT * 2;    // 72px
    case 'CREAMY': return CF_ROW_HEIGHT * 3;    // 108px
    case 'WATERY': return CF_ROW_HEIGHT * 4;    // 144px
    case 'EGGWHITE': return CF_ROW_HEIGHT * 5;  // 180px
    default: return 0;
  }
};

const getCFBarColor = (appearance: string): string => {
  switch (appearance) {
    case 'NONE': return '#D4D8DA';
    case 'STICKY': return '#c0eef0';
    case 'CREAMY': return '#7bdcdf';
    case 'WATERY': return '#86d9ec';
    case 'EGGWHITE': return '#0cc0df';
    default: return 'transparent';
  }
};
```

## Implementation Issues & Fixes

### Issue 1: Row Label Positioning

**Problem**: Row labels were positioned way below the chart (near Previous Cycle button) instead of next to their respective rows.**Root Cause**: Parent container had no `top` position, defaulting to `top: 0`. Child divs had large individual `top` values like `plotAreaTop + chartHeight + 48 + 144px`, which positioned them far down the page relative to the parent at top: 0.**Solution**:

- Position the **parent container** at the correct location: `top: ${plotAreaTop + chartHeight + 48}px`
- Remove individual `top` positions from children, let them stack naturally with their 36px heights

### Issue 2: Tooltip Not Appearing

**Problem**: Tooltips using native HTML `title` attribute had 1-2 second delay and poor visibility.**Root Cause**: Native `title` tooltips:

- Have significant delay before appearing
- Use browser default styling (small, plain)
- Can't be customized
- Not obvious to users

**Solution**: Implemented CSS-based instant tooltips:

- Added `.cf-tooltip-trigger` and `.cf-tooltip-content` CSS classes
- Tooltip appears immediately on hover
- Styled with dark background, white text, shadow, and arrow
- Positioned to the right of the row label

### Issue 3: Pattern Background Discontinuity

**Problem**: Background pattern resets at every cell boundary instead of flowing continuously across the grid.**Root Cause**: `cf-cell-pattern` class applied to each individual cell (140+ cells), causing each cell to start its own pattern origin.**Solution**: Apply `cf-cell-pattern` to the parent container that spans all 5 rows and all day columns. Individual cells become transparent with borders only, creating grid structure over the continuous pattern canvas.

## Files Modified

- `[app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx)` - Add CF/Menstrual rows, bars, indicators, tooltips

## Testing Checklist

1. Verify all 5 rows display with correct titles and order
2. **Verify cell background shows subtle rounded square tile pattern** (not solid fill)
3. **Verify pattern flows continuously across cells** (not resetting at cell boundaries)
4. Verify row labels appear next to their respective rows (not at bottom of page)
5. Test tooltips appear **instantly** on hover over row labels/info icons
6. Test CF bars span correct number of rows for each type
7. Test menstrual flow indicators display correctly on Dry row
8. Confirm menstrual flow overrides CF display when both present
9. Test crosshair extends through all new rows

