# 06. Consistency: one token per decision, one word per concept, one system per job

## The rule

**Consistency is the system; variation is the signal.** Hold the structure
constant and let one element vary per subject, and make the variation mean
something. Random variation is noise; no variation is wallpaper
(`krish-design`, section 5). In Control Center the structure is the token
layers and the shared primitives; the signal is the accent, the one claim,
and the move.

**Every visual decision reads a token.** The layers that exist, in
`src/index.css` and `tailwind.config.js`:

| Layer | Tokens | Guard |
|---|---|---|
| Colour | `--bg-base`, `--bg-sunk`, the ink family, `--accent` 1 to 3, `--fg` behind every `*-white/NN` | `check-theme-tokens` |
| Type | nine role sizes, four families, `<Eyebrow>`, `<Claim>`, `<SurfaceHeader>` | `check-type-tokens` |
| Elevation | `shadow-e1` to `e3`, the card tokens behind `.surface` | review |
| Easing | `--ease-calm`, `--ease-out-soft`, `--ease-spring` | `check-design-entropy` (`easings`) |
| Duration | ten `--dur-*` gestures | `check-design-entropy` (`durations`) |
| Icon | one wrapper, six snapped sizes, one stroke | `check-icons`, `check-icon-stroke` |

Three layers do not exist yet, and their absence is where the next entropy
is. The scales to adopt:

- **z-index:** the five documented layers as named tokens, bottom to top:
  `nav` (50), `sheet` (70), `composer` (90), `blocking` (120), `popover`
  (125). Ten literals in use today against those five.
- **Radius:** four steps, `sm` (the chip, 8), `md` (the control, 12), `lg`
  (the card, 16), `full`. Seven in use today.
- **Spacing:** Tailwind's 4px grid as the scale, with two house floors, 44
  on a touch target and the sheet's `BOTTOM_NAV_PAD`, and no `min-h-[…]`
  that is not one of those. 28 distinct phantom heights today.

**The sibling test.** If a new component can be described as "X, but", it is
X with a prop, a tone or a kind. `DoThisNextHero` carries the bar, the card,
the why, the stacked action and the narrow phone case through props, and
every existing call site renders as before because each is off by default.
That is the pattern: extend in place, default off, no call site changes
(`DESIGN_SYSTEM.md`, every "Extensions" section).

**One word per concept.** The venture vocabulary has one owner,
`ventureLabel()` in `src/lib/ventureOptions.ts`. The reject reasons and the
why badges have one, `src/lib/servedSurfaces.ts`. Every loading string lives
in `src/lib/loadingVoice.ts`. A canon term is never renamed on one surface
while the others keep it.

**Two registers, both plain.** Chrome (labels, buttons, empty states, waits)
is plain English a 12-year-old can follow, complete sentences, no stacked
fragments, no meta-lines about the app, no em dashes, never ellipsised. Work
the OS proposes is a second register: it reaches for something, carries one
swing per batch, and is allowed to be funny (`proposalPlay()`,
`api/_humor.ts`). Dull is a failure the same way wrong is.

## Learned from

- **2026-08-21 and 2026-09-17, the sweeps** (`01-entropy.md`): type, icons
  and the ink hierarchy each had several spellings until one won and a guard
  held it.
- **2026-09-17, five owners of one word.** The same venture was "CTRL" in
  the registry, "mm-ctrl" in Growth and Subscriptions, and "Mm Ctrl" on the
  triage deck; the morning check-in said "Live", "Circle" and "Pulse" where
  every other surface said "Publication", "Fractionl Circle" and "Fractionl
  Pulse", so Krish answered "On what?" against one set of words at 7am and
  searched his network against another a minute later. One owner now
  (`DESIGN_SYSTEM.md`, "The copy register").
- **2026-09-13, "so serious and intense."** Krish on the content
  suggestions. A proposal prompt built from a claim rule and a wall of
  prohibitions returned correct, joyless work; `proposalPlay()` came from it.
- **2026-10-04, three primitives grew a prop** instead of Growth growing
  siblings: `DoThisNextHero layout="card"`, `OptionChips size="touch"`,
  `SegmentedNav` with `.tap-44`. **2026-10-05, four more** for the other
  tabs. No sibling hero was built either time.
- **2026-10-09, the three missing layers.** Ten z literals, seven radius
  scales, 28 phantom heights and 19 plus 15 opacity values, none of which any
  guard could see. The Relume radius tokens exist in `tailwind.config.js`
  and are used 22 times against about 1,200 uses of the stock scale: a token
  nobody reaches for is a token that does not exist.

## Held by

- Colour, type and icon layers: the four CI guards named in the table.
- Easing and duration: `scripts/check-design-entropy.mts`.
- One word per concept: `scripts/check-served-surfaces.mts` (reasons and
  whys, mirrored by the API); `ventureLabel()` and `loadingVoice.ts` are
  **review only**.
- The sibling test, the two registers, the z, radius and spacing scales:
  **review only**, with the ledger rows (`z_values`, `min_h_values`,
  `bg_white_values`, `border_white_values`) holding the line until the scales
  exist.

## Measured by

- The ledger rows above, through `check-design-entropy --report`.
- Radius: `grep -rhoE "rounded(-[a-z0-9]+)?\b" src | sort | uniq -c`, seven
  scales on 2026-10-09. Not in the ledger until the four-step scale exists,
  because a count of the stock scale cannot say which uses are wrong.
- Orphans: `docs/ORPHANED-COMPONENTS.md` (45 on 2026-08-13) plus the six
  mobile files with no importer.

## Open

1. **z-index tokens**, then the ten literals onto them (Open 4 in `01-entropy.md`).
2. **The radius scale**, then a ledger row for off-scale radius.
3. **The spacing floors**, then `min_h_values` becomes a ban outside them.
4. **The orphan list** regenerated and the dead files removed, so the barrel
   and the tree say the same thing.
5. **The elevation layer** gets a guard the day a fourth shadow appears.
