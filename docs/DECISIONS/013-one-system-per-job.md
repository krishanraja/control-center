# 013 — One system per job: the phone-first recomposition locked as canon

**Date:** 2026-08-22 · **Status:** accepted · **Driver:** Krish, across one
session: "Cleanliness of the visual UI is absolutely everything… it feels
like there are tonnes of fonts all belonging to different design systems";
"There should just be one system that I create new actions with"; "make the
iconography a more premium look and feel across the entire control centre";
"plain english… able to be understood by a 12 year old"; "why do both of
these experiences feel so tough and clunky and old school?… does this belie
a systemic issue across the entire tool?"; and finally: "ensure that any
future edits enrich the stable systems locked as canon as opposed to
creating duplicate systems, or features, or variations."

## Context

The tool had grown by accretion: 2,154 bracket-literal text sizes across 28
values, ~660 icon sites at 20 ad-hoc sizes with stroke ignoring size, six
eyebrow recipes on one page, three ways to create things per tab plus a
floating capture dial, native `<select>`s carrying two options, edit rows
that pushed Save off the edge of a phone, and a fixed no-scroll shell that
did not know the on-screen keyboard existed. Each surface was locally
reasonable; together they read as different products. The systemic diagnosis
Krish asked for confirmed it: the write side of the app had been designed as
desktop CRUD and shrunk.

## Decision

One capability, one system, guarded where a guard can see it. Future edits
extend these in place; a sibling variant, local re-implementation, or one-off
style is a defect even when it works.

1. **Type:** nine role tokens (`text-micro`…`text-hero`, 11–56px) and one
   `<Eyebrow>` label recipe (`tracking-[0.14em]`). Guard:
   `scripts/check-type-tokens.mts` (CI).
2. **Icons:** every glyph ships through `src/lib/icons.tsx` — lucide wrapped
   once with `absoluteStrokeWidth` at 1.75px so line weight is physically
   constant across sizes, sizes snapped to 12/14/16/20/24/32; active chrome
   steps to 2.25. Circled icons are `shared/IconTile`. No emoji or text
   glyphs as chrome. Guard: `scripts/check-icons.mts` (CI).
3. **Create:** on a phone, ONE violet + button per tab opening `CreateSheet`,
   tab actions first, global captures after; tab-owned flows are reached over
   the `src/lib/quickCreate.ts` bus. The capture speed dial and per-tab
   inline create buttons are gone on narrow viewports.
4. **The write side:** editing text on a phone opens `shared/FocusedEditor`
   (text shown whole, voice beside the keyboard, one full-width Save,
   destructive action behind "…" with an arming tap); the dialog layer
   applies `useKeyboardInset` so every bottom sheet rides above the keyboard;
   small-set choices are chips (`OptionChips` / `ServesPicker` /
   `VentureChips`), never a native `<select>`; chips never wrap or centre.
5. **Copy:** plain English in complete sentences, no stacked fragments, no
   insider metaphors, no em dashes; product nouns kept. Loading strings only
   in `loadingVoice.ts`.
6. **Surface recompositions riding on those systems:** Content mobile leads
   with a finite Queue deck beside the Built/Paid/Library rooms; Home carries
   a `FocusDoor` row instead of a Focus link inside the vitals; Growth's
   phone view leads with one line and collapses each touchpoint to a
   readable row; the Focus tab never truncates its purpose line; People
   opens on the Network lane.

## Alternatives considered

- **Keep conventions in review, not code** — rejected: every one of these
  had already drifted under review; the type and icon sweeps found the
  drift measured in thousands.
- **A component library package** — rejected: the primitives are product
  code co-located with the app; a package boundary adds release friction
  with no second consumer.
- **Lint rules instead of bespoke guards** — partially taken: the guards run
  as scripts because the invariants (one goal editor, physical stroke, role
  tokens) are structural, not syntactic.

## Consequences

- Positive: two device classes and both themes stay coherent from single
  points of change; a phone edit is now a sheet, not a squint; CI fails the
  recognisable regressions (`check-type-tokens`, `check-icons`,
  `check-goal-ladder`, `check-goal-gate`).
- Negative: the canon list must be maintained — root `AGENTS.md` ("The house
  systems"), `DESIGN_SYSTEM.md` and `CONTRIBUTING.md` all point at the same
  primitives and must move together.
- Neutral: a handful of pre-primitive overlays remain (named in
  `COMPONENTS.md`); they migrate when touched.

## Follow-ups

- Migrate the legacy hand-rolled dialogs (DesktopContent schedule/sweep,
  `IdeaCaptureModal`) to `shared/Modal` when next touched.
- Fix `check-content-taxonomy`'s failing baseline, then wire it into CI.
- The keyboard inset is unverifiable headless; sanity-check on a real phone
  when sheets change.
