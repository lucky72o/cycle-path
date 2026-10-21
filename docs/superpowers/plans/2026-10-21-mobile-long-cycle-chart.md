# Mobile Long-Cycle Chart (Foldable Month Pills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below 1024 px, cycles over 40 days that span more than one month can be folded by month with tappable pills in a 30 px gutter row that float at the chart's left edge; desktop (≥ 1024 px) stays exactly as shipped.

**Architecture:** The pure rules module `monthFolding.ts` gains a fold *mode* (`'ribbons' | 'pills' | 'off'`), a frame parameter for the default block (40 or 14 days), header geometry per mode, and the strip model: unmerged strip items, the merge-in-threes overflow fit, labels and aria labels. `useMonthFolding` selects the mode from the existing `(min-width: 1024px)` query and keys its state reset on it. A new `MonthPillStrip` component (like `FoldRibbonLayer`, it owns the scroll listener) renders the floating strip and the edge stubs. `CycleChartPage.tsx` swaps ribbons for the strip in pills mode and takes its header offsets from the geometry helper; the `plotAreaOffset + (day − minDay) × cellWidth` contract is untouched.

**Tech Stack:** Wasp · React 18 · TypeScript · ApexCharts 3.41 (react-apexcharts 1.4.1) · Tailwind · Vitest 1.6 + @testing-library/react 14.3 (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-21-mobile-long-cycle-chart-design.md` (builds on `docs/superpowers/specs/2026-10-21-long-cycle-graph-view-design.md`). Read both. The interactive mock-up (phone "B") is `.superpowers/brainstorm/81722-1792598554/content/interactive-abc-v5.html`: gitignored, embeds personal data, visual reference only, never copy it into the repo.

## Global Constraints

- Mode: `matchMedia('(min-width: 1024px)')` matches → `'ribbons'`, else `'pills'`; `'off'` when the cycle is not eligible (displayed length ≤ 40 days, or one calendar month). Eligibility unchanged: `max(28, recordedMaxDay)` active / `recordedMaxDay` ended, `> 40`, `spans.length > 1`.
- Default block frame: **40** days in ribbons mode, **14** in pills mode. Same algorithm: whole months from the anchor side, including the crossing month; at least the anchor month.
- Fold state resets on page load, cycle change, and mode change (and on the existing month-count key); each reset re-arms the scroll to the anchor side.
- Pills mode geometry: gutter **30 px** (ribbons/off: 22), header **138 px** (130), Date row top **30** (22), Week Day **66** (58), Cycle Day **102** (94), hairline `top: 29px` (21). In pills mode the hairline starts at x = 0 and the label column's gutter cell has **no right border**; ribbons/off keep today's markup pixel-identical.
- Pills mode Apex grid padding stays `left: 50, right: 40`; no ribbon slots. Container width = `leftReserve + RIGHT_PLOT_RESERVE + openDays × standardCellWidth` (existing `foldedContainerWidth` with ribbons 0).
- Pill: `<button>` 30 px tall (the full gutter row is the hit area) containing a 22 px visual pill, radius 11 px, 11 px text, weight 600, letter-spacing 0.02em, nowrap, padding `0 8px 0 5px` with a sign / `0 9px` without, `box-shadow: 0 0 0 2px #fff`.
- Open pill: background `pillBg`, 1 px border `pillBg`, text `pillText`, white 12 px `SignDot` "−" only when `canFold`. Folded pill: background `#fff`, 1 px border `underline`, text `pillText`, "+" as plain text in `pillText` (no white dot).
- Copy, exact: open/folded label `{Mon} {N}` (e.g. `Sep 30`); merged `{Mon1}–{MonN} {total}` (en dash, e.g. `Jul–Sep 86`); compact drops ` {N}`. aria-labels: folded `Show September, 30 days`; merged `Show September, 30 days (July–September folded, 86 days)`; foldable open `Fold September`; lone open `September is open`. `1 day` singular everywhere.
- Colour: `paletteFor(monthIndex)` of the month; a merged pill uses its **first** month's palette.
- Overflow fit, in order, stopping as soon as `stripWidth ≤ scrollClientWidth − 8`: (1) merge folded months in chunks of up to 3, before-group first (chunks starting from month 0), then after-group (chunks starting from the last month), one chunk per step; open months never merge; (2) compact labels on every pill; (3) the strip scrolls sideways (left-aligned, scrollbar hidden). Re-evaluated from the unmerged strip on every fold/open and resize. A merged pill opens the month of its chunk nearest the open block.
- Strip position: `left = scrollLeft + 4` in chart coordinates, `width = clientWidth − 8`, `top: 0`, height 30, gap 4 px, calendar order; updated on scroll via `requestAnimationFrame`.
- Edge stubs: 4 px wide, from y = 30 to the bottom of the chart container, one equal-height segment per hidden month in its `underline` colour, opacity 0.9, `pointer-events: none`; before-stub x = `scrollLeft`; after-stub x = `min(chartWidth − 4, scrollLeft + clientWidth − 4)`; none when that side has no folded month.
- z-order: strip and stubs above grid cells, overlays and crosshair (`zIndex: 6`), below the tooltip (`zIndex: 10`).
- Pills and toolbar buttons stop click, pointerdown and touchstart propagation (never pin a tooltip).
- Tooltip guard (`CycleChartPage.tsx:985-1014`) is **unchanged** in both modes.
- Scroll intents unchanged: load/cycle/mode change → anchor side ('end' = latest recorded day); open before the block → 'start'; open after → 'end-of-range'; Show all / Collapse all → anchor side.
- No change to interpretation, ribbons mode, short cycles, Days page or CSV. Personal cycle data is never committed.

## Review Focus

1. **A cycle that has just rolled into a new month** (e.g. day 2 of November): pills mode must open October + November (≥ 14 days), not a two-column chart; pinned in Task 1 (`defaultOpenBlock` frame-14 test with a 2-day anchor month).
2. **Rotating a phone or resizing across 1024 px with months folded**: the block must reset to the new mode's default and scroll to the anchor side, never carry a 40-day block into pills mode or a stale block back; pinned in Task 2 (mode-switch hook test).
3. **A very long cycle (9–12 months) on a 308 px card with most months open**: merging cannot help, compacting may not either; the strip must scroll on its own rather than overflow the card or overlap; pinned in Task 1 (`fitStrip` scroll-fallback test) and Task 3 (strip `overflowX: 'auto'` assertion).
4. **Collapse all on a cycle whose anchor month has 2 days**: the chart is narrower than the card; the after-stub (ended cycle) or the strip must not float in empty card space beyond the chart; pinned in Task 3 (after-stub clamp test).
5. **Tapping a pill over a day column that has a pinned tooltip**: the tap must not re-pin or move the tooltip to the column underneath; pinned in Task 3 (propagation test) and checked by eye in Task 5.

---

### Task 1: Pure rules: mode, frame, header geometry, strip model

**Files:**
- Modify: `app/src/cycle-tracking/monthFolding.ts`
- Test: `app/src/cycle-tracking/__tests__/monthFolding.test.ts`

**Interfaces:**
- Consumes: `MonthSpan` from `./utils`; existing `OpenBlock`, `canFold`, `dayWord`.
- Produces (exported):
  ```ts
  export const PILLS_FRAME_DAYS = 14;
  export type FoldMode = 'ribbons' | 'pills' | 'off';
  export function foldMode(wide: boolean, eligible: boolean): FoldMode;
  export function frameDays(mode: FoldMode): number; // ribbons/off → STANDARD_FRAME_DAYS (40), pills → 14
  export function defaultOpenBlock(spans: MonthSpan[], anchorLatest: boolean, frame?: number): OpenBlock; // frame defaults to STANDARD_FRAME_DAYS
  export type HeaderGeometry = { gutter: number; header: number; dateTop: number; weekDayTop: number; cycleDayTop: number; hairlineTop: number };
  export function headerGeometry(mode: FoldMode): HeaderGeometry;
  export type StripItem =
    | { kind: 'open'; months: [MonthSpan]; foldable: boolean }
    | { kind: 'folded'; side: 'before' | 'after'; months: MonthSpan[] }; // 1–3 consecutive months, calendar order
  export function stripItems(spans: MonthSpan[], block: OpenBlock): StripItem[]; // unmerged, calendar order
  export function stripItemLabel(item: StripItem, compact: boolean): string;
  export function stripItemAriaLabel(item: StripItem): string;
  export function stripItemTarget(item: StripItem): number; // monthIndex to open (folded) or fold (open)
  export function fitStrip(
    spans: MonthSpan[],
    block: OpenBlock,
    pillWidth: (item: StripItem, compact: boolean) => number,
    available: number,
    gap?: number, // default 4
  ): { items: StripItem[]; compact: boolean; scroll: boolean };
  ```

- [ ] **Step 1: Write the failing tests** (add to `monthFolding.test.ts`; reuse its existing span fixtures or build with `buildMonthSpans(new Date('2026-07-07'), 1, 105)` → Jul 1–25, Aug 26–56, Sep 57–86, Oct 87–105)

```ts
describe('mode and frame', () => {
  it('foldMode', () => {
    expect(foldMode(true, true)).toBe('ribbons');
    expect(foldMode(false, true)).toBe('pills');
    expect(foldMode(true, false)).toBe('off');
    expect(foldMode(false, false)).toBe('off');
  });
  it('frameDays', () => {
    expect(frameDays('ribbons')).toBe(40);
    expect(frameDays('pills')).toBe(14);
  });
});

describe('defaultOpenBlock with the 14-day frame', () => {
  it('active, anchor month >= 14 days opens it alone', () => {
    expect(defaultOpenBlock(spans105, true, 14)).toEqual({ from: 3, to: 3 }); // Oct 19 days
  });
  it('active, a 2-day anchor month also opens the previous month', () => {
    const s = buildMonthSpans(new Date('2026-07-07'), 1, 119); // day 119 = 2 Nov
    expect(defaultOpenBlock(s, true, 14)).toEqual({ from: 3, to: 4 });
  });
  it('ended opens the first month(s) until >= 14 days', () => {
    expect(defaultOpenBlock(spans105, false, 14)).toEqual({ from: 0, to: 0 }); // Jul 25 days
  });
  it('default frame stays 40', () => {
    expect(defaultOpenBlock(spans105, true)).toEqual({ from: 2, to: 3 });
  });
});

describe('headerGeometry', () => {
  it('pills mode uses a 30 px gutter', () => {
    expect(headerGeometry('pills')).toEqual({ gutter: 30, header: 138, dateTop: 30, weekDayTop: 66, cycleDayTop: 102, hairlineTop: 29 });
  });
  it('ribbons and off keep today', () => {
    const today = { gutter: 22, header: 130, dateTop: 22, weekDayTop: 58, cycleDayTop: 94, hairlineTop: 21 };
    expect(headerGeometry('ribbons')).toEqual(today);
    expect(headerGeometry('off')).toEqual(today);
  });
});

describe('strip model', () => {
  const w = (item: StripItem, compact: boolean) => 12 * stripItemLabel(item, compact).length + 20;
  it('stripItems: one item per month, calendar order, open foldable only at block ends', () => {
    const items = stripItems(spans105, { from: 2, to: 3 });
    expect(items.map((i) => i.kind)).toEqual(['folded', 'folded', 'open', 'open']);
    expect(items.map((i) => stripItemLabel(i, false))).toEqual(['Jul 25', 'Aug 31', 'Sep 30', 'Oct 19']);
    expect(items.filter((i) => i.kind === 'open').map((i) => (i as { foldable: boolean }).foldable)).toEqual([true, true]);
    expect((stripItems(spans105, { from: 3, to: 3 })[3] as { foldable: boolean }).foldable).toBe(false);
  });
  it('labels and aria labels', () => {
    const merged: StripItem = { kind: 'folded', side: 'before', months: spans105.slice(0, 3) };
    expect(stripItemLabel(merged, false)).toBe('Jul–Sep 86');
    expect(stripItemLabel(merged, true)).toBe('Jul–Sep');
    expect(stripItemAriaLabel(merged)).toBe('Show September, 30 days (July–September folded, 86 days)');
    expect(stripItemAriaLabel({ kind: 'folded', side: 'before', months: [spans105[0]] })).toBe('Show July, 25 days');
    expect(stripItemAriaLabel({ kind: 'open', months: [spans105[3]], foldable: true })).toBe('Fold October');
    expect(stripItemAriaLabel({ kind: 'open', months: [spans105[3]], foldable: false })).toBe('October is open');
  });
  it('a merged pill targets the month nearest the open block', () => {
    expect(stripItemTarget({ kind: 'folded', side: 'before', months: spans105.slice(0, 3) })).toBe(2);
    expect(stripItemTarget({ kind: 'folded', side: 'after', months: spans105.slice(1, 4) })).toBe(1);
  });
  it('fitStrip: no merge when it fits', () => {
    const r = fitStrip(spans105, { from: 3, to: 3 }, w, 10_000);
    expect(r).toMatchObject({ compact: false, scroll: false });
    expect(r.items).toHaveLength(4);
  });
  it('fitStrip: merges the before-group from month 0 in threes', () => {
    // 4 unmerged pills ~ 4*92+12 = 380; merged Jul–Sep + Oct ~ 140+92+4 = 236
    const r = fitStrip(spans105, { from: 3, to: 3 }, w, 300);
    expect(r.items.map((i) => stripItemLabel(i, r.compact))).toEqual(['Jul–Sep 86', 'Oct 19']);
    expect(r.compact).toBe(false);
  });
  it('fitStrip: stops after a partial merge', () => {
    const s = buildMonthSpans(new Date('2026-01-01'), 1, 290); // Jan..Oct 17
    const block = { from: 9, to: 9 };
    const full = fitStrip(s, block, w, 10_000).items.length; // 10
    const r = fitStrip(s, block, w, 12 * 70); // fits after one merge
    expect(r.items.length).toBe(full - 2);
    expect(stripItemLabel(r.items[0], false)).toBe('Jan–Mar 90');
    expect(stripItemLabel(r.items[1], false)).toBe('Apr 30');
  });
  it('fitStrip: never merges open months; after-group chunks start from the last month', () => {
    const s = buildMonthSpans(new Date('2026-01-01'), 1, 290);
    const r = fitStrip(s, { from: 0, to: 1 }, w, 400, 4);
    expect(r.items.filter((i) => i.kind === 'open')).toHaveLength(2);
    const lastFolded = r.items[r.items.length - 1];
    expect(lastFolded.months.map((m) => m.monthLabel)).toEqual(['August', 'September', 'October']);
  });
  it('fitStrip: compacts after merging is exhausted, then scrolls', () => {
    const all = { from: 0, to: 3 };
    expect(fitStrip(spans105, all, w, 4 * 12 * 3 + 4 * 20 + 12)).toMatchObject({ compact: true, scroll: false });
    expect(fitStrip(spans105, all, w, 50)).toMatchObject({ compact: true, scroll: true });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/monthFolding.test.ts`
Expected: FAIL (`foldMode`, `headerGeometry`, `stripItems`, `fitStrip` … not exported).

- [ ] **Step 3: Implement in `monthFolding.ts`**

`defaultOpenBlock` replaces the literal `STANDARD_FRAME_DAYS` in its loop with the `frame` argument. Merged-label month names use `monthLabel.slice(0, 3)`; the aria's range uses full names. `fitStrip` algorithm:

```
items = stripItems(spans, block)
chunks = before-group months [0, from) cut into [0..2], [3..5], … ;
         after-group months (to, n) cut from the end: [n-3..n-1], [n-6..n-4], …
         keep only chunks with ≥ 2 months; order = before chunks, then after chunks
for each chunk while width(items, compact=false) > available: replace its single items with one merged item
if still too wide: compact = true
scroll = width(items, compact) > available
width(items, c) = Σ pillWidth(item, c) + gap × (items.length − 1)
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/monthFolding.test.ts`
Expected: PASS (old and new tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/monthFolding.ts app/src/cycle-tracking/__tests__/monthFolding.test.ts
git commit -m "feat(chart-folding): fold mode, 14-day pills frame, header geometry and pill strip model"
```

---

### Task 2: Hook selects the mode

**Files:**
- Modify: `app/src/cycle-tracking/useMonthFolding.ts`
- Test: `app/src/cycle-tracking/__tests__/useMonthFolding.test.tsx`

**Interfaces:**
- Consumes: `foldMode`, `frameDays`, `defaultOpenBlock(spans, anchorLatest, frame)` (Task 1).
- Produces: `MonthFolding` gains `mode: FoldMode`. `enabled === (mode !== 'off')`. `foldedBefore`/`foldedAfter`/`foldedDays`/`visible`/`canFold` behave as today whenever `enabled` (both modes). `collapseAll`, `showAll`, `open`, `fold` unchanged. The state key includes `mode` instead of `enabled`.

- [ ] **Step 1: Rewrite the first test and add the mode tests**

Replace `it('is disabled below 1024px and exposes the full range', …)` with:

```ts
it('is in pills mode below 1024px with a 14-day default block', () => {
  stubMatchMedia(false);
  const { result } = renderHook(() => useMonthFolding(args));
  expect(result.current.mode).toBe('pills');
  expect(result.current.enabled).toBe(true);
  expect(result.current.block).toEqual({ from: 3, to: 3 });
  expect(result.current.visible).toEqual({ minDay: 87, maxDay: 105 });
  expect(result.current.scrollIntent.current).toBe('end');
});
it('is off for a cycle of 40 days or fewer at any width', () => {
  stubMatchMedia(false);
  const { result } = renderHook(() => useMonthFolding({ ...args, lastDay: 40 }));
  expect(result.current.mode).toBe('off');
  expect(result.current.visible).toBeNull();
});
it('resets to the new mode default and re-arms the scroll when crossing 1024px', () => {
  stubMatchMedia(true);
  const { result } = renderHook(() => useMonthFolding(args));
  act(() => result.current.showAll());
  result.current.scrollIntent.current = null;
  act(() => changeListener!({ matches: false }));
  expect(result.current.mode).toBe('pills');
  expect(result.current.block).toEqual({ from: 3, to: 3 });
  expect(result.current.scrollIntent.current).toBe('end');
  result.current.scrollIntent.current = null;
  act(() => changeListener!({ matches: true }));
  expect(result.current.mode).toBe('ribbons');
  expect(result.current.block).toEqual({ from: 2, to: 3 });
  expect(result.current.scrollIntent.current).toBe('end');
});
```

Update the two existing tests that assert `enabled` is false after `changeListener!({ matches: false })` (`returns to the default block after …`, `re-arms scrollIntent …`) to expect `mode` `'pills'` and the pills default `{ from: 3, to: 3 }` instead; their ribbons-side assertions stay.

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/useMonthFolding.test.tsx`
Expected: FAIL (`mode` undefined; block `{2,3}` vs `{3,3}`).

- [ ] **Step 3: Implement** — `mode = foldMode(wide, isFoldingEligible(lastDay, spans))`; `defaultBlock = defaultOpenBlock(spans, anchorLatest, frameDays(mode))`; key `${cycleId}|${anchorLatest}|${mode}|${spans.length}`.

- [ ] **Step 4: Run hook and rules tests**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/useMonthFolding.test.tsx src/cycle-tracking/__tests__/monthFolding.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/useMonthFolding.ts app/src/cycle-tracking/__tests__/useMonthFolding.test.tsx
git commit -m "feat(chart-folding): pills mode below 1024px with a 14-day default block"
```

---

### Task 3: `MonthPillStrip` component (floating strip + edge stubs)

**Files:**
- Create: `app/src/cycle-tracking/components/MonthPillStrip.tsx`
- Create: `app/src/cycle-tracking/components/measurePill.ts`
- Test: `app/src/cycle-tracking/__tests__/MonthPillStrip.test.tsx`

**Interfaces:**
- Consumes: `fitStrip`, `stripItemLabel`, `stripItemAriaLabel`, `stripItemTarget`, `StripItem`, `OpenBlock`, `dayWord` (Task 1); `paletteFor`, `MonthSpan` (`../utils`); `SignDot`.
- Produces:
  ```ts
  // measurePill.ts
  export function measurePillWidth(item: StripItem, compact: boolean): number;
  // canvas measureText of stripItemLabel at "600 11px <body font>" + horizontal padding (13 with sign + 12 px dot + 4 gap, 18 without) + 2 border.
  // Falls back to 6.5 px per character when canvas 2D is unavailable (jsdom). Caches the context.
  ```
  ```tsx
  export function MonthPillStrip(props: {
    scrollContainerRef: RefObject<HTMLElement>;
    spans: MonthSpan[];
    block: OpenBlock;
    chartWidth: number;      // chart container's explicit width
    height: number;          // chart container height (stubs run 30 → height)
    onOpen: (monthIndex: number) => void;
    onFold: (monthIndex: number) => void;
    measure?: (item: StripItem, compact: boolean) => number; // default measurePillWidth
  }): JSX.Element;
  ```
  Renders one zero-size wrapper `zIndex: 6` holding: the strip (`position: absolute; top: 0; left: scrollLeft + 4; width: clientWidth − 8; height: 30; display: flex; gap: 4px; overflowX: scroll ? 'auto' : 'visible'`, scrollbar hidden) with one `<button>` per item, and the stubs. Folded/merged buttons call `onOpen(stripItemTarget(item))`; foldable open buttons call `onFold(…)`; lone open buttons are `disabled`-free but inert (`aria-disabled="true"`, no handler). Every button stops click/pointerdown/touchstart propagation. Scroll listener + `ResizeObserver` exactly as `FoldRibbonLayer` (rAF-throttled).

- [ ] **Step 1: Write the failing tests** (reuse `fakeScrollContainer`, `flushRaf` helpers from `FoldRibbonLayer.test.tsx`; fixtures Jul 0 1–25, Aug 1 26–56, Sep 2 57–86, Oct 3 87–105; `measure = (i, c) => 10 * stripItemLabel(i, c).length + 20`)

```tsx
it('renders one pill per month in calendar order with the spec labels', () => {
  render(<MonthPillStrip {...base} block={{ from: 3, to: 3 }} />); // clientWidth 1000
  expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
    'Show July, 25 days', 'Show August, 31 days', 'Show September, 30 days', 'October is open',
  ]);
  expect(screen.getByRole('button', { name: 'Show July, 25 days' })).toHaveTextContent(/\+\s*Jul 25/);
});
it('open pills show "−" only when foldable and call onFold', () => {
  const onFold = vi.fn();
  render(<MonthPillStrip {...base} block={{ from: 2, to: 3 }} onFold={onFold} />);
  fireEvent.click(screen.getByRole('button', { name: 'Fold September' }));
  expect(onFold).toHaveBeenCalledWith(2);
});
it('folded pills call onOpen; a merged pill opens the month nearest the block', () => {
  const onOpen = vi.fn();
  render(<MonthPillStrip {...base} clientWidth={300} block={{ from: 3, to: 3 }} onOpen={onOpen} />);
  const merged = screen.getByRole('button', { name: 'Show September, 30 days (July–September folded, 86 days)' });
  expect(merged).toHaveTextContent('Jul–Sep 86');
  fireEvent.click(merged);
  expect(onOpen).toHaveBeenCalledWith(2);
});
it('merged pill takes its first month colour; folded pills are outlined', () => {
  render(<MonthPillStrip {...base} clientWidth={300} block={{ from: 3, to: 3 }} />);
  const pill = within(screen.getByRole('button', { name: /July–September/ })).getByTestId('pill');
  expect(pill.style.borderColor).toBe(hexToRgb(paletteFor(0).underline));
  expect(pill.style.background).toContain('rgb(255, 255, 255)');
});
it('floats at scrollLeft + 4 and follows scroll', () => {
  // scroll el to 500 then flushRaf(); strip.style.left === '504px', width === `${clientWidth - 8}px`
});
it('stops propagation so taps never pin a tooltip', () => {
  const outer = vi.fn();
  render(<div onClick={outer} onPointerDown={outer} onTouchStart={outer}><MonthPillStrip {...base} block={{ from: 3, to: 3 }} /></div>);
  const b = screen.getByRole('button', { name: 'Show July, 25 days' });
  fireEvent.pointerDown(b); fireEvent.touchStart(b); fireEvent.click(b);
  expect(outer).not.toHaveBeenCalled();
});
it('draws a before-stub with one segment per hidden month and no after-stub', () => {
  // block {3,3}: getAllByTestId('stub-before') segments' backgrounds = underline of months 0,1,2; queryByTestId('stub-after') null
});
it('clamps the after-stub to the chart edge when the chart is narrower than the viewport', () => {
  // ended cycle, block {0,0}, chartWidth 400, clientWidth 900, scrollLeft 0 → stub-after left === '396px'
});
it('lets the strip scroll when even compact pills do not fit', () => {
  render(<MonthPillStrip {...base} clientWidth={80} block={{ from: 0, to: 3 }} />);
  expect(screen.getByTestId('pill-strip').style.overflowX).toBe('auto');
});
```

(`base` = `{ scrollContainerRef, spans, chartWidth: 2000, height: 860, onOpen: vi.fn(), onFold: vi.fn(), measure }` with `clientWidth` passed to `fakeScrollContainer`; adapt the helper so `clientWidth` is a test parameter. Add `data-testid` `pill-strip`, `pill` (the inner 22 px span), `stub-before`, `stub-after`.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && npx vitest run src/cycle-tracking/__tests__/MonthPillStrip.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `measurePill.ts` and `MonthPillStrip.tsx`** per the Interfaces block and Global Constraints (pill styles, folded "+" plain text, open "−" `SignDot`).

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx tsc --noEmit -p . && npx vitest run src/cycle-tracking/__tests__/MonthPillStrip.test.tsx`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/components/MonthPillStrip.tsx app/src/cycle-tracking/components/measurePill.ts app/src/cycle-tracking/__tests__/MonthPillStrip.test.tsx
git commit -m "feat(chart-folding): floating month pill strip with merge-in-threes overflow and edge stubs"
```

---

### Task 4: Wire pills mode into the chart page

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` — `:207-211` (ribbon widths), `:1405` (`paddingTop`), `:1422` (gutter label cell), `:1440-1525` (gutter overlay: hairline and natural-position pills), `:1527-1537` (ribbon layer), `:1577`, `:1609`, `:1643` (header cell tops).

**Interfaces:**
- Consumes: `fold.mode` (Task 2), `headerGeometry` (Task 1), `MonthPillStrip` (Task 3).

- [ ] **Step 1: Geometry from the mode**

`const geo = headerGeometry(fold.mode)`. `ribbonsLeft`/`ribbonsRight` = `fold.mode === 'ribbons' ? count × RIBBON_WIDTH : 0`. Container `paddingTop: \`${geo.header}px\``; gutter label cell `height: geo.gutter` and, when `fold.mode === 'pills'`, no `border-r`; gutter overlay height `geo.gutter`; hairline `top: geo.hairlineTop` and `left: fold.mode === 'pills' ? 0 : plotAreaOffset`; Date/Week Day/Cycle Day `top` = `geo.dateTop`/`geo.weekDayTop`/`geo.cycleDayTop`. In ribbons and off mode every value equals today's literal.

- [ ] **Step 2: Strip instead of natural pills and ribbons in pills mode**

Skip the `monthSpans.map(...)` natural-position pills when `fold.mode === 'pills'`. Render `FoldRibbonLayer` only when `fold.mode === 'ribbons'` (and something is folded). When `fold.mode === 'pills'` render `<MonthPillStrip scrollContainerRef={scrollContainerRef} spans={fold.spans} block={fold.block} chartWidth={foldedWidth ?? containerMinWidth} height={containerHeight} onOpen={fold.open} onFold={fold.fold} />` in the same place. `FoldToolbar` keeps rendering when `fold.enabled` (both modes).

- [ ] **Step 3: Type-check and run the suite**

Run: `cd app && npx tsc --noEmit -p . && npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Verify by eye at 390×844 on `/cycles/<long-cycle-id>/chart`** (Playwright MCP; if the page shows "Loading…", set `wasp:sessionId` in localStorage)

Default: toolbar `86 days folded`, strip `+ Jul 25  + Aug 31  + Sep 30  Oct 19` (or `+ Jul–Sep 86  Oct 19` if it does not fit the measured card), latest day 19 Oct at the right edge, blue/green/slate stub at the left edge, no vertical line above Date, columns 22 px. Tap `+ Sep 30` → September opens, scrolled to 1 Sep, strip `+ Jul 25  + Aug 31  − Sep 30  − Oct 19`, strip stays put while swiping into October. Tap `− Oct 19` → October folds, after-stub at the right edge. Show all → 103 columns, no stubs, scrolled to 19 Oct. Collapse all → October only. At 1440 px the chart is pixel-identical to `main` (ribbons, 22 px gutter). At 1000 px: pills. Pin a tooltip on 18 Oct, tap a pill over it → the tooltip does not move.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(chart-folding): fold long cycles with gutter pills below 1024px"
```

---

### Task 5: Final verification

**Files:** none new.

- [ ] **Step 1: Full checks** — `cd app && npx tsc --noEmit -p . && npx vitest run` → all green.

- [ ] **Step 2: Ended long cycle** — open an ended long cycle from local test data; at 390 px it opens on 7 Jul with July open, strip `Jul 25  + Aug 31  + Sep 30  + Oct 19` (merged as `+ Aug–Oct 80` from the far side if it does not fit), after-stub at the right edge; Collapse all → July only (25 days ≈ 690 px, still scrolls inside the card).

- [ ] **Step 3: Band edges and short cycles** — at 768 px and 1023 px pills; at 1024 px ribbons. A ≤ 40-day cycle at 390 px and 1440 px looks exactly as on `main` (22 px gutter, natural pills, no toolbar).

- [ ] **Step 4: Nothing personal staged** — `git log --stat main..HEAD | grep -i "sql\|local-long\|brainstorm"` → no output.

- [ ] **Step 5: Hand over** — Codex review of the branch (`/codex-review`), then `superpowers:finishing-a-development-branch`.
