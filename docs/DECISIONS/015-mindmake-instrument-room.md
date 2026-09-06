# ADR-015: Mindmake Instrument Room across Control Center and Video Engine

- Status: Accepted
- Date: 2026-09-04
- Deciders: Krish

## Context

The approved Video Engine established a clearer Mindmake identity than the rest
of Control Center. Control Center still used a violet SaaS skin, recreated logo
geometry, undersized brand marks and fixed-dark editor wells. The two surfaces
felt like different products, and several visually plausible utility classes
did not emit any CSS.

## Decision

Use one Mindmake Instrument Room across both products. Official, hash-pinned
assets own identity. Ink and warm paper own the grounds; mint means the answer,
amber means change or attention, and status colours retain their meaning.
Archivo owns interface structure, Newsreader the earned claim, Source Serif 4
long-form explanation and IBM Plex Mono evidence. Shared primitives own theme,
motion, safe areas, identity and interactive states.

Responsive identity is measured by visible artwork, not its outer file box.
Compact marks keep at least 24 CSS pixels of visible geometry. Series names get
dedicated horizontal space and must retain at least 16 CSS pixels of actual
letter height at a 375 pixel preview. They are never miniaturised into a stacked
square.

## Alternatives considered

- Keep Video Engine visually separate. Rejected because one business should not
  teach two visual grammars.
- Recolour every route independently. Rejected because it would preserve drift
  in identity, shell and accessibility.
- Copy the public site's theatrical motion. Rejected because an operating tool
  needs the site's authority without its arrival choreography.

## Consequences

- The shared token and primitive layer upgrades existing routes without removing
  their information architecture.
- Official assets and generated derivatives are reproducible and checked in CI.
- Compatibility names such as `violet-*`, `.aurora-btn` and `.glass-card` may
  remain in source, but resolve to the Mindmake system.
- Deep route states still require rendered theme and interaction checks; landing
  screenshots alone are not sufficient evidence.

## Follow-ups

- Verify every route at the phone, coarse-pointer tablet and desktop acceptance
  sizes in both themes and reduced motion.
- Migrate actionable copy from opacity utilities to semantic foreground roles.
- Keep Compound outside this decision and outside every implementation change.
