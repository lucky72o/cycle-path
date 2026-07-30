# Sensation Row — Handover & Resume Guide (Mode C iteration)

Date: 2026-05-31
Purpose: This document captured what a new session needed to continue iterating on the Mode C "deepen teal" design for the Sensation row.

---

> # ⚠️ SUPERSEDED — 2026-07-28
>
> **Do not follow the instructions in this document.** The Dry and Wet iterations it proposes were completed, and the design moved in a *different direction* than the knobs below recommend. Following Knob 1, Knob 2, or the example prompts in "How to resume" would **revert a shipped contrast fix**.
>
> **Source of truth is now `docs/superpowers/specs/2026-05-20-sensation-row-design.md` §13.**
>
> What changed since this was written:
>
> | This doc says | Actually shipped |
> |---|---|
> | Wet resting `#357d72` (wet-only), pick a *darker* hover hex (`#1a6358`) | Wet is **pale** `#c4e8e2` + 1.5 px frame `#1e7d72`; hover `#9bd3c9` + frame `#135e55` |
> | Wet-variant toggle (baseline/wet-only/paired) is live for iteration | **Removed entirely** — override, state, type, dropdown, and `cp.sensation.wetVariant` key all gone |
> | Dry hover letter unresolved (~2.78:1), try `#062a26` | Dry is a muted teal-grey: `#596b68` resting / `#4d5f5c` hover, letter **and** frame |
> | Two open contrast gates remain | **All eight letter states pass 4.5:1. No exceptions remain.** |
>
> Still accurate below: the branch/file map (minus the wet-variant items), the row geometry, the project conventions, and the recap. Sections that are stale are flagged inline.
>
> One genuinely open item remains, and it is *not* in this document: the **Slippery resting ring at 1.91:1**. See `docs/superpowers/notes/2026-07-28-slippery-ring-contrast.md`.

---

## TL;DR

- The Sensation row was added to the cycle chart's lower table, displaying the user's recorded `cervicalSensation` per day (Dry / Damp shown as "moist" / Wet / Slippery → letters `d / m / w / S`).
- 14 implementation tasks landed on branch `feat/sensation-row` via subagent-driven TDD. Then an in-app preset trial concluded with the user picking **Mode C ("deepen teal")** as the locked hover mode. ~~and **wet-only** as the preferred Wet resting variant~~ — *superseded: the wet-only/`#357d72` direction was later abandoned in favour of a pale Wet chip with a deep frame (spec §13).*
- Modes A and B (and their accent preset table + auto-darken helper) were **stripped** after the lock. ~~The dev switcher now shows only Mode C; the wet-variant sub-dropdown (baseline / wet-only / paired) is preserved for continued iteration.~~ *Superseded: the wet-variant sub-dropdown was removed 2026-07-28. The switcher now shows only the Mode C option + the contrast panel.*
- ~~**Mode C is the locked direction but the design is NOT final.**~~ *Superseded: Mode C's Dry and Wet states are now resolved and all eight letter states pass 4.5:1. What remains is the final cleanup (delete the dev switcher, open the PR) plus the deferred Slippery ring item.*

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
- `app/src/cycle-tracking/CycleChartPage.tsx` — modified: `sensationMap` useMemo, `hasSensation` added to `daysWithDataMap`, offsets shifted (Disturbance `+234→+262`, Notes `+262→+290`, `LOWER_TABLE_PADDING_BOTTOM` `262→290`), Sensation row label at `+234`, Sensation grid block at `+234`, dev switcher import + render. *(The wet-variant trial state was removed 2026-07-28. Line numbers omitted — they drift; grep for the identifiers instead.)*
- `app/src/cycle-tracking/__tests__/sensationRow.test.ts` — 22 vitest cases covering `letterFor`, `restingChip`, contrast helpers (verified WCAG ratios), `modeCResting`, and the Mode C hover dispatcher.

### Dev-only (still active for iteration)
- `app/src/cycle-tracking/SensationPresetSwitcher.tsx` — slimmer floating UI: a single "Mode C · Deepen teal" option in the main dropdown ~~plus the wet-variant sub-dropdown (baseline / wet-only / paired)~~ and the per-state contrast panel. *(Wet-variant sub-dropdown removed 2026-07-28.)* Deleted in the eventual final cleanup commit. **Note:** the contrast panel measures chip **letters only** — it cannot see frame or ring contrast.

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
- `SLIPPERY` → `S` ("Slippery" — highest sensation category; **not** a Peak Day marker, see spec §13)
- `null` → no chip (plain teal tile)

### Resting chip spec (baseline — what's in `RESTING` in `sensationRow.ts`)
| Letter | Chip background | Letter colour | Chip border | Ring |
|---|---|---|---|---|
| `d` | transparent | ~~`#5b8a84`~~ → **`#596b68`** | ~~1 px `#c0ddd8`~~ → **1 px `#596b68`** | — |
| `m` | `#c4e8e2` | `#0f5c54` | 1 px `#9ccfc7` | — |
| `w` | ~~`#62bdb1`~~ → **`#c4e8e2`** | ~~`#ffffff`~~ → **`#0f5c54`** | ~~1 px transparent~~ → **1.5 px `#1e7d72`** | — |
| `S` (resting, used by `restingChip`) | `#0f766e` | `#ffffff` | 1 px transparent | `#0f766e` |

*(Bold = shipped as of 2026-07-28; struck = trial-time value. Spec §13 is authoritative.)*

### Mode C resting Slippery override (in `MODE_C_RESTING_SLIPPERY`)
- Chip: `#62bdb1` (lighter teal)
- Letter: `#062a26` (inky teal)
- Ring: `#62bdb1` (matches chip; tile-coloured 1.5 px gap separates them visually)

### Mode C hover (in `MODE_C_HOVER`) — updated 2026-07-28
- Tile: `#d8f3f0` → `#aee5df` (handled by the grid renderer, not the chip)
- Dry: letter **and** border `#596b68` → **`#4d5f5c`** (≈ 4.85:1 — resolved; was `#5b8a84`/`#5d9c93` at ~2.78:1)
- Damp: fill `#c4e8e2` → `#9bd3c9`, border `#9ccfc7` → `#4a8f82`
- Wet: fill `#c4e8e2` → **`#9bd3c9`**, border `#1e7d72` → **`#135e55`** (1.5 px, letter stays `#0f5c54`) — resolved; was fill `#62bdb1` → `#3f9d90` with a white letter
- Slippery: chip `#62bdb1` → `#0f766e`, ring `#62bdb1` → `#054a44`, letter `#062a26` → `#ffffff`

### ~~Wet variant toggle (live in dev switcher)~~ — REMOVED 2026-07-28

**This toggle no longer exists.** The `baseline` / `wet-only` / `paired` dropdown, its render-time override in `CycleChartPage.tsx`, the `WetVariant` type, and the `cp.sensation.wetVariant` localStorage key were all deleted.

It existed to trial one idea — *"make Wet darker so it stops looking like Slippery."* That question was ultimately answered the opposite way: **keep Wet pale, separate it from Moist with a deep 1.5 px frame.** `RESTING.WET` in `sensationRow.ts` now holds the real shipped design, with no override on top.

Mode C Slippery resting was **not** affected — it remains `#62bdb1` + inky `#062a26` letter + ring, exactly as it rendered under `baseline` and `wet-only`.

The `#357d72` direction is retired. It survives in git history and in spec §13's notes if it is ever wanted back.

### Row geometry (already shipped)
- Row offset: `+234` from chart bottom (between Cervical Fluid block and Disturbance).
- Adjacent shifts: Disturbance `+234 → +262`, Notes `+262 → +290`, `LOWER_TABLE_PADDING_BOTTOM` `262+NOTES → 290+NOTES`.
- Hover/crosshair/tooltip integration verified working — no special wiring needed.

### Contrast policy — updated 2026-07-28
- 4.5:1 hard requirement for every chip letter state (WCAG SC 1.4.3). **All eight states now meet it; the exception list is empty.**
- Frames and rings are graphics, held to the gentler 3:1 bar (SC 1.4.11) only when they carry meaning.
- ~~Resting Dry `#5b8a84` ≈ 3.32:1 exception~~ — resolved, now `#596b68` ≈ 4.83:1.
- ~~Mode C Dry hover ≈ 2.78:1 OPEN~~ — resolved, now `#4d5f5c` ≈ 4.85:1.
- ~~Wet resting / Mode C Wet hover~~ — resolved via the pale-fill design: 5.97:1 / 4.69:1.
- **Still open (deferred, tracked separately):** Slippery resting ring `#62bdb1` on tile `#d8f3f0` ≈ **1.91:1** vs the 3:1 graphics bar. See `docs/superpowers/notes/2026-07-28-slippery-ring-contrast.md`. Moist's frame is also faint (1.31:1) but is decorative and therefore exempt.

---

## ~~Iteration knobs (Mode C refinements available)~~ — RESOLVED, DO NOT APPLY

> **🛑 Knobs 1–3 are done and were resolved differently than proposed here. Applying them now would undo shipped contrast fixes.** Kept only as a record of the options considered.

| Knob | What it proposed | What actually happened |
|---|---|---|
| **1** — Wet variant toggle | Flip baseline/wet-only/paired, then bake the pick into `RESTING.WET.background` | **Toggle deleted.** Wet became pale `#c4e8e2` + 1.5 px frame `#1e7d72`. The `#357d72` direction was dropped. |
| **2** — Wet hover hex (`#1f7065` / `#1a6358` / `#155a50`) | Pick a *darker* fill so hover deepens | **Obsolete.** With a pale fill there is no dark hex to pick. Hover is fill `#9bd3c9` + frame `#135e55`; the *frame* carries the deepening. **Applying `#1a6358` would revert the fix.** |
| **3** — Dry hover letter → `#062a26` | Inky letter on the hover tile | **Not taken.** Dry became a muted teal-grey — `#596b68` resting / `#4d5f5c` hover, with the frame reusing the letter hex. |

### Knob 4: Other Mode C tweaks — partly overtaken
Still genuinely open if you want them:
- Damp hover (`#9bd3c9`) — could go a step darker (note: its letter `#0f5c54` fails below roughly this lightness).
- Slippery hover ring (`#054a44`) — could brighten for a "lighter ring on darker chip" category emphasis.
- Chip border-radius / dimensions (currently 23×17 px, 5 px radius).
- Tile hover tint (`#aee5df`) — would need re-checking every letter and frame ratio against it.

No longer applicable: ~~resting Dry letter exception~~ (resolved), ~~resting Wet letter colour~~ (now `#0f5c54` on pale fill), ~~border width on Wet hover~~ (settled at 1.5 px in both states).

**Higher priority than any of the above:** the Slippery resting ring at 1.91:1 — see `docs/superpowers/notes/2026-07-28-slippery-ring-contrast.md`.

---

## When iteration is done — the final cleanup commit

**Steps 1–6 of the original list are already done** (colours baked in, wet-variant machinery removed, spec updated). What remains:

1. **Delete the entire `SensationPresetSwitcher.tsx` file.**
2. **Remove the switcher import + render** from `CycleChartPage.tsx`. Replace the `useState<PresetSelection>` with a constant or drop it entirely (Mode C is the only option).
3. **Simplify `chipStyleFor`** further if helpful — `HoverMode` could shrink, the `accent` arg could go.
4. **Drop `contrastRatio` / `relativeLuminance`** if no caller remains after the switcher is gone (grep before deleting).
5. **Drop the `localStorage` key** `cp.sensation.preset` (no explicit clear needed — it just becomes unused). `cp.sensation.wetVariant` is already gone.
6. **Run** `npx tsc --noEmit` and `npm test` — both clean. For lint, use `npx eslint <touched paths>` and require **no new diagnostics versus baseline** (see the lint note under "Useful commands"); neither `npm run lint` nor a run over `CycleChartPage.tsx` can ever return zero on this repo.
7. **Visual smoke check** via `wasp start` — chart loads, Sensation row renders, hover works, the dev switcher is gone, DevTools shows no `cp.sensation.*` reads.
8. **Commit** as `chore(sensation-row): strip dev switcher and finalise Mode C`.
9. **Ask the user explicitly** before `git push -u origin feat/sensation-row` and `gh pr create`.

Decide separately whether the Slippery ring item ships in this PR or follows later — it is *not* a blocker. See `docs/superpowers/notes/2026-07-28-slippery-ring-contrast.md`.

<details>
<summary>Original steps 1–6 (completed — kept for the record)</summary>

1. ~~Bake the user's wet variant pick into `RESTING.WET.background`~~ — superseded; Wet got the pale-fill design instead.
2. ~~Apply the locked Knob-2 hex for Mode C Wet hover~~ — superseded; hover is `#9bd3c9` + frame `#135e55`.
3. ~~Apply the locked Knob-3 resolution for Mode C Dry hover~~ — done differently: `#4d5f5c` teal-grey.
4. ~~Apply any other locked Knob-4 changes~~ — none were locked.
5. ~~Remove the wet-variant trial state in `CycleChartPage.tsx`~~ — done 2026-07-28.
6. ~~Remove the wet-variant dropdown + props from `SensationPresetSwitcher.tsx`~~ — done 2026-07-28.

</details>

---

## How to resume in the new chat

> **⚠️ The example prompts in this section were rewritten on 2026-07-28.** The originals told the session to apply `#1a6358` / `#062a26` / wet-only — all superseded. If you have an old copy of this file, ignore its prompts.

**Read spec §13 first** (`docs/superpowers/specs/2026-05-20-sensation-row-design.md`) — it is the source of truth for shipped values. Use this document only for branch context, geometry, and conventions.

Current starting points:

> **Finish the branch:** "Sensation Row is settled — Dry teal-grey, Wet pale + deep frame, all eight letter states pass. Run the final cleanup per the handover's cleanup section (delete the dev switcher, simplify the module). Do not push without my OK."

> **Pick up the deferred item:** "Fix the Slippery resting ring contrast (1.91:1). Read `docs/superpowers/notes/2026-07-28-slippery-ring-contrast.md` first — show me candidate hexes with ratios before applying."

> **Look at the chart again:** "Open cycle 7's chart (test sensation data `d m m w S` on days 13–17) and show me the current Sensation row states."

The new chat should:
1. **Verify branch + HEAD** and read spec §13 before trusting any colour value in *this* file.
2. **Verify exact hexes from `sensationRow.ts`** — several colour values in this document are historical.
3. For each change: make a small, tested change (test-first). Run `npx tsc --noEmit` and the relevant test file.
4. **Verify visually in the running app** whenever a hex changes — and remember the in-app contrast panel measures **letters only**, not frames or rings.
5. **Stop and ask** before any push, PR creation, or final cleanup commit.

---

## Useful commands

- Run a single test file: `cd app && npx vitest run src/cycle-tracking/__tests__/sensationRow.test.ts`
- Full test suite: `cd app && npm test`
- Type-check: `cd app && npx tsc --noEmit`
- Lint touched files: `cd app && npx eslint src/cycle-tracking/sensationRow.ts src/cycle-tracking/SensationPresetSwitcher.tsx src/cycle-tracking/CycleChartPage.tsx`

  **⚠️ Do not use `npm run lint -- <paths>` to scope a lint run.** The package script is `eslint "src/**/*.{ts,tsx}"`, so any paths you append are lint*ed in addition to* the whole glob — it never narrows scope, and it double-counts the files you pass. Call `npx eslint` directly instead.

  **The repo is not lint-clean, and neither are some files this feature touches.** Baseline as of 2026-07-28: **87 errors, 8 warnings across 41 files**, all pre-existing. `CycleChartPage.tsx` alone accounts for **15 errors / 4 warnings** of that — so a lint run over the touched paths will *never* return zero, no matter how clean your edit is.

  **Acceptance criterion: no new diagnostics versus baseline** — not "zero problems".

  Recorded per-file baseline for this feature's files (2026-07-28, `npx eslint <file>` on each):

  | File | Baseline |
  |---|---|
  | `src/cycle-tracking/sensationRow.ts` | **0 problems** |
  | `src/cycle-tracking/SensationPresetSwitcher.tsx` | **0 problems** |
  | `src/cycle-tracking/__tests__/sensationRow.test.ts` | **0 problems** |
  | `src/cycle-tracking/CycleChartPage.tsx` | **19 problems (15 errors, 4 warnings)** — all pre-existing |

  `CycleChartPage.tsx` baseline **by rule** — this is what to compare against, not the total:

  | Count | Rule |
  |---:|---|
  | 11 | `@typescript-eslint/no-unused-vars` (error) |
  | 3 | `react-hooks/exhaustive-deps` (warn) |
  | 2 | `no-undef` (error) |
  | 1 | `react-hooks/set-state-in-effect` (error) |
  | 1 | `react-hooks/refs` (error) |
  | 1 | *no ruleId* — unused `eslint-disable` directive (warn), `CycleChartPage.tsx:104` |

  That last one has `ruleId: null`, so it prints as `null` under a naive `.ruleId` query — the command below labels it from its message instead. It is **not** a parser or fatal error (a fatal would carry `fatal: true`); it is ESLint reporting a `disable` comment that no longer suppresses anything.

  **How to judge the result — counts are never sufficient:**

  - **Lower than baseline is fine, and good.** If your change legitimately removes a diagnostic, the count drops. That is a pass, not a discrepancy to explain away. Update the table when it happens.
  - **Equal counts are only a sanity check, never proof.** One pre-existing diagnostic disappearing while a new one appears leaves the total unchanged.
  - **Per-rule counts are not enough either.** 11 of the 19 baseline diagnostics are the *same rule* (`no-unused-vars`), differing only by which identifier is unused. Swapping one for another leaves a per-rule histogram byte-identical. Demonstrated: an unused `alpha` and an unused `beta` produce the same histogram, and differ only once the message is included.
  - **The criterion: compare full diagnostic identity** — severity + ruleId + message — not counts at any granularity.

  **Identity = severity + ruleId + message + normalized source snippet.** Getting this right needs two opposing corrections:

  - **Numeric coordinates must be excluded.** Some rules (`react-hooks/refs`, `set-state-in-effect`) embed the absolute path, `line:col`, *and* a code frame directly in the message text. Keeping those means any unrelated edit that shifts line numbers reports every one of them as removed-and-re-added. Observed live: deleting 24 lines from `CycleChartPage.tsx` produced exactly that false failure.
  - **But the message alone is too weak.** Those same rules have generic text — every `set-state-in-effect` violation reads identically. Strip the coordinates and a violation removed in one place while an identical-rule violation appears elsewhere becomes indistinguishable, which false-passes.

  The fix is to append the **source line at the diagnostic's location, whitespace-normalized** — stable identity without line-number fragility. Verified both ways: the 24-line shift now compares identical, while two `set-state-in-effect` violations at different sites are correctly distinguished by their snippets (`setA(v)` vs `setB(v)`).

  Messages are compared **in full — never truncated**. Four baseline messages exceed 120 characters (`react-hooks/refs` runs to 1113), and two `exhaustive-deps` entries both open with "React Hook useMemo has…", so any prefix cut risks collapsing distinct diagnostics.

  Building the snippet requires reading the source file, which `jq` cannot do, so that step lives in **`app/scripts/lint-identity.js`** (committed alongside this doc — read its header comment for the full rationale).

  ```bash
  diagnostics() {  # $1 = path relative to app/ ; one line per diagnostic, sorted
    npx eslint "$1" -f json 2>/dev/null | node scripts/lint-identity.js
  }
  ```

  **Do not add `set -o pipefail` here.** ESLint exits **1 whenever it finds any problem**, which is the normal case for `CycleChartPage.tsx` — with `pipefail` the function would return 1 on a perfectly good run and `|| exit 1` would abort every time. Without it, the pipeline's status is the *last* command's, i.e. the identity script's, which is exactly the signal wanted: `0` on a real run (however many diagnostics), `1` only when ESLint never analysed the file. Verified: real file → 19 lines, status 0; clean file → 0 lines, status 0; wrong directory → `FATAL`, status 1.

  Compare with `comm`, **not `diff`** — `diff` fails on *any* difference, so it would reject a legitimate fix that removes a diagnostic, contradicting the "lower is fine" rule above. Only additions may fail the check; removals are reported and pass:

  ```bash
  compare() {  # $1 = before.txt  $2 = after.txt   (both sorted by diagnostics())
    local added removed                      # declare separately: `local x="$(...)"` masks the exit status
    [ -r "$1" ] && [ -r "$2" ] || { echo "FATAL: cannot read '$1' or '$2'" >&2; return 1; }
    removed="$(LC_ALL=C comm -23 "$1" "$2")" || { echo "FATAL: comm failed on '$1' / '$2'" >&2; return 1; }
    added="$(LC_ALL=C comm -13 "$1" "$2")"   || { echo "FATAL: comm failed on '$1' / '$2'" >&2; return 1; }
    if [ -n "$removed" ]; then
      echo "Removed (fine — a genuine fix; update the baseline):"
      printf '%s\n' "$removed" | cut -c1-100 | sed 's/^/  - /'
    fi
    if [ -n "$added" ]; then
      echo "NEW DIAGNOSTICS INTRODUCED:" >&2
      printf '%s\n' "$added" | cut -c1-100 | sed 's/^/  + /' >&2
      return 1
    fi
    echo "No new diagnostics."
  }
  ```

  Two things that silently defeat this if omitted:

  - **`comm`'s exit status must be checked.** Without it, two unreadable or missing files make `comm` print an error to stderr while both variables come back empty — so the function announces "No new diagnostics" and returns 0. Confirmed by running it against two nonexistent paths.
  - **`local` must be declared on its own line.** `local x="$(cmd)"` always returns 0 (it is `local`'s status, not the command's), so a `||` guard attached to that form never fires.

  The `cut -c1-100` affects only what is *printed*; the comparison itself always uses full untruncated lines.

  `LC_ALL=C` on both `sort` and `comm` keeps their collation consistent — otherwise `comm` can silently misreport on locale-sorted input.

  Usage — **check the return status**, and let a failure stop the run:

  ```bash
  cd app
  diagnostics src/cycle-tracking/CycleChartPage.tsx > after.txt || exit 1
  # ...restore the baseline version of the file...
  diagnostics src/cycle-tracking/CycleChartPage.tsx > before.txt || exit 1
  compare before.txt after.txt || exit 1
  ```

  Verified behaviour (probe file, same rule throughout):

  | Change | Result |
  |---|---|
  | Swap `alpha` → `beta` (same rule) | reports both removal and addition, **status 1** ✓ |
  | Remove `alpha`, add nothing | reports removal, **status 0** ✓ |
  | No change | "No new diagnostics", status 0 ✓ |
  | Real file across an 11-line shift | "No new diagnostics", status 0 ✓ (no location false alarm) |
  | Run from repo root | `FATAL`, status 1 ✓ |

  `CycleChartPage.tsx` must yield exactly **19 lines**; the three sensation-owned files must yield **0 lines** while still returning status 0.

  **⚠️ Why the checks are shaped this way.** Each guard exists because an earlier version of this recipe produced a false pass. Kept as a record so they are not "simplified" back out:

  1. **Validate the run, not the output emptiness.** An early version tested `[ -s file ]` and merely `echo`ed a warning — but `echo` exits 0, so a script continued and `diff`ed two empty files, which also succeeds. Emptiness is the wrong signal anyway: a genuinely clean file *should* produce no lines, so treating that as an error would fail the three sensation-owned files forever. `lint-identity.js` instead checks that ESLint actually returned a result for the file, and exits **1** when it did not.
  2. **Never emit a weakened identity.** The snippet comes from ESLint's own `source` field rather than a re-read of the file. An earlier version read from disk and swallowed failures, emitting blank snippets — which silently collapses generic same-rule diagnostics and restores the very false pass the snippet was added to prevent. The script now exits **1** if diagnostics exist without source, or if a diagnostic's line falls outside it.
  3. **Propagate failure to the caller.** Every guard exits non-zero, so `|| exit 1` at the call site aborts. See the pipefail note above for why the pipeline's status is the script's, not ESLint's.

  Verified statuses: real file → 19 lines / 0 · clean file → 0 lines / 0 · wrong directory → `FATAL` / 1 · diagnostics with unreadable source → `FATAL` / 1 · line outside source → `FATAL` / 1 · malformed JSON → `FATAL` / 1.

  **⚠️ Do not baseline by stashing.** `git stash --include-untracked` is unsafe in this repo: root `node_modules/` is **not** gitignored (only `app/node_modules` is), so it gets swept along with screenshots and logs — slow, and it can conflict on `stash pop`. If you must re-derive a baseline live, stash only the specific tracked files and never touch untracked ones:

  ```
  git stash push -- app/src/cycle-tracking/<file>   # narrow; leaves untracked files alone
  ```

  Better still, read the pristine version without mutating the worktree at all:

  ```
  git show HEAD:app/src/cycle-tracking/<file>       # inspect the baseline source directly
  ```
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
- **FAM charting conventions** — letter codes + colour stamps over pictograms; the best-quality observation gets emphasis. (User memory: `reference_fam_charting_conventions.md`.)

---

## Recap (for context — skim if you know the history)

1. **Brainstormed visual language** — settled on letter + coloured stamp after rejecting pictograms (droplets / fill meters / waves) once research showed authoritative FAM apps use letter codes + coloured stamps.
2. **Picked colour family** — teal (`#d8f3f0` resting tile, `#aee5df` hover tile).
3. **Three candidate hover modes** were spec'd: Mode A (accent fill), Mode B (accent outline), Mode C (deepen teal).
4. **WCAG AA 4.5:1 contrast policy** added during review iterations. Closed exception list initially had 3 entries; the in-app trial narrowed it.
5. **In-app preset trial** — user toggled through 21 presets × 3 wet variants and picked **Mode C** (+ wet-only at the time; the wet-variant part was later abandoned — see the superseded banner at the top).
6. **Mode A and Mode B stripped** from code + tests + spec after the lock (this is the current state).
7. **Remaining work: Mode C iteration** — refining hover hexes, contrast resolutions, etc. — captured as Knobs 1–4 above. Final cleanup is the eventual end state, not the first move in the new chat.
