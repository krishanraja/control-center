# COMPOUND device systems

- Revision: DS-003
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
| Settings | search, filter, bulk actions, one column of switches | the same, in the panel, two columns wide when there is room |

Both put the answer directly under whatever was used to ask for it.

## The design pixel

The phone system is written in design pixels on a 390 wide phone, and every
size is multiplied by `--px` at render time. On a real phone `--px` is 1 and a
design pixel is a CSS pixel.

It is not always 1. A browser in desktop site mode, and several Android in-app
browsers, hand the page a 980 pixel viewport on a 412 pixel screen and then
squeeze the rendered result back down to fit the glass. Phone sized type drawn
into that viewport arrives at 42% of its intended size, with 112 characters to
a line: the right system, sized for the wrong screen. `Shell` sets `--px` from
the ratio between `window.innerWidth` and `window.screen.width`, which cancels
the squeeze exactly. Reported on a Galaxy handset on 8 August 2026 and fixed
the same day.

Two guards sit either side of it: below a ratio of 1.2 the two widths agree
closely enough to leave alone, and above 3 something is reporting nonsense.
The stack reading column also stops growing at 560 design pixels, so a portrait
tablet gets a 62 character measure instead of an 87 character one.

`qa:ux` asserts the design pixel matches the squeeze the browser is about to
apply, within 10%. That check was written by breaking it first: with `--px`
pinned to 1, the suite fails with "everything would render at 40% of the size
it was written at".

## Nothing scrolls sideways on a phone

`checkOverflow` only fires when the document itself scrolls, so a control with
`overflow-x: auto` absorbed its own overflow and passed. The industry group
track did exactly that: a two column grid on `1fr` columns, whose labels were
`nowrap`, so the columns refused to shrink and the grid ran 190 pixels off a
390 pixel screen while every other check went green.

Two fixes, one structural and one cosmetic. `minmax(0, 1fr)` lets a column
shrink below its label and the labels wrap, so no name can push that grid out
however long it gets. The phone also gets short group names, because a two
across track has room for "Up, still cheap" and not for "Going up, still
cheap"; the desktop rail keeps the full ones and the sentence under the track
carries the meaning on both.

`checkNoSideways` now runs on every section and on every group, and fails on
anything inside the phone page that sits past the screen edge or hides content
behind a sideways scroll.

## How it is wired

- `src/lib/device.ts` decides. `layout` picks the system, `input` picks the hit
  target size, `columns` says how many the grid may use, and `scale` is the
  design pixel above. A small physical screen stays on `stack` even when an
  in-app browser claims a 980px viewport.
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

- `npm run qa:ux -- <url> <dir>` runs 14 cases: 320, 360, 390, 412, 430, 768
  and two wide-viewport-on-a-small-screen cases on `stack`; a 1180 landscape
  tablet, 1280, 1440 and 1920 on `split`; plus two deep links. Each case
  asserts it rendered the right system at the right size, has no horizontal
  overflow, clips no text, meets its own target size floor, keeps a visible
  focus ring, and reaches every section.
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
