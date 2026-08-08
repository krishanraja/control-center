# COMPOUND device systems

- Revision: DS-001
- Date: 2026-08-08
- Applies to: `compound/` only
- Approval state: implemented on `claude/compound-responsive-redesign-tayh7v`, rendered evidence produced, material visual approval outstanding

## The problem this replaces

Version 1 had one layout and one type scale. A media query at 900px moved the
navigation from a bottom bar to a side rail and changed nothing else: the same
component tree, the same 12.5px body text, the same four column rows, poured
into a 940px column with the rest of the screen left empty.

The result read as a phone screen stretched onto a desktop, and as a desktop
table crushed onto a phone. Company names were cut off at `Palantir Technolo…`
on a 390px screen while a 1440px screen showed 500px of nothing beside them.

## The rule

COMPOUND ships **two design systems over one data layer**. They share colour,
the four check strip, the number formatting and every fact on the screen. They
share nothing about size, spacing, rhythm, component shape or interaction.

| | `stack` | `split` |
|---|---|---|
| Runs on | phones, portrait tablets, narrow windows | laptops, desktops, landscape tablets |
| Navigation | bottom tab bar, one word labels | rail, full section names plus what each is for |
| Body text | 16px | 15px, measure capped at 68 to 78 characters |
| Titles | 27px | 34px |
| Hit targets | 48px | 38px, 44px when the pointer is coarse |
| Lists | two line rows, nothing truncated | tables with column headings and aligned figures |
| A card | the whole card is the target | text with a small control under it |
| Detail | a sheet that covers the content | a panel beside it, list still visible |
| Choosing one of a few | segmented track, two across when names are long | filter pills that wrap |
| Comparison bars | label above a wide bar | label column beside the bar |
| Five stage track | names the current stage | labels all five |
| Keyboard | not assumed | 1 to 5 for sections, Escape closes the panel |
| Ask | suggestions first, input at the bottom near the thumb | input at the top, suggestions under it |

Both put the answer directly under whatever was used to ask for it.

## How it is wired

- `src/lib/device.ts` decides. `layout` picks the system, `input` picks the hit
  target size, `columns` says how many the grid may use. A small physical
  screen stays on `stack` even when an in-app browser claims a 980px viewport.
- `src/app/DeviceProvider.tsx` puts that in context, so a leaf component can
  render a different tree rather than a different class name.
- `src/styles/base.css` holds colour, reset and the shared atoms.
  `src/styles/stack.css` and `src/styles/split.css` are scoped entirely under
  `.stack` and `.split`, so neither system can reach into the other.
- `src/app/frames/` holds the two frames. Tabs and sheets are shared and ask
  the context what shape to take.

## Language

Every word is written for someone who has never bought a share. Shared terms
live in `src/lib/words.ts` so the vocabulary stays consistent and checkable.

- Four checks named Price, Experts, News and Sales, never "signals".
- Sales, not revenue. Profit kept per sale, not gross margin. Price vs profit,
  not price to earnings. What safe cash pays, not the cash rate.
- Every term that survives gets its explanation next to it the first time.

`npm run qa:language -- <url>` walks the running app, opens everything folded
away, and scores the prose with Flesch Kincaid. The ceiling is grade 9. It also
fails on em dashes, house banned words, and finance terms that have a plain
replacement. Current reading grades: 2.2 to 4.8 per screen, 4.6 overall.

## Proof

- `npm run qa:ux -- <url> <dir>` runs 13 cases: 320, 360, 390, 412, 430, 768
  and an Android-scaled viewport on `stack`; a 1180 landscape tablet, 1280,
  1440 and 1920 on `split`; plus two deep links. Each case asserts it rendered
  the right system, has no horizontal overflow, clips no text, meets its own
  target size floor, keeps a visible focus ring, and reaches every section.
- Target size floors follow the input, not the window: 44px for touch, which is
  what Apple and Android publish, and 32px for a pointer, comfortably above the
  24px WCAG 2.2 minimum. The old gate applied a single 42px floor to mice.
- `npm run qa:render -- <url> <dir> <tag>` renders every section on a phone and
  a desktop, so a change to either system can be looked at.

## Known limits

- `placed[].note` and `stages[].name` arrive as data. The starter snapshot in
  `compound/public/latest.json` was rewritten into plain words, and known stage
  names map through `plainStage` in `words.ts`, but the daily pipeline can
  still write a sentence the reading level gate never sees. The pipeline should
  adopt the same vocabulary when it replaces the starter snapshots.
- The reading level gate scores the sentences COMPOUND wrote. Company and
  industry names come from a feed and are excluded, because scoring
  "Cognizant Technology Solutions Corporation" measures the feed, not the copy.
