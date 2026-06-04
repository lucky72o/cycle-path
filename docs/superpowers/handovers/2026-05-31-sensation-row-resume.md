# Sensation Row — Handover & Resume Guide (Mode C iteration)

Date: 2026-05-31
Purpose: This document captures everything a new Claude chat session needs to continue iterating on the Mode C "deepen teal" design for the Sensation row. **The next chat is for iteration, not final cleanup.** Paste the whole file at the start of the new chat.

---

## TL;DR

- The Sensation row was added to the cycle chart's lower table, displaying the user's recorded `cervicalSensation` per day (Dry / Damp shown as "moist" / Wet / Slippery → letters `d / m / w / S`).
- 14 implementation tasks landed on branch `feat/sensation-row` via subagent-driven TDD. Then an in-app preset trial concluded with the user picking **Mode C ("deepen teal")** as the locked hover mode and **wet-only** as the preferred Wet resting variant.
- Modes A and B (and their accent preset table + auto-darken helper) were **stripped** after the lock. The dev switcher now shows only Mode C; the wet-variant sub-dropdown (baseline / wet-only / paired) is preserved for continued iteration.
- **Mode C is the locked direction but the design is NOT final.** The new chat's job is to keep refining Mode C — tile hexes, hover transitions, letter colours, ring shades, etc. — until the user is satisfied. The final cleanup (strip remaining trial machinery + open PR) happens later, not as the first move.

---

## Branch state

- Branch: `feat/sensation-row` (off `main` at session-start HEAD `781f68e`).
- Local-only — **not pushed to remote.** Do not push without explicit user authorization.
- Latest HEAD will be the commit that lands with this handover doc.
- Total commits on branch: ~31 (11 doc, 14 implementation, 2 review iterations, 1 trial-toggle, 1 spec-amendment+handover, 1 strip-Mode-A/B+simplify commits).

---

## File map

### Production code (will ship)
- `app/src/cycle-tracking/sensationRow.ts` — pure-logic module. Now contains: `SensationValue`, `letterFor`, `ChipStyle`, `restingChip`, contrast helpers (`relativeLuminance`, `contrastRatio`, internal `hexToRgb`/`channelToLinear`), `HoverMode` (= `'C'`), `ChipStyleArgs`, `MODE_C_RESTING_SLIPPERY`, `modeCResting`, `MODE_C_HOVER`, `chipStyleFor` dispatcher. Mode A/B/auto-darken/accent presets have been removed.
- `app/src/cycle-tracking/CycleChartPage.tsx` — modified: `sensationMap` useMemo (~line 561), `hasSensation` added to `daysWithDataMap` (~line 636), offsets shifted (Disturbance `+234→+262`, Notes `+262→+290`, `LOWER_TABLE_PADDING_BOTTOM` `262→290`), Sensation row label at `+234`, Sensation grid block at `+234`, dev switcher import + render. Includes the wet-variant trial state.
- `app/src/cycle-tracking/__tests__/sensationRow.test.ts` — 20 vitest cases covering `letterFor`, `restingChip`, contrast helpers (verified WCAG ratios), `modeCResting`, and the Mode C hover dispatcher.

### Dev-only (still active for iteration)
- `app/src/cycle-tracking/SensationPresetSwitcher.tsx` — slimmer floating UI: a single "Mode C · Deepen teal" option in the main dropdown, plus the wet-variant sub-dropdown (baseline / wet-only / paired) and the per-state contrast panel. Stays in place during Mode C iteration; deleted in the eventual final cleanup commit.

### Reference docs
- Spec: `docs/superpowers/specs/2026-05-20-sensation-row-design.md` (with post-trial §13).
- Plan: `docs/superpowers/plans/2026-05-20-sensation-row.md` (Task 15 cleanup steps remain — apply only when iteration is done).
- This handover: `docs/superpowers/handovers/2026-05-31-sensation-row-resume.md`.

---

## Locked design (current shipped state)

### Hover mode
**Mode C — "deepen teal."** Modes A and B and the accent preset infrastructure are gone.

### Letter map (final)
- `DRY` → `d` ("Dry")
- `DAMP` → `m` (displayed as **"moist"** — Sensiplan convention, user-confirmed)
- `WET` → `w` ("Wet")
- `SLIPPERY` → `S` ("Slippery" — peak)
- `null` → no chip (plain teal tile)

### Resting chip spec (baseline — what's in `RESTING` in `sensationRow.ts`)
| Letter | Chip background | Letter colour | Chip border | Ring |
|---|---|---|---|---|
| `d` | transparent | `#5b8a84` | 1 px `#c0ddd8` | — |
| `m` | `#c4e8e2` | `#0f5c54` | 1 px `#9ccfc7` | — |
| `w` | `#62bdb1` | `#ffffff` | 1 px transparent | — |
| `S` (resting, used by `restingChip`) | `#0f766e` | `#ffffff` | 1 px transparent | `#0f766e` |

### Mode C resting Slippery override (in `MODE_C_RESTING_SLIPPERY`)
- Chip: `#62bdb1` (lighter teal)
- Letter: `#062a26` (inky teal)
- Ring: `#62bdb1` (matches chip; tile-coloured 1.5 px gap separates them visually)

### Mode C hover (in `MODE_C_HOVER`)
- Tile: `#d8f3f0` → `#aee5df` (handled by the grid renderer, not the chip)
- Dry: border `#c0ddd8` → `#5d9c93`; letter stays `#5b8a84` (open: contrast ≈ 2.78:1, see "Iteration knobs" below)
- Damp: fill `#c4e8e2` → `#9bd3c9`, border `#9ccfc7` → `#4a8f82`
- Wet: fill `#62bdb1` → `#3f9d90`, adds 1.5 px border `#1e7d72` (open: with wet-only variant active the resting fill is `#357d72` and `#3f9d90` is *lighter*, so hover lightens instead of deepens — needs picking a deeper hex)
- Slippery: chip `#62bdb1` → `#0f766e`, ring `#62bdb1` → `#054a44`, letter `#062a26` → `#ffffff`

### Wet variant toggle (live in dev switcher)
Three options the user can flip between in-app via the "Wet resting variant" sub-dropdown:
- **baseline**: Wet resting `#62bdb1`, Mode C Slippery resting `#62bdb1` + inky letter. (Trial-time default.)
- **wet-only** (user-preferred direction): Wet resting `#357d72`, Mode C Slippery resting unchanged at `#62bdb1` + inky letter. (Wet and Slippery resting visibly differ.)
- **paired**: Wet resting `#357d72`, Mode C Slippery resting `#357d72` + white letter. (Wet and Slippery stay paired.)

The override is applied in the chart's grid renderer (search `wetVariant` in `CycleChartPage.tsx`); `sensationRow.ts`'s `RESTING.WET.background` is still `#62bdb1` — the toggle is purely a render-time override until the iteration concludes and the picked variant is baked into the module.

### Row geometry (already shipped)
- Row offset: `+234` from chart bottom (between Cervical Fluid block and Disturbance).
- Adjacent shifts: Disturbance `+234 → +262`, Notes `+262 → +290`, `LOWER_TABLE_PADDING_BOTTOM` `262+NOTES → 290+NOTES`.
- Hover/crosshair/tooltip integration verified working — no special wiring needed.

### Contrast policy (post-trial, narrowed)
- 4.5:1 hard requirement for every chip letter state except the closed exception list.
- Updated closed exception list:
  - Resting Dry letter `#5b8a84` on tile `#d8f3f0` ≈ **3.32:1** (documented exception).
  - Mode C Dry hover letter on hover tile `#aee5df` ≈ **2.78:1** — **OPEN**, see Iteration knobs.
- Removed: Wet resting (now passes at `#357d72` ≈ 4.86 if wet-only/paired is selected; still 2.23:1 in baseline mode), Mode C Wet hover (will pass once the deeper hex is picked).

---

## Iteration knobs (Mode C refinements available)

These are NOT pre-PR gates. They're suggestions the new chat can offer based on what the user wants to refine. Apply them as small, tested commits during iteration.

### Knob 1: Wet variant (live toggle in switcher — no code change needed)
User flips between baseline / wet-only / paired via the dev switcher dropdown. Once they settle, the final cleanup commit bakes the choice into `RESTING.WET.background`.

### Knob 2: Mode C Wet hover hex (currently `#3f9d90`)
With wet-only/paired variant, Wet resting darkens to `#357d72` (L ≈ 0.166) but hover `#3f9d90` (L ≈ 0.272) is *lighter* — reverses Mode C's "deepen on hover" theme. Three deeper candidates (all pass 4.5:1 with white):

| Candidate | White contrast | Feel |
|---|---|---|
| `#1f7065` | ~5.90:1 | Subtle deepen |
| `#1a6358` (recommended) | ~7.05:1 | Clear deepen |
| `#155a50` | ~8.04:1 | Strong deepen (risks reading near Slippery's `#0f766e`) |

To apply: update `MODE_C_HOVER.WET.background` in `sensationRow.ts`, update the matching test, update spec §5 / §13.

### Knob 3: Mode C Dry hover letter (currently `#5b8a84`)
At ~2.78:1 on the hover tile `#aee5df`, this is the only remaining `⚠ violation` in the switcher's contrast panel for Mode C. Three resolution paths:

- **Path (ii) — switch letter to `#062a26`** (recommended, matches the Slippery inky-letter design). Result: ~11:1 on hover tile, clears the violation. One-line change.
- **Path (i) — accept as a §6 exception.** Extend the closed exception list and update `isException` in the switcher.
- **Path (iii) — change the hover tile for Dry only** (keep tile at resting `#d8f3f0`). Letter stays `#5b8a84` → 3.32:1 still fails, so this alone doesn't help. Combine with a darker letter for it to work.

### Knob 4: Other Mode C tweaks (open-ended)
- Damp hover (`#9bd3c9`) — light pale-teal; could go a step darker.
- Slippery hover ring (`#054a44`) — already very dark; could brighten for a "lighter ring on darker chip" peak signal.
- Resting Dry letter (`#5b8a84`) — kept as documented §6 exception; could swap for a darker ink if the user wants to drop the exception.
- Resting Damp / Wet letter colours.
- Border widths (1 px vs 1.5 px on Wet hover).
- Chip border-radius / dimensions (currently 23×17 px, 5 px radius).
- Tile hover tint (`#aee5df`) — could go deeper or lighter to balance against the chip changes.

---

## When iteration is done — the final cleanup commit

(Don't run this as the first move. Only after the user has confirmed Mode C is fully settled.)

1. **Bake the user's wet variant pick** into `RESTING.WET.background` and (for paired) `MODE_C_RESTING_SLIPPERY` in `sensationRow.ts`.
2. **Apply the locked Knob-2 hex** for Mode C Wet hover (and update the matching test + spec).
3. **Apply the locked Knob-3 resolution** for Mode C Dry hover (and update test + spec).
4. **Apply any other locked Knob-4 changes.**
5. **Remove the wet-variant trial state** in `CycleChartPage.tsx` (`useState`, `useEffect` localStorage write, the chip override block in the grid renderer).
6. **Remove the wet-variant dropdown** + props from `SensationPresetSwitcher.tsx`.
7. **Delete the entire `SensationPresetSwitcher.tsx` file.**
8. **Remove the switcher import + render** from `CycleChartPage.tsx`. Replace the `useState<PresetSelection>` with a constant or drop it entirely (Mode C is the only option).
9. **Simplify `chipStyleFor`** further if helpful — `HoverMode` could shrink, the `accent` arg could go.
10. **Drop `contrastRatio` / `relativeLuminance`** if no caller remains after the switcher is gone (grep before deleting).
11. **Drop `localStorage` keys** `cp.sensation.preset` and `cp.sensation.wetVariant` (no explicit clear needed — they just become unused).
12. **Update the spec** §13 with the final shipped values; mark earlier trial-time sections as historical context.
13. **Run** `npx tsc --noEmit`, `npm test`, `npm run lint -- <touched paths>` — all clean.
14. **Visual smoke check** via `wasp start` — chart loads, Sensation row renders, hover works, the dev switcher is gone, DevTools shows no `cp.sensation.*` reads.
15. **Commit** as `chore(sensation-row): lock final Mode C design and strip trial machinery`.
16. **Ask the user explicitly** before `git push -u origin feat/sensation-row` and `gh pr create`.

---

## How to resume in the new chat

Paste this full document at the start of the new chat. Then choose your starting point. Examples:

> **Continue iterating, no specific direction yet:** "Resuming Sensation Row Mode C iteration. Branch `feat/sensation-row`. Open the chart (cycle 7 has my test sensation data: `d m m w S`) and walk me through what knobs are available to refine. I want to keep playing with Mode C — let's see options before locking anything."

> **Try a specific knob:** "Continuing Sensation Row Mode C iteration. Switch the Mode C Wet hover hex from `#3f9d90` to `#1a6358` (Knob 2 recommended candidate) and update the test. Then I'll see how it looks in the chart."

> **Try multiple knobs at once:** "Continuing Sensation Row. Apply Knob 2 with `#1a6358` and Knob 3 path (ii) (Dry hover letter → `#062a26`). Commit each as a separate small commit. Then refresh the chart for me to look."

> **Ready to finalize:** "Sensation Row Mode C is settled — wet-only variant, Mode C Wet hover `#1a6358`, Mode C Dry hover letter `#062a26`. Run the final cleanup commit per the handover's last section. Do not push without my OK."

The new chat should:
1. **Verify branch + HEAD** match this doc (or close enough — refer to the latest commits).
2. **Default to iteration mode** unless the user explicitly says "finalize" or "cleanup".
3. For each iteration step: make a small, tested change. Run `npx tsc --noEmit` and the relevant test file. Commit with a clear message like `feat(sensation-row): try Mode C Wet hover #1a6358`.
4. **Use Playwright** (or have the user check) to verify the visual outcome in the running app whenever a hex changes.
5. **Stop and ask** before any push, PR creation, or final cleanup commit.

---

## Useful commands

- Run a single test file: `cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts`
- Full test suite: `cd app && npm test`
- Type-check: `cd app && npx tsc --noEmit`
- Lint touched files: `cd app && npm run lint -- src/cycle-tracking/sensationRow.ts src/cycle-tracking/SensationPresetSwitcher.tsx src/cycle-tracking/CycleChartPage.tsx`
- Dev server: `wasp start` (project root). Chart route: `/cycles/:cycleId/chart`.

---

## Project conventions worth knowing

- Tests: `vitest` 1.6.1. Tests live in `app/src/cycle-tracking/__tests__/`.
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`, `chore(scope): ...`. Include a `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- **Never push** without explicit user authorization (per CLAUDE.md).
- **Plain-language responses** preferred — explain technical choices with examples, pros/cons, and a clear recommendation. (User memory: `feedback_explanation_style.md`.)
- **Verify exact values from code** — don't guess hexes / line numbers / enum values. (User memory: `feedback_verify_exact_values.md`.)
- **Isolate changes to approved designs** — when fixing one sub-problem, don't redesign already-approved parts in the same pass. (User memory: `feedback_isolate_design_changes.md`.)
- **Sensiplan alignment** — this row is a faithful display of the felt-sensation observation; no new interpretation rule. (User memory: `feedback_sensiplan_alignment.md`.)
- **FAM charting conventions** — letter codes + colour stamps over pictograms; peak gets emphasis. (User memory: `reference_fam_charting_conventions.md`.)

---

## Recap (for context — skim if you know the history)

1. **Brainstormed visual language** — settled on letter + coloured stamp after rejecting pictograms (droplets / fill meters / waves) once research showed authoritative FAM apps use letter codes + coloured stamps.
2. **Picked colour family** — teal (`#d8f3f0` resting tile, `#aee5df` hover tile).
3. **Three candidate hover modes** were spec'd: Mode A (accent fill), Mode B (accent outline), Mode C (deepen teal).
4. **WCAG AA 4.5:1 contrast policy** added during review iterations. Closed exception list initially had 3 entries; the in-app trial narrowed it.
5. **In-app preset trial** — user toggled through 21 presets × 3 wet variants and picked **Mode C + wet-only**.
6. **Mode A and Mode B stripped** from code + tests + spec after the lock (this is the current state).
7. **Remaining work: Mode C iteration** — refining hover hexes, contrast resolutions, etc. — captured as Knobs 1–4 above. Final cleanup is the eventual end state, not the first move in the new chat.
