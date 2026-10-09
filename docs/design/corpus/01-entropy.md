# 01. Design entropy: what it is here, how it grows, and the ratchet

## The rule

Design entropy is the number of ways the product spells one idea. Two
recipes for a section label, four durations for a sheet opening, ten z-index
layers for five documented ones: each is a small local decision that was
reasonable on its own and reads as a different product in the whole. It grows
by one mechanism, four times over: a local fix instead of the primitive, a
sibling component instead of a prop, a new variant instead of a tone, and a
convention that nobody guards. It never shrinks on its own.

So the rule has two halves. **One capability, one system, extended in place**
(the root `AGENTS.md`, "The house systems", and
[ADR-013](../../DECISIONS/013-one-system-per-job.md)). And **every count that
can grow is fenced**: a number that can rise with no build failing will rise.
Where a guard can ban a thing, it bans it. Where it can only count, it holds a
baseline, and the baseline moves in one direction, down, after a sweep, by
hand.

## Learned from

The repository's own history, in the order it was swept:

- **2026-08-21, type.** 2,154 bracket-literal text sizes across 28 distinct
  px values against a nine-token scale; six eyebrow recipes on Home alone;
  about 660 icon sites at 20 ad hoc sizes with stroke ignoring size
  (`DESIGN_SYSTEM.md`, Typography and Iconography; ADR-013). Swept onto the
  role tokens and `<Eyebrow>`, then fenced by `scripts/check-type-tokens.mts`.
- **2026-09-13 and 2026-09-17, the ink hierarchy.** Two spellings of the same
  three colour channels (`text-strong/muted/faint` classes and
  `text-ink*` tokens) with 23 and 21 call sites each, while 185 of 257
  component files used neither and stayed on 2,367 `text-white/NN` sites
  carrying 31 distinct opacities. One spelling won; the sweep collapsed the
  vocabulary without moving the render (`DESIGN_SYSTEM.md`, the keystone
  convention). Fenced by the same guard.
- **2026-09-17, the icon stroke.** One stylesheet rule set `stroke-width`
  and silently overrode every call site; icons rendered 0.75px at 12px against
  an intended constant 1.75. Fenced by `scripts/check-icon-stroke.mts`.
- **2026-09-23, page titles.** Twelve files carried four recipes for the
  same heading, three of them at 24px, which is not on the scale. One recipe
  now: `shared/SurfaceHeader`.
- **2026-10-09, this corpus.** A read of `src/` found the next generation
  growing with no fence: the ledger below.

The pattern each time: the sweep was the easy half. What kept it swept was
the guard written the same day. Nothing in this repository has stayed clean
on convention alone.

## Held by

`scripts/check-design-entropy.mts` (CI, since 2026-10-09), the ratchet. It
walks `src/`, counts each ledger row below, and compares it to
`scripts/design-entropy.baseline.json`. A count above its baseline fails the
build and names the values or the files. A count below passes and prints the
line to lower the baseline to. `--report` prints the ledger and exits 0,
which is what the quarterly read runs. It was proved able to fail before it
shipped: with a zero baseline it named every file; with one planted
`transition-all` it failed on exactly that row.

The rows that already have a ban rather than a baseline are not repeated
here: bracket text sizes and the legacy ink spelling
(`check-type-tokens`), direct lucide imports and text glyphs as chrome
(`check-icons`), CSS stroke width (`check-icon-stroke`), a fixed colour under
adaptive text (`check-theme-tokens`), a bare `formatDistanceToNow`
(`check-safe-dates`), truncation in content (`check-editorial-text-integrity`).

## Measured by

The ledger, measured 2026-10-09 on `main` at `da789c6`, which is the first
baseline:

| Row | Mode | Count | What it means |
|---|---|---|---|
| `durations` | distinct | 18 | motion durations in use outside the ten `--dur-*` tokens: 100, 120, 150, 180, 200, 220, 300, 700, 800ms and nine more, against five that a scale needs (`05-motion.md`) |
| `easings` | distinct | 1 | one curve outside the three tokens, `cubic-bezier(0.2,0.8,0.2,1)`, written two ways in `SwipeCard` and `BottomSheet` |
| `transition_all` | occurrences | 33 | in 15 files; animates every property, which is the jank on a phone |
| `z_values` | distinct | 10 | `z-[60]` to `z-[125]` against the five layers `DESIGN_SYSTEM.md` names |
| `min_h_values` | distinct | 28 | phantom heights, 229 uses; `min-h-[44px]` alone is 81 of them and is the one with a reason (`.tap-44`) |
| `bg_white_values` | distinct | 19 | the second generation of opacity soup, 650 uses |
| `border_white_values` | distinct | 15 | 459 uses |
| `hardcoded_colour` | occurrences | 56 | hex or `rgb()` in tsx outside the eight allowlisted brand and drawing files; `#102017` is 36 of them, all in the content composer and the fact-check strip |
| `inline_style` | occurrences | 60 | in 36 files |

Also measured, not yet fenced because the fence would be a different kind of
guard: seven radius scales in use (`rounded-xl` 257, `rounded-full` 243,
`rounded-lg` 211, `rounded-md` 194, bare `rounded` 176, `rounded-2xl` 107,
`rounded-3xl` 24, while the Relume radius tokens see 22 uses between them);
no spacing scale at all; 45 orphaned files in
[`ORPHANED-COMPONENTS.md`](../../ORPHANED-COMPONENTS.md) from 2026-08-13 plus
six mobile components with no importer today (`HealthStrip`, `TeamStrip`,
`BlockerCard`, `SynthesisLine`, `SkeletonLine`, `Logomark`); and the
`components/shared/index.ts` barrel exporting 7 of 50 files.

## Open

In order of blast radius, smallest first. Each is a sweep of its own with the
baseline lowered in the same commit; none is in the commit that created this
file.

1. **The one off-token easing.** Two lines. Replace with `--ease-out-soft` and
   lower `easings` to 0.
2. **`transition-all`.** Thirty-three lines in fifteen files; each becomes the
   property it meant (`transition-colors`, `-transform`, `-opacity`). Lower to 0
   and the row becomes a ban.
3. **The duration scale.** Add the five-step scale to `tailwind.config.js`
   `transitionDuration` (`05-motion.md`), map the 18 values onto it, lower the
   row to 0.
4. **z-index.** Name the five layers as tokens, move the ten literals onto
   them, lower to 0.
5. **Hardcoded colour.** The 36 `#102017` sites are one paper-ink token.
6. **Opacity soup, second generation.** The same nearest-anchor sweep that
   collapsed `text-white/NN` on 2026-09-17, applied to `bg-white/[…]` and
   `border-white/[…]`, onto the `.surface` material and a hairline token.
7. **Phantom heights.** Everything that is not `.tap-44` or a sheet floor.
8. **Radius and spacing scales** (`06-consistency.md`), and the orphan list.
