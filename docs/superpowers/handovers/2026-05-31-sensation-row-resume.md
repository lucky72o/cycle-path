# Sensation Row — Handover & Resume Guide

Date: 2026-05-31
Purpose: This document captures everything a new Claude chat session needs to resume the Sensation Row work. Paste the whole file at the start of the new chat.

---

## TL;DR

- A new **Sensation** row was added to the cycle chart's lower table, displaying the user's recorded `cervicalSensation` per day (Dry / Damp shown as "moist" / Wet / Slippery → letters `d / m / w / S`).
- 14 implementation tasks landed on branch `feat/sensation-row` via subagent-driven TDD. 39 vitest cases on the pure-logic module; type-check + lint clean.
- A dev-only floating preset switcher was used for an **in-app trial** of 21 colour/mode combinations.
- The user picked **Mode C ("deepen teal") + the "wet-only" resting variant** as the winning design.
- **3 items remain before opening the PR.** All listed under "Open decisions" below.

---

## Branch state

- Branch: `feat/sensation-row` (off `main` at the session-start HEAD `781f68e`).
- Local-only — **not pushed to remote.** Do not push without explicit user authorization.
- ~29 commits total: 11 doc commits + 14 implementation commits + 2 review-iteration commits + 1 trial-toggle commit + spec/handover commits today.
- Latest HEAD reference: `302c160` (`chore(sensation-row): add dev-only Wet/Slippery resting variant toggle`) — the spec amendment + this handover commit will follow.

---

## File map

### Production code (will ship)
- `app/src/cycle-tracking/sensationRow.ts` — pure-logic module. Today contains: `SensationValue`, `letterFor`, `ChipStyle`, `restingChip`, contrast helpers (`relativeLuminance`, `contrastRatio`, internal `hexToRgb`/`channelToLinear`/`rgbToHex`), `autoDarkenFor45`, `AccentPreset` + `ACCENT_PRESETS` + `PRESET_KEYS`, `HoverMode`, `ChipStyleArgs`, internal `darkenShade` + `modeAChip` + `modeBChip` + Mode C constants + `modeCResting`, and `chipStyleFor` dispatcher. After cleanup most of Mode A/B + presets + auto-darken get removed (see Open #3).
- `app/src/cycle-tracking/CycleChartPage.tsx` — modified: `sensationMap` useMemo (~line 561), `hasSensation` added to `daysWithDataMap` (~line 636), offsets shifted (Disturbance `+234→+262`, Notes `+262→+290`, `LOWER_TABLE_PADDING_BOTTOM` `262→290`), Sensation row label at `+234`, Sensation grid block at `+234`, dev switcher import + render. Also has the trial state for the wet variant — see Open #3.
- `app/src/cycle-tracking/__tests__/sensationRow.test.ts` — 39 vitest cases.

### Dev-only (stripped before PR)
- `app/src/cycle-tracking/SensationPresetSwitcher.tsx` — floating selector + per-state contrast panel + the wet-variant sub-dropdown.

### Reference docs
- Spec: `docs/superpowers/specs/2026-05-20-sensation-row-design.md`
- Plan: `docs/superpowers/plans/2026-05-20-sensation-row.md`
- This handover: `docs/superpowers/handovers/2026-05-31-sensation-row-resume.md`

---

## Locked design decisions (post-trial)

### Hover mode (winner)
**Mode C — "deepen teal"** (colour-agnostic). Mode A and Mode B are dropped in cleanup.

### Wet resting variant (winner)
**wet-only.** Wet's resting chip background moves from the original `#62bdb1` to **`#357d72`** (conservative darken). White-on-`#357d72` ≈ 4.86:1 — no longer a WCAG exception.

### Mode C Slippery resting (unchanged from previous lock)
Stays at the previously locked design: chip `#62bdb1`, letter `#062a26` (inky teal), ring `#62bdb1`. Note: with Wet now at `#357d72`, the "Wet and Slippery share a chip colour" link is intentionally broken — Slippery resting stays the lighter `#62bdb1` so its inky-letter peak design remains visible and distinct.

### Full locked resting chip spec
| Letter | Chip background | Letter colour | Chip border | Ring |
|---|---|---|---|---|
| `d` | transparent | `#5b8a84` | 1 px `#c0ddd8` | — |
| `m` | `#c4e8e2` | `#0f5c54` | 1 px `#9ccfc7` | — |
| `w` | **`#357d72`** | `#ffffff` | 1 px transparent | — |
| `S` (Mode C peak resting) | `#62bdb1` | `#062a26` | 1 px transparent | `#62bdb1` (rendered with a 1.5 px tile-coloured gap) |

### Locked Mode C hover (partial — see Open #1)
- Tile: `#d8f3f0` → `#aee5df`
- Dry: border `#c0ddd8` → `#5d9c93`, **letter `#5b8a84` → see Open #2** (current `#5b8a84` fails contrast on hover tile)
- Damp: fill `#c4e8e2` → `#9bd3c9`, border `#9ccfc7` → `#4a8f82`
- Wet: fill `#357d72` → **TBD (Open #1)**; existing 1.5 px border `#1e7d72` retained pending final hex pick
- Slippery: chip `#62bdb1` → `#0f766e`, ring `#62bdb1` → `#054a44`, letter `#062a26` → `#ffffff`

### Letter map & display terms
- `DRY` → `d` ("Dry")
- `DAMP` → `m` (displayed as **"moist"** per FAM/Sensiplan convention, user-confirmed)
- `WET` → `w` ("Wet")
- `SLIPPERY` → `S` ("Slippery" — peak)
- `null` → no chip (plain teal tile)

### Row geometry (already shipped)
- Row offset: `+234` from chart bottom (between Cervical Fluid block and Disturbance).
- Adjacent shifts: Disturbance `+234 → +262`, Notes `+262 → +290`, `LOWER_TABLE_PADDING_BOTTOM` `262+NOTES → 290+NOTES`.
- Hover/crosshair/tooltip integration verified working — no special wiring needed (cells use `pointerEvents:'none'`, mirror Disturbance pattern).

### Contrast policy after lock
- 4.5:1 hard requirement for every chip letter state except the closed exception list.
- Updated closed exception list (after lock):
  - Resting Dry letter `#5b8a84` on tile `#d8f3f0` ≈ **3.32:1** — kept as documented exception.
  - Mode C Dry hover letter on hover tile `#aee5df` ≈ **2.78:1** — **OPEN, see Open #2**.
- Removed from exception list: Wet resting (now `#357d72`, 4.86:1, passes) and Mode C Wet hover (will pass once Open #1 lands).

---

## Open decisions (must resolve before PR)

### Open #1: Pick a deeper Mode C Wet hover hex
Wet resting moved to `#357d72` (L ≈ 0.166). The current Mode C Wet hover hex `#3f9d90` (L ≈ 0.272) is now *lighter* than resting — backwards for Mode C's "deepen on hover" theme. Pick one (all three pass 4.5:1 with white, none collide with Slippery's `#0f766e`):

| Candidate | White contrast | Step size from resting | Visual feel |
|---|---|---|---|
| **`#1f7065`** | ~5.90:1 | small | Subtle deepen — minimal hover signal |
| **`#1a6358`** (recommended) | ~7.05:1 | clear | Clear deepen — readable without being dramatic |
| **`#155a50`** | ~8.04:1 | deep | Strong deepen — risks reading similar to Slippery's `#0f766e` peak |

**Action when picked:**
1. Update `MODE_C_HOVER.WET.background` in `sensationRow.ts` from `#3f9d90` to the picked hex.
2. (Optional) Update `MODE_C_HOVER.WET.border` from `1.5px solid #1e7d72` to a darker matching border, or keep `#1e7d72` if it still reads.
3. Update the Mode C Wet hover assertion in `__tests__/sensationRow.test.ts`.
4. Update spec §5 Mode C hover Wet line.
5. Drop "Mode C Wet hover" from the §6 closed exception list (no longer needed).

### Open #2: Resolve Mode C Dry hover violation
Per spec §6 and plan Task 15 step 4, Mode C Dry hover letter `#5b8a84` on hover tile `#aee5df` ≈ **2.78:1** — fails 4.5:1 and is NOT in the closed exception list. Three resolution paths from the plan:

- **(i) Amend spec** — extend §6's closed list with "Mode C Dry hover at 2.78:1". Also update `isException` in `SensationPresetSwitcher.tsx` to return `true` for `mode === 'C' && hover && value === 'DRY'`. *(But the switcher is deleted in cleanup, so this update only matters during any further in-app trial.)*
- **(ii) Modify Mode C Dry hover rule** *(recommended)* — switch the Dry hover letter from `#5b8a84` to a dark ink (e.g. **`#062a26`**, matching the inky-S choice). Result: ~11.0:1 on the hover tile `#aee5df` — passes cleanly. Symmetrical with the inky-letter logic used for Slippery resting.
- **(iii) Reject Mode C** — already rejected by the user.

**Recommended: path (ii).** It's a one-line change (`MODE_C_HOVER.DRY.color: '#5b8a84' → '#062a26'`), uses an existing hex from the design (consistency), and clears the gate without amending the closed exception list further.

**Action when picked (assuming (ii)):**
1. Update `MODE_C_HOVER.DRY.color` in `sensationRow.ts`.
2. Update the Mode C Dry hover assertion in `__tests__/sensationRow.test.ts`.
3. Update spec §5 Mode C hover Dry line ("letter `#5b8a84` → `#062a26` on hover").
4. Remove "Mode C Dry hover" from any §6 mention (no longer an exception).

### Open #3: Cleanup commit (apply locked decisions + strip trial machinery)

After #1 and #2 are resolved, run the cleanup as a single commit. Checklist:

**In `sensationRow.ts`:**
1. Update `RESTING.WET.background` from `#62bdb1` to `#357d72` (bakes wet-only into the resting table).
2. Update `MODE_C_HOVER.WET.background` to the #1 pick.
3. Update `MODE_C_HOVER.DRY.color` to `#062a26` (per #2 resolution (ii)).
4. Delete `modeAChip` function.
5. Delete `modeBChip` function.
6. Delete `darkenShade` (only used by Mode A/B peak ring).
7. Delete `autoDarkenFor45` (only used by Mode A/B).
8. Delete `AccentPreset`, `ACCENT_PRESETS`, `PRESET_KEYS` exports + the table.
9. Simplify `chipStyleFor` to only handle Mode C: `if (args.mode === 'C') return modeCChip(value, args.hover); return restingChip(value);` (or drop the mode arg entirely — only Mode C ships).
10. Consider whether `HoverMode` / `ChipStyleArgs` types are still needed once Mode A/B are gone; if `chipStyleFor` always uses Mode C, the dispatcher can be simplified to `chipStyleFor(value, hover): ChipStyle = hover ? MODE_C_HOVER[value] : modeCResting(value);`.
11. Internal `hexToRgb`, `channelToLinear`, `rgbToHex` may also be deletable if no public function uses them. (Contrast helpers `relativeLuminance` / `contrastRatio` were used by the switcher only; if no production caller remains, drop those too.) **Verify with `grep` before deleting.**

**In `CycleChartPage.tsx`:**
12. Remove the `sensationSelection` `useState` + the import block from `./SensationPresetSwitcher`.
13. Remove the `wetVariant` `useState` + its `useEffect` localStorage write.
14. Remove the chip override in the grid renderer (the `if (chip && !isHovered && wetVariant !== 'baseline')` block) — once `RESTING.WET.background` is `#357d72` in `sensationRow.ts`, the wet-only behaviour comes for free.
15. Replace `sensationMode = sensationSelection.mode` / `sensationAccent = sensationSelection.accent` with constants (or drop entirely if `chipStyleFor` was simplified in step 10).
16. Remove the `<SensationPresetSwitcher .../>` JSX block + the `import.meta.env.DEV` gate around it.
17. Simplify the grid renderer's chip-style call (no more `mode`/`accent` args if `chipStyleFor` was simplified).

**Delete file:**
18. `app/src/cycle-tracking/SensationPresetSwitcher.tsx` — `git rm`.

**Tests in `__tests__/sensationRow.test.ts`:**
19. Drop all Mode A tests (`describe('chipStyleFor — Mode A', ...)`).
20. Drop all Mode B tests (`describe('chipStyleFor — Mode B', ...)`).
21. Drop all `autoDarkenFor45` tests.
22. Drop all `ACCENT_PRESETS` tests.
23. Drop `relativeLuminance` / `contrastRatio` tests if those helpers were removed in step 11.
24. Update Mode C resting Wet assertion to `#357d72`.
25. Update Mode C hover Wet assertion to the #1 pick.
26. Update Mode C hover Dry assertion to `#062a26` letter (per #2).
27. Consolidate imports at the top of the test file.

**Spec updates** (`docs/superpowers/specs/2026-05-20-sensation-row-design.md`):
28. Mark Mode A and Mode B as dropped post-trial (or remove their §5 subsections entirely, just leave the locked Mode C design).
29. Update §4 Wet resting hex to `#357d72`.
30. Update §5 Mode C hover Wet + Dry to the picked values.
31. Update §6 contrast policy + closed exception list to reflect the shrunk list (only resting Dry remains as a documented exception).
32. Update §7 cleanup-already-done note.
33. Drop §6 presets (no longer relevant).

**Verification:**
34. `cd app && npx tsc --noEmit` — clean.
35. `cd app && npm test` — all tests pass.
36. `cd app && npm run lint -- src/cycle-tracking/sensationRow.ts src/cycle-tracking/CycleChartPage.tsx` — no new lint errors.
37. `wasp start`, navigate to a cycle chart with sensation data, hover the BBT line at days with each sensation value — verify chips behave as expected.
38. Confirm the dev switcher and trial dropdown are gone, that `localStorage` is no longer read on init (open DevTools → Application → Local Storage → confirm `cp.sensation.preset` and `cp.sensation.wetVariant` are not accessed).

**Commit:**
39. `git commit -m "chore(sensation-row): lock Mode C + wet-only and strip trial machinery"` (with the standard Co-Authored-By trailer).

**PR:**
40. Ask the user explicitly before `git push -u origin feat/sensation-row` and `gh pr create`. Do NOT push or create the PR without explicit authorization.

---

## How to resume in the new chat

Paste this full document at the start of the new chat, then say:

> "Resuming Sensation Row work. Branch `feat/sensation-row`, HEAD around `302c160`. Please open the chart in a browser (cycle 7 has my test sensation data: `d m m w S`) and walk me through Open #1 — show me the three Mode C Wet hover candidates side-by-side so I can pick. Then apply Open #2 (path ii — inky letter on Dry hover) and Open #3 (the cleanup commit). Verify with tests + lint at each step. Do not push without my OK."

Or, if you want to skip the in-app visual comparison and just pick:

> "Continuing Sensation Row. Pick Mode C Wet hover = `#1a6358` (the recommended clear-deepen) and resolve Mode C Dry hover via path (ii) — letter to `#062a26` on hover. Then run the cleanup commit per Open #3. Do not push without my OK."

The new chat should:
1. **Verify the branch + HEAD** match this doc.
2. **Read the spec + the latest amendment commit** to understand current locked state.
3. **Handle Open #1 and Open #2** in small, tested steps (each as its own commit).
4. **Apply Open #3 cleanup** as a single deliberate commit. Use `superpowers:subagent-driven-development` for the cleanup if it helps split the work; otherwise do it manually given the cleanup is mostly deletions of known code paths.
5. **Run final whole-implementation review** per the subagent-driven-development skill (dispatch the `superpowers:code-reviewer` agent for the entire branch).
6. **Stop before pushing.** Ask the user.

---

## Project conventions worth knowing

- Tests: `vitest` 1.6.1. Run via `cd app && npm test` for the suite, or `cd app && npx vitest run <path>` for a single file.
- Type-check: `cd app && npx tsc --noEmit`.
- Lint: `cd app && npm run lint -- <paths>`. Pre-existing lint warnings outside this branch's touch points are OK; new lint errors on touched files are not.
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`, `chore(scope): ...`. Include a `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- **Never push** without explicit user authorization (per CLAUDE.md).
- **Plain-language responses** preferred — explain technical choices with examples, pros/cons, and a clear recommendation. (User memory: `feedback_explanation_style.md`.)
- **Verify exact values from code** — don't guess hexes / line numbers / enum values. (User memory: `feedback_verify_exact_values.md`.)
- **Isolate changes to approved designs** — when fixing one sub-problem, don't redesign already-approved parts in the same pass. (User memory: `feedback_isolate_design_changes.md`.)
- **Sensiplan alignment** — this row is a faithful display of the felt-sensation observation; no new interpretation rule. (User memory: `feedback_sensiplan_alignment.md`.)
- **Wasp dependency pinning** — versions in `app/package.json` must match `.wasp/out/web-app/package.json` exactly. Not applicable for this work (no new dependencies) but worth knowing.
- **FAM charting conventions** — letter codes + colour stamps over pictograms; peak gets emphasis. (User memory: `reference_fam_charting_conventions.md`.)
- Wasp dev server: `wasp start` (typically `localhost:3000`). Chart route: `/cycles/:cycleId/chart`. Cycle 7 has the user's test sensation data.

---

## Recap of what's been built and why (for context, skim if you already know)

The Sensation row sits between the **Cervical Fluid** block and the **Disturbance** row in the chart's lower table. It displays the user's recorded cervical sensation per day as a small "stamp" chip with a letter (`d / m / w / S`). The design went through extensive brainstorming:

1. **Brainstormed visual language** — settled on letter + coloured stamp (rejecting pictograms, droplet drawings, fill-level meters, and wave glyphs after finding that authoritative FAM apps like Read Your Body use letter codes + coloured stamps, not pictograms).
2. **Picked colour family** — teal (`#d8f3f0` resting tile, `#aee5df` hover tile), with three candidate hover modes (Mode A = accent fill, Mode B = accent outline, Mode C = deepen teal).
3. **WCAG AA 4.5:1 contrast policy** added during review iterations. Letter at 11 px Mont 700 is below WCAG's "large text" threshold, so 4.5:1 applies. Three states were initially documented exceptions; the wet-only variant trial removed Wet resting from that list.
4. **In-app trial** — the user enabled the dev switcher and toggled through the 21 presets × 3 wet variants. Picked Mode C + wet-only.
5. **Remaining:** Open #1 (Mode C Wet hover hex), Open #2 (Mode C Dry hover letter), Open #3 (cleanup commit).

Trial machinery is still live so the new chat can continue the in-app comparison if needed before locking #1 and #2.
