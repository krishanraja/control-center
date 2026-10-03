# ADR-026: The strategist turns a goal or his own words into the plan

- Status: Accepted. Extended by [ADR-028](./028-the-daily-move-and-the-cheap-lane.md) on 2026-10-03: a daily read nobody asks for, on Sonnet 5 with a challenger from another lab. "Never Opus" holds.
- Date: 2026-09-27
- Deciders: Krish

## Context

Krish asked for two things on 2026-09-27. His words are recorded verbatim in
[`docs/focus-purpose/PURPOSE-WORKBOOK.md`](../focus-purpose/PURPOSE-WORKBOOK.md)
section 0.7, and only there, so this ADR paraphrases them.

1. **Read a goal the way a strategy consultant who knows his record would.**
   He can set a big goal and he can do the small tasks. What he cannot see is
   the middle: a partner model, an investor or a co-founder, and getting the
   right people to see the work.
2. **A plain box he can dictate into** with Wispr Flow, in his own words: on a
   Monday morning, for progress during the week, and for how the week went.
   The notes are mostly about what he thinks and how it is going. The system
   turns them into recommendations, goals and next steps.

Nothing in the product did either.

- The goal gate (`api/_goalGate.ts`) checks that a goal is well formed. Its own
  prompt calls it "a gate, not a coach".
- Nothing read a goal for what was missing, and nothing took his words about
  the week.

The live state, read only on 2026-09-27. It is given as counts: scorecard
figures and names stay out of this repository (`NOW.md` `never_publish`).

- The canon held one goal, the OS goal `goal:os:mission`. No weekly objective,
  no `daily_focus` row and no daily ask had ever been set.
- Three scorecard weeks were on record.
- The stop rule is read on 5 Oct 2026, and the binding (a partner) is due
  31 Oct 2026.
- The warm network, tiers `1_reciprocated`, `2_core_network` and
  `3_known_network`, held 1,778 partner, 1,996 introducer and 143 investor
  contacts.
- `suggestions`, `suggestion_verdicts`, `pilot_checkins`, `pilot_asks` and
  `worries` were all readable with the browser's anon key.

His pattern is already written down, so the strategist quotes it and invents
nothing about him: `docs/focus-purpose/OPERATING-MANUAL.md` sections 1, 7 and
11, the workbook's decision rules, and `src/content/focusTheory.ts`.

## Decision

### Who reads

**Marcus reads it. There is no new agent and no new rung.**

- The voice is Marcus's persona, and the meter stamp is `goal-strategist`. The
  precedent is `daily-focus-os-picks`: a stamp for spend, not a roster row.
- Gate G4 (a new agent only when a paying leader asks in writing) stays closed.
- The goal ladder keeps its rungs. The read sits beside the canon and changes
  it only through the paths that already exist.

### Two ways in, one route

`api/strategist.ts` serves GET and POST, both behind `guard()`, because
`middleware.ts` does not gate `/api/*` and a read names warm contacts.
`guard()` fails open when `ACCESS_CODE` is unset, as `middleware.ts` and the
network routes do (docs/API.md). That is an accepted risk here too: a deploy
that drops the variable would expose the latest read, which quotes his note
and names warm contacts, and would let anyone start a thinking run. The
fail-closed `guardSensitiveRead` is the alternative if that trade changes.

| Input | What he gets back, besides the headline and the one move |
|---|---|
| `{source:'goal', goalId}`, the OS goal | The full read: all six lenses, 1 to 3 drafted objectives, 1 to 3 asks, a dated kill signal |
| `{source:'goal', goalId}`, a weekly objective | The short read: outward or inward, the outward wording, one ask |
| `{source:'note', kind:'week_open', body}` | What he said, in one line; 1 to 3 lenses; 1 to 3 drafted objectives; 1 to 3 steps for today; 1 to 3 asks |
| `{source:'note', kind:'update', body}` | What he said; up to 2 lenses; done, carry or drop on this week's objectives; 1 to 3 steps for today; one ask |
| `{source:'note', kind:'week_close', body}` | What he said; 1 to 3 lenses; done, carry or drop; 1 to 3 objectives for Monday; one ask; one learning line |

- Every read opens on a headline (what he is missing, with the rule it tests)
  and ends in one move with a stop-talking point. A note that names a worry
  also gets "Compile this worry", through the existing worry compiler.
- `READ_SHAPES` in `api/_strategist.ts` holds these counts as data. The prompt's
  contract and the validator are both generated from it.
- A note is at most 12,000 characters. It comes from the TalkBox, a plain
  textarea built for dictation.
- The model is `SYNTHESIS_MODEL` through `streamClaude`, from two literal call
  sites:
  - the OS goal, `week_open` and `week_close` think, with `maxTokens: 12000`;
  - a weekly objective and an `update` do not think, with `maxTokens: 2500`;
  - neither sets a temperature.
- Sections stream one at a time, each after it passes validation. The server
  writes a `: ping` every 10 seconds while the model thinks, and races the call
  against 240 seconds, because the rescue provider has no deadline of its own.

### Where it is kept, and why not in the tables that exist

**A new table, `public.strategist_reads`, is service role only.** RLS is on,
and anon and authenticated are revoked outright.

- **Why not reuse the tables that exist.** His notes are mostly about what he
  thinks and how he feels about the work. The reads name warm contacts and
  cite scorecard figures, and both are on `never_publish`. The five tables
  above are all anon readable (checked live). The anon key ships in a public
  bundle from a public repository, so a note written to any of them would be
  readable by anyone.
- **What he said is kept first.** A note is written as `pending` before the
  model runs, so a read that fails never loses it.

**The learning bank gets three surfaces, hidden from the browser key.**

- `strategist_objective`, `strategist_ask` and `strategist_next_step`, each
  with subject `strategist_reads`, and each at `propose` on `autonomy_ladder`.
- An incomplete read names `strategist_read_incomplete` in `handoff_reasons`.
  The sentence he reads is that row's fixed text. Provider errors can carry a
  secret's name, so they go to `console.warn` only.
- **Restrictive** anon policies:
  - `suggestions` select: `surface not like 'strategist\_%'`;
  - `suggestion_verdicts` select and insert: `suggestion_id in (select id from
    suggestions)`, which under anon's own RLS excludes every strategist row.
- A restrictive policy is ANDed with the permissive ones. The content engine's
  rows, and the brainstorm artifact that reads them with the anon key, are
  unaffected.
- His verdicts go through `POST /api/suggestions/verdict`, which accepts only
  the three strategist surfaces.

The migration is
`supabase/migrations/20260927100000_what_he_says_becomes_the_plan.sql`. It is
applied live on 2026-09-27 with Krish's explicit OK and read back: anon gets
permission denied on `strategist_reads` and sees no strategist rows in
`suggestions`, while the content engine's rows stay readable. Had it not been
applied, a read would still stream and show, with `done` saying
`persisted: false`.

### It proposes; he decides

- **Objectives.** A drafted objective becomes a goal only when he taps "Take
  it". That calls the Focus Ritual weekly step's own `add()`, so `createGoal`
  and the goal gate run unchanged. "Take it" in the sheet hands the wording to
  the ritual's composer, and he presses Add.
- **Next steps.** A step lands in today's 3 only on "Put on today", through
  `POST /api/daily-focus/slot`.
- **Progress.** "Mark done" and "Drop it" go through `patchGoal`, on canon
  goal ids only, and only while that objective is still active now (a stored
  read can be days old). Drop asks twice, as the ladder's does. Carry is said,
  not offered as a button: the objective is already active, and the house
  Carry (ADR-018) is the ritual's own.
- **The one move** is the ask, rendered through `AskCard`, extended in place
  with `seed`, `onCommitted` and `hideUnresolved`. When today's ask has already
  gone out, it offers Copy only. The order is the manual's: the words, then
  his guess, then contact, then "I sent it". The move's contact buttons
  appear only once he has made it today's ask.
- **One ask card at a time.** Inside the Focus Ritual there is no `AskCard`:
  the ritual can hold three reads, and three "today's ask" buttons would be
  three moves. The move there is its words and Copy; today's ask is made on
  Home.
- **The ask log names nobody.** `pilot_asks` is readable with the browser key,
  so what the move seeds there is a first name or a plain label ("A client",
  "A reader") and the short line. The server refuses a line or a role that
  carries a candidate's full name, surname or company.
- **Nothing sends.** A named ask gets one-click contact through
  `src/lib/contactAction.ts`: a mailto, or LinkedIn with the draft copied. Email
  and LinkedIn URL are attached at read time by the guarded route and never
  stored.

### Manual first in the ritual

The ritual's weekly step is the one weekly composer (ADR-018), and his own
writing comes first there.

- The TalkBox sits inline at the top: his words first.
- Drafted objectives from his note come back as "Take it" rows.
- His manual composer is unchanged. After each add, a short read of that
  objective appears under the list.
- The OS goal's latest read waits behind a disclosure below the composer.
  Nothing is fetched until he opens it, and the model runs only if no read
  exists yet.
- Nothing opens a sheet inside the ritual, because the ritual's Escape handler
  snoozes the day.
- There is no background spend. After a failed attempt nothing runs by itself
  for 24 hours (GET returns `last_attempt_at` for this). A read that came back
  `persisted: false` never reruns by itself.

### His prediction stays his

- The machine never fills `predicted_no_pct`. If it did, `learningFor()` would
  tell him about a guess he never made, and the calibration would lie.
- The read names the exposure ladder level in words: the feared outcome and
  the correct learning, from manual section 7. It never shows a percentage,
  which would anchor his guess.
- The prediction chips start empty, and he taps his own.

### No archive, no diagnosis

- **No archive** (FOCUS-PURPOSE constraint 1). He only ever sees the latest
  read. The server keeps past notes so a Friday note can be read against the
  Monday one, and GET never returns a note's text.
- **Name moves, never his psychology.** The manual says "Do not diagnose
  Krish". The headline and the lens text reject `worth`, `unworthy`,
  `deserve`, `imposter`, "you fear" and "you feel". The heard line may quote
  his own words back to him and nothing more.

### The lenses and the jobs they serve

Each lens tests one of the gaps he named. Its jobs are fixed in `LENSES`
(`src/content/focusTheory.ts`), and the first is the default.

| Lens | Rule it tests | Jobs |
|---|---|---|
| `sell_first` | 3, pays inside 90 days | `fill_pilots` |
| `help` | the request formula and the exposure ladder | `fill_pilots`, `keep_honest` |
| `partner` | 4, alone in it | `fill_pilots`, `keep_honest` |
| `distribution` | 2, no cold outbound | `feed_demand` |
| `isolation` | 6, built in private | `keep_honest` |
| `capital_cofounder` | 5, ownership | `keep_honest` for a co-founder move; none for an investor move |

- `run_pilots` (gate G2) and `keep_edge` (gate G3) are refused while their
  gates are closed.
- An investor move carries no job, and the read says in a sentence that no job
  covers raising money. It does not borrow one. An ask says the same thing the
  same way: `target: 'investor'` (or job null with no lens or the capital lens)
  makes it the capital lens with no job and that sentence; `target:
  'cofounder'` keeps the co-founder job, `keep_honest`.

### Who an ask may name

- A named person comes only from the grounding's candidate list: warm tiers
  `1_reciprocated`, `2_core_network` and `3_known_network`, at most six per
  role (buyer, partner, introducer, investor). Buyers are searched because the
  pilot is sold to people he already knows (THE OFFER): the one move is often
  a direct ask to a leader, not an introduction.
- Candidates never carry `why_them` or `risk`.
- An ask to a role, with no contact, must say how it gets there (`via`): a
  candidate who makes the introduction, `existing_client` or `published_piece`.
  A role ask with no `via` is refused. This is rule 2: no cold outbound.

### The two rulings

- **Ruling (Krish, 2026-09-27): investor and co-founder moves are live now.**
  This overrides the sequencing in PURPOSE-WORKBOOK 0.4 ("room first, company
  second, raise third", where room reads as pilot per ADR-023). Investing,
  raising and a round are fair wording. The fund as a route stays killed
  (0.5): any read that proposes raising, launching or starting a fund is
  refused.
- **Ruling (Krish, 2026-09-27): what he says becomes recommendations, goals
  and next steps.** A drafted objective is saved only when he taps "Take it",
  through the ritual and the goal gate. That keeps ADR-016's "he sets the
  objectives; the OS finds the moves" true.

### Checked, then shown

The server runs `sanitizeVoice` (`api/_content.ts`) first, then validates, and
refuses only substantive failures:

- an unknown section kind or lens;
- a contact not in the candidates, or a role ask with no `via`;
- a goal id not in the canon;
- a job that is unknown or behind a closed gate;
- an ask line over 12 words, or a self-rejection marker in it;
- an ask line or role carrying a candidate's full name, surname or company;
- the retired word for the offer ("sell the room", "a paid room", "the Room";
  it is a pilot). Plain English such as "room to price it higher" passes;
- a fund;
- diagnosis wording in the headline or the lens text: his worth, what he
  deserves, the imposter story, what he fears or feels. Ordinary uses ("what
  the company is worth") pass;
- a number of 13 or more that is in neither the prompt nor the grounding
  (call lengths, hyphenated plan hours such as "48-hour" and dates are exempt;
  a count of hours is a claim; smaller counts are held by the prompt rule,
  because `unsupportedNumbers` ignores them);
- a section the read's kind requires, missing;
- no `{"kind":"end"}` line (the read stopped early).

A read with no `play` flag is allowed. A read with more than one has the extras
cleared. Neither fails the read.

## Alternatives considered

- **`api/goals/strategy.ts`, for goals only.** Rejected: a note is not a goal,
  and a second route for notes would duplicate the grounding, the stream and
  the saving.
- **Write the notes and reads into `suggestions`** (the first design).
  Rejected: that table is anon readable, and so are the four tables beside it.
- **Revoke anon on the whole learning bank now.** Rejected for this change: the
  content engine's brainstorm artifact reads it with the anon key (ADR-019), so
  that is a change across two repositories. Restrictive policies subtract only
  the strategist's rows.
- **A new roster agent.** Rejected: gate G4 is closed.
- **Fill `predicted_no_pct` from the ladder, or show the ladder's percentage
  as context.** Rejected: the first makes `learningFor()` false, and the second
  anchors the guess the calibration depends on.
- **Save drafted objectives directly.** Rejected: it skips the goal gate and
  breaks ADR-016.
- **Run the OS read in the background whenever the ritual opens.** Rejected:
  it breaks ADR-018's manual-first rule, and with no read to find, every mount
  would spend another thinking call.
- **Refuse a whole read for an em dash or an exclamation mark.** Rejected: the
  house practice is to sanitise, and one stray character would throw away a
  long read.
- **Require exactly one `play` flag.** Rejected: `proposalPlay` allows none
  rather than a made-up swing.
- **Keep "pilot first, company second, raise third" and refuse investor asks
  until a pilot is paid.** Overruled by Krish on 2026-09-27.
- **A second ask composer for the one move.** Rejected: it would fork
  `AskCard`.
- **Dictation through a microphone of our own in the box.** Rejected: it would
  compete with Wispr Flow. The TalkBox is a plain textarea.

## Consequences

### Positive

- A goal and a note each end in one move he can make today, to someone he
  already knows or through someone he knows.
- Every objective, ask and next step lands in the learning bank with its
  verdict: taken as offered, changed, replaced, or refused with a reason. What
  he does with the proposals becomes measurable.
- `api/pilot/asks.ts` now answers 409 `already_sent` to a post that would
  change the words of an ask that has gone out. That fixes an existing
  overwrite for every caller, not only the strategist.

### Negative

- **`pilot_asks.ask_text` is anon readable today.** A seeded ask names a first
  name or a role, never a full name, but he can type anything into it. This is
  tracked as a follow-up: revoke anon on the operator tables.
- **The build counts as unasked hours.** No paying leader asked for it, so
  under Rule 6 the Saturday commit read counts it against him. The approved
  plan put a hand read of the OS goal ahead of any code for that reason, so the
  value came before the build.
- Only an ask's `to` and `via` are checked against the candidates. A name
  written inside the prose of a read is held by the prompt rule alone.
- When the Anthropic breaker is open, the rescue provider answers.
  `producer.model` still says `SYNTHESIS_MODEL`, because `streamClaude` does not
  report which provider answered.
- App toasts sit at z-50, behind the sheets and the ritual at z-70. The
  strategist says its messages inline for that reason.

### Neutral

- The route tolerates the migration being absent (for example on a fresh
  database): reads stream and show with `persisted: false`, nothing is kept,
  verdicts cannot be written, and GET returns an empty 200.
- `STOP_RULE.reads` now says pilot, and `scorecardToDate(tz)` in
  `api/_scorecard.ts` is the one copy of the week loop.
- The popover layer moved from z-50 to z-[125], so a popover opened inside a
  sheet is drawn above it (`docs/DESIGN_SYSTEM.md`).
- `scripts/modelRoutePolicy.mts` holds the route to Sonnet with thinking and
  never Opus, and `check-model-routing` now honours `excludes` for API routes.
  `check-bridges-never-send` walks the strategist's files and fails on a root
  that does not exist.
- `e2e/strategist.spec.ts` runs in the CI e2e job on the default project, and
  `e2e/strategist-phone.spec.ts` runs in CI at phone-390 and phone-360, picked
  up by its suffix.

## Follow-ups

1. Apply `20260927100000_what_he_says_becomes_the_plan.sql`, only with Krish's
   explicit OK at that moment. Then read back:
   - one note read and one goal read show `complete` in `strategist_reads`;
   - an anon select on `strategist_reads` is refused;
   - anon sees no strategist rows in `suggestions`;
   - the content engine's rows are still anon readable.
2. Revoke anon on the operator tables (`pilot_asks`, `pilot_checkins`,
   `worries`), moving their browser reads behind guarded routes. The learning
   bank follows, with the content engine's agreement (ADR-019).
3. `NextStepSection` carries no `why`, so the reason badge on a next step reads
   "No reason recorded". Add one.
4. The phone's + sheet offers "Tell Marcus how it's going" on Home only. Decide
   whether it belongs among the global captures.
5. `ui/tooltip` and `ui/dropdown-menu` are still z-50. Move them to the popover
   layer the first time one is used inside a sheet.
6. After a few weeks, count which check fails most from `producer.reasons` on
   the incomplete rows. A section that keeps failing needs its instruction
   rewritten, not a looser check.
