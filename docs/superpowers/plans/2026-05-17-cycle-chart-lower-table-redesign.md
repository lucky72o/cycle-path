# Cycle Chart Lower-Table Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the cycle-chart lower table (Time Stamp, LH Test, Intimacy, 5-row Cervical Fluid, Disturbance, Notes) to a light, borderless, soft-tinted tile design per `docs/superpowers/specs/2026-05-17-cycle-chart-lower-table-redesign-design.md`, without changing any data, layout math, or interpretation logic.

**Architecture:** All rendering lives in one component, `app/src/cycle-tracking/CycleChartPage.tsx`. Each row is a set of absolutely-positioned day cells at `left = plotAreaOffset + i*cellWidth`, `width = cellWidth`. We keep that positioning untouched and change only the *inner* presentation: remove `border-*-slate-300` lines, draw a rounded inner tile with a pale tint and ~3 px white gap, recolour symbols/labels, and soften the cervical-fluid palette (extracted to `utils.ts` for unit testing). The hover crosshair/tooltip handlers and `cellWidth` math are not modified, so the column highlight keeps working.

**Tech Stack:** React + TypeScript (Wasp app), Tailwind CSS + inline styles, Vitest for unit tests, self-hosted woff2 webfont (matching the existing Satoshi `@font-face` pattern). No new npm dependencies (avoids the Wasp version-pinning constraint).

---

## Conventions (read once, applied by every styling task)

### Design tokens

> ⚠️ **Superseded by "As-built token values" at the end of this plan.** The table below is the first-pass target; several tints/colours/icon sizes were refined during implementation review — see the end of the doc for what shipped.

| Row | Resting tint | Hover (deepened) tint |
|---|---|---|
| Time Stamp | `#fffdf2` | `#fdf0c8` |
| LH Test | `#f2faf3` | `#dff0e2` |
| Intimacy | `#fdf2f8` | `#f9d6e8` |
| Cervical Fluid (5 sub-tiles) | `#f3f8ff` | `#dce8fb` |
| Disturbance | `#faf5ff` | `#ece0fb` |
| Notes | `#fafaf9` | `#edebe7` |
| Tail / out-of-cycle (any row) | `#f1f5f9` (text `#cbd5e1`) | same (no hover change) |

- **Title text:** colour `#1e3a8a`, Tailwind class `font-montserrat`, `font-weight:600`, `font-size:11px`, `letter-spacing:0.02em`. Label cell background = that row's resting tint (coloured title column). Keep the existing `flex items-center justify-end px-3` layout; **delete** `border-b border-slate-300 border-r border-slate-300` and the old `bg-*`.
- **Time-Stamp values:** text colour `#3b82f6` (hours keep `font-weight:500`).
- **CF appearance colours (softened):** EGGWHITE `#8fd9e6`, WATERY `#bfe9f3`, CREAMY `#cdeef0`, STICKY `#dcf0f1`, NONE `#e2e8f0`. Heights unchanged: NONE 28, STICKY 56, CREAMY 84, WATERY 112, EGGWHITE 140.
- **LH symbol colours:** Low/Rising/Declining stroke `#3b82f6`; Peak stroke `#16a34a` + amber dot `#f59e0b`.

### Canonical "inner tile" pattern

The outer positioned cell keeps `left/width/top/height` and becomes a transparent, border-free container with `position:relative`. Its visible appearance is an inner tile inset 1.5 px on all sides with rounded corners:

```tsx
// OUTER cell: remove `border-r border-b border-slate-300` and any `bg-*`; keep position/size.
// className becomes: `absolute` (+ `transition-colors` may be dropped; transition moves to inner)
// style keeps left/width/top/height/pointerEvents; remove backgroundColor.
<div className="absolute" style={{ left:`${leftEdge}px`, width:`${cellWidth}px`, top:0, height:'28px', pointerEvents:'none' }}>
  <div
    className="absolute flex items-center justify-center transition-colors"
    style={{
      inset: '1.5px',
      borderRadius: '3px',
      backgroundColor: isTail ? '#f1f5f9' : (isHovered ? HOVER_TINT : REST_TINT),
    }}
  >
    {/* existing cell content (number / symbol / heart); tail text colour #cbd5e1 */}
  </div>
</div>
```

For row-label cells, the label must become the **same inset rounded tile** as a day cell (spec: "Row label cell uses the same inset/radius/tint"), and it must NOT change the row's height. **Do not use `margin`** (it would inflate the layout: a 28 px label + 1.5 px top/bottom margin = 31 px, and the five CF labels would stack to 155 px instead of 140 px, breaking every `top:` offset). Instead, use a **fixed-height wrapper + absolutely-positioned inner inset tile** (identical to the day-cell pattern):

The existing label markup looks like:

```tsx
<div className="absolute left-0" style={{ width:`${plotAreaOffset}px`, top:`${...}px`, zIndex:2 }}>
  <div className="flex items-center justify-end px-3 text-xs font-medium <oldBg> border-b border-slate-300 border-r border-slate-300" style={{ height:'28px' /* or 38px for Time Stamp */ }}>
    Label
  </div>
</div>
```

Transform the inner block into a fixed-height *wrapper* (unchanged height → all offsets preserved) containing an absolutely-positioned inset tile:

```tsx
<div className="absolute left-0" style={{ width:`${plotAreaOffset}px`, top:`${...}px`, zIndex:2 }}>
  <div
    style={{ position:'relative', height:'28px' /* keep the original 28px / 38px */ }}
    /* If the original carried role/tabIndex/onClick/onKeyDown (Notes & Disturbance label toggles),
       move those attributes/handlers HERE so the full-height slot stays the click target. */
  >
    <div
      className="absolute flex items-center justify-end px-3 font-montserrat"
      style={{
        inset: '1.5px',
        borderRadius: '3px',
        backgroundColor: '<REST_TINT>',
        color: '#1e3a8a',
        fontWeight: 600,
        fontSize: '11px',
        letterSpacing: '0.02em',
      }}
    >
      Label
    </div>
  </div>
</div>
```

The wrapper keeps the original `height` (28 px, or 38 px for Time Stamp), so every `top:` offset and the 140 px CF label stack are byte-for-byte unchanged. The inner `inset:1.5px` produces the same ~3 px white gap as day cells. Drop the old `border-*-slate-300` and `text-xs font-medium <oldBg>` classes.

**Notes-row exception:** the Notes *grid* cell is an interactive `role="button"` (`CycleChartPage.tsx:2563-2597`) with `onClick`/`onKeyDown`/`aria-disabled`/`tabIndex`/`cursor` and `pointerEvents:'auto'`, and it *already* contains an inner tile div. For Notes, do **not** apply the generic outer (no `pointerEvents:'none'`): keep the outer `<div>`'s `role`/`aria-disabled`/`tabIndex`/`onClick`/`onKeyDown`/`cursor`/`pointerEvents:'auto'` exactly as-is and only recolour/resize its existing inner tile. See Task 3 Step 5.

### Invariants — DO NOT CHANGE

- `cellWidth = plotAreaWidth / numDays`, `leftEdge`, `plotAreaOffset`, the outer cell `left/width`, `MIN_CELL_WIDTH`, `computeContainerMinWidth`, and the `overflow-x-auto` wrapper.
- The mouse-move / crosshair / tooltip handlers and `hoveredDayNumber` / `setCrosshairX` logic.
- The CF bar suppression guard `!isTail && cfData?.cervicalAppearance && !cfData?.menstrualFlow` and all menstrual-flow marker markup/colours (`#E53935`, `#d65866`, `#c82739`).
- Logged `NONE` cervical appearance must keep rendering the Dry-row bar (height 28); only a *missing* entry renders nothing.
- The Cycle-Day chip / upper header — not touched by this plan.
- All row/label `top:` offsets and heights (Time Stamp 38px; LH/Intimacy/Disturbance/Notes 28px; the 5-row CF block 140px). Labels become inset tiles via a **fixed-height wrapper + absolute inner tile** (never `margin`), so total heights and every `top:` offset stay byte-for-byte unchanged.

### Verification note

Inline-style/JSX restyles have no meaningful unit test; the only pure logic here (the CF appearance→colour/height map) is extracted to `utils.ts` and unit-tested (Task 2). All other tasks verify by: (a) `npm run lint` clean, (b) `npx vitest run` green, (c) `wasp start` dev server + the `preview_*` tools to visually confirm against `docs/superpowers/specs/2026-05-17-...` and the archived mock `.superpowers/brainstorm/.../full-chart-v4.html`. Use a real cycle with logged data; if none exists, note it and verify with whatever cycle is available.

---

## Task 1: Add the Montserrat webfont (self-hosted, no npm)

**Files:**
- Create: `app/public/fonts/Montserrat-Medium.woff2`
- Create: `app/public/fonts/Montserrat-SemiBold.woff2`
- Modify: `app/src/client/Main.css` (after the existing `@font-face` for Satoshi, ~line 60)
- Modify: `app/tailwind.config.js:16` (the `fontFamily` block)

- [ ] **Step 1: Download the two woff2 files (stable jsDelivr/fontsource URLs, no npm install)**

Use a **pinned, immutable** `@fontsource/montserrat` version (not `@latest`) so the binary assets are reproducible. Pinned version: **`5.0.8`**.

Run:
```bash
cd /Users/olgapak/work/cycle-path/app && \
FS_VER=5.0.8 && \
curl -fsSL -o public/fonts/Montserrat-Medium.woff2 "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@${FS_VER}/files/montserrat-latin-500-normal.woff2" && \
curl -fsSL -o public/fonts/Montserrat-SemiBold.woff2 "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@${FS_VER}/files/montserrat-latin-600-normal.woff2" && \
ls -l public/fonts/Montserrat-*.woff2 && file public/fonts/Montserrat-*.woff2
```
Expected: both files exist, each > 10 KB, and `file` reports `Web Open Font Format (Version 2)`.

If `5.0.8` 404s on jsDelivr, do **not** fall back to `@latest`: pick the newest published `@fontsource/montserrat` version, substitute it into `FS_VER`, and record the exact version used in the Step 5 commit message (keeps the asset reproducible).

- [ ] **Step 2: Add the `@font-face` rules to `Main.css`**

Insert immediately after the closing `}` of the existing Satoshi `@font-face` block (around line 60):

```css
@font-face {
  font-family: 'Montserrat';
  src: url('/fonts/Montserrat-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Montserrat';
  src: url('/fonts/Montserrat-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 3: Register the family in Tailwind**

In `app/tailwind.config.js`, change the `fontFamily` block (line 15-17) from:

```js
      fontFamily: {
        satoshi: ['Satoshi', 'system-ui', 'sans-serif'],
      },
```

to:

```js
      fontFamily: {
        satoshi: ['Satoshi', 'system-ui', 'sans-serif'],
        montserrat: ['Montserrat', 'system-ui', 'sans-serif'],
      },
```

- [ ] **Step 4: Build & lint**

Run: `cd /Users/olgapak/work/cycle-path/app && npm run lint && npx vitest run`
Expected: lint clean, all tests pass (no behavioural change yet).

- [ ] **Step 5: Commit**

```bash
cd /Users/olgapak/work/cycle-path && \
git add app/public/fonts/Montserrat-Medium.woff2 app/public/fonts/Montserrat-SemiBold.woff2 app/src/client/Main.css app/tailwind.config.js && \
git commit -m "feat(chart): self-host Montserrat (500/600) webfont"
```

---

## Task 2: Extract & soften the cervical-fluid colour/height map (TDD)

`getCFBarColor` / `getCFBarHeight` are currently module-local in `CycleChartPage.tsx` (~lines 559–568) and untestable. Move them to `utils.ts` (where `computeContainerMinWidth` and its tests already live) and apply the softened palette.

**Files:**
- Modify: `app/src/cycle-tracking/utils.ts` (add exports near the other chart helpers)
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:559-568` (delete local defs) and its import line (`import { ... } from './utils'`, ~line 8)
- Test: `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` (add a `describe` block; this file already imports from `../utils`)

- [ ] **Step 1: Write the failing test**

Append to `app/src/cycle-tracking/__tests__/headerHelpers.test.ts` (and add `getCFBarColor, getCFBarHeight` to its existing `import { ... } from '../utils'`):

```ts
describe('getCFBarColor (softened palette)', () => {
  it('maps each appearance to the softened hex', () => {
    expect(getCFBarColor('EGGWHITE')).toBe('#8fd9e6');
    expect(getCFBarColor('WATERY')).toBe('#bfe9f3');
    expect(getCFBarColor('CREAMY')).toBe('#cdeef0');
    expect(getCFBarColor('STICKY')).toBe('#dcf0f1');
    expect(getCFBarColor('NONE')).toBe('#e2e8f0');
  });
});

describe('getCFBarHeight (unchanged mapping)', () => {
  it('keeps the existing per-quality heights', () => {
    expect(getCFBarHeight('NONE')).toBe(28);
    expect(getCFBarHeight('STICKY')).toBe(56);
    expect(getCFBarHeight('CREAMY')).toBe(84);
    expect(getCFBarHeight('WATERY')).toBe(112);
    expect(getCFBarHeight('EGGWHITE')).toBe(140);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run src/cycle-tracking/__tests__/headerHelpers.test.ts`
Expected: FAIL — `getCFBarColor`/`getCFBarHeight` not exported from `../utils`.

- [ ] **Step 3: Add the implementations to `utils.ts`**

Append to `app/src/cycle-tracking/utils.ts`:

The call sites pass `cfData.cervicalAppearance`, which is typed `string | null` (`CycleChartPage.tsx:592`) and is narrowed only to `string` by the truthiness guard. So the utilities **accept `string`** (not a narrowed union) — this keeps the call sites unchanged and avoids retyping `cervicalMenstrualMap`.

```ts
export function getCFBarColor(appearance: string): string {
  switch (appearance) {
    case 'EGGWHITE': return '#8fd9e6';
    case 'WATERY':   return '#bfe9f3';
    case 'CREAMY':   return '#cdeef0';
    case 'STICKY':   return '#dcf0f1';
    case 'NONE':     return '#e2e8f0';
    default:         return 'transparent';
  }
}

export function getCFBarHeight(appearance: string): number {
  switch (appearance) {
    case 'EGGWHITE': return 140;
    case 'WATERY':   return 112;
    case 'CREAMY':   return 84;
    case 'STICKY':   return 56;
    case 'NONE':     return 28;
    default:         return 0;
  }
}
```

- [ ] **Step 4: Delete the local defs and import from utils**

In `CycleChartPage.tsx`: delete the local `getCFBarColor` and `getCFBarHeight` definitions (~lines 559–568). Add `getCFBarColor, getCFBarHeight` to the existing `import { ... } from './utils'` (~line 8). Do not change the call sites.

- [ ] **Step 5: Run tests + lint**

Run: `cd /Users/olgapak/work/cycle-path/app && npx vitest run && npm run lint`
Expected: PASS — all tests green, lint clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/olgapak/work/cycle-path && \
git add app/src/cycle-tracking/utils.ts app/src/cycle-tracking/CycleChartPage.tsx app/src/cycle-tracking/__tests__/headerHelpers.test.ts && \
git commit -m "refactor(chart): move + soften CF colour/height map into utils with tests"
```

---

## Task 3: Restyle the simple-row grid cells (Time Stamp, LH Test, Intimacy, Disturbance, Notes)

Apply the canonical inner-tile pattern to the five non-CF rows' day cells, removing borders, adding pale tint + rounded tile + deepened-hover, and tail grey. Per-row REST/HOVER tints from the Conventions token table.

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`
  - Time Stamp grid cells `~2054-2074`
  - LH Test grid cells `~2158-2172`
  - Intimacy grid cells `~2219-2236`
  - Disturbance grid cells (locate: the grid block after the Disturbance label at `~2414-2429`)
  - Notes grid cells (locate: the grid block after the Notes label at `~2431+`)

- [ ] **Step 1: Time Stamp cells** — replace the cell `<div>` (`~2054-2074`). Outer keeps position; inner tile carries tint. New markup:

```tsx
<div
  key={dayNumber}
  className="absolute"
  style={{ left:`${leftEdge}px`, width:`${cellWidth}px`, top:0, height:'38px', pointerEvents:'none' }}
>
  <div
    className="absolute flex flex-col items-center justify-center text-xs transition-colors"
    style={{
      inset:'1.5px', borderRadius:'3px',
      backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#fdf0c8' : '#fffdf2'),
    }}
  >
    {!isTail && timeData && (
      <>
        <div className="font-medium leading-tight" style={{ color:'#3b82f6' }}>{timeData.hours}</div>
        <div className="text-xs leading-tight" style={{ color:'#3b82f6' }}>{timeData.minutes}</div>
      </>
    )}
  </div>
</div>
```

- [ ] **Step 2: LH Test cells** (`~2158-2172`) — same pattern, height `28px`, tints REST `#f2faf3` / HOVER `#dff0e2`, tail `#f1f5f9`. Keep `{!isTail && symbol}` as the inner content (symbol markup itself is replaced in Task 5). Remove `border-r border-b border-slate-300` and the old `backgroundColor` ternary (`#c8e6c9`/`#e8f5e9`/`#fafafa`).

- [ ] **Step 3: Intimacy cells** (`~2219-2236`) — same pattern, height `28px`, tints REST `#fdf2f8` / HOVER `#f9d6e8`, tail `#f1f5f9`. Remove `bg-pink-100`/`bg-pink-50` classes and the `#fafafa` tail; keep the heart span unchanged.

- [ ] **Step 4: Disturbance cells** — locate the grid block paired with the Disturbance label (`~2414`). Apply the canonical pattern: height `28px`, REST `#faf5ff` / HOVER `#ece0fb`, tail `#f1f5f9`; remove `border-*-slate-300` and the old bg; keep the disturbance emoji/count content unchanged.

- [ ] **Step 5: Notes cells (interactive — DO NOT apply the generic outer)** — the Notes grid cell at `CycleChartPage.tsx:2563-2597` is a `role="button"` with `aria-disabled`, `tabIndex`, `onClick`, `onKeyDown`, `cursor`, `pointerEvents:'auto'`, and an existing inner tile div (`~2587-2597`). Keep the **outer** `<div>`'s `role`/`aria-disabled`/`tabIndex`/`onClick`/`onKeyDown`/`cursor`/`pointerEvents:'auto'`/position/size exactly as they are (drop only its `backgroundColor:'white'`). Add `const isHovered = hoveredDayNumber === dayNumber;` alongside the existing `isTail` (line ~2560). Then replace **only the existing inner tile** style (`~2589-2596`) with:

```tsx
style={{
  position: 'absolute',
  inset: '1.5px',
  borderRadius: '3px',
  backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#edebe7' : '#fafaf9'),
}}
```

Keep the note-text rendering (`notesRowExpanded` vertical text, pencil, etc.) below it unchanged. Do **not** set `pointerEvents:'none'` anywhere on this cell.

- [ ] **Step 6: Restyle all five non-CF row LABELS as inset tiles** — apply the **wrapper + inner inset tile recipe from Conventions** to each label (fixed-height wrapper keeps the original height so no offset shifts; inner absolute tile carries `inset:1.5px`, `borderRadius:3px`, tint, `font-montserrat`, `#1e3a8a`, 600/11px/0.02em). Per-label REST tint and wrapper height:
  - **Time Stamp label** `~2027` — wrapper height **`38px`**, REST `#fffdf2` (was `bg-amber-50`).
  - **LH Test label** `~2093` — wrapper height `28px`, REST `#f2faf3` (was `backgroundColor:'#e8f5e9'`).
  - **Intimacy label** `~2191` — wrapper height `28px`, REST `#fdf2f8` (was `bg-pink-50`).
  - **Disturbance label** `~2423-2428` — wrapper height `28px`, REST `#faf5ff` (was `backgroundColor:'#f5f3ff'`).
  - **Notes label** `~2441+` — wrapper height `28px`, REST `#fafaf9` (was its old bg). This label is a `role="button"` toggle (`onClick`/`onKeyDown`/`tabIndex` for `toggleNotesRow`) — move those handlers/attributes onto the **fixed-height wrapper** so the full label slot stays the click target; change only the visual styling on the inner tile.

- [ ] **Step 7: Lint + tests**

Run: `cd /Users/olgapak/work/cycle-path/app && npm run lint && npx vitest run`
Expected: clean + green.

- [ ] **Step 8: Visual verify**

Start dev server (`wasp start` in `app/`) and use `preview_*` tools: navigate to `/cycles/:cycleId/chart`. Confirm: no grey grid lines on these 5 rows or their labels; each day + each label is a soft rounded tile with white gaps; labels are dark-blue `#1e3a8a` Montserrat; Time-Stamp digits are blue `#3b82f6`; tail days are grey; the Notes cell is still clickable (opens the day editor) and the Notes label still toggles the row. `preview_screenshot` for the record.

- [ ] **Step 9: Commit**

```bash
cd /Users/olgapak/work/cycle-path && git add app/src/cycle-tracking/CycleChartPage.tsx && \
git commit -m "feat(chart): borderless soft-tint tiles + montserrat labels for non-CF rows"
```

---

## Task 4: Restyle the Cervical-Fluid block (5 sub-tiles + labels), preserve flow

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`
  - CF row labels `~2261-2271`
  - CF 5 background tiles `~2308-2323`
  - CF bar `~2325-2336` (colour now comes from the Task-2 util; no logic change)
  - Flow markers `~2338-2408` — **leave entirely unchanged**

- [ ] **Step 1: Recolour the 5 background tiles** (`~2309-2323`). Replace the inner style with:

```tsx
style={{
  top: `${rowIdx * 28 + 1.5}px`,
  left: '1.5px',
  width: 'calc(100% - 3px)',
  height: '25px',
  backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#dce8fb' : '#f3f8ff'),
  borderRadius: '3px',
}}
```

(Removes the old `opacity` hover trick and `#e7f1ff`/`#fafafa`; hover now deepens the tint, consistent with the other rows.)

- [ ] **Step 2: Confirm the CF bar is unchanged except colour source.** The block at `~2325-2336` must keep its exact guard `!isTail && cfData?.cervicalAppearance && !cfData?.menstrualFlow` and call `getCFBarColor(cfData.cervicalAppearance)` / `getCFBarHeight(...)` (now the softened util from Task 2). Do not alter the guard. Logged `NONE` still renders (height 28, `#e2e8f0`).

- [ ] **Step 3: Leave the menstrual-flow markers (`~2338-2408`) byte-for-byte unchanged.** Verify the SPOTTING/LIGHT/MEDIUM/HEAVY/VERY_HEAVY markup and colours `#E53935`/`#d65866`/`#c82739` are untouched.

- [ ] **Step 4: Recolour the 5 CF labels as inset tiles** (`~2261-2271`). The five labels are 5 stacked `<div>`s of `height:'28px'` in normal flow (total 140px — must stay 140px). For **each** of the five, apply the **wrapper + inner inset tile recipe from Conventions**: keep the existing per-row `<div>` as the fixed-height wrapper (`position:'relative'`, `height:'28px'`, keep `key` and the `cf-tooltip-trigger` class so the tooltip still triggers), remove `bg-slate-50 border-b border-slate-300 border-r border-slate-300` and `text-xs font-medium`; render an inner absolute tile inside it with `inset:'1.5px'`, `borderRadius:'3px'`, `backgroundColor:'#f3f8ff'`, `color:'#1e3a8a'`, `fontWeight:600`, `fontSize:'11px'`, `letterSpacing:'0.02em'`, class `flex items-center justify-end px-3 font-montserrat`, and move the `<span>{row.name}</span>`, the `ⓘ` span, and the `cf-tooltip-content` span inside that inner tile unchanged. 5 × 28px wrappers = 140px total, unchanged.

- [ ] **Step 5: Lint + tests**

Run: `cd /Users/olgapak/work/cycle-path/app && npm run lint && npx vitest run`
Expected: clean + green.

- [ ] **Step 6: Visual verify (data states)**

With `preview_*`: find/confirm days that exercise EGGWHITE (full-height column), WATERY, a logged-NONE day (small Dry-row marker still visible), a *not-logged* day (empty tinted column), and a menstrual-flow day (flow marker shown, CF bar suppressed). `preview_screenshot`.

- [ ] **Step 7: Commit**

```bash
cd /Users/olgapak/work/cycle-path && git add app/src/cycle-tracking/CycleChartPage.tsx && \
git commit -m "feat(chart): soften CF 5-row tiles + montserrat labels; preserve flow precedence"
```

---

## Task 5: LH Test — Set A symbols

Replace the four `opkStatus` SVG branches (`~2121-2156`) with Set A. Low is bottom-aligned within the 28 px cell; Rising/Declining blue; Peak green arrow + amber dot.

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:2121-2156`

- [ ] **Step 1: Replace the symbol branches.** Substitute the `if (opkStatus === 'low') … else if … 'declining'` block with:

```tsx
if (opkStatus === 'low') {
  // bottom-aligned dash
  symbol = (
    <span style={{ position:'absolute', left:0, right:0, bottom:'3px', display:'flex', justifyContent:'center' }}>
      <svg width="13" height="6" viewBox="0 0 24 6">
        <line x1="6" y1="3" x2="18" y2="3" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
} else if (opkStatus === 'rising') {
  symbol = (
    <svg width="13" height="13" viewBox="0 0 24 24">
      <line x1="6" y1="17" x2="17" y2="7" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
      <polyline points="11,7 17,7 17,13" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
} else if (opkStatus === 'peak') {
  symbol = (
    <svg width="13" height="13" viewBox="0 0 24 24">
      <line x1="12" y1="19" x2="12" y2="6" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" />
      <polyline points="7,11 12,6 17,11" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="3" r="2" fill="#f59e0b" />
    </svg>
  );
} else if (opkStatus === 'declining') {
  symbol = (
    <svg width="13" height="13" viewBox="0 0 24 24">
      <line x1="6" y1="7" x2="17" y2="17" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
      <polyline points="17,11 17,17 11,17" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

Note: the Low `<span>` uses `position:absolute; bottom:3px`, so the LH inner tile (from Task 3 Step 2) must have `position:relative` — confirm the inner tile div includes it (the canonical pattern's inner div is `absolute` with `inset`; add `position` is already `absolute` which establishes a containing block, so `bottom:3px` on the child resolves against the tile — verify visually in Step 3).

- [ ] **Step 2: Lint + tests**

Run: `cd /Users/olgapak/work/cycle-path/app && npm run lint && npx vitest run`
Expected: clean + green.

- [ ] **Step 3: Visual verify**

`preview_*`: find/confirm an LH Low day (dash sits on the cell floor, not centered), Rising (blue ↗), Peak (green ↑ + amber dot), Declining (blue ↘). `preview_screenshot`.

- [ ] **Step 4: Commit**

```bash
cd /Users/olgapak/work/cycle-path && git add app/src/cycle-tracking/CycleChartPage.tsx && \
git commit -m "feat(chart): Set A LH symbols (blue trend, green/amber peak, bottom dash)"
```

---

## Task 6: Fertile-Window label font → Montserrat (only graph change)

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx:1670-1677` (the "Fertile Window" `<span>` inline style)

- [ ] **Step 1: Add the font family.** In the `<span style={{ … }}>Fertile Window</span>`, add `fontFamily: "'Montserrat', sans-serif"` to the style object. Keep `fontSize:'12px'`, `fontWeight:600`, `color:'#2e7d32'`, and the existing `textShadow`.

- [ ] **Step 2: Lint + tests**

Run: `cd /Users/olgapak/work/cycle-path/app && npm run lint && npx vitest run`
Expected: clean + green.

- [ ] **Step 3: Visual verify**

`preview_*`: on a cycle with rising/peak LH days, confirm the "Fertile Window" label renders in Montserrat. `preview_screenshot`.

- [ ] **Step 4: Commit**

```bash
cd /Users/olgapak/work/cycle-path && git add app/src/cycle-tracking/CycleChartPage.tsx && \
git commit -m "feat(chart): Fertile Window label uses Montserrat"
```

---

## Task 7: Regression & acceptance

**Files:** none (verification only)

- [ ] **Step 1: Full test + lint**

Run: `cd /Users/olgapak/work/cycle-path/app && npm run lint && npx vitest run`
Expected: lint clean; entire suite green.

- [ ] **Step 2: Crosshair / tooltip / hover-column regression**

`wasp start`; with `preview_*` hover several day columns. Confirm: the crosshair line still tracks the cursor, the tooltip still appears with the same data, and the whole hovered column deepens (every lower-table row tile) — proving the layout math + handlers were untouched. `preview_screenshot` of a hovered column.

- [ ] **Step 3: Edge cases**

Verify via `preview_*`: (a) a long cycle (35+ days) still scrolls horizontally with ~22 px cells; (b) a not-logged CF day is empty while a logged-NONE day shows the Dry marker; (c) a menstrual-flow day shows the flow marker with the CF bar suppressed; (d) tail/out-of-cycle days are grey. If the available data can't exercise a case, state which and why.

- [ ] **Step 4: Final confirmation commit (if any stray fixes were needed)**

```bash
cd /Users/olgapak/work/cycle-path && git status --porcelain
# If changes from fixing a regression remain, stage ONLY the files this plan touches
# (never `git add -A` / `git add .` — an untracked .claude/scheduled_tasks.lock exists):
git add app/src/cycle-tracking/CycleChartPage.tsx app/src/cycle-tracking/utils.ts \
  app/src/cycle-tracking/__tests__/headerHelpers.test.ts app/src/client/Main.css \
  app/tailwind.config.js app/public/fonts/Montserrat-Medium.woff2 app/public/fonts/Montserrat-SemiBold.woff2 && \
git commit -m "fix(chart): address lower-table redesign regression findings"
```

---

## Self-review

- **Spec coverage:** borderless/no-grid → Tasks 3,4; soft tints + 3 px tiles → Tasks 3,4 (canonical pattern); coloured title column + dark-blue Montserrat titles → Task 3 Step 6 (all five non-CF labels) + Task 4 Step 4 (CF labels); blue two-line time stamps → Task 3 Step 1; Set A LH incl. bottom Low + green/amber Peak → Task 5; softened 5-row CF + logged-NONE preserved + flow precedence preserved → Tasks 2,4; hover deepened tints + crosshair/tooltip preserved → Tasks 3,4,7; tail grey → Tasks 3,4; Notes-cell interactivity preserved → Task 3 Step 5 (explicit, no `pointerEvents:'none'`); Montserrat font-loading (self-host) → Task 1; Fertile-Window font → Task 6; Cycle-Day chip untouched → enforced by Invariants. All spec sections mapped.
- **Placeholders:** none — every code step has concrete code/commands; line numbers are anchors with "locate" guidance where the exact block wasn't quoted, with the full canonical pattern + exact tokens supplied.
- **Type consistency:** `getCFBarColor`/`getCFBarHeight` accept `string` (Task 2 Step 3) to match `cfData.cervicalAppearance: string | null` (`CycleChartPage.tsx:592`) narrowed to `string` by the existing guard — so the kept call sites in Task 4 type-check without retyping `cervicalMenstrualMap`; token hex values match the spec and the Conventions table throughout.
- **CF hover consistency:** plan (Task 4 Step 1, deepen empty tiles to `#dce8fb`) and spec (`design.md:126`, opacity trick *replaced* by deepened tint) now agree.
- **Scope:** single component + utils + one CSS/asset + one tailwind line — one cohesive plan, no decomposition needed.

---

## As-built token values (post-implementation, 2026-05-17 → 2026-05-18)

These supersede the Conventions "Design tokens" table. Refined during the user's iterative visual review:

- **Title text:** `#002142` (chart ApexCharts `foreColor` / temperature y-axis label colour), Montserrat 600, 11px, `letter-spacing: 0.02em`, **`textAlign: 'right'`** (wrapped labels right-align). All six row labels. (Was `#1e3a8a`.)
- **Time-Stamp digits:** `#334155` (Date-row text colour). (Was `#3b82f6`.)
- **Row resting / hover tints (shipped):**

  | Row | Resting | Hover |
  |---|---|---|
  | Time Stamp | `#fff7d9` | `#fde68a` |
  | LH Test | `#e8f5e9` | `#c8e6c9` |
  | Intimacy | `#fdedf6` | `#fbcfe8` |
  | Cervical Fluid (5 sub-rows) | `#e5f0ff` | `#bfdbfe` |
  | Disturbance | `#f1eeff` | `#ddd6fe` |
  | Notes | `#f8f8f7` | `#e7e5e4` |
  | Tail (any row) | `#f1f5f9` | — |

  Rule: resting = Tailwind 50↔100 midpoint ("~75") for the row hue; hover = Tailwind-200. **Exception — LH Test** = original pre-redesign app green (`#e8f5e9` / `#c8e6c9`), restored at user request. Label tile + grid share the resting tint. Upper-header month palette (`#dbeafe`/`#dcfce7`) left untouched despite shared Tailwind hexes.
- **Icon sizes:** LH Set A SVGs **17×17** (Low dash **17×8**); Notes `✎` **16px**. (Were 13px / 12px.) ~55–65 % of the 28px cell is the legibility guideline.
- **Unchanged from plan/spec:** LH stroke colours (`#3b82f6` low/rising/declining; `#16a34a`+`#f59e0b` peak), CF-bar guard, flow markers, hover/crosshair/tooltip, all layout invariants. Tests 291/291 green; eslint baseline unchanged.
