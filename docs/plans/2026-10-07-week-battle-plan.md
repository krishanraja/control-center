# Battle plan, week of 2026-10-05 (written Wednesday 2026-10-07)

Status: OPEN. Owner: Krish. Source: Marcus's week_open read
`strategist_reads.id = b6171845-ab36-49a2-81ce-5fe709be5597` (complete, prompt
rev 2026-10-07.1), from his note of the same morning, with "hat side"
corrected to Heartside by hand (see "What was corrected" below).

## How a new session runs this

1. Read this file, then `docs/KRISH.md` and `docs/PORTFOLIO.md` for what is
   live now. Live state beats this file.
2. Check what is already done before doing anything. In Supabase project
   `gojpffsrxybbpbdzzrvs`:
   - `select suggestion_id, verdict, final from suggestion_verdicts where suggestion_id in (<the ids below>)`
   - `select * from daily_focus where focus_date >= '2026-10-07'`
   Tick off anything already taken, sent or set aside, and say so first.
3. Work top to bottom, one step at a time. Ask Krish "done, skip or help?"
   on each. Never batch them.
4. People are named here by `contacts.id` only. Read the name, channel and
   the drafted message from the read (`sections->'asks'`) at run time.
5. **Approval wall.** Sending a message, posting anything, ordering or paying
   for anything, or changing an account is Krish's action, approved by him
   immediately before it, every time. A session drafts, prepares and checks.
   It never sends, posts or buys on its own.

## The one rule this week

The stop rule fired on 2026-10-05: fewer than 2 of 25 took a call, no paid
pilot. Marcus's call: a real buyer gets an ask before more building or
polishing. So the first advisory ask goes out before Instagram or anything
cosmetic.

## Start here (now)

| # | Thread | Min | Step | Suggestion id |
|---|---|---|---|---|
| 1 | Make Your Mind Up | 20 | Send today's edition with the video and the Substack post. | `9087537c-79d1-4ff2-ac46-3c0d0a934dc8` |

Help a session can give: none needed beyond a final read-through if asked
(`krish-voice`). Publishing is his action.

## Today

| # | Thread | Min | Step | Suggestion id |
|---|---|---|---|---|
| 2 | Advisory calls | 15 | Send the 15-minute pressure-test ask to contact `909789c0-fa6e-4035-8cd3-3a36dee6c4f0` (LinkedIn DM). Drafted ask: suggestion `250ac1f1-34de-447c-9318-dc00f6ed529b`. | `2b024e89-2614-48e4-8f1b-40facad9622a` |
| 3 | Advisory calls | 30 | List 20 named buyers from the warm network for advisory calls. | `199b76a7-c6ab-47f1-bd9d-eb29f9f9e956` |
| 4 | Pressure testing | 15 | Send the 30-minute pilot-fit ask to contact `7dd377eb-4fef-413a-be65-77284e8794ff` (LinkedIn DM). Drafted ask: suggestion `c1c46c13-c63a-4a1f-891c-31a7c9fec071`. | `80d03dd0-a0ca-4d7c-9e94-9a911770d7e5` |
| 5 | LinkedIn launch | 20 | Write and post the LinkedIn note announcing Make Your Mind Up. | `86c110a9-143a-4f3b-ba8b-58282231f014` |
| 6 | LinkedIn launch | 10 | Send the one-sentence feedback ask on the launch post to contact `307be01c-611b-4cdc-9d51-d48c65198d0b`. Drafted ask: suggestion `7aee6eb0-44b1-45de-b8f7-d37f03b3c2a5`. Do this before step 5 posts. | `545f5535-279d-4462-9688-b4b60006e544` |
| 7 | Heartside | 30 | Order the Heartside samples for ad production. | `2e479f49-2c35-4110-aff5-e4c6cc1325ba` |
| 8 | Heartside | 20 | Set up the Heartside social account. | `c34fcd1c-581d-4fa6-9782-f72a52d0dbf0` |

Today totals about 2 h 20 min.

Help a session can give:
- Step 3: pull warm candidates from `contacts` (tiers `1_reciprocated`,
  `2_core_network`, `3_known_network`) that fit the pilot buyer in
  `product_icp`, and hand Krish a list of 30 to cut to 20. Matching rules:
  `api/_metaImport.ts`; where he knows someone from: `src/lib/knownFrom.ts`.
  Route: `mindmake` for the buyer, `mindmake-os` for live state.
- Steps 2, 4, 6: the asks are already drafted in the read. Offer a
  `krish-voice` pass only if he wants one. He sends them.
- Step 5: draft with `krish-content-marketer` (the angle) then `krish-voice`
  (the words). Check channel status live with `content-corpus` first.
- Steps 7, 8: Heartside is the Shopify store at heartside.io (dog-owner gifts,
  posters, pillows, ornaments in the dog's voice), opening 2026-10-20. Read
  `venture_registry` slug `heartside` and its `product_icp` row first.
  Ordering samples spends money: his call, at the moment of ordering.

Marcus placed 7 and 8 under This week because he read "hat side" as a new hat
line. Krish's note said today, and Heartside opens in 13 days, so they sit
here. If he would rather run Marcus again on the corrected note for a fresh
judgement: Control Center, the read, "Change what you said", send.

## This week

| # | Thread | Min | Step | Suggestion id |
|---|---|---|---|---|
| 9 | Instagram | 40 | Set up the Instagram account and bio for Make Your Mind Up. | `81f818ef-1733-409c-a90f-5446eebb904c` |
| 10 | Heartside | n/a | Ad production, once the samples arrive. Not in the read; from his note. | none |

## Objectives Marcus drafted (his to take or leave on the ladder)

- Book 20 calls, or as many as I can, with people for MindMake advisory.
  (`8b386415-9a7a-40fc-94e4-1eff6b85ca5b`)
- Launch post on LinkedIn today saying I have launched Make Your Mind Up.
  (`a2f3a6d3-0e00-4e11-892f-119dc2fb06cd`)
- Pressure test what the service can deliver with real humans, not Claude,
  before building anything else. (`d5681782-e4c4-436a-b54c-2fa8cd74dd2b`)

Taking one goes through the Focus Ritual's add() and the goal gate, never a
direct insert.

## Done looks like

- At least three advisory asks sent to named buyers by Friday 2026-10-09
  (Marcus's sell_first move).
- One real call where a buyer tries to break the pilot, replacing a Claude
  session (Marcus's isolation move).
- An objection log: after each call, one objection heard and one thing the
  service must deliver every time.

## What was corrected

Krish dictated "hat side" for Heartside. On 2026-10-07 the read's headline,
close, two steps, their thread label, both suggestion rows and the stored note
text were corrected in place in Supabase, wording only. Marcus's judgement was
not re-run.

## Control Center follow-ups (separate from his week)

- Marcus took "hat side" literally because nothing in a note read checks
  phrases against `venture_registry.display_name`. A close miss of a product
  name ("hat side" for Heartside) could be flagged in the read's `heard`
  line or resolved before the model sees it. Needs a design call from Krish
  before building.
- The 12000-token ceiling (fixed in `460d3fb`) was inferred from timing, not
  measured: `meter_daily` keeps only daily totals. Logging `stop_reason` and
  `output_tokens` per strategist call would make the next budget call a fact.
