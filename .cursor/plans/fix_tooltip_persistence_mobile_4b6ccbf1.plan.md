---
name: Fix tooltip persistence mobile
overview: "Fix two issues with the chart tooltip/crosshair: (1) touch events on mobile stop firing due to race conditions and ApexCharts zoom interference, and (2) tooltip auto-dismisses too quickly instead of persisting until explicit user action."
todos:
  - id: disable-zoom
    content: "Disable ApexCharts zoom (`zoom: { enabled: false }`) to prevent touch event interference"
    status: completed
  - id: rework-touch
    content: "Rework touch handlers: pin on tap in touchend, track isTouchScrollingRef + lastTouchedDayRef + lastTouchEndTimeRef"
    status: completed
  - id: suppress-synthetic-click
    content: "Suppress synthetic click: check lastTouchEndTimeRef at top of handleClick, ignore if < 600ms after touchend"
    status: completed
  - id: persistent-desktop
    content: "Neutralise all non-explicit dismiss paths: mouseleave no-op, resolveDay out-of-bounds returns, handleCellMouseLeave no-op, remove tooltip card onMouseLeave handlers, add document pointerdown listener with cleanup in same effect return"
    status: completed
  - id: simplify-close
    content: Replace scheduleClose with synchronous dismissTooltip(); remove hover bridge (cancelClose/tooltipHoveredRef/tooltip card mouse handlers)
    status: completed
  - id: update-readme
    content: "Update README.md: Mobile Touch Support, Edit from Chart, and architecture sections"
    status: completed
isProject: false
---

# Fix Tooltip/Crosshair Persistence and Mobile Touch Issues

All changes are in two files:

- `[app/src/cycle-tracking/CycleChartPage.tsx](app/src/cycle-tracking/CycleChartPage.tsx)` -- event handling logic
- `[app/README.md](app/README.md)` -- documentation of tooltip behavior

---

## Root Cause Analysis

### Problem 1: Tooltips stop firing on mobile

Three contributing factors:

**a) `handleTouchEnd` always calls `scheduleClose()`** (line 773-775). On mobile, the sequence is:

1. `touchstart` fires -> `resolveDay()` -> tooltip appears
2. `touchend` fires -> `scheduleClose()` -> 600ms timer starts
3. Synthetic `click` fires (dispatched by most mobile browsers ~300ms after `touchend`)

When the synthetic `click` fires within that 600ms window it calls `handleCellClick`, which *pins* the tooltip and cancels the close timer -- but then immediately fires again, *unpinning* it and leaving state inconsistent. After a few taps the handlers are operating on stale state and stop activating the tooltip visually.

**b) ApexCharts zoom is enabled** (line 502-504), which registers its own touch handlers on the canvas. After certain touch interactions, ApexCharts' internal zoom/selection machinery can enter a state that consumes or interferes with subsequent touch events, preventing the custom handlers from working correctly. Since the toolbar is hidden, the user can't even reset a zoom.

**c) `resolveDay` calls `scheduleClose()` when coordinates are outside the plot area** (lines 704-708). On mobile, a slight imprecision in touch landing position (above or below the narrow plot area) causes immediate dismissal even on a successful tap.

### Problem 2: Tooltip disappears too quickly

The `scheduleClose` mechanism (line 400-410) dismisses the tooltip after only 600ms. Five distinct code paths fire it:

- `handleMouseLeave` on the canvas (line 724)
- `resolveDay` when coordinates are out-of-bounds (lines 704-708)
- `handleTouchEnd` unconditionally (line 774)
- Tooltip outer wrapper `onMouseLeave` (line 1214)
- Tooltip inner card `onMouseLeave` (line 1220)
- `handleCellMouseLeave` (line 430) -- calls `scheduleClose`; must be converted to a no-op

All of these must be neutralised. The user wants: **tooltip stays visible until explicitly dismissed by tapping/clicking another node or clicking outside the chart**.

---

## Implementation Plan

### 1. Disable ApexCharts zoom

In the `chartOptions` useMemo (line 502-504), change:

```javascript
zoom: {
  enabled: false
}
```

The toolbar is already hidden, so zoom is inaccessible to the user anyway. Disabling it prevents ApexCharts from registering its own touch/mouse handlers that interfere with the custom tooltip logic.

### 2. Rework touch handling to pin on tap + suppress synthetic click

Add two new refs: `isTouchScrollingRef` (boolean) and `lastTouchedDayRef` (number | null).

- `**handleTouchStart**`: Store start X, update cursor position refs, call `resolveDay()` to show tooltip immediately, and record the resolved day in `lastTouchedDayRef`.
- `**handleTouchMove**`: If horizontal movement > 10px, set `isTouchScrollingRef = true` and call `dismissTooltip()`. Otherwise call `resolveDay()` and update `lastTouchedDayRef`.
- `**handleTouchEnd**`: Perform tap-to-pin directly here, without relying on the subsequent synthetic `click`:
  - If `isTouchScrollingRef` is true: call `dismissTooltip()`, reset both refs, return.
  - If `lastTouchedDayRef` holds a valid day with data: call `handleCellClickRef.current(lastTouchedDayRef.current)` to pin/toggle, then reset both refs.
  - If no valid day: call `dismissTooltip()`, reset both refs.
  - **Set `lastTouchEndTimeRef.current = Date.now()`** before returning.
- `**handleClick**` (synthetic click suppression): At the top of `handleClick`, add:

```typescript
  if (Date.now() - lastTouchEndTimeRef.current < 600) return;
  

```

  This discards the synthetic `click` that mobile browsers dispatch after `touchend`, preventing the immediate unpin that would follow the pin set in `handleTouchEnd`. 600ms safely covers the synthetic click window (typically ~300ms) without affecting intentional desktop clicks.

### 3. Make tooltip persistent: neutralise all non-explicit dismiss paths

Every place that currently calls `scheduleClose`/`dismissTooltip` outside of a deliberate user action must be addressed:

**a) `handleMouseLeave` on the canvas (line 724)**: Change to a no-op (`() => {}`). When the mouse leaves the chart, the tooltip for the last hovered/pinned day stays visible.

**b) `resolveDay` out-of-bounds path (lines 704-708)**: Remove the `scheduleClose()` call and replace with a bare `return`. This is critical for both desktop (cursor briefly exits plot bounds while moving between nodes) and mobile (touch imprecision near plot edges).

**c) `handleCellMouseLeave` (line 429-431)**: Change its body to a no-op (`() => {}`). The function calls `scheduleClose`, which violates the persistence invariant and must be removed regardless of whether it is currently reachable.

**d) Tooltip card `onMouseLeave` handlers (lines 1214 and 1220)**: Remove entirely. These were the hover-bridge close triggers. Since the tooltip persists unconditionally and the hover bridge is being removed (see step 4), these inline handlers have no role.

**e) Document-level `pointerdown` listener -- with explicit cleanup**: Add inside the same `useEffect` that registers the canvas listeners:

```typescript
const handleDocumentPointerDown = (e: PointerEvent) => {
  if (
    chartContainerRef.current &&
    !chartContainerRef.current.contains(e.target as Node)
  ) {
    dismissTooltipRef.current();
  }
};
document.addEventListener('pointerdown', handleDocumentPointerDown);
```

And in the **effect's `return` cleanup function**, add:

```typescript
document.removeEventListener('pointerdown', handleDocumentPointerDown);
```

This must be paired with the existing cleanup for canvas listeners so the document listener is torn down whenever the effect re-runs (e.g. when `plotAreaWidth` or `daysWithDataMap` changes) and on unmount, preventing listener accumulation and duplicate dismiss calls.

**f) Canvas `handleClick` out-of-bounds path (lines 731-741)**: Currently clears only the pinned state. Extend it to also call `dismissTooltipRef.current()` so hovering-only tooltips (not yet pinned) are also cleared when clicking outside the plot area within the canvas.

### 4. Replace `scheduleClose` with `dismissTooltip`

`scheduleClose` with its 600ms timer is no longer needed. Replace it with a synchronous `dismissTooltip()` function:

```typescript
const dismissTooltip = () => {
  if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  setHoveredDayNumber(null);
  setCrosshairX(null);
  pinnedDayNumberRef.current = null;
  pinnedCrosshairXRef.current = null;
  setPinnedDayNumber(null);
  setPinnedCrosshairX(null);
};
```

The tooltip hover bridge (`onMouseEnter`/`onMouseLeave` on the tooltip card) and `cancelClose` are no longer needed for persistence, so remove them. The tooltip card can be simplified to have no mouse event handlers at all, since the tooltip will naturally persist.

### 5. Update README.md

Update three sections in `[app/README.md](app/README.md)`:

**Line 82** -- "Mobile Touch Support" bullet: Replace with the new behavior: tapping a column pins the tooltip; it stays visible until the user taps another column or taps anywhere outside the chart. Lifting the finger no longer dismisses. Horizontal scroll gestures (>10 px) still dismiss immediately.

**Lines 86-98** -- "Edit from Chart" bullet: Remove references to the hover bridge (600ms delayed close, `cancelClose`/`scheduleClose`, `tooltipHoveredRef`, hover shield). Replace with: the tooltip persists unconditionally after hover or tap; on desktop it stays until a click on another column or click outside; on mobile it stays until a tap on another column or tap outside. The Edit button is always reachable because the tooltip does not auto-dismiss.

**Line 310** -- Architecture section: Replace "600 ms delayed close with `cancelClose`/`scheduleClose` helpers and `tooltipHoveredRef` hover bridge" with: "Tooltip persists until explicit dismissal: `dismissTooltip()` called only by document-level `pointerdown` outside the chart container, canvas click outside the plot area, or horizontal scroll gesture on touch."