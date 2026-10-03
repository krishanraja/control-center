# ADR-028: The daily move, and a measured cheap lane

- Status: Accepted
- Date: 2026-10-03
- Deciders: Krish

## Context

On 2026-10-03 Krish asked for two things, paraphrased here:

1. Take whatever can come off the Anthropic API, with Anthropic kept as the
   fallback, to cut cost a little.
2. Make it much easier to work with the system and to find the next single
   best action. He called that part critical. He holds keys for OpenRouter,
   DeepSeek, Kimi, OpenAI, Gemini, xAI and Meta, and could run a local model.

He approved the plan in one line: OpenRouter is set up, and the rest is
approved. Later the same day he asked whether the top tier was worth its cost
on the API for the daily move; section 3 records the answer.

What the repository and the live database showed, read only. It is given as
counts: scorecard figures and names stay out of this repository (`NOW.md`
`never_publish`).

- Every surface that could hold his next move asked him to write it first. In
  the month before:
  - the evening prompt for tomorrow's ONE was skipped nine times out of nine;
  - no Today slot had been set by hand in the 25 days since ADR-018 made Today
    manual first;
  - the strategist (ADR-026) had never been asked for a read.
- The morning brief no longer reaches him. Every Telegram push has been off
  since 6 September, because the OS is pull-only (architecture section 0b). The
  first plan named that brief as a way to deliver the move. That was wrong, and
  the move is on Home only.
- Person enrichment is the bulk of Claude calls: 3,284 judgments on 2026-09-15
  alone. Each judgment is a short structured answer: roles, seniority, best
  channel, confidence, and whether the person sells competing services.
- An offline replay could not choose a cheaper model for it. On the evidence
  the replay kept, a frontier model scored the same 75% agreement as the cheap
  candidates, so the test could not tell a good model from a poor one.

## Decision

### 1. The daily move

Once a day, before he wakes, the strategist writes a read nobody asked for, and
Home proposes its first move in the first slot of Today.

**When.** `/api/strategist/daily` runs on Vercel's hourly cron at minute 40.
From 05:00 in the operator's zone (`getOperatorTz`) it writes one read per civil
day. Every other hour it reads one row and returns. A day whose read failed
three times waits for tomorrow, so a broken prompt costs three runs, not
twenty-four. A POST from the app writes today's read now, whatever the hour.

**Nothing runs without its row.** The run writes a pending `strategist_reads`
row first. If that write fails, no model is called and nothing is spent. Before
migration `20261003120000_the_move_he_reacts_to.sql` there is no row to write,
so the cron does nothing. A unique index allows one daily read per date, so two
invocations racing each other cannot both pay for a read.

**Who writes it.**

- The decider is Claude Sonnet 5 (`DAILY_MOVE_MODEL`), thinking adaptively at
  high effort. It writes through the same line contract and line-by-line
  checks as every strategist read. The read is a headline, one to three moves best first, up to
  three asks, and what done looks like by tonight.
- The challenger is GPT-6.1 Sol (`DAILY_MOVE_CHALLENGER_MODEL`), from another
  lab, through OpenRouter with `data_collection: "deny"`. It argues the
  strongest case against the first move and may prefer a runner-up. It may not
  use a figure the grounding does not hold.
- Only when the challenger prefers another move does the decider weigh the
  objection, at medium effort, and keep its move or switch. The answer is a
  word, `keep` or `switch`. The dry run of 2026-10-03 answered with a number
  that meant the opposite of what it seemed to say.
- The read records what the move survived: the objection, who made it, and why
  the move stayed first or moved up. The card shows it.

**Refusals.** The decider's calls ask for the API's server-side refusal
fallback (`anthropic-beta: server-side-fallback-2026-07-01`,
`fallbacks: "default"`). It is sent only to models that take it (Fable 5.1,
Opus 5 and 5.5, Sonnet 5.5), so on Sonnet 5 it is inert until the decider moves
up a tier. When it serves a reply, that reply is priced as the model that
produced it, and the read is stamped with that model, never with the one asked
for. A refusal is metered, thrown, and counts as one of the day's three
attempts.

**What a move may say.**

- The text of a move names nobody. When he takes it, the line is written to
  `daily_focus`, which the browser's anon key can read. The person travels as a
  `contact_id`, is checked against the warm candidates, and is shown on the card
  from `contacts` when Home reads the move.
- A move about an existing draft carries its `pilot_deal_id`, checked against
  the open drafts, and takes the draft's person. A move pointing at a draft that
  does not exist is dropped. The draft's body never reaches the model.
- Every move says why today. Figures must come from the grounding.
- The move is never more building.

**Where it shows.** Home only. Nothing is pushed to him.

**What he can do with it.** One tap each:

- *Take it.* The move becomes his slot 1 through the existing slot route, and
  the bank records `accepted`.
- *Not this.* He picks a reason, and may add a note. The bank records
  `rejected` with both, and the next move takes its place.
- *Later.* The bank records `deferred`, and slot 1 stays empty and his for the
  rest of the day.
- *Open the ask* or *Open draft*, when the read drafted an ask to the move's
  person or the move is about a draft.

The answers go to the suggestion bank on the existing `strategist_next_step`
surface (ADR-019, ADR-026), so the strategist learns from what he takes and
what he sets aside, and why.

### 2. The first slot of Today proposes (ADR-018 decision 4, overturned in part)

Ruling (Krish, 2026-10-03): the machine proposes Today's first slot when it is
empty. ADR-018 made every Today slot manual first, and afterwards no slot was
set by hand. Slot 1 now holds the proposal until he answers it. Slots 2 and 3
stay his. Hand edits, the shutdown's slots and the ritual are unchanged, and a
slot he has written is never covered by a proposal.

### 3. The decider is Sonnet 5, and moves up a tier only on evidence

The first ruling of the day put the decider on Claude Fable 5.1 and lifted
ADR-026's "never Opus" for this read. Krish then asked whether Fable was worth
its cost on the API. Priced on the dry run's measured token counts (6,356 in
and 3,995 out to write the read; 3,496 in and 522 out for the challenge):

| Decider | A day, with the challenge | A month |
|---|---|---|
| Fable 5.1 | about $0.28, up to $0.60 on a deeper day | about $8 to $20 |
| Opus 5 | about half of Fable | about $4 to $10 |
| Sonnet 5 | about $0.07 | about $2 to $3 |

Nothing had shown that Fable writes a better move than Sonnet 5, and the
cross-lab challenger already supplies the second opinion. Ruling (Krish,
2026-10-03): Fable on the API costs too much for the daily move; it runs on
Sonnet 5 with the GPT-6.1 Sol challenger.

So "never Opus" holds for every strategist read without an exception.
`TOP_TIER_MODEL` keeps Fable callable (priced, its always-on thinking handled,
rescued by itself) for the day a read earns it. The rule for that day: if he
sets aside more than half of the first moves over two weeks, try the top tier
and compare. `scripts/modelRoutePolicy.mts` pins `DAILY_MOVE_MODEL` to Sonnet 5
and keeps the daily route off the top tier and the ladder, so moving up is a
change made on purpose.

### 4. OpenRouter serves a named cheap lane (ADR-024, extended)

Ruling (Krish, 2026-10-03): OpenRouter serves a named cheap lane as well as the
rescue. ADR-024 kept OpenRouter to the rescue path. This adds one more use, and
keeps it narrow.

- Only agents named in `CHEAP_LANE_AGENTS` (`api/_models.ts`) may use it. Today
  that is `enrich-person`.
- The candidates are `CHEAP_LANE_CANDIDATES`: GPT-6 Luna, DeepSeek V4 Flash and
  Claude Haiku 4.5, all through OpenRouter with `data_collection: "deny"`.
  `check-anthropic-fallback` fails the build if a premium model (Sonnet, Opus,
  Fable or Mythos) is ever added.
- The lane starts in **shadow**. Claude still serves every judgment. Each
  enrichment also asks Claude a second time and asks the three candidates, and
  `audit_log` records, field by field, how each candidate agreed with Claude
  against how far Claude agrees with itself.
- A candidate is promoted only when it has at least 50 rows, every reply
  parsed, overall agreement at or above the lower of 90% and Claude's own
  agreement less five points, and no field more than ten points below Claude's
  own agreement on that field. The best agreement serves, and cost breaks a
  tie. The fallback is the next passing candidate from a different provider.
- When no candidate passes, the lane turns **off** and Claude serves alone. So
  shadow spend ends either way.
- When **on**, 2% of judgments also ask Claude. If the serving model stops
  clearing the bar it was promoted on, the lane goes back to shadow and every
  candidate is measured again from scratch.
- Ruling (Krish, 2026-10-03): move enrich-person off Claude behind a measured
  gate; bulk jobs never fall back to Claude. The lane's judgments are never
  rescued by Claude, and Claude's enrichment judgments are never rescued by
  OpenRouter.
- A row in which OpenRouter refused every candidate on account grounds (no key,
  a refused key, no credit) says nothing about the models. It is not recorded,
  so a funding slip cannot reject the lane. Shadow rests for 15 minutes on that
  server instance instead, so a dead key cannot make every enrichment pay for
  comparisons that teach nothing.
- The lane's state is one `system_config` row, `cheap_lane:enrich-person`.
  Every change is recorded through `notifyOps` with the sentence that explains
  it.

### 5. Model primitives that were wrong for the newest models

- Always-thinking models (Fable 5, Mythos 5, Opus 5.5 and Sonnet 5.5) are never
  sent `thinking: {type: "disabled"}`, which they answer with a 400.
  `effortParam` sends `output_config.effort` to the models that take it.
- Fable 5.1 has a price row: $10 and $50 per million tokens, with cache reads at
  $0.25. The rescue maps Fable to Fable, like for like.
- The rescue's daily cap counts only rescue rows, so the challenger's and the
  lane's OpenRouter calls cannot use it up.

## Alternatives considered

- **Choose the cheap model with an offline replay.** Rejected. On the replay's
  reduced evidence a frontier model scored the same as the cheap ones, so the
  test could not discriminate. Shadow measurement on live enrichments, with the
  full evidence, can.
- **Pick one cheap model in advance.** Rejected. Three candidates from three
  providers cost little extra during shadow, and the measure picks.
- **A local model.** Not now. It needs a host that is always on. It can join the
  candidates later behind an OpenAI-compatible endpoint.
- **Push the move to his phone.** Rejected. The OS is pull-only.
- **A second Claude model as the challenger.** Rejected. A model from the same
  lab is more likely to share the decider's blind spots.
- **Let the two models vote, or average them.** Rejected. One decider stays
  accountable for the move. The challenger argues, and the decider decides, only
  when they disagree.
- **Write the move straight into slot 1.** Rejected. The move is his only when
  he takes it.

## Consequences

### Positive

- He opens Home to one concrete move to react to: its person, why today, and
  what it survived, with three one-tap answers.
- Every answer is evidence in the bank, with a reason when he sets a move
  aside.
- Enrichment can leave Claude on evidence, and comes back by itself if the
  evidence turns.

### Negative

- A daily read adds about $0.07 a day, $2 to $3 a month, priced from the dry
  run's token counts. The proposal took 73 to 108 seconds there. The real
  figure arrives with the first live run, metered as `daily-move`.
- During shadow, each enrichment costs about twice as much in Claude calls, plus
  three cheap calls, until the lane decides after at least 50 recorded rows.
- A declined attempt before a served fallback is not metered. The API's
  per-attempt usage entry has no documented shape yet.
- The decider and the cheap lane have never been called live from this
  repository. Every check so far is static, unit, browser fixture or dry run.

### Neutral

- Fable 5.1, if the decider ever moves to it, is a covered model: it needs the
  standard 30-day retention, and an organisation on zero data retention gets a
  400.
- Rescue rows are keyed on a model, never on a job. Keyed on the daily move's
  model, the Fable understudy row would have sent every Sonnet call in the fleet
  to Fable the moment the move moved to Sonnet. A unit test pins it.
- `strategist_reads` gains a `daily` source and a `read_date`, with one daily
  read per date. RLS stays service role only.
- The Home card is `src/components/home/DailyMoveSlot.tsx`, built from the house
  primitives (`Eyebrow`, `WhyBadge`, `RejectReasonBar`). Home never scrolls
  (Krish's ruling the same day, `docs/DESIGN_SYSTEM.md`), so on a short screen
  the card's why and what it survived fold into its "?", its controls fold to
  one row, and on a phone "Not this" asks in the house sheet. Today's slot writes now
  keep the optimistic text until the refreshed row is back, so a taken move
  never shows an empty slot first.
- `e2e/fixtures/audit.ts` carries a populated daily move, so the no-scroll gates
  measure Home with the proposal in place at all four widths.
  `e2e/daily-move-desk.spec.ts` and `e2e/daily-move-phone.spec.ts` cover the
  answers, and `e2e/theme-contrast.spec.ts` measures the card in both themes.
- `check-bridges-never-send` walks `api/strategist/` and `api/_dailyMove.ts`.

## Follow-ups

1. Done on 2026-10-03 with Krish's OK. `20261003120000_the_move_he_reacts_to.sql`
   is applied and recorded as `the_move_he_reacts_to`. Read back on the live
   database in a transaction that rolled back: the source check accepts
   `daily`, a second daily row for the same date is refused, a daily row with a
   goal or without a date is refused, and the anon key is refused outright.
2. After deploy, and with his OK, POST `/api/strategist/daily` once, then read
   back the row, the bank rows and the `daily-move` meter rows.
3. Read the lane's decision sentence in `audit_log` when it comes, and check the
   first promoted week against the drift rows.
4. After two weeks of mornings, read the verdicts on first moves. More than half
   set aside means try the top tier and compare.
5. The next steps in goal and note reads can still name a person, and "Put on
   today" writes them to `daily_focus`, which the anon key can read. They need
   the same check as the daily move.
6. The judge panel and the ladder live in the content engine repository, and are
   a change of their own.
