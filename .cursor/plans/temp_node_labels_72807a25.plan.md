---
name: Temp Node Labels
overview: Add compact temperature labels inside BBT chart markers using a new reusable helper function, wired through ApexCharts' built-in dataLabels feature, with unit tests via Vitest.
todos:
  - id: helper-fn
    content: Add roundTo1Decimal and getTempNodeLabel to utils.ts
    status: completed
  - id: wire-chart
    content: Enable dataLabels in CycleChartPage.tsx with formatter, enlarge markers, update excluded color
    status: completed
  - id: setup-vitest
    content: Install Vitest and add test script to package.json
    status: completed
  - id: write-tests
    content: Create unit tests for roundTo1Decimal and getTempNodeLabel
    status: completed
  - id: verify
    content: Run tests and verify lints pass
    status: completed
isProject: false
---

# Compact Temperature Labels Inside BBT Chart Nodes

## Current State

- The cycle chart renders in `[app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx)` using **ApexCharts** (`react-apexcharts`).
- Temperature markers are circles with `size: 5` (10px diameter), blue fill for included points, grey for excluded.
- `dataLabels` is explicitly `enabled: false` at line 532-534.
- Temperature conversion helpers (`fahrenheitToCelsius`, `celsiusToFahrenheit`) live in `[app/src/cycle-tracking/utils.ts](app/src/cycle-tracking/utils.ts)`.
- Chart data is already converted to the active display unit at lines 120-123 before being passed to ApexCharts.
- No unit test framework exists in the app yet.

## Design Recommendation

**Increase marker size** from 5 to 10 (20px diameter) to fit the labels, and use ApexCharts' built-in `dataLabels` feature with a custom formatter.

**Colors and typography for maximum readability on mobile/desktop:**

- **Included markers**: fill `#3b82f6` (blue-500), stroke white 2px, **white bold text** inside. Contrast ratio ~4.6:1 (WCAG AA).
- **Excluded markers**: fill `#6B7280` (gray-500, darkened from current `#9CA3AF`) for better text contrast, stroke white 2px, **white bold text** inside. Contrast ratio ~4.6:1.
- **Font**: 9px, weight 700 (bold), sans-serif. Single digits (0-9) fit comfortably in 20px circles. Two-digit labels ("98", "36", "37") are less common (.0 cases only) and still fit at this size.
- **Hover state**: size increases from 10 to 13 (same proportional bump as current 5-to-7).
- **Positioning**: `offsetY: 4` to center text on the marker (ApexCharts line chart dataLabels default above the point).

This approach keeps labels readable at small phone widths while not overwhelming the chart, since most labels are a single digit.

## Implementation

### 1. Add `getTempNodeLabel` helper and supporting function to `utils.ts`

Add to `[app/src/cycle-tracking/utils.ts](app/src/cycle-tracking/utils.ts)`:

```typescript
function roundTo1Decimal(value: number): number {
  return +(Math.round(+(value + 'e1')) + 'e-1');
}

function getTempNodeLabel(displayTemp: number | null | undefined): string | null {
  if (displayTemp == null || isNaN(displayTemp)) return null;
  const rounded = roundTo1Decimal(displayTemp);
  const tenths = rounded % 1;
  if (Math.abs(tenths) < 0.01) {
    return Math.round(rounded).toString();
  }
  return Math.round(Math.abs(tenths) * 10).toString();
}
```

Key design decisions:

- `roundTo1Decimal` uses the exponential-notation trick (`+'e1'` / `+'e-1'`) to avoid floating-point multiplication errors (e.g., `97.95 * 10 = 979.4999...`). This guarantees standard half-up rounding.
- `getTempNodeLabel` takes the **already-converted display temperature** (the chart data at lines 120-123 already converts based on active unit) -- no need to re-convert.
- Returns `null` for missing/invalid values; ApexCharts won't render a label when formatter returns empty.

### 2. Wire into ApexCharts dataLabels in `CycleChartPage.tsx`

In `[app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx)`, change the `dataLabels` and `markers` sections of `chartOptions`:

**dataLabels** (replacing lines 532-534):

```typescript
dataLabels: {
  enabled: true,
  formatter: (val: number) => getTempNodeLabel(val) ?? '',
  style: {
    fontSize: '9px',
    fontWeight: 700,
    colors: ['#ffffff'],
  },
  offsetY: -4,
  background: { enabled: false },
},
```

**markers** (replacing lines 535-547):

```typescript
markers: {
  size: [
    ...Array(chartData.numSolidSegments).fill(10),
    ...(chartData.hasExcludedSeries ? [10] : []),
  ],
  fillOpacity: 1,
  strokeWidth: 2,
  strokeColors: '#fff',
  hover: {
    size: 13,
    sizeOffset: 0,
  },
},
```

**colors** (update excluded series color for better text contrast, line 516):

```typescript
...(chartData.hasExcludedSeries ? ['#6B7280'] : [])
```

Also add the import of `getTempNodeLabel` from `./utils` on line 8.

### 3. Set up Vitest and add unit tests

The project uses Vite but has no test framework. Add Vitest for fast, Vite-native unit testing.

**Install** (in `app/`):

```bash
npm install -D vitest
```

**Create** `app/src/cycle-tracking/__tests__/getTempNodeLabel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { roundTo1Decimal, getTempNodeLabel } from '../utils';

describe('roundTo1Decimal', () => {
  it.each([
    [98.25, 98.3], [97.77, 97.8], [98.15, 98.2],
    [98.07, 98.1], [98.60, 98.6], [97.95, 98.0],
    [36.58, 36.6], [36.65, 36.7], [36.00, 36.0],
    [37.04, 37.0], [37.06, 37.1],
  ])('rounds %f to %f', (input, expected) => {
    expect(roundTo1Decimal(input)).toBe(expected);
  });
});

describe('getTempNodeLabel', () => {
  // Fahrenheit examples
  it.each([
    [98.3, '3'], [97.8, '8'], [98.2, '2'],
    [98.1, '1'], [98.6, '6'], [98.0, '98'],
  ])('F: rounded %f -> label "%s"', (rounded, label) => {
    expect(getTempNodeLabel(rounded)).toBe(label);
  });

  // Celsius examples
  it.each([
    [36.6, '6'], [36.7, '7'], [36.0, '36'], [37.0, '37'], [37.1, '1'],
  ])('C: rounded %f -> label "%s"', (rounded, label) => {
    expect(getTempNodeLabel(rounded)).toBe(label);
  });

  // Edge cases
  it.each([null, undefined, NaN])('returns null for %s', (val) => {
    expect(getTempNodeLabel(val as any)).toBeNull();
  });
});
```

Add `"test": "vitest run"` to `app/package.json` scripts.

### 4. Export the new functions

Export `roundTo1Decimal` and `getTempNodeLabel` from `utils.ts` so both the chart component and tests can import them.

## Files Changed


| File                                                        | Change                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `app/src/cycle-tracking/utils.ts`                           | Add `roundTo1Decimal` and `getTempNodeLabel` (exported)                                |
| `app/src/cycle-tracking/CycleChartPage.tsx`                 | Import helper, enable + configure `dataLabels`, enlarge markers, darken excluded color |
| `app/src/cycle-tracking/__tests__/getTempNodeLabel.test.ts` | New unit tests (Fahrenheit, Celsius, edge cases)                                       |
| `app/package.json`                                          | Add `vitest` dev dependency, add `test` script                                         |


