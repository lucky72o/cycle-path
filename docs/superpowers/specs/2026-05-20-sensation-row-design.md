# Sensation row — design

Date: 2026-05-20
Status: Approved (design); colour preset to be picked in-app during implementation, before opening the PR.

## 1. Goal

Surface the user's recorded **cervical sensation** (felt sensation at the vulva: Dry / Damp / Wet / Slippery) directly on the cycle chart. Today this value is captured per day in the add-day form but is invisible on the chart. Adding a row makes the second mucus observation dimension legible alongside the existing Cervical Fluid (appearance) row, completing the Sensiplan "sensation + appearance" pair that together identifies the mucus peak.

This is a faithful **display** of a primary Sensiplan observation, not a new interpretation, so it stays within method guidelines.

## 2. Placement & dimensions

Insert a new 28 px row directly **above Disturbance**, immediately below the 5-row Cervical Fluid block — putting sensation visually adjacent to appearance, as Sensiplan teaches them as a pair.

All lower-table rows are absolutely positioned via `top: plotAreaTop + chartHeight + OFFSET`. Current and new offsets:

| Row | Current offset | New offset | Height |
|---|---:|---:|---:|
| Time Stamp | 0 | 0 | 38 |
| LH Test | 38 | 38 | 28 |
| Intimacy | 66 | 66 | 28 |
| Cervical Fluid | 94 | 94 | 140 |
| **Sensation (new)** | — | **234** | **28** |
| Disturbance | 234 | **262** | 28 |
| Notes | 262 | **290** | `NOTES_ROW_HEIGHT` (28 / 120) |

`LOWER_TABLE_PADDING_BOTTOM` ([CycleChartPage.tsx:545](app/src/cycle-tracking/CycleChartPage.tsx:545)) changes from `262 + NOTES_ROW_HEIGHT` to `290 + NOTES_ROW_HEIGHT` so the chart container grows by 28 px and nothing clips.

## 3. Data source

- **Schema** (`app/schema.prisma`):
  - Line 129–134: `enum CervicalSensation { DRY DAMP WET SLIPPERY }`
  - Line 201: `cervicalSensation CervicalSensation?` on `CycleDay` (nullable)
- **Query**: `getCycleById` returns full `cycle.days` records including `cervicalSensation` (confirmed: [AddCycleDayPage.tsx:82](app/src/cycle-tracking/AddCycleDayPage.tsx:82) reads `existingDay.cervicalSensation`). **No schema or query change required.**
- **Wiring**: add a `sensationMap` `useMemo` next to `disturbanceMap` (~[CycleChartPage.tsx:548](app/src/cycle-tracking/CycleChartPage.tsx:548)) keyed by `dayNumber → cervicalSensation | null`, sourced from `allCycleDaysMap`.
- **`daysWithDataMap`** ([line ~611](app/src/cycle-tracking/CycleChartPage.tsx:611)): include `hasSensation` so a day whose only entry is a sensation still counts as "has data".

This row is **display-only** — editing remains in `AddCycleDayPage` / `NewCyclePage`. Consistent with every other lower-table row.

## 4. Visual: resting state (locked)

The Sensation cell tile follows the existing per-cell pattern (1.5 px inset, 3 px radius, white gap between tiles). Each day's tile contains a small centred "stamp" chip carrying a single letter that maps to the enum.

**Enum → display term → letter**

| Enum value | Display term | Letter |
|---|---|---|
| `DRY` | Dry | `d` |
| `DAMP` | **moist** (per FAM/Sensiplan convention, user-confirmed) | `m` |
| `WET` | Wet | `w` |
| `SLIPPERY` | Slippery (peak) | `S` |
| `null` | — | (no chip; plain tile) |

Chip letter contrast targets 4.5:1 per §6. Three resting/Mode-C combinations below ship as **product-approved exceptions** under that policy.

**Resting chip spec** (unchanged across all hover modes; the only resting deviation is Mode C — see §5):

| Letter | Chip background | Letter colour | Chip border | Extra |
|---|---|---|---|---|
| `d` | transparent | `#5b8a84` | `1px #c0ddd8` | — |
| `m` | `#c4e8e2` | `#0f5c54` | `1px #9ccfc7` | — |
| `w` | `#62bdb1` | `#ffffff` | `1px transparent` | — |
| `S` | `#0f766e` | `#ffffff` | `1px transparent` | peak ring: `box-shadow: 0 0 0 1.5px <tileBg>, 0 0 0 3px #0f766e` |

Chip dimensions: 23 × 17 px, border-radius 5 px, Montserrat 700 11 px.

Cell tile resting: `#d8f3f0`. Tail days: `#f1f5f9` (no chip).

**Row label** "Sensation": `width: plotAreaOffset px`, label box `inset:1.5px, borderRadius:3px, backgroundColor:#d8f3f0`, Montserrat 600 / 11 px / `#002142`, right-aligned, letter-spacing 0.02em — identical pattern to Disturbance/Notes labels.

## 5. Visual: hover state (3 candidate modes to trial in-app)

Hover background visibility was the central design problem (chip covers most of the 34 × 28 cell, so a plain tile re-tint reads weakly). We implement **three hover modes** behind a runtime preset selector; the user trials them in the running app and locks one before the PR. Hover chip letter contrast targets 4.5:1 per §6. Mode A/B accent presets are auto-darkened to pass; Mode C ships its target hexes (Wet hover is a product-approved exception, see §6).

### Mode A · v1 — accent fill (warm/cool accent)

On hover:
- Tile: `#d8f3f0` → **`#aee5df`**
- Every chip's background **fills with the preset accent colour**; border = `1 px solid <accent>`; letter switches to white for legibility.
- Slippery's peak ring uses a darker shade of the accent (algorithmic darken).

### Mode B · v2 — accent outline (warm/cool accent)

On hover:
- Tile: stays `#d8f3f0` (resting) for non-peak cells; peak cell tile goes to `#aee5df`.
- For Dry / Damp / Wet: only the chip's **outline** takes the accent colour (1.5 px). Inner fill, letter colour, and outside tile remain resting.
- For Slippery (peak): identical to Mode A (accent fill, white S, darker-shade ring, tile `#aee5df`).

### Mode C · "deepen teal" (colour-agnostic, closer to original)

Resting deviates from §4 for Slippery (peak):
- Chip background: **`#62bdb1`** (held fixed — visually tied to the Wet target hex, *not* to Wet's auto-darkened shipped value).
- Outer ring: **`#62bdb1`** (same as chip; ring still reads because of the 1.5 px tile-coloured gap between chip and ring).
- Letter: inky teal **`#062a26`** (≈ **6.89:1** on `#62bdb1`, passes 4.5:1 cleanly).

This sidesteps the original Mode C "squeeze" — instead of a barely-lighter peak that darkens slightly on hover, the resting sits in Wet's lighter teal with a dark letter, and the hover transitions to the deep peak with a white letter. The hover signal is a dramatic two-axis change: chip darkens AND letter inverts.

On hover:
- Tile: `#d8f3f0` → `#aee5df`
- Dry: border `#c0ddd8` → `#5d9c93`
- Damp: fill `#c4e8e2` → `#9bd3c9`, border `#9ccfc7` → `#4a8f82`
- Wet: fill `#62bdb1` → `#3f9d90`, adds 1.5 px border `#1e7d72`
- Slippery: chip `#62bdb1` → `#0f766e`, ring `#62bdb1` → `#054a44`, letter `#062a26` → `#ffffff`

## 6. Colour presets (for in-app trial)

Saved as a typed table in code. Modes A and B share the same accent colour set; Mode C is monolithic.

| Preset key | Label | Mode A/B accent | Source | Notes |
|---|---|---|---|---|
| `deepen` | Option 3 · Deepen teal | n/a | new (teal family) | Mode C only |
| `rose-medium` | Dusty Rose · medium | `#cf7591` | new | Modes A & B |
| `rose-contrast` | Dusty Rose · more contrast | `#c75f80` | new | Modes A & B |
| `rose-bold` | Dusty Rose · bold | `#bd4a6e` | new | Modes A & B |
| `sky` | Soft Sky | `#60a5fa` | reused (month-0 underline) | Modes A & B |
| `amber` | Amber | `#f59e0b` | reused (LH peak dot) | Modes A & B |
| `amber-gold` | Amber–Gold blend | `#f3aa08` | new (midpoint) | Modes A & B |
| `gold` | Golden Yellow | `#f2b705` | new | Modes A & B; pale → may darken slightly for white-letter contrast |
| `indigo` | Soft Indigo | `#7c83e8` | new | Modes A & B |
| `bbt-blue` | BBT Blue | `#3b82f6` | reused (BBT line / LH blue arrow) | Modes A & B |
| `lh-green` | LH green | `#16a34a` | reused (LH peak rising arrow) | Modes A & B |

**Contrast policy (WCAG AA, normal text):** target is **4.5:1** for every chip letter state. The chip glyph is 11 px Montserrat 700, which sits below WCAG's "large text" threshold (18 pt or 14 pt bold), so the 3:1 rule does not apply.

**Where 4.5:1 is a hard pre-PR requirement — Mode A/B trial accent presets.** The chosen accent must pass 4.5:1 with white text on the chip fill before the PR is opened. Failing accents are auto-darkened to the smallest factor that crosses 4.5:1. White-on-fill at 4.5:1 is met **only** by Dusty Rose · bold (`#bd4a6e` ≈ 4.81:1) and darker; every paler preset (Golden Yellow, Amber, Amber–Gold blend, Soft Sky, Soft Indigo, BBT Blue, LH green, Dusty Rose · medium, and Dusty Rose · more contrast `#c75f80` ≈ 3.91:1) fails and is auto-darkened.

**Product-approved exceptions to 4.5:1** — these three states ship at the listed hexes per user decision 2026-05-20 (try the visual target first, judge readability in the in-app trial):
- Resting Dry letter `#5b8a84` on tile `#d8f3f0` ≈ **3.32:1**
- Resting Wet white on `#62bdb1` ≈ **2.23:1**
- Mode C Wet hover white on `#3f9d90` ≈ **3.26:1**

If the in-app trial surfaces a specific state the user judges unreadable, that exception is dropped and the state is darkened before the PR (suggested Wet darken: `#438176`–`#357d72`). Absent that explicit user judgment, the exception hexes ship.

**Side-effect of the Wet exception:** Wet and Mode C Slippery resting both use `#62bdb1`, distinguished only by the letter (`w` white vs `S` inky teal `#062a26`).

**Other states (for completeness — all pass):**
- Mode C Slippery resting `#062a26` on `#62bdb1` ≈ **6.89:1**
- Mode C Slippery hover white on `#0f766e` ≈ **5.48:1**

**Closed exception list:** the three states above are the only product-approved deviations from 4.5:1. No other chip letter state may ship below 4.5:1.

The floating preset switcher (§7) displays the live contrast ratio per state and per preset so the user can verify on the chart.

## 7. Preset switcher (dev-only, removed before PR)

A small floating selector pinned to the chart page (top-right of the chart area), visible only in dev (`import.meta.env.DEV`). It lists every preset × mode (e.g. "Amber · v1", "Amber · v2", "Option 3 · Deepen teal"). Current selection persists via `localStorage` (key `cp.sensation.preset`). Switching is instant — no reload required.

The selector and its persistence read are gated behind a single feature flag; before opening the PR we:
1. Lock the chosen preset+mode as the default values of the preset/mode constants.
2. Delete the selector component and its `useState`/`localStorage` plumbing.
3. Remove unused presets, keeping only the chosen one.

## 8. Crosshair / hover-highlight / tooltip behaviour

All three keep working with **no special wiring**, verified from the source:

- **Crosshair** ([CycleChartPage.tsx:1677](app/src/cycle-tracking/CycleChartPage.tsx:1677)): a single vertical line at `left:crosshairX, top:0, height:100%`. Growing `LOWER_TABLE_PADDING_BOTTOM` by 28 px grows the container; the crosshair's `100%` follows. The Sensation row sits inside that container and is automatically covered.
- **Hover-highlight**: `hoveredDayNumber` is set by the apex-canvas mousemove handler near [line 630](app/src/cycle-tracking/CycleChartPage.tsx:630), which only fires for pointer events **inside the upper plot area**. Lower-table cells (e.g. Disturbance at [line 2486](app/src/cycle-tracking/CycleChartPage.tsx:2486)) use `pointerEvents: 'none'` on their per-cell wrappers, so direct hover over a lower-row cell does **not** fire events. The Sensation row mirrors that pattern (`pointerEvents:'none'` on its cells) and reads the shared `hoveredDayNumber` to recolour its column cell. **Net behaviour:** hovering a day column inside the upper plot lights up the matching Sensation cell automatically — column hover is plot-area-driven and consistent with every other lower-table row. Direct hover over the Sensation row itself is intentionally a no-op.
- **Tooltip** ([line ~1691](app/src/cycle-tracking/CycleChartPage.tsx:1691)): positioned by `crosshairX`, independent of row count. **Optional enhancement**: add a "Sensation: <value>" line to the tooltip body (gated on `day.cervicalSensation`). Treated as a *separate optional* add — implement only if the user opts in during build.

## 9. Code changes (one file modified, one new module, one dev-only component)

**Files touched:**
- `app/src/cycle-tracking/CycleChartPage.tsx` — modified (row insertion, offsets, `LOWER_TABLE_PADDING_BOTTOM`, `sensationMap`, `hasSensation`).
- `app/src/cycle-tracking/sensationRow.ts` — **new** (resting + 3 hover-mode rules, preset table, **Mode A/B accent auto-darken helper** — resting + Mode C ship per §6 exceptions, no auto-darken applied).
- `app/src/cycle-tracking/SensationPresetSwitcher.tsx` — **new, dev-only** (floating preset selector, gated on `import.meta.env.DEV`, deleted before the PR per §7).


1. Add `sensationMap` `useMemo` near [line 548](app/src/cycle-tracking/CycleChartPage.tsx:548), mirroring `disturbanceMap`.
2. Add `hasSensation` to `daysWithDataMap` (~[line 611](app/src/cycle-tracking/CycleChartPage.tsx:611)) so days with only a sensation count as having data.
3. Insert Sensation row **label** (mirrors Disturbance label at [2386–2401](app/src/cycle-tracking/CycleChartPage.tsx:2386)) at offset `+234`.
4. Insert Sensation row **grid** (mirrors Disturbance grid at [2446–2495](app/src/cycle-tracking/CycleChartPage.tsx:2446)) at offset `+234`. Per-cell renderer applies the active preset+mode rules from §4–§6.
5. Shift **Disturbance** label & grid `+234 → +262` ([lines 2390, 2452](app/src/cycle-tracking/CycleChartPage.tsx:2390)).
6. Shift **Notes** label & grid `+262 → +290` ([lines 2408, 2503](app/src/cycle-tracking/CycleChartPage.tsx:2408)).
7. Update `LOWER_TABLE_PADDING_BOTTOM` constant `262 → 290` ([line 545](app/src/cycle-tracking/CycleChartPage.tsx:545)).
8. Extract the resting + 3 hover-mode rules and the preset table into a small co-located module (e.g. `app/src/cycle-tracking/sensationRow.ts`) so the renderer stays readable and the trial machinery is easy to delete.
9. Add the dev-only preset selector (separate dev component, gated on `import.meta.env.DEV`, deleted before PR).

No new dependencies. No schema migration. No new operations/queries.

## 10. Verification

- `wasp start`, open a cycle chart with recorded sensations covering all four values across days.
- Confirm: Sensation row appears above Disturbance with correct letters per day; empty days show a plain teal tile; tail days `#f1f5f9`; nothing clips at the bottom.
- Confirm: hovering a day column lights up the Sensation cell, the crosshair runs through it, and the tooltip still positions correctly.
- Trial every preset × mode via the floating selector; choose the winner.
- After locking the choice, re-verify the chart with the trial machinery removed and only the final preset constants in source.

## 11. Out of scope

- Editing sensation on the chart (entry stays in the day form).
- Schema / API changes (none required).
- Tooltip "Sensation" line — *optional* enhancement (§8), decide during build.
- Any change to the existing Cervical Fluid (appearance) row.
- Interpretation logic — this is display only; Sensiplan rules are untouched.

## 12. Sensiplan alignment

Sensation (Empfindung) is one of the two cervical-mucus observation dimensions Sensiplan teaches; pairing it visually with the existing Cervical Fluid (appearance) row directly reflects the method's teaching. The notation `d / m / w / S` mirrors short-letter charting used in Sensiplan paper charts and Read-Your-Body-style coloured codes; `DAMP` is rendered as **"moist"** because the user confirmed that wording matches their teaching materials. The row is faithful to the observation; no Sensiplan interpretation rule is added or altered.

## 13. Post-trial locked decisions (2026-05-31) — supersedes §4–§7 where they conflict

The in-app preset trial concluded with the following picks. **This section is the source of truth post-trial; earlier sections describe the trial-time design.**

### Winning hover mode
**Mode C — "deepen teal."** Modes A and B are dropped in cleanup. The accent preset table, `autoDarkenFor45`, and Mode A/B chip-style functions are removed from `sensationRow.ts`.

### Wet resting variant
**wet-only.** `RESTING.WET.background` shifts from `#62bdb1` to **`#357d72`**. White-on-`#357d72` ≈ **4.86:1** — no longer a WCAG exception. Mode C Slippery resting stays at `#62bdb1` + inky `#062a26` letter (the Slippery–Wet "visually tied" link from §5 is intentionally broken — Slippery resting stays the lighter teal so its peak-distinguishing design remains visible).

### Updated closed exception list
- Resting Dry letter `#5b8a84` on tile `#d8f3f0` ≈ **3.32:1** — kept as documented exception.
- Mode C Dry hover letter on hover tile `#aee5df` ≈ **2.78:1** — **OPEN gate** (Open #2 in the handover doc); recommended resolution path (ii): switch letter to `#062a26` inky teal on hover, yielding ~11:1 — clears the gate, removes from list.
- Wet resting — removed (now passes 4.86:1).
- Mode C Wet hover — removed in spirit pending Open #1 (a deeper hex than the new resting; all candidates pass 4.5:1).

### Open items (must resolve before PR)
See `docs/superpowers/handovers/2026-05-31-sensation-row-resume.md` for the full open-item list and the cleanup checklist. Summary:

1. **Open #1** — pick Mode C Wet hover hex from `#1f7065` / `#1a6358` / `#155a50` (all darker than the new resting `#357d72`; all pass 4.5:1).
2. **Open #2** — resolve Mode C Dry hover via path (ii): letter `#062a26` on hover.
3. **Open #3** — cleanup commit: lock the locked values into `sensationRow.ts`, strip the dev switcher + wet-variant trial machinery, drop Mode A/B + presets + auto-darken, update tests, run tests + lint, then push (with explicit user OK) and open the PR.
