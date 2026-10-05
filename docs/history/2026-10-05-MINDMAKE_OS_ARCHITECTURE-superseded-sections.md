> **Historical.** Archived 2026-10-05 from `docs/MINDMAKE_OS_ARCHITECTURE.md` when it was rebuilt as a lean core. Not current guidance.
> Replaced by: `docs/MINDMAKE_OS_ARCHITECTURE.md` sections 0, 0a to 0c, 1, 2, 10, 11, 16, 18, 19 and 21 as rewritten on 2026-10-05
> Reason: four dated canon blocks (0a to 0d) overruled each other, and the header, outcomes, model tiers, Drive folders, brand tables, ideal day, glossary, paths and update protocol described retired brands, channels and push paths as current.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

# Superseded sections of the architecture doc, as they stood on 2026-10-04


# mind/make OS - Architecture Reference

> **Audience.** Every AI tool aligned to the mind/make OS - Claude Code agents on the VPS, Cursor / Claude Desktop sessions, the N8N runtime's LLM nodes, and the Control Center's `/api/ask-marcus` chat. Plus humans (Krish, contractors, future-you) who need to understand the system end to end.
>
> **Purpose.** This is the **central, aspirational source of truth** for how the OS is built, what its outcomes are, and how it works. Read it on session wake; align decisions against it; if anything you do contradicts it, you change either this doc or the action - never both silently.
>
> **Scope rule.** Document only what should still be true in a week. If a fact ages out faster than that - the day's task list, an in-flight migration, who's on-call - it belongs in `agent_plans`, `tasks`, or a memory file, not here.
>
> **Secrets rule.** This file contains NO credentials. Every key, token, webhook URL, and API endpoint lives in `TOOLS.md` (workspace root) and Supabase `system_config`. When something here says "fetch the X key", that means "look it up in TOOLS.md".
>
> **Canonical location: ONE surface.** This document lives in exactly one place: `docs/MINDMAKE_OS_ARCHITECTURE.md` on `main` of `github.com/krishanraja/control-center`. Read it from a checkout or from `https://raw.githubusercontent.com/krishanraja/control-center/main/docs/MINDMAKE_OS_ARCHITECTURE.md`. **Ruling, Krish, 2026-09-07:** the six-surface inventory that used to sit here (VPS workspace copy, three VPS skill bodies, the VPS repo clone as a write target, and the Google Drive mirror by id) is retired and the copies are deleted for good, because they were too fragile to keep in step and nothing read them. The `mindmake-os` skills on every client are thin routers that point here and carry no body. A copy anywhere else is stale by definition; delete it, never maintain it. No sync script exists any more; there is nothing to sync.
>
> **Kept current by the engine.** `api/architecture/weekly.ts` (Vercel cron, Sunday 13:00 UTC) writes one dated entry at the top of section 20 from the week's build signals and stamps the line below. The Monday note reads the stamp back and says so when it is older than ten days, so a dark cron reads as stale, never as silence. People write rulings (section 0a); the engine writes the record (section 20).
>
> **Last engine refresh:** 2026-10-04
>
> **Update procedure.** Edit this file on GitHub `main`, by PR or by direct push, and that is the whole procedure. The VPS clone at `/root/Projects/control-center` follows with `git pull --ff-only`; it is a checkout, not a surface.
>
> **Last reconciled against live state.** **2026-09-07: the OS is PULL-ONLY, Kai is retired, and n8n git/cloud parity is rebuilt - see section 0b, which supersedes anything below it about notifying Krish or about Kai.** Telegram push was removed across all six layers that could reach him (57 n8n workflows, the openclaw cron registry, 12 agent templates, Control Center's own API, the VPS root crontab, and two unreachable archived workflows); 14 cron runs overnight confirmed zero pings, with the only message going to a family member as intended. The alerts were never stale workflows: n8n ran 2,355 executions in fourteen days and nearly all succeeded, over commercial data frozen since June. **Kai retired**: both its jobs are done by `/api/health/fleet-reconcile` and `/api/health/connections-sweep`, Vercel crons that exist because Kai's approach failed, and nothing read `kai_workflow_snapshots`. **Parity rebuilt**: 154 drift items to 0, `sync.sh --apply` safe again. **107 lost audience contacts recovered** (leads 274 -> 282). Five silent failures fixed, four workflows retired, six retired-brand workflows archived, and Guest Scout's pitch chain, Agatha's State of Union and the credential-health writer repaired.
>
> *Prior:* **2026-08-12 (second pass): the fleet is aligned to the live model.** Ten n8n fields carried `{{ }}` without n8n's leading `=` expression marker, so they transmitted template text verbatim. Two hard-errored (`Nell | Guest Confirmed Cascade` sending `eq.{{ $json.guest_id }}` as a literal PostgREST filter); **five failed silently, which is worse** - model calls in Vera, Nova and Nell whose prompts reached the model containing literal `{{ $json.x }}`, producing plausible answers about nothing and never appearing in any failure count. Seven fixed; two live in an archived workflow n8n refuses to update; one (`Maya | Churn`) was fixed earlier the same day. **Warning for the next sweep: a naive search for `{{` without a leading `=` is ~50% false positives**, because n8n JSON bodies legitimately carry the marker on inner values (`"={{ $json.x }}"`) rather than on the outer field. Also removed: Plinth's live revenue paths (`Fetch Stripe Plinth` in the nightly reconciliation, `Webhook plinth` / `Process plinth` in Revenue Intake), verified safe first because Plinth has **zero customers**. Four stale comments asserting Plinth is a live product were annotated. **Content tab restructured** to Built / Paid / Library - see §5.8.
>
> *Same day, first pass:* **2026-08-12: the fleet was dark for sixteen days and the OS could not see it.** Reconciled directly against the live n8n instance via the public API. The fleet was **10 active of 121 workflows**, not the ~85 this doc claimed; it is now **98 active**. The cause was NOT the execution governor tripping (see §3.4.1) but a heartbeat contract break, and the reason it went unnoticed for sixteen days is that the workflow which WRITES failures was the one failing. Fleet-health signals derived from `workflow_runs` were therefore reporting silence as health. Cadence was retuned before reactivation: four pollers on 15/30-minute intervals projected **12,780 execs/mo against the 10,000 cap**, which would have tripped the governor for real; now ~5,580. Also corrected: the Merciless / OnAlert / Gutted Stripe alerts documented as deactivated on 2026-07-06 were found **active** and have been switched off again, and an archived duplicate (`ZZ ARCHIVED Agatha | Visibility Deep Enrich`) was holding the webhook path its canonical Nova counterpart needed.**
>
> *Prior:* **2026-08-11: the portfolio refocus onto Mindmake's publication** (one content venture, two formats Paid + Built; MYMU became the CTRL lead magnet; Builder Economy fully retired; Signal & Noise demoted to a distribution channel). See section 20 for the full entry. The snapshot that follows is from 2026-07-10 and its counts are older than that: treat any number in it as needing a live check.
>
> *Prior reconciliation:* 2026-07-10 (portfolio overhaul + Content Engine v2 + coherence waves, PRs #179-#183; prior: n8n workflows + execution budget reconciled against the live instance 2026-07-01; n8n schedules right-sized 2026-06-19; CTRL descriptor 2026-06-17). Snapshot: 12 active production agents (14 tracked; Felix + Hunter retired 2026-07-10) across the executive / growth / ops pods, plus 4 personal-life agents; ~100 n8n workflows (~85 active after the 2026-07-10 unpublishings, steady state slightly below the prior ~7,411 scheduled execs/mo against a **10,000/mo** plan cap - see §3.4.1); n8n→Supabase auth consolidated to one service_role credential + infra/API-usage monitoring rebuilt after a SEV-0 key-leak audit (§3.4.2–3.4.3); ~68 Supabase tables/views; ~108 shared skills; ~170 standards; Control Center live at controlcenter.krishraja.com. Autonomous OS diagnostics live (§8.8.6); first OS cleanliness pass complete (8 stale tasks closed, workspace restructure committed, cron-payload secrets migrated). **Content Engine v2 live on the Content tab (§5.8): as of 2026-08-12 three rooms (Built / Paid / Library) with obligations in an always-visible strip above them; This Week is RETIRED - it promised a weekly horizon the data never kept, and an obligation behind a click is one you can forget. Shifts and the feed now live INSIDE a format so the detector has a thesis to measure against. Previously four rooms (This Week / Shifts / Feed / Library), a weekly brief + 37-shift provenance-labeled register replacing idea-at-a-time triage for news; new tables `weekly_briefs`, `shifts`, `shift_evidence`, `content_decisions`; the only Content surface since 2026-09-07, no build flag.** The v2 corpus includes a READ-ONLY cross-project read of mm-ctrl's corroborated `live_headlines_cache` pool (`CTRL_SUPABASE_URL` / `CTRL_SUPABASE_SERVICE_KEY`, project `<project ref removed>`); the OS never writes to the product DB. **Skill induction shipped (§8.7): the learning loop is now generative as well as corrective. Vera clusters repeated wins into `skill_proposals`, Krish approves, and the induced play appends to the agent brief. Self-gates until win density builds.** **Vera gap closure loop shipped (§8.8.7): Vera's weekly behavioural-audit findings now route into owned, tracked tasks (`vera_gaps` ledger + `route_vera_gaps`/`reconcile_vera_gaps`), auto-close when resolved, and escalate to Krish after two unfixed cycles via a 9th `decisions_waiting` branch.**

---

## 0. Mental model in five sentences

1. **mind/make OS is a fleet of AI agents that runs Krish Raja's business portfolio** - content + products: Mindmake as missionary vehicle, content channel, and build-lab; builder products (Fractionl, CTRL, Legibility, Full Time); and content brands (Built, Signal & Noise) - so Krish spends his hours on decisions, not admin.
2. **Supabase is the single source of truth.** Every piece of state - agent identity, sprint plans, tasks, leads, guests, customers, bets, standards, audit log, completeness contracts, silent failures, email drafts, **concept decisions** - lives in one Postgres database (~68 tables). Local JSON for state is banned.
3. **Agents come in two shapes.** *Claude Code agents* (7 - Agatha, Cleo, Arlo, plus four personal-life agents) run inside OpenClaw on a VPS with workspace files, Telegram bots, and full conversational capability. *N8N workflow agents* (~100 workflows, ~85 active, across 12 active production roles + a Krish-inbox/objective group) run on cron or webhook, do one thing, and write the result back to Supabase.
4. **The Control Center (`controlcenter.krishraja.com`) is the single pane of glass.** It reads Supabase via Postgres Realtime; Krish's clicks (approve, reject, promote, deep enrich, schedule, kill, **draft email**, **close concept**) write back to Supabase and fire webhooks to the Orchestrator, which routes them to the right agent. The Home tab is the canon - OS goals → this week's objectives → today's 3 on one no-scroll screen (recomposed 2026-08-20) - and the unified `decisions_waiting` view that surfaces every kind of thing currently waiting on Krish feeds Home's Waiting count (fresh rulings only, `src/lib/freshDecisions.ts`); each ruling is decided in the tab that owns it. The OS Queue was removed on 2026-10-04.
5. **The OS learns, self-heals, and remembers its own closures.** Krish's rejections go to `feedback_queue`; Vera groups them into `corrections`; Agatha turns those into edits on `agents.brief_content` or `standards_registry`. The four-tier silent-failure system (completeness contracts → Silent Success Detector → Critical Infrastructure Monitor → Failure Pattern Sweep) catches workflows that fail without errors. **The closure architecture (`concept_decisions` + `concept_id` cascading via `close_concept`) makes Krish's "we're done with this" decisions durable at the *concept* level instead of the row level, so the same closed concept stops resurfacing across rows, generators, and synthesis surfaces.** Same mistake doesn't survive four occurrences; same silent failure doesn't survive a week; **same concept doesn't get closed twice.** The loop also runs forward: Vera clusters repeated wins into proposed skills that, once Krish approves, append to the agent brief, so a good pattern gets crystallized, not only a bad one corrected.

If a section below contradicts this five-sentence model, the model is right and the section is stale. File an issue.


## 0a. CANON as of 2026-08-06 - read this before anything below it

> **This section supersedes every conflicting statement later in the document.** A
> long session on 2026-08-06 changed four load-bearing structures. Older sections
> were written against the previous model and have been corrected inline where
> found, but where they disagree with this section, **this section wins**.

### The one-source-of-truth rule (the rule that generated the others)

**There is exactly ONE place to enter any given thing, and exactly one table behind it.** Multiple surfaces may READ a table and present different slices of it. No surface may invent its own parallel concept for something that already has a home. Where two surfaces disagreed about what a table meant, that was the bug, not a feature.

The failures this rule exists to prevent, all of which were real in this codebase:
- three surfaces rendering `goals` as three different concepts
- a channel value (`builder_economy_ig`) that was also a venture
- `visibility_targets` used as a PR register with an events schema bolted on
- a second date taxonomy invented per ingest source

### 1. Content: venture → format → channel

Three layers, never two. `lane` used to fuse "what am I working on" with "where does it go", which is why `signal_noise` and `builder_economy` existed as both ventures and lanes.

| Layer | Question | Picked | Home |
|---|---|---|---|
| **Venture** | What am I working on? | first | `venture_registry` (`kind='media'` for content ventures) |
| **Format** | What shape is this? | second, scoped to venture | `venture_formats` |
| **Channel** | Where does it go? | last, multi-select | `media_channels` → `content_ideas.distribution` |

**A channel is never a venture.** `builder_economy_ig` is retired as a lane; Instagram is a channel any venture publishes to.

**Brands (REBRANDED 2026-08-29; canon is `github.com/krishanraja/mindmake`).** The business is **Mindmake** at `mindmake.co`, verified 200. `themindmaker.ai` 308s to it and is infrastructure, never a name. The OS is **mind/make OS**. The advisory sells **two doors, build your AI brain and build your AI GTM, both leading to one privately priced thirty-day paid proof**. There is no offer ladder, no public price and no diary link. The Handover, The Teardown and the 21-day Sprint are RETIRED and stay retired. `live.themindmaker.ai` 301s to `mindmakerlive.substack.com` and hosts **the publication**, which runs exactly two channels, **The Money of AI** and **Built with AI**. It carries paid tiers so it is never described as free. `ctrl.mindmake.co` is **CTRL**, verified 200, kept alive deliberately cheaply; `makeyourmindup.ai` is its lead-magnet surface and no longer a content brand. **Mindmaker LLC** remains the legal entity, and `krish@themindmaker.ai` remains the only published contact address because the mailbox migration has not been done.

**Mindmake's publication formats: there are exactly two.** `Paid` (hero, the investigation, carrying the retired Techonomic register, corpus key `paid`) and `Built` (builder conversations, carrying the builder economy thesis, corpus key `built`).

**Retired as ventures on the same day.** *Builder Economy* is fully retired, feed and back catalogue included. *Signal & Noise* is demoted from venture to **distribution channel**: nothing is commissioned for it, it carries Mindmake's publication material, and its feed, GUID and subscribers are deliberately untouched with no public repositioning made. The `Mindmake's publication` weekly format is retired, because that name is now the CTRL door.

**The Money of AI beat is enforced in code** (`api/_beat.ts`, gate G0), not in a prompt. Out: technical news, model releases, benchmarks, governance, enterprise pilots, funding rounds. In: second-order effects on pricing, positioning, corporate strategy, unit economics, human labour. The rule is "the event is never the story".

### 2. Goals: one ladder, four horizons

`goals` is the single table. `horizon` is the discriminator, `parent_id` is the ladder.

| Horizon | Stale after | Notes |
|---|---|---|
| `os` | 90 days | the top; what the whole system is for |
| `mid_term` | 45 days | hangs off an OS goal |
| `weekly` | 10 days | hangs off a mid-term goal |
| `venture_objective` | 30 days | sharpened from the above; `milestones` decompose it downward |

**One version of every goal**, enforced by a unique index on `(horizon, lower(trim(title)))` for non-terminal statuses. A duplicate is rejected at the database level.

**Staleness is URGENT, not a footnote**, and each horizon has its own clock. `goals_health` exposes `is_stale` and `orphaned` (any non-OS goal with no parent). A stale goal is a confident compass pointing the wrong way: event and content ranking both hang off live goals, so staleness silently misaligns the whole system.

**One editor, `GoalLadder`, is the only place a goal is entered** (`src/components/goals/GoalLadder.tsx`, read `GET /api/goals/ladder`). It renders all four rungs with the same form, so entering an OS goal and entering a weekly goal are the same gesture. It replaced `WeeklyGoals` and `ObjectivesPanel`, which were two different-looking editors over this one table; both are deleted. Correcting the rows had not been enough, because the sense that a goal had several versions came from it having several editors.

**A non-OS rung cannot be saved without naming its parent.** The API refuses the write (`api/objectives/index.ts`) and the form will not submit. "What does this serve?" is answered at creation instead of audited later, which is what let orphans accumulate before.

**Retiring a goal is a status change, never a DELETE.** `Retire` sets `dropped`; the ladder read filters it out and the row keeps the history the learning signals hang off. Permitted statuses mirror `goals_status_objective_check` exactly (`proposed` / `active` / `paused` / `done` / `dropped`) - there is no `archived`.

**An editor may not sit inside `PulseGroup`.** That fold is the ambient room, defined as "informs but never asks". The ladder asks for input, so it renders above it on every branch of both Home files. `scripts/check-goal-ladder.mts` enforces this along with the rest: one creator, four reachable rungs, parents required, retired components not rendered.

**The spine's top card is `Portfolio`, not `OS`.** It counts venture objectives. Calling it OS put it beside the ladder's OS-goals rung saying "No active objectives" while an OS goal was plainly listed. Its count and its list are now built from one predicate, so they cannot drift.

**The week label is derived, never stored** (`api/_week.ts`). `system_config.week_of` held "Week of April 14, 2026" and Home was still showing it in August. A week label is the most temporary fact in the OS; storing it guarantees it is wrong the moment the week turns.

**Energy and anxiety never change goal content.** `MorningCheckin` captures both and `PilotStateContext` computes `capacity` and `mode`. Those drive **sequencing and punch-through** (which milestone today, how much deep work, one hard thing or three easy ones), never what the goals say.

### 3. Events: the attend lane

`events` is the canonical event table for both attending and speaking. `visibility_targets` remains what it actually is: a press and podcast relationship register.

**Rule A, nothing dead is displayed.** Auto-scrub on: speaking deadline passed, event date past, free/cheap event more than 90 days out, or a **temporary** item whose window closed. Items are typed `durable` or `temporary` at capture; a temporary claim is a STATE and states revert.

**Archiving is only ever for the dead.** An away-city event is *unactionable*, not dead, and becomes live the moment a trip is booked. Actionability is a **query-time** concern (`events_for(home_city)`), never destructive. Getting this wrong destroyed 26 New York rows once already.

**An unverified date is worse than no date.** `date_verified=false` rows can never be recommended. Enforced by the `events_recommendable` view rather than remembered by each reader, and `scripts/check-events-honesty.mts` fails both if the view drops the condition and if a reader goes round it to the table.

**Two-axis scoring**, because one number cannot express the asymmetry: **Draw** (peer density: founders, owners and CEOs running a business with real revenue, the people Krish can learn from) and **Demand** (buyer density: who could hire him or buy the pilot). **Practitioner density and vendor density are penalties**, the first heavier on Draw than on Demand. Podcast guest supply survives as a bounded bonus on Draw for a named attendee who clears the peer bar, not as an axis.

> **Draw was redefined on 2026-09-24 ([ADR-025](./DECISIONS/025-draw-is-peer-density.md)).** It read "technical-leader density, where Krish wants to be", justified through podcast supply, and it worked exactly as written: the live top of the lane that day was London PyTorch #28, LLMday NYC, AWS AI In Practice #7, a Claude Code workshop and a model-wrangling hackathon. Krish asked to meet people running successful businesses. Note what the change does NOT do: media, adtech and data LEADERS are `FACE` in `api/_mission.ts` and the people the pilot is sold to, so they keep their Demand score. "Not adtech people" means journalists, vendors and practitioners. The weights live in `api/_eventScore.ts` and `scripts/check-events-honesty.mts` fails if the practitioner penalty turns positive again.

**Cities:** London / New York toggle. **Sydney is temporary and fires on a button press only.** The choice lives in `system_config.operator_home_city`, on the same one-setting-several-consumers pattern as `operator_timezone`: `api/_homeCity.ts` server side, `src/lib/homeCity.ts` in the browser, `public.operator_home_city()` in SQL. Unlike the timezone the DEVICE IS NOT THE AUTHORITY here, and that difference is deliberate: a laptop opened in an airport lounge must not re-point the lane at that airport, and a fortnight in London on a New York base is a judgement no device can make. The timezone supplies the first suggestion and nothing more; after that the value only changes because he pressed something.

**Sources, measured not assumed.** Luma city pages and Meetup search are server-rendered and parse without auth, and as of 2026-09-24 both are read by `api/events/discover.ts` in this repo rather than by an unversioned script on the VPS. Sourcing had been `/root/.openclaw/workspace/scripts/discover-events.py` and friends (`scripts/cron/crontab.txt`), which wrote nothing after 2026-09-09 and was watched by nothing; `event_hosts`, the watchlist meant to drive it, was empty while 242 rows claimed `source='host_watchlist'`. The three routes are `/api/events/scrub` (06:15), `/api/events/discover` (06:45) and `/api/events/score` (07:00), each recording a `workflow_runs` row so a silent stop is visible. Eventbrite serves an AWS WAF bot wall to datacenter IPs (fine from residential, blocked from the VPS), so no browser choice fixes it on a cron. Gmail is the invite-only tier no crawler can see, and is a supplement, not the primary source: an inbox only contains events already found.

### 4. Tooling note

Headless Chrome (`--dump-dom`) is the browser tier for JS-rendered pages. **Skyvern is deliberately not used for scheduled scraping**: it is a metered AI agent (~530 credits/task historically) and paying an agent to read a DOM on a daily cron is the wrong tool.


---

## 0b. CANON as of 2026-09-06 - the OS is PULL-ONLY

> **This section supersedes every conflicting statement later in the document,
> including section 0a where they disagree.** Anything below that describes the
> OS pushing a notification to Krish is now historical.

### The rule

**The OS never initiates contact. Krish goes to Control Center; Control Center
does not go to Krish.** There is no Telegram alerting, no push, no "ping Krish
when X". A finding goes into a table or an agent-report file, and a human reads
it when they choose to.

This replaces a model in which any agent, workflow, cron or API route could
reach Krish's phone. That model failed in a specific and instructive way, so the
reasoning is recorded here rather than just the rule.

### Why: the alerts were accurate about a business that had stopped existing

The alerts felt random because they were computed live, every day, from a
**June snapshot**. n8n was never stale: 2,355 executions in fourteen days,
nearly all succeeding. The machinery was healthy; the data underneath had
frozen. Verified 2026-09-06:

| Table | Rows | Newest |
|---|---|---|
| `leads` | 274 | created 22 June, and only **2 have ever been emailed** (last 9 June) |
| `opportunities` | 2,413 | 2 June |
| `customers` | 22 | of which **2 are active paying**, $12.98 MRR, both CTRL |
| `workflow_runs` | 10,362 | today |

162 of the 274 leads were Apollo cold scrapes, which the no-cold-email doctrine
forbids contacting. Most "customers" were free signups for `onalert` and
`gutted`, both retired. **A green heartbeat over dead data is worse than an
outage, because it buys confidence it has not earned.**

### The six layers that could reach Krish

Silencing had never stuck before because the push paths were not in one place.
All six are now closed:

1. **openclaw cron delivery** - 3 `announce` jobs, 7 `failureAlert` routes, and
   the Arlo Sentinel bound to a Telegram session target.
2. **openclaw agent templates** - 12 files under `workspace/active/templates/`
   instructed agents to message Krish directly. Rewritten to write
   agent-reports.
3. **n8n workflow nodes** - **57 workflows** carried an enabled Telegram node.
   Only three chat ids existed across all of them, all Krish's own.
4. **Control Center's own API** - `notifyOps()` in `api/_alert.ts` POSTed to
   `api.telegram.org`, and four routes called it. It now records to `audit_log`
   and returns `sent: false` honestly. It is kept as a function rather than
   deleted precisely so there is exactly one choke point a future caller cannot
   route around.
5. **The VPS root crontab** - a scheduler entirely separate from openclaw's
   cron registry, with seven scripts sending directly. Their senders now append
   to `/var/log/os-pull-only-alerts.log`.
6. **Archived n8n workflows** - two still hold enabled Telegram nodes but
   cannot execute; archived workflows reject updates via the API.

**Deliberately still able to send, because it is for another person:** a family member's
`loz` briefings, on their own bot account. Silencing the OS never meant
silencing those.

**Deliberately still able to send, to Krish and to nobody else: the weekly slate
link (Krish, 2026-09-19).** Asked how the week's slate should reach him, he chose
a real email over a draft he presses send on: "real send, to you only". It is one
message a week, to his own address, carrying a link to a private page he asked
for. It is an exception to the rule above and it is recorded here so the next
session reads it as a decision rather than as drift, which is what an unrecorded
exception always becomes.

Its bounds, which are the whole of the exception: one recipient, Krish; one
payload, the artifact URL and what it contains; one trigger, a completed slate
run. It sends nothing to anyone else, carries no content of its own that he has
not already been shown, and does not make the OS able to reach him about
anything else. Widening any of those three is a new decision, not this one. The
rule above stands for everything that is not this.

**The two `maa` reminder jobs (group `Mother-Daily`) were DISABLED 2026-09-07
at Krish's request.** They are not a pull-only casualty: they had been exempt,
were repaired earlier the same day, and were then switched off as his call. The
`maa` bot still exists and still receives inbound messages; only the scheduled
morning check-in and evening medication reminder are off. Re-enable with
`openclaw cron enable 67a84d67-a800-46a7-97dc-ef749f5bed9b` (morning) and
`8eabc59c-ef6c-483e-b7cf-e08f8b82ff92` (evening).

### Delivery routing is per-account and must be explicit

The `maa` reminders had been failing with "Message failed" while the agent
reported success in its own summary, on at least two occasions. Cause: neither
job named an `accountId`, so the message tool fell back to a bot that is not a
member of the target group, and Telegram answered `chat not found`. Only the
`maa` bot is in `Mother-Daily`; every other configured bot returns 400 for that
chat id.

**Rule: any cron whose payload sends a message MUST name `channel`, `accountId`
and `target` explicitly, and must not claim delivery unless the tool confirmed
it.** The `loz` jobs already did this correctly and are the pattern to copy.
(The Maa jobs were fixed to match, then disabled 2026-09-07 at Krish's request;
the rule stands for any future message-sending cron.)

### Four silent failures found underneath, all of the same family

Each ran green for months while doing nothing. They are recorded because the
*shape* recurs, not because the individual bugs matter.

1. **A PostgREST upsert whose conflict target cannot be inferred.** (Kai was
   retired 2026-09-07; the bug is recorded because the SHAPE recurs.) Kai's
   `Write Credential Health` had `Prefer: resolution=merge-duplicates` but no
   `on_conflict` query parameter, and the unique constraint was not the primary
   key. Every write returned a duplicate-key error for **fifteen weeks** while
   `onError: continueRegularOutput` swallowed it. `credential_health` therefore
   sat on "all healthy, last verified 19 May" while Apollo returned 401.
   Two more of the same class were found in control-center by validating every
   `onConflict` in the API against the live database with zero-row probes:
   `system_health(component)` failed because its unique index was **partial**,
   and `shift_beats` failed because its index was an **expression** index. A
   partial or expression index cannot be inferred from a plain column list, and
   supabase-js cannot express the predicate. `system_health` is what Control
   Center's SystemsPanel reads, so both of its writers had been failing.

2. **A refactor leaving a downstream node reading a dead field.** Guest Scout's
   insert moved inside a code node that then hardcoded `insert_body: '[]'` as a
   no-op for the legacy HTTP node. A downstream filter still rebuilt its working
   list from `insert_body`, so the pitch chain always received zero. **36
   qualified podcast guests sat at status `scouted` with none pitched since
   27 May**, against an OS whose second priority is booking guests.

3. **A pipeline wired THROUGH its notification node.** Guest Scout's pitch chain
   ran `Build Digest -> Telegram -> Split Candidates`. Disabling Telegram
   severed the last mile. **When silencing a push node, always check what is
   wired downstream of it.**

4. **A watermark written on failure, destroying its own queue.**
   `pull_audience_contacts` stamped `synced_to_os_at` on every row it touched,
   landed or not, while its fetch filters on that column being null. On
   12 August it consumed all 107 app-DB contacts and produced zero leads, and
   those contacts could never be retried. Fixed in migration
   `audience_sync_only_stamp_on_success`; it now stamps only real outcomes and
   returns `retained_for_retry`.

**The tell, in all four cases: a non-zero "scanned" count beside a zero
"written" count.** Never trust a heartbeat that does not assert that the
destination actually moved.

### Also repaired in the same pass

- `Agatha | State of Union Weekly` had failed three weeks running. Two stacked
  causes: a Google Drive per-minute quota error, and then a target Drive folder
  id that no longer resolves at all. Google nodes were given retry with backoff
  and the upload was repointed at the `Agatha` folder
  (`<Drive id removed>`). Verified producing a real Doc.
- `Agatha | Weekly Plan Refresh` had failed three weeks running on an
  unauthorised Telegram node. Disabling that node under the pull-only rule
  fixed the workflow as a side effect.

### git and n8n cloud parity: REBUILT 2026-09-07

Was 43 snapshots against 123 cloud workflows with **154 drift items**, which
made `sync.sh --apply` a loaded gun. **Now 108 local, 108 live cloud, 0 drift,
and `--apply` is safe again.**

Most of the drift was never missing workflows. **The audit matches by NAME**,
and the snapshots had been renamed to "mind/make OS" during the rebrand while
cloud still said "Mindmaker OS": 29 of the 31 local-only files were that rename.
Archived workflows are now excluded from both sides, since they cannot execute
and otherwise reported as permanent `cloud_only` drift forever.

**Every secret anyone ever pasted into a node surfaces in a full export.** The
placeholder map in `scripts/n8n/secrets.mjs` now carries 14 slots, and
`check-no-secrets.mts` gained rules for the classes GitHub's push protection
caught while our own guard passed them: GitHub PATs, a Stripe **restricted
live** key, Resend, Perplexity, Apify. **A local guard weaker than the remote's
teaches false confidence.** Distinct secrets get distinct placeholders, or a
`--apply` swaps one bot or token for another. The real values remain inline in
the CLOUD workflows; moving them to n8n credentials is the actual fix.

### Open, and owned by Krish

- ~~107 audience contacts wrongly stamped~~ **RECOVERED 2026-09-07.** The
  watermark was cleared under a management key and the repaired sync replayed
  all 107 (`{leads: 107, invalid: 0, retained_for_retry: 0}`). `leads` went
  274 -> 282: eight leads that had been permanently destroyed now exist, and the
  newest lead moved from 22 June to current.
- ~~Kai marks credentials healthy without live-testing them~~ **KAI RETIRED
  2026-09-07.** Credential truth now comes from
  `/api/health/connections-sweep`, which sends the cheapest request that proves
  a key can still be served. **Note the boundary:** it probes the keys VERCEL
  holds. n8n holds its own credentials separately, and n8n-side rot is caught by
  `/api/health/fleet-reconcile` instead. Apollo can read `ok` in
  `service_registry` while n8n gets a 401 from it; both are true.
- **The Apollo key is dead** (401), and **the Full Time `sk_live_` Stripe key is
  expired**, which is why `System | Stripe Reconciliation | Nightly` fails every
  night. Revenue truth is stale until it is rotated.
- **Rotation list, expanded 2026-09-07.** Exporting the fleet to git surfaced
  every credential ever pasted into a node. All of these are live and inline in
  cloud: Supabase service-role and anon keys, an n8n API JWT, two Telegram bot
  tokens, **two GitHub PATs**, a **Stripe restricted LIVE key**, three Resend
  keys, Anthropic, Perplexity and Apify. Add the Supabase management key and the
  GitHub PAT found in two local clone `.git/config` files. The Full Time
  `sk_live_` is **expired**, which is why nightly revenue reconciliation fails.


## 0c. CANON as of 2026-09-07 - one surface, kept current by the engine

**Ruling (Krish).** The VPS and Google Drive copies of this document are deleted for good: too fragile to keep up to date, and nothing read them. GitHub `main` is the only surface. The engine keeps it current: the Content Engine's build signals (`docs/CONTENT-ENGINE-BUILD-SIGNALS.md`) feed a Sunday cron that writes the week's entry at the top of section 20 and stamps the header. The three "Weekly Documentation Refresh" Routines (Fractionl Circle, Mindmaker, MM-Ctrl, all Sunday 08:00 UTC, created 2026-05-14 via the HTTP API) were superseded by it and **were deleted by Krish on 2026-09-07**.

**What this retires on the VPS** (the exact steps, for whoever is on the box; also filed as a task for Agatha):

```
rm -f /root/.openclaw/workspace/MINDMAKE_OS_ARCHITECTURE.md /root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md
# the three skill bodies become the thin router from krishanraja/ai-harness skills/mindmake-os/SKILL.md
for d in /root/.claude/skills/mindmaker-os /root/.claude/skills/mindmake-os /root/.cursor/skills-cursor/mindmaker-os /root/.cursor/skills-cursor/mindmake-os /root/.openclaw/skills/mindmaker-os /root/.openclaw/skills/mindmake-os; do
  [ -d "$d" ] && cp /root/Projects/ai-harness/skills/mindmake-os/SKILL.md "$d/SKILL.md"
done
mv /root/.openclaw/workspace/scripts/sync-architecture-surfaces.py /root/.openclaw/workspace/scripts/_retired/
# in sync-to-drive.py remove the MINDMAKE_OS_ARCHITECTURE entry (the Drive file is trashed; the write would 404 every six hours)
# DONE 2026-09-07: the google_drive_sync reference row (1ef31f86-2209-4596-b34a-298ff0ea7a15) is also deleted, so nothing references the file
# in os-autonomous-diagnostics.py and regen-arch-section-4.py point the doc path at /root/Projects/control-center/docs/MINDMAKE_OS_ARCHITECTURE.md, or retire the check
grep -rn "MINDMAKER_OS_ARCHITECTURE\|sync-architecture-surfaces" /root/.openclaw /root/.claude /root/.cursor --include=*.py --include=*.sh --include=*.md -l
```

**What it does not change.** Section 4's regeneration from the live schema, where it still runs, must write to the checkout and push, never to a local copy. (This paragraph used to say `sync-to-drive.py` keeps mirroring agent briefs to Drive. That was retired on 2026-10-05; see 0d.)

## 0d. CANON as of 2026-10-05 - agents report to Control Center, never into Drive

**Ruling (Krish, 2026-10-05).** Control Center (Supabase-backed, https://controlcenter.krishraja.com) is the one place every agent reports what it is doing. An agent writes its runs, status and output to the Supabase tables Control Center reads (`workflow_runs`, `tasks`, `agents.last_run` / `last_output`, and the output tables it owns, such as `home_intelligence`, `corrections`, `visibility_targets`). **An agent never creates or updates a Google Doc in Krish's Drive**, and never pings him (0b still holds: no Telegram). A VPS file that nothing in Control Center reads is not a report.

**Retired the same day (crontab lines commented out, backups kept on the VPS):**
- `sync-to-drive.py` (the 6-hourly per-agent Identity and Action Google Doc mirrors). All 28 `google_drive_sync` rows deleted (backup `/root/google_drive_sync-backup-20261005.json`); the agents' Drive docs trashed; `api/agents/[name].ts` no longer reads the table.
- `cc-doc-creator.sh` (every 15 minutes, turned any task without `link_primary` into a Google Doc, which is how about 50 "Marcus Weekly Synthesis Ready" docs piled up). The doc links it had written were nulled on 52 tasks.
- `arlo-daily-contradiction-audit.sh` (syntactically broken since its Python body was lost; wrote only to a VPS log).
- OpenClaw jobs disabled: `Hunter - Daily Sourcing` (its template `job-hunt-agent.md` does not exist, so it errored every run; Hunter runs from GitHub Actions and `/api/hunter/tick`), `product-agent` (Priya, retired 2026-09-14, was still scanning OnAlert, Gutted and Merciless), `newsletter-draft` (wrote a Mindmaker Live edition into a Google Doc).

**Added the same day.** `openclaw-runs-to-cc.py` on the VPS (root crontab, every 15 minutes) copies every finished OpenClaw cron run from `/root/.openclaw/cron/runs/*.jsonl` into `workflow_runs` (`workflow_id = 'openclaw:<jobId>'`, mapped to the owning agent), so Vera's audits, Marcus's synthesis, Arlo's checks and the Monday agents show in OS > Org instead of only in VPS files. `trg_agents_last_run` advances `agents.last_run` from those rows.

**The second pass, the same day, after Krish read the first.** His rulings, and what each one did:

- **Hunter stays.** Its brief, mandate, KPI and plan now say what it actually is: it runs from GitHub Actions and the `hunter/tick` Vercel cron, not from an OpenClaw job, and it reports into Control Center.
- **Circle is dormant, not retired.** Its rows, repos and workflows are untouched and nothing about it is purged. It is simply off the ladder, so it gets no proactive work. Every brief and template says so in those words, because "retired" and "dormant" had been collapsing into each other.
- **The guest briefing keeps its producer and loses its Doc.** The Nell workflow (`4RfAKh6U5guCmTrc`) still runs three research arms, both gates, the quote verification and the markdown render. Only its tail changed: the markdown it already produced now goes to `guests.briefing_md` instead of being converted to HTML, uploaded to Drive and stamped as a Doc URL, and both Telegram nodes went with it. `GuestCard` opens it in a panel (`src/components/guests/BriefingSheet.tsx`). Guests briefed before today keep their Doc link, labelled as the old Doc. Retiring the workflow outright would have cost the research arms and the verified quotes, which the local fallback in `api/guests/[id]/briefing.ts` does not reproduce; that fallback now works for the first time, because it no longer needs a Google service account to mint a Doc.
- **Both remaining Cleo n8n workflows are retired**, and one of them takes a capability with it. `Draft Post on Demand` (`UL59ByPJJtOK7sBG`) had its only delivery node disabled, so it drafted posts and dropped them; drafting lives in the Content tab. `LinkedIn Distribution` (`O6AUi9W6UxBxhH94`) was the one path that could publish to LinkedIn automatically. It had **zero executions, ever**, and Control Center deliberately never sends (CI guard `check-bridges-never-send`), so publishing to LinkedIn is now a manual act by design rather than by accident. That is a removal, not a migration, and it is written down here as one.
- **The Orchestrator stopped erroring and stopped lying.** `cleo` is unmapped in Agent Dispatch, because it pointed at the retired factory and every Cleo task update ended in "Workflow is not active and cannot be executed". The SEO-brief branch is gone too: it POSTed Maya's briefs to the retired factory webhook with `neverError` set and then marked the task `done` regardless, so a dead factory read as a finished brief. Those briefs now stand as tasks in Control Center.
- **Arlo can no longer push to this repository.** It had unreviewed `git commit` and `git push` to `main` on the repo that is the single source of truth. Its job now diagnoses a failed Vercel build and writes the cause and the fix it would make into `workflow_runs`; it changes nothing. The restriction is enforced, not just asked for: the VPS clone's `remote.origin.pushurl` is the anonymous HTTPS URL, so a fetch still works and a push fails with no credentials. `sync-control-center.sh`, the only other VPS script that pushed, is manual and in no schedule.

**The priority ladder every brief and template now carries** (a "PRIORITY AND REPORTING BLOCK, 2026-10-05" at the top of each active `agents.brief_content` and each live OpenClaw template): 1. Heartside and Full Time. 2. Legibility (formerly Plinth, being re-armed). 3. CTRL and Pulse. Mindmake and its publication run alongside. `agents.brief_content` stays canonical; `render-identity.py` renders it to each SKILL.md. Do not run `sync-briefs-to-skills.sh`: its Google Doc sources are gone.

## 1. Outcomes - what the OS is for

The OS is judged by these outcomes, not by activity. Everything in this doc - every workflow, every table, every cron - exists to move one of these:

| # | Outcome | How we measure | Current vs target |
|---|---|---|---|
| **O-1** | Krish under 2 hrs/day on ops | Time logged + `decisions_waiting` count under 10 | Target: under 10. Live: tracked on Home as the unified panel badge. |
| **O-2** | Builder-product MRR growing + content audience growing + advisory revenue (the missionary/build-lab thesis, measured) | Stripe product MRR (CTRL, Fractionl, ...) + Mindmake's publication subscribers + podcast reach + advisory bookings against a $150k/12mo target | Tracked by MrrTicker + Leo Weekly Report. (Rewritten 2026-07-10 when the $20K consulting outcome was retired with advisory sales. REVISED 2026-08-05: advisory sales REOPENED under the digital-brain thesis, so advisory revenue is back in this objective. REBRANDED 2026-08-29: the ratified offer ladder is RETIRED. The Teardown, The Handover and the Sprint are gone. The advisory now sells two doors, build your AI brain and build your AI GTM, both leading to ONE privately priced thirty-day paid proof. The price is private, so no figure belongs in this doc or on any surface. Advisory is a funder for the product build, not the business.) |
| **O-3** | One person running what traditionally takes 15-30 | Active workflows × success rate × outputs landed | ~85 active workflows. Vera scores fleet health weekly. |
| **O-4** | Same mistake doesn't survive four occurrences, and a repeated win gets crystallized into a skill | `feedback_queue` → `corrections` → brief edit cycle time; plus clustered wins → `skill_proposals` → brief play | Vera Feedback Aggregation runs Sun 06:00 UTC; Vera Success Induction Sweep runs Sun 08:00 UTC (self-gates until win density builds). |
| **O-5** | Same silent failure doesn't survive a week | `silent_failures` → `corrections` via Failure Pattern Sweep | Vera Failure Pattern Sweep runs Sun 07:00 UTC. |
| **O-6** | Zero content published without Krish approval | Standards PUB-001 / PUB-005; audit_log review | Enforced in workflow graph; `X-Agatha-Secret` gates the LinkedIn distribution endpoint. |
| **O-7** | Decision lag under 24h on enriched surfaces | `decisions_waiting.age_hours` p50 | Lead/guest/visibility targets surface enriched with rich previews so Krish answers in seconds. |
| **O-8** | Same closed concept doesn't resurface | `audit_log` events of type `concept_closed`; zero reopens within 30d unless intentional | `concept_id`, `concept_decisions`, `close_concept` live. Conversational close path and generator guards not yet built (see §17.7). |

When a section of this doc describes a workflow, table, or surface, it should be possible to trace back to one of these outcomes in one sentence. If not, that section is suspect.

---

## 2. What's in the box

### 2.1 Infrastructure layer

| Component | Role | Where |
|---|---|---|
| VPS (Ubuntu 22.04) | Hosts OpenClaw, every workspace, system crontab, helper scripts | `/root/.openclaw/` |
| OpenClaw | Agent framework - sessions, cron, Telegram/Discord routing, gateway | `/root/.openclaw/openclaw.json` |
| Supabase | Postgres database (state SSOT), PostgREST API, edge functions, auth, realtime | Project `<project ref removed>` |
| CTRL headlines pool (read-only) | Corroborated daily AI-news pool from the mm-ctrl product (`live_headlines_cache`); Content Engine v2 ingests it daily (§5.8) | Project `<project ref removed>` via `CTRL_SUPABASE_URL` |
| N8N Cloud | ~100 workflows (~85 active, steady state slightly below ~7,400 scheduled execs/mo after the 2026-07-10 unpublishings, 10k/mo cap) running on cron/webhook: orchestrator, agent jobs, integrations | `<the n8n Cloud instance>` |
| Vercel | Hosts Control Center (React + Vite + TS) + `/api/*` proxy functions | Project `control-center` |
| GitHub | Source for Control Center + checked-in N8N workflow snapshots + this doc | `krishanraja/control-center` |
| Google Workspace | Docs, Sheets, Drive, Gmail - output + collaboration + email drafts via OAuth | `krish@themindmaker.ai` |

### 2.2 Model providers and tiering

| Provider | Models in active use | Where |
|---|---|---|
| Anthropic | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 | Default for agent work + content |
| OpenAI | GPT-4o, GPT-4.1-nano | Some N8N AI nodes; lead extraction (cost optimisation) |
| Google | Gemini 2.5 Pro, 1.5 Flash | Fallback + long-context |
| DeepSeek, Moonshot (Kimi), xAI (Grok) | Various | Fallback ladder configured in `openclaw.json` |
| Ollama | Llama 3.2:1b | Local fast inference |
| Perplexity | sonar-pro | Nova Visibility Sweeper + research crons |

**Tiering rules** (enforced by `standards_registry` rule MT-003):

- **Opus 4.7** - Agatha (chat) only. Never in N8N. Never another agent.
- **Sonnet 4.6** - default for any agent doing real work (drafting, synthesis, review, enrichment, plan refresh, email-draft composition, **closure-intent translation**).
- **Haiku 4.5** - heartbeats, classification, quick lookups, all N8N cron LLM calls *except* Vera and Sonnet-grade work (Lead Rater, Enrich, Guest Pitch Draft, Plan Refresh, Failure Pattern Sweep, Email Draft).
- **DeepSeek V4 Flash** - cheapest tier, used for lightweight monitoring crons.
- **GPT-4.1-nano** - HISTORICAL: its only wiring was the `Nell | Lead Document Ingest` extraction step (a known cost optimisation; the legacy node name still said "Claude: Extract Leads"), unpublished 2026-07-10 with the advisory retirement.

### 2.3 External integrations (non-model)

| Service | Purpose |
|---|---|
| Stripe | Payments for Mindmake, Fractionl Circle, Fractionl Pulse, mm-ctrl (Full Time has TEST-mode wiring only, do not charge). The OnAlert / Gutted / Merciless accounts belong to products retired from the OS control plane 2026-07-06 and await Krish's manual sunset |
| Apollo.io | RETIRED for sourcing 2026-07-10 (advisory dropped); credentials kept for possible product research |
| Instantly.ai | PAUSED 2026-07-10: advisory cold email dropped |
| Apify | Web scrapers (25 registered actors - see `apify_actor_registry`) |
| Brave Search | Web search - used by every research-leaning agent and `Agatha | Lead Deep Enrich` |
| Podchaser | Podcast discovery for guest booking |
| Perplexity, Exa, PhantomBuster, BuiltWith, NewsAPI, Tranco | Research helpers. NewsAPI also serves Content Engine v2 shift detection; the CTRL `live_headlines_cache` pool (§2.1) is the primary content corpus |
| Telegram | Per-agent bots (8 distinct accounts). **Inbound chat only where Krish is concerned** - the OS never pushes to him (§0b). Still sends OUTBOUND for other people: Maa's reminders (`maa` bot) and a family member's briefings (`loz` bot). |
| Discord | Open group chat surface for Agatha |
| Gmail (OAuth) | **Email drafts** - every Draft email action across leads/customers/guests creates a draft in Krish's mailbox via the `Cleo | Email Draft` workflow. **Nothing auto-sends. Krish sends manually.** |

Full credential registry + auth patterns + endpoints: `TOOLS.md`. Credentials are also tracked in Supabase `system_config.credential_health` for expiry monitoring.

**HISTORICAL (retired 2026-07-10): interim direct (non-n8n) path.** While the n8n lead/enrich workflows were down (Jun 2026), Apollo ran **directly from Vercel `/api/*` + a metered CLI**, not through n8n: `api/_apollo.ts` (search + bulk reveal), `api/_icpScore.ts` (the ICP rubric), and `scripts/apollo/burn.ts` (search → dedup → enrich → score → insert into `leads`). Gmail drafts + Drive/Docs likewise ran direct via `api/_google.ts` (service-account DWD impersonating `krish@themindmaker.ai`; drafts only, never sent). Every prospect cleared `docs/APOLLO_ICP_RUBRIC.md` before it landed. It traced to the retired consulting form of O-2 plus O-7 (decision lag); the path retired with advisory sales, the tooling stays in the repo for possible product research. See `docs/APOLLO_CREDIT_BURNDOWN.md` (historical).

**Fleet ICP (shareable).** The portable Ideal Customer Profile lives in `docs/ICP.md` (human) + `docs/icp.json` (machine-readable). Six lanes - `mindmake_buyer`, `fractional_network`, `signal_noise_guest`, `builder_economy_guest`, `mm_ctrl_buyer`, `ecosystem_partner` - each with who-to-target, who-to-exclude, Apollo filters, weighted dimensions, and the ≥70 insert gate. The `mindmake_buyer` lane RETIRED 2026-07-10 with advisory sales, and `ICP.md` / `icp.json` / `APOLLO_CREDIT_BURNDOWN.md` are historical documents now; the guest/content lanes remain referenced by Nell/Nova.

---

## 10. Google Drive structure

All polished output lands in a fixed Drive hierarchy. **Hard rule: never create a file in Drive root.**

| Folder | Drive ID | Contents |
|---|---|---|
| Agent Briefs | `<Drive id removed>` | Auto-managed by sync; per-agent subfolders |
| Infrastructure | `<Drive id removed>` | OS docs, migration reports, architecture (this file mirrored here) |
| Client Work | `<Drive id removed>` | Advisory proposals, client deliverables (Meliora-era material stays as archive) |
| Mindmake Strategy | `<Drive id removed>` | Sprint outputs, AI consulting proposals |
| Content | `<Drive id removed>` | LinkedIn posts, brand assets, newsletters |
| Prospecting | `<Drive id removed>` | Outreach sequences, deal trackers |
| Reports | `<Drive id removed>` | Weekly reports, audits, Vera output, **default fallback** if unsure |
| Career | `<Drive id removed>` | CVs, applications |
| Signal Inbox | `<Drive id removed>` | Krish drops files here; Layer 1 Signal Inbox processes them |
| Signal Processed | `<Drive id removed>` | Processed signal files (moved after extraction) |

`google_drive_sync` used to track the per-agent Drive doc mirrors. Its rows were deleted and the mirrors retired on 2026-10-05 (see 0d); agents do not write into Drive.

---

## 11. Portfolio context

The OS actively tracks 8 ventures (`ventures` table, all `status='active'`).

### 11.1 Mindmake's positioning (2026-07-10, revised 2026-08-05)

**Mindmake's scope narrowed on 2026-08-05 to one thesis: the creation of your digital brain, with the express USP that it anchors to live decision making.** It is sold two ways: self-serve in the app (CTRL) and as a managed service with Krish as advisor. The managed engagement is broader than the app: depending on the client it covers overhauling GTM, pricing and positioning for a non-AI-native business, or helping build it for an AI-native one. The digital brain anchored to live decisions is the method and the through-line, not the whole deliverable.

**ADVISORY SALES ARE REOPENED as of 2026-08-05**, reversing the 2026-07-10 ruling below. Objective O-2 still needs revising to carry advisory revenue again. Several agent briefs (nova, felix) carry a standing "never pitch advisory" rule that is flagged in-brief as under revision.

| Venture | Status 2026-07-10 (advisory line superseded 2026-08-05) | OS surface |
|---|---|---|
| **Mindmake** (mindmake.co) | REPOSITIONED: missionary vehicle, proprietary content channel, build-lab for incubating ideas. Advisory sales were DROPPED here and REOPENED 2026-08-05; Maven lessons + CTRL retained | Cleo runs the content engine (weekly brief + shifts). The `mindmake_buyer` ICP lane and Apollo burn-down were retired; 74 advisory leads superseded (audit_log `portfolio_overhaul`) |
| **Meliora** (meliora.company) | RETIRED (consulting engagement ended 2026-07) | Pipeline mechanism retired |
| **AdFixus** (adfixus.com) | RETIRED; venture archived in `ventures` | Campaigns were already paused 2026-06-08; assets remain in OneDrive for the record |

Gutted, Merciless, and OnAlert (already off the control plane 2026-07-06) are now **totally retired**; their manual Stripe/account sunsets remain on Krish's decisions surface.

### 11.2 Builder products

| Product | Domain | Customer slug | OS surface |
|---|---|---|---|
| **mm-ctrl (CTRL)** | ctrl.mindmake.co | `mm_ctrl` | AI decision-clarity product for leaders; live surfaces: decision spine, StoneRead, brain canvas, lesson-kit engine at `/kit`; forced-dark redesign live (PR #186). Webhook `/webhook/mmctrl-stripe-revenue`. **B2C launch lane** per the Acquisition OS (§11.5). The OS reads CTRL's `live_headlines_cache` corroborated pool READ-ONLY (`CTRL_SUPABASE_URL`; same project as the audience app DB) as the Content Engine v2 corpus (§5.8); the OS never writes to the product DB |
| **Circle** | circle.fractionl.ai | `fractionl_circle` | Subscriptions table sweep. Acquisition lane parked (§11.5) |
| **Pulse** | pulse.fractionl.ai | `fractionl_pulse` | Waitlist table sweep. **B2B launch lane**, gated on the demand test (§11.5) |
| **Legibility** | legibility.io | `legibility` | Typed product-data API + MCP for agents. Repo `krishanraja/legibility`, own Supabase `<project ref removed>`. Priya health scan live; no product-truth endpoint, customer sweep, or Stripe webhook yet (TODOs in the workflows). Dev-first, agent-first lane (§11.5) |
| **Full Time** | full-time-alpha.vercel.app | `full_time` | Daily AI football recap. Repo `krishanraja/full-time`, own Supabase `<project ref removed>`. Priya health scan live; Stripe is TEST-mode only; no product-truth endpoint or customer sweep yet |

**Retired from the OS control plane 2026-07-06 (Krish directive):** OnAlert (`onalert`), Gutted (`gutted`), Merciless (`merciless`). Their Stripe/Feedback workflows are deactivated (**re-verified and re-applied 2026-08-12: the three Stripe alerts had drifted back to active and were switched off again; the per-venture Stripe alerts are in any case superseded by the consolidated `Stripe | Revenue Intake`, which owns their webhook paths**), their entries are removed from Priya's scans, Maya's engines, Marcus's synthesis, the competitor scan, the proposal router, all agent briefs, `system_config.fleet_skill_workflow_map_v1`, and `product_truth`. Historical `customers` / `workflow_runs` / attribution rows are preserved, and the `customer_product` enum keeps the old labels (Postgres enums cannot drop values without a rebuild). The apps themselves stay deployed until Krish manually sunsets their Stripe accounts, Vercel projects, and domains.

*Each live builder product emits lifecycle + revenue events to the shared fleet attribution warehouse and publishes a machine-readable product-truth surface the fleet sells from, see **11.4**. Legibility and Full Time are not warehouse-wired yet.*

### 11.3 Creator / content

| Brand | Domain | OS surface |
|---|---|---|
| **Content** (the publication) | live.themindmaker.ai (301 to mindmakerlive.substack.com) | THE content venture, `publication` in venture_registry. Exactly two channels and there is no third: **The Money of AI** (who pays, where value moves, what mechanism changes; the investigative format is called **The Artifact**, never Teardown; the event is never the story) and **Built with AI** (builder conversations, the third turn of the why is the piece, never a stack tour). Carries paid tiers, so never call it free, and always link the branded domain |
| **Signal & Noise** | (podcast) | A **distribution CHANNEL**, not a venture, since 2026-08-11. AI in media; co-hosted with two co-hosts. Carries Mindmake's publication material. Feed, GUID and subscribers deliberately untouched; no public repositioning made |
| ~~The Builder Economy~~ | ~~thebuildereconomy.com~~ (404) | **FULLY RETIRED 2026-08-11**, feed and back catalogue included. The builder economy thesis survives as the Built format, nothing else |
| ~~Personal Brand~~ | (LinkedIn / X) | Superseded by Mindmake's publication. LinkedIn and X are channels |

**Retired from the OS content plane 2026-08-06 (Krish directive):** **Techonomic**. The brand, the `techonomic.co` destination (which never had a production deployment and served a 409 behind a failed TLS handshake), the `techonomic` lane and the `techonomic` factory channel are all gone. What survived was the **format**, not the channel: the investigative register, its harder evidence bar (the `investigation` rubric in `api/_finalPass.ts`, five lenses, an unverifiable load-bearing claim is an instant fail) and the whole investigation pipeline (`api/_investigation.ts`, `api/_gates.ts`, `api/_harness.ts`, `api/investigations/*`).

**Where it lives now (2026-08-11).** That register ships as **Paid**, one of the two Mindmake's publication formats. It folded into MYMU on 2026-08-06 and moved again with everything else when MYMU became the CTRL lead magnet. `tech0nomic.substack.com` and its subscribers still exist and are labelled *(retired)* wherever they surface; Krish owns the Substack-side migration.

**Channel mandates** for the content brands + the lead/visibility outbound overlay live in `/root/.openclaw/skills/content-corpus/SKILL.md` (companion to `krish-voice`). Cleo / Nell / Nova load it before composing for a named channel: it defines what each format is *for* (Paid = follow the money, the investigation of how the digital world gets paid for; Built = the why beneath the why) and what the Signal & Noise channel and the free-lessons-only Maven surface are for and the Five Standards gate every piece must clear.


## 16. Krish's ideal day - what "working" looks like

**Before Krish wakes:**

- Agatha's State of Union lands as a Google Doc in the `Agatha` Drive folder and is read from Control Center (9AM EST weekdays). It does not push.
- Marcus Daily Brief lands in `home_intelligence.daily_brief` (06:30 UTC, weekdays).
- Loz sends a family member her daily Publish Press briefing (7AM EST).
- Overnight cron has completed; results in Supabase.

**Work hours:**

- Gmail-monitor flags important threads at 9AM / 1PM / 5PM ET.
- Krish opens Control Center → Home, which opens on the **"Your decisions" anchor**: typed rulings only, built to reach zero in minutes. Queue chips summarize what waits per queue; agent-carried work sits below as one ambient sentence behind a fold.
  - Lead waiting? Read why_relevant + primary_tension → Promote / Draft email / Schedule follow-up / Close concept.
  - Guest waiting? Read pitch_draft → Confirm / Skip / Edit pitch / Close concept.
  - Visibility waiting? Read suggested_angle → Apply / Decline / Snooze / Close concept.
  - Content decision waiting? Rule on it (brief review / shift proposal / graduation / purge preview) → routes to Content.
  - Idea waiting? Greenlight or kill (kill = close concept).
- Today is the three-verb queue: every task needing him takes exactly Approve / Send back with a note / Defer to a date (`/api/tasks/update`); deferred tasks leave the plate until their date, then come back.
- He sends queued email drafts (he hits send, not draft).
- Approves Cleo's LinkedIn posts.
- Makes the strategic calls Agatha surfaces.
- Chats: Agatha for strategy, Cleo for content, Finno for personal reflection. When Krish says "we're done with X" in any of those chats, Agatha responds with `close_concept('concept:org:X', ...)` and confirms the cascade.

**Background (no Krish input needed):**

- Zara sweeps signals.
- Maya runs SEO intel + nightly customer sweep.
- `/api/health/connections-sweep` live-probes every keyed vendor and `/api/health/fleet-reconcile` reconciles every workflow against the n8n API, both every 6 hours on Vercel cron. Neither is an n8n workflow, deliberately.
- Arlo syncs Control Center every 5 minutes.
- Vera audits standards compliance daily, deep audit Fridays, feedback aggregation and success induction Sundays.
- Marcus refreshes Home Intelligence Mon/Wed/Fri + Sunday deep + Daily Brief weekdays. Marcus pulls leads with `status IN ('ready','contacted','conversation')`, so closed leads never resurface.
- Critical Infrastructure Monitor watches credentials every 3 hours.
- Silent Success Detector watches downstream effects every 8 hours.
- Deep Enrich Retry Sweep picks up unenriched leads/guests/visibility every hour.

**Weekly cadence:**

- Mon: Agatha Plan Refresh (09:00 UTC), Nova Visibility Sweeper (11:00 UTC), weekly-synthesis, product-agent; the approved brief sends, then the 14:00 UTC hard purge (`/api/purge/run`) clears the expired Feed.
- Tue–Thu: Zara signals, content drafts.
- Wed: marketing-agent, newsletter-draft.
- Fri: Leo revenue pulse, Vera deep audit, Marcus Friday Retro 17:00; shifts detect 17:30 UTC, weekly brief assembles 18:00 UTC (Content Engine v2, §5.8).
- Sat–Sun: the weekend brief sitting: 5-10 typed rulings take the drafted brief from ready to approved.
- Sun: Vera Feedback Aggregation 06:00, Vera Failure Pattern Sweep 07:00, Vera Success Induction Sweep 08:00, Truth Reconciler backstop. (A weekly Vera Closure Audit is planned - see §17.7.)
- Last day of month: monthly-all-hands.

---


## 18. Glossary

| Term | Definition |
|---|---|
| **Control Center** | The React dashboard at `controlcenter.krishraja.com`. (Formerly "org-os-dashboard" - name banned.) |
| **Identity** | Static agent config. Lives in `agents.brief_content`. Rare changes. |
| **Plan** | Dynamic sprint state. Lives in `agent_plans` + Action Doc body. Refreshed weekly. |
| **Concept** | The durable identity of a piece of conceptual work - a company you're selling to, a guest you're booking, a visibility target you're pursuing. One concept can manifest as many rows across many tables (lead, task, opportunity, customer); the concept ties them together. Identified by a stable slug like `concept:org:disney`. |
| **Decision** | A durable choice Krish has made about a concept (`closed`, `killed`, `paused`, `reopened`, `completed`). Lives in `concept_decisions`. Never deleted; reopens supersede rather than overwrite. |
| **Orchestrator** | Central N8N webhook router (`u0kIULJBJL4dGcuR`) that dispatches Control Center events to agent workflows. |
| **Standards Registry** | Supabase table of ~170 behavioural rules enforced fleet-wide. |
| **Deliver Gate** | `deliver_gate.py` - enforces standards before agent output leaves the workspace. |
| **Brief Content** | Per-agent operating manual stored in `agents.brief_content`. Rendered to SKILL.md. |
| **Heartbeat** | Periodic poll where agents check `HEARTBEAT.md` for pending tasks. |
| **Signal** | A market or business intelligence data point captured by Zara, Maya, or the Layer 1 Signal Inbox. |
| **Layer 1 Signal Inbox** | The Google Drive folder Krish drops files into; the system processes them into `zara_signals` and tasks. |
| **Feedback Queue** | `feedback_queue` - Krish's rejections, fuel for the learning loop. |
| **Corrections** | `corrections` - patterns Vera extracts from `feedback_queue` (≥3 matches) or from `silent_failures` (Failure Pattern Sweep). |
| **Workflow Run** | A row in `workflow_runs` - the heartbeat every N8N workflow writes per execution. |
| **Pod** | An organisational grouping in `agents.pod` - `executive` / `growth` / `ops`. |
| **Sweeper** | A workflow that polls something on a cron (Maya for customer Supabases nightly; Deep Enrich Retry hourly; Nova Visibility weekly). |
| **Completeness Contract** | A row in `completeness_contracts` declaring the minimum acceptable output of a workflow. Tier 1 of self-healing. |
| **Silent Failure** | A row in `silent_failures`. A workflow ran without erroring but produced no value. Tiered 1–4 by detection mechanism. |
| **Decisions Waiting** | The unified Postgres view + Home panel covering everything across tasks/leads/guests/visibility/ideas currently awaiting Krish. |
| **Venture Registry** | The 3-row `venture_registry` table (mindmake, signal_noise, builder_economy) that drives multi-tag leads and per-venture lanes. |
| **Email Draft** | A row in `email_drafts`. A Cleo-authored Gmail draft sitting in Krish's mailbox, never sent until Krish sends it. |
| **mark_entity_emailed** | Idempotent RPC called by the Cleo Email Draft workflow to stamp `last_emailed_at` and email-draft IDs on the relevant entity. |
| **concept_id** | Text column on closeable tables. The slug form of the durable concept identity (`concept:org:disney`). Indexed. |
| **concept_decisions** | Table keyed by `concept_id`. The ledger of every concept-level decision. |
| **status_change_log** | Append-only table populated by AFTER UPDATE triggers on tasks and leads. Every status transition, attributed via `app.changed_by` + `app.source`. |
| **close_concept** | The RPC that records the decision and cascades terminal status across every tagged row. |
| **reopen_concept** | The inverse RPC. Supersedes the live decision; preserves history. |
| **log_status_change** | Trigger function. Internal - emits a `status_change_log` row whenever `status` changes on `tasks` or `leads`. |
| **closed_lost** | The canonical terminal status for leads when a concept is closed (per the existing `leads_status_check` constraint vocabulary). The runbook called for `dead` but the constraint rejects it; `closed_lost` is the substitute. |
| **concept_closed / concept_reopened** | `audit_log.event_type` values emitted by `close_concept` and `reopen_concept` respectively. |

---

## 19. Quick-reference paths

```
# OpenClaw
/root/.openclaw/openclaw.json                                # Master config
/root/.openclaw/cron/jobs.json                               # ~38 cron job definitions
/root/.openclaw/CLAUDE.md                                    # Session wake protocol

# Workspaces (Claude Code agents)
/root/.openclaw/workspace/                                   # Agatha (main, canonical)
#   (no architecture doc here: the workspace copy was deleted 2026-09-07, see §0c)
/root/.openclaw/workspace/audits/                            # Periodic audit reports
/root/.openclaw/workspace-ops/                               # Arlo
/root/.openclaw/workspace-cleo/                              # Cleo
/root/.openclaw/workspace-loz/                               # Lozatron
/root/.openclaw/workspace-steph/                             # Aria
/root/.openclaw/workspace-finno/                             # Finno
/root/.openclaw/workspace-maa/                               # Devi

# Shared skills (~108 of them)
/root/.openclaw/skills/agent-{name}/SKILL.md                 # Per-agent rendered identity
/root/.openclaw/skills/krish-voice/SKILL.md                  # Mandatory for outbound + email drafts (the HOW)
/root/.openclaw/skills/content-corpus/SKILL.md               # Channel corpus - mandatory companion (the WHAT/WHO per channel + Five Standards gate)
/root/.openclaw/skills/n8n/SKILL.md                          # Mandatory before editing N8N JSON
/root/.openclaw/skills/supabase-edge/SKILL.md                # Edge function patterns

# Google integration
/root/.openclaw/integrations/google/credentials.json
/root/.openclaw/integrations/google/tokens.json
/root/.openclaw/integrations/google/refresh_token.sh         # Cron'd every 6h

# Key automation scripts
/root/.openclaw/workspace-ops/scripts/cc-sync-engine.sh      # Control Center sync (5m)
/root/.openclaw/workspace-ops/scripts/cc-doc-creator.sh      # RETIRED 2026-10-05, cron line commented out
/root/.openclaw/workspace/scripts/openclaw-runs-to-cc.py     # OpenClaw runs -> workflow_runs (15m, added 2026-10-05)
/root/.openclaw/workspace-ops/scripts/cc-task-router.sh      # Chat → tasks router
/root/.openclaw/workspace-ops/scripts/poll_sync_queue.py     # Sync queue drain (5m)
/root/.openclaw/workspace/scripts/render-identity.py         # Brief → SKILL.md (15m)
/root/.openclaw/workspace/scripts/regenerate-standards-digest.py  # 2:30 AM UTC
/root/.openclaw/workspace/scripts/fire-pending-flags.py      # (2m)
/root/.openclaw/workspace/scripts/sync-to-drive.py           # RETIRED 2026-10-05, cron line commented out (agents report to Control Center, not Drive)

# Repos
~/Projects/control-center/                                   # Control Center repo (PRs land here)
n8n/workflows/                                               # Versioned snapshots of audited workflows
docs/MINDMAKE_OS_ARCHITECTURE.md                            # THIS FILE, the one surface (2026-09-07)
docs/audits/                                                 # Closure architecture audit reports here
```

---


---

## 21. Update protocol

Edit this file when the architecture *genuinely* changes: new agent, new pillar, new SSOT table, retired component, new aspirational target, **new closure-architecture surface**. Do not edit it for transient incidents (use `audit_log` + an `agent_plans` blocker entry). Do not embed credentials. Do not paste in agent briefs (they belong in `agents.brief_content`). When in doubt, ask: "will this be true in a week?" If yes → here. If no → somewhere else.

**Anti-duplication rule.** This is the only OS architecture document. If you're tempted to write a sibling - "OS-2026-XX.md", "Mindmake Architecture v2.txt", "complete-os-reference.md" - anywhere in the workspace, edit this file instead. Multiple architecture docs drift; one canonical file does not.

**One location, no mirrors (ruling 2026-09-07).** This file on GitHub `main` is the only copy. The engine writes section 20 weekly (`api/architecture/weekly.ts`); people write everything else, here, by PR or push. If you are on the VPS and want to read it, `git -C /root/Projects/control-center pull --ff-only` and read the checkout.

1. **GitHub, the one surface.** `krishanraja/control-center` on `main`, `docs/MINDMAKE_OS_ARCHITECTURE.md`. Raw read: `https://raw.githubusercontent.com/krishanraja/control-center/main/docs/MINDMAKE_OS_ARCHITECTURE.md`. Locally: any checkout of the repo (Krish's Windows machine, the VPS clone at `/root/Projects/control-center`), which is a checkout and not a copy.

Retired 2026-09-07 and deleted: the VPS workspace copy, the three VPS skill bodies (Claude, Cursor, OpenClaw), and the Google Drive mirror (file id `<Drive id removed>`, trashed 2026-09-07). `sync-architecture-surfaces.py` is retired; `sync-to-drive.py` no longer carries this file. The `mindmake-os` skill on every client is a thin router with no body.
