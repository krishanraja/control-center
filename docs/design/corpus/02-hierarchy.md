# 02. Information hierarchy: what is read first, and what is never read at all

## The rule

Every surface answers one question in under three seconds, and the answer is
the first thing on it. The Growth standard is the law for how that happens,
on every tab, since 2026-10-05 (`PRODUCT.md`, "The Growth standard"):

1. **Data compressed.** A strip of three or four numbers. A row carries one
   number in its supporting line, never the evidence itself.
2. **Insight only when asked.** "Why" opens on what the evidence means; the
   raw receipt is one tap further. Never the rows first.
3. **One action at a time.** One move, one primary and one secondary, through
   `shared/DoThisNextHero`. The verdict lands where he pressed, nothing
   auto-advances, Next is a press.
4. **Honest emptiness.** One line saying why there is nothing, said once.
   Never filler, never a zero that looks like data, never an unwired number
   printed as 0.
5. **Recomposed per layout**, not shrunk.

Four rules sit on top of those five:

- **The prominence ladder never inverts:** a blocking action, then the
  numbers, then context, then history (`PRODUCT.md`, cross-tab contracts).
- **One claim, one eyebrow, one hero per surface.** `<Claim>` is the one
  serif payoff line and Newsreader is reserved for it; `<Eyebrow>` is the one
  section label; `DoThisNextHero` is the one focal, breathing thing and
  everything else recedes.
- **A mark, never a count, for anything that is only occasionally true.** A
  count is an ask: it says "there are 27 things" and hands him the sorting. A
  mark says "something is true" and the drawer behind it holds the whole of
  it. The alarm is a 36px mark and a `SlideOver`; the Home doors carry a dot,
  never a number (`DESIGN_SYSTEM.md`, "An alarm is a mark and a drawer").
- **Colour means one thing each.** Mint is the answer or the active path.
  Amber is what moved or needs attention. Red is destruction or real failure.
  Nothing else gets an accent, and permanent chrome gets none: if something
  needs colour to be found it should not be permanent (`DESIGN_SYSTEM.md`,
  "Persistent chrome is neutral").

## Learned from

- **2026-09-08, "It's just data. It's not insight."** Krish, on the Growth
  tab's signal and review sections, which read as walls on a phone. The rule
  "read first, rows second" came from it: a sentence that says what the
  evidence means, the rows under a disclosure (`DESIGN_SYSTEM.md`).
- **2026-09-17, the banner that shrank Home.** The critical alarm was a
  full-width banner; with truncation neutralised to protect complete copy, it
  wrapped to 180px of a 640px phone and pushed the third Today slot off the
  screen with nothing said. A bigger alarm was a smaller Home. It became a
  mark and a drawer.
- **2026-10-04, the OS Queue.** It held 27 rulings, 74% stale or superseded
  and 78% already shown in the tab that owns them; its calibration card had
  zero responses ever. Removed; Home's Waiting count went from 27 to 6 and
  reads only typed, fresh rulings (`src/lib/freshDecisions.ts`; `NOW.md`,
  2026-10-04).
- **2026-10-05, the standard carried everywhere.** Phone Org stacked a
  second hero under the first; phone Systems called a board of unchecked
  services "All systems healthy"; phone Flows printed a large 0 for no
  proposals. Each tab now decides one move in `src/lib/surfaceMoves.ts`, and
  the rule "nothing is said twice" dropped the empty headings under a move
  that already says there is nothing to do (`DESIGN_SYSTEM.md`, "Growth's
  standard carried to Subscriptions, People and OS").
- **2026-10-09, the count displays.** A read of `src/components` found about
  30 places that show a number of pending things across about 22 files
  (Waiting, drafted approaches, tests due, roles to rule on, proposals
  waiting, "N left · N cleared", and so on). Each is correct where it stands.
  Together they are thirty asks to sort, which is the "too much" he named.

## Held by

- The five rules, as the order each surface's move follows:
  `src/lib/surfaceMoves.ts`, pure, tested without a browser in
  `tests/api/surfaceMoves.test.ts`; `e2e/surface-moves-desk.spec.ts` proves
  each surface leads with its one move, above its board, with the evidence
  one press away.
- One recipe for a title: `scripts/check-type-tokens.mts` fails a stock
  display size, so a hand-rolled `<h1>` cannot carry a page.
- The accent language as text: `scripts/check-theme-tokens.mts` and
  `e2e/theme-contrast.spec.ts`.
- Honest emptiness: `desktop/StatusLane` returns null when empty and
  `EmptyLanes` names the empties in one line; `Loadable` refuses to render an
  empty state while a load is in flight (`DESIGN_SYSTEM.md`, restraint rule 8).
- The prominence ladder, one claim per surface, marks over counts: **review
  only.** No guard counts heroes or claims on a surface today.

## Measured by

- Primary actions visible on a surface outside its one hero: the target is
  one. Not measured today; the gate arrives with the one queue
  (`03-the-ask.md`, Open).
- Pending-count displays in `src/components`: about 30 on 2026-10-09. Read by
  `grep -rn "waiting\|N left\|to triage" src/components`, which is a rough
  instrument; the true measure is how many of them become queue entries.
- The Waiting count on Home: 6 on 2026-10-04, after the Queue was removed.

## Open

1. **An ask-budget gate**: `e2e/home-fit-*.spec.ts` asserting at most one
   primary action on Home outside the Today slots. It would fail today by
   design (seven asks in the worst morning), so it ships with the one queue.
2. **A hero count**: a guard that fails two `DoThisNextHero` renders on one
   surface. Review only until then.
3. **The count displays** become entries in the one queue or marks that open
   a drawer; each conversion lowers the rough count above.
