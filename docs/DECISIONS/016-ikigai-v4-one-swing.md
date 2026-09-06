# ADR-016: Ikigai v4 canon. The Control Center is the engine under one swing

- Status: Accepted
- Date: 2026-09-06
- Deciders: Krish

## Context

Krish locked his Master Ikigai v4 on 5 September 2026 (138 ranked answers across
two batches and twelve rounds). Its Control Center Evolution tab was written
without reading this repo and asked to be reconciled against it. Two facts shaped
the reconciliation.

First, the 29 August rebrand canon (`docs/REBRAND-MINDMAKE-2026-08-29.md`) said the
north-star workbook was context about Krish as a person and that its private
diagnostic route, pricing and PE or VC targeting must not appear in ICP scoring,
agent briefs or outreach. The ikigai v4 reverses that: the room is the door, the
face is the ICP, and warm intros stay the only motion.

Second, the production database showed the outward loop was not running. The
ship ledger was empty, no daily ask had ever been written, no weekly objective
or daily focus was set, 193 hunter bridge candidates sat unhandled and 127
mindmake leads sat at new. The three OS goals (200 leaders served, under two
hours a day on ops, the OS as a licensable asset) predated the ikigai, which
parks the OS as a product.

## Decision

1. The OS rung of the goal ladder is one row, `goal:os:mission`, carrying the
   mission line. The three earlier OS goals are dropped by status, never deleted.
   The row is seeded by SQL because the goal gate rejects OS titles that open
   with a task verb and the mission opens with "Build"; the gate is unchanged
   and this row is the one documented exception. ADR-012 rung 1 now reads "the
   single mission OS goal".
2. `api/_mission.ts` owns the mission, the purpose, the face, the door and the
   five jobs. `api/_goals.ts` prepends its block to the canon every reasoning
   path reads, and closes with: name which of the five jobs this serves; refuse
   work that serves none.
3. Every weekly objective, daily pick and task carries a nullable `job` tag:
   `fill_room`, `keep_honest`, `run_room`, `feed_demand`, `keep_edge`. Chips,
   never selects.
4. The weekly structure stays Krish's: one OS goal, up to three weekly
   objectives he writes, exactly three daily picks. The OS derives today's
   moves from his objectives (`api/daily-focus/suggestions.ts` `os_picks`) and
   keeps him on track; it does not replace his thinking.
5. Acquisition doctrine, amended: the room (a three week private diagnostic,
   fixed fee) is the door. The face is the ICP: a senior leader who will not
   admit to anyone that they are not ready, at a PE or VC backed media, adtech
   or data business Krish already knows. `api/_icpScore.ts` gains the
   `room_face` lane first; `fractional_network`, `mm_ctrl_buyer` and
   `ecosystem_partner` are parked (scored for the record, never the best lane).
   No cold contact, unchanged. Founder visibility on the public site remains an
   open decision and is not touched here.
6. Room approaches are Krish's own correspondence, drafted in his voice through
   `api/_emailDraft.ts` and landed as Gmail drafts. `api/_direction.ts` keeps its
   product-lane rule that nothing is written as Krish; the Room never imports it.
7. The five jobs of the OS and their gates are the build charter
   (`docs/plans/one-swing/CHARTER.md`). Jobs 1 and 2 (the Room lane, the
   scorecard) build now. Job 3 (dossier, edge file) waits for the first booked
   room. Job 5 (CTRL for paying leaders) waits for two leaders asking. Any new
   agent waits for a paying leader asking in writing.
8. Home's vitals line becomes the scorecard line: sent, calls, paid, published,
   unasked hours against the twelve week targets. Rendering stays neutral, no
   colour by number, which keeps the pilot-layer doctrine intact. MRR leaves
   Home; it stays on Growth and Subscriptions.
9. Hunter and the Bridges lane (the job search) are parked behind a build flag,
   reachable by deep link, tables and agent untouched.
10. Compound gets one line under the swing: runway, from a cash balance Krish
    enters and the Spend tab's burn. Nothing else about Compound changes.

## Alternatives considered

- Keep both canons (ikigai internal only). Rejected by Krish: the face and the
  room are the plan, and an ICP that hides them would score the wrong people.
- A Monday plan of ten tasks replacing the three weekly objectives. Rejected by
  Krish: he sets the objectives; the OS finds the moves.
- Build the dossier generator now so a room booked in September has it.
  Rejected under Rule 6: building ahead of a paid ask is the failure mode the
  workbook names.

## Consequences

- Any prompt, brief or agent that reasons from the canon now reads the mission
  and the face first and must name a job.
- The scorecard makes the tripwire visible: commits to repos no paying leader
  asked for count against the week. This change set will register on it.
- The rebrand doc's acquisition section is superseded by this ADR; the naming
  law, voice rules and portfolio allowlist in that doc still stand.
- If the 12 September cold rerun of R12.1 puts anything else first, every data
  change here reverses by status.
