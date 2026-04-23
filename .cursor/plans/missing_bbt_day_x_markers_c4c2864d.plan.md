---
name: Missing BBT Day X Markers
overview: Add small "×" SVG markers on the BBT connecting line for days with no recorded temperature, positioned at the interpolated y-value where a node would appear if recorded.
todos:
  - id: add-memo
    content: Add missingBBTDaysOnLine useMemo after yAxisRange useMemo
    status: completed
  - id: add-overlay
    content: Add SVG × overlay block after the Flower Markers JSX block
    status: completed
  - id: update-readme
    content: Update app/README.md to document the missing BBT day X marker feature
    status: completed
isProject: false
---

# Missing BBT Day X Markers

## Files to change

- `[app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx)` — implementation
- `[app/README.md](app/README.md)` — document the new feature

## Approach

The chart already uses an **absolutely-positioned SVG overlay** pattern for the "flower" Peak LH markers (lines 1248–1307). The X markers follow the exact same pattern.

### Step 1 — Compute missing days to mark (new `useMemo`)

Add after the `yAxisRange` useMemo (~line 213):

```typescript
const missingBBTDaysOnLine = useMemo(() => {
  if (!chartData || !settings) return [];

  // Sorted included (non-excluded) BBT points
  const included = Array.from(chartData.allDaysMap.values())
    .filter((d: any) => !d.excludeFromInterpretation)
    .sort((a: any, b: any) => a.dayNumber - b.dayNumber);

  if (included.length < 2) return [];

  const result: Array<{ dayNumber: number; interpolatedTemp: number }> = [];

  for (let i = 0; i < included.length - 1; i++) {
    const p1 = included[i];
    const p2 = included[i + 1];
    for (let day = p1.dayNumber + 1; day < p2.dayNumber; day++) {
      const existing = chartData.allDaysMap.get(day);
      // Only mark days with no BBT at all (excluded days already have a grey dot)
      if (!existing || existing.bbt === null) {
        const t = (day - p1.dayNumber) / (p2.dayNumber - p1.dayNumber);
        const t1 = settings.temperatureUnit === 'CELSIUS' ? fahrenheitToCelsius(p1.bbt) : p1.bbt;
        const t2 = settings.temperatureUnit === 'CELSIUS' ? fahrenheitToCelsius(p2.bbt) : p2.bbt;
        result.push({ dayNumber: day, interpolatedTemp: t1 + (t2 - t1) * t });
      }
    }
  }
  return result;
}, [chartData, settings]);
```

### Step 2 — Render SVG "×" overlays

Add right after the closing `</>` of the Flower Markers block (~line 1307), using identical guard conditions:

```tsx
{/* Missing BBT day markers — small × on the connecting line */}
{chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && (
  <>
    {missingBBTDaysOnLine.map(({ dayNumber, interpolatedTemp }) => {
      const numDays = chartData.maxDay - chartData.minDay + 1;
      const cellWidth = plotAreaWidth / numDays;
      const xPos = plotAreaOffset + ((dayNumber - chartData.minDay) + 0.5) * cellWidth;
      const yPos = plotAreaTop + ((yAxisRange.max - interpolatedTemp) / (yAxisRange.max - yAxisRange.min)) * plotAreaHeight;

      return (
        <div
          key={`missing-bbt-${dayNumber}`}
          className="absolute pointer-events-none"
          style={{ left: `${xPos}px`, top: `${yPos}px`, transform: 'translate(-50%, -50%)', zIndex: 4 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      );
    })}
  </>
)}
```

### Step 3 — Update app/README.md

Add a brief note in the chart features section describing that days without a BBT recording show a small blue "×" on the connecting line at the interpolated temperature position.

## Key details

- **Color**: `#3b82f6` (same blue as the BBT line) — the X visually belongs to the line
- **Size**: 10×10px SVG, stroke 1.5px — small enough to not clutter, large enough to be visible
- **Only for null-BBT days**: excluded days already have their own grey dot and are skipped
- **Guard**: only renders once `plotAreaWidth`, `plotAreaTop`, `plotAreaHeight`, and `yAxisRange` are all measured (same as flower markers)

