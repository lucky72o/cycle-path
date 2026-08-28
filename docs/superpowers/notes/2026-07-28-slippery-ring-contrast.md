# Note: the Slippery "S" ring is faint — worth a look later

**Date:** 2026-07-28
**Branch it came from:** `feat/sensation-row`
**Status: ✅ RESOLVED 2026-07-30.** The ring was deepened from `#62bdb1` to
**`#33857a`**, taking it from 1.91:1 to **3.77:1** against the tile — clear of the 3:1
bar. This was "option 1" below: darken the ring only, leaving the chip, letter, and
geometry untouched.

Kept as the reasoning record — it explains what the problem was, why the ring is held to
3:1 rather than 4.5:1, and which alternatives were rejected. **Everything below describes
the problem as it stood before the fix**; read it as history, not as an open task.

Two candidates were rejected: `#2c7c71` (4.26:1) because the darker band began to outweigh
the chip it surrounds, and `#257368` (4.82:1) because its luminance falls within 0.005 of
the Slippery *hover* chip `#0f766e`, which would have made resting and hover read alike.

This note is written in plain language so you can read it cold months from now, or paste
the whole thing into a new Claude session as the starting brief.

---

## The one-sentence version

Slippery days get a thin ring drawn around the chip to make the highest sensation category
stand out, but that ring is a very similar lightness to the background it sits on — so it's
easy to miss, especially on a dim screen or for someone with low vision.

---

## What you're actually looking at

In the Sensation row, each day gets a small rounded chip with a letter in it:

- `d` = Dry
- `m` = moist (Damp)
- `w` = Wet
- `S` = Slippery — the **highest / best-quality sensation category**

Because Slippery is the strongest category, it gets extra emphasis: as well as the letter
`S`, the chip has a **ring** drawn around the outside of it — like a halo, separated from
the chip by a thin gap.

That ring is the thing this note is about.

> **Important — the ring is not a "Peak Day" marker.** Every day recorded as Slippery gets
> its own ring, independently. In Sensiplan the *mucus peak* is the **last** day with the
> individually best mucus quality, and it can only be identified **retrospectively**, once
> the quality drops off again. So if you record Slippery on days 13 and 14, both get rings,
> but only day 14 would be the Peak Day. This app does **not** compute the mucus Peak Day
> anywhere — the row is a faithful display of what was observed each day, nothing more.
> (The `risingPeakDays` code in `CycleChartPage.tsx` is about the *temperature* shift and is
> unrelated.) If a real Peak Day marker is ever wanted, that is a separate feature.

---

## What the issue is

The ring is the colour `#62bdb1` (a medium teal). The tile behind it is `#d8f3f0` (a very
pale teal). Those two are close in lightness.

Measured properly, the difference between them is **1.91:1**.

The usual guideline for a shape or line that carries meaning is **at least 3:1**. So the
ring is well under the bar — a bit over half of what it should be.

Practically: on a good monitor in a well-lit room, you can see the ring fine. On a phone in
sunlight, on a dimmed laptop, or if your eyesight isn't sharp, the ring can fade into the
background and the Slippery day stops standing out.

Note this only affects the **resting** state (when you're not hovering). As soon as you
hover that day, the chip turns dark teal and the ring becomes a deep colour — that version
measures **7.28:1**, which is completely fine. So it's specifically the "just looking at the
chart normally" state that's weak.

---

## Why it wasn't fixed at the time

Two honest reasons:

1. **It isn't the only signal.** The `S` letter itself is perfectly legible (6.90:1), so
   nobody is going to *miss* which day is Slippery — they just lose the extra "this is the
   strongest category" punch that the ring is supposed to add. The ring is reinforcement,
   not the sole message.

2. **It wasn't the job at hand.** This surfaced while fixing the Wet chip. The Slippery
   design had already been reviewed and approved, and changing an approved design in the
   middle of an unrelated fix is how things quietly drift. Better to note it and decide on
   it deliberately, on its own.

---

## Some background that makes this easier to reason about

There are two different standards in play, and they have different bars:

- **Text** (the letters `d m w S`) needs **4.5:1**. All eight of our letter states now pass.
- **Shapes and lines** (frames, rings) only need **3:1** — a gentler bar, because a shape is
  easier to make out than a letterform.

The ring is a shape, so 3:1 is its target. It's at 1.91.

For comparison, the moist chip's thin outline is also faint (1.31:1) — but that one is fine
and doesn't need fixing, because it's purely decorative; the letter and the fill colour do
all the work. The Slippery ring is different because it exists *specifically* to signal
something (that this is the highest sensation category), which is what pulls it under the
rule.

---

## Options if/when you pick this up

Roughly in order of how small the change is:

1. **Darken the ring only.** Keep the chip exactly as-is, make the ring a deeper teal so it
   reads clearly against the pale tile. Smallest possible change; the chip you approved
   stays untouched.
2. **Thicken the ring.** A wider ring is easier to see even at the same colour. Doesn't fix
   the measurement, but genuinely helps perception.
3. **Both** — slightly darker and slightly thicker, each nudged a little rather than one
   pushed a lot.
4. **Decide it's decorative and leave it.** Defensible: the `S` already identifies the day.
   If you go this way, write it down as a deliberate exception so it doesn't get
   re-litigated every few months.

My suggestion would be option 1 — it's the smallest change that actually resolves it, and
it leaves the approved chip design alone.

One thing to watch: whatever colour you pick shouldn't collide with the deep teal `#0f766e`
already used for the Slippery *hover* chip, or the resting and hover states start looking
like each other.

---

## Where the relevant code lives

- The ring colour is `ringColor` in `MODE_C_RESTING_SLIPPERY`, in
  `app/src/cycle-tracking/sensationRow.ts`.
- The ring is drawn as two stacked `box-shadow` rings in the chart's grid renderer
  (`app/src/cycle-tracking/CycleChartPage.tsx`) — the inner one is tile-coloured to create
  the gap, the outer one is the visible ring.
- Tests: `app/src/cycle-tracking/__tests__/sensationRow.test.ts`.
- Design spec: `docs/superpowers/specs/2026-05-20-sensation-row-design.md` (see §13).

## The numbers, for reference

| | Colour | Sits on | Measures | Target |
|---|---|---|---|---|
| Slippery ring — resting *(was)* | `#62bdb1` | tile `#d8f3f0` | **1.91:1** ✗ | 3:1 |
| Slippery ring — resting *(now)* | `#33857a` | tile `#d8f3f0` | **3.77:1** ✓ | 3:1 |
| Slippery ring — hover | `#054a44` | hover tile `#aee5df` | 7.28:1 | 3:1 ✓ |
| Slippery letter — resting | `#062a26` | chip `#62bdb1` | 6.90:1 | 4.5:1 ✓ |

---

## Heads-up: the app's own contrast panel won't show this

While iterating there's a dev-only panel in the corner of the chart listing contrast for
each state. It only measures **letters**, not rings or frames. It will happily show ✓ for
every row while this ring sits at 1.91 — so don't take an all-green panel as proof that
everything passes.
