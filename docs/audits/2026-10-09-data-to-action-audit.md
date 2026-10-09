# The data-to-action audit: how information becomes insight, recommendation and action, read on 2026-10-09

> Written 2026-10-09 from three read-only sweeps of `main` at `da789c6`:
> every `api/` route by its strongest effect, every n8n mirror in
> `scripts/n8n/` by what its nodes reach, every table that records an
> outcome, and every button a move puts in front of Krish. Counts are from
> the code, not from the docs, and say "about" where a count depends on how
> you draw the line. Figures on `NOW.md`'s `never_publish` list stay out.
>
> The question Krish asked: "I don't want advice in here. I want outcomes
> and actions to be doable. Or autonomous." And: "I need the system to do the
> heavy lifting of making my life 100 times easier." The decision this audit
> led to is [ADR-030](../DECISIONS/030-the-corpus-and-the-ratchet.md).

## The call, first

The pipeline is excellent at turning data into insight and stops there.
Marcus reads a note and writes a plan a strategy consultant would be proud
of; the daily move survives a challenger from another lab; every tab leads
with one move whose evidence is one press away. Then the move's button opens
something, or records what he thought of it. Of the whole machine, the only
button that starts work is "Start walkthrough" (ADR-029), and nothing reads
back what the walkthrough did.

The fix is not more intelligence. It is a contract: every move says whether
it is **advice** (a sentence and an Open), **prepared** (the artifact exists
and one press commits it, or at a wall one press is his) or **autonomous**
(finished inside the walls, reported after), and the product converts the
moves he already takes from the first kind to the second, with the loop
closed so the bank can see whether a prepared move gets done more than an
advised one. The walls (send, post, spend, delete, permission) do not move.
The migration that built the ladder said this a month ago in its own words:
`assist` is "the machine suggests and prepares the work, so the thing is
ready to look at rather than ready to start. Nothing leaves the building.
This is where most surfaces should live for a long time"
(`supabase/migrations/20260919100000_every_output_is_a_suggestion.sql`).
Every surface still sits one rung below it.

## 1. The pipeline as it is

In words: a source (Stripe, Google, PostHog, Apify, his own note) lands in a
Supabase table; a reader (`api/`, a hook, an n8n sweep) turns rows into a
verdict or a read; a surface shows one move through `DoThisNextHero`; he
presses; the press writes a row. The row is almost always what he thought,
not what happened.

**Routes.** 180 files in `api/`, each put in the group of its strongest effect:

| Group | Count | What is in it |
|---|---|---|
| Pure reads | 26 | ladder, digest, status, freshness, overview |
| LLM writes text or a judgment | 38 | the strategist, the daily move, ask-marcus, the goal gate, enrich-person, council-run, stall-check, the clip and script writers |
| Deterministic database writes | 83 | verdicts and approvals, Today's slots, syncs and imports, edits, health sweeps |
| External side effect | 33 | 10 make a Gmail draft in his own mailbox; 3 dispatch the hunter repository; 2 fire the Claude routine; 1 commits the architecture doc; about 17 trigger an n8n workflow; **2 can reach another person** |

The two: `api/acquisition/sends.ts` (approve, then an n8n dispatcher that is
inactive in the mirror, and the send surfaces are unmounted:
`docs/MINDMAKE_OS_ARCHITECTURE.md`, section on acquisition) and
`api/skills/ship.ts` (a handover email to a client address). Neither is on
any move. `notifyOps` (`api/_alert.ts`) is an `audit_log` row only; the OS has
been pull-only since 2026-09-06.

**n8n.** 103 mirrors in `scripts/n8n/`, 78 flagged active. About 92 score,
enrich, sweep, sync, summarise, monitor or report. About 4 draft (a Gmail
draft, a post on demand). About 7 act outward, of which two run with no gate
at all:

- `maya-dunning-auto-send`: a daily schedule at 12:30 UTC reads Stripe's
  past-due subscriptions and sends a recovery email through Resend. No
  approval node.
- `acquisition-ctrl-capture-intake`: on a capture, after a "Skip?" check,
  sends touch 1 through Resend. No approval node.

Both are live in the mirror, both reach a person, and neither sits under the
acquisition ladder (L1, every send approved) or the suggestion ladder. **They
need Krish's ruling and are not changed by this audit.** The other outward
workflows are gated: the nurture scheduler filters on `status=approved`, the
LinkedIn distribution and the Instantly dispatch run from an approval webhook.

**Tables that close the loop.** Did the action happen, and what came of it:

| Table | Records | Closes the loop |
|---|---|---|
| `pilot_asks` | `predicted_no_pct`, `sent_at`, `outcome`, `resolved_at` | yes: prediction against outcome; sending self-reported |
| `pilot_deals` | the state ladder listed to paid, a timestamp per step, cash | yes, to cash; set by hand, which is right for a send |
| `events` | `decision`, `outcome` worth it or not | yes |
| `walkthrough_steps` | `outcome` in done_together, did_it, drafted, later, dropped; `artifact`; `suggestion_id` | yes, written by the Claude session; **read by nothing in `src/` or `api/`** |
| `suggestion_verdicts` | accepted, tweaked, replaced, rejected, deferred; reason; seconds to verdict | records his reaction, never the result |
| `daily_focus` | done per slot | records done, with no `suggestion_id`, so an accepted move cannot be matched to its tick |
| `strategist_reads` | pending, complete, incomplete | records that the read was written |
| `autonomy_ladder` | `rung`, `promote_after`, `demote_below_rate`; the `autonomy_evidence` view | every surface at `propose`; nothing reads the view or moves a rung |

## 2. Every move, classified

Grades are honest letters with the condition that raises them
(`krish-principles`, 5.2). "Loop" says what the press records.

| Move | Where | Today | Loop | Grade | Raise condition |
|---|---|---|---|---|---|
| Today's move, Take it / Not this / Later | `home/DailyMoveSlot`, ADR-028 | advice with a verdict | reaction (`suggestion_verdicts`), slot text (`daily_focus`) | B | `suggestion_id` on the slot and `did_it` on the tick, so the bank learns whether taken means done |
| The strategist read's one move (the ask) | `strategist/StrategistRead`, `focusPurpose/AskCard` | prepared to the wall: draft text, mailto or LinkedIn with the draft on the clipboard, "I sent it" | `pilot_asks` outcome, self-reported | B+ | the Gmail draft made at read time so the press is "Open the draft" (assist for `strategist_ask`) |
| The read's drafted objectives, Take it | the Focus Ritual's `add()` through the goal gate | prepared: his tap is the commit | the goal exists | A- | nothing; this is the model for a prepared move |
| The read's steps, Put on today | `POST /api/daily-focus/slot` | advice placed on his list | a slot | C+ | the step's `walkthrough_steps` outcome read back, so a `drafted` step shows "Open the draft" rather than words |
| Start walkthrough | `WalkthroughCard`, ADR-029 | autonomous: a Claude session drafts with him | `walkthrough_steps`, unread | B | the app reads the steps back; Marcus's grounding stops re-proposing a done step |
| Advisory: "Show the draft", "Find five", "Search again" | `advisoryMove` in `src/lib/surfaceMoves.ts` | advice; the label is a string with no handler | nothing | C | `prepared.commit` = draft the approach (`POST /api/pilot-deals/:id/draft`, draft-only), then `his.href` = the draft |
| Hunt: "Write now", "Rule on them", "Build packages" | `huntMove` | advice, two of them trigger a dispatch | `hunter_actions` status | C+ | the drafted application as the artifact, one press to open it |
| Subscriptions: "Draft the check-in", "Sync now", "Open product" | `subscriptionsMove` | one prepared (draft), one autonomous (sync), one advice | the draft exists; the sync ran | B- | the check-in draft made before he arrives, not on press |
| Org: "Review it", "Open agent" | `orgMove` | advice; Approve and Reject answer rulings in place | `corrections`, `skill_proposals` | B | the ladder's own proposals appear here (phase 4) |
| Systems, Flows: "Check again", "Rerun it", "Show it" | `systemsMove`, `flowsMove` | autonomous checks, advice otherwise | `workflow_runs` | B | nothing; health moves are right as they are |
| Growth's move card | `growth/MoveCard`, `src/lib/growthModel.ts` | the model: typed primary and secondary, verdict in place, Next a press | `growth_touchpoints`, tasks | A- | nothing; this is what `SurfaceMove` should carry |
| Content's calls | `content-v2/CallCard` | prepared: each call has one primary and Not now, and the draft lives in the composer that owns it | the piece's state | A- | nothing |
| The `decisions_waiting` actions | `src/lib/decisionActions.ts` | approvals that flip a status; "Draft email" makes a Gmail draft; "Approve & send" on a sample | the row's status | B | "Approve & send" is a wall move with no `his`, on its own card, never a commit |
| The battle plan's ten steps | `docs/plans/2026-10-07-week-battle-plan.md` | advice in a document; one step done by a session into `pilot_deals` | `walkthrough_steps` | C | each step prepared: the ask drafted and its Gmail draft made, the launch post in the composer, the sample order built with its figure printed |
| The Google Analytics ladder, "one action per site" | `api/growth/web-insights.ts` | advice with first step, minutes and the check that closes it | `web_property_insights.action`, no follow-up | B- | the closing check run by the OS and the action retired on evidence, not after 14 days |

The pattern across the table: where the composer that owns the write already
exists (objectives, content, Growth's touchpoints), the move is prepared and
graded A. Where the move is a `SurfaceMove`, it is a string. Where the move
is a step in a read, the loop is open.

## 3. Where the loop breaks

Three places, each a few lines of code apart from being closed:

1. **`suggestion_verdicts` records the reaction.** Accepted, tweaked,
   rejected, with a reason and how long he took. It never records whether the
   accepted thing happened. `autonomy_evidence` therefore measures agreement,
   not outcomes, and a surface could be promoted on moves he took and never
   did.
2. **`daily_focus` has no `suggestion_id`.** A taken move becomes slot text.
   When he ticks the slot, nothing can say which move was done.
3. **`walkthrough_steps` is written and never read.** The honest vocabulary
   (done_together, did_it, drafted, later, dropped) exists, with
   `suggestion_id` and `artifact`. The daily move does not know a step is
   `drafted`; Marcus's grounding does not know a step is `dropped`, so the
   next read can propose it again; Home cannot show the battle plan's live
   state.

## 4. The ranked conversion table

Scored the house way (`krish-principles`, 5.1). Build ease is against the
existing stack; the downside lane says whether a miss is **blocking** (it
invalidates the move or costs trust) or **additive** (it degrades to what
exists today); pull is what the bank or the record shows; edge is what it
reuses.

| Candidate | Build ease | Downside lane | Wall | Pull | Edge | Rank |
|---|---|---|---|---|---|---|
| A named ask with its Gmail draft made at read time | high: `_emailDraft.ts` exists, the ask names a contact with an email | additive: no draft, today's words | send, his press | strongest: the battle plan's three asks were the week's rule, and none went | the strategist, AskCard, the draft route | **1** |
| Close the loop (`suggestion_id` on slots, `did_it` on the tick, steps read back) | high: one additive migration, four small edits | additive | none | the whole plan's measurement rests on it | `walkthrough_steps` as written | **2** |
| The `prepared` contract on `SurfaceMove`, advisory and hunt first | medium: a type, an allowlist, two hero props, one runner | additive: a move with no `prepared` renders as today | none, or send via `his` | the two lanes the week's plan lived in | Growth's `NextMove` is the pattern | **3** |
| One Home queue | medium: a pure function over what exists, one hero at the top of the stage | blocking if the order is wrong: the head is what he does first | none | seven asks to two is the "too much" | `surfaceMoves`, `freshDecisions`, `homeFolds` | **4** |
| Promotion on evidence | medium: a pure proposer, one cron, the verdict route applies it | additive: a wrong proposal is one he rejects | none; never autonomous | none yet; it creates the evidence | the ladder as built | **5** |
| The launch post prepared in the composer | high: `?brief` composer exists | additive | post, his press | one post in the plan | `contentModel` | 6 |
| The sample order built, figure printed | low: Printful and Shopify carts need their own routes | additive | spend, his press | one order in the plan | none yet | 7 |
| The buyer list written by a session into `pilot_deals` | done once by hand on 2026-10-08 | additive | none | 30 rows landed | the walkthrough | 8, already autonomous |

Winner, in one line: **the named ask with its draft made**, because it is the
move the week was built around, it reuses everything, and a miss costs
nothing. But it is phase 5 in the build order, not phase 1: it is the first
surface to reach `assist`, and `assist` is reached on evidence (phase 4),
which needs the loop closed (phase 2), which the contract (phase 1) carries.
The order is the dependency order, and each phase ships alone.

## 5. The build, in five reversible phases

Each phase is its own PR with its own tests; each leaves the walls where they
are; none adds a table, a tab, an agent or a sibling component. Detail,
file by file, is in the approved plan recorded with ADR-030.

1. **The contract and its render.** `Wall`, `Prepared` and `COMMIT_ROUTES`
   (an allowlist of deterministic writes and draft-makers; the two routes
   that can reach a person are asserted absent) on `SurfaceMove`;
   `primaryHref` and `secondary` on `DoThisNextHero`; `commitPrepared()` in
   `decisionActions.ts` as the one runner, refusing at runtime at a wall.
   Advisory and hunt filled first. Tests: `tests/api/surfaceMoves.test.ts`
   (a wall implies no commit and a `his`; every commit route exists),
   `e2e/surface-moves-desk.spec.ts` (the advisory primary is an anchor to
   the draft).
2. **Close the loop.** One additive migration (`daily_focus.target_N_suggestion_id`,
   `autonomy_ladder.max_rung` default `assist`); the slot route accepts the
   id; the tick records `did_it` through `recordStepOutcome()`; the daily
   read loads outcomes and a `drafted` step's primary becomes "Open the
   draft"; the grounding says what already happened; the read shows each
   step's outcome. Tests at each seam; the fire payload and the walkthrough
   skill unchanged.
3. **One queue.** `src/lib/homeQueue.ts`, pure and tested: a reply waiting
   on him (Ruling, Krish, 2026-10-09), then today's move, then prepared work
   waiting on his press, then a ruling an agent is blocked on, then health,
   then wiring and the week's 3; within a tier the mission then the ladder.
   One hero at the top of Home; the drafted-approaches strip, the due-test
   line and the Waiting count become entries. Seven asks to two. Then the
   ask-budget gate in `e2e/home-fit-*.spec.ts`.
4. **Promotion on evidence.** A weekly review proposes `propose` to `assist`
   on `autonomy_evidence` (`promote_after`, `demote_below_rate`), and the way
   back; he rules in OS > Org; the verdict applies it, never above
   `max_rung`; no code path writes `autonomous`.
5. **Assist for `strategist_ask`**, after he accepts the first proposal: the
   Gmail draft made at read time, bounds stated, `check-bridges-never-send`
   already walking the files.

Left alone on purpose: `DailyMoveSlot`'s controls and test ids; the
walkthrough fire payload; the `pilot_deals` ladder; Growth's `MoveCard`;
`api/acquisition/sends.ts` and `api/skills/ship.ts`; the 298 toasts.

## 6. The assumption ledger

| Belief | Confidence | Set by | Flip rule |
|---|---|---|---|
| A prepared move gets done more often than an advised one | medium | the battle plan: ten advised steps, none done in two days; the objectives he takes through the ritual get set | four weeks of `walkthrough_steps` show no difference in `did_it` plus `done_together` between prepared and advised moves |
| The walkthrough is the right autonomous engine for a note | medium | ADR-029, one session that landed 30 rows in `pilot_deals` | fewer than half of kept reads start a session, or sessions stop before step 2 more often than not |
| `walkthrough_steps` is the right outcome ledger for every move, not only sessions | high | its vocabulary was written after the "Done" incident and it already carries `suggestion_id` | a move kind appears whose outcome none of the five words can say honestly |
| A reply waiting on him should outrank the daily move | ruled (Krish, 2026-10-09) | newer and human beats 05:00 | he takes the move past the reply more than half the time for two weeks |
| `strategist_ask` is the first surface worth `assist` | medium | the week's rule was "a real buyer gets an ask before more building" | the bank shows asks set aside more than taken, in which case next steps go first |
| A spend wall prepared to the wall, figure printed, is wanted | ruled (Krish, 2026-10-09) | his answer | he says words-only after seeing one |
| The two ungated n8n sends are intended | unknown | nobody has ruled | his ruling either way |

## 7. The standard close

**The call.** Ship the contract, close the loop and build the one queue, in
that order, each as its own PR, then let the ladder move `strategist_ask` to
`assist` on evidence. Advice stops being the default shape of a move; the
walls stay exactly where they are.

**The sharper alternative.** Skip the ladder and put `strategist_ask` on
`assist` by ruling today, so the Gmail draft is made at read time from the
next read onward. It trades the measurement (the bank never learns whether
prepared beats advised on this surface) for a week. Worth it if the next
battle plan is Monday.

**The next 24 to 72 hours.** Phase 1, the contract on advisory and hunt,
with its two tests, pushed as one PR. Krish rules on the two ungated n8n
sends, which takes one line each.

**Counterpoints.** First: the biggest friction in the battle plan was not
the shape of the move but that sending, posting and ordering are his, and
no contract changes that; a prepared move still waits on him, and the
measurement may show the wall is the whole gap. Second: a single queue puts a
rule between him and the tab he wanted to open; if the head is wrong often,
the queue is a new ask rather than fewer, and the flip rule above has to be
read honestly.
