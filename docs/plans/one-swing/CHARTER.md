# One swing: the charter

Source: Master Ikigai v4 (5 September 2026), Control Center Evolution tab.
Decision record: `docs/DECISIONS/016-ikigai-v4-one-swing.md`. Live ledger:
`STATE.md` beside this file. This file changes only when Krish changes the
ikigai.

## Reframe

Today the Control Center was a fourteen agent autonomous business, partly an end
in itself and a candidate product. Under the ikigai it is the engine under one
swing. Its only job is to make the mission happen faster than Krish can alone:
fill the room, run the room, keep the edge, keep him honest.

## The five jobs, in priority order

| Job | What the OS does | Output Krish sees | Metric |
|---|---|---|---|
| 1. Fill the room | Maintain the list of 25 (then 100) named leaders who fit the face. Draft warm approaches in his voice from live signals about their business. Queue them. Never send without him. | Five drafted approaches every Monday, each with the trigger that makes it timely. | Approaches sent per week (scorecard column B). |
| 2. Keep him honest | Track sent, calls, paid, published, and hours spent building unasked. Report weekly, in public to the partner once one exists. | A Monday scorecard and a Friday variance note. Rule 6 tripwire when unasked build hours exceed zero. | Weeks with zero sent (target: none). |
| 3. Run the room | Prepare the leader's dossier before the room: narrative layer versus revealed layer, what is coming for their sector, the money mechanics. Draft the edge file after. | A verified-record dossier per leader. An edge file per room. | Rooms delivered per month; time from room to edge file. |
| 4. Feed the demand engine | Turn every room finding, keynote and podcast into one published piece a week aimed at the face, with sources. | One drafted piece a week for his voice pass. | Pieces published (scorecard column F); scoping requests. |
| 5. Keep the edge | Run CTRL for paying leaders: daily early sight against their standard, calls logged and scored. | Leader briefings, scored calls. | Paying leaders retained past the room. |

## What the OS stops doing

- Building new agents or repos with no paying room behind them (Rule 6).
- Being pitched as a product. It is proof and engine, not the swing.
- Working on anything outside the one swing. Portfolio is the avoidance pattern.
- Silent success. A green run with nothing sent is a failure. Verify the outcome, not the status.

## Standards the engine holds above memory and workflows

| Standard | Rule | How enforced |
|---|---|---|
| North Star | The mission line. Every agent reads it first. | `api/_mission.ts` via `api/_goals.ts`. Any task that cannot name which of the five jobs it serves is refused. |
| Cited or silent | No number, name or claim ships without a source. | A Room approach without a cited trigger says so on its face. Briefs cut uncited claims. |
| Approval walls | Drafts never send. Krish or the partner sends. | No route under `api/room/*` or `api/scorecard/*` imports `sendGmail`. |
| Public by default | Every build is shown or announced the week it exists. | The Monday note lists the week's builds. |
| One swing | Every calendar item traces to a job above. | The `job` tag on objectives, picks and tasks. |

## The weekly loop

| Day | OS | Krish | Partner (once found) |
|---|---|---|---|
| Monday | Scorecard, five drafted approaches, one drafted piece. | Sends five. Says it out loud to one new person. | Reads the scorecard. |
| Tuesday to Thursday | Dossiers for booked rooms (G2). Edge files for finished rooms (G2). | Rooms and keynotes. Voice pass on the piece. | Sells or follows up. |
| Friday | Variance note: what was sent, what slipped, hours building unasked. | Publishes the piece. Reviews the variance. | Calls out the slip. |

## Evolution gates

| Gate | Add to the OS | Only when |
|---|---|---|
| G1 | Anything in jobs 1 and 2 | Now. These are the tripwires against the revealed failure. |
| G2 | Job 3 tooling (dossiers, edge files) | First room booked. |
| G3 | Job 5 (CTRL for paying leaders) | Two leaders ask to keep it. |
| G4 | Any new agent not in the five jobs; the list grows from 25 to 100 | A paying leader asked for it, in writing; the 25 are worked. |

## Deliberately not built until the gate opens

- The dossier generator and the edge file (G2). When the first room books, the
  spec is: narrative layer versus revealed layer for the leader, what is coming
  for their sector in two quarters with sources, the money mechanics, the first
  three moves; encoded so CTRL can carry it.
- CTRL for paying leaders (G3). Lives in its own repo; nothing here.
- Any new agent (G4). Hunter is parked; Felix stays inactive.

## The scorecard

Twelve weeks ending Fridays, 11 September to 27 November 2026. Columns:
approaches sent, calls taken, paid rooms, cash invoiced (GBP), pieces
published, hours building unasked. Targets by day 90 (5 December): 25, 5, 1,
15000, 12, 0. Stop rule read on 5 October: fewer than 2 of 25 take a call, or
no paid room.
