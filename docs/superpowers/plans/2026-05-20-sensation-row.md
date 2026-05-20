# Sensation Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sensation" row to the cycle chart's lower table (between Cervical Fluid and Disturbance) that displays the per-day `cervicalSensation` enum (Dry/Damp/Wet/Slippery) as a small colour+letter stamp, with a dev-only floating switcher that lets the user trial colour presets in the running app and pick the final palette before opening the PR.

**Architecture:**
- One file modified: `app/src/cycle-tracking/CycleChartPage.tsx` (data maps, row label + grid insertion, offset/padding shifts).
- One new pure-logic module: `app/src/cycle-tracking/sensationRow.ts` (types, letter map, resting chip spec, Mode A/B/C chip styles, preset table, WCAG contrast helpers, Mode A/B accent auto-darken helper).
- One new dev-only component: `app/src/cycle-tracking/SensationPresetSwitcher.tsx` (floating selector pinned to the chart, localStorage persistence, gated on `import.meta.env.DEV`, deleted before PR per spec §7).
- Unit tests in `app/src/cycle-tracking/__tests__/sensationRow.test.ts`.

**Tech Stack:** TypeScript, React, Wasp, Vitest 1.6.1. No new dependencies. No schema migration. No new operations/queries (`getCycleById` already returns `cervicalSensation`).

**Spec:** [`docs/superpowers/specs/2026-05-20-sensation-row-design.md`](../specs/2026-05-20-sensation-row-design.md)

---

## File map

```
app/src/cycle-tracking/
  CycleChartPage.tsx          ← modified (sensationMap, hasSensation, +234 row, shift offsets, padding)
  sensationRow.ts             ← new (logic module; safe to unit-test in isolation)
  SensationPresetSwitcher.tsx ← new, dev-only (floating UI; deleted before PR)
  __tests__/
    sensationRow.test.ts      ← new
```

Run tests from `app/`: `npm test`. Filter: `npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts`.

Each task ends with a commit on a feature branch off `main`.

---

### Task 1: Create branch & scaffold `sensationRow.ts` + letter map + first test

**Files:**
- Create: `app/src/cycle-tracking/sensationRow.ts`
- Create: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

- [ ] **Step 1: Create the feature branch from current `main`**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/sensation-row
```

- [ ] **Step 2: Write the failing test**

Create `app/src/cycle-tracking/__tests__/sensationRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { letterFor } from '../sensationRow';

describe('letterFor', () => {
  it('maps each enum value to its single-letter chart glyph', () => {
    expect(letterFor('DRY')).toBe('d');
    expect(letterFor('DAMP')).toBe('m');     // displayed term: "moist"
    expect(letterFor('WET')).toBe('w');
    expect(letterFor('SLIPPERY')).toBe('S'); // peak — uppercase to stand out
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL with "Cannot find module" or similar (file doesn't exist).

- [ ] **Step 4: Create the module with the minimal implementation**

Create `app/src/cycle-tracking/sensationRow.ts`:

```ts
// Sensation row — design & rendering helpers.
// See: docs/superpowers/specs/2026-05-20-sensation-row-design.md

export type SensationValue = 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY';

const LETTER: Record<SensationValue, string> = {
  DRY: 'd',
  DAMP: 'm',   // displayed as "moist" per Sensiplan convention
  WET: 'w',
  SLIPPERY: 'S',
};

export function letterFor(value: SensationValue): string {
  return LETTER[value];
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): scaffold module + letter map"
```

---

### Task 2: Add resting chip spec function + tests

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `app/src/cycle-tracking/__tests__/sensationRow.test.ts`:

```ts
import { restingChip } from '../sensationRow';

describe('restingChip', () => {
  it('Dry: transparent fill, soft teal letter, faint border, "d" glyph', () => {
    expect(restingChip('DRY')).toEqual({
      letter: 'd',
      background: 'transparent',
      color: '#5b8a84',
      border: '1px solid #c0ddd8',
      ringColor: null,
    });
  });

  it('Damp/moist: pale teal fill, dark-teal letter, hairline border, "m"', () => {
    expect(restingChip('DAMP')).toEqual({
      letter: 'm',
      background: '#c4e8e2',
      color: '#0f5c54',
      border: '1px solid #9ccfc7',
      ringColor: null,
    });
  });

  it('Wet: mid-teal fill, white letter, no border, "w"', () => {
    expect(restingChip('WET')).toEqual({
      letter: 'w',
      background: '#62bdb1',
      color: '#ffffff',
      border: '1px solid transparent',
      ringColor: null,
    });
  });

  it('Slippery (peak): deep-teal fill, white letter, no border, teal ring', () => {
    expect(restingChip('SLIPPERY')).toEqual({
      letter: 'S',
      background: '#0f766e',
      color: '#ffffff',
      border: '1px solid transparent',
      ringColor: '#0f766e',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL — `restingChip is not a function`.

- [ ] **Step 3: Implement `restingChip` in `sensationRow.ts`**

Append to `app/src/cycle-tracking/sensationRow.ts`:

```ts
export interface ChipStyle {
  letter: string;
  background: string;       // CSS background
  color: string;            // CSS color (letter)
  border: string;           // CSS border shorthand
  ringColor: string | null; // outer peak ring colour; null = no ring
}

const RESTING: Record<SensationValue, ChipStyle> = {
  DRY:      { letter: 'd', background: 'transparent', color: '#5b8a84', border: '1px solid #c0ddd8', ringColor: null },
  DAMP:     { letter: 'm', background: '#c4e8e2',     color: '#0f5c54', border: '1px solid #9ccfc7', ringColor: null },
  WET:      { letter: 'w', background: '#62bdb1',     color: '#ffffff', border: '1px solid transparent', ringColor: null },
  SLIPPERY: { letter: 'S', background: '#0f766e',     color: '#ffffff', border: '1px solid transparent', ringColor: '#0f766e' },
};

export function restingChip(value: SensationValue): ChipStyle {
  return RESTING[value];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): resting chip spec for all four values"
```

---

### Task 3: Add WCAG contrast helpers (luminance + ratio) with verified test cases

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
import { contrastRatio, relativeLuminance } from '../sensationRow';

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
  });
});

describe('contrastRatio (verified WCAG ratios for chip-letter audit)', () => {
  // Use ±0.05 tolerance — sRGB conversion + rounding within audit precision.
  function near(actual: number, expected: number) {
    expect(Math.abs(actual - expected)).toBeLessThan(0.05);
  }

  it('white vs deep teal #0f766e ≈ 5.48', () => near(contrastRatio('#ffffff', '#0f766e'), 5.48));
  it('white vs Wet #62bdb1 ≈ 2.23', () => near(contrastRatio('#ffffff', '#62bdb1'), 2.23));
  it('white vs lighter teal #1f9485 ≈ 3.74', () => near(contrastRatio('#ffffff', '#1f9485'), 3.74));
  it('white vs Mode C Wet-hover #3f9d90 ≈ 3.26', () => near(contrastRatio('#ffffff', '#3f9d90'), 3.26));
  it('white vs Rose bold #bd4a6e ≈ 4.81', () => near(contrastRatio('#ffffff', '#bd4a6e'), 4.81));
  it('white vs Rose more-contrast #c75f80 ≈ 3.91', () => near(contrastRatio('#ffffff', '#c75f80'), 3.91));
  it('inky teal #062a26 on #62bdb1 ≈ 6.89', () => near(contrastRatio('#062a26', '#62bdb1'), 6.89));
  it('soft teal #5b8a84 on tile #d8f3f0 ≈ 3.32', () => near(contrastRatio('#5b8a84', '#d8f3f0'), 3.32));
  it('symmetric (order independent)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL — `contrastRatio is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `sensationRow.ts`:

```ts
// --- WCAG sRGB contrast helpers ---

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function channelToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export function contrastRatio(a: string, b: string): number {
  const La = relativeLuminance(a);
  const Lb = relativeLuminance(b);
  const [light, dark] = La >= Lb ? [La, Lb] : [Lb, La];
  return (light + 0.05) / (dark + 0.05);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS for all contrast cases.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): WCAG contrast + luminance helpers"
```

---

### Task 4: Add Mode A/B auto-darken helper with tests

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```ts
import { autoDarkenFor45 } from '../sensationRow';

describe('autoDarkenFor45', () => {
  it('returns the input unchanged when it already passes 4.5:1 with white text', () => {
    // Rose bold passes (≈4.81), so darken should return it as-is.
    expect(autoDarkenFor45('#bd4a6e')).toBe('#bd4a6e');
  });

  it('darkens Wet #62bdb1 (2.23:1) to a value that crosses 4.5:1', () => {
    const out = autoDarkenFor45('#62bdb1');
    expect(out).not.toBe('#62bdb1');
    expect(contrastRatio('#ffffff', out)).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens Golden Yellow #f2b705 to cross 4.5:1', () => {
    const out = autoDarkenFor45('#f2b705');
    expect(out).not.toBe('#f2b705');
    expect(contrastRatio('#ffffff', out)).toBeGreaterThanOrEqual(4.5);
  });

  it('returns the smallest darken — output is just above 4.5:1, not far above', () => {
    const out = autoDarkenFor45('#62bdb1');
    const ratio = contrastRatio('#ffffff', out);
    // "smallest darken that passes" — should land close to 4.5:1, not e.g. 8:1.
    expect(ratio).toBeLessThan(5.5);
  });

  it('respects a custom text colour', () => {
    // Dark text on a light fill — should not darken since contrast is already high.
    expect(autoDarkenFor45('#ffe9d6', '#002142')).toBe('#ffe9d6');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL — `autoDarkenFor45 is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `sensationRow.ts`:

```ts
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

/**
 * Smallest darkening of `fill` such that contrast with `text` reaches 4.5:1.
 * Bisects on a uniform RGB scaling factor in [0, 1]. If already passing, returns fill unchanged.
 */
export function autoDarkenFor45(fill: string, text: string = '#ffffff'): string {
  if (contrastRatio(text, fill) >= 4.5) return fill;
  const [r0, g0, b0] = hexToRgb(fill);
  let lo = 0;   // f=0 → black, definitely passes vs white (21:1)
  let hi = 1;   // f=1 → fill, fails (we just checked)
  // Bisect: keep the largest factor whose rounded RGB still passes.
  let best = '#000000';
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const hex = rgbToHex(r0 * mid, g0 * mid, b0 * mid);
    if (contrastRatio(text, hex) >= 4.5) {
      best = hex;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): Mode A/B accent auto-darken helper"
```

---

### Task 5: Define the accent preset table

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { ACCENT_PRESETS, PRESET_KEYS } from '../sensationRow';

describe('ACCENT_PRESETS table', () => {
  it('lists exactly the 10 accent presets from the spec, in spec order', () => {
    expect(PRESET_KEYS).toEqual([
      'rose-medium',
      'rose-contrast',
      'rose-bold',
      'sky',
      'amber',
      'amber-gold',
      'gold',
      'indigo',
      'bbt-blue',
      'lh-green',
    ]);
  });

  it('every preset has the correct accent hex', () => {
    const byKey = Object.fromEntries(ACCENT_PRESETS.map((p) => [p.key, p.fill]));
    expect(byKey['rose-medium']).toBe('#cf7591');
    expect(byKey['rose-contrast']).toBe('#c75f80');
    expect(byKey['rose-bold']).toBe('#bd4a6e');
    expect(byKey['sky']).toBe('#60a5fa');
    expect(byKey['amber']).toBe('#f59e0b');
    expect(byKey['amber-gold']).toBe('#f3aa08');
    expect(byKey['gold']).toBe('#f2b705');
    expect(byKey['indigo']).toBe('#7c83e8');
    expect(byKey['bbt-blue']).toBe('#3b82f6');
    expect(byKey['lh-green']).toBe('#16a34a');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL — undefined exports.

- [ ] **Step 3: Add the preset table**

Append to `sensationRow.ts`:

```ts
export interface AccentPreset {
  key: string;
  name: string;
  fill: string;                 // visual-target hex (pre-auto-darken)
  source: 'product' | 'new';
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { key: 'rose-medium',   name: 'Dusty Rose · medium',         fill: '#cf7591', source: 'new' },
  { key: 'rose-contrast', name: 'Dusty Rose · more contrast',  fill: '#c75f80', source: 'new' },
  { key: 'rose-bold',     name: 'Dusty Rose · bold',           fill: '#bd4a6e', source: 'new' },
  { key: 'sky',           name: 'Soft Sky',                    fill: '#60a5fa', source: 'product' },
  { key: 'amber',         name: 'Amber',                       fill: '#f59e0b', source: 'product' },
  { key: 'amber-gold',    name: 'Amber–Gold blend',            fill: '#f3aa08', source: 'new' },
  { key: 'gold',          name: 'Golden Yellow',               fill: '#f2b705', source: 'new' },
  { key: 'indigo',        name: 'Soft Indigo',                 fill: '#7c83e8', source: 'new' },
  { key: 'bbt-blue',      name: 'BBT Blue',                    fill: '#3b82f6', source: 'product' },
  { key: 'lh-green',      name: 'LH green',                    fill: '#16a34a', source: 'product' },
] as const;

export const PRESET_KEYS: readonly string[] = ACCENT_PRESETS.map((p) => p.key);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): accent preset table (10 colours)"
```

---

### Task 6: Mode A chip-style function (accent fills the chip on hover)

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

Mode A behaviour (spec §5):
- Tile: `#d8f3f0` → `#aee5df` on hover.
- Every chip's background fills with the (auto-darkened) accent; border = `1px solid <accent>`; letter switches to white; peak ring darkens to a darker-shade of the accent.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { chipStyleFor, HoverMode } from '../sensationRow';

describe('chipStyleFor — Mode A', () => {
  const A: HoverMode = 'A';
  const accent = '#bd4a6e'; // Rose bold — passes 4.5:1, so used unchanged

  it('resting returns the locked resting chip regardless of preset/mode', () => {
    expect(chipStyleFor('WET', { mode: A, accent, hover: false })).toEqual(restingChip('WET'));
  });

  it('hover Dry: accent fill, white letter, accent border', () => {
    const s = chipStyleFor('DRY', { mode: A, accent, hover: true });
    expect(s.letter).toBe('d');
    expect(s.background).toBe(accent);
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1px solid ' + accent);
    expect(s.ringColor).toBeNull();
  });

  it('hover Slippery: accent fill + darker-shade ring for peak', () => {
    const s = chipStyleFor('SLIPPERY', { mode: A, accent, hover: true });
    expect(s.background).toBe(accent);
    expect(s.color).toBe('#ffffff');
    expect(s.ringColor).toBeTruthy();
    // ring is a darker shade of the accent
    expect(relativeLuminance(s.ringColor!)).toBeLessThan(relativeLuminance(accent));
  });

  it('a pale accent is auto-darkened before being applied (Mode A only)', () => {
    // Golden Yellow fails 4.5:1 with white text; Mode A must darken before painting.
    const s = chipStyleFor('WET', { mode: A, accent: '#f2b705', hover: true });
    expect(s.background).not.toBe('#f2b705');
    expect(contrastRatio('#ffffff', s.background)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL — `chipStyleFor` not exported.

- [ ] **Step 3: Implement Mode A and the dispatcher skeleton**

Append to `sensationRow.ts`:

```ts
export type HoverMode = 'A' | 'B' | 'C';

export interface ChipStyleArgs {
  mode: HoverMode;
  accent: string | null;   // accent hex (visual target) for A/B; ignored for C; null when no preset (resting only)
  hover: boolean;
}

function darkenShade(hex: string, factor = 0.7): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function modeAChip(value: SensationValue, accentRaw: string, hover: boolean): ChipStyle {
  if (!hover) return restingChip(value);
  const accent = autoDarkenFor45(accentRaw);
  const base = restingChip(value);
  return {
    letter: base.letter,
    background: accent,
    color: '#ffffff',
    border: '1px solid ' + accent,
    ringColor: value === 'SLIPPERY' ? darkenShade(accent) : null,
  };
}

export function chipStyleFor(value: SensationValue, args: ChipStyleArgs): ChipStyle {
  if (!args.hover) return restingChip(value);
  if (args.mode === 'A') {
    if (!args.accent) return restingChip(value);
    return modeAChip(value, args.accent, args.hover);
  }
  // Modes B and C arrive in later tasks.
  return restingChip(value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): Mode A hover (accent fill, white letter, peak ring)"
```

---

### Task 7: Mode B chip-style function (accent on outline only; peak = Mode A)

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

Mode B behaviour (spec §5):
- Non-peak: chip fill, letter, and tile-outside stay resting; only the chip's **outline** takes the accent (1.5 px).
- Peak: identical to Mode A.
- Tile behaviour: non-peak cells stay `#d8f3f0`; peak cell goes to `#aee5df`. (Tile colour is owned by the chart cell renderer, not the chip; document it for the chart-side code.)

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('chipStyleFor — Mode B', () => {
  const accent = '#bd4a6e';

  it('hover Dry: resting fill+letter, accent 1.5px outline', () => {
    const s = chipStyleFor('DRY', { mode: 'B', accent, hover: true });
    expect(s.background).toBe('transparent');      // unchanged
    expect(s.color).toBe('#5b8a84');               // unchanged
    expect(s.border).toBe('1.5px solid ' + accent);
    expect(s.ringColor).toBeNull();
  });

  it('hover Damp: resting fill kept, only border switches to accent', () => {
    const s = chipStyleFor('DAMP', { mode: 'B', accent, hover: true });
    expect(s.background).toBe('#c4e8e2');          // unchanged
    expect(s.color).toBe('#0f5c54');               // unchanged
    expect(s.border).toBe('1.5px solid ' + accent);
  });

  it('hover Wet: resting fill kept, accent border replaces transparent', () => {
    const s = chipStyleFor('WET', { mode: 'B', accent, hover: true });
    expect(s.background).toBe('#62bdb1');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1.5px solid ' + accent);
  });

  it('hover Slippery (peak): identical to Mode A', () => {
    const a = chipStyleFor('SLIPPERY', { mode: 'A', accent, hover: true });
    const b = chipStyleFor('SLIPPERY', { mode: 'B', accent, hover: true });
    expect(b).toEqual(a);
  });

  it('pale accent is auto-darkened (used in the outline)', () => {
    const s = chipStyleFor('WET', { mode: 'B', accent: '#f2b705', hover: true });
    const used = s.border.replace('1.5px solid ', '');
    expect(used).not.toBe('#f2b705');
    expect(contrastRatio('#ffffff', used)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL on Mode B cases.

- [ ] **Step 3: Implement Mode B**

In `sensationRow.ts`, add `modeBChip` and route to it from the dispatcher:

```ts
function modeBChip(value: SensationValue, accentRaw: string, hover: boolean): ChipStyle {
  if (!hover) return restingChip(value);
  if (value === 'SLIPPERY') return modeAChip(value, accentRaw, hover);
  const accent = autoDarkenFor45(accentRaw);
  const base = restingChip(value);
  return {
    letter: base.letter,
    background: base.background,
    color: base.color,
    border: '1.5px solid ' + accent,
    ringColor: null,
  };
}
```

Update `chipStyleFor` to dispatch to Mode B:

```ts
export function chipStyleFor(value: SensationValue, args: ChipStyleArgs): ChipStyle {
  if (!args.hover) return restingChip(value);
  if (args.mode === 'A') {
    if (!args.accent) return restingChip(value);
    return modeAChip(value, args.accent, args.hover);
  }
  if (args.mode === 'B') {
    if (!args.accent) return restingChip(value);
    return modeBChip(value, args.accent, args.hover);
  }
  // Mode C in next task.
  return restingChip(value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): Mode B hover (accent outline; peak = Mode A)"
```

---

### Task 8: Mode C resting + hover (deepen teal; locked Slippery design)

**Files:**
- Modify: `app/src/cycle-tracking/sensationRow.ts`
- Modify: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`

Mode C behaviour (spec §5):
- Resting deviates **only** for Slippery: chip `#62bdb1`, ring `#62bdb1`, letter `#062a26` (inky teal). All other resting chips unchanged.
- Hover:
  - Dry: border `#c0ddd8` → `#5d9c93`
  - Damp: fill `#c4e8e2` → `#9bd3c9`, border `#9ccfc7` → `#4a8f82`
  - Wet: fill `#62bdb1` → `#3f9d90`, border becomes `1.5px solid #1e7d72`
  - Slippery: chip `#62bdb1` → `#0f766e`, ring `#62bdb1` → `#054a44`, letter `#062a26` → `#ffffff`
- Mode C accent is ignored (the function may be called with `accent: null` or any string).
- All Mode-C hex pairs ship per the §6 product-approved exception list — **no auto-darken**.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { modeCResting } from '../sensationRow';

describe('Mode C — resting (override only Slippery)', () => {
  it('Dry/Damp/Wet match the locked resting design', () => {
    expect(modeCResting('DRY')).toEqual(restingChip('DRY'));
    expect(modeCResting('DAMP')).toEqual(restingChip('DAMP'));
    expect(modeCResting('WET')).toEqual(restingChip('WET'));
  });

  it('Slippery uses #62bdb1 chip + #62bdb1 ring + inky #062a26 letter', () => {
    expect(modeCResting('SLIPPERY')).toEqual({
      letter: 'S',
      background: '#62bdb1',
      color: '#062a26',
      border: '1px solid transparent',
      ringColor: '#62bdb1',
    });
  });
});

describe('chipStyleFor — Mode C hover', () => {
  it('Dry: border #c0ddd8 → #5d9c93', () => {
    const s = chipStyleFor('DRY', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('transparent');
    expect(s.color).toBe('#5b8a84');
    expect(s.border).toBe('1px solid #5d9c93');
  });

  it('Damp: fill #9bd3c9, border #4a8f82', () => {
    const s = chipStyleFor('DAMP', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('#9bd3c9');
    expect(s.color).toBe('#0f5c54');
    expect(s.border).toBe('1px solid #4a8f82');
  });

  it('Wet: fill #3f9d90, 1.5px border #1e7d72', () => {
    const s = chipStyleFor('WET', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('#3f9d90');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1.5px solid #1e7d72');
  });

  it('Slippery: chip #0f766e, ring #054a44, letter white', () => {
    const s = chipStyleFor('SLIPPERY', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('#0f766e');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1px solid transparent');
    expect(s.ringColor).toBe('#054a44');
  });

  it('Mode C ignores the accent argument', () => {
    const a = chipStyleFor('DAMP', { mode: 'C', accent: null, hover: true });
    const b = chipStyleFor('DAMP', { mode: 'C', accent: '#bd4a6e', hover: true });
    expect(a).toEqual(b);
  });
});

describe('chipStyleFor — Mode C resting via main dispatcher', () => {
  it('returns the Mode C resting chip (Slippery overridden)', () => {
    expect(chipStyleFor('SLIPPERY', { mode: 'C', accent: null, hover: false }))
      .toEqual(modeCResting('SLIPPERY'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: FAIL — Mode C not implemented.

- [ ] **Step 3: Implement Mode C**

Add to `sensationRow.ts`:

```ts
const MODE_C_RESTING_SLIPPERY: ChipStyle = {
  letter: 'S',
  background: '#62bdb1',
  color: '#062a26',
  border: '1px solid transparent',
  ringColor: '#62bdb1',
};

export function modeCResting(value: SensationValue): ChipStyle {
  if (value === 'SLIPPERY') return MODE_C_RESTING_SLIPPERY;
  return restingChip(value);
}

const MODE_C_HOVER: Record<SensationValue, ChipStyle> = {
  DRY:      { letter: 'd', background: 'transparent', color: '#5b8a84', border: '1px solid #5d9c93', ringColor: null },
  DAMP:     { letter: 'm', background: '#9bd3c9',     color: '#0f5c54', border: '1px solid #4a8f82', ringColor: null },
  WET:      { letter: 'w', background: '#3f9d90',     color: '#ffffff', border: '1.5px solid #1e7d72', ringColor: null },
  SLIPPERY: { letter: 'S', background: '#0f766e',     color: '#ffffff', border: '1px solid transparent', ringColor: '#054a44' },
};

function modeCChip(value: SensationValue, hover: boolean): ChipStyle {
  return hover ? MODE_C_HOVER[value] : modeCResting(value);
}
```

Update `chipStyleFor` so resting in Mode C uses `modeCResting`, and hover routes to `modeCChip`:

```ts
export function chipStyleFor(value: SensationValue, args: ChipStyleArgs): ChipStyle {
  // Mode C overrides resting for Slippery (and is its own hover).
  if (args.mode === 'C') return modeCChip(value, args.hover);
  if (!args.hover) return restingChip(value);
  if (args.mode === 'A') {
    if (!args.accent) return restingChip(value);
    return modeAChip(value, args.accent, args.hover);
  }
  if (args.mode === 'B') {
    if (!args.accent) return restingChip(value);
    return modeBChip(value, args.accent, args.hover);
  }
  return restingChip(value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts
```

Expected: PASS — all suites in the file.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/sensationRow.ts app/src/cycle-tracking/__tests__/sensationRow.test.ts
git commit -m "feat(sensation-row): Mode C resting + hover (deepen teal)"
```

---

### Task 9: Add `sensationMap` useMemo in `CycleChartPage.tsx`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (around line 547, immediately above the existing `disturbanceMap`)

- [ ] **Step 1: Open the file and locate the existing `disturbanceMap` block**

Run: `grep -n "const disturbanceMap" app/src/cycle-tracking/CycleChartPage.tsx`
Expected: a single hit around line 548.

- [ ] **Step 2: Insert `sensationMap` immediately above `disturbanceMap`**

Find:

```tsx
  // Create a map of day numbers to disturbance factors
  const disturbanceMap = useMemo(() => {
```

Replace with (NEW block + original block, original unchanged):

```tsx
  // Create a map of day numbers to cervical sensation (display-only).
  const sensationMap = useMemo(() => {
    if (!cycle) return new Map<number, 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY' | null>();
    const map = new Map<number, 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY' | null>();
    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = allCycleDaysMap.get(dayNumber);
      map.set(dayNumber, day?.cervicalSensation ?? null);
    }
    return map;
  }, [cycle, allCycleDaysMap, displayDayRange]);

  // Create a map of day numbers to disturbance factors
  const disturbanceMap = useMemo(() => {
```

- [ ] **Step 3: Verify the file still type-checks**

```bash
cd app && npx tsc --noEmit
```

Expected: no new errors (warnings about pre-existing issues are fine; no new ones introduced by this hunk).

- [ ] **Step 4: Run the full test suite — nothing should regress**

```bash
cd app && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(sensation-row): add sensationMap useMemo"
```

---

### Task 10: Include `hasSensation` in `daysWithDataMap`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (around line 603–614)

- [ ] **Step 1: Locate `daysWithDataMap`**

Run: `grep -n "const daysWithDataMap\|hasDisturbance" app/src/cycle-tracking/CycleChartPage.tsx`
Expected: one for `daysWithDataMap` and one for `hasDisturbance`, near each other in the 600s.

- [ ] **Step 2: Read the surrounding 20 lines**

Open `app/src/cycle-tracking/CycleChartPage.tsx:597-620` to see the `for` loop that computes `hasBBT || hasTime || hasOPK || hasIntercourse || hasCF || hasMenstrual || hasDisturbance`.

- [ ] **Step 3: Add `hasSensation` to the calculation**

Inside the loop body (where `hasDisturbance` is computed), add:

```tsx
      const hasSensation = day?.cervicalSensation != null;
```

Then change the final `map.set` line so it appends `|| hasSensation` to the OR chain:

Find:

```tsx
      map.set(dayNumber, hasBBT || hasTime || hasOPK || hasIntercourse || hasCF || hasMenstrual || hasDisturbance);
```

Replace with:

```tsx
      map.set(dayNumber, hasBBT || hasTime || hasOPK || hasIntercourse || hasCF || hasMenstrual || hasDisturbance || hasSensation);
```

- [ ] **Step 4: Type-check and test**

```bash
cd app && npx tsc --noEmit && npm test
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(sensation-row): count days that only have a sensation as having data"
```

---

### Task 11: Shift Disturbance & Notes offsets and grow `LOWER_TABLE_PADDING_BOTTOM`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (lines 545, 2390, 2408, 2452, 2503)

- [ ] **Step 1: Read the four offset sites**

Open the file and locate each of the following lines (line numbers approximate; use `grep -n "chartHeight + 234\|chartHeight + 262\|LOWER_TABLE_PADDING_BOTTOM" app/src/cycle-tracking/CycleChartPage.tsx`):

- Line ~545: `const LOWER_TABLE_PADDING_BOTTOM = 262 + NOTES_ROW_HEIGHT;`
- Line ~2390: Disturbance label `top: \`${plotAreaTop + chartHeight + 234}px\``
- Line ~2452: Disturbance grid `top: \`${plotAreaTop + chartHeight + 234}px\``
- Line ~2408: Notes label `top: \`${plotAreaTop + chartHeight + 262}px\``
- Line ~2503: Notes grid `top: \`${plotAreaTop + chartHeight + 262}px\``

- [ ] **Step 2: Update the padding constant**

Change:

```tsx
  const LOWER_TABLE_PADDING_BOTTOM = 262 + NOTES_ROW_HEIGHT;
```

to:

```tsx
  const LOWER_TABLE_PADDING_BOTTOM = 290 + NOTES_ROW_HEIGHT;
```

- [ ] **Step 3: Shift Disturbance label and grid `+234 → +262`**

In the Disturbance label block and the Disturbance grid block (both `top:` expressions), change `+ 234` to `+ 262`. Update the existing `// positioned below Dry (+234px)` comment to reflect the new value (`+262px`).

- [ ] **Step 4: Shift Notes label and grid `+262 → +290`**

In both Notes blocks, change `+ 262` to `+ 290`. Update the existing comment (`// positioned below Disturbance (+262px)`) to `(+290px)`.

- [ ] **Step 5: Type-check, run tests, and run the dev server to confirm nothing clips**

```bash
cd app && npx tsc --noEmit && npm test
```

Expected: clean.

Then from project root (`/Users/olgapak/work/cycle-path`):

```bash
wasp start
```

Open the cycle chart in the browser. The bottom of the lower table should now have one empty 28 px gap above Disturbance (where the Sensation row will live in the next tasks). Disturbance and Notes should not be cut off; the chart container's bottom padding should now hold the extra row.

Stop the dev server (Ctrl+C) before continuing.

- [ ] **Step 6: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(sensation-row): shift Disturbance/Notes and grow LOWER_TABLE_PADDING_BOTTOM"
```

---

### Task 12: Insert the Sensation row **label** at offset `+234`

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (insert immediately before the Disturbance label block, around line 2386)

- [ ] **Step 1: Locate the Disturbance label block**

Run: `grep -n "Disturbance Row Label" app/src/cycle-tracking/CycleChartPage.tsx`
Expected: line ~2385.

- [ ] **Step 2: Insert the Sensation label block just above it**

Insert before the `{/* Disturbance Row Label */}` comment:

```tsx
                  {/* Sensation Row Label - positioned below Cervical Fluid (+234px) */}
                  <div
                    className="absolute left-0"
                    style={{
                      width: `${plotAreaOffset}px`,
                      top: `${plotAreaTop + chartHeight + 234}px`,
                      zIndex: 2
                    }}
                  >
                    <div style={{ position: 'relative', height: '28px' }}>
                      <div className="absolute flex items-center justify-end px-3 font-montserrat"
                        style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#d8f3f0',
                          color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                        Sensation
                      </div>
                    </div>
                  </div>
```

- [ ] **Step 3: Type-check, run tests, and visually confirm**

```bash
cd app && npx tsc --noEmit && npm test
```

Expected: clean. Then `wasp start` from the project root and confirm:
- A "Sensation" label appears in the lower table's left column, immediately above "Disturbance".
- Its background is the resting teal `#d8f3f0`.
- The text is the same Montserrat 600 11 px as the neighbouring labels.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(sensation-row): add row label at offset +234"
```

---

### Task 13: Insert the Sensation row **grid** with per-cell chip rendering

**Files:**
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx` (insert immediately before the Disturbance grid block, around line 2446)

- [ ] **Step 1: Add the import at the top of `CycleChartPage.tsx`**

In the existing imports block, add:

```tsx
import { chipStyleFor, type SensationValue, type HoverMode } from './sensationRow';
```

- [ ] **Step 2: Add a fixed default for now**

In the body of the `CycleChartPage` component, at the top of the function body (just after `const navigate = useNavigate()` or similar early state), add a temporary fixed preset+mode constant. We'll wire the dev switcher in Task 14.

```tsx
  // Sensation row trial preset + mode. Replaced by the dev switcher in Task 14.
  const sensationMode: HoverMode = 'C';
  const sensationAccent: string | null = null;
```

- [ ] **Step 3: Insert the Sensation grid block just above the Disturbance grid**

Locate `{/* Disturbance Grid Row */}` (around line 2446) and insert before it:

```tsx
                  {/* Sensation Grid Row - positioned below Cervical Fluid (+234px) */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight + 234}px`,
                      height: '28px',
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const value = sensationMap.get(dayNumber) as SensationValue | null;
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);
                      const isHovered = hoveredDayNumber === dayNumber;
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;

                      // Tile background. Mode B keeps non-peak tiles at resting on hover;
                      // every other case follows the standard resting/hover/tail pattern.
                      let tileBg: string;
                      if (isTail) {
                        tileBg = '#f1f5f9';
                      } else if (isHovered) {
                        const isPeak = value === 'SLIPPERY';
                        tileBg = (sensationMode === 'B' && !isPeak) ? '#d8f3f0' : '#aee5df';
                      } else {
                        tileBg = '#d8f3f0';
                      }

                      const chip = value
                        ? chipStyleFor(value, { mode: sensationMode, accent: sensationAccent, hover: isHovered && !isTail })
                        : null;

                      return (
                        <div key={dayNumber} className="absolute"
                          style={{ left: `${leftEdge}px`, width: `${cellWidth}px`, top: 0, height: '28px', pointerEvents: 'none' }}>
                          <div className="absolute flex items-center justify-center"
                            style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: tileBg }}>
                            {!isTail && chip && (
                              <div
                                className="font-montserrat"
                                style={{
                                  width: '23px',
                                  height: '17px',
                                  borderRadius: '5px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: chip.background,
                                  color: chip.color,
                                  border: chip.border,
                                  boxShadow: chip.ringColor
                                    ? `0 0 0 1.5px ${tileBg}, 0 0 0 3px ${chip.ringColor}`
                                    : undefined,
                                }}
                              >
                                {chip.letter}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
```

- [ ] **Step 4: Type-check, run tests, and visually verify**

```bash
cd app && npx tsc --noEmit && npm test
```

Expected: clean.

Then `wasp start` from the project root, open a cycle with recorded sensations covering all four values across days. Confirm:
- Each day with a recorded sensation shows the correct chip:
  - Dry → outline `d`
  - Damp → pale-teal `m`
  - Wet → mid-teal `w`
  - Slippery → `#62bdb1` chip with inky `S` and a `#62bdb1` ring (Mode C default).
- Empty days show a plain teal tile with no chip.
- Tail days show grey tile, no chip.
- Hovering a day column from the upper plot lights up the matching Sensation cell tile (teal → `#aee5df`); Slippery hover shows the deepened-teal chip + white S.
- Disturbance and Notes appear at their new shifted positions with no overlap.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(sensation-row): render row grid with per-cell chips (Mode C default)"
```

---

### Task 14: Dev-only preset switcher (floating, localStorage, gated on `import.meta.env.DEV`)

**Files:**
- Create: `app/src/cycle-tracking/SensationPresetSwitcher.tsx`
- Modify: `app/src/cycle-tracking/CycleChartPage.tsx`

- [ ] **Step 1: Create the switcher component**

Create `app/src/cycle-tracking/SensationPresetSwitcher.tsx`:

```tsx
import { useEffect } from 'react';
import {
  ACCENT_PRESETS,
  chipStyleFor,
  contrastRatio,
  autoDarkenFor45,
  type HoverMode,
  type SensationValue,
} from './sensationRow';

export type PresetSelection = {
  mode: HoverMode;
  accent: string | null;
  label: string;
  key: string;
};

const STORAGE_KEY = 'cp.sensation.preset';

// The full list shown in the switcher: every accent × {A, B}, plus Mode C.
function buildOptions(): PresetSelection[] {
  const out: PresetSelection[] = [];
  for (const p of ACCENT_PRESETS) {
    out.push({ key: p.key + '-A', mode: 'A', accent: p.fill, label: p.name + ' · v1 (fill)' });
    out.push({ key: p.key + '-B', mode: 'B', accent: p.fill, label: p.name + ' · v2 (outline)' });
  }
  out.push({ key: 'deepen', mode: 'C', accent: null, label: 'Mode C · Deepen teal' });
  return out;
}

export const OPTIONS = buildOptions();
export const DEFAULT_SELECTION: PresetSelection = OPTIONS.find((o) => o.key === 'deepen')!;

export function readStoredSelection(): PresetSelection {
  if (typeof window === 'undefined') return DEFAULT_SELECTION;
  const key = window.localStorage.getItem(STORAGE_KEY);
  if (!key) return DEFAULT_SELECTION;
  return OPTIONS.find((o) => o.key === key) ?? DEFAULT_SELECTION;
}

export function writeStoredSelection(sel: PresetSelection) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, sel.key);
}

// Live contrast (white-on-fill) post-auto-darken, for the switcher's per-option label.
function describeContrast(sel: PresetSelection): string {
  if (sel.mode === 'C' || !sel.accent) return ''; // Mode C ships its own hexes
  const used = autoDarkenFor45(sel.accent);
  const r = contrastRatio('#ffffff', used).toFixed(2);
  const note = used === sel.accent ? '' : ' (auto-darkened)';
  return `${r}:1${note}`;
}

// Per-state contrast detail — exposes the exact letter-on-background ratios
// for every chip state of the currently selected preset+mode, including the
// three product-approved §6 exceptions, so the user can judge in-app.
const STATES: { value: SensationValue; hover: boolean; label: string }[] = [
  { value: 'DRY',      hover: false, label: 'Dry · resting' },
  { value: 'DAMP',     hover: false, label: 'Moist · resting' },
  { value: 'WET',      hover: false, label: 'Wet · resting' },
  { value: 'SLIPPERY', hover: false, label: 'Slip · resting' },
  { value: 'DRY',      hover: true,  label: 'Dry · hover' },
  { value: 'DAMP',     hover: true,  label: 'Moist · hover' },
  { value: 'WET',      hover: true,  label: 'Wet · hover' },
  { value: 'SLIPPERY', hover: true,  label: 'Slip · hover' },
];

// Tile-bg the letter actually sits on when the chip background is transparent.
function effectiveTileBg(mode: HoverMode, value: SensationValue, hover: boolean): string {
  if (!hover) return '#d8f3f0';
  if (mode === 'B' && value !== 'SLIPPERY') return '#d8f3f0';
  return '#aee5df';
}

function letterRatio(mode: HoverMode, accent: string | null, value: SensationValue, hover: boolean): number {
  const chip = chipStyleFor(value, { mode, accent, hover });
  const bg = chip.background === 'transparent'
    ? effectiveTileBg(mode, value, hover)
    : chip.background;
  return contrastRatio(chip.color, bg);
}

// The three product-approved exceptions per spec §6 (closed list).
function isException(mode: HoverMode, value: SensationValue, hover: boolean): boolean {
  if (!hover && value === 'DRY') return true;                 // resting Dry letter
  if (!hover && value === 'WET') return true;                 // resting Wet white
  if (hover && mode === 'C' && value === 'WET') return true;  // Mode C Wet hover
  return false;
}

interface Props {
  selection: PresetSelection;
  onChange: (sel: PresetSelection) => void;
}

/**
 * Dev-only floating preset switcher.
 * Caller must gate on `import.meta.env.DEV`. Deleted before opening the PR
 * (spec §7 cleanup).
 */
export function SensationPresetSwitcher({ selection, onChange }: Props) {
  useEffect(() => { writeStoredSelection(selection); }, [selection]);

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      right: 12,
      zIndex: 9999,
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: 8,
      padding: '8px 10px',
      fontFamily: 'Montserrat, system-ui, sans-serif',
      fontSize: 11,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxWidth: 320,
    }}>
      <div style={{ fontWeight: 700, color: '#002142', marginBottom: 6 }}>Sensation preset (dev)</div>
      <select
        value={selection.key}
        onChange={(e) => {
          const next = OPTIONS.find((o) => o.key === e.target.value);
          if (next) onChange(next);
        }}
        style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}{o.mode !== 'C' ? `  [${describeContrast(o)}]` : ''}
          </option>
        ))}
      </select>
      <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.45 }}>
        <div style={{ fontWeight: 700, color: '#002142', marginBottom: 4 }}>Per-state letter contrast</div>
        {STATES.map((s) => {
          const r = letterRatio(selection.mode, selection.accent, s.value, s.hover);
          const passes = r >= 4.5;
          const exception = isException(selection.mode, s.value, s.hover);
          const status = passes ? '✓' : (exception ? '§6 exception' : '⚠ violation');
          const color = passes ? '#0f766e' : (exception ? '#9a6700' : '#9d2b53');
          return (
            <div
              key={s.value + '/' + (s.hover ? 'h' : 'r')}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
            >
              <span style={{ color: '#5b6b7a', flex: 1 }}>{s.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#002142', minWidth: 40, textAlign: 'right' }}>
                {r.toFixed(2)}:1
              </span>
              <span style={{ color, fontWeight: 600, minWidth: 86, textAlign: 'right' }}>{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the switcher into `CycleChartPage.tsx`**

Add the import:

```tsx
import {
  SensationPresetSwitcher,
  readStoredSelection,
  DEFAULT_SELECTION,
  type PresetSelection,
} from './SensationPresetSwitcher';
```

Replace the fixed default added in Task 13 (the two `sensationMode` / `sensationAccent` constants) with state:

```tsx
  const [sensationSelection, setSensationSelection] = useState<PresetSelection>(
    () => (import.meta.env.DEV ? readStoredSelection() : DEFAULT_SELECTION),
  );
  const sensationMode = sensationSelection.mode;
  const sensationAccent = sensationSelection.accent;
```

Render the switcher at the end of the chart page's JSX (just before the outermost closing tag of the page-level component), gated on `import.meta.env.DEV`:

```tsx
        {import.meta.env.DEV && (
          <SensationPresetSwitcher
            selection={sensationSelection}
            onChange={setSensationSelection}
          />
        )}
```

- [ ] **Step 3: Type-check and run tests**

```bash
cd app && npx tsc --noEmit && npm test
```

Expected: clean.

- [ ] **Step 4: Visually verify**

`wasp start` from project root. Confirm:
- A small floating selector appears in the top-right of the page (dev only).
- The dropdown lists all 21 options (10 accents × 2 modes + Mode C).
- Each accent option shows the post-auto-darken contrast ratio in brackets, e.g. `Golden Yellow · v1 (fill)  [4.52:1 (auto-darkened)]`.
- Picking an option instantly recolours the Sensation row; refreshing the page keeps the same option (localStorage).
- Picking "Mode C · Deepen teal" shows the locked Mode C design including the inky-S peak chip.
- Below the dropdown, a "Per-state letter contrast" panel lists all 8 chip states (Dry/Damp/Wet/Slippery × resting/hover) with their live ratios. States ≥ 4.5:1 are marked `✓`; the three §6 product-approved exceptions are flagged `§6 exception`; any state that fails 4.5:1 outside the closed exception list is flagged `⚠ violation` — useful for spotting when Mode B inherits the resting Wet/Dry letter contrast into hover.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/src/cycle-tracking/SensationPresetSwitcher.tsx app/src/cycle-tracking/CycleChartPage.tsx
git commit -m "feat(sensation-row): dev-only preset switcher with localStorage"
```

---

### Task 15: Manual verification + trial preparation

**Files:** none changed. This task is the in-app trial setup, not a code change.

- [ ] **Step 1: Final full-suite test pass**

```bash
cd app && npm test && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Run the linter on the touched files**

```bash
cd app && npm run lint -- src/cycle-tracking/sensationRow.ts src/cycle-tracking/SensationPresetSwitcher.tsx src/cycle-tracking/CycleChartPage.tsx
```

Expected: no new lint errors introduced by this branch. Fix any new issues in a follow-up commit (`chore(sensation-row): lint`).

- [ ] **Step 3: Push the branch and hand off to the user for the in-app trial**

```bash
git push -u origin feat/sensation-row
```

Then notify the user:

> Branch `feat/sensation-row` is up. Run `wasp start` from the project root and open the chart page. The dev-only "Sensation preset" selector is in the top-right. Each option's live contrast ratio is shown in brackets. Pick the winning preset+mode; we'll lock that as the default and strip the switcher before opening the PR.

- [ ] **Step 4: Once the user picks a winner (separate session), enforce the pre-PR gate, then lock the choice and remove the trial machinery**

**Pre-PR gate (hard requirement):** the contrast panel for the chosen preset+mode must show **zero `⚠ violation` rows**. Anything below 4.5:1 must either match one of the three states in the spec's §6 closed exception list, or the spec must be amended to admit the new exception, or the mode must be changed to remove the failure. Resolution paths by winning mode:

- **Mode A wins (any accent):** the auto-darken helper drives every hover chip ≥ 4.5:1 with white text. The only failures will be the resting Dry/Wet §6 exceptions. No design or spec change required.
- **Mode B wins:** Mode B's non-peak hover preserves the resting chip fill+letter+tile, so it inherits the resting Dry letter contrast (≈ 3.32:1) **and** the resting Wet white contrast (≈ 2.23:1) into hover. Both flag `⚠ violation` (not in the §6 closed list). Before the PR, the engineer chooses **one**:
  - (i) Amend the spec — extend §6's closed exception list with "Mode B hover Dry letter" and "Mode B hover Wet white" (note these are structural inheritances of the resting exceptions, not new failure modes); re-commit as `docs(spec): admit Mode B inherited hover exceptions`.
  - (ii) Modify Mode B's hover rule in `sensationRow.ts` so Dry and Wet hover swap the letter to a dark ink (e.g. `#062a26`, the same inky teal used for Mode C's Slippery letter) — passes ≈ 13.15:1 on the resting Dry tile `#d8f3f0` and ≈ 6.89:1 on the resting Wet fill `#62bdb1`. Mode B's defining "outline only" behaviour is preserved: chip fill stays at the resting value and the chosen accent appears on the chip border; only the letter colour shifts on hover for these two states. Update Mode B tests accordingly.
  - (iii) Reject Mode B's win and re-run the trial with Mode A or C as the candidate.
- **Mode C wins:** Mode C's hover keeps the Dry chip's transparent fill and `#5b8a84` letter, but the tile darkens to `#aee5df` on hover — pushing Dry hover contrast down to **≈ 2.78:1** (worse than the resting Dry exception's 3.32). This is **not** in the §6 closed list. Before the PR, the engineer chooses **one**:
  - (i) Amend the spec — extend §6 with "Mode C hover Dry letter (≈ 2.78:1)" noting it's an exacerbation of the resting Dry exception caused by the hover tile darkening; re-commit as `docs(spec): admit Mode C hover Dry exception`.
  - (ii) Modify Mode C's Dry hover rule so the tile stays at the resting `#d8f3f0` for Dry only (hover feedback for Dry then comes from the border colour shift alone — the existing border change `#c0ddd8 → #5d9c93` still reads). Update Mode C tests accordingly and recompute the affected contrast in the panel.
  - (iii) Reject Mode C's win and re-run the trial with Mode A as the candidate.

After the gate is cleared, the cleanup commit will:
1. Replace `useState(...)` initial value in `CycleChartPage.tsx` so `sensationSelection` is a constant set to the chosen preset+mode (no localStorage read in production).
2. Delete the `SensationPresetSwitcher.tsx` file.
3. Remove the `import.meta.env.DEV` gate and the `SensationPresetSwitcher` import/render from `CycleChartPage.tsx`.
4. Trim `ACCENT_PRESETS` in `sensationRow.ts` to only the chosen preset (or drop the preset table entirely if Mode C wins).
5. If Mode A or B with a pale accent won, replace the auto-darken call site with the resolved (literal) hex so `autoDarkenFor45` is no longer called at runtime; if no other site uses `autoDarkenFor45`, delete the helper.
6. Apply any code/spec adjustment chosen under the pre-PR gate above.
7. Run tests + lint + visual verify; **re-run the dev build once more and confirm zero `⚠ violation` rows** in the contrast panel of the chosen option (panel still present at this point; deleted in this same commit after the check).
8. Commit `chore(sensation-row): lock <preset> and strip trial machinery`; open the PR against `main`.

---

## Self-review

Skimming the spec against the plan:

- §1 Goal — covered by Task 13 (row grid renders the recorded sensation).
- §2 Placement & dimensions — Tasks 11–13.
- §3 Data source — Tasks 9, 10.
- §4 Resting design — Task 2 (chip spec) + Task 13 (chart-side render).
- §5 Hover modes A/B/C — Tasks 6, 7, 8 (logic) + Task 13 (chart consumes the styles).
- §6 Contrast policy + product-approved exceptions — Tasks 3, 4 (helpers); Mode-C exceptions baked into Task 8 (no auto-darken applied); Mode A/B accent auto-darken applied in Tasks 6, 7.
- §7 Preset switcher — Task 14; cleanup in Task 15 Step 4.
- §8 Crosshair / hover / tooltip — no code change needed; verified by visual check in Tasks 11, 13.
- §9 Files — `CycleChartPage.tsx`, `sensationRow.ts`, `SensationPresetSwitcher.tsx` all created/modified.
- §10 Verification — Tasks 11, 13, 14 each include a `wasp start` visual check; Task 15 is the trial entry point.
- §11 Out of scope — honoured (no schema change, no editing path, no Sensiplan rule changes).
- §12 Sensiplan alignment — display-only, no interpretation logic.

Type consistency:
- `SensationValue` defined in Task 1, reused identically in Tasks 2, 6, 7, 8, 13.
- `ChipStyle` defined in Task 2, reused by all hover-mode functions in Tasks 6–8 and consumed by Task 13.
- `HoverMode` defined in Task 6, reused in Tasks 7, 8, 13, 14.
- `chipStyleFor(value, args)` signature stable from Task 6 onward; Task 13 uses the same signature.
- `autoDarkenFor45` signature `(fill, text='#ffffff')` matches between Tasks 4, 6, 7, 14.

No placeholders, no "TBD", no "implement later". Every code-touching step shows the code. The exception is Task 15 Step 4 (post-trial cleanup), which is intentionally outlined rather than pre-scripted because the chosen preset is not known until the user runs the trial.
