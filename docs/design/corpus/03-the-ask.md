# 03. The ask: what he is asked at any one point

## The rule

At any one point Control Center asks Krish for exactly one thing, and that
thing is intelligent, sequential and doable.

**One queue.** There is one ordered list of things that want him, across
every tab. The mission leads; product work is ordered beneath it by the
ladder in `src/lib/portfolio.ts` (Ruling, Krish, 2026-10-06: the portfolio
rolls into the mission). Within a tier, newer and more human first: a person
who has replied and is waiting on him outranks today's move Marcus wrote at
05:00 (Ruling, Krish, 2026-10-09). Home shows the head of the queue; the rest
is one tap away, in order, each with its own press. Never seven asks on one
screen.

**The shape of an ask.** Every ask carries, in this order: what to do, naming
the thing it is about; why today, in one line with a number; what done looks
like by tonight; the one press; and the wall, if there is one. An ask is one
of three kinds, and says which:

| Kind | What exists when he sees it | His press |
|---|---|---|
| **advice** | a sentence and an Open | goes and looks |
| **prepared** | the artifact exists: the draft, the list, the order with its figure printed | commits it, or at a wall, finishes it himself (opens the Gmail draft and presses send; opens the order and pays) |
| **autonomous** | the work is finished inside the walls | reads the report |

The walls do not move: nothing sends, posts, spends, deletes or changes a
permission without his press. A prepared ask at a wall is prepared all the
way to the wall, figure printed (Ruling, Krish, 2026-10-09), and its one
press is his. Advice is the floor, not the target.

**Sequential.** The verdict lands where he pressed, under the chips, beside
the control, never in a box at the bottom. Nothing auto-advances; Next is a
press. One sheet at a time: a sheet closes before another opens. A set of
options earns its height only until a choice is made, then collapses to the
choice with a way back (`DESIGN_SYSTEM.md`, "Options are not content").

**Intelligent.** The system drafts first from what it already knows, and
asks only confirm, pick, or name-one. Chips, sliders and voice before free
text; free text is the fallback. Input cost near zero: never ask him to
recall, prepare or type what a tap would do. A step that proposes work
carries one swing per batch (`proposalPlay`, `api/_humor.ts`): a prompt that
is only prohibitions returns joyless work.

**The ask budget.** One primary ask per screen. Everything else is a mark
that opens a drawer, or an entry further down the queue. The morning gate's
four stages count as asks, and the + sheet's seven options are a menu, not an
ask.

**Never a bare "Done".** The only outcomes are `done_together`, `did_it`,
`drafted`, `later` and `dropped`, and only the first two mean done
([ADR-029](../../DECISIONS/029-a-note-starts-a-walkthrough.md)). The options
offered are always: help me do it now, I did it myself, later, drop it.

## Learned from

- **2026-10-03, nobody writes the first move.** In the month before ADR-028
  the evening prompt for tomorrow's ONE was skipped nine times out of nine, no
  Today slot had been set by hand in 25 days, and the strategist had never
  been asked for a read. Every surface that could hold his next move had asked
  him to write it first. The daily move now proposes slot 1 unasked, with
  Take it, Not this and Later
  ([ADR-028](../../DECISIONS/028-the-daily-move-and-the-cheap-lane.md)).
- **2026-10-08, "Done" meant "help me".** Walking the week's battle plan, he
  answered "Done" to five steps and then said "I haven't done any of this
  stuff. I just expect the control centre to help me do all of this stuff."
  Two days later none of the ten steps was done
  (`docs/plans/2026-10-07-week-battle-plan.md`). A bare Done was the wrong
  question; the honest outcomes and the walkthrough came from it (ADR-029).
- **2026-10-09, the worst morning.** The longest honest fixture
  (`mockWorstMorning`, `e2e/fixtures/dailyMove.ts`) shows Home with up to
  seven things wanting a decision at once: today's move, a due test, the
  drafted-approaches strip, the Waiting count, "Set this week's 3", two empty
  slots and Log. The written rule is one ask per screen (`PRODUCT.md`, Home,
  behaviour rules). Each tab also decides its own one move, so the moves add
  up across tabs: that is where "too much" comes from, not from any one
  surface.
- **2026-10-09, advice.** Of 180 `api/` routes, 10 make a Gmail draft and 2
  can reach another person; every move button records his reaction
  (`suggestion_verdicts`) or puts a line on his list (`daily_focus`), and
  `surfaceMoves.actionLabel` is a string with no handler that mostly says
  "Open" or "Show". The full read is
  [`docs/audits/2026-10-09-data-to-action-audit.md`](../../audits/2026-10-09-data-to-action-audit.md).
- **2026-09-27, the verdict where he acts.** The curveball response was moved
  from a distant verdict box to directly under the chips he clicks
  (`krish-design`, "The verdict sits where the user acts"); the strategist's
  one move is rendered through the composer that owns the write, so his tap
  is the commit (`DESIGN_SYSTEM.md`, "A draft enters the composer that owns it").

## Held by

- One sheet at a time, verdict in place, Next a press, the daily move's three
  answers: `e2e/daily-move-desk.spec.ts`, `e2e/daily-move-phone.spec.ts`,
  `e2e/strategist.spec.ts`, `e2e/strategist-phone.spec.ts`.
- Options collapse once chosen; Home never scrolls and folds in the order of
  `src/lib/homeFolds.ts`, where the move he has to answer is the last thing a
  short screen gives up: `e2e/home-fit-desk.spec.ts`, `e2e/home-fit-phone.spec.ts`.
- The honest outcomes and the read-id-only handoff:
  `scripts/check-walkthrough-handoff.mts` (CI).
- Nothing sends: `scripts/check-bridges-never-send.mts` (CI).
- One queue, the ask budget, and the three kinds of ask: **review only**
  until the code phases in the audit land (`homeQueue`, the `prepared`
  contract on `SurfaceMove`).

## Measured by

- Asks visible on Home in the worst morning: 7 on 2026-10-09. Target 2 (the
  move in slot 1 and the queue head), then 1.
- The bank: `suggestion_verdicts` by kind (`accepted`, `tweaked`,
  `replaced`, `rejected`, `deferred`) and `seconds_to_verdict`, per surface,
  through the `autonomy_evidence` view. Whether a prepared ask is taken more
  than an advised one is the number that decides the audit's plan.
- Outcomes: `walkthrough_steps.outcome` per step, once it is read back.

## Open

1. **`homeQueue`** (`src/lib/homeQueue.ts`, pure, tested): the one ordered
   list, derived from what exists. Phase 3 of the audit.
2. **The `prepared` contract** on `SurfaceMove`, with `commit` for the
   system's press and `his` for the wall. Phase 1.
3. **The ask-budget gate** in `e2e/home-fit-*.spec.ts`, added with the queue.
4. **The morning gate** counted honestly: four stages before Home is four
   asks. Whether they fold into the queue head is a product call for Krish.
