# ADR-010: Vendor Relume's primitives, reject its design system

- **Status:** Accepted
- **Date:** 2026-08-11
- **Supersedes:** nothing. Amends [ADR-007](./007-obsidian-aurora-design-system.md).

## Context

The app had no primitive layer. 229 component files composed Tailwind class
strings with template literals and array-joins, which meant:

- No `cn()`. A caller could not reliably override a base class, because the last
  conflicting utility in the string won rather than the one the caller passed.
- 21 hand-rolled `fixed inset-0` overlays, 11 with no dialog role: no focus
  trap, no scroll lock, no focus restoration, nothing announced to a screen
  reader.
- Four hand-rolled tab switchers, two with no tab semantics at all.
- Button colour defined in `shared/Pressable.tsx`, again in
  `growth/atoms.tsx`, and again inline in most panels.

`@radix-ui/react-dialog` and `react-popover` had been in `package.json` for
months and were imported nowhere.

Relume's MCP server offers shadcn-style components: you take the source, you own
the files, there is no runtime dependency on the vendor.

## Decision

Take Relume's **primitives**. Reject its **design system**.

Specifically, do NOT install:

- **`@relume_io/relume-tailwind`.** The preset replaces
  `theme.gradientColorStops` and ships its own `scheme-*`, `text-h1..h6` and
  `rounded-*` scales. `tailwind.config.js` already remaps `white` to the `--fg`
  channel, which is the single mechanism making ~2,700 existing `text-white/NN`
  and `bg-white/NN` utilities theme-adaptive. Two token systems would fight, and
  the incumbent one is load-bearing. The handful of names Relume's vendored code
  references are aliased onto the Aurora channels instead, so vendored files
  compile unmodified.
- **`relume-icons`.** `index.css` forces `stroke-width: 1.5px` on round-capped
  `fill=none` SVGs, and `lucide-react` is the house set. A second icon set is
  churn with no benefit.
- **`tailwindcss-animate`.** Relume's `data-[state=open]:animate-in` classes
  would compile to nothing. The primitives use the existing `index.css`
  keyframes, which are already switched off under `prefers-reduced-motion`.

## Consequences

**Good.** `cn()` exists, so `className` on a primitive means something.
Overlays get a focus trap, scroll lock and focus restoration from Radix rather
than from eleven separate hand-rolled attempts. Button colour has one
definition. Accessibility improved measurably: overlays with no dialog role went
14 to 0.

**Cost.** Four new dependencies (`clsx`, `tailwind-merge`,
`class-variance-authority`, `@radix-ui/react-slot`) plus Radix packages per
primitive, and the first variant abstraction (`cva`) in a codebase that had
none.

**Constraint this creates.** Vendored files are re-skinned at vendor time, not
consumed as-is. Anything pulled from Relume in future gets the same treatment:
rewrite `bg-white`/`text-white` (they resolve to `--fg`, not white), move accent
foregrounds to shade 200 (300 and up are fixed dark-tuned hexes), swap
`relume-icons` for lucide, and drop `"use client"`.

**Boundary.** `ui/` sits BENEATH `shared/`. ADR-007's rule stands: do not
hand-roll a card, button, pill or hero. `Pressable`, `HeroCard`, `SwipeCard` and
`DoThisNextHero` keep their public API and are implemented on top of `ui/`.

## Alternatives rejected

- **Install the full Relume preset.** Would have required unpicking the `--fg`
  remap across 2,700 utilities.
- **shadcn/ui directly.** Same primitives, but Relume's MCP server also supplies
  application-UI section structures (stacked lists, tables, page headers) that
  were useful as reference for the Network rebuild.
- **Write the primitives from scratch.** The focus-trap and roving-focus code is
  not the hard part; not getting it subtly wrong is. Radix has already got it
  right.
