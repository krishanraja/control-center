# 05. Motion: one curve family, one duration scale, and what never moves

## The rule

**Everything that moves, moves on one physical sensibility.** The signature
curve is the calm sheet curve, a fast confident departure that settles softly
and never bounces. There are three easings and no fourth: `--ease-calm`
(base), `--ease-out-soft` (arrivals), `--ease-spring` (press, commit, sheet
settle, the one tactile overshoot). A raw `cubic-bezier` in a component is a
defect even when it looks right.

**One duration scale.** Today there are ten `--dur-*` tokens for named
gestures and 18 other durations scattered through classes and inline
styles. The scale to converge on is five steps plus the ambient set:

| Step | ms | For |
|---|---|---|
| instant | 0 | a state change that must not be seen moving (a toggle's ink, a selected chip) |
| quick | 120 | hover, focus ring, a chip lighting |
| base | 200 | most transitions: colour, opacity, a small translate |
| soft | 340 | a sheet or overlay blooming (`--dur-scale`) |
| slow | 550 | content arriving from below, the check drawing itself (`--dur-rise`, `--dur-draw`) |

The ambient set keeps its own clocks because they are not transitions:
`--dur-halo` 5s, `--dur-orbit` and `--dur-breathe` 2.6s, `--dur-skeleton`
1.7s, `--dur-indeterminate` 1.6s, `--dur-exhale` 0.7s, `--dur-app-enter`
0.6s. The scale is exposed to Tailwind as `transitionDuration` so a class can
be on it; a `duration-N` that is not a step is off the scale.

**The gesture vocabulary** is eight words, each meaning one thing
(`src/index.css`, "the motion system"): *rise* (content arrives from just
below), *scale-in* (an overlay blooms from 96%), *exhale* (the all-clear
breathes open, once), *halo* (the one focal thing has a slow living breath;
the rest recedes), *orbit* (the system is thinking for you), *breathe* (the
mark's held breath while working), *indeterminate* (the honest progress
rail), *draw* (the completion check). Stagger is `.stagger-1` to `-5` or
`staggerDelay()` in `shared/motion.ts`, never a hand-typed delay.

**What never animates.**

- Two things at once in one viewport region (restraint rule 7).
- Anything under 200ms of real latency: no spinner, no skeleton, no dim.
- The card hero. In card layout the hero is the screen and nothing on the
  screen moves on its own; only the bar hero breathes.
- `animate-spin`. It runs on a clock no dial can reach and is suppressed
  under reduced motion; `Working` is the one busy mark.
- Every property. `transition-all` is banned: name the property.
- `transform` in a keyframe. Keyframes write `translate` and `scale`, because
  Tailwind's positioning lives on `transform`.
- A backdrop blur on the phone scrim; the ambient field animates under it
  forever and the blur re-renders the viewport every frame.

**Reduced motion kills everything**: transition duration to 0.001ms, active
scale off, smooth scroll off, the ambient field static. State changes still
land in their final state. Low capacity calms the clocks rather than
intensifying anything.

**Route changes are transitions, not loads.** A tab switch is a React
transition and every chunk is warmed in idle after boot, so the tap never
blocks and the skeleton never flashes; the bottom nav highlights the tapped
tab immediately rather than waiting on the route.

## Learned from

- **2026-08-30 onward, the loading ladder** (`DESIGN_SYSTEM.md`, "Loading"):
  a skeleton painted for 60ms reads as a rendering bug, so nothing shows under
  200ms; the rung is chosen by measured latency, never by how important the
  wait feels.
- **2026-09-26, the sideways sheet.** A keyframe wrote `transform` and
  stripped the sheet's horizontal centring; it rose half off-screen and
  snapped on landing. Keyframes use `translate` and `scale` now
  (`e2e/sheet-motion-phone.spec.ts`).
- **2026-10-04, the card hero does not breathe.** Growth's move card is the
  screen; a breathing halo on the whole screen was motion with no focal point
  (`DESIGN_SYSTEM.md`, "Growth, one move at a time").
- **2026-10-09, the ledger.** 18 distinct durations outside the tokens
  (100, 120, 150, 180, 200, 220, 300, 700 and 800ms among them); one
  off-token curve, `cubic-bezier(0.2,0.8,0.2,1)`, written two ways in
  `shared/SwipeCard.tsx` and `mobile/BottomSheet.tsx`, both of which are the
  `--ease-out-soft` shape by intent; 33 `transition-all` in 15 files; no
  `transitionDuration` scale in `tailwind.config.js`. None of it is wrong on
  its own line. Together it is three motion systems.

## Held by

- `scripts/check-design-entropy.mts` (CI): the `durations`, `easings` and
  `transition_all` rows cannot rise above their baselines.
- `e2e/sheet-motion-phone.spec.ts`: the sheet lands centred.
- Reduced motion, the `--dur-*` block and the low-capacity override:
  `src/index.css`, and `useReducedMotion` in `shared/motion.ts` for anything
  animated from JS. Review only, with the CSS as the single place to look.
- The gesture vocabulary and the "never animates" list: **review only.**

## Measured by

- `durations`: 18 distinct on 2026-10-09. Target: 0 outside the scale.
- `easings`: 1 off-token. Target: 0.
- `transition_all`: 33. Target: 0, after which the row becomes a ban.
- Read all three with `npx tsx scripts/check-design-entropy.mts --report`.

## Open

1. **Retire the off-token curve**: two lines, `--ease-out-soft`.
2. **Ban `transition-all`**: 33 lines become the property they meant.
3. **Ship the five-step scale** in `tailwind.config.js` `transitionDuration`
   and map the 18 values onto it; then the `durations` row is a ban.
4. **Stagger by hand**: count hand-typed `animation-delay` and `setTimeout`
   reveals and move them onto `staggerDelay()`. Not in the ledger yet.
