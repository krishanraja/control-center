# Mindmaker OS - Architecture Reference

> **Audience.** Every AI tool aligned to the Mindmaker OS - Claude Code agents on the VPS, Cursor / Claude Desktop sessions, the N8N runtime's LLM nodes, and the Control Center's `/api/ask-marcus` chat. Plus humans (Krish, contractors, future-you) who need to understand the system end to end.
>
> **Purpose.** This is the **central, aspirational source of truth** for how the OS is built, what its outcomes are, and how it works. Read it on session wake; align decisions against it; if anything you do contradicts it, you change either this doc or the action - never both silently.
>
> **Scope rule.** Document only what should still be true in a week. If a fact ages out faster than that - the day's task list, an in-flight migration, who's on-call - it belongs in `agent_plans`, `tasks`, or a memory file, not here.
>
> **Secrets rule.** This file contains NO credentials. Every key, token, webhook URL, and API endpoint lives in `TOOLS.md` (workspace root) and Supabase `system_config`. When something here says "fetch the X key", that means "look it up in TOOLS.md".
>
> **Canonical location & full copy inventory.** This document lives in EXACTLY these six places, kept in sync together. No copy may exist anywhere else (local disk, Downloads, OneDrive, scratch repo clones) - any other "OS architecture" file is stale; delete it, never maintain it. The body is byte-identical across locations 1–5; the Google Drive copy (6) is updated manually by Krish and lags the rest.
>
> 1. **VPS - source of truth:** `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md`
> 2. **control-center GitHub repo:** `docs/MINDMAKER_OS_ARCHITECTURE.md` (local clone mirrors this).
> 3. **Claude skill:** `~/.claude/skills/mindmaker-os/SKILL.md` - the `mindmaker-os` frontmatter followed by this exact body.
> 4. **Cursor skill:** `~/.cursor/skills-cursor/mindmaker-os/SKILL.md` - same frontmatter + body.
> 5. **VPS skill:** `/root/.openclaw/skills/mindmaker-os/SKILL.md` - rendered/synced copy that skill-aware agents on the VPS load.
> 6. **Google Drive:** the `MINDMAKER_OS_ARCHITECTURE.md` markdown file in the `Infrastructure` folder, file id `1F0srFZSS-Nvg2RlUG84zVSvuiN9o8zDc` - updated manually by Krish, lags the rest.
>
> **Manual step (Krish only):** after each update, copy the Claude-skill version into Claude **browser** skills by hand - that surface has no automated sync. Everything in 1–5 is synced together programmatically and is byte-identical (these copies carry no YAML frontmatter - the skill registers off the H1 title).
>
> **Last reconciled against live state.** 2026-07-10 (portfolio overhaul + Content Engine v2 + coherence waves, PRs #179-#183; prior: n8n workflows + execution budget reconciled against the live instance 2026-07-01; n8n schedules right-sized 2026-06-19; CTRL descriptor 2026-06-17). Snapshot: 12 active production agents (14 tracked; Felix + Hunter retired 2026-07-10) across the executive / growth / ops pods, plus 4 personal-life agents; ~100 n8n workflows (~85 active after the 2026-07-10 unpublishings, steady state slightly below the prior ~7,411 scheduled execs/mo against a **10,000/mo** plan cap - see §3.4.1); n8n→Supabase auth consolidated to one service_role credential + infra/API-usage monitoring rebuilt after a SEV-0 key-leak audit (§3.4.2–3.4.3); ~68 Supabase tables/views; ~108 shared skills; ~170 standards; Control Center live at controlcenter.krishraja.com. Autonomous OS diagnostics live (§8.8.6); first OS cleanliness pass complete (8 stale tasks closed, workspace restructure committed, cron-payload secrets migrated). **Content Engine v2 live on the Content tab (§5.8): four rooms (This Week / Shifts / Feed / Library), a weekly brief + 37-shift provenance-labeled register replacing idea-at-a-time triage for news; new tables `weekly_briefs`, `shifts`, `shift_evidence`, `content_decisions`; gated behind `VITE_CONTENT_V2_ENABLED` (ON in prod).** The v2 corpus includes a READ-ONLY cross-project read of mm-ctrl's corroborated `live_headlines_cache` pool (`CTRL_SUPABASE_URL` / `CTRL_SUPABASE_SERVICE_KEY`, project `bkyuxvschuwngtcdhsyg`); the OS never writes to the product DB. **Skill induction shipped (§8.7): the learning loop is now generative as well as corrective. Vera clusters repeated wins into `skill_proposals`, Krish approves, and the induced play appends to the agent brief. Self-gates until win density builds.** **Vera gap closure loop shipped (§8.8.7): Vera's weekly behavioural-audit findings now route into owned, tracked tasks (`vera_gaps` ledger + `route_vera_gaps`/`reconcile_vera_gaps`), auto-close when resolved, and escalate to Krish after two unfixed cycles via a 9th `decisions_waiting` branch.**

---

## 0. Mental model in five sentences

1. **Mindmaker OS is a fleet of AI agents that runs Krish Raja's business portfolio** - content + products: Mindmaker as missionary vehicle, content channel, and build-lab; builder products (Fractionl, CTRL, Legibility, Full Time); and content brands (Builder Economy, Signal & Noise) - so Krish spends his hours on decisions, not admin.
2. **Supabase is the single source of truth.** Every piece of state - agent identity, sprint plans, tasks, leads, guests, customers, bets, standards, audit log, completeness contracts, silent failures, email drafts, **concept decisions** - lives in one Postgres database (~68 tables). Local JSON for state is banned.
3. **Agents come in two shapes.** *Claude Code agents* (7 - Agatha, Cleo, Arlo, plus four personal-life agents) run inside OpenClaw on a VPS with workspace files, Telegram bots, and full conversational capability. *N8N workflow agents* (~100 workflows, ~85 active, across 12 active production roles + a Krish-inbox/objective group) run on cron or webhook, do one thing, and write the result back to Supabase.
4. **The Control Center (`controlcenter.krishraja.com`) is the single pane of glass.** It reads Supabase via Postgres Realtime; Krish's clicks (approve, reject, promote, deep enrich, schedule, kill, **draft email**, **close concept**) write back to Supabase and fire webhooks to the Orchestrator, which routes them to the right agent. The Home tab is anchored by a unified `decisions_waiting` view that surfaces every kind of thing currently waiting on Krish.
5. **The OS learns, self-heals, and remembers its own closures.** Krish's rejections go to `feedback_queue`; Vera groups them into `corrections`; Agatha turns those into edits on `agents.brief_content` or `standards_registry`. The four-tier silent-failure system (completeness contracts → Silent Success Detector → Critical Infrastructure Monitor → Failure Pattern Sweep) catches workflows that fail without errors. **The closure architecture (`concept_decisions` + `concept_id` cascading via `close_concept`) makes Krish's "we're done with this" decisions durable at the *concept* level instead of the row level, so the same closed concept stops resurfacing across rows, generators, and synthesis surfaces.** Same mistake doesn't survive four occurrences; same silent failure doesn't survive a week; **same concept doesn't get closed twice.** The loop also runs forward: Vera clusters repeated wins into proposed skills that, once Krish approves, append to the agent brief, so a good pattern gets crystallized, not only a bad one corrected.

If a section below contradicts this five-sentence model, the model is right and the section is stale. File an issue.

---

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

**Brands.** `themindmaker.ai` is the business (managed advisory + CTRL self-serve). `makeyourmindup.ai` is **MYMU**, the content brand, at the root; the Decide / Extend / Imagine product doors remain as lead magnets at their own URLs. Signal & Noise and Builder Economy keep their own shows and their own RSS feeds; **`MYMU: Built` draws from the Builder Economy recording, it does not replace it**, and that feed GUID is never renamed.

**MYMU formats:** `MYMU: Teardown` (hero, the retired Techonomic register, slot key `investigation`), `Make Your Mind Up` (the weekly), `MYMU: Built`.

**The weekly is not a digest.** Best / Worst / Ugliest triptych, then one real decision with two defensible answers, then Krish commits in public with a date, then Wrong Last Week. **The commitment and the revisit ARE the format.**

**The Teardown beat is enforced in code** (`api/_beat.ts`, gate G0), not in a prompt. Out: technical news, model releases, benchmarks, governance, enterprise pilots, funding rounds. In: second-order effects on pricing, positioning, corporate strategy, unit economics, human labour. The rule is "the event is never the story".

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

**An unverified date is worse than no date.** `date_verified=false` rows can never be recommended.

**Two-axis scoring**, because one number cannot express the asymmetry: **Draw** (technical-leader density, where Krish wants to be) and **Demand** (commercial-leader density, who could hire or buy). Podcast guests are the reconciler: every technical leader in a room is potential guest supply, so high-Draw rooms serve an active goal.

**Cities:** London / New York toggle. **Sydney is temporary and fires on a button press only.**

**Sources, measured not assumed.** Luma city pages and Meetup search are server-rendered and parse without auth. Eventbrite serves an AWS WAF bot wall to datacenter IPs (fine from residential, blocked from the VPS), so no browser choice fixes it on a cron. Gmail is the invite-only tier no crawler can see, and is a supplement, not the primary source: an inbox only contains events already found.

### 4. Tooling note

Headless Chrome (`--dump-dom`) is the browser tier for JS-rendered pages. **Skyvern is deliberately not used for scheduled scraping**: it is a metered AI agent (~530 credits/task historically) and paying an agent to read a DOM on a daily cron is the wrong tool.


## 1. Outcomes - what the OS is for

The OS is judged by these outcomes, not by activity. Everything in this doc - every workflow, every table, every cron - exists to move one of these:

| # | Outcome | How we measure | Current vs target |
|---|---|---|---|
| **O-1** | Krish under 2 hrs/day on ops | Time logged + `decisions_waiting` count under 10 | Target: under 10. Live: tracked on Home as the unified panel badge. |
| **O-2** | Builder-product MRR growing + content audience growing + advisory revenue (the missionary/build-lab thesis, measured) | Stripe product MRR (CTRL, Fractionl, ...) + MYMU subscribers + podcast reach + advisory bookings against a $150k/12mo target | Tracked by MrrTicker + Leo Weekly Report. (Rewritten 2026-07-10 when the $20K consulting outcome was retired with advisory sales. REVISED 2026-08-05: advisory sales REOPENED under the digital-brain thesis, so advisory revenue is back in this objective. Ratified shape: The Teardown $3,500 and The Handover $30,000 under 250 people or $50,000 for 250 to 5,000, capped at 6 engagements a year, target about $150,000 over 12 months. Advisory is a funder for the product build, not the business.) |
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
| Supabase | Postgres database (state SSOT), PostgREST API, edge functions, auth, realtime | Project `gojpffsrxybbpbdzzrvs` |
| CTRL headlines pool (read-only) | Corroborated daily AI-news pool from the mm-ctrl product (`live_headlines_cache`); Content Engine v2 ingests it daily (§5.8) | Project `bkyuxvschuwngtcdhsyg` via `CTRL_SUPABASE_URL` |
| N8N Cloud | ~100 workflows (~85 active, steady state slightly below ~7,400 scheduled execs/mo after the 2026-07-10 unpublishings, 10k/mo cap) running on cron/webhook: orchestrator, agent jobs, integrations | `krishraja10101.app.n8n.cloud` |
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
| Stripe | Payments for Mindmaker, Fractionl Circle, Fractionl Pulse, mm-ctrl (Full Time has TEST-mode wiring only, do not charge). The OnAlert / Gutted / Merciless accounts belong to products retired from the OS control plane 2026-07-06 and await Krish's manual sunset |
| Apollo.io | RETIRED for sourcing 2026-07-10 (advisory dropped); credentials kept for possible product research |
| Instantly.ai | PAUSED 2026-07-10: advisory cold email dropped |
| Apify | Web scrapers (25 registered actors - see `apify_actor_registry`) |
| Brave Search | Web search - used by every research-leaning agent and `Agatha | Lead Deep Enrich` |
| Podchaser | Podcast discovery for guest booking |
| Perplexity, Exa, PhantomBuster, BuiltWith, NewsAPI, Tranco | Research helpers. NewsAPI also serves Content Engine v2 shift detection; the CTRL `live_headlines_cache` pool (§2.1) is the primary content corpus |
| Telegram | Per-agent bots (8 distinct accounts) for chat + push |
| Discord | Open group chat surface for Agatha |
| Gmail (OAuth) | **Email drafts** - every Draft email action across leads/customers/guests creates a draft in Krish's mailbox via the `Cleo | Email Draft` workflow. **Nothing auto-sends. Krish sends manually.** |

Full credential registry + auth patterns + endpoints: `TOOLS.md`. Credentials are also tracked in Supabase `system_config.credential_health` for expiry monitoring.

**HISTORICAL (retired 2026-07-10): interim direct (non-n8n) path.** While the n8n lead/enrich workflows were down (Jun 2026), Apollo ran **directly from Vercel `/api/*` + a metered CLI**, not through n8n: `api/_apollo.ts` (search + bulk reveal), `api/_icpScore.ts` (the ICP rubric), and `scripts/apollo/burn.ts` (search → dedup → enrich → score → insert into `leads`). Gmail drafts + Drive/Docs likewise ran direct via `api/_google.ts` (service-account DWD impersonating `krish@themindmaker.ai`; drafts only, never sent). Every prospect cleared `docs/APOLLO_ICP_RUBRIC.md` before it landed. It traced to the retired consulting form of O-2 plus O-7 (decision lag); the path retired with advisory sales, the tooling stays in the repo for possible product research. See `docs/APOLLO_CREDIT_BURNDOWN.md` (historical).

**Fleet ICP (shareable).** The portable Ideal Customer Profile lives in `docs/ICP.md` (human) + `docs/icp.json` (machine-readable). Six lanes - `mindmaker_buyer`, `fractional_network`, `signal_noise_guest`, `builder_economy_guest`, `mm_ctrl_buyer`, `ecosystem_partner` - each with who-to-target, who-to-exclude, Apollo filters, weighted dimensions, and the ≥70 insert gate. The `mindmaker_buyer` lane RETIRED 2026-07-10 with advisory sales, and `ICP.md` / `icp.json` / `APOLLO_CREDIT_BURNDOWN.md` are historical documents now; the guest/content lanes remain referenced by Nell/Nova.

---

## 3. The agent fleet (the OS in motion)

### 3.1 Two shapes, one fleet

**Claude Code agents** live in OpenClaw, have a workspace, a Telegram bot, identity files, and conversational memory across sessions (via files). They are interactive - you message them, they message back, they take multi-turn instructions.

**N8N workflow agents** are one-shot scheduled or webhook-triggered jobs. They wake, fetch context, call an LLM (or not), write the result to Supabase + (often) Telegram + (sometimes) Drive, and die. No state between runs except what they wrote to the DB.

Some agents (Vera, Marcus, Cleo, Nova, Nell, Agatha) exist in *both* forms. Intentional split: the N8N side runs the routine pulse; the Claude Code side handles ad-hoc deeper work.

### 3.2 The production agents (14 tracked, 12 active)

These are the agents the OS itself tracks via `agents.brief_content` (identity) and `agent_plans` (sprint plan). Personal-life agents (loz/steph/finno/maa) live only in OpenClaw config; they're outside the Mindmaker business and don't appear here.

#### Executive pod

| Agent | Role | Trigger | KPI focus |
|---|---|---|---|
| **Agatha** | Chief Operating Officer | chat (Telegram + Discord) | Decision throughput, blocked-on-Krish under 5, closure-intent translated correctly from chat to `close_concept` |
| **Marcus** | Business Development Intelligence + COO synthesis | scheduled (4×/day) | Synthesis quality, customer + market signal density; synthesis-time `concept_decisions` JOIN not yet wired (see §17.7) |

#### Growth pod

| Agent | Role | Trigger | KPI focus |
|---|---|---|---|
| **Cleo** | Content Production & Voice (coordinator) | webhook only (Krish-triggered) | Posts approved/published per week; **email drafts** approved per week |
| **Felix** | RETIRED 2026-07-10 (advisory sales dropped; `agents.active=false`, workflow unpublished) | none | none |
| **Hunter** | RETIRED 2026-07-10 (`agents.active=false`, Job Sweep unpublished). NOTE 2026-08-05: the original reason no longer holds; re-arming is Krish's call alone | none | none |
| **Maya** | Customer Acquisition (Marketing / SEO) | scheduled (7×/day) | SEO striking-distance gains, customer sweep freshness |
| **Nell** | Outbound + Podcast Guest Booking | scheduled (3×/day) | Guests booked, replies, conversations |
| **Nova** | Visibility & Speaking | scheduled (2×/day + Mon weekly sweep) | Confirmed talks, PR placements |
| **Zara** | Signal Intelligence & Market Research | scheduled (5×/day) | Distinct fresh signals/day; warm paths to Nova |

#### Ops pod

| Agent | Role | Trigger | KPI focus |
|---|---|---|---|
| **Arlo** | Technical Ops & Infrastructure | scheduled | System uptime, sync lag, deploy health |
| **Kai** | Technical Architecture / Integrations | scheduled (6×/day) | Credential health, workflow health, dependency map currency |
| **Leo** | Chief Revenue Officer | scheduled (weekly) | Revenue MTD, runway clarity, 3-venture funnel maps |
| **Priya** | Product Strategy | scheduled (1×/day) | Per-product health score, weekly rollup |
| **Vera** | Chief of Staff & Quality | scheduled (2×/day + Fri deep + Sun feedback + Sun failure-pattern + Sun success-induction sweep) | Standards compliance, drift detection, audit closure, skills induced from wins |

The roster lives in three places that must agree: Supabase `agents` (authoritative), `docs/AGENTS.md` in this repo, and `api/agents/[name].ts:available_agents` (fallback list). If the table grows or shrinks, all three change in the same commit.

### 3.3 Personal-life Claude Code agents (not in Supabase `agents`)

| Agent | Workspace | Telegram bot | Purpose |
|---|---|---|---|
| Lozatron (`loz`) | `~/.openclaw/workspace-loz` | Loz Bot | Lauren's personal AI; daily news briefings; separate from Krish-side ops |
| Aria (`steph`) | `~/.openclaw/workspace-steph` | Steph Bot | Steph's thinking partner; sandboxed |
| Finno (`finno`) | `~/.openclaw/workspace-finno` | Finno Bot | Krish's personal therapy + financial reflection; strictly isolated from business |
| Devi (`maa`) | `~/.openclaw/workspace-maa` | Maa Bot | Family health coordinator for Krish's mother; group chat enabled |

**Hard rule.** `laurenkthermos@gmail.com` is Lauren's, not Krish's. NEVER use it for Drive/Docs/Gmail outside `loz` workspace.

### 3.4 N8N workflow inventory (~105 workflows tracked, ~82 active, ~23 inactive)

Live inventory (reconciled against the runtime 2026-07-01), grouped by name prefix. Active counts reflect the 2026-07-01 changes (2 broken workflows disabled, Kai mapper re-enabled, Critical Infra Monitor retired to the VPS - see §3.4.1 / changelog) and the 2026-07-10 portfolio-overhaul unpublishings (Felix tracker, Hunter Job Sweep, Nell Apollo Enrichment + Lead Document Ingest + Draft Outbound):

| Prefix | Active | Role |
|---|---|---|
| **System** | 18 | Orchestrator, Control Center Live Sync, Daily Morning Brief, Error Monitor, Workflow Monitor, Cost Advisor, Status Board API, Krish Approval Callback, Krish Feedback Receiver, Monthly All Hands, Apify Registry Keeper, Truth Reconciler, Silent Success Detector, Status Update Receiver, Product Proposal → GitHub Issue, Proposal Executor, Competitor Health Scan, **Audience Pipeline** (sync every 15m + reconcile daily 07:30). (Critical Infrastructure Monitor **retired 2026-07-01** - now runs on the VPS at `*/5`; §3.4.1.) |
| **Cleo** | 11 | Omnichannel Content Factory, Draft Post on Demand, LinkedIn Distribution, Log Content Performance, Newsletter Sweep, Content Idea Capture, Email Draft (Gmail OAuth), + **Content Transform**, **Content Lane Sourcing**, **Inspiration Sweep**, **Synthesis Engine** |
| **Nell** | 7 | Guest Scout, Guest Sheet Bulk Import, Guest Confirmed Cascade, Guest Pitch Draft, + **Briefing Stuck-Generating Sweep** (every 4h), **Guest Pitch Enrich (Exa)**, **Guest Speaker Briefing** (Apollo Contact Enrichment, Draft Outbound Messages, Lead Document Ingest unpublished 2026-07-10) |
| **Agatha** | 8 | Content Angle Approval, Portfolio Pipeline Triage/Dispatch/Analytics, Product Proposal Review, State of Union Weekly, Lead Deep Enrich, Weekly Plan Refresh (Mon 09:00 UTC). Closure Intent Receiver still planned (§17.7). |
| **Krish** | 6 | **NEW GROUP** - Inbox Return Detector (every 15m), Inbox Router, Inbox Classifier, Inbox Digest (Sun 17:00 UTC), Focus Calibrator, Objective Milestone Proposer |
| **Stripe** | 3 | **Revenue Intake** (consolidated 2026-07-07: one workflow hosting both live webhook paths `/webhook/{mmctrl\|fractionl}-stripe-revenue`, HMAC signature verification arms itself when `system_config.stripe_webhook_signing_secrets` is populated; forged-event rejection adversarially tested); **Reconciliation Nightly** (05:00 UTC, Stripe is ground truth: upserts subscribers from live subscriptions via `system_config.stripe_price_product_map`, marks lapsed paid rows churned, surfaces unmapped price ids in audit_log instead of guessing); Mindmaker OS Payment Alert. (The per-product alert clones are retired: Merciless/OnAlert/Gutted 2026-07-06, Fractionl/mm-ctrl superseded by Revenue Intake 2026-07-07) |
| **Feedback** | 2 | Weekly per product (Fractionl Circle, Fractionl Pulse). (Gutted/Merciless/OnAlert weeklies deactivated 2026-07-06, product retirement) |
| **Vera** | 4 | Behavioural Auditor, Feedback Aggregation (Sun 06:00 UTC), Failure Pattern Sweep (Sun 07:00 UTC), Success Induction Sweep (Sun 08:00 UTC) |
| **Nova** | 4 | Closed-Loop PR Engine, Visibility Sweeper (Mon 11:00 UTC; retry sub-trigger every 6h), Podchaser → Visibility (Outbound), enrich endpoint |
| **Marcus** | 4 | Synthesis + Home Intelligence (Mon + Wed/Fri + Sun deep), Daily Brief 06:30, Friday Retro 17:00, Monday Pre-mortem 08:00 |
| **Zara** | 3 | Content Pipeline (Zara→Cleo→Maya; interval set to daily 08:00 on 2026-07-01), Layer 1 Signal Inbox, OS - Zara Signal Sweep (Mon–Fri 10:00 EST) |
| **Maya** | 2 | Closed-Loop Revenue Engine, Customer Acquisition Sweeper. (Churn → Exit Interview **disabled 2026-07-01** - broken; §3.4.1) |
| **Priya** | 2 | Daily Health Scan, Weekly Product Rollup |
| **Kai** | 2 | Kai Helper - Slim Workflows Fetch (sub-workflow); Dependency Mapper + Credential Health (`fBgBwoAg0YdkabtU`, every 4h - **re-enabled 2026-07-01**, on probation, no prior execution history) |
| **Acquisition** | 3 | **NEW 2026-07-07**: CTRL Capture Intake (webhook `/webhook/ctrl-capture`), CTRL Nurture Scheduler (daily 14:00 UTC; L1 approvals via `send-<id>` tasks), CTRL Unsubscribe (webhook `/webhook/ctrl-unsub`). See §11.5 |
| **Fleet** | 1 | **NEW** - Attribution & Product-Truth Health (daily 06:15 UTC) |
| **Mindmaker OS** | 1 | **NEW** - RE Dossier Engine (Relationship Engine, every 6h) |
| **Leo** | 1 | Revenue Weekly Report (Friday) |
| **Hunter** | 0 | Job Sweep UNPUBLISHED 2026-07-10; the original reason no longer holds as of 2026-08-05. Previously fired **Mon + Wed** per cron `dow=1,3`; node was mislabeled "Mon + Thu" |
| **Felix** | 0 | Opportunity Pipeline Tracker UNPUBLISHED 2026-07-10 (advisory sales retired). Also unpublished: Nell Apollo Contact Enrichment, Lead Document Ingest, Draft Outbound Messages |
| **Sonnet** | 0 | Task Lever Rater **disabled 2026-07-01** (broken - `$credentials` in Code node; §3.4.1) |
| **Active total** | **82** | Column sum after the 2026-07-10 unpublishings (Nell 10→7, Hunter 1→0; Felix already 0) |
| **Inactive / archived** | **23** | Workflow Optimizer; ZZ ARCHIVED Agatha Visibility Deep Enrich (dup); Nell Guest Speaker Briefing (archived dup) + Guest Pitch Enrich (archived); Nova Visibility Backfill Tick; System HARO Ingestion; "AI Agent workflow" (legacy); Critical Infrastructure Monitor (retired to VPS 2026-07-01); Maya Churn→Exit & Sonnet Task Lever Rater (disabled 2026-07-01); the 6 retired-product workflows (Stripe + Feedback for Gutted/Merciless/OnAlert, deactivated 2026-07-06); the 2 per-product Stripe alert clones (Fractionl, mm-ctrl) superseded by Revenue Intake 2026-07-07; + the 5 portfolio-overhaul unpublishings 2026-07-10 (Felix Opportunity Pipeline Tracker, Hunter Job Sweep, Nell Apollo Contact Enrichment, Nell Lead Document Ingest, Nell Draft Outbound Messages) |

> Prior versions of this table listed a "Deep Enrich Retry Sweep" System workflow and a separate Cleo "Capture Idea Webhook" - neither exists as a standalone live workflow (retry behaviour folded into the Nova/Agatha enrich webhooks; idea capture is the single `Content Idea Capture` workflow). Removed 2026-07-01.

A point-in-time snapshot of the five workflows most central to the audit is checked into the repo at `n8n/workflows/*.json`. See that folder's README for inventory + a per-workflow audit changelog. Canonical state still lives in the N8N runtime; the JSON files are for diff review, recovery, and historical record.

**Workflow trigger limitation.** The legacy `n8n-nodes-base.cron` trigger node is **not** executable via either the n8n public REST API (`POST /workflows/{id}/execute` returns 405) or the MCP `execute_workflow` tool (which only accepts Schedule/Webhook/Form/Chat/Manual triggers). New workflows must use `Schedule Trigger`, not `cron`, if a manual-trigger path is needed for testing.

### 3.4.1 Execution budget governance (10,000/mo cap)

The n8n Cloud plan cap is **10,000 executions/month** (empirically confirmed 2026-07-01: June accumulated ~10,928 executions by June 23 and then returned 100%-`"Execution limit reached"` rejections June 24–30 until the July 1 reset). A previous changelog entry citing a "2,500/mo cap" was incorrect - a 2,500 cap would have been exhausted by June 8. n8n enforces the cap natively (it *stops running* workflows once hit), so the account cannot physically exceed 10k; the governance goal is to stay **≤ 8,000/mo with margin** so critical workflows are never starved near month-end.

Because ~99% of executions are cron/schedule-driven (webhooks measured at ~1%), the monthly total is deterministic from trigger config. Current steady state after the 2026-07-01 reconciliation: **~7,411 scheduled execs/mo** (before the 2026-07-10 unpublishings; steady state now slightly lower) (see the per-workflow budget in the audit workspace). Two layers keep it there:

1. **Budget-by-construction.** The single biggest lever is not adding high-frequency schedules and killing broken high-frequency ones. On 2026-07-01, `Maya | Churn → Exit Interview` (every 30m, 1,440/mo, 100% error - literal `{{ }}` sent to Supabase + `$credentials` in a Code node) and `Sonnet | Task Lever Rater` (every 2h, 360/mo, 100% error - `$credentials` in a Code node) were **disabled** (fix-specs retained), reclaiming ~1,800/mo. The two largest legitimate consumers are `Krish | Inbox Return Detector` (2,880/mo) and `System | Audience Pipeline` (2,910/mo).
2. **External VPS governor (hard backstop).** A cron on the OpenClaw VPS (`/root/.openclaw/workspace/scripts/n8n-exec-governor.py`, hourly) - outside n8n's own budget so it cannot be starved as the cap approaches - maintains a cumulative per-cycle execution counter (robust to n8n's history-retention pruning) and: **warns** the ops Telegram at 7,000/cycle (or projected ≥ 9,500), and **trips** at 8,000/cycle by deactivating every active workflow *not* in a critical whitelist (Stripe/Approval/Error-Monitor/Orchestrator/Control-Center-Sync/Status-Receiver/Critical-Infra-Monitor). Re-arms on cycle rollover.

**Monitor migration (the "permanent fix").** The zero-AI `Critical Infrastructure Monitor` (POST Supabase RPC `audit_critical_infra` → Telegram on failures) is ported to a free VPS cron (`critical-infra-monitor.py`, `*/5`), giving real 5-minute coverage at zero n8n cost. **Deployed + the n8n copy retired 2026-07-01.** Both governor and monitor live under `/root/.openclaw/workspace/scripts/` and are wired into the root crontab (governor hourly, monitor `*/5`).

### 3.4.2 Infra + API-usage monitoring (rebuilt 2026-07-01)

A 2026-07-01 audit found the monitoring meant to catch the *next* cost-runaway was itself dark. Rebuilt into three layers, all on the VPS (outside n8n's budget so a cap-exhaustion can't starve them):

- **Critical-infra health (`write-system-health.py`, `*/15`).** `audit_critical_infra()` was returning `[]` because `public.system_health` hadn't been written since 2026-05-18 (its only writer, `api/refresh-health.ts`, is POST-only with no cron and additionally hardcoded `n8n=healthy`) - so the `*/5` monitor reported "all healthy" unconditionally. Fixed by (a) a **VPS refresher** that probes live infra (n8n API + execution-budget headroom from the governor state, Supabase reachability, DeepSeek balance, Control Center) and writes a fresh `system_health` snapshot every 15 min, and (b) a **freshness guard** inside `audit_critical_infra()` that raises a synthetic `monitoring: stale` alert if no health row is <24h old - so a dark monitor pages instead of lying. `api/refresh-health.ts` is superseded by the VPS refresher.
- **Unified API-usage ledger + alerter.** ~25 non-LLM paid APIs (Apollo, Apify, Skyvern, PDL, NeverBounce, NewsAPI, …) had zero usage/quota/spend tracking - the same blind-spot class as the June LLM runaway, for the outbound/research stack. New tables `public.api_call_log` (append-only ledger; `log_api_call()` RPC for one-POST call-site logging) + `public.api_usage_state` (per-API snapshot: balance/quota/month-spend + warn/trip thresholds, 28 APIs seeded). `api-balance-poller.py` (`0 3`) polls the balance/usage endpoints of the pollable set (DeepSeek/NeverBounce/Apify today; Apollo/Brave/Exa/Anthropic-admin/OpenAI extensible), and `api-usage-alerter.py` (`:20 hourly`) rolls up the ledger, evaluates thresholds + a **>26h poll-staleness guard**, and pages the ops Telegram once per transition. Remaining follow-up: call-site `log_api_call()` inserts in the workflows/edge functions that hit the non-pollable APIs (infra is ready; instrumentation is per-workflow).
- **Alert-delivery repairs.** `api-credit-monitor.sh` read the ops Telegram token via a wrong `jq` path (silently empty) and its three hard-FAIL branches paged no one (the exact June-01 failure mode); `vera-nightly-quality-loop.sh` used a rotated hardcoded token that now 401s. Both repointed to the single correct token path (`.channels.telegram.accounts.ops.botToken`), and the FAIL branches now alert.

### 3.4.3 n8n → Supabase credential model + the 2026-07-01 leak

**All 217 n8n nodes that call Supabase now authenticate through ONE credential** - the `supabaseApi` credential **"Supabase OS (service_role, verified)"** (`mncHyFryG0WxyDM1`) - so a key rotation is a single credential update. This replaced a mess surfaced by the audit: the production `service_role` JWT was inlined across 56 workflows *and* committed in the (then-public) `krishanraja/control-center` repo (7 workflow JSONs + git history) - a SEV-0 leak. Contained by making the repo **private**; the raw key was pulled out of every http node (26+ workflows fully de-keyed) and the fleet re-pointed to the credential. The old `Supabase Service Role` httpHeaderAuth credential was **mislabeled anon** (single-header → PostgREST derives role from `Authorization`, which it wasn't sending), which is why PR #168's SECURITY-DEFINER-function lockdown (`revoke execute … from anon`) silently broke `audit_silent_failures`/`audit_critical_infra` for the n8n workflows - fixed by moving them all to true service_role. **Held for a coordinated window:** rotating the key itself, and refactoring the 47 Code nodes that still hardcode it (Code nodes can't use n8n credentials). See the rotation runbook in the audit workspace.

**RLS hardening (2026-07-01, verified against `control-center/src`):** dropped the `anon UPDATE audit_log` tamper policy, made `opportunities` service-role-only (zero frontend refs), and replaced the mis-scoped `role=public` "Service role full access" ALL policies on `business_metrics`/`marcus_synthesis`/`zara_signals` with anon-**read-only** (frontend reads preserved, anon writes removed). Broader anon-SELECT-on-PII lockdown remains an ADR-008 follow-up gated on Supabase Auth.

`openclaw.json → bindings[]` maps Telegram account IDs to Claude Code agents:

| Bot account | Bound agent | Bot purpose |
|---|---|---|
| `agatha`, `default` | `main` (Agatha) | Strategic chat (primary surface) - also handles closure-intent translation from natural language to `close_concept` RPC calls |
| `ops` | `ops` (Arlo) | Infra escalations |
| `cleo` | `cleo` (Cleo) | Content drafts |
| `loz` | `loz` (Lozatron) | Lauren-only |
| `steph` | `steph` (Aria) | Steph-only |
| `finno` | `finno` (Finno) | Personal therapy |
| `maa` | `maa` (Devi) | Family-only |

---

## 4. Supabase - single source of truth (~68 tables/views)

Every piece of OS state lives in one of these tables. Categorised by change rate and role. Full schema in `docs/DATABASE.md`. RLS is enabled on every table.

### 4.1 Identity & rules (rare changes)

| Table | Purpose | Notes |
|---|---|---|
| `agents` (14 rows, 12 active) | Per-agent identity + brief_content + KPIs | `brief_content` is the canonical operating manual - rendered to `skills/agent-{id}/SKILL.md` every 15 min |
| `agent_capabilities`, `api_registry`, `api_endpoints`, `apify_actor_registry` | What agents can do, what APIs exist, registered scrapers | |
| `standards_registry` (~170 rows) | Behavioural rules enforced fleet-wide (V-001, GIT-001, MT-003, PUB-001, …) | Rendered nightly to `hot/standards-digest.md` |
| `ventures` (8 active) | Portfolio metadata | See §11 |
| `venture_registry` (3 rows) | Active venture surfaces for multi-tag leads/guests (`mindmaker`, `signal_noise`, `builder_economy`) | Drives per-venture lanes in the Leads tab and the venture chip on LeadCard |
| `completeness_contracts` (6 seeds) | Per-workflow output contracts - Tier 1 of the self-healing system | Shape: `{workflow_id, expected_min_rows, expected_columns, freshness_window_hours}` |

### 4.2 Plans & work in flight (weekly to daily changes)

| Table | Purpose |
|---|---|
| `agent_plans` (14 rows) | One sprint plan per agent - `current_phase`, `objective`, `blockers`, `next_milestone`, `progress_pct`, `doc_link`, `last_rendered_at`. Refreshed weekly by `Agatha Weekly Plan Refresh` (Mon 09:00 UTC) via `refresh_agent_plans()` RPC + Sonnet 4.6 |
| `tasks` | The unit of action - `id`, `title`, `agent`, `status` (`waiting`/`active`/`in_progress`/`blocked`/`done`/`pending-agatha-review`/`pending-review`/`paused`/`superseded`), `workstream`, `created`, plus `lever_score` + `est_hours_to_revenue`, plus **`concept_id text`** (backfilled for `Outreach:%` titles, indexed). CHECK constraint `tasks_status_check` enumerates the status values |
| `goals` | **The one goal table, four horizons** (`os` / `mid_term` / `weekly` / `venture_objective`), laddered by `parent_id`, one version of each enforced by unique index, staleness per horizon via `goals_health`. See §0a.2. Historically this held only flat venture objectives. Multi-week unlocks scoped to a venture (`venture` column), with status (`proposed`/`active`/`paused`/`done`/`dropped`), priority, definition_of_done, why_now, target_horizon, primary/secondary KPI, `is_auto` (Agatha auto-decomposes), `source` (`krish_declared`/`marcus_nominated`/`agatha_decomposed`). The 8 April chore rows live in `goals_archive_2026_04`. FK from `agent_plans.weekly_goal_id` makes this the parent objective every agent loads on wake (CLAUDE.md Step 3b) |
| `milestones` | Week-sized chunks of an objective. FK to `goals(id)` ON DELETE CASCADE. Status (`proposed`/`accepted`/`active`/`done`/`dropped`), source (`marcus_proposed`/`krish_authored`/`krish_tweaked`/`agatha_decomposed`), `sequence` (order within objective), `est_deep_work_hours`, `marcus_reasoning`. Marcus proposes for non-auto objectives; Krish accepts/tweaks/replaces/rejects; Agatha auto-creates for `is_auto=true` objectives. Tasks attach upward via `tasks.milestone_id` (nullable; null is legitimate for tactical work) |
| `goal_agent_contributions` | M:n bridge: an objective lists which agents contribute and what each contributes (`contribution_note`). Complements the 1:1 `agent_plans.weekly_goal_id` pointer with the many side |
| `workstreams`, `workstream_contexts` | Workstream definitions + rolling context |
| `opportunities`, `sequences`, `contacted_persons` | Deal pipeline + outbound sequences + CRM log |
| `leads` | Sales pipeline unit. CHECK constraint `leads_status_check` permits exactly: `new`, `enriching`, `ready`, `contacted`, `conversation`, `closed_won`, `closed_lost`, `superseded`, plus `churned`. Columns include `assignee_agent`, `fit_score`, `attainability_score`, `icp_score` (legacy), `icp_scores` (jsonb, per-venture), `tags` (text[]), `primary_venture` (FK → venture_registry), `tier`, `why_relevant`, `primary_tension`, `next_step`, `follow_up_at`, `promoted_task_id`, `deep_enriched_at`, **`enrichment_status`**, **`last_emailed_at`**, **`last_email_draft_id`**, **`last_email_draft_url`**, **`concept_id text`** (indexed), plus the audience-pipeline columns `audience_sources` (text[]), `churned_at`, `audience_synced_at`, and `source_type` (which now also permits `audience`) - see §4.11 |
| `guests` | Podcast guests for Builder Economy + Signal & Noise. Columns: `podcast_target` (`builder_economy`/`signal_noise` - underscore form, not hyphen), `status` (allowed: `scouted`/`enriched`/`pitched`/`responded`/`scheduled`/`confirmed`/`recorded`/`published`/`dropped`), `target_type` (`podcast_guest`/`press_target`/`dual`), `pitch_draft`, `suggested_angles` (jsonb), `scheduled_task_id`, `deep_enriched_at`, `cascade_fired_at`, **`last_outreach_at`**, **`concept_id text`** (indexed). `source` constrained to `'manual'/'sheet_import'/'nell_outbound'/'referral'/'migration'`. |
| `visibility_targets` | Speaking, CFP, press, and PR opportunities. Columns: `title` (not `name`), `type` (allowed: `cfp`/`conference`/`podcast`/`newsletter`/`guest_appearance`/`press_relationship`/`speaking`/`other`), `status` (allowed: `sourced`/`queued`/`applied`/`accepted`/`rejected`/`done`/`dropped`), URL fields `source_url` + `event_url` + `cfp_url`, deep enrichment fields (`organizer`, `audience_*`, `past_speakers`, `cfp_requirements`, `proposed_talk`, `strategic_value`, `angle`, `effort_estimate`, `risk_notes`, `next_actions`), `applied_at`, `rejected_at`, **`concept_id text`** (indexed, non-partial unique). Written by Nova Visibility Sweeper (Mon 11:00 UTC) for events, by Nell Guest Scout router for press_relationship rows, and by Nova Visibility Deep Enrich for URL+enrichment on retry sweep. |
| `nell_rejected` | Silent-skip audit log for Nell's editorial-bar quality gate. Columns: `name`, `source_url`, `source`, `reason`, `raw_data`, `created_at`. RLS on (anon read, service write). Records every candidate Nell rejects - HN-username pattern, no-contact, below-bar - so the bar is observable without surfacing junk to Triage |
| `content_ideas` | Cleo's idea backlog - written by Capture Idea + Layer 1 Signal Inbox + Guest Confirmed Cascade + the Inspiration/Synthesis pipelines + lane sourcing. Carries `concept_id text`, `pillar_id`, `lane`/`lane_slot`/`cadence_due_at`, `parent_idea_id`, `source_url`, `body`, `brand_fit_score`, `quality_score` (green/amber/red, auto-populated by the auto-score trigger), `transformed_outputs` (jsonb), and `meta` (jsonb - Content Engine state: `revisions`/`challenges`/`standards`/`cleo_pushes`, see §5.7). The `trg_autoscore_content_idea` trigger scores the first draft via pg_net → `/score`. Content Engine v2 makes this table the ambient Feed: + `horizon` (news/evergreen), `expires_at` (Monday purge deadline), `shift_id` (evidence link, purge-immune), `library_at` (graduated), `source_type` widened with `pool_headline`. See §5.8. |
| `shifts` | Content Engine v2 persistent register of macro movements: `slug` identity (stable across weeks), `momentum` + `momentum_history` (per-week `{week, momentum, day_span, source_count, recent_count}`), `provenance` (`reconstructed`/`lived`/`mixed`), `status` (`proposed`/`active`/`fading`/`retired`/`library`), embedding for register-matching, last Krish `decision`. See §5.8 |
| `shift_evidence` | Dated receipts backing each shift: `occurred_on`, `headline`, `source`, `url`, `provenance`, `week_label`. Append-only, unique on shift + day + headline; quiet weeks are simply absent, never faked |
| `weekly_briefs` | Week-keyed brief object (`week` like `2026-W28`, unique): `sections` jsonb, `body_md` (canonical markdown master), `versions` (append-only), `formats` (per-channel fan-out ledger: doc URLs + timestamps), `stats`, lifecycle timestamps per step (`assembling`→`ready`→`in_review`→`approved`→`pushed`→`sent`→`archived`) |
| `content_decisions` | The finite typed weekly content queue: `week`, `kind` (`brief_review`/`shift_proposal`/`shift_fading`/`graduation`/`purge_preview`), `ref`, `payload`, `status` (`pending`/`done`/`dismissed`), `resolution`; unique on (week, kind, ref). Feeds the Content tab queue + the `decisions_waiting` view (§4.7) |
| `growth_touchpoints` | The ICP touchpoint map, the spine of the Growth tab's Map section (30 seeded rows across 5 products): `product_slug`, `icp_trigger`, `channel` (seo/geo/social_organic/social_paid/substack/partner/community/product/podcast/maven), `watering_hole`, `cost_efficiency_score` (1-10, rescored by the council), `coverage_status` (unaddressed/in_progress/covered/retired), `owner_agent`, `rationale`, `evidence` jsonb (answered assumptions land in `evidence.resolved_assumptions`), `assumption_flag` (the open question the row is still guessing at). `content_ideas.touchpoint_id` FKs here |
| `growth_creative_queue` | The Higgsfield creative board: `product_slug`, `touchpoint_id`, `title`, `stage` (brief/script/producing/produced/posted/dropped), `brief`, `script`, `shot_notes`, `magic_sentence`, `target_account`, `asset_url`, `posted_url`, `batch_week` (the Monday that owns the 3 to 5 weekly cap), `created_by` |
| `growth_council_reviews` | Weekly growth council output, one row per product per week (unique on week_start + product_slug): `findings` jsonb, `kill_list`, `double_down`, plus Krish's `krish_decision` and `decided_at` written from the Growth tab's Council section |
| `growth_geo_probes` | GEO probe results: `product_slug`, `question`, `engine` (chatgpt/perplexity/claude/google_aio/grok), `answer_snapshot`, `we_cited`, `competitors_cited` jsonb, `touchpoint_id`, `run_at`. The citation rate is derived from these rows, never stored |
| `growth_social_accounts` | The account inventory behind each channel (unique on product_slug + platform): `platform`, `handle`, `profile_url`, `status` (planned/live/retired), `notes`. A planned account cannot carry a covered touchpoint |

### 4.3 Customers, revenue, bets

| Table | Purpose |
|---|---|
| `customers` | Cross-product customer ledger. `customer_kind` enum (`paid`/`free_signup`/`trial`/`waitlist`/`churned`), `customer_product` enum (now includes `mindmaker` + `mindmaker_live` alongside the builder products - see §4.11), `mrr_usd`, `stripe_customer_id`, dedupe indexes. Plus 4 attribution columns (`attribution_lead_id`, `attribution_task_id`, `attribution_channel`, `attribution_confidence`). Plus **`needs_outreach_at`**, **`last_emailed_at`**, **`last_email_draft_id`**, **`last_email_draft_url`**. The `trg_enforce_audience_invariant` trigger fires on insert/update of `kind` (see §4.11). |
| `customer_contacts` | One row per customer conversation. Mined by Marcus for `customer_voice` themes from the last 7 days. Drives the Customer Council card on the Customers tab |
| `bets` | Falsifiable business hypotheses - `title`, `hypothesis`, `time_box_days`, `est_mrr_impact_usd`, `status` (`live`/`won`/`lost`/`partial`), `learning`, `actual_mrr_impact_usd`. 90-day hit-rate computed in the Bets tab |
| `business_metrics` | Revenue MTD, pipeline value, content metrics |
| `acquisition_sends` | L1 send ledger for the Acquisition OS (§11.5). One row per outbound nurture message: `lead_id` FK, `lane`, `frame_version`, `touch_number`, rendered subject/body, `status` (`queued`/`approved`/`sent`/`rejected`/`suppressed`/`failed`), `approval_task_id` (the `send-<id>` tasks row Krish marks done to approve), `resend_id`. Unique on (lead, frame, touch) = idempotency. Read by the `acquisition_capture_to_paid` view (weekly captures vs paid per lane; Leo's Friday Pulse renders it) and by Vera's weekly autonomy-demotion check |

### 4.4 Operational firehose (high write)

| Table | Purpose |
|---|---|
| `workflow_runs` | Every N8N workflow writes a heartbeat per execution - primary fleet-health signal |
| `audit_log` | Append-only audit trail of agent runs + Krish actions. Event types include `concept_closed` and `concept_reopened`. The `status_change_log` table (§4.10) is the dedicated channel for row-level status transitions |
| `feedback_queue` | Krish's rejections + comments - fuel for the learning loop (consumed by Vera Feedback Aggregation Sun 06:00 UTC) |
| `corrections` | Patterns Vera extracts from `feedback_queue` (≥3 matches, confidence > 0.85) AND from `silent_failures` via Failure Pattern Sweep |
| `silent_failures` | Tier 1–4 of the self-healing system. Rows written by completeness gates + Silent Success Detector + Critical Infrastructure Monitor; resolved by humans or grouped into `corrections` by Vera |
| `learning_events` | Self-improvement loop events, both directions: corrective (`violation`) and generative (`win` / `win_pattern`, written when Krish approves an induced skill) |
| `standards_efficacy` | How well each standard is being followed |
| `system_health` | Per-component infra signals |
| `home_intelligence` | The Control Center home feed - `summary`, `metrics`, `external_signals`, `customer_signals`, `customer_voice`, plus Marcus-COO surfaces (`daily_brief`, `weekly_retro`, `monday_premortem` + their `*_at` and `*_ack_at` timestamps). All structured fields are JSONB |
| **`email_drafts`** | One row per Gmail draft created via the Cleo Email Draft workflow. Columns: `id`, `entity_type` (`lead`/`customer`/`guest`), `entity_id`, `gmail_draft_id`, `gmail_draft_url`, `subject`, `body_html`, `recipient_email`, `intent`, `created_at`, `sent_at` (null until manually sent). Idempotency on `(entity_type, entity_id, intent)` within 24h. |

### 4.5 Agent-specific scratchpads

`marcus_synthesis`, `maya_budget_state`, `maya_competitive_changes`, `maya_reddit_accounts`, `maya_striking_distance`, `hunter_search_urls`, `hunter_seen_roles`, `kai_workflow_snapshots`, `vera_audit`, `zara_signals`, `product_health`, `competitor_health`.

(`nova_target_conferences` and `nell_candidates` were dropped after their data migrated to `visibility_targets` and `guests`. References in any doc, brief, or workflow are stale.)

### 4.6 System & sync plumbing

`approvals`, `pending_flags`, `sync_queue`, `google_drive_sync`, `schema_migrations`, `system_improvements`, `system_config`, `crons`, `memory`, `plan_execution`, `skill_deliveries`, `workflow_proposals`, `skill_proposals` (the success-induction approval queue, see §8.7), `credential_health`, `credential_expiry`, `fleet_drift_report`, `vera_gaps` (the Vera gap-closure ledger - weekly audit findings → owned tasks, see §8.8.7).

### 4.7 The `decisions_waiting` view

Postgres view. Unions ten source tables (content_decisions joined 2026-07-10) into a single uniform shape (`{kind, id, title, description, agent, status, priority, sort_at, url, source_table, meta, route_target}`) so the Control Center Home tab can render one panel covering every kind of thing waiting on Krish:

| `kind` | Source | What it surfaces |
|---|---|---|
| `task` | `tasks` not yet krish-reviewed (`status ∈ waiting/in_progress/blocked/new`, not buried), and hides tasks whose `due_date` is in the future (defer is honest: off the plate until the date, then back) | Decisions on individual tasks |
| `lead` | `leads` (`status ∈ new/ready`, green/amber, not buried) | Enriched leads awaiting promote/reassign/draft-email |
| `guest` | `guests` (`status ∈ scouted/researched/pitched/enriched`, not buried) | Guests with pitch_draft + suggested_angles ready for review |
| `visibility` | `visibility_targets` (live, green/amber, not buried) | Speaking/PR targets ready for review |
| `idea` | `content_ideas` (narrowed 2026-07-10 to review-state, non-pool ideas only; not buried) | Captured ideas awaiting greenlight |
| `correction` | `corrections` where `status='analyzed' AND approval_state='pending'` | Vera's proposed brief edits (corrective loop) awaiting approve/reject |
| `inbox_returned` | `tasks_inbox` where `status='needs_krish'` | Krish-captured inbox items routed back for a decision |
| `skill_proposal` | `skill_proposals` where `status='proposed'` | Induced skills Vera drafted from clustered wins (generative loop) awaiting approve/reject |
| `vera_gap` | `vera_gaps` where `status='open' AND cycles_open >= 2` | Workflow/quality gaps Vera flagged across ≥2 weekly audits without closure, escalated to Krish (see §8.8.7) |
| `content_decision` | `content_decisions` where `status='pending'` | Typed weekly content rulings (brief review, shift proposals, fading shifts, graduations, purge preview); routes to Content (see §5.8) |

The `meta` JSONB carries the per-kind enrichment (pitch_draft preview, suggested_angles, tier, fit_score, confidence, skill body preview, etc.) so the panel renders rich previews without a join. The `correction` and `skill_proposal` branches are the two arms of the learning loop (corrective and generative), both surfaced for one-tap approval in the same Home pane (see §8.7).

A synthesis-time `LEFT JOIN concept_decisions` on each UNION branch (to hide rows whose concepts Krish has already closed) is not yet wired - see §17.7. Today `close_concept` works at the row-status level (tasks → `superseded`, leads → `closed_lost`), which removes them from the underlying source filters indirectly.

### 4.8 RPCs worth knowing

| RPC | Purpose |
|---|---|
| `refresh_agent_plans()` | Refreshes all 14 `agent_plans` rows. Called weekly by Agatha Weekly Plan Refresh |
| `audit_silent_failures()` | Used by Silent Success Detector (8h cron) to detect ok-but-empty runs |
| `audit_critical_infra()` | Used by Critical Infrastructure Monitor (3h cron) to detect credential/RLS failures |
| `audit_failure_patterns()` | Used by Vera Failure Pattern Sweep (Sun 07:00 UTC) to cluster silent_failures into corrections |
| **`induct_skill_candidates()`** | Used by Vera Success Induction Sweep (Sun 08:00 UTC) to cluster evidence-backed task wins by [agent, task_type] and return clusters at/above the volume threshold (`system_config.skill_induction_min_cluster_size`, default 3) that do not already have a live or completed skill. Self-gating: returns zero rows until a real win corpus exists |
| **`bump_skill_usage()`** | Marks a completed induced skill as used when its pattern produces a fresh win after go-live (the usage proxy for decay). Run weekly by the Success Induction Sweep |
| **`flag_decayed_skills()`** | Flags completed skills unused for N days (`skill_induction_decay_days`, default 45) or followed by a same-pattern rejection, for pruning. Flags only: actual retirement stays approval-gated |
| **`mark_entity_emailed(entity_type, entity_id, draft_id, draft_url)`** | Idempotent helper called by the Cleo Email Draft workflow to stamp `last_emailed_at`, `last_email_draft_id`, `last_email_draft_url` on the relevant entity (lead/customer/guest) atomically |
| **`compute_concept_slug(p_name text) → text`** | Deterministic slugifier (lowercase, btrim, collapse non-alphanumeric to `-`). Used by the leads/tasks backfill and by any generator that needs to assign `concept_id`. IMMUTABLE so the planner can use it in expression indexes if needed |
| **`close_concept(p_concept_id text, p_reason text, p_decided_by text DEFAULT 'krish') → jsonb`** | Upserts a `concept_decisions` row with `decision='closed'`, cascades status updates across tagged rows (tasks → `superseded`, leads → `closed_lost`), records an `audit_log` event of type `concept_closed`, and propagates `app.changed_by` + `app.source='rpc:close_concept'` into the trigger-emitted `status_change_log` rows so every cascading status change is attributed. Returns `{ok, concept_id, tasks_closed, leads_closed, decided_at}`. Re-runnable: ON CONFLICT (concept_id) updates the decision and clears `superseded_at`; already-terminal rows are not re-stamped |
| **`route_vera_gaps() → jsonb`** | Routes the latest weekly `vera_audit` findings (non-`errors` bands) into owned, tracked tasks. Dedupes by fingerprint `gap:<slug(subject)>:<band>`, derives owner via `vera_gap_owner` (cadence/liveness → arlo), upserts `vera_gaps`, creates `tasks` rows with `krish_reviewed=true` (kept out of the generic `decisions_waiting` task branch until escalated), increments `cycles_open` once per new weekly audit, reopens recurred gaps. See §8.8.7 |
| **`reconcile_vera_gaps() → jsonb`** | Auto-closes `vera_gaps` the newest weekly audit no longer flags (task → `done`). Absorbs Vera false-positives (e.g. long-cadence workflows flagged as stalled). Runs right after `route_vera_gaps` each cycle |
| **`vera_gap_owner(p_subject text, p_band text) → text`** | Band-aware owner derivation for gap routing. `cadence`/`errors` (liveness) bands → `arlo` (mechanical-liveness owner, §8.8.6); future quality/standards bands → the workflow's name-prefix agent, default `agatha` |
| **`reopen_concept(p_concept_id text, p_reason text, p_decided_by text DEFAULT 'krish') → jsonb`** | Marks the live `concept_decisions` row as `superseded_at = now()`, writes an `audit_log` event of type `concept_reopened`. Does NOT flip terminal rows back to non-terminal - history is preserved; to re-engage, write a NEW row with the same `concept_id` and the ledger records the concept is once again open |
| **`log_status_change()` (trigger function)** | Internal - fires AFTER UPDATE OF status on tasks and leads. Reads `current_setting('app.changed_by', true)` and `current_setting('app.source', true)` so any caller (RPC, edge function, agent code) that sets those before its UPDATE gets proper attribution. Falls back to `'system' / 'direct_update'` |

### 4.9 RLS posture

Every table has RLS enabled. Pattern: `anon` reads (for Control Center dashboards) + `service_role` writes (for agents). N8N agents authenticate as `service_role` through the `Supabase account 2` credential. Adding a table without RLS will fail Vera's audit. The `concept_decisions` and `status_change_log` tables follow the same posture.

### 4.10 Closure architecture

**Motivation.** Before this, closing a row killed the row but not the concept. Disney existed as both a `tasks` row (`superseded`) and a `leads` row (`ready`); closing the task did nothing to the lead, and Marcus's daily brief kept surfacing Disney as the top revenue card from the lead. Same conceptual work, two surfaces, no shared identity, no durable "Krish decided this is done" record. (For what is live versus not-yet-built across this architecture, see §17.7.)

The architecture has four parts:

| Part | Where | What it does |
|---|---|---|
| 1. **Concept identity** | `concept_id text` on `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas` (all indexed; backfilled) | A stable, human-readable slug like `concept:org:disney` that ties rows representing the same conceptual work across tables. Extension to `customers` and `opportunities` is not yet done (see §17.7) |
| 2. **Decision ledger** | `concept_decisions` table (PK = concept_id) | Durable record of every concept-level decision Krish has made. Columns: `concept_id`, `decision` (`closed`/`killed`/`paused`/`reopened`/`completed`), `decided_at`, `decided_by`, `reason`, `superseded_at`, `superseded_by_decision_id`. ON CONFLICT (concept_id) DO UPDATE: re-running `close_concept` for the same concept replaces the prior decision (with reason and timestamp), and clears `superseded_at` if previously reopened. Reopens preserve history via `superseded_at` |
| 3. **Status-change audit trail** | `status_change_log` table (bigserial PK) + AFTER UPDATE triggers on tasks and leads | Every status transition is logged with `(table_name, row_id, concept_id, old_status, new_status, changed_at, changed_by, source)`. Attribution comes from `current_setting('app.changed_by')` and `current_setting('app.source')` - RPCs set these before their UPDATE; direct UPDATEs fall back to `'system' / 'direct_update'` |
| 4. **Cascading-closure RPC** | `close_concept(concept_id, reason, decided_by)` | Single entry point for "this concept is done." Upserts the ledger row, cascades terminal status to every tagged row, writes the audit_log event, and (via triggers) emits the status_change_log entries. `reopen_concept` is the inverse for the "we changed our mind" case |

**Terminal status convention.** Concept closure cascades to **terminal status values that are already in the live CHECK constraints**, not to runbook-imagined values:

- `tasks` → `'superseded'` (skipping rows already in `{'done','superseded','killed','archived','completed'}`)
- `leads` → `'closed_lost'` (skipping rows already in `{'closed_won','closed_lost','superseded'}`)

The original closure-architecture runbook used `'dead'` for leads and skipped `('dead','customer','unsubscribed','archived')`. None of those tokens exist in `leads_status_check`, so the architecture canonicalizes on `'closed_lost'` instead - it is already in the constraint's permitted set (lower blast radius, vocabulary already established).

**Attribution convention.** Any caller that wants its identity recorded on the status_change_log entry must:

```sql
SELECT set_config('app.changed_by', '<actor>', true);   -- e.g. 'krish', 'agatha-closure-receiver', 'felix'
SELECT set_config('app.source',     '<source>',  true); -- e.g. 'telegram', 'control-center', 'rpc:close_concept'
-- ...then UPDATE...
```

`close_concept` does this internally with `('krish' or whoever, 'rpc:close_concept')`. The planned Closure Intent Receiver workflow (see §17.7) will do the same with `('agatha-closure-receiver', 'telegram-intent')` or similar.

**Idempotency.** Calling `close_concept` twice for the same concept is safe. First call inserts the decision row and cascades. Second call updates `decided_at`/`reason`, finds the rows already terminal (per the skip-list), and returns `{tasks_closed: 0, leads_closed: 0}` with `ok: true`. The audit_log entry is emitted each time, so re-runs are detectable.

**Canary illustration.** Disney: `concept_id = 'concept:org:disney'` on both rows; `close_concept('concept:org:disney', '...', 'krish')` returned `{tasks_closed: 0, leads_closed: 1}` (task was already `superseded`). The lead transitioned `ready → closed_lost`; `concept_decisions` and `status_change_log` rows both materialised; an `audit_log` event of type `concept_closed` was emitted. `marcus_daily_pull()` then returns zero Disney mentions across all arrays (leads, hot_leads, stale_tasks), so the next Marcus run produces a Disney-free `top_three` by construction.

---

### 4.11 Unified audience pipeline

Every Mindmaker property feeds one audience list, and that list flows into the Control Center with a hard paid-vs-free rule. Two databases are involved: the **Mindmaker AI app DB** (`bkyuxvschuwngtcdhsyg`) where capture happens, and this **OS DB** (`gojpffsrxybbpbdzzrvs`) where the Control Center reads. They are different projects, so a bridge carries capture into the OS.

**Capture (app DB `audience_contacts`, enum `lead_source`).** CTRL signups (`track-event` edge fn → `source='ctrl'`), the marketing site (all five capture edge functions via a shared `recordSiteAudienceContact` helper → `source='mindmaker_site'`), the Builder Economy (`NotifyForm` → `source='builder_economy'`), and MYMU (Substack CSV import → `source='mindmaker_live'`). Each row carries `metadata` (capture type, attribution, and `paid` for Substack). A `synced_to_os_at` watermark marks rows the bridge has processed.

**The bridge (OS pulls from the app DB).** The app DB has no outbound HTTP (`pg_net`/`http` absent), so the OS pulls. `pull_audience_contacts(limit)` uses the `http` extension (app DB service key in **Vault**, not `system_config`) to fetch unsynced rows, routes each through `sync_audience_contact(email, name, source, metadata)`, then stamps `synced_to_os_at` back. Scheduling is the **`audience-tick`** OS edge function (verify_jwt=false, `AUDIENCE_TICK_SECRET`-gated) hit by n8n workflow **`System | Mindmaker OS | Audience Pipeline`** (`7sYzU1FidUo2w1Lh`): `action=sync` every 3h, `action=reconcile` daily 07:30. n8n holds no DB credential; the edge function uses the platform-injected service role.

**Routing rule - payment is the only switch, never both.** `sync_audience_contact`:
- `metadata.paid=true` → upsert a paid `customers` row (product `mm_ctrl` / `mindmaker_live` / `mindmaker`) → **Subscriptions**.
- already a paid customer (guard) → no lead.
- otherwise → upsert a `leads` row with `source_type='audience'`, collapsed by `lower(email)` (the existing `leads_email_dedupe` index), accumulating `audience_sources[]`; `mindmaker_site` high-intent captures are `warm`, the rest `watch`.

**Mover (DB trigger).** `trg_enforce_audience_invariant` on `customers` (after insert/update of `kind`): on `paid`, supersede any audience lead for that email; on `churned`, mark a clearly-tagged `status='churned'` lead (`churned_at` set) for re-engagement. This makes never-both self-enforcing regardless of who writes `customers` (Stripe, n8n, manual).

**Reconciler.** `reconcile_audience_invariant()` finds any email that is both a paying customer and an active lead, supersedes the lead, returns counts. Runs daily via the reconcile tick.

**Schema additions.** `leads`: `audience_sources text[]`, `churned_at`, `audience_synced_at`; `leads_status_check` gains `churned`; `leads_source_type_check` gains `audience`. `customer_product` gains `mindmaker` + `mindmaker_live`. RPCs: `sync_audience_contact`, `pull_audience_contacts`, `reconcile_audience_invariant`, `audience_import_proxy` (Substack CSV → app DB importer via http + Vault secret, then sync). Control Center renders audience leads with an 'Audience' source pill, capture-source chips, a Churned badge, and a Substack CSV dropzone (`/api/audience/import-substack` → `audience_import_proxy`).

---

## 5. The Control Center - single pane of glass

- **URL.** `controlcenter.krishraja.com` (Vercel); repo `krishanraja/control-center`.
- **Stack.** React 18 + TypeScript + Vite + Tailwind + Supabase JS client.
- **Shell - no-scroll app frame (2026-06-11).** The whole dashboard is a fixed-viewport app: the **window never scrolls**. The root is `h-[100dvh] overflow-hidden` and `main` is a non-scrolling `flex-1 overflow-hidden`; chrome (sidebar / bottom nav / tab header) stays pinned and each tab owns its own inner scroll in a contained region - desktop via a `h-full overflow-y-auto` wrapper (or the Content tab's `AppFrame` primitive), mobile via each tab's `h-[100dvh]` `MobileShell`. Replaces long scrolling web pages with an app-like surface on every device (`App.tsx`, `src/components/shared/AppFrame.tsx`).
- **Data layer.** Direct PostgREST reads with the anon key + Postgres Realtime subscriptions. Mutations that need service-role context go through `/api/*` Vercel functions.
- **Deploy.** Push to `main` → Vercel auto-deploys. **Never touch Vercel directly.**
- **Git author.** Every commit must be `Krish Raja <hello@krishraja.com>` (standard V-004 / GIT-001).
- **ESM constraint.** Because `package.json` declares `"type": "module"`, every relative import inside `api/*` must use the `.js` extension (e.g. `import { supabase } from './_supabase.js'`). Without it, Vercel returns a silent 500.

### 5.1 Tabs and their backing data

| Tab | What it shows | Tables / views read |
|---|---|---|
| **Home** | CriticalAlertBanner → MrrTicker → **GoalLadder** (the one goal editor: four rungs, staleness and orphans surfaced as urgent; replaced ObjectivesPanel and WeeklyGoals, both deleted 2026-08-06. Nomination / soft-cap / MilestoneCalibrator machinery now hangs off FocusRitual) → **DailyDriver** (the daily spine, see 5.6: one phase-driven journey replacing the old NextActionStrip / FocusBar / FocusCalibrator / TopThreeCards pile-up) → RoomPreviews → MomentumStrip → StreakPills → DailyBriefBanner (retro-only, below the fold) → ActivityTail. A once-weekly **WeeklyFocusTakeover** overlays Home on a new week (Monday-insist). | `home_intelligence`, `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas`, `customers`, `bets`, `silent_failures`, `decisions_waiting`, **`goals`**, **`milestones`**, **`goal_agent_contributions`**, **`weekly_focus`**, **`weekly_focus_milestones`** |
| **Today** | The day's typed queue: tasks needing Krish (unreviewed, unburied, not future-deferred) with exactly three verbs (Approve / Send back with a note / Defer to a date) via `/api/tasks/update`; agent-carried work is one ambient sentence; stale + backburner sit behind a fold. Focus/All toggle (5.6) still regroups into the 3 daily-target lanes. | `tasks` |
| **Content** | **Content Engine v2 (§5.8), behind `VITE_CONTENT_V2_ENABLED` (ON in prod):** four rooms: This Week (BriefCard + the typed DecisionQueue), Shifts (register grid + dossier drawer), Feed (read-only ambient stream), Library (graduated evergreens + retired-with-verdict shifts). The Composer/BriefEditor opens both ideas and the week's brief. The v1 mode-switched triage-deck/lane surface (§5.7) is superseded for news content; the Composer, Five Standards, and voice guardrails it describes still power the brief editor rail and non-news idea work. | `weekly_briefs`, `shifts`, `shift_evidence`, `content_decisions`, `content_ideas` |
| **Growth** | ONE tab, five sections in the order of the weekly loop (merged 2026-08-04 from the old `acquisition` deck + `growth` map pair; `#/acquisition` still resolves here, landing on Governance). **Map** the spine: per product, inline-editable `coverage_status` + `cost_efficiency_score`, add/retire, `assumption_flag` rendered as an answerable open question, plus a channel-accounts strip. **Work** the Higgsfield kanban: brief / script / producing / produced / posted, drag or arrow moves, script + shot notes + asset/posted URLs on the card, weekly 3 to 5 batch cap counted from `batch_week`. **Signals** one measurement surface: GEO probe results grouped by product with the citation rate as the headline number, plus Maya's SEO rank sweep underneath it (cross-lane, priority then volume, each row labelled with its lane). **Council** weekly reviews newest first with findings / kill list / double down, Krish records `krish_decision`. **Governance** the per-lane control plane behind one lane selector: profit governor (cost stack vs attributed MRR, CAC/LTV, burn bar, pause/resume, budget editor), autonomy ladder (L1/L2/L3 with the mechanical 422 criteria checklist), direction studio (author, preview, lock, roll back), tool registry with cost and gating; churn win-backs appear only when the queue is non-empty. Every section shows an honest empty state; `growth_creative_queue` is empty today and Work says so. | `growth_touchpoints`, `growth_creative_queue`, `growth_council_reviews`, `growth_geo_probes`, `growth_social_accounts`, `maya_striking_distance`, plus the service-role control plane (`venture_registry`, `lane_economics`, `lane_autonomy_stats`, `lane_directions`, `growth_integrations`) via `/api/acquisition/*` |
| **Leads (Services)** | Per-venture lanes (mindmaker / signal_noise / builder_economy) with LeadCards: Promote / Reassign / Schedule follow-up / Deep enrich / **Draft email** / **Close concept**. Renders audience leads with an Audience source pill, capture-source chips, and a Churned badge (see §4.11). "Draft email" opens an outreach sheet (angle / venture / tone). Lands in the bounded triage deck when a queue waits (wave 2). | `leads`, `venture_registry` |
| **Network** | Relationship engine over `contacts` (predictive score + venture segmentation); lands in the bounded triage deck when a queue waits (wave 2), each card carrying a suggestedMove chip; power-mode bulk actions. | `contacts` |
| **Guests (Visibility)** | GuestImportDropzone, GuestCard: Confirm / Skip / Deep enrich / Edit pitch / **Draft email**. Lands in the bounded triage deck when a queue waits (wave 2). | `guests` |
| **Visibility (events)** | VisibilityTargetCard: deep-enrich + edit + approve/reject/snooze + past speakers + CFP details + effort + next actions checklist | `visibility_targets` |
| **Customers (Subscriptions)** | MrrTicker + CustomerSourcesPanel + CustomerCouncilCard + ExpansionRadar + per-product FeedCards + per-customer **Draft email** / Log call / Mark for outreach | `customers`, `customer_contacts`, `home_intelligence` |
| **Bets** | Bet Board: live bets with time-box fill bars, place-bet flow, 90-day hit-rate, MRR-impact panel | `bets` |
| **Plans** | Per-agent sprint state with phase/objective/blockers; rendered fresh weekly | `agent_plans` |
| **Org** | Agent grid; inline Identity editor (writes to `agents.brief_content` via sync); Flag; mobile Edit brief | `agents` |
| **Flows / Systems** | N8N workflow health, credential health, silent_failures by tier; **Rerun button per workflow card** | `workflow_runs`, `credential_health`, `kai_workflow_snapshots`, `silent_failures` |
| **Intel** | Marcus headline + AskMarcus chat (`/api/ask-marcus`) + Zara signals + deep-research outputs + Create task / Add to bets buttons on signals | `zara_signals`, `marcus_synthesis`, `home_intelligence`, `customers`, `leads`, `bets` |

Live interaction details across these tabs: Home surfaces "waiting-on-you" composition chips with per-kind batch review; the content calendar supports click-to-schedule a draft; Services "Draft email" opens an outreach sheet (angle / venture / tone); the Customers (Subscriptions) tab carries a Substack CSV dropzone (`/api/audience/import-substack` → `audience_import_proxy`, see §4.11); sheets and overlays close on `Esc`; lists show loading skeletons; date glyphs never render as `∞d`.

### 5.2 `/api/*` proxy routes

Every action that needs service-role context OR fires an N8N webhook routes through a Vercel function in `api/`. Inventory:

| Route | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Fleet inventory + active/error/running counts (used by DesktopSidebar) |
| `/api/sync` | POST | Inbound write from VPS sync pipeline (guarded by `SYNC_SECRET`) |
| `/api/sync-brief` | POST | VPS-side push to `agents.brief_content` (guarded by `SYNC_SECRET`) |
| `/api/trigger-agent` | POST | Insert a `tasks` row that fires pg_net → N8N |
| `/api/feedback` | POST | Insert a `feedback_queue` row from any FeedbackButton |
| `/api/ask-marcus` | POST | Marcus chat surface, Anthropic-backed, grounded in customers/leads/bets/home_intelligence |
| `/api/leads/promote` | POST | Promote a lead to a task (idempotent) |
| **`/api/leads/:id/enrich`** | POST | Fire `/webhook/lead-deep-enrich` (Agatha Lead Deep Enrich) |
| **`/api/leads/:id/draft-email`** | POST | Fire `/webhook/cleo/email-draft` and return `{draft_id, draft_url, subject, body_preview}` |
| **`/api/customers/:id/draft-email`** | POST | Same flow, scoped to customers |
| **`/api/guests/:id/draft-email`** | POST | Same flow, scoped to guests |
| **`/api/visibility-targets/:id`** | GET | Read a single visibility target |
| **`/api/visibility-targets/:id/enrich-deep`** | POST | Fire visibility deep-enrich |
| **`/api/visibility-targets/:id/apply`** | POST | Apply CFP / mark applied |
| **`/api/automations/:id/rerun`** | POST | Find the workflow's webhook trigger and POST to it; 422 with guidance for schedule-only workflows |
| `/api/concepts/:concept_id/close` | POST | **LIVE.** Thin proxy that calls `close_concept(concept_id, reason, decided_by)` with service-role context |
| *`/api/concepts/:concept_id/reopen`* | POST | Planned - inverse of the above (see §17.7) |
| `/api/audience/import-substack` | POST | Substack CSV import → `audience_import_proxy` (see §4.11) |
| **`/api/feed/ingest`** | POST (Vercel cron, daily 11:30 UTC) | Content Engine v2: pull the CTRL corroborated pool (+ newsletters + Zara arrive via their existing sweeps) into `content_ideas` as the ambient Feed (`horizon='news'`, `expires_at`, dedupe by URL + fingerprint). See §5.8 |
| **`/api/shifts/detect`** | POST (Vercel cron, Fri 17:30 UTC) | 21-day corpus → recurrence gate → upsert `shifts` + `shift_evidence` + momentum history; writes `shift_proposal` / `shift_fading` decisions |
| **`/api/shifts/:id`** (+ `/api/shifts/:id/write`) | GET / POST | Read a shift dossier; seed the Composer with a write-from-this-shift draft |
| **`/api/briefs/assemble`** | POST (Vercel cron, Fri 18:00 UTC) | Assemble the week's brief → `weekly_briefs` `status='ready'` + a `brief_review` decision |
| **`/api/briefs/:week`** (+ `/revise`, `/push`) | GET / PATCH / POST | Read + edit the week's brief; `/revise` = magic edits (presets, free "Tell Cleo" instruction incl. mobile dictation, span-scoped rewrites, preview-only); `/push` = multi-format factory fan-out to Google Docs (PUB-001 intact) |
| **`/api/purge/run`** | POST (Vercel cron, Mon 14:00 UTC) | Hard purge of expired news-horizon Feed rows (expire, feed-a-shift and Library graduates are immune); archives the sent brief |
| **`/api/content-decisions/:id`** | POST | Resolve a typed weekly content ruling (done / dismissed + resolution payload) |
| **`/api/growth/touchpoints`** | GET / POST / PATCH | The Map spine: read the touchpoint map, add a touchpoint, edit coverage / cost efficiency / owner inline, retire (`coverage_status='retired'`), and `action:'answer_assumption'` which files an answer into `evidence.resolved_assumptions` and clears the open question |
| **`/api/growth/creative`** | GET / POST / PATCH | The Higgsfield board: read cards, add one (defaults `batch_week` to this Monday), move stage, and save script / shot notes / asset_url / posted_url |
| **`/api/growth/council`** | GET / PATCH | Read the weekly council reviews; record `krish_decision` and stamp `decided_at` (clearing the text clears the stamp) |
| **`/api/growth/probes`** | GET | Read GEO probe rows plus the citation rate, computed from the rows and never stored |
| **`/api/customers/:id/outreach`** | POST | Customer outreach action from the Subscriptions surface |
| **`/api/tasks/update`** | POST | The Today queue's three verbs: `approve` / `send_back` (with a note) / `defer` (to a date) |

(Italic rows are planned, not yet built - see §17.7. Full implementation specs in `docs/API.md`.)

### 5.3 Mutation control flow (Krish acts → OS reacts)

1. **User action.** Krish clicks Approve / Reject / Promote / Confirm / Deep enrich / Draft email / Place bet / Rerun / **Close concept**.
2. **Supabase mutation.** The UI updates the relevant row - directly via the JS client for simple updates, or through an `/api/*` Vercel function when service-role context is required, or via the new `close_concept` RPC when the action spans multiple tables for a single concept.
3. **Webhook trigger.** Supabase `pg_net` (or the `/api/*` route directly) posts to the **Orchestrator** (N8N workflow `u0kIULJBJL4dGcuR`, path `/webhook/mindmaker-orchestrator`) - or to a workflow's own webhook for direct flows like email-draft.
4. **Routing.** The Orchestrator routes by event type to the right downstream workflow.
5. **Agent execution.** The workflow runs, calls the LLM tier appropriate to the job (Sonnet 4.6 for substance, Haiku 4.5 for classification), writes the result back to Supabase.
6. **Realtime echo.** The UI's subscription receives the change and the relevant component re-renders within a tick.

**Hard rule.** No content publishes without explicit Krish approval. The LinkedIn Distribution endpoint is guarded by `X-Agatha-Secret`; only the Krish Approval Callback workflow holds the header. The **email-draft path drafts only** - Gmail's Draft API is used; nothing auto-sends. Standards PUB-001 / PUB-005.

### 5.4 Realtime subscriptions

The dashboard subscribes to Postgres Realtime via `@supabase/supabase-js`. Hot subscriptions:

| Hook | Table / view | Channel |
|---|---|---|
| `useRealtimeTasks` | `tasks` | `tasks-rt-shared` (one channel, fanned out - see ADR-002) |
| `useRealtimeLeads` | `leads` | `leads-rt-shared` |
| `useRealtimeGuests` | `guests` | `guests-rt-shared` |
| `useVisibilityTargets` | `visibility_targets` | `visibility-rt-shared` |
| `useCustomers` | `customers` | `customers-rt-shared` |
| `useRealtimeDecisionsWaiting` | `decisions_waiting` | `decisions-rt-shared` |
| `useCriticalAlerts` | `silent_failures` filtered to tier 3 | `critical-alerts` |
| `useRealtimeConcepts` (planned, see §17.7) | `concept_decisions` | `concepts-rt-shared` |

**Hard rule.** One channel per table per browser session, fanned out via context/hooks. Opening a second channel for the same table is a performance bug. See ADR-002.

### 5.5 Sync infrastructure (Arlo's domain)

- `cc-sync-engine.sh` - every 5 min, refreshes `home_intelligence`, polls N8N for workflow status, flags stale tasks, writes audit trail.
- `cc-doc-creator.sh` - every 15 min, for any task with `description` but no `link_primary`, creates a Google Doc and writes the URL back.
- `cc-task-router.sh` - routes ad-hoc instructions from chat into `tasks`.
- `poll_sync_queue.py` - every 5 min, drains `sync_queue` (cross-system reconciliation).
- `Control Center Live Sync` (N8N) - auxiliary realtime layer.

### 5.6 The Focus System - one spine from objective to today

**Strategic intent.** Before this, "what should I do?" was answered by five overlapping Home surfaces, and the daily `top_three` always elevated atomic tasks, so multi-week objectives never won daily airtime. The Focus System makes one spine run from a weekly commitment down to the work on every tab: PORTFOLIO OBJECTIVE → MILESTONE (the weekly unit) → TASK → DAILY TOP 3 → every tab's list. One commitment a week sets the milestones; one commitment a day picks the 3; everything else reorganizes behind those two choices. It is engineered around behavioral psychology (fresh-start effect, peak-end, implementation intentions, commitment-and-consistency, goal-gradient, Zeigarnik, Hick's law, loss aversion) and information retention.

**Surface 1: the daily spine (`DailyDriver`, `src/components/focus/`).** One orchestrator that derives a phase from `daily_focus.status` and renders exactly one thing at a time, replacing NextActionStrip + FocusBar + FocusCalibrator + TopThreeCards + the brief banner:
- `context` (no row): `ContextHeader` shows a three-line frame from the brief (one_bet / one_customer / one_anti_action) to prime the pick.
- `commit` (no row): `FocusCalibrator` (reused) picks, edits, and locks today's 3.
- `mapping` (`status='pending'`): `TrackStep` shows a labor-illusion banner while the calibrator webhook computes `relevance_index`; completion is live immediately so a slow or failed webhook never traps the user.
- `track` (`status='calibrated'`): completion circles + endowed-progress bar + goal-gradient copy + the brief's anti-action pinned as a guardrail + "ladders up to {objective}" labels.
- `close` (all 3 done): `CloseStep`, a peak-end reflection that writes a `daily_reflection` feedback row and seeds tomorrow.

**Surface 2: the weekly takeover (`WeeklyFocusTakeover`, `src/components/objectives/`).** Once a week the Home is overlaid by a four-step wizard: review last week (peak-end, from `weekly_retro`) → confirm objectives (reuses `NominationTray`) → shape milestones (reuses `MilestoneCalibrator`) → commit up to 3. Gating is "Monday-insist, soften after": Monday's first view has no dismiss (fresh-start effect); the rest of the week offers one "set later today" snooze. The only way to stop it for the week is to commit. Committed milestones bias the daily picker: `/api/daily-focus/suggestions` attaches `serves_milestone` to any pick whose task advances a committed milestone, shown as a violet "serves this week" chip in the calibrator.

**Surface 3: Full Focus Mode (`FocusLanes` + `useFocusMode` + `FocusModeToggle`, `src/components/focus/`).** Every work-item tab (Today, Services, Subscriptions, Visibility, Content, Bets - desktop + mobile) gains a Focus/All toggle. In Focus mode, when the day is calibrated, the tab's primary list regroups into the 3 daily-target lanes plus a dimmed Muted set, falling back to its normal view otherwise. This activates the previously-dormant `useFocusFiltered` hook across the whole app.

**The `relevance_index` contract (load-bearing).** The n8n Focus Calibrator (`zEA4wGECQdqBpDmO`) keys every candidate as `<table>:<id>` and writes them to `daily_focus.relevance_index`. `useFocusFiltered(rows, table)` looks up `<table>:<id>` per row → lane 1/2/3 or muted (critical-severity rows never mute). Each tab MUST pass its own source table. Pooled tables: `decisions_waiting`, `tasks`, `bets`, `leads`, `visibility_targets`, `customers`, `content_ideas`, `guests`.

**Data model.**
- `daily_focus` (one row per `focus_date`): `target_1..3_text/_source/_concept_id/_completed_at`, `status` (pending → calibrated → complete), `relevance_index` jsonb, `calibrated_at`. Hook `useDailyFocus` (channel `daily-focus-rt-shared`).
- `weekly_focus` (one row per `week_of`, the Monday in Europe/London, UNIQUE): `status` (committed/superseded), `committed_at`, `retro_ack`. `weekly_focus_milestones` bridge: `weekly_focus_id` FK CASCADE, `week_of`, `milestone_id` FK CASCADE, `goal_id` FK CASCADE, `last_served_at`, UNIQUE(week_of, milestone_id). Hook `useWeeklyFocus` (channel `weekly-focus-rt-shared`) with a London-Monday week key and localStorage gating fallbacks. RLS anon-SELECT + service_role-ALL on both. Migration `scripts/migrations/2026-05-30-weekly-focus-takeover.sql`.

**API routes.** `/api/daily-focus/{suggestions,calibrate,complete}` (existing; `suggestions` extended with the `serves_milestone` read-join). `/api/weekly-focus/commit` (new: upserts `weekly_focus` on `week_of`, replaces the bridge rows, caps at 3). `/api/feedback` (extended: `daily_reflection` reason code).

**Feature flags.** `VITE_DAILY_FOCUS_ENABLED` (on) gates the daily spine. `VITE_WEEKLY_FOCUS_ENABLED` and `VITE_FOCUS_MODE_ENABLED` gate the weekly takeover and Full Focus Mode respectively (default off; add to Vercel env = true and redeploy to dogfood, since these are build-time Vite vars).

---

### 5.7 The Content Engine - idea to publishable, without leaving the tab

> **SUPERSEDED for NEWS content (2026-07-10).** The idea-at-a-time engine this section describes is superseded for news content by **Content Engine v2** (`docs/CONTENT-ENGINE-V2-SPEC.md` + §5.8): the weekly brief + shifts register. The Composer, the Five Standards gate, the voice guardrails, and the factory push described below are NOT retired; they still power the brief editor rail and non-news idea work.

**Strategic intent.** The Content tab used to be a read-only-ish inbox: a `content_ideas` row with `Draft Now` / `Research` buttons and a lane-based Transform. The Content Engine layers the full production loop onto the same cards so a seeded idea becomes publishable work in one place: transform it, enrich it, spin channel variants, edit every field inline, iterate on a preview, and push the winner to Cleo for a Google Doc. The existing inbox UI is untouched; everything new is gated behind `VITE_CONTENT_ENGINE_ENABLED` (build-time Vite var, default off). It is engineered to sound like Krish, not like an AI content tool: every LLM call grounds in `system_config.content_voice_block` + `content_corpus` and enforces the krish-voice kill list (server-side guardrails + a pure-client `src/lib/voiceLint.ts`).

**Rebuilt 2026-06-11 into a full-screen Composer (`src/components/content/ContentComposer.tsx`).** The first cut stacked the draft, the research panel, and the entire engine inside one `ContentIdeaCardActionable` card - an endless vertical scroll in a narrow column with the Expand action buried at the bottom and a duplicated Transform. Content production is deep work, so each piece now gets its own focused screen: a draft canvas plus a single-panel rail (**Cleo chat · Refine · Materials · Research · Standards**), opened by deep-linking `#/content?idea=<id>` (mounted as a fixed overlay from `App.tsx`; Esc returns to the pipeline). The pipeline card is now a light tile that opens the Composer; the old `ContentEnginePanel` / inline `ResearchAndTransform` stack is retired.

**Triage deck - clear the pile (2026-06-11, PR #136).** The pipeline view itself broke at scale: the auto-seed engines floods upstream states and nothing was promoted (a real snapshot: **~218 active = 86 seeded + 107 researching + 25 drafting, 0 review/0 approved**), so the desktop lanes mounted every card unbounded (~218 hook-heavy `ContentIdeaCardActionable`s) and crashed the browser, while mobile filtered to only `review`/`approved`/urgent and showed a false "You're clear" over the hidden backlog. The Content tab is now **mode-switched** by active count (state not in `dropped`/`published`), with hysteresis (enter > 30, exit ≤ 25) so the boundary-crossing action never remounts the view mid-gesture:
- **Triage mode (> 30):** a one-card-at-a-time swipe deck over the whole active backlog (`src/components/content/TriageDeck.tsx` + `TriageCard.tsx`, driven by `useContentTriage` + `useCardDeck`). **Left = Drop** (`state='dropped'`, undoable), **right = Advance one stage** (`seeded→researching→drafting→review`; `review`/`approved` open the Composer - the two human gates are never auto-crossed), **tap/↑ = open Composer**. Pointer swipe + on-screen buttons + arrow keys, identical on phone and desktop; only ~3 cards mount at once. Commits are optimistic via a session `committed`-id set (read-your-writes-safe against the shared realtime cache's coalescing `fetchAll`), keyed by `idea.id`. Drop captures `prevState` for Undo (toast action + `U` key).
- **Action mode (≤ 30):** the ship-something view. Desktop lanes (now **bounded** per state by `LANE_CAP`, with overflow routed into the deck so an unbounded list can never mount again; the focus-mode path is capped too). Mobile surfaces the **Ready for you** tier + a **Drafts** tier + an **upstream count** entry into triage; the all-clear empty state is gated on `activeCount === 0`, so the false-empty screen is structurally impossible.

**The Composer's tools.** Operate on the piece's `body` as the working draft. Draft writes go through `PATCH /api/content-ideas` (service role), **not** the anon client - `content_ideas` RLS is anon-SELECT / service-role-ALL, so the old inline card's `supabase.from('content_ideas').update({body})` was silently blocked and inline draft edits never persisted (latent bug, fixed in the rebuild):
- **Transform axes** - one-click tone (punchier / contrarian / warmer / formal), length (short LinkedIn / mid MYMU / full essay), and zoom-into-sharpest-angle. Preview-then-accept: the row's `body` is not mutated until Krish accepts; a non-destructive history lands in `meta.revisions[]`.
- **Iterate** - quick chips (shorter / sharper hook / more data / harder ending) + an open feedback box. Same preview loop. **Paragraph/sentence-level:** select any text in the working draft or the preview and a toolbar rewrites just that span (the `/revise` API takes a `selection` and returns the full draft with the span swapped).
- **Challenge / enrich** - Challenge this, Counter-argument, Commercial hook, Add sources. Tiered research: Perplexity counter-evidence + **real Apify Reddit/LinkedIn community scraping** (`run-sync`, registered actor `automation-lab/reddit-scraper` by default; LinkedIn opt-in; falls back to a Perplexity forum pass when `APIFY_TOKEN` is unset) + optional NewsAPI dated proof, synthesised by Claude into steelman → counter → sharper-take → hook, written to `meta.challenges[]`. Sourced, never invented; scraped post URLs flow into citations.
- **Channel variants** - every configured lane exposed as a per-idea toggle (decision 2026-06-11: all lanes, Krish picks per idea). Reuses the industrialized `/api/content-ideas/:id/transform` so each variant is its own child row in that lane's voice - not the same text restyled.
- **Five Standards gate** - scores the draft 1-5 on undeniably-unique / well-researched / thoughtful / kind / helpful (from `content_corpus`), names the failing standard, writes `meta.standards` + a glanceable `quality_score` (green/amber/red). **Advisory: it warns, never blocks** (decision 2026-06-11; Krish stays the final word, PUB-001). The two watch standards are `unique` and `kind`.
- **Inline field edit** - idea / thesis / distribution editable via the existing `PATCH /api/content-ideas`.
- **Materials** - paste or link a research corpus on the piece. Stored on `content_ideas.meta.materials[]`, it grounds every generation (Cleo chat, Refine, Save Draft) and is folded into the Google Doc on save. This closes the long-standing gap where a markdown corpus Krish sent Cleo on Telegram was consumed by extraction and never kept. Route: `GET/POST/DELETE /api/content-ideas/:id/materials`.
- **Cleo chat** - a conversational writing partner in the Composer (`POST /api/content-ideas/:id/chat`, multi-turn), grounded in krish-voice + the draft + the attached materials, transcript persisted to `meta.cleo_chat`. The escape hatch when the buttons feel too restrictive; any reply can be dropped straight into the draft.
- **Refine → Adapt to lane** - folds the former standalone "Transform into other lanes" into one Refine preset per lane that bundles tone + length + zoom (one draft Krish keeps iterating, not a scattered child card), killing the duplicate Transform buttons the inline card carried. Channel-variant generation (parent→child rows) still exists via `/transform` for true multi-lane fan-out.
- **Save Draft** - the Composer's single end CTA (renamed from "Push to Cleo"). It sanitizes the draft (em dashes out, see below) and saves the clean `body`, auto-resolves the factory channel from the piece's lane (overridable), then fires the live `Cleo | Mindmaker OS | Omnichannel Content Factory` webhook via `POST /api/content-ideas/:id/save-draft` (`N8N_CONTENT_FACTORY_WEBHOOK_URL`, `/webhook/content-factory`, workflow `AnhkJrJBvmohfqjJ`) with `{target_channel, title, hook, target_audience, contrarian_angle, draft_seed, full_draft, materials, materials_context, krish_approved: true}`, and moves the piece to `review`. The factory's `Check Krish Approved` IF gate (`body.krish_approved === true`) treats Save Draft AS Krish's approval to PRODUCE the doc (not to publish, so PUB-001 holds); it assembles a channel-specific draft, writes a richly formatted Google Doc into the channel's Drive folder, and pings Krish on Telegram with the link. Verified end-to-end on prod 2026-06-12 (doc created in Krish's Drive, owned by `krish@themindmaker.ai`; Telegram alert delivered via **@krish_approvals_bot** - note this is the approvals bot, not Krish's main chat). Drafts only - nothing auto-publishes.

**No em dashes, anywhere.** `sanitizeVoice()` in `api/_content.ts` (mirrored client-side as `autoFixVoice` in `src/lib/voiceLint.ts`) strips em dashes and their lookalikes (em / horizontal-bar / double-hyphen-as-dash → comma; numeric ranges like 2024-2025 preserved) on every revise / transform / chat / save-draft / capture path, plus a one-click "Fix voice" in the Composer header. The body PATCH route sanitizes on write, so what is stored equals what ships.

**Mobile is review-first, not deep work (`src/components/mobile/MobileContent.tsx` + the Composer's `narrow` body).** A phone is for reviewing what is next or urgent, making a quick magic adjustment, previewing, and pushing - not careful writing. Mobile Content follows the same two modes as desktop (see the triage deck above): when the backlog > 30 it is the **swipe triage deck** over the whole active backlog; at ≤ 30 it is an action surface with a **Ready for you** tier (pieces awaiting sign-off = `review`, ready to ship = `approved`, or urgent = scheduled today / overdue / `cadence_due_at` due), a **Drafts** tier (the `drafting` pieces, oldest-first, capped - previously invisible), and an **upstream count** line that opens triage. The all-clear empty state only renders when `activeCount === 0`, so a phone can never again show a false "You're clear" over a full backlog (the bug this replaced: the deck used to filter to `review`/`approved`/urgent only, which were all zero, hiding 25 drafts + ~190 upstream). Opening a piece on mobile renders the draft in read mode (no keyboard) with a one-tap magic row (Tighten / Sharper open / Harder ending / Make it ready) that previews inline, Cleo / Materials / Research as secondary sheets, and a big sticky Save Draft. The desktop deep-work surface is unchanged.

**Auto-seed - governed seed engine (`api/_seedSources.ts` → `GET /api/content-seed-candidates` → `src/components/content/ContentSeedRail.tsx`).** Top-of-tab rail offering recent real artifacts as one-click seeds into `content_ideas` - builder-operator artifacts beat a blank box. The original rail hardcoded two raw client-side table reads (`zara_signals` + `customer_contacts`) with no time-box, type gate, or dedupe, so it surfaced 8-week-old podcast-booking leads, a literal `test` row, and a lone CRM fragment as "this week's artifacts" (diagnosed 2026-06-11). The fix moves all judgement server-side into a **source registry**: each source declares its own time-box (21-day window), quality/type gate, normalization and weight; the engine then excludes already-seeded `source_ref`s, collapses near-duplicates, ranks by `weight × (recency, score)`, and caps. Current sources - `opportunities` won/lost **with a substantive reason** (w 1.0; hard-gated so the ~2.4k AI-`proposed` rows can never leak in), `customer_contacts` voice (w 0.9), and `zara_signals` **content types only** (w 0.8; `visibility-window`/`guest-window`/`haro`/`test` are routed out - they are outbound/Visibility artifacts, not content). Honest-by-construction: when no source has a fresh content-grade artifact the engine returns `[]` and the rail renders an explicit empty state rather than scraping a dead table. New sources plug into `SEED_SOURCES`, never into the UI. **Zara feed revived (2026-06-11).** The Zara Signal Sweep (`OS - Zara Signal Sweep`, n8n `xAfMItfI8UfAqb3M`) had been running green daily but writing **zero** rows since 2026-04-22 - a silent multi-bug failure in its write path: (1) `Parse Perplexity Response` required `summary`/`signal_score` fields the prompt no longer returned, force-failing every `is_signal`; (2) `Score Signals` read `publishedAt`/`signal_type_candidate` under the wrong names → an age-cliff clamped every score to ≤ −10; (3) the write chain was wired to the **discard** branch of `Filter Confirmed Signals`, `Filter Signal Score GTE 3`, and `Guard Write is_signal` (the good signals dead-ended); (4) `Guard Write is_signal` read `is_signal` off the item that `Check Duplicate Source URL` clobbers to `{}`; (5) the `description` NOT-NULL constraint rejected null `why_it_matters`. All fixed + republished; a production run wrote **17 fresh content-grade buyer-signals** (Chief AI Officer appointments at HSBC, Wells Fargo, BNP Paribas, Commonwealth Bank, etc.) and the seed engine surfaces them. The sweep dedupes by `source_url` (not by event), so the same story across multiple articles inserts as separate rows - the seed rail's text-fingerprint dedupe collapses them downstream. The `Send Telegram Summary` node was also repaired (set `resource=message`/`operation=sendMessage` + assigned the Arlo `telegramApi` credential) and left on continue-on-error, so it posts the sweep summary to Telegram on signal-producing runs and can never fail a run. `customer_contacts` (1 row) remains the only thin feeder.

**Auto-score.** A Postgres trigger (`trg_autoscore_content_idea`, migration `scripts/migrations/2026-06-11-content-autoscore.sql`) fires `net.http_post` → `/api/content-ideas/:id/score` with `model=haiku` the first time a draft `body` appears and `quality_score` is null, so the quality badge is populated before Krish opens the card. Cost-safe: fires once (never re-runs while `quality_score` is set, per the June cost-runaway lesson); Haiku tier per MT-003. Manual re-score (Sonnet, sharper) stays on the Standards button.

**`/api/content-ideas/:id/*` routes.** `revise` (transform axes + iterate, voice + materials-grounded, preview-only), `challenge` (tiered enrich → `meta.challenges[]`), `score` (Five Standards → `meta.standards` + `quality_score`; optional `model` param), `dive-deeper` (scoped Perplexity → `meta.deep_dives[]`), `transform` (parent→child lane variants), **`materials`** (GET/POST/DELETE the corpus on `meta.materials[]`), **`chat`** (Cleo writing partner, multi-turn → `meta.cleo_chat`), **`save-draft`** (sanitize + save body, attach materials, fire the content-factory webhook, → `review`; the Composer's end CTA, superseding `push-to-cleo`, which remains for back-compat). Shared helpers in `api/_content.ts` (Claude single-shot `callClaude` + multi-turn `callClaudeMessages`, voice / corpus / materials grounding, `sanitizeVoice`, CORS). The content-factory webhook URL is server-side + rotatable (`N8N_CONTENT_FACTORY_WEBHOOK_URL`).

**Schema.** Zero new tables - `content_ideas.meta` (jsonb) absorbs `revisions` / `challenges` / `standards` / `cleo_pushes` / **`materials`** (the attached corpus) / **`cleo_chat`** (the Composer conversation) / **`saved_drafts`** (Save Draft stamps), alongside the existing `transformed_outputs` and `quality_score`. `meta` is the durable home for engine + Composer state. RLS unchanged (`content_ideas`: anon SELECT, service_role ALL), which is why all writes route through the API.

**Lane → factory channel.** Two taxonomies overlap but differ: ventures generate variants (`content_lane_*` voice configs: mymu teardown/weekly/built, signal_noise, builder_economy; `builder_economy_ig` is RETIRED as a lane, Instagram is a channel, see §0a), while the factory polishes into `signal_noise | makeyourmindup | linkedin | builder_economy | vertical_video | dynamic`. `src/lib/contentEngine.ts` holds the map plus the transform-axis presets and the Five Standards definitions. Since the 2026-08-06 Techonomic retirement (§11.3) the stored lane values `techonomic` and `mindmaker_live` are legacy: `normalizeLane()` reads both as Mindmaker and every server mapper folds them onto the `makeyourmindup` factory channel, so nothing throws on an old row. `mindmaker_live` became a legacy value on 2026-08-06 when the channel was renamed to `makeyourmindup` (§20).

**Feature flag.** `VITE_CONTENT_ENGINE_ENABLED` (build-time; set true in Vercel env + redeploy to go live). Server keys: `N8N_CONTENT_FACTORY_WEBHOOK_URL`, `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`, optional `NEWSAPI_KEY` and `APIFY_TOKEN` (real Reddit/LinkedIn community scraping in Challenge; degrades to the Perplexity forum pass without it; `APIFY_REDDIT_ACTOR` / `APIFY_LINKEDIN_ACTOR` override the actors). All set in prod 2026-06-11; engine live.

---

### 5.8 Content Engine v2: the weekly brief + shifts register

**Strategic intent.** V1 treated every news item as a candidate piece, so the Content tab became a 200-card triage pile with an obligation attached to each card. V2 inverts it: news is a *corpus*, not a to-do list. Two durable products come out of that corpus each week, everything else purges itself, and the only human work is a finite set of typed rulings. Canonical spec: `docs/CONTENT-ENGINE-V2-SPEC.md`.

**Four rooms** (the Content tab, behind `VITE_CONTENT_V2_ENABLED`, ON in prod):

- **This Week** (default): the BriefCard + the typed DecisionQueue (finite, four-to-five kinds) + one ambient ledger sentence. Zero open-ended triage.
- **Shifts**: the register grid (momentum sparkline, Accelerating/Steady/Fading verdict, provenance bar) + a dossier drawer per shift (week-by-week evidence; actions: Write from this shift, Add to this week's brief, Retire).
- **Feed**: read-only stream of what the engine read, zero obligations; one action (Rescue → graduation candidate).
- **Library**: graduated evergreens + retired-with-verdict shifts, tap-anytime into the Composer.

**The weekly rhythm.**

1. **Feed ingest, daily 11:30 UTC** (`/api/feed/ingest`): pulls the CTRL corroborated headlines pool (`live_headlines_cache`, read-only cross-project read, §2.1) into `content_ideas` as news-horizon Feed rows; newsletters keep arriving via the n8n Inspiration Sweep and Zara via her sweep.
2. **Shifts detect, Fri 17:30 UTC** (`/api/shifts/detect`): a 21-day corpus runs through the recurrence gate: a pattern counts only with **>=3 distinct days AND >=3 distinct sources AND >=3 real citations** (hallucinated ids dropped; zero verified shifts is a valid output). Verified detections register-match to existing shifts (persistent slug identity + embedding match) instead of re-creating them; each shift accrues `momentum_history` per week and dated `shift_evidence` receipts. Provenance is honest: `reconstructed` / `lived` / `mixed`, with the record reconstructed-and-lived back to Jul 2025. **37 shifts at launch.**
3. **Brief assemble, Fri 18:00 UTC** (`/api/briefs/assemble`): drafted-first as an investigative opinion piece (standfirst carrying the verdict / The clues / The consensus, steelmanned / Where the evidence lands / The next twelve months / My position), committing to one stance, either contradicting a widely held belief about AI or business building or confirming a twelve-month thesis, through a commercialisation and corporate-strategy lens. Grounded in the shifts register (implication + momentum) + krish-voice + content corpus → `weekly_briefs` `status='ready'` + a `brief_review` decision. *(Reshaped 2026-08-08; the old Headlines / What this actually means / Perspectives shape read as a roundup with a comment attached.)*
4. **The weekend sitting**: Krish edits in the TipTap Composer/BriefEditor, markdown-canonical (`body_md` is the master, so the factory/Docs contracts are unchanged), with append-only versions + restore, magic edits (tighten / sharper open / harder ending / more data), free "Tell Cleo" instructions with mobile dictation, and span-scoped rewrites; then he approves and pushes: multi-format factory fan-out to Google Docs in one action (`/api/briefs/:week/push`; PUB-001 intact, nothing auto-publishes).
5. **Hard purge, Mon 14:00 UTC** (`/api/purge/run`): every expiring news-horizon Feed row meets one of three fates: **expire** (hard delete), **feed a shift dossier** (`shift_id` set, purge-immune), or **graduate to Library** (`library_at` set). The 200-card pile is structurally impossible.

**Tables:** `weekly_briefs`, `shifts`, `shift_evidence`, `content_decisions` (+ the `content_ideas` Feed columns); see §4.2. Decisions surface through `decisions_waiting.content_decision` (§4.7). Crons are Vercel crons at zero n8n budget cost (§9.3.1).

---

## 6. Workspace architecture (Claude Code agents)

### 6.1 Standard layout

Every Claude Code agent workspace follows the same file convention. Loading order on session wake is described in §7.

```
workspace/
  MINDMAKER_OS_ARCHITECTURE.md   ← THIS FILE - canonical, single OS reference
  IDENTITY.md         - name, role, emoji, vibe
  USER.md             - who the agent serves and how
  ORG.md              - fleet-wide identity (every agent loads this)
  SOUL.md             - personality, voice, operating principles
  CLAUDE.md           - current operating contract (Session Startup Protocol; lives at /root/.openclaw/CLAUDE.md)
  TOOLS.md            - every API/credential/endpoint the OS uses
  MEMORY.md           - long-term curated memory; ONLY loaded in direct Krish chats
  HEARTBEAT.md        - periodic checklist for heartbeat polls
  memory/             - YYYY-MM-DD.md daily logs
  hot/                - runtime-managed: standards-digest.md, systems.md, agatha-inbox/
  warm/               - working docs: agent plans, reports, signal files
  active/             - live state: action docs (rendered from agent_plans), in-flight initiatives
  cold/               - archive
  reference/          - long-lived per-topic documentation
  scripts/            - automation (render-identity.py, regenerate-standards-digest.py, …)
  skills/             - workspace-local skills (per-agent SKILL.md is at /root/.openclaw/skills/agent-{id}/SKILL.md)
  supabase/           - DB helper scripts
  audits/             - periodic audit reports (e.g. 2026-05-25-filesystem-staleness.md)
  brand/              - brand assets
```

### 6.2 Agatha's workspace is the canonical one

`/root/.openclaw/workspace` is the *main* workspace. Agatha is COO and shares this filesystem with the system itself (cron scripts, render pipeline, the shared skills library). Other agent workspaces (`workspace-ops`, `workspace-cleo`, etc.) are slimmer - they inherit `ORG.md` content via load order but have their own `IDENTITY.md` / `SOUL.md` / `MEMORY.md`.

### 6.3 Shared skills library

Path: `/root/.openclaw/skills/`, ~108 skills. Loaded by absolute path from any workspace.

| Skill | Purpose |
|---|---|
| `agent-{id}/SKILL.md` | Per-agent operating manual - rendered from `agents.brief_content` every 15 min. **Edit the DB, not the file.** |
| `krish-voice/SKILL.md` | Krish's writing voice - **mandatory before any outbound content or email draft** (rules V-001..V-007). The *how*. |
| `content-corpus/SKILL.md` | The channel corpus - **mandatory companion to krish-voice for any named channel or outbound**. The *what, who, and how-good*: per-channel mandate (Builder Economy / Signal & Noise / MYMU, including the long-form investigation format), the lead + visibility overlay, and the Five Standards gate (undeniably unique, well-researched, thoughtful, kind, helpful). The investigation playbook was retitled *Investigation (long-form teardown)* in `system_config.content_corpus` on 2026-08-06; `api/_content.ts` still matches the legacy heading so an older copy keeps resolving. Two-way collision rule: that section must never be retitled to contain "MYMU" (it precedes section 4 and would capture the `makeyourmindup` lookup), and the weekly MYMU section must never be titled with "Teardown" or "Investigation" (the format is called *MYMU: Teardown*, so this is now easy to get wrong, and the investigation pattern is tested first) |
| `brand/SKILL.md` | Mindmaker brand positioning |
| `google-docs-api/SKILL.md`, `google-sheets-api/SKILL.md`, `google-slides-api/SKILL.md` | Formatting standards for each surface |
| `knowledge-system/SKILL.md` | Where polished output lands in Drive |
| `n8n/SKILL.md` | 3,500+ lines of battle-tested N8N patterns - **mandatory before editing workflow JSON** |
| `supabase-edge/SKILL.md` | Edge function development standards |

---

## 7. The agent operating contract (CLAUDE.md)

Every Claude Code agent session follows the same wake protocol (`/root/.openclaw/CLAUDE.md`).

### 7.1 Session wake, step by step

**Step 0 - Identity resolution.** Determine `MY_AGENT_ID` from `$AGENT_ID` env or `.agent-id` in workspace root. **Hard fail** + Telegram-Krish if neither resolves.

**Step 1 - Load Identity (static).**
1. `IDENTITY.md`
2. `ORG.md`
3. `/root/.openclaw/skills/agent-${MY_AGENT_ID}/SKILL.md` (rendered from `agents.brief_content`)

Hard fail if SKILL.md missing → Telegram-Krish: "brief not rendered, run `render-identity.py`".

**Step 2 - Load Standards.**
4. `hot/standards-digest.md` (rendered nightly from `standards_registry`)

**Step 3 - Load Plan (dynamic).**
5. Supabase `agent_plans` row for `MY_AGENT_ID` (via `supabase-tools.py`)
6. `active/${MY_AGENT_ID}-action.md` (rendered from the agent's Action Doc)

**Graduated stale handling.** If `agent_plans.last_rendered_at > 72h`, enter READ-ONLY mode - reads/research OK, sends/commits/Supabase-writes blocked. Telegram-Krish: "off-sprint, plan render stale ({age})". The `Agatha Weekly Plan Refresh` workflow (Mon 09:00 UTC) keeps every plan inside the 72h window in normal operation.

**Step 3b: Load Krish's portfolio objective.** If `agent_plans.weekly_goal_id` is non-null, load the corresponding `goals` row (the parent portfolio objective) plus any `goal_agent_contributions` rows where `agent_id = MY_AGENT_ID`. Present them in the loaded context as "Krish's portfolio objective you serve: {title} (venture, status, priority, target_horizon). Your contribution: {note}". The agent's own `agent_plans.objective` (from Step 3) is the slice of work the agent contributes to the visible portfolio objective. If `weekly_goal_id` is null, the agent has no portfolio parent yet and acts on its `agent_plans.objective` alone; clusters of unparented tasks should be surfaced to Marcus for objective nomination.

**Step 4 - Memory.**
7. `MEMORY.md` - **only** in direct Krish chats. Never in shared contexts (Discord, group chats).

**Step 5 - Workstream detection.** `detect_workstream(MY_AGENT_ID, first_user_message)` → continue / ask / new.

**Step 5b - concept-decision check (synthesis paths).** For synthesis-oriented agents (Marcus, Vera, Agatha, Priya), before treating a memory-file or warm-report concept reference as live work, query `concept_decisions WHERE concept_id = $1 AND superseded_at IS NULL`. If a `closed` decision is returned, the reference is historical context only. (The automatic synthesis-time JOIN that would enforce this fleet-wide is not yet wired - see §17.7.)

### 7.2 Lexicon discipline

- **Identity** = static. Lives in SKILL.md / IDENTITY.md / ORG.md / `agents.brief_content`. Rare changes.
- **Plan** = dynamic. Lives in `agent_plans` + Action Doc body + `active/${MY_AGENT_ID}-action.md`. Weekly changes.
- **Objective** = durable strategic record. Lives in `goals` (portfolio objectives, multi-week, Krish owns) plus `milestones` (week-sized chunks of an objective). Same lexical tier as Decision: rare, load-bearing, never silently rewritten. NOT a synonym for Plan. Never call a milestone or an objective a "plan."
- **Decision** = durable. Lives in `concept_decisions` keyed by `concept_id`. Captures every closure / kill / pause / reopen Krish makes. Never deleted; reopens supersede rather than overwrite.
- **Banned forever.** "Master Brief," "Tactical Plan," "Action Plan," "Execution Brief."
- New file proposals must declare which side they fall on. No middle ground.

### 7.3 Output gate

Before any output ships:

```python
violations = validate_output(MY_AGENT_ID, output_text, category)
# If violations: fix them. Do not submit.
```

The gate calls `deliver_gate.py` which checks the output against `standards_registry`. Violations get logged to `audit_log`.

### 7.4 Correction loop

When Krish corrects the agent:

```python
log_correction(MY_AGENT_ID, type, instruction, original, corrected)
```

Vera consumes these; new enforceable standards get proposed if a pattern emerges (§9.5).

### 7.5 Session end

```python
update_workstream_context(context_id,
  summary="what was done",
  artifacts=["task-ids", "doc-urls"],
  pending=["what's still waiting"],
  keywords=["key", "terms"],
  entities=["names", "products"])
```

### 7.6 Non-negotiable rules (excerpt from standards-digest.md)

- Zero em dashes anywhere.
- Git author: `hello@krishraja.com` only.
- No publishing without explicit Krish approval.
- No Opus in N8N.
- Read `krish-voice` skill before any outbound content **or email draft**.
- No markdown artifacts in emails - professional HTML.
- Verify before reporting done.
- Log errors before fixing them.
- **Closures are concept-level, not row-level.** When Krish says "we're done with X" in any context, the correct action is `close_concept('concept:org:X-slug', '<reason>', '<actor>')`, not a row-level status PATCH. The cascading-closure path is the only path that produces a durable ledger entry.

### 7.7 Closure-intent translation (Agatha-specific)

When Krish indicates a concept is closed in conversation (Telegram, Discord, Control Center chat), Agatha:

1. Determines the canonical concept slug from the conversational referent (`compute_concept_slug` is available as an SQL helper; for chat-time resolution Agatha may guess `concept:org:<slug>` and confirm against `concept_decisions` or `leads.concept_id`/`tasks.concept_id`).
2. Calls `SELECT close_concept('<slug>', '<one-sentence reason capturing Krish''s phrasing>', 'agatha-via-telegram')`.
3. Acknowledges with the RPC's return payload: "Closed concept `concept:org:X`. Affected: N tasks, M leads."
4. Updates her memory file for the day with the closure note (Krish-facing context, not a row update).

**Banned:** silent acknowledgement that does not call `close_concept`. The old behaviour where Agatha sometimes patched a single row and sometimes wrote a memory note and sometimes did nothing is the bug this architecture fixes. A dedicated Closure Intent Receiver N8N workflow that would make the receiver path durable across Agatha sessions is not yet built (see §17.7); today Agatha calls the live `close_concept` RPC directly.

---

## 8. Data flows that matter

Each subsection traces one Krish-facing outcome end-to-end. Use these as the canonical truth when reasoning about how a click becomes a row becomes an action.

### 8.1 Lead flow - from capture to enriched lead to email draft

> **HISTORICAL for advisory (2026-07-10).** The `Nell | Lead Document Ingest` ingress below (`/webhook/lead-doc-ingest`) was unpublished 2026-07-10 with the advisory retirement, so the CSV-drop path is no longer live. The rest of the flow (deep enrich, draft email, promote, follow-up, close concept) remains live for product-lane leads (capture, audience, guest routing).

```
Krish uploads CSV via Control Center LeadImportDropzone  [HISTORICAL: ingress unpublished 2026-07-10]
    → POST /webhook/lead-doc-ingest  (Nell Lead Document Ingest)
        → Claude Extract Leads (gpt-4.1-nano, schema:
            fit_score, attainability_score, icp_scores (per-venture jsonb),
            tags (text[]), primary_venture, why_relevant, primary_tension,
            assignee_agent)
            → Shape rows → Supabase upsert leads
                → rows visible immediately in Leads tab, in the
                    primary_venture lane, routed to assignee_agent

Krish clicks "Deep enrich" on a LeadCard
    → POST /api/leads/:id/enrich
        → POST /webhook/lead-deep-enrich  (Agatha Lead Deep Enrich)
            → Fetch Lead → Brave Search → Sonnet Enrich → Parse →
                PATCH leads (fit_score, icp_scores, attainability_score,
                why_relevant, primary_tension, next_step,
                deep_enriched_at, enrichment_status='enriched')

Krish clicks "Draft email" on a LeadCard or in the lead DetailSheet
    → POST /api/leads/:id/draft-email
        → POST /webhook/cleo/email-draft  (Cleo | Email Draft)
            → Sonnet 4.6 drafts subject + body in Krish voice
            → Gmail OAuth: drafts.create
            → INSERT email_drafts row
            → mark_entity_emailed(lead, :id, draft_id, draft_url)
            → response: { ok, draft_id, draft_url, subject, body_preview }

Krish clicks "Promote"
    → POST /api/leads/promote
        → creates tasks row owned by lead.assignee_agent,
            sets leads.promoted_task_id (idempotent)

Krish clicks "Schedule follow-up (1d/3d/7d/14d)"
    → writes leads.follow_up_at
        → Marcus's next synthesis surfaces it in external_signals[]
            with urgency='high'

Krish clicks "Close concept"
    → POST /api/concepts/:concept_id/close
        → close_concept(concept_id, reason, 'krish-via-control-center')
        → cascade: lead → closed_lost; any tagged tasks → superseded
        → ledger + audit_log + status_change_log all populated
```

### 8.2 Guest flow - from sheet drop to confirmed guest to promo drafts

```
Two ingress paths:

  A. Sheet drop (curated bulk import)
     Krish uploads/pastes guest list via Control Center GuestImportDropzone
        → POST /webhook/guest-doc-ingest  (Nell Guest Sheet Bulk Import)
            → Anthropic Sonnet 4.6 extract → Parse + Validate
                → Fetch existing guests → dedupe by email/name
                    → Insert guests (status='enriched', target_type='podcast_guest')

  B. Outbound scout (Mon/Wed/Fri ET, Nell Guest Scout `8DlMfyTYsbnQGYR2`)
     Polls Product Hunt + HN Show HN + Digiday/Rebooting/NiemanLab RSS
        → Dedup against existing guests
            → Anthropic editorial-bar classifier emits target_type +
              fit/attainability scores + skip_reason
                → Insert router:
                    target_type='podcast_guest' AND bar passes → guests
                    target_type='press_target'                 → visibility_targets (type='press_relationship')
                    target_type='dual'                          → both
                    skip_reason set                             → nell_rejected (silent audit)

Hourly: Deep Enrich Retry Sweep finds guests with status='new'
    → POST /webhook/guest-deep-enrich  (Nell Guest Pitch Draft)
        → Sonnet 4.6 drafts pitch (no em dashes, Krish voice, ~110 words avg)
            → PATCH guests (pitch_draft, suggested_angles, status='enriched',
                deep_enriched_at)
                → guest surfaces in decisions_waiting with rich preview

Krish clicks "Confirm" on a GuestCard
    → POST /api/guests/confirm
        → sets guests.status='confirmed'
            → POST /webhook/guest-confirmed-cascade
                → creates 3 tasks (prep / recording / 72h follow-up)
                → drafts 3 promo posts (Sonnet 4.6) → content_ideas (pending)
                → drafts Gmail thank-you when email present
                → upserts contacted_persons row
                → stamps guests.cascade_fired_at

Krish clicks "Draft email" on a GuestCard
    → same email-draft path as §8.1, scoped to guests

Krish clicks "Skip" / "Close concept" on a GuestCard
    → close_concept('concept:guest:<slug>', '<reason>', 'krish-via-control-center')
    → cascade: guest → dropped; any tagged tasks → superseded
```

`guests.target_type` discriminates podcast guests from press relationships. `'podcast_guest'` is the default. `'press_target'` rows do not normally live in `guests` - Nell's scout router sends them into `visibility_targets` directly. The legacy `nell_candidates` table is gone; `guests` is the only insertion target now. `guests.status` allowed values are `'scouted','enriched','pitched','responded','scheduled','confirmed','recorded','published','dropped'`.

### 8.3 Visibility flow (speaking + PR)

```
Two ingress paths into visibility_targets:

  A. Nova Visibility Sweeper (Mon 11:00 UTC weekly, `SIDlCqURzTVsVt70`)
     Perplexity sonar-pro scrapes new conferences / podcasts / CFPs
        → Anthropic Sonnet 4.6 normalises into typed rows (event_url set)
            → Parse + Validate → dedupe → Insert visibility_targets
                (type='conference' typically, status='queued', source_url + event_url)

  B. Nell Guest Scout router (Mon/Wed/Fri ET, see §8.2)
     When the editorial-bar classifier emits target_type='press_target'
        → Insert into visibility_targets with type='press_relationship',
          source_url=LinkedIn/personal site, status='queued'

Every-12h retry sweep (inside Nova Visibility Sweeper) finds rows with
deep_enriched_at IS NULL (LIMIT 10)
    → POST /webhook/visibility-deep-enrich   (Nova Visibility Deep Enrich)
        → Brave research → Sonnet 4.6 generates fit_score + why_relevant +
          suggested_angle + organizer + audience + past_speakers + URLs
            → PATCH visibility_targets (URLs preserved + enrichment fields +
              deep_enriched_at)
                → surfaces in decisions_waiting + Visibility tab

VisibilityTargetCard:
  - Renders Open CFP / Open event / View source / Open profile link by type,
    falling back through cfp_url → event_url → source_url
  - For stub rows (no deep_enriched_at or migration-stub text), the
    Apply button is replaced with an inline Enrich button that fires
    POST /api/visibility-targets/:id/enrich-deep directly from the card
  - Apply / Pass pair otherwise

Krish approves / declines via VisibilityTargetCard
  Apply  → PATCH /api/visibility-targets/:id  status='applied'
  Pass   → PATCH /api/visibility-targets/:id  status='dropped'
  Enrich → POST  /api/visibility-targets/:id/enrich-deep  (fires webhook)
  Close concept → close_concept('concept:vis:<slug>', ...)
```

`visibility_targets.type` allowed values: `'cfp', 'conference', 'podcast', 'newsletter', 'guest_appearance', 'press_relationship', 'speaking', 'other'`. `status` allowed values: `'sourced','queued','applied','accepted','rejected','done','dropped'`. URL fields: `source_url` (canonical), `event_url`, `cfp_url`. Every live row should have at least one URL.

### 8.4 Customer flow - Stripe webhook to Customers tab to email draft

```
Stripe fires an event (checkout.session.completed, invoice.payment_succeeded, ...)
    → POST /webhook/{fractionl|mmctrl}-stripe-revenue
      (both paths served by ONE workflow, Stripe | Revenue Intake, since 2026-07-07;
       merciless/onalert/gutted webhooks deactivated 2026-07-06, product retirement,
       remove those endpoints in their Stripe dashboards during sunset)
        → verify stripe-signature (HMAC over the raw body; arms itself when
          system_config.stripe_webhook_signing_secrets carries the product's whsec;
          forged events are REJECTED with an audit_log stripe-signature-invalid entry;
          until secrets land, events process flagged unverified)
            ├─ Telegram alert
            ├─ Log to workflow_runs (outcome carries path:type:verified-state)
            ├─ Lookup Attribution (recent leads by email)
            └─ Supabase: Upsert Customer → customers table
                (idempotent via product+stripe_customer_id; populates
                attribution_lead_id, attribution_task_id,
                attribution_channel, attribution_confidence)

Nightly 05:00 UTC: System | Stripe Reconciliation | Nightly  ← ground truth
    → Stripe list subscriptions (mindmaker_llc account)
    → map price/product ids via system_config.stripe_price_product_map
    → upsert customers (attribution_confidence='reconciled'), mark lapsed paid rows churned
    → unmapped price ids surface in audit_log (never guessed)
    Webhooks are fast alerts; this job self-heals missed deliveries within 24h.
    (First real run found and restored a paying subscriber the webhooks had missed.)

Nightly 7AM UTC: Maya | Customer Acquisition Sweeper
    → GET each product Supabase profiles/subscriptions/waitlist
    → Normalise → Upsert customers

Krish clicks "Draft email" on a CustomerCard
    → POST /api/customers/:id/draft-email
        → same email-draft path; intent inferred from customer_kind
            (paid → check-in; trial → conversion; churned → win-back)

Stripe fires customer.subscription.deleted (churn)
    → existing Maya | Churn → Exit Interview Task workflow creates a task
    → planned: Stripe webhook also calls close_concept on the customer's
      concept_id as a lifecycle event (not a Krish action) - see §17.7
```

### 8.5 Email-draft flow (canonical, all entities)

The audit added a single canonical path for "draft an email to this entity." Lead, customer, and guest all funnel through it:

```
Krish clicks "Draft email" on any entity card or in any DetailSheet
    → POST /api/{leads|customers|guests}/:id/draft-email
        → Fetch entity row + relevant context (history, recent activity)
        → POST /webhook/cleo/email-draft  (Cleo | Email Draft)
            → Load brief_content for cleo + krish-voice rules
            → Sonnet 4.6 drafts {subject, body_html}
                - Krish voice; no em dashes; HTML body (no markdown);
                ≤180 words for cold; ≤120 words for warm;
                explicit CTA in last sentence
            → Gmail OAuth: gmail.users.drafts.create
            → INSERT email_drafts (idempotent on entity+intent within 24h)
            → mark_entity_emailed(entity_type, entity_id, draft_id, draft_url)
            → response: {ok, draft_id, draft_url, subject, body_preview}

Krish opens the draft in Gmail, edits if needed, hits send.
Gmail does NOT auto-send. Standards PUB-001 / PUB-005 still hold.
```

### 8.6 Content flow (v1, superseded for news 2026-07-10)

```
Zara | Signal Sweep  →  zara_signals + warm/zara-signals/latest.json
    → Zara | Content Pipeline picks top signal
        → Cleo | Omnichannel Content Factory produces drafts
            OR Cleo | Content Idea Capture (Cmd+I from Control Center)
            → Agatha | Content Angle Approval → Telegram to Krish
                → Krish approves
                    → Krish Approval Callback
                        → Cleo | LinkedIn Distribution
                          (guarded by X-Agatha-Secret header)
                            → Cleo | Log Content Performance

Cleo | Content Transform
    → idea_id + target format (linkedin/newsletter/x/podcast)
        → Sonnet 4.6 produces channel-specific variant
            → PATCH content_ideas.transformed_outputs (jsonb)

Content Composer (Content tab - full-screen, one piece; §5.7)
    → review · refine · Cleo chat · attach materials (meta.materials)
        → Save Draft  →  /api/content-ideas/:id/save-draft
            → Omnichannel Content Factory (krish_approved gate)
                → Google Doc in channel Drive folder + Telegram (@krish_approvals_bot)
                    → content_ideas.state = review   (Krish stays the publish gate)
```

**Content flow v2 (live 2026-07-10, §5.8): the news path now runs here.**

```
CTRL pool (live_headlines_cache) + newsletters + Zara
    → /api/feed/ingest (Vercel cron, daily 11:30 UTC)
        → content_ideas Feed (horizon='news', expires_at)
            → /api/shifts/detect (Fri 17:30 UTC; recurrence gate:
              >=3 distinct days AND >=3 distinct sources AND >=3 real citations)
                → shifts register + shift_evidence + content_decisions
            → /api/briefs/assemble (Fri 18:00 UTC)
                → weekly_briefs status='ready' + brief_review decision
                    → Composer / BriefEditor (versions, magic edits, Tell Cleo)
                        → Krish approves
                            → /api/briefs/:week/push
                                → factory multi-format fan-out → Google Docs
                                  (PUB-001 intact: drafts only, Krish publishes)
    → /api/purge/run (Mon 14:00 UTC)
        → each expiring Feed row: expire | feed a shift dossier | graduate to Library
```

**Hard rule (PUB-001 / PUB-005).** No content leaves the system without explicit Krish approval. **The email-draft path is exempt because nothing is sent** - Gmail Drafts only.

**Channel discipline.** Before Cleo (or any content agent) drafts for a named channel, it loads `skills/content-corpus/SKILL.md` alongside `krish-voice`. The corpus routes the signal to the right instrument (a single Zara signal becomes a *different angle* per channel, never the same words reposted) and gates every draft on the Five Standards: undeniably unique, well-researched, thoughtful, kind, helpful. `krish-voice` governs mechanics; `content-corpus` governs channel mandate.

### 8.7 Self-improvement loop - Krish corrects, OS adapts

```
Krish rejects output in Control Center (via FeedbackButton with reason_code)
    → feedback_queue row
        → Vera Feedback Aggregation (Sun 06:00 UTC weekly)
            → Groups unconsumed rejections by (agent_id, source_table, reason_code)
                → If count ≥ 3 and vote = -1 and confidence > 0.85:
                    → corrections row with proposed_brief_edit
                        → Agatha surfaces in Org tab amber panel
                            → Krish approves
                                → Append proposed_brief_edit to agents.brief_content
                                → Mark feedback rows status=consumed
                                → render-identity.py picks up within 15 min
                                → Next session wake loads the new rule
```

**The promise: same mistake doesn't survive four occurrences.** FeedbackButton surfaces: `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas`, **`goals`**, **`milestones`**, plus `customers`, `bets`, `opportunities`, `corrections`, and `contacts` (the `/api/feedback` ALLOWED_TABLES set covers 10+ surfaces).

**Generative arm (success induction).** The same loop runs forward. A thumbs-up on a completed task (the Recently Done section on the Today tab) writes a positive `feedback_queue` row (vote=1): the explicit win signal. Evidence-backed completions count too. Vera then crystallizes repeated wins into reusable skills, the mirror image of turning repeated rejections into corrections.

```
Krish thumbs-up a done task, or a task completes with substantive evidence
    -> feedback_queue row (vote=1) / evidence-backed completion
        -> Vera Success Induction Sweep (Sun 08:00 UTC weekly)
            -> induct_skill_candidates() clusters wins by (agent, task_type)
                -> If a cluster is at/above the volume threshold (default 3):
                    -> Sonnet drafts a reusable play in Krish voice (no em dashes)
                        -> skill_proposals row (status='proposed')
                            -> Surfaces in the Org tab + decisions_waiting Home pane
                                -> Krish approves
                                    -> Append the "Learned play" block to agents.brief_content
                                    -> learning_events row (event_type='win', classification='win_pattern')
                                    -> render-identity.py picks up within 15 min
                                    -> Next session wake loads the new skill
```

**The promise: a repeated win gets crystallized, not only a mistake corrected.** `skill_proposals` mirrors `workflow_proposals` (same state machine, same approval gate); the RPCs are `induct_skill_candidates` / `bump_skill_usage` / `flag_decayed_skills` (§4.8) and the surfacing branch is `decisions_waiting.skill_proposal` (§4.7). Decay is built in: `flag_decayed_skills()` flags an induced skill that goes unused for N days or is followed by a same-pattern rejection, for approval-gated pruning. Phase 1 is **agent-scope only** (the play lands in one agent's brief via the same render path corrections use); shared cross-fleet skills are a later phase. The whole arm **self-gates**: with no win density, `induct_skill_candidates()` returns nothing and the sweep writes only an audit heartbeat. Nothing an agent loads is written without Krish's approval.

### 8.7.0 Three altitudes

The Objective Layer introduces three feedback altitudes, each with a canonical `reason_code` and a distinct lesson Vera teaches Marcus. The whole point of splitting them is that a single rejection at the wrong altitude was previously mud: Marcus could not tell whether Krish meant "wrong task today," "right task wrong week," or "this whole objective is dead." Three completely different lessons.

| Altitude | `reason_code` | Posted from | What it teaches Marcus |
|---|---|---|---|
| Daily | `marcus_priority_override` | Home swap affordance on a top_three card; FocusCalibrator pre-lock swap; `/api/daily-focus/calibrate` double-write | This was the wrong task to elevate today. Re-weight leverage features for this signal class. |
| Milestone | `marcus_milestone_override` | MilestoneCalibrator reject button (DELETE `/api/milestones/:id`) | Right work, wrong week-sized chunk or wrong decomposition. Adjust the decomposition heuristic for this objective shape. |
| Objective | `marcus_objective_nomination_rejected` | NominationTray reject button (POST `/api/objectives/:id/nominate-reject`) | This whole objective is the wrong shape. Tighten cluster detection; raise the theme bar before nominating. |

Vera's `Cluster` node groups by `[agent_id, source_table, reason_code]`, so each altitude rolls up into its own bucket in `corrections` and Marcus's brief evolves on the right axis instead of wobbling.

### 8.7.1 Marcus top_three override capture

The `FeedbackButton` thumbs-down is the lightweight rejection signal. For Marcus's daily `top_three` picks on the Home tab, there is also a higher-effort signal: the swap affordance.

```
Krish hits the Replace icon on a top_three card
    → optional textarea: "What would you have picked instead?"
        → POST /api/feedback with shape:
            { source_table: 'home_intelligence',
              source_id: '<slot index, 0/1/2>',
              agent_id: 'marcus',
              vote: -1,
              reason_code: 'marcus_priority_override',
              reason_text: '<Krish replacement, or null>',
              meta: { original_pick_title, original_pick_meta,
                      replaced_with_text, captured_at } }
            → feedback_queue row

Marcus | Daily Brief 06:30 (next tick)
    → Pull live data node fetches feedback_queue rows where
      reason_code='marcus_priority_override' AND created_at >= now() - 14d
    → Sonnet 4.6 prompt receives the RECENT OVERRIDES block plus the
      Krish-overrides interpretation rules (system prompt)
    → top_three is reranked using the override pattern, if any

In parallel, the standard §8.7 self-improvement loop still applies:
    → Vera Feedback Aggregation (Sun 06:00 UTC) groups
      marcus_priority_override rows with ≥3 matches
        → corrections row with proposed_brief_edit
            → Agatha surfaces, Krish approves
                → Persistent edit to agents.brief_content for marcus
```

The swap is intentionally higher-friction than the thumbs-down: it asks Krish to articulate what he would have picked, which is the signal Marcus needs to learn the pattern. The thumbs-down is "this was bad"; the swap is "this was wrong AND here is what was right."

Carrier file: `scripts/n8n/marcus-daily-brief.workflow.json` (live workflow id `d2sHSeyXMmu8Xe0C`). The Pull live data node grows a 12th parallel fetch from `feedback_queue` (idempotent: `.catch(() => [])` on transport failure). The Sonnet brief system prompt grows a Krish-overrides paragraph; the user content appends the RECENT OVERRIDES JSON.


### 8.7.2 Daily Focus Picker

Krish locks 3 daily focus targets on Home. Marcus nominates 3 via `home_intelligence.top_three`; Krish accepts, swaps, or adds his own; Lock posts to `/api/daily-focus/calibrate`. The whole Home re-ranks into 3 lanes plus a Muted lane.

```
Lock today's 3 → POST /api/daily-focus/calibrate { date, targets[3] }
    → upsert daily_focus row (status='pending')
    → double-write feedback_queue rows for any krish_swapped/krish_added target
      (reason_code='marcus_priority_override', meta.source_phase='phase1_calibrate')
    → await POST https://krishraja10101.app.n8n.cloud/webhook/focus-calibrate
        → Krish | Mindmaker OS | Focus Calibrator (workflow id zEA4wGECQdqBpDmO)
            → fetch candidate pool from 6 tables in parallel
              (decisions_waiting + tasks + bets + leads + visibility_targets + customers)
            → Sonnet 4.6 via /api/internal/sonnet-proxy assigns
              <table:id> → { target: 1|2|3|null, score: 0.0-1.0 }
            → PATCH daily_focus.relevance_index, status='calibrated', calibrated_at
            → workflow_runs heartbeat + Telegram lane sizes
    → client gets { ok, row_id, webhook_ok }

useFocusFiltered(rows, table) → lane-tags any list
DecisionsWaitingPanel renders Lane 1 / 2 / 3 + Muted when status='calibrated'
StreakPills gains "3-for-3" pill (consecutive days with status='complete')
```

Carrier files: `supabase/migrations/20260527190000_daily_focus_phase1.sql`, `api/daily-focus/*` (5 routes), `api/_whisper.ts` (shared Whisper helper), `api/internal/sonnet-proxy.ts` (internal Anthropic proxy used by workflows that cannot inherit credential scope), `scripts/n8n/krish-focus-calibrator.workflow.json`, `src/components/focus/{FocusCalibrator,FocusBar,CarryOverPrompt}.tsx`, `src/hooks/{useDailyFocus,useFocusFiltered}.ts`.

Critical alerts (silent_failures severity='critical') are never muted by lanes.

Feature flag: `VITE_DAILY_FOCUS_ENABLED`. Default false; flip in Vercel to roll out.

### 8.7.3 Tasks Inbox

Cmd+J (desktop) or floating Inbox button (mobile) opens `IdeaCaptureModal`. Krish types or speaks any raw task. The OS classifies, routes, runs it as far as it can, returns it to Krish only when he is needed again.

```
Drop a task → POST /api/tasks-inbox { raw_text, source }
    → INSERT tasks_inbox row (status='raw')
    → await POST /webhook/idea-classify
        → Krish | Mindmaker OS | Inbox Classifier (K8GJw4T2NFjXFXXC)
            → Sonnet 4.6 via internal sonnet-proxy decides
              { task_type, primary_agent, target_table, first_action,
                expected_completion_state, needs_clarification[],
                suggested_concept_id, confidence }
            → status='needs_clarification' → Telegram-Krish questions
            → status='routing' → fire /webhook/idea-route
                → Krish | Mindmaker OS | Inbox Router (GVnJkvJm9vmLG4Jp)
                    → INSERT into one of tasks / leads /
                      visibility_targets / guests / content_ideas /
                      bets (customers route insert a linked task)
                    → compute_concept_slug(first_action) → concept_id
                    → status='in_flight', target_table, target_id

Krish | Mindmaker OS | Inbox Return Detector (2d4iKtsM28IrtvNW)
    every 15 min → scan in_flight rows
        → for each, peek at target row
            → if target reached a needs-Krish state, flip
              tasks_inbox.status='needs_krish'
        → decisions_waiting view exposes it as kind='inbox_returned'
        → 7-day stale → status='failed', archive_reason='classifier_failed'

VPS crontab 08:00 UTC daily → /root/.openclaw/cron/inbox-decay.sh
    → POST rpc/archive_stale_inbox_ideas
        → archives any row still in raw/classifying/needs_clarification
          captured > 14d ago, archive_reason='auto_decay_14d'

Krish | Mindmaker OS | Inbox Digest (tDkmZl2oLU43BHkm)
    Sun 17:00 UTC → GET /api/tasks-inbox/digest → Telegram-Krish
```

Carrier files: `supabase/migrations/20260527200000_tasks_inbox_phase2.sql` (table + decay RPC + decisions_waiting 7-branch extension), `api/tasks-inbox/*` (5 routes), `scripts/n8n/krish-inbox-{classifier,router,return-detector,digest}.workflow.json`, `src/components/inbox/{IdeaCaptureModal,IdeaCaptureFAB}.tsx`, `/root/.openclaw/cron/inbox-decay.sh`.

Feature flag: `VITE_TASKS_INBOX_ENABLED`. Default false.

`decisions_waiting` view is now 9-branch: task, guest, idea, lead, visibility, correction, inbox_returned, skill_proposal, vera_gap (see §4.7).


### 8.8 Self-healing - four-tier silent-failure system

The OS's hardest class of failure is a workflow that "succeeds" (writes `workflow_runs` ok=true) but produces no actual value. Four tiers catch it:

```
TIER 1 (real-time, per-workflow):
    completeness_contracts row per workflow_id
    → Workflow's terminal node runs the gate:
       if rows_written < expected_min_rows
       OR missing expected_columns
       OR freshness_window violated
       → insert silent_failures row with tier=1, severity, evidence
       → Telegram-Krish if severity='critical'

TIER 2 (4-hour cadence):
    Silent Success Detector (system workflow)
    → Scans workflow_runs over last 4h
    → For each (workflow_id, ok=true), checks downstream effects
       (rows inserted in the target table during the window)
    → Zero effects → insert silent_failures row with tier=2

TIER 3 (5-minute cadence):
    Critical Infrastructure Monitor (system workflow)
    → Watches credential_health (expired/expiring),
       system_health (component down),
       RLS denials in audit_log
    → Inserts silent_failures rows with tier=3, severity='critical'
    → CriticalAlertBanner subscribes via useCriticalAlerts and renders on Home

TIER 4 (weekly):
    Vera Failure Pattern Sweep (Sun 07:00 UTC)
    → Groups silent_failures over last 7 days by pattern
    → ≥3 matching failures in same workflow class → corrections row
    → Agatha turns corrections into structural fixes
       (brief edits, standards changes, workflow patches)
```

**The promise: same silent failure doesn't survive a week.**

### 8.8.5 Objective layer flow

Krish's daily work now has a visible spine: every tactical task ladders up through a weekly milestone to a multi-week portfolio objective he owns.

```
KRISH DECLARES OBJECTIVE (top-down strategic call, source=krish_declared)
    POST /api/objectives  ->  insert into goals (status=active)
        |
        +-- agent_plans.weekly_goal_id set per agent  (the rail Step 3b reads on wake)
        +-- goal_agent_contributions row per contributing agent
        |
PROPOSE MILESTONES
    Krish clicks "Have Marcus propose milestones" in MilestoneCalibrator
        -> POST /api/objectives/propose-milestones { goal_id }
            -> proxy to n8n webhook (uL8DLpHbT11eqBAW)
                -> Sonnet 4.6 with Marcus's live brief embedded
                    -> insert 2 to 5 milestones (source=marcus_proposed, status=proposed,
                       marcus_reasoning per row)
                    -> idempotent: skipped if any proposed exists for goal_id
                    -> audit_log: objective_milestone_proposer
        ALTERNATE: Krish hand-writes via POST /api/objectives/:id/milestones
                   (source=krish_authored, status=accepted)
        |
ACCEPT / TWEAK / REJECT / COMPLETE (per milestone)
    PATCH /api/milestones/:id { action: accept | tweak | complete | reorder }
        -> status transitions, source=krish_tweaked on tweak
    DELETE /api/milestones/:id
        -> status=dropped
        -> feedback_queue row: reason_code=marcus_milestone_override (milestone altitude)
        |
MARCUS NOMINATES OBJECTIVES (cluster detection on unparented tasks)
    Daily synthesis detects 3+ tasks with milestone_id IS NULL sharing a theme
        -> insert into goals (status=proposed, source=marcus_nominated)
            -> NominationTray on Home
                -> Krish Accept: POST /api/objectives/:id/nominate-accept
                    -> status=active, activated_at=now()
                -> Krish Reject: POST /api/objectives/:id/nominate-reject
                    -> status=dropped
                    -> feedback_queue: reason_code=marcus_objective_nomination_rejected
                       (objective altitude)
        |
AUTO OBJECTIVES (is_auto=true, Agatha's domain)
    Agatha wake-time check: any active is_auto=true objective with zero milestones
        -> generate milestone sequence (source=agatha_decomposed, status=accepted)
        -> generate tasks under each milestone, assigned to the right agent
        -> upsert goal_agent_contributions per assigned agent
        |
HOME RENDERING
    GoalLadder  (DesktopHome + MobileHome, above the PulseGroup fold)
        -> NominationTray   (only renders when source=marcus_nominated rows exist)
        -> Soft-cap warning (venture-objective count, filtered by horizon;
           NOT the count_active_objectives() RPC, which predates `horizon`
           and counted every active goal)
        -> DeepWorkBlock    (highest-priority objective's active/accepted milestone)
        -> Active strip     (click row -> inline MilestoneCalibrator)
    TopThreeCards
        -> each task card with non-null tasks.milestone_id renders
           "Ladders up to: {parent objective title}" via client-side join
```

**Realtime.** A single channel `objectives-rt-shared` covers both `goals` and `milestones` (ADR-002 single-channel-per-table-set pattern, ref-counted attach/detach in `useObjectives.ts`).

**The promise: tactical work always shows its strategic parent, and deep-work commitments survive the daily leverage contest because they sit structurally above the tactical picks.**

### 8.8.6 Autonomous OS diagnostics (Arlo's mechanical-liveness sentinel)

The four-tier system above watches *workflow outputs*. A complementary deterministic, non-destructive pass watches the *OS machinery itself* - paths, crons, processes, git, and cross-system reachability. It never repairs production; it writes evidence and escalates heavyweight cross-system problems instead of self-healing.

- **Script.** `scripts/os-autonomous-diagnostics.py` (`--mode quick|full`). Checks: critical workspace/script paths exist; active templates carry no *live* `tasks.json` / flat Control-Center-state instructions - with a benign-marker allowlist (`deprecated`, `must not`, `do not`, `never`, `no step`, ``not `tasks.json` ``) so correct *prohibitions* are never flagged; root crontab has no missing paths and exactly one Vera N8N audit entry; active OpenClaw cron payloads carry no architecture drift; no orphaned dashboard process / stray `localhost:8080` listener; git-tree deletion risk; (full mode) Supabase stalled-active-task scan, N8N executions reachability, Control Center homepage reachability.
- **Evidence.** Writes `audits/os-diagnostics/latest.{md,json}` every run; `status` ∈ `OK` / `ATTENTION` / `URGENT`.
- **Escalation, not silent repair.** A heavyweight cross-system `CRITICAL` writes an **Urgent Claude Code CLI Repair Alert** to `hot/urgent-claude-code-repair-alerts/` carrying a full Claude-CLI prompt, evidence, constraints, and validation gates. Resolved alerts move to that folder's `resolved/` subdir with a resolution banner. A *stale* diagnostic snapshot is not truth - every finding must be re-verified against live state before any action.
- **Sentinels.** Root crontab runs `--mode quick` every 30 min (`>> /var/log/os-autonomous-diagnostics.log`, suffixed `|| true` so a diagnostic fault can never wedge cron). OpenClaw job **Arlo Autonomous OS Diagnostics Sentinel** (`3cd5afa9-13cd-4a59-8383-cff50195cc0a`) runs every 6h, silent unless an urgent alert is generated.
- **Ownership.** Arlo owns mechanical liveness (paths/crons/process/git/sync evidence); Kai owns integration viability (credentials, webhook reachability, N8N/Supabase/Vercel); Vera owns semantic correctness and silent-success detection.

### 8.8.7 Vera gap closure loop (detection → owned task → escalation)

The four-tier system (§8.8) and the autonomous diagnostics (§8.8.6) *detect*. Vera's behavioural auditor writes findings to `vera_audit.findings` (a jsonb array of `{band, severity, subject, reason}`), but those findings had no closure path - they accumulated in weekly reports and stopped there (empirically: 1,139 findings over 9 weeks against 2 stale `corrections` and 1 Vera-owned task). This loop is the routing path from "detected" to "owned and tracked": Vera detects, the router assigns an owner, the owning agent closes, the next audit re-checks, and chronic gaps escalate to Krish.

```
Friday 11:00 UTC  Vera weekly behavioural audit -> vera_audit.findings[]
Friday 11:30 UTC  vera-gap-cycle.sh  (VPS crontab, zero-AI-cost)
    -> route_vera_gaps()
        - latest weekly audit; SKIP band='errors' (already healed by the four-tier system, §8.8)
        - dedupe by fingerprint  gap:<slug(subject)>:<band>
        - owner via vera_gap_owner(subject, band): cadence/liveness -> arlo;
          future quality/standards bands -> name-prefix agent (default agatha)
        - upsert vera_gaps ledger; create tasks row (origin='vera_gap_router',
          workstream='os_quality_closure', krish_reviewed=true so it stays OUT of
          the generic decisions_waiting task branch); cycles_open=1
        - gap present in a NEW weekly audit -> cycles_open += 1
        - resolved gap that recurs -> reopen
    -> reconcile_vera_gaps()
        - any open gap absent from the newest weekly audit -> status='resolved',
          task -> done  (absorbs Vera false-positives, e.g. monthly workflows)

decisions_waiting 9th branch 'vera_gap':  vera_gaps WHERE status='open' AND cycles_open >= 2
    -> only gaps flagged across >=2 weekly audits without closure reach Krish's Home panel
```

**Owner model.** A `cadence`/`errors` finding is a *liveness* problem, and the architecture assigns mechanical liveness to Arlo (§8.8.6). So a workflow-not-firing gap routes to Arlo, not to the content agent whose name prefixes the workflow (Cleo cannot fix a cron). `vera_gap_owner` is band-aware, so genuine content/standards gaps route to the name-prefix agent when Vera starts emitting them.

**Current reality.** Vera's auditor today emits only `cadence` and `errors` bands - no content/standards bands yet - so the routed set is workflow-liveness gaps owned by Arlo. The owner-map already handles quality bands for when they appear.

**The promise: a detected gap does not die in a report. It becomes an owned task, auto-closes when fixed, and escalates to Krish if it survives two weeks.** Ledger: `vera_gaps` (§4.6). RPCs: `route_vera_gaps` / `reconcile_vera_gaps` / `vera_gap_owner` (§4.8). Surfacing branch: `decisions_waiting.vera_gap` (§4.7). Migrations: `vera_gap_closure_loop_core`, `decisions_waiting_vera_gap_branch`.

### 8.9 Marcus synthesis - Home Intelligence feed

```
Cron (Mon 11:55 ET / Wed+Fri 07:00 ET / Sun 11:55 ET deep)
    → Marcus | Synthesis + Home Intelligence
        ├─ Load Agent Brief / Voice Rules / Agent Plan
        ├─ Load OS State (workflow_runs, tasks, system_health)
        ├─ Build Prompt with schema for
            home_summary, home_metrics, home_external_signals,
            home_customer_signals, customer_voice
        ├─ Call Anthropic Sonnet → Parse LLM Response
        └─ Write to Supabase:
           - Deterministic fetch of customers (7d) → customer_signals
           - Deterministic fetch of overdue leads (limit 3) →
             prepended to external_signals
           - Deterministic fetch of customer_contacts (7d) → customer_voice
           - Upsert home_intelligence (id='current')
           - If deep mode: also write marcus_synthesis row
           - Always: Telegram Notify + Log Run to Supabase

Marcus | Daily Brief 06:30 (weekdays)
    → home_intelligence.daily_brief + daily_brief_at

Marcus | Friday Retro 17:00 (Fridays)
    → home_intelligence.weekly_retro + weekly_retro_at
    → Acked by Krish via UI → weekly_retro_ack_at set

Marcus | Monday Pre-mortem 08:00 (Mondays)
    → home_intelligence.monday_premortem + monday_premortem_at
```

**Closure interaction.** After `close_concept('concept:org:disney', ...)` runs, `marcus_daily_pull()` returns zero Disney mentions across all arrays (leads, hot_leads, stale_tasks, open_visibility, bets, customers, council). The deterministic data path is therefore Disney-free; only the cached `home_intelligence.top_three` from the morning's run still shows Disney, and it refreshes on the next cron tick. The `marcus_daily_pull()` RPC filters leads on `status IN ('ready','contacted','conversation')`, so any lead-side closure (closed_lost/closed_won/superseded) drops out automatically. The `hot_leads` filter additionally requires `quality_score='green'` - leads without that score never appear there. Not yet wired (see §17.7): a `LEFT JOIN concept_decisions` on each deterministic fetch to also exclude closed-concept rows that somehow remain in a non-terminal status.

**Manual-trigger limitation.** The Marcus | Daily Brief workflow uses the legacy `n8n-nodes-base.cron` trigger node, which is **not** executable via the n8n public REST API or the MCP `execute_workflow` tool. If a manual trigger is needed (e.g. force-refresh after a closure), the only paths are: wait for the next scheduled tick, swap the cron node for a Schedule Trigger (modern equivalent), or add an auxiliary webhook trigger.

### 8.10 Living `agent_plans` (weekly refresh)

```
Agatha Weekly Plan Refresh (Mon 09:00 UTC)
    → Calls refresh_agent_plans() RPC
        → For each agent: build context (last week's tasks, blockers, completed work)
            → Sonnet 4.6 proposes refreshed
                current_phase/objective/blockers/next_milestone
            → Updates agent_plans, bumps last_rendered_at
    → Side effect: no agent goes READ-ONLY from staleness in normal operation
```

### 8.11 Identity rendering pipeline

```
Krish (or Agatha, or Vera) edits agents.brief_content in Supabase
    → render-identity.py  (VPS crontab, every 15 min)
        → /root/.openclaw/skills/agent-{id}/SKILL.md   (output-only file)
            → Claude Code agents load on next session wake
            → N8N agents fetch brief_content directly at workflow runtime
                via the "Load Agent Brief" HTTP node + voice rules from
                system_config.krish_voice_rules
```

### 8.12 Concept closure - Krish says done, OS records and cascades

The two live paths today are the direct RPC (Path A) and the Control Center "Close concept" button (which proxies to the same RPC). The conversational and real-event paths are planned, not built - see §17.7.

```
Path A (manual): direct RPC call
    → SELECT close_concept('concept:<type>:<slug>',
                           '<one-sentence reason>',
                           '<actor>')
    → INSERT concept_decisions (ON CONFLICT updates)
    → UPDATE tasks  SET status='superseded'   WHERE concept_id = $1
                                              AND status NOT IN ('done','superseded',...)
    → UPDATE leads  SET status='closed_lost'  WHERE concept_id = $1
                                              AND status NOT IN ('closed_won','closed_lost','superseded')
    → AFTER UPDATE triggers fire log_status_change()
       → INSERT status_change_log (table_name, row_id, concept_id,
                                   old_status, new_status,
                                   changed_by=app.changed_by,
                                   source=app.source)
    → INSERT audit_log (event_type='concept_closed', actor, target=concept_id, changes jsonb, display_message)
    → returns {ok, concept_id, tasks_closed, leads_closed, decided_at}

UI path (live): Control Center "Close concept" button
    → POST /api/concepts/:concept_id/close → close_concept(...) → Realtime echo updates affected cards
```

Planned (see §17.7): a conversational receiver (Agatha chat → `close_concept`) and real-event auto-closure (Stripe / Gmail / Instantly lifecycle events → `close_concept`). All paths funnel through the same RPC, so the ledger has a single shape and the audit_log has a single event type per closure regardless of trigger.

### 8.13 Self-improvement, extended (planned, see §17.7)

Once a reopen-sweeper exists, the loop closes further: when Krish reopens a concept, `reopen_concept` supersedes the decision and writes a `concept_reopened` audit event; a sweeper would then write a `feedback_queue` row pointing at the original closure, and Vera Feedback Aggregation could extract a pattern ("this concept class gets reopened often - closure criteria too aggressive") → corrections → standards update. This sweeper is not yet built.

---

## 9. Cron and scheduling

Four scheduler layers cover different shapes of work.

### 9.1 OpenClaw cron (`/root/.openclaw/cron/jobs.json`) - ~38 jobs

These spawn isolated Claude Code agent sessions. They cost real LLM tokens. Used when the work needs reasoning or context.

| Cadence | Job | What it does |
|---|---|---|
| `30 11 * * 1-5 ET` | oauth-refresh | Google OAuth token rotation |
| `0 9 * * 1-5 ET` | agatha-state-of-union | Daily SOTU into Telegram |
| `0 9,13,17 * * 1-5 ET` | gmail-monitor | Inbox triage |
| `0 14 * * * ET` | system-health | Infrastructure health pulse |
| `0 3 * * * ET` | context-archiver, workspace_maintenance | Nightly cleanup |
| `0 2 * * * ET` | vera-daily-audit | Light integrity check |
| `0 6 * * 5 ET` | vera-weekly-audit | Friday deep audit |
| `0 10 * * 1-5 ET` | bd-agent | Warm LinkedIn activation |
| `0 11 * * 1-5 ET` | enterprise-gigs-agent | RETIRED 2026-07-10 (Meliora + AdFixus gone) |
| `0 9 * * 1,2,4,5 ET` | visibility-agent | Speaking/podcast outreach |
| `0 7 * * 1 ET` | weekly-synthesis, content-engine-sweep2 | Monday morning content + intel. content-engine-sweep2 is LEGACY: superseded by the Friday Vercel assemble cron (§9.3.1); verify + retire on the next VPS cron pass |
| `30 16 * * 1,3,5 UTC` | Marcus Home Intelligence backstop | Backstop for the N8N synthesis |
| `0 13 * * 1,4 UTC` | Layer 1 Signal Inbox Check | Drain Krish's Drive drop folder |
| Every hour | Arlo, Hourly Feedback Pickup | Sip from feedback_queue |
| `0 9 28-31 * *` | monthly-all-hands | End-of-month executive review |

### 9.2 VPS system crontab - zero AI cost

These run shell scripts and Python that never call an LLM. Cheapest possible cadence.

```cron
*/2  *   * * *   fire-pending-flags.py            # Process pending flags
*/5  *   * * *   cc-sync-engine.sh                # Control Center sync
*/5  *   * * *   poll_sync_queue.py               # Supabase sync queue
*/15 *   * * *   cc-doc-creator.sh                # Auto-create Google Docs
*/15 *   * * *   render-identity.py               # Render agent identities
0    */6 * * *   refresh_token.sh + sync-to-drive.py
0    3   * * *   workspace_maintenance.sh + arlo-daily-contradiction-audit.sh
0    3   * * 1   vera-contradiction-audit.sh
0    6   * * *   Download Cleo's DRAFTS.md from Google Doc
0    8   * * *   vera-n8n-audit.js
30   2   * * *   regenerate-standards-digest.py + vera-nightly-quality-loop.sh
30   11  * * 5   vera-gap-cycle.sh                # Route weekly Vera audit findings -> tasks + auto-close (§8.8.7)
```

### 9.3 N8N cron (inside each workflow)

N8N workflows carry their own `cron` / `schedule` nodes. The ~100 workflows (~85 active) together fire slightly below ~7,411 scheduled executions/month after the 2026-07-10 unpublishings (~99% cron-driven, ~1% webhook). See `workflow_runs` for the live cadence and §3.4.1 for execution-budget governance; Kai's Dependency Mapper rolls it up.

Notable scheduled workflows:

| Cadence | Workflow | Role |
|---|---|---|
| Every hour | Deep Enrich Retry Sweep | Picks up `status='new'` leads/guests/visibility, re-fires the appropriate enrich endpoint |
| Every 3 hours | Critical Infrastructure Monitor | Tier 3 self-healing |
| Every 8 hours | Silent Success Detector | Tier 2 self-healing |
| Mon 09:00 UTC | Agatha Weekly Plan Refresh | Refreshes all 14 agent_plans via Sonnet 4.6 |
| Mon 11:00 UTC | Nova Visibility Sweeper | Weekly Perplexity scrape → visibility_targets |
| Sun 06:00 UTC | Vera Feedback Aggregation | Weekly feedback_queue → corrections rollup |
| Sun 07:00 UTC | Vera Failure Pattern Sweep | Tier 4 self-healing |
| Sun 08:00 UTC | Vera Success Induction Sweep | Generative learning: cluster wins into skill_proposals |

**Planned closure workflows (see §17.7).** `Agatha | Closure Intent Receiver` (webhook trigger only - no cron), and a weekly `Vera | Closure Audit` (Sunday, after Failure Pattern Sweep) that would flag any concept re-closed > 2 times in 30 days as a generator-misfire pattern.

### 9.3.1 Vercel crons (Content Engine v2): the fourth scheduler layer

Content Engine v2 (§5.8) schedules through `vercel.json` crons hitting the OS's own `/api/*` functions. Zero n8n execution-budget impact: none of these count against the 10k/mo n8n cap.

| Cadence (UTC) | Path | Role |
|---|---|---|
| Daily 11:30 | `/api/feed/ingest` | CTRL pool → `content_ideas` Feed (news horizon, expires_at) |
| Fri 17:30 | `/api/shifts/detect` | Recurrence-gated shift detection → `shifts` + `shift_evidence` + decisions |
| Fri 18:00 | `/api/briefs/assemble` | Weekly brief drafted-first → `weekly_briefs` `ready` + `brief_review` decision |
| Mon 14:00 | `/api/purge/run` | Hard purge: expire, feed-a-shift, or graduate to Library |

(`vercel.json` also carries pre-existing Vercel crons for triage sweep, idea clustering, and the Monday discover jobs; the four above are the Content Engine v2 set.)

### 9.4 Cost discipline

| Tier | Where | Why |
|---|---|---|
| Free (zero AI) | VPS crontab shell scripts | Always pick this if no reasoning needed |
| Cheap (Haiku, GPT-4.1-nano, DeepSeek Flash) | N8N monitoring + classification | Hourly+ cadence |
| Standard (Sonnet 4.6) | Agent work, drafting, synthesis, code, enrichment, plan refresh, email drafts, closure-intent translation | Per-session use |
| Premium (Opus 4.7) | **Agatha chat only** | Decisions, not background jobs |

---

## 10. Google Drive structure

All polished output lands in a fixed Drive hierarchy. **Hard rule: never create a file in Drive root.**

| Folder | Drive ID | Contents |
|---|---|---|
| Agent Briefs | `1s3bAJDx1Ze9R6r5atf0j0Y1CsIak_-q5` | Auto-managed by sync; per-agent subfolders |
| Infrastructure | `1y4dncntB8WsKgLjTzC-YZ3KgWXyfwIt5` | OS docs, migration reports, architecture (this file mirrored here) |
| Client Work | `1E2-OsR1Dr5IqhRcfv4w0DyNF3kC9_VBh` | Advisory proposals, client deliverables (Meliora-era material stays as archive) |
| Mindmaker Strategy | `1W3maI4PQvy21iP8FrMJr4IO5QWbS6Q3U` | Sprint outputs, AI consulting proposals |
| Content | `1D5yAn3dlN86aE2Ca64PmgIaGW2D6rwjq` | LinkedIn posts, brand assets, newsletters |
| Prospecting | `1kRKUUHOo0EZOINNgB9PNmYoKnZNbKYuX` | Outreach sequences, deal trackers |
| Reports | `1EhsRtoFcvwIT2Ct-1mn_E5f9yX6g4x_g` | Weekly reports, audits, Vera output, **default fallback** if unsure |
| Career | `1k0owZmiJxx53X0xGgm7zWIem4Zeh92iw` | CVs, applications |
| Signal Inbox | `1zspGabjdCcVTs037EsgnmPHTix9UOMsJ` | Krish drops files here; Layer 1 Signal Inbox processes them |
| Signal Processed | `16j9xgtd1ZlhqP4CkmLwHnejCMDNEqo72` | Processed signal files (moved after extraction) |

`google_drive_sync` table tracks every synced file ID + last-modified.

---

## 11. Portfolio context

The OS actively tracks 8 ventures (`ventures` table, all `status='active'`).

### 11.1 Mindmaker's positioning (2026-07-10, revised 2026-08-05)

**Mindmaker's scope narrowed on 2026-08-05 to one thesis: the creation of your digital brain, with the express USP that it anchors to live decision making.** It is sold two ways: self-serve in the app (CTRL) and as a managed service with Krish as advisor. The managed engagement is broader than the app: depending on the client it covers overhauling GTM, pricing and positioning for a non-AI-native business, or helping build it for an AI-native one. The digital brain anchored to live decisions is the method and the through-line, not the whole deliverable.

**ADVISORY SALES ARE REOPENED as of 2026-08-05**, reversing the 2026-07-10 ruling below. Objective O-2 still needs revising to carry advisory revenue again. Several agent briefs (nova, felix) carry a standing "never pitch advisory" rule that is flagged in-brief as under revision.

| Venture | Status 2026-07-10 (advisory line superseded 2026-08-05) | OS surface |
|---|---|---|
| **Mindmaker** (themindmaker.ai) | REPOSITIONED: missionary vehicle, proprietary content channel, build-lab for incubating ideas. Advisory sales were DROPPED here and REOPENED 2026-08-05; Maven lessons + CTRL retained | Cleo runs the content engine (weekly brief + shifts). The `mindmaker_buyer` ICP lane and Apollo burn-down were retired; 74 advisory leads superseded (audit_log `portfolio_overhaul`) |
| **Meliora** (meliora.company) | RETIRED (consulting engagement ended 2026-07) | Pipeline mechanism retired |
| **AdFixus** (adfixus.com) | RETIRED; venture archived in `ventures` | Campaigns were already paused 2026-06-08; assets remain in OneDrive for the record |

Gutted, Merciless, and OnAlert (already off the control plane 2026-07-06) are now **totally retired**; their manual Stripe/account sunsets remain on Krish's decisions surface.

### 11.2 Builder products

| Product | Domain | Customer slug | OS surface |
|---|---|---|---|
| **mm-ctrl (CTRL)** | ctrl.themindmaker.ai | `mm_ctrl` | AI decision-clarity product for leaders; live surfaces: decision spine, StoneRead, brain canvas, lesson-kit engine at `/kit`; forced-dark redesign live (PR #186). Webhook `/webhook/mmctrl-stripe-revenue`. **B2C launch lane** per the Acquisition OS (§11.5). The OS reads CTRL's `live_headlines_cache` corroborated pool READ-ONLY (`CTRL_SUPABASE_URL`; same project as the audience app DB) as the Content Engine v2 corpus (§5.8); the OS never writes to the product DB |
| **Fractionl Circle** | circle.fractionl.ai | `fractionl_circle` | Subscriptions table sweep. Acquisition lane parked (§11.5) |
| **Fractionl Pulse** | pulse.fractionl.ai | `fractionl_pulse` | Waitlist table sweep. **B2B launch lane**, gated on the demand test (§11.5) |
| **Legibility** | legibility.io | `legibility` | Typed product-data API + MCP for agents. Repo `krishanraja/legibility`, own Supabase `cgkcplcamsijghalintq`. Priya health scan live; no product-truth endpoint, customer sweep, or Stripe webhook yet (TODOs in the workflows). Dev-first, agent-first lane (§11.5) |
| **Full Time** | full-time-alpha.vercel.app | `full_time` | Daily AI football recap. Repo `krishanraja/full-time`, own Supabase `hzadscrqmyilbisexvyz`. Priya health scan live; Stripe is TEST-mode only; no product-truth endpoint or customer sweep yet |

**Retired from the OS control plane 2026-07-06 (Krish directive):** OnAlert (`onalert`), Gutted (`gutted`), Merciless (`merciless`). Their Stripe/Feedback workflows are deactivated, their entries are removed from Priya's scans, Maya's engines, Marcus's synthesis, the competitor scan, the proposal router, all agent briefs, `system_config.fleet_skill_workflow_map_v1`, and `product_truth`. Historical `customers` / `workflow_runs` / attribution rows are preserved, and the `customer_product` enum keeps the old labels (Postgres enums cannot drop values without a rebuild). The apps themselves stay deployed until Krish manually sunsets their Stripe accounts, Vercel projects, and domains.

*Each live builder product emits lifecycle + revenue events to the shared fleet attribution warehouse and publishes a machine-readable product-truth surface the fleet sells from, see **11.4**. Legibility and Full Time are not warehouse-wired yet.*

### 11.3 Creator / content

| Brand | Domain | OS surface |
|---|---|---|
| **The Builder Economy** | thebuildereconomy.com | Conversations with AI builders; daily Instagram cron. Tagged `builder_economy` in venture_registry |
| **Signal & Noise** | (podcast) | AI in media; co-founded with Rio Longacre + Brett House. Nell Guest Scout feeds candidates. Tagged `signal_noise` |
| **MYMU** (Make Your Mind Up; makeyourmindup.ai, renamed from Mindmaker LIVE 2026-08-06) | mindmakerlive.substack.com (Substack not yet migrated, Krish owns that) | The publication. Weekly Headlines / Perspectives / Resources, plus the long-form **investigation** (the teardown: take a claim, decompose it, verify each part against dated evidence, publish where the knowable ends) |
| **Personal Brand** | (LinkedIn / X) | Cleo's content engine target #1 |

**Retired from the OS content plane 2026-08-06 (Krish directive):** **Techonomic**. The brand, the `techonomic.co` destination (which never had a production deployment and served a 409 behind a failed TLS handshake), the `techonomic` lane, and the `techonomic` factory channel are all gone. Everything folds into **MYMU**: fewer brands, and the investigative depth engine is the public version of the advisory offer, so the proof belongs where the offer lives. Techonomic's remit was a topic, not an identity. What survives is the **format**, not the channel: the "Full essay" transform axis, the `investigation` venture rubric in `api/_finalPass.ts` (five lenses, an unverifiable load-bearing claim is an instant fail), and the whole investigation pipeline (`api/_investigation.ts`, `api/_gates.ts`, `api/_harness.ts`, `api/investigations/*`), which now publishes to MYMU. `tech0nomic.substack.com` and its subscribers still exist and are labelled *(retired)* wherever they surface; Krish owns the Substack-side migration.

**Channel mandates** for the content brands + the lead/visibility outbound overlay live in `/root/.openclaw/skills/content-corpus/SKILL.md` (companion to `krish-voice`). Cleo / Nell / Nova load it before composing for a named channel: it defines what each channel is *for* (Builder Economy = the why beneath the why; Signal & Noise = no-BS devil's-advocate; MYMU = weekly Headlines/Resources/Perspectives + why-it-matters, plus the long-form investigation of how the digital world gets paid for) and the Five Standards gate every piece must clear.

### 11.4 Fleet attribution warehouse + autonomous app commerce

The live builder products are agent-native, self-selling surfaces wired to one shared attribution warehouse, so the OS runs their sales + marketing autonomously. Three currently emit lifecycle + revenue events into the warehouse (Circle, Pulse, CTRL); Gutted/Merciless/OnAlert emitters were retired with those products on 2026-07-06, and Legibility + Full Time are not wired yet, so warehouse coverage is narrower than it was until the new lanes mature. The growth agents read the resulting funnel/revenue views + each live app's product-truth surface. Per-app detail lives in each repo's `AGENT_BRIEFING.md` / fleet-wiring doc and in `Downloads/app OS summaries/*.md`.

**The warehouse (OS-owned).** One `attribution` schema on the OS Supabase `gojpffsrxybbpbdzzrvs`, fronted by a single secret-gated edge function `ingest-attribution` (validates `x-attribution-secret`, rate-limits, idempotent upsert into `attribution.events` on `dedupe_key` via the `public.ingest_attribution_event` RPC). The function **normalizes both documented envelopes**: the canonical shape (`event` / `dedupe_key` / flat `utm_*` / `amount_cents`) and gutted's `attribution.events/1` shape (`event_name` / `idempotency_key` / nested `utm{}` / `value_cents`). Two service-role-only read views:

- `attribution.funnel_by_campaign` - landed → signed_up → activated → purchased by app / utm_source / utm_medium / utm_campaign / agent, plus `uniques`. **Maya** reads this for CAC.
- `attribution.revenue_by_campaign` - purchases / gross_cents / refunded_cents / churns, keyed on `(stripe_account, app, stripe_customer_id, stripe_subscription_id)` so the two Stripe accounts never cross-attribute. **Leo** reads this for revenue.

Plus `public.attribution_app_health` (per-app last_event_at + 24h/7d event counts + 30d purchases, for monitoring + the Control Center) and `public.product_truth` (a daily-refreshable cache of each app's product-truth payload, RLS anon-read).

**Ownership boundary (do not blur).** The OS repo is the sole migrator of the `attribution` schema + the `ingest-attribution` function; provenance is committed to `control-center` under `warehouse/` (schema migration + function source). Each app holds ONLY `ATTRIBUTION_INGEST_SECRET` (one shared value across all six apps + the warehouse; in TOOLS.md / system_config), never the OS service-role key. Ingest URL: `https://gojpffsrxybbpbdzzrvs.supabase.co/functions/v1/ingest-attribution`.

**Canonical event contract:** `app`, `event` (`landed`/`signed_up`/`activated`/`purchased`/`refunded`/`churned`), `stripe_account`, `occurred_at`, `anonymous_id`, `user_id` (opaque Supabase uuid - never PHI; gutted ships a deny-by-default allowlist serializer), `email`, the five `utm_*` fields, `campaign_id`, `agent`, `referrer`, `landing_path`, `stripe_customer_id`, `stripe_subscription_id`, `amount_cents`, `currency`, `metadata`, `dedupe_key`. Lifecycle events fire client-side; revenue events fire from each app's signature-verified Stripe webhook.

**Per-app wiring status** (all live-verified end-to-end):

| App | `stripe_account` | Product-truth URL (fetch at runtime) | Emit |
|---|---|---|---|
| **Circle** | `fractionl_ai` | `circle.fractionl.ai/agent.json` | LIVE |
| **Pulse** | `fractionl_ai` | `pulse.fractionl.ai/product-truth.json` (+ MCP + `/fwi-api/current`) | LIVE (Supabase secrets + `VITE_ATTRIBUTION_EMIT_URL`) |
| **CTRL** | `mindmaker_llc` | `ctrl.themindmaker.ai/.well-known/product.json` | LIVE (`WAREHOUSE_INGEST_URL` + secret) |
| **Legibility** | none yet | none yet (TODO: publish + wire emit) | NOT WIRED |
| **Full Time** | none yet (Stripe TEST-mode only) | none yet (TODO: publish + wire emit) | NOT WIRED |
| ~~Gutted / Merciless / OnAlert~~ | `mindmaker_llc` | retired 2026-07-06 | RETIRED (emitters live in the app repos until sunset; warehouse ignores nothing, but the fleet no longer sells from them) |

Env-var names differ per app and MUST match each app's code: CTRL reads `WAREHOUSE_INGEST_URL`; Gutted/OnAlert/Pulse read `ATTRIBUTION_INGEST_URL`. Gutted holds its secret in Vercel (Next.js server-side); CTRL/OnAlert/Pulse hold theirs in Supabase edge secrets. Pulse emits through its own `emit-event` proxy (pure client SPA, so the secret stays server-side).

**Product-truth - the single sell-from source.** Every app publishes a machine-readable truth doc the fleet MUST fetch at use time (PRODTRUTH-001), carrying pricing, ICP, live-vs-roadmap capability status, and a voice / `do_not_say` / `never_claim` array. Agents MUST honor capability status (never sell a non-live feature) and the per-app voice rules (no em dashes; app-specific never-say) before any autonomous post. Cached daily into `public.product_truth`.

**Offer genome (retired capability).** The Merciless writable offer genome (`POST .../offer-admin`) retired with the product on 2026-07-06 and was removed from Maya's brief. Pulse + Circle share `fractionl_ai` and Pulse is Circle's funnel, so the warehouse shows Pulse-sourced revenue landing in Circle (separable by `app` + `stripe_account`).

**Agent bindings (the autonomous loop, wired into `brief_content`):** Maya → `funnel_by_campaign` + runtime product-truth; Leo → `revenue_by_campaign` weekly; Cleo / Nell / Nova / Zara → fetch product-truth + repo `AGENT_BRIEFING.md` before composing, tag every app link per ATTR-001, honor each app's `do_not_say` / voice rules; Marcus → folds warehouse funnel + revenue signal into `home_intelligence`.

**Standards:** **ATTR-001** (every fleet app link carries `utm_source/medium/campaign/content/term` + `agent` + `campaign_id`) and **PRODTRUTH-001** (fetch product-truth at runtime; honor capability + voice guardrails). Both active in `standards_registry`.

**Monitoring:** `Fleet | Attribution & Product-Truth Health` (n8n `Zz0nvhXNELQH0zFy`, daily 06:15 UTC) probes the three live product-truth surfaces (Circle, Pulse, CTRL) and Telegram-alerts ops if any goes down; Legibility and Full Time join the probe list when they publish product-truth endpoints. `attribution_app_health` surfaces per-app emit freshness.

**Outcome trace.** Moves O-2 (revenue - now attributed per app/campaign), O-3 (one person running 15-30), O-7 (decision lag - Maya/Leo act on attributed signal, not guesswork).

**Pending (Krish-blocked):** rotate the leaked `sbp_` token + GitHub PATs + the session-pasted tokens; Circle OAuth scopes; live single-card purchase tests to arm Pulse checkout. (The OnAlert/Merciless items previously listed here retired with those products on 2026-07-06.)

### 11.5 Acquisition OS (v1.1)

The autonomous customer-acquisition layer. Doctrine is canonical in `acquisition-os-playbook.md` (v1.1, OneDrive: `Documents/0 Ventures/Mindmaker/GTM playbook for autonomous agents/`); this section records only what is wired into the OS.

- **One engine, five lanes.** Pipeline `SENSE → QUALIFY → ENRICH → ENGAGE → CONVERT → LEARN` as a Supabase state machine over the existing `leads` / `customers` / `venture_registry` tables. Lanes = the `venture_registry` rows `mm_ctrl` (B2C launch lane), `fractionl_pulse` (B2B lane, gated on a demand test: 3+ qualified meetings in 4 weeks or Gate 1 kill/reposition), `legibility` (dev-first, agent-first: waitlist + llms.txt/MCP discovery, no outbound engine), `full_time` (employers are the buyers; Agatha's existing pipeline is the reference implementation), `fractionl_circle` (parked).
- **v1.1 rulings (Krish, Gate 1, 2026-07-06):** no cold email in v1 and no new motion may require Krish's personal brand; product brands sell (product-brand senders, product-data PR, product surfaces); Krish's personal earned media (podcasts via Nova, his content voice) keeps running unchanged as a bonus channel, never a dependency. Everything is additive: no current functionality retires except products Krish explicitly kills. Instantly senders stay paused by design. Paid tests: $500/month total cap (Gate 4), 2-week cells with kill rules, and spend starts only after revenue is flowing through owned/earned channels.
- **Four gates, one surface.** Strategy / Voice / Named-accounts+warm-network / Money+public-surface approvals all route through `decisions_waiting` (+ Telegram bridge). **SHIPPED 2026-07-16:** the two acquisition kinds are live in view v4 - `sequence_approval` (typed ruling over `acquisition_sequences`, amendable in the Growth tab's Sequence Review sheet before approval) and `send_sample` (queue kind over queued `acquisition_sends`, batch-approved in the Send Approval Deck); the legacy `send-{id}` task rows are view-excluded while their send is queued so nothing double-surfaces.
- **Autonomy ladder.** Per-lane L1 (every send approved) → L2 (1-in-10 sampled) → L3 (exception-only), graduation mechanical on rejection rates, Vera's weekly audit owns demotion. All lanes start L1. **SHIPPED 2026-07-16:** the cockpit is live on the Growth tab - `lane_autonomy_stats` view computes the windows; promote runs mechanical gates server-side (L1→L2: ≥20 approved/30d + <5% rejection; L2→L3: ≥50 + <2% + 14d tenure) returning a 422 criteria checklist; `force` overrides volume gates only; **the profit gate (contribution margin > $0, `lane_economics`) can never be overridden**; demote is always one tap.
- **Profit Governor (2026-07-16).** Per-lane P&L (`lane_economics`: workflow_runs cost via `acquisition_lane_workflows` map + lane-tagged `api_call_log` + `lane_costs` amortization + ad spend vs attributed MRR; unclaimed cost surfaced in `acquisition_unattributed_costs`, never hidden). Budgets in `system_config.acquisition_budgets`; a 6h Vercel cron warns at 80% burn (task) and at 100% trips the breaker - deactivates the lane's mapped n8n workflows (never the Unsubscribe workflow, never the exec-governor whitelist), records `acquisition_paused_lanes`, and resume is Krish-only. Paid budgets require attributed revenue first (Gate 4) and cap at $500/mo across all lanes.
- **Per-lane voice (2026-07-16).** `venture_registry.voice_profile` ({sender, mailbox, voice, icp, strategy, channels, never_say}) seeded for all 5 lanes and read by every copy-producing path (reply drafts, win-backs, sequence proposals, scheduler personalization per the sampling patch). Standing rule hardened: **no motion may require Krish's personal brand in public** - all senders are product mailboxes, every lane's never_say includes personal-brand references.
- **Test-and-learn loop (2026-07-16).** Frames are the test unit: `frame_conversion` view → weekly Frame A/B sweep (spec `scripts/n8n/maya-frame-ab-sweep.md`; deterministic winner at n≥30/arm, 25% relative lift; LLM writes rationale only) → `frame_promotion` proposal → `sequence_approval` ruling. Content→capture attribution closed via `content_ideas.utm_campaign` + `leads.attribution_content_idea_id` (`content_capture_attribution` view). GEO visibility via Zara's geo-citation sweep into `zara_signals`.
- **Moat metrics:** B2B = qualified meetings per 1,000 sends; B2C = capture-to-paid conversion. Opens/clicks are explicitly not success metrics.
- **Build status (2026-07-07): Phases 1-3 SHIPPED.** Phase 1 live end to end: `/download` capture page on CTRL is PUBLIC (flag `VITE_FF_CAPTURE`, Vercel project `mm-ctrl`; capture clock started 2026-07-07, flip check 2026-08-04), engine = 3 Acquisition workflows (§3 table) + `acquisition_sends` ledger + `capture-lead` edge function on CTRL's Supabase; the full L1 cycle (capture → touch-1 send as `CTRL <ctrl@themindmaker.ai>` via verified Resend domain → touch-2 queue → Krish task approval → send → unsubscribe suppression) was live-proven with real email before launch. Phase 2: Full Time podcast RSS (`/api/public/feed.rss`) + per-episode share pages live; Pulse demand surface spec'd (`pulse-demand-test-spec.md`), warm-intro shortlist screened from Krish's LinkedIn export (Gate 1 answered). Phase 3: Legibility `llms.txt` (truth-corrected) + `/.well-known/mcp.json` live; Nova gained a Monday drafts-only product-data pitch lane (P4, 20 nodes, additive-verified) with `visibility_targets.pitch_type`/`product_slug`; autonomy ladder is data (`venture_registry.autonomy_level` default L1 + `autonomy_history`) enforced by Vera's weekly rejection-rate demotion check. Wave-1 distribution pack + shortlist picks + podcast directory submissions sit on Krish's decisions surface.
- **Revenue truth layer (2026-07-07, later):** the Stripe intake is consolidated + signature-capable and the nightly reconciliation makes Stripe the customers-table ground truth (both in §3/§8.4); the Sweeper's product-data research chain is LIVE (rebuilt as an independent parallel chain after the first design was correctly refused over n8n execution semantics), and the whole Visibility Sweeper was resurrected from dead Perplexity/Anthropic credentials in the same pass. Nova's P1-P3 lanes had 15 silent pre-existing defects fixed (identity-prepend field mismatch, post-LLM dead context reads).
- **Deferred / open:** dedicated decisions kinds UI (task-row approvals work); paid tests (locked until owned/earned revenue per Gate 4); Krish-gated: whsec signing secrets, wave-1 approval, Pulse shortlist picks, podcast directory submissions, fractionl_ai Stripe key for Fractionl reconciliation, yearly price-id mappings (in audit_log); follow-up defects queued: Nova Podchaser filter-stage bare $json refs, mobile flex-shrink bug in three older customer panels, Zara signal feed dormant.
- **CORRECTION, 2026-08-04: the outbound send surfaces are UNMOUNTED.** Cold email outbound is retired by the v1.1 ruling above, and `acquisition_sequences` / `acquisition_sends` / `acquisition_replies` have held zero rows since they shipped. So the Send Approval Deck, Reply Inbox, Sequence Review sheet, Nurture Funnel and Touch Progress panels named earlier in this section no longer render anywhere in the Control Center. The API routes (`/api/acquisition/{sends,replies,sequences}`), the ledger tables, the `decisions_waiting` kinds and every component file are untouched, so remounting them is an import away if the motion restarts. What survives on the Growth tab's Governance section is the control plane that is genuinely live: profit governor, autonomy ladder, direction studio, tool registry. The GEO citations panel over `zara_signals` is unmounted for the same reason (zero rows, ever) and superseded by `growth_geo_probes` in the Signals section.

Traces to O-2 (revenue), O-3 (one person running 15-30), O-6 (nothing external without approval), O-7 (decision lag).

---

## 12. Standards (the rulebook)

`standards_registry` holds ~170 rules rendered nightly to `hot/standards-digest.md`. Categories:

| Family | Examples |
|---|---|
| **Brand Voice** | V-001..V-007, CLEO-001, BRAND-001 - writing voice, banned phrases, AI smell test |
| **Git** | GIT-001, V-004 - author identity is `hello@krishraja.com` |
| **Google Docs/Sheets/Slides** | GDOC-001..003, SHEET-001..002, SLIDE-001..004 |
| **Google Drive** | DRIVE-001, VFY-002 - folder routing, no duplicates |
| **Email** | EMAIL-001..005 - professional HTML, no markdown artifacts (applies to email-draft surface too) |
| **Code** | CODE-001..005 - TypeScript, accessibility, Supabase RLS |
| **Process** | AUD-003, SCRIPT-001..003, RESEARCH-001 - verify before "done", no fake output |
| **Publishing** | PUB-001, PUB-005 - explicit Krish approval required (note: email-draft surface is drafts only, not publishing) |
| **Model tiering** | MT-003 - Opus is Agatha-only |
| **N8N** | N8N-002..006 - workflow JSON discipline, no `typeVersion: null`, no `$env` |
| **Closure** | CLO-001 - concept closures use `close_concept`, never row-level patches. CLO-002 - terminal status values are the constraint-permitted vocabulary (`closed_lost` for leads, `superseded` for tasks), not runbook tokens (`dead`, etc.). CLO-003 - every closure caller sets `app.changed_by` and `app.source` for attribution. CLO-004 - Marcus re-stamps `top_three.expires_at` to NOW+24h to defeat date hallucination. CLO-005, CLO-006 - content ideas are rejected if missing `source_url` |
| **Cost discipline** | CFG-COST-001..003, N8N-COST-004 - no premium models in background fallback ladders; a dead primary key is fixed, not absorbed; model-tiering by job nature; prompt-cache only for repeated calls |
| **Attribution** | ATTR-001 - every fleet app link carries UTM tags + `agent` + `campaign_id`. PRODTRUTH-001 - fetch product-truth at runtime; honor capability + voice guardrails |

**Enforcement chain.** `standards_registry` → `regenerate-standards-digest.py` (2:30 AM UTC) → `hot/standards-digest.md` → loaded on session wake → `deliver_gate.py` runs before output → violations logged to `audit_log` → Vera audits compliance → repeat offenders become hard standards.

---

## 13. Failure modes and how the OS heals

| Symptom | First place to look | Healer |
|---|---|---|
| Workflow silently stops firing | `workflow_runs` (per-workflow last entry) | Workflow Monitor (6h) + Kai (4h) |
| Workflow runs but produces no output | `silent_failures` (tier 1 or 2) | Tier 1 completeness gate + Silent Success Detector (8h) |
| Credential expired / RLS denying writes | `silent_failures` (tier 3), `credential_health` | Critical Infrastructure Monitor (3h) → CriticalAlertBanner |
| Control Center build broken | Vercel project deployments | Arlo Vercel Build Health Check |
| Agent giving wrong-shape output | `feedback_queue` after rejection | Vera Feedback Aggregation Sun 06:00 → corrections → brief edit |
| Pattern of silent failures across workflows | `silent_failures` over last 7d | Vera Failure Pattern Sweep Sun 07:00 → corrections |
| Cron missed | `audit_log` actor=cron | `Silent Success Detector` backstop |
| Output didn't match what cron claimed | `audit_log` vs reality | `Truth Reconciler` |
| Workspace contradictions piling up | Nightly contradiction audits | `arlo-daily-contradiction-audit` + `vera-contradiction-audit` (Mon) |
| Standards drift | `standards_efficacy` | Vera Friday deep audit |
| Plan render stale | `agent_plans.last_rendered_at > 72h` | Agatha Weekly Plan Refresh (primary), READ-ONLY mode (safety net) |
| Drive file missing | `google_drive_sync` | `sync-to-drive.py` every 6h |
| Sync queue backing up | `sync_queue` row count | `poll_sync_queue.py` every 5 min |
| Leads/guests stuck unenriched | `enrichment_status='new'` / `guests.status='new'` | Deep Enrich Retry Sweep hourly |
| Email draft fails | `email_drafts` row missing for entity + Vercel function log | Re-click Draft email - idempotent on `(entity, intent, 24h)` |
| Workflow Rerun returns 422 | Schedule-only workflow (no webhook trigger) | Trigger via n8n UI's Execute Workflow button (documented in `/api/automations/:id/rerun`) |
| **Closed concept resurfaces in synthesis** | `concept_decisions` (row present?), then memory files + warm reports for stale references | The row-status cascade in `close_concept` removes the concept from the data path (e.g. Marcus's `marcus_daily_pull()` filters on `leads.status IN ('ready','contacted','conversation')`, so `closed_lost` drops out). The belt-and-braces synthesis-time JOIN `concept_decisions` is not yet wired (see §17.7) |
| **Closed concept gets re-inserted by a generator** | `audit_log` `concept_closed` event + new row with same `concept_id` | Generator guards (every generator queries `concept_decisions` before insert and skips if the concept has a live `closed` decision) are not yet built - see §17.7 |
| **Concept reopened unexpectedly** | `audit_log` `concept_reopened` events | The planned Vera Closure Audit would flag any concept reopened >2 times in 30 days as a closure-criteria misfire (see §17.7) |

**Generic debugging playbook.**

1. Check `workflow_runs` for the relevant `workflow_name` - recent failures?
2. Check `silent_failures` for the same workflow - any tier 1/2 hits in the last 24h?
3. Check `audit_log` filtered by `actor` - what did the agent think it did?
4. Check `credential_health` - was the upstream API reachable?
5. Pull the failing execution from N8N (`/api/v1/executions/{id}?includeData=true`) - what node errored?
6. Compare repo source-of-truth (`n8n/workflows/*.json`) against live workflow - has someone edited live without committing?
7. **For closure-related symptoms:** query `concept_decisions` for the concept_id, then `status_change_log` for the relevant table+row, then `audit_log` for the matching `concept_closed`/`concept_reopened` events. The three together tell the full closure history.

---

## 14. Operational lookup - where to find things

| You need… | Look at |
|---|---|
| The OS architecture (this doc) | VPS: `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md` · Repo: `docs/MINDMAKER_OS_ARCHITECTURE.md` · Drive: Infrastructure folder |
| An API key or credential | `TOOLS.md` (workspace root) - never paste in docs or briefs |
| What an agent does | `agents.brief_content` (DB) → `skills/agent-{id}/SKILL.md` (rendered) |
| What an agent should do this sprint | `agent_plans` row + `active/{id}-action.md` |
| Live agent run history | `audit_log`, `workflow_runs` |
| Why a workflow keeps failing | N8N executions API + `kai_workflow_snapshots` + `silent_failures` |
| Per-product customer counts | `customers` GROUP BY product (anon REST works) |
| Pipeline state | `tasks` (manual) + `leads` (sales, per-venture) + `opportunities` (early) + `guests` (podcast) + `visibility_targets` (PR/speaking) |
| Everything currently waiting on Krish | `decisions_waiting` view |
| This week's brief | `weekly_briefs` (status `ready`/`in_review`/`approved`/`pushed`) |
| Shifts register + dossiers | `shifts` + `shift_evidence` |
| Content decisions waiting | `content_decisions` (`status='pending'`) |
| Corroborated headlines pool | mm-ctrl `live_headlines_cache` (read-only, `CTRL_SUPABASE_URL`) |
| Every email draft created (and whether sent) | `email_drafts` table |
| **Every concept-level decision Krish has made** | `concept_decisions` table |
| **Every status transition (any row, any table with concept_id)** | `status_change_log` table |
| **Whether a given concept is currently closed** | `SELECT decision, superseded_at FROM concept_decisions WHERE concept_id = $1` (live closure = decision='closed' AND superseded_at IS NULL) |
| The N8N source-of-truth JSON for audited workflows | `n8n/workflows/*.json` in `control-center` repo |
| The current schema | Supabase Studio OR `information_schema.tables` |
| What changed last week | `git log` on `control-center` + `schema_migrations` table + recent PRs |
| The closure architecture audit reports | `docs/audits/2026-05-25-closure-day1-stream{1,2}-*.md` in `control-center` |

---

## 15. Architectural decisions worth knowing

### 15.1 Supabase is canonical, files are derived
Local JSON for state is banned. SKILL.md, standards-digest.md, action.md are **output-only** - rendered from Supabase on a schedule, never edited in place.

### 15.2 Identity vs Plan vs Objective vs Decision is a hard quadtomy
If you propose a new file or table, declare which of the four it falls on: static (Identity, lives in `agents.brief_content`, rare changes), dynamic (Plan, lives in `agent_plans` and Action Doc body, refreshed weekly), durable strategic record (Objective, lives in `goals` and `milestones`, multi-week unlocks Krish owns), or durable closure (Decision, lives in `concept_decisions`, captures choices that should never be reversed silently). Anything else becomes a maintenance liability.

### 15.3 Approval is a wall, not a step
No content publishes without Krish's explicit approval. The LinkedIn Distribution endpoint is guarded by `X-Agatha-Secret`; only the Krish Approval Callback workflow has the header. **The email-draft path is a deliberate exception because Gmail Drafts don't publish anything** - Krish still hits send.

### 15.4 N8N workflows worth versioning are checked into git
`n8n/workflows/*.json` holds canonical snapshots for the workflows most central to the audit (Agatha Lead Deep Enrich, Cleo Content Transform, Nova Visibility Deep Enrich, Cleo Email Draft, archived duplicates). Canonical state still lives in the N8N runtime; the files are for diff, recovery, and history.

### 15.5 Deterministic > LLM-emitted for numbers
When the LLM is asked to count things (revenue MTD, customer adds, lead follow-ups) and it has no DB tool, it will produce *plausible* zeros. Pattern: fetch the data with a small HTTP node before the LLM call, OR compute deterministically after parsing. Marcus's Write-to-Supabase node is the reference implementation.

### 15.6 RLS is on every table, always
Anon read for dashboard surfaces; service_role for agent writes. Adding a table without RLS will fail Vera's audit.

### 15.7 Credential rotation is a human-only operation
There's no programmatic revocation for Supabase personal access tokens or N8N API keys. They rotate through the respective dashboards. Annotate `TOOLS.md` with the rotation date when you do it. **Never paste credentials in briefs, architecture docs, or commit messages.**

### 15.8 Multi-tag leads, single primary_venture
A media exec who is both a Mindmaker buyer AND a Signal & Noise podcast guest is one row in `leads` with `tags=['mindmaker_buyer','signal_noise_guest']` and `primary_venture='mindmaker'`. The per-venture lane partitions on `primary_venture`; FeedbackButton + outreach + ICP scoring consults `tags` and `icp_scores`.

### 15.9 The four-tier self-healing pattern
Tier 1 (real-time, completeness contracts) → Tier 2 (4h, silent success detector) → Tier 3 (5m, critical infra) → Tier 4 (weekly, pattern sweep). Don't add a 5th tier; if a failure class doesn't fit one of these, the right answer is usually a new `completeness_contracts` row.

### 15.10 Living agent_plans
`agent_plans` is refreshed weekly by Agatha (Mon 09:00 UTC) via the `refresh_agent_plans()` RPC + Sonnet 4.6. The 72h READ-ONLY mode in the wake protocol is the safety net, not the primary mechanism.

### 15.11 Unified decisions_waiting
Every "thing waiting on Krish" goes through the `decisions_waiting` view, not its own bespoke surface. New surfaces add a `UNION ALL` branch to the view; they do not add a sibling panel to Home.

### 15.12 Retry sweeps over re-fires
When enrichment fails (SSL timeout, model overload, transient), the right pattern is a sweeper workflow that hourly re-tries any `status='new'` row, not a re-fire of the failed batch. Deep Enrich Retry Sweep is the reference implementation.

### 15.13 Email drafts, never sends
The OS can draft any outbound email Krish can imagine. It never sends one. The Gmail Drafts API path means every outbound has a human gate, and the `email_drafts` ledger is a permanent audit trail of every draft ever created (including subject, body, recipient, and intent).

### 15.14 Vercel `/api/*` is the only service-role surface in the browser path
Direct anon writes are fine when RLS permits. When service role is required, the path is always `/api/<route>` - never `import { createClient } from 'supabase-js' with service-role key` in browser code.

### 15.15 The viewport-fit invariant
Every primary tab must fit at 1280×800 without page scroll; sub-panels scroll internally. Mobile viewport must not zoom on input focus (Toast positioning respects safe-area).

### 15.16 Closure is concept-level, not row-level
Rows record the *current* state of an entity. Concepts record the durable identity that survives across rows. Closing a row sets a terminal status; closing a concept records a decision in `concept_decisions` AND cascades terminal status across every row tagged with that concept_id, in every table that participates. Before this, the OS only had row-level closure - that's how Disney existed twice (closed task, open lead) and resurfaced repeatedly. "We're done with X" is always `close_concept('concept:<type>:<slug>', ...)`. Row-level status PATCHes are reserved for genuine row-level lifecycle (lead becomes contacted; task becomes in_progress); for "this conceptual work is done" the ledger entry is mandatory.

**Sub-rules:**

- A `concept_id` is a stable, human-readable slug, prefixed by type (`concept:org:disney`, `concept:guest:firstname-lastname`, `concept:vis:event-2026-q3`). Slug derivation is deterministic via `compute_concept_slug(name)`.
- Terminal status values are the **existing constraint-permitted vocabulary** (`closed_lost` for leads, `superseded` for tasks). Inventing new tokens (`dead`, `archived`, etc.) is what the runbook attempted and what the constraint correctly rejected.
- `reopen_concept` preserves history (`superseded_at`), never deletes. To re-engage a concept that was previously closed, write a new row with the same `concept_id`; the ledger records the concept is once again open.
- All callers (RPCs, edge functions, agent code, future workflows) set `app.changed_by` and `app.source` before any status UPDATE so the AFTER UPDATE trigger writes a properly-attributed `status_change_log` row.
- The `concept_decisions` table is append-only-by-convention (UPSERT updates `decided_at` / `reason` but never DELETEs); `audit_log` entries are immutable.

---

## 16. Krish's ideal day - what "working" looks like

**Before Krish wakes:**

- Agatha's State of Union lands in Telegram (9AM EST weekdays).
- Marcus Daily Brief lands in `home_intelligence.daily_brief` (06:30 UTC, weekdays).
- Loz sends Lauren her daily Publish Press briefing (7AM EST).
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
- Priya monitors product health.
- Kai checks every credential + workflow every 4 hours.
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

## 17. Aspirational targets - where this is going

The current state runs. The aspirational state is what closes the gap to Outcome O-1 ("Krish under 2 hrs/day on ops"), O-2 (builder-product MRR + content audience growing, rewritten 2026-07-10), and the OS's North Star (one person running what 15-30 traditionally does).

### 17.1 Phase 3 gate (CFO + CAIO)

Unlocks when:
- 4 consecutive clean Vera audits land (currently tracked; counter exposed in Vera's brief)
- ≥1 Mindmaker lead attributable to content/visibility lands and closes
- DecisionsWaitingPanel p50 age_hours under 24

Adds two roles: Chief Financial Officer (autonomous revenue + spend visibility) and Chief AI Officer (cross-portfolio AI strategy synthesis).

### 17.2 Email-draft → email-send (gated)

Today: the system drafts; Krish sends. Aspirationally: per-intent, per-entity, per-recipient send rules with a 60-second undo window. Reached only when:
- email_drafts ledger shows ≥100 drafts created with <5% Krish-edits-before-send
- A formal `send_policies` table defines per-channel rules (cold vs warm; first vs follow-up; with/without prior reply)
- Vera ships a `mail-send-audit` workflow that pattern-checks every queued send before release

Until those conditions are met, drafts only.

### 17.3 Multi-channel `decisions_waiting`

Current `decisions_waiting` unifies ten kinds today (see §4.7). The aspirational expansion adds:
- `customer_check_in_due` (paid customers Krish hasn't talked to in N days)
- `bet_resolution_due` (live bets past their time_box_days)
- `kill_list_candidate` (tasks ≥21 days untouched - currently a separate modal, should be unified)

And, with the closure architecture, every branch additionally filters via `LEFT JOIN concept_decisions ... WHERE cd IS NULL OR cd.superseded_at IS NOT NULL` so closed concepts never reappear regardless of generator behaviour.

### 17.4 Truth-Reconciler-driven self-pruning

Current Truth Reconciler reports drift weekly. Aspirational: it proposes corrections automatically (e.g. "Cleo brief references a workflow_id that no longer exists; PR-edit the brief"). Krish approves in Org tab; render-identity picks up the patch within 15 min.

### 17.5 Mobile-first action surface

Lead/Customer/Guest cards expose Draft email + Deep enrich on mobile DetailSheets. Aspirational: every Decision-Waiting row offers its primary action with a single tap, including from a 320px viewport, with haptic-style toast confirmations. Polish iterations track in `docs/AUDIT_STATUS.md`.

### 17.6 Outbound conversion attribution

Today: customers have `attribution_channel`, `attribution_lead_id`, `attribution_task_id`. Aspirational: every `email_drafts.id` is joinable to the eventual `customers` row that closed, so Krish can see "this Mindmaker Strategy Day closed because of this draft Cleo wrote on this date." Closing this loop turns the email-draft surface into measurable revenue, not just convenience.

### 17.7 Closure architecture - what's live and what's not yet built

This is the single consolidated home for the closure-architecture roadmap. The body above describes the **live** foundation; this section is the authoritative list of what is built versus planned.

**Live (current state).**
- `concept_id text` on `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas` (all indexed, backfilled).
- Tables `concept_decisions` and `status_change_log`.
- RPCs `compute_concept_slug`, `close_concept`, `reopen_concept`; trigger fn `log_status_change` + AFTER UPDATE triggers on `tasks` and `leads`.
- Standards CLO-001 / CLO-002 / CLO-003.
- `audit_log` event types `concept_closed` / `concept_reopened`.
- Control Center route `/api/concepts/[id]/close` (→ `close_concept`) and the "Close concept" action on Cards.
- Constraint vocabulary canonicalized on `closed_lost` (leads) / `superseded` (tasks).

**Not yet built (planned).**
- The conversational **Closure Intent Receiver** n8n workflow (Agatha chat → `close_concept`), Schedule-Trigger-based, not legacy `cron`.
- The `/api/concepts/[id]/reopen` route and wiring of "Close concept" buttons across all remaining card UIs.
- **Generator guards** - every generator that inserts into `tasks`/`leads`/`guests`/`visibility_targets`/`content_ideas` queries `concept_decisions` first and skips (or flags) if the concept has a live `closed` decision.
- **Synthesis-time `LEFT JOIN concept_decisions`** in the Marcus / Vera / Agatha paths and the `decisions_waiting` view (the `decisions_waiting` branch JOIN, and the per-fetch JOINs in synthesis).
- `concept_id` extension to `customers` and `opportunities`.
- **Real-event auto-closure** - Stripe `customer.subscription.created` → `close_concept` on the lead concept; Gmail draft sent → `close_concept` on the email_drafts concept; Instantly campaign start → `close_concept` on the outbound-task concept.
- The weekly **Vera Closure Audit** workflow (flags any concept reopened > 2 times in 30 days as a closure-criteria misfire) and the reopen-sweeper that feeds `feedback_queue` (§8.13).

### 17.8 Closure-driven brief evolution (aspirational)

If a particular concept class gets reopened > 30% of the time, that's a signal that closures are being made too aggressively (or the closure criteria are wrong for that class). The planned Vera Closure Audit would flag this and propose `corrections` rows targeted at the relevant agent brief, closing the self-improvement loop around closure quality itself.

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
| **Venture Registry** | The 3-row `venture_registry` table (mindmaker, signal_noise, builder_economy) that drives multi-tag leads and per-venture lanes. |
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
/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md       # THIS FILE
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
/root/.openclaw/workspace-ops/scripts/cc-doc-creator.sh      # Doc auto-create (15m)
/root/.openclaw/workspace-ops/scripts/cc-task-router.sh      # Chat → tasks router
/root/.openclaw/workspace-ops/scripts/poll_sync_queue.py     # Sync queue drain (5m)
/root/.openclaw/workspace/scripts/render-identity.py         # Brief → SKILL.md (15m)
/root/.openclaw/workspace/scripts/regenerate-standards-digest.py  # 2:30 AM UTC
/root/.openclaw/workspace/scripts/fire-pending-flags.py      # (2m)
/root/.openclaw/workspace/scripts/sync-to-drive.py           # (6h)

# Repos
~/Projects/control-center/                                   # Control Center repo (PRs land here)
n8n/workflows/                                               # Versioned snapshots of audited workflows
docs/MINDMAKER_OS_ARCHITECTURE.md                            # Repo mirror of this file
docs/audits/                                                 # Closure architecture audit reports here
```

---

## 20. Recent architectural changes - rolling changelog

### 2026-08-07: Plinth renamed to Legibility

Krish directive: everything called Plinth becomes Legibility. Recorded here because this document now says "Legibility" throughout, including in entries describing events from when the product was still called Plinth, and a reader deserves to know why the earlier history reads that way.

**Already renamed before this pass, and used as the source of truth for it:** the GitHub repo (`krishanraja/legibility`, public), the Vercel project (`legibility`), and the Supabase project `cgkcplcamsijghalintq`. The control-center code had not caught up.

**Renamed here:** the venture slug `plinth` to `legibility` across the Growth, Goals, Pilot, Acquisition and Customers surfaces, the `CustomerProduct` union and its label/accent/chip maps, the acquisition reply sender identity, the e2e fixtures, and five n8n workflow copies (SEO rank sweep, GSC sync, send dispatcher, GEO citation sweep, retention watch).

**Two facts a blanket rename could not know.** `plinth-tan.vercel.app` was recorded here as the deployment URL and is **dead** - it is not attached to the Vercel project at all, so any probe still pointing at it was already failing. The canonical domain is `legibility.io`. And `onplinth.io` is still a live attached domain, so the legacy GSC needles (`onplinth`, `plinth`) are deliberately KEPT in the sync workflow, mapping to the new slug, so properties verified under the old name keep resolving.

**Deliberately not renamed:** the applied migration files under `scripts/migrations/`, which are a record of what was run and would become false if edited. `text-rendering: optimizeLegibility` in `src/index.css` is a CSS property and unrelated.

**The database, the live n8n workflows and the code were renamed in one sitting**, because no ordering of them is safe alone: ship the code first and the lane filters on a slug the database does not contain, so Growth and Customers render it empty; apply the database first and the live workflows keep writing rows against a slug that no longer exists. All five workflows were inactive at the time, which removed the second risk in practice.

**Three things the data migration got wrong on the first pass**, each caught by the database refusing it rather than by review. `venture_registry.slug` is the PRIMARY KEY with **seven** dependent foreign keys, so an in-place update is rejected outright and it has to be insert-copy, repoint every child, delete-old. `leads.primary_venture` is `ON DELETE SET NULL`, so deleting the parent before repointing it would have silently stripped the venture tag off every Legibility lead. And `system_config.value` is `text` despite holding a JSON array, so the `::jsonb` cast that works for `voice_profile` and `creative_direction` fails on it.

**Verified after applying:** a scan of every text, varchar, enum and jsonb column in `public` for the old name returns only `audit_log` (11 rows), `agent_brief_backups` (17) and one `tasks.id`, all three preserved on purpose. Leads with a null venture: zero.

### 2026-08-07: the Drive mirror stops lying, and the branch list is resolved

Two things left open the previous night, both now closed.

**The agent-brief Drive mirror had been dead for six weeks.** `sync-to-drive.py` reported 27 FAILs on every run since 25 June (actions) and 1 July (identities). The per-agent Identity and Action Google Docs had been deleted in Drive, and a stored doc id gave the script no way to recover, so it could only fail forever. The permanent red also buried any genuine failure, which is the more expensive half of the bug.

The fix makes it self-healing rather than merely re-pointed:
- `google_drive_sync.folder_id` records where each doc belongs, so a deleted doc can be recreated in place instead of only failing.
- A write that fails with doc-not-found recreates the doc and repoints the row. It heals once rather than failing on every run.
- **A matching checksum is not evidence the destination exists.** The checksum describes the SOURCE. `arlo/identity` sat green against a deleted doc for weeks because its content had not changed, so the heal path was never reached. Existence is probed before the skip.
- Retired agents are skipped, not mirrored, derived live from `agents.active` rather than a second flag. Felix and Hunter correctly get no docs, and re-arming either needs no bookkeeping.

Verified: `changed=0 skipped=29 failed=0`, exit 0. All 12 active agents have exactly one Identity and one Action doc, zero duplicates. Committed to the workspace repo as `5bee9ba`.

Known and left alone: identity docs rewrite on most runs because the rendered `SKILL.md` carries a `rendered_at` stamp that changes every render. Harmless, just noisy.

**Branch list resolved, 50 to 2.** 33 branches whose PR was merged were deleted, then 13 more that were byte-identical to main (zero diff, so nothing could be lost). Two carried unique work and were **tagged before deletion** so they stay permanently recoverable: `archive/ui-restraint-pass-2026-07-02` (a monochrome restraint pass that hardcodes dark-mode values and would regress light mode) and `archive/growth-tab-alt-2026-08-05` (superseded; main's Growth tab is the larger implementation).

`feat/compound-foundation` is **deliberately kept**. It is not stale: it holds the only copy of the source for **compound.krishraja.com**, a live Vercel project that is CLI-deployed with no git link. Deleting that branch would delete a live product's source. Whether it should get its own repo is a structural call for Krish.

### 2026-08-06 (late): the goal ladder becomes one editor

Krish: *"There should be only one version of every goal... allow me to enter my OS goals, mid term goals and weekly goals, from which the objectives per lane/venture should be sharpened. Its all part of one system and staleness should be flagged as urgent."*

**The data fix had not been the fix.** An earlier pass gave `goals` a `horizon` discriminator, a `parent_id` ladder, a uniqueness index and per-horizon staleness clocks. The rows were then correct and it still did not feel like one system, because Home rendered **two different editors over the same table** - `WeeklyGoals` (weekly only) and `ObjectivesPanel` (venture objectives) - plus a spine reading the same rows a third way. Several editors is several versions, whatever the schema says. `GoalLadder` replaces both; both are deleted.

**Capability was carried across before anything was removed**, on Krish's explicit constraint that nothing be net destructive: inline edit of title / current / progress / notes, the done toggle, add-goal, and the focus line all moved to the ladder first. The focus line has exactly one editor per surface - `OsMissionHero` owns it on desktop because its version offers Marcus's recommended focus, the ladder owns it on mobile where there is no hero.

**Two things only a real click-through found.** The live mobile branch (`VITE_FOCUS_RITUAL_ENABLED=true` in production) rendered **no goal surface at all** - goals could only be entered on desktop, and no amount of reading the desktop file would have shown it. And the ladder first landed inside `PulseGroup`, the collapsed "informs but never asks" fold, which would have shipped the one goal editor hidden behind a fold. Both fixed; both now guarded.

**Three defects the browser found that the build could not.** `Retire` returned a raw Postgres constraint error because the API whitelisted an `archived` status the database has never allowed - a whitelist that does not mirror its CHECK constraint just moves the failure one layer down. The spine announced "1 active objective" beside an empty objectives list, because the list filtered by horizon and the count came from the `count_active_objectives` RPC, which predates the column. And the rung copy read "Add a os goals goal", from deriving an article and a singular off a plural label.

**`system_config.week_of` was stale by four months** and displayed on the Home hero. Now derived at read time (`api/_week.ts`).

**Guard:** `scripts/check-goal-ladder.mts` - one creator, four reachable rungs, parents enforced, retired components not rendered, never inside `PulseGroup`. Sub-resource writes (milestones, nominations, re-level) are allowlisted by name so the exception stays deliberate rather than becoming drift.

**PR #225** plus follow-ups `32e2b817`, `83b7499e`, `70a3cd9a`, `988088c5`. Verified by driving the live app: create, edit, persist, retire, and the goals table left empty for a clean start.

### 2026-08-06 (evening): venture / format / channel split, MYMU becomes the content brand

Krish collapsed the content brands onto one property and, crucially, separated two things the OS had fused. *"Make sure there is a distinction between ventures and media channels. Before I get to work, I should be selecting the venture to work on. After, I should be choosing where to distribute."*

**The three layers, and why they were two.** `lane` used to answer both "what am I working on" and "where does it go". That is why `signal_noise` and `builder_economy` existed as BOTH ventures and lanes, and why Instagram was buried inside a venture value (`builder_economy_ig`). Now:

| Layer | Question | Picked | Home |
|---|---|---|---|
| Venture | What am I working on? | first | `venture_registry` (`kind='media'` for the content ones) |
| Format | What shape is this? | second, scoped to venture | `venture_formats` (new) |
| Channel | Where does it go? | last, multi-select | `media_channels` (new), persisted to `content_ideas.distribution` |

**A channel is never a venture again.** `builder_economy_ig` is retired as a lane; Instagram is a channel any venture can publish to.

**Brands.** themindmaker.ai is the business (managed advisory + CTRL). makeyourmindup.ai is the content brand at its root; Decide / Extend / Imagine stay in place as lead magnets at their own URLs. Signal & Noise and Builder Economy stay as their own shows on their own feeds, untouched, because Krish still needs guests and a feed rename loses every Apple and Spotify subscriber. MYMU: Built therefore DRAWS FROM the Builder Economy recording rather than replacing it.

**MYMU formats.** `MYMU: Teardown` (hero, was Techonomic), `Make Your Mind Up` (the weekly), `MYMU: Built`.

**The weekly is deliberately not a digest.** Weekly AI news is the most saturated format there is and a digest has no spine, so it competes on speed against full-time curation teams. Make Your Mind Up competes on commitment instead: a Best / Worst / Ugliest triptych, then one real decision with two defensible answers, then Krish picks one in public and dates it, then Wrong Last Week. **The commitment and the revisit ARE the format.** Skip the revisit three weeks running and it collapses into a digest with jokes, so the revisit is tracked as an obligation rather than left to memory. The triptych is also pre-cut for short form: three cards, three clips, three chapters, no adaptation work.

**The beat is now enforced in code, not prompt (G0, `api/_beat.ts`).** Krish's exclusion list: not technical news, not governance, not enterprise pilots, not model releases; yes to second-order effects on pricing, positioning, corporate strategy, unit economics and human labour. This runs BEFORE any metered gate call. It is in code for the same reason the vendor-number rule is: the interestingness score selects hardest on asymmetry, and capability announcements score beautifully on asymmetry while being exactly the beat that was excluded. The rule is not "never mention a model release", it is "the event is never the story": an off-beat headline survives when the load-bearing sentence is economic, so *"GPT-5.5 launch quietly repriced the whole agent market"* passes while *"OpenAI launches GPT-5.5 with a 2M context window"* does not. Checked in both directions by `scripts/check-teardown-beat.mts` (6 blocked, 6 passed), because a guard that over-blocks is as damaging as one that under-blocks.

**Corpus restructured** into a shared MYMU house register plus per-format playbooks: `## 0. MYMU house register`, `## 1. Teardown`, `## 2. Built`, `## 3. Make Your Mind Up (the weekly)`, `## 4. Signal & Noise`, `## 5. Maven`. The register carries two load-bearing rules. **The Kind rule:** irony points at claims, hype and incentives, never at a named person's competence, because the corpus is graded against Kind and the sarcastic register would otherwise fight its own rubric every week. **The rigour rule:** the register is sarcastic, the evidence handling is humourless, and the joke can never be the finding.

**Heading collisions are now structurally impossible rather than merely documented.** Every `##` heading matches exactly one `CHANNEL_HEADING` key, asserted directly against the corpus. The house register is matched on the exact phrase "MYMU house register" precisely so a bare "MYMU" elsewhere cannot claim it.

**Known debt, deliberately not bundled.** `growth_social_accounts` and `src/lib/growth.ts` carry their own product vocabulary (`full-time`, `circle`) that does not match `venture_registry` (`full_time`, `fractionl_circle`). Its CHECK constraint was extended to admit the media ventures rather than normalised, because normalising touches 30 seeded `growth_touchpoints` and the Growth tab. That is a separate pass.

### 2026-08-06 (later the same day): Mindmaker LIVE renamed to MYMU, Techonomic folds in as "MYMU: Teardown"

Krish's directive, superseding the earlier entry below that folded Techonomic into "Mindmaker LIVE": *"Techonomic folds in to Makeyourmindup as 'MYMU: Teardown' so I can discern it from other MYMU outputs in the content creator."* One content brand, matching the live property at makeyourmindup.ai. Earlier changelog entries keep their original wording as the historical record; every normative section above is renamed.

- **Slug is `makeyourmindup`, display label is `MYMU`.** Chosen so the content channel and the Vercel project / domain share one name. `FactoryChannel` renamed in `src/lib/contentEngine.ts`; `VentureKey` `mindmaker_live` became `makeyourmindup` in `api/_finalPass.ts`.
- **`MYMU: Teardown` is a format, not a destination.** Added as a lane slot (`lane='mindmaker'`, `slot='investigation'`) so it is selectable and countable separately from the other MYMU outputs, which is exactly what Krish asked for. The slot key stays `investigation` to match the existing `content_cadence` row and the lane config, rather than inventing a second name for the same thing. It routes to the `investigation` corpus playbook and the hard five-lens rubric, so a teardown never drops to the lighter weekly bar.
- **Nothing throws on an old row.** `mindmaker_live` joins `techonomic` as a legacy value in `normalizeLane`, `LEGACY_LANE_CHANNEL`, `StoredContentLane`, `RETIRED_CHANNELS`, `laneToVenture`, `laneToCorpusChannel` and `laneToChannel`. 187 stored `content_ideas` rows were deliberately NOT rewritten: they resolve forward through those aliases.
- **The `customer_product` enum value `mindmaker_live` was deliberately left alone**, along with the Substack import source key. Those back real subscriber rows; only their display labels became MYMU. The Substack itself is still mindmakerlive.substack.com and its migration is Krish's.
- **A live defect fixed on the way.** `system_config.content_lane_techonomic` held `lane=mindmaker, slot=investigation`, but the composer looks up `content_lane_{lane}_{slot}`, so `content_lane_mindmaker_investigation` never resolved and the investigation slot silently fell back to a generic audience posture. The correctly-keyed row now exists.
- **The corpus collision rule is now two-way.** The VPS copy of `content-corpus/SKILL.md` had drifted and was titled *"1. Mindmaker Live: Teardowns (long-form investigation)"*, which is precisely the collision the rule forbids: section 1 precedes section 4 and would capture the weekly-channel lookup. Retitled to *Investigation (long-form teardown)* to match the DB copy, and both directions are now asserted programmatically (no heading may match both the investigation and the MYMU pattern). Because the format is called "MYMU: Teardown", the reverse mistake is now the easy one: never title the weekly section with "Teardown".
- **n8n.** Four workflows re-keyed (Orchestrator active, Content Factory / Marcus / Nova inactive). `VENTURE_TO_CHANNEL` now maps both `MINDMAKER` and `TECHONOMIC` to `makeyourmindup`. Verified after the write that zero nodes were renamed and there are zero dangling `$('node')` references or broken connections, since node names are string-referenced by expressions. The Orchestrator was confirmed still active afterwards. No git snapshot under `scripts/n8n/` contained the channel, so the sync-revert trap did not apply.

### 2026-08-06: Techonomic retired as a brand, folded into Mindmaker LIVE

- **The ruling (Krish).** "techonomic.co will go, wire EVERYTHING to this new decision to fold everything techonomic in to Mindmaker live." Principle: fewer brands is better. Techonomic's remit was a TOPIC, not an identity, and the depth engine built for it produces the public version of the advisory offer, so the proof belongs where the offer lives.
- **The facts behind it.** `techonomic.co` served a 409 with a failed TLS handshake and its Vercel project never had a production deployment. The real publication is `tech0nomic.substack.com` (15 posts, dormant since 2026-03-10); `mindmakerlive.substack.com` (19 posts) is the survivor. Krish owns the Substack-side migration.
- **Gone as a destination.** No `techonomic` lane (`src/lib/contentLanes.ts`, `ContentLane`), no `techonomic` factory channel (`src/lib/contentEngine.ts`, `FactoryChannel`), no Techonomic option in the synthesis modal, the transform targets, the weekly-brief fan-out, or the lane-adapt palette. See §11.3.
- **Alive as a format.** The length axis "Full (Techonomic)" is now **"Full essay"**, carrying the investigative steer (600-1000 words, decompose the claim, check each part against dated evidence, hold one counterpoint, say where the knowable ends, hard verdict). The `techonomic` venture rubric in `api/_finalPass.ts` became **`investigation`**, labelled "Mindmaker LIVE (investigation)", keeping its five lenses and its instant-fail on an unverifiable load-bearing claim. The investigation pipeline (`api/_investigation.ts`, `api/_gates.ts`, `api/_harness.ts`, `api/investigations/*`) is renamed to Mindmaker LIVE throughout and its evidence manifests are titled accordingly.
- **The bar follows the evidence, not the brand.** `api/content-ideas/[id]/final-pass.ts` now selects the `investigation` rubric whenever the row carries a verified evidence manifest (`meta.materials[].investigation_id`), whatever lane it sits in. Before this, the five-lens bar only fired for `lane='techonomic'`, so retiring the lane would have silently downgraded every future teardown to the lighter Mindmaker LIVE rubric.
- **Nothing throws on an old row.** `normalizeLane()` reads the stored values `techonomic` and `mindmaker_live` as Mindmaker for lane filters, counts and cadence; `laneToFactoryChannel` / `laneToVenture` / `laneToCorpusChannel` / `save-draft`'s `laneToChannel` all map them onto Mindmaker LIVE; `transform`, `synthesize`, `pilot/build-one`, `push-to-cleo`, `save-draft` and `briefs/:week/push` map a retired lane or channel in a request body instead of returning 400. `CadenceBar` renders nothing rather than throwing on a lane that no longer exists.
- **Kept on purpose.** `tech0nomic` stays as a Substack import source, a `customer_product` enum label and a growth metric key, each relabelled *(retired)*, because the subscribers are real and the enum value cannot be dropped. `substack_tech0nomic_total` was removed from the stall detector's watch list so a dormant publication stops drafting growth moves. The `scripts/migrations/2026-08-05-techonomic-*.sql` files are untouched: they are named after the feature they created and are historical record.
- **Closed out later the same day.** `system_config.content_corpus` was retitled to *Investigation (long-form teardown)* and its 21 brand references rewritten to Teardowns, with the mandate, the characteristic question ("Who pays for this, and what happens to that when [shift] lands?"), the structures and the Five Standards preserved verbatim. The heading is deliberately NOT "Mindmaker LIVE: Teardowns": section 1 precedes section 4, so that wording would capture the `mindmaker_live` lookup in `api/_content.ts` and hand every weekly piece the teardown bar. Verified after the rewrite that all six channels resolve to exactly one distinct section. Backup in `system_config.content_corpus_backup_pre_teardown_rebrand_20260806`. `system_config.content_lane_techonomic` was folded (lane/slot remapped, retirement markers added) and the `cadence:techonomic` ledger row keeps its primary key on purpose, because the seed migration is `on conflict (id) do nothing` and changing the id would let a re-run resurrect the lane.

### 2026-08-06: AdFixus, Meliora, Amperity and Techonomic purged OS-wide

- **The ruling (Krish).** "make sure adfixus, amperity, techonomic, meliora are all purged from the entirety of the OS." Amperity was already clean in this repo and never existed in n8n; the false "Chief of Staff at Amperity" claim that survived the 2026-08-05 scrub in `agents.mandate` (Hunter, Felix) was removed.
- **The distinction that governed every edit.** A reference offering a retired venture as a choice for NEW work was deleted; a reference that historical rows still resolve against was kept and marked *(retired)*. So the venture pickers, the exec filter and both `VENTURE_POSITIONING` offers went, while `VENTURE_LABEL`, `VENTURE_META` and the `KNOWN_VENTURES` PATCH allowlist stayed. Deleting the latter would blank pills on historical contacts and 400 unrelated saves.
- **Not deleted, because it enforces the retirement.** Zara Signal Sweep's `const deadVentures=['adfixus','meliora']` guard and the `'TECHONOMIC': 'mindmaker_live'` / `'ADFIXUS': 'linkedin'` aliases in the Orchestrator's `VENTURE_TO_CHANNEL` are what keep old briefs routing and retired ventures suppressed.
- **n8n.** Nine workflows cleaned in cloud. Zara Signal Sweep lost 35 nodes (three retired-venture scraping subgraphs), validated afterwards at 0 dangling edges and 0 broken `$('node')` references. The Omnichannel Content Factory's teardown branch was re-keyed off a `format` discriminator rather than the channel, so Mindmaker LIVE still carries live builds and fresh news without every piece becoming a teardown. Node names containing the retired brand were deliberately left, since expressions reference them as strings.
- **Docs corrected against the live table.** README, GLOSSARY and DATABASE each claimed a nine-name "full portfolio". `ventures` actually holds 8 rows, 6 active and 2 archived (`adfixus`, `onalert`), with no `meliora`, `gutted`, `merciless` or `mm-ctrl` row at all.
- **Still open (Krish's call).** `venture_registry.adfixus` and `.meliora` are both `active = true` and still carry ICP and lead-scoring criteria, so leads can still route to them; `venture_registry.slug` is an FK target for six tables, so flipping `active` is the safe move and deleting is not. `content_pillars` `pillar:portfolio_operating` still instructs Cleo to name the retired ventures in published content.

### 2026-08-04: Growth is one tab again, five sections, retired machinery unmounted

- **Two tabs that both read as "growth" became one.** The sidebar carried `acquisition` labelled "Growth" (the outbound command deck) and `growth` labelled "Growth map" (the strategy layer). They overlapped on measurement and half the deck served cold email outbound, retired by the §11.5 v1.1 ruling. Merged into a single tab labelled **Growth** (`src/components/growth/GrowthTab.tsx`), five sections in the order of Krish's weekly loop: **Map**, **Work**, **Signals**, **Council**, **Governance**. `src/lib/tabs.ts` drops from 12 entries to 11; the mobile primary set is unchanged (Home, Content, Network, Growth).
- **Old links still land.** `#/acquisition` resolves to `#/growth` in `App.tsx` ahead of the simplified-IA alias table, so it works in both IA modes, and every `navigate('acquisition', ...)` call site (`decisionActions`, `decisionKinds`, `routeDecision`, `pilotIntent`) keeps working. Arriving that way, or with `?lane=`, opens the Governance section, which is where the lane controls those links pointed at now live.
- **Signals is one measurement surface.** GEO probe results (`growth_geo_probes`, citation rate as the headline, computed from the rows and never stored) with Maya's SEO rank sweep (`maya_striking_distance`) underneath. The SEO panel runs cross-lane here because the two tables use different key spaces (lane slug vs product slug), so each row is labelled with its lane. Two live defects fixed in that panel while promoting it: the priority sort was Postgres-default NULLS FIRST, so 31 unscored brand-name keywords buried the 10 real striking-distance targets, and PostgREST returns `numeric` as a string, so the rank-movement arrow was comparing positions lexicographically.
- **Unmounted, not deleted.** `GeoCitationsPanel` (reads `zara_signals` where `signal_type='geo-citation'`: zero rows, ever, and duplicated the real GEO surface), `SendApprovalDeck`, `ReplyInbox`, `SequenceReviewSheet`, `NurtureFunnelPanel`, `TouchProgressPanel` (all three backing tables empty and staying empty by doctrine), `ContentToCapturePanel` (`content_capture_attribution`: zero rows) and the `DesktopAcquisition` / `MobileAcquisition` shells. Every file stays on disk with a retirement banner. `ChurnReengagementQueue` renders in Governance only when the queue is non-empty (`leads.status='churned'` is zero today), so it costs nothing and still self-surfaces on a real cancellation. `DirectionStudio` moved into Governance: it is live (5 locked lane directions) and lane-keyed, like every other card in that section.
- **Verified in a real browser** at 1440x900 and 390x844, against live data: one "Growth" sidebar entry, 30 touchpoints on the Map, 8 GEO probes with a 0% citation rate, 3 council reviews all awaiting a ruling, an empty creative board that says so, `sw === iw` on both viewports, no console errors.

### 2026-07-27: Inspiration Sweep hardening - message ledger, recurrence-not-duplicates, temporal class, source registry

- **The sweep now has memory.** `Cleo | Mindmaker OS | Inspiration Sweep` (`D4W5TF1sP9lE828c`) was re-reading the same Gmail messages every run (`newer_than:7d`, no state) and re-inserting the same stories 4-6x across consecutive days (39 duplicated URLs; e.g. one Thinking Machines story inserted 6 days running). New `inspiration_messages` ledger records every Gmail message id processed; a Seen Filter skips them on later runs. `maxResults` raised 20 to 50 with a 20-new-per-run processing cap and honest `gmail_overflow` accounting in heartbeat metadata (first hardened run: 38 listed, 20 processed, 18 overflow deferred to next run - the old cap was silently dropping mail).
- **Recurrence is data, not duplicate rows.** All seed writes go through the `upsert_inspiration_seed` RPC (service-role only): a re-seen `source_url` appends `{day, label, newsletter_key}` to the keeper's `meta.recurrences`, refreshes contrarian/adjacent-stories research, and extends `expires_at` (a story that keeps recurring is trend-shaped and must not be purged as stale news). Partial unique index `content_ideas_inspiration_url_live_uq` enforces one live parent seed per URL (transform children exempt). Backfill folded 68 duplicate rows into 36 keepers and buried them. `api/shifts/detect.ts` expands `meta.recurrences` back into dated corpus items so the trend gate's recurrence floor still sees every citation.
- **Sender registry + canonical labels.** `newsletter_sources` (keyed by `from_email`) gives every seed a stable `newsletter_key` + canonical `meta.source_label` via the `register_inspiration_messages` RPC; unknown senders self-register. This fixes the shift gate's source-diversity floor, which 69 free-text label variants ("The Deep View", "The Deep View (Jason Hiner)", ...) had been inflating. `newsletter_source_yield` view scores each subscription (seeds/advanced/buried/recurrences) and is injected into the extraction prompt as a track record: low-yield sources face a higher bar.
- **Temporal class (news vs trend).** Every seed is classified `ephemeral | developing | durable` with `expires_in_days`; mapped to the existing fates: ephemeral/developing get `horizon='news'` + `expires_at` while still seeded (Monday purge applies), durable gets `evergreen`. Purge gained a safety floor: rows in drafting/review/approved/published are never expiry-deleted. Zero-Gmail runs now write a tier-2 `silent_failures` row (`no_input`) instead of logging success - the Jul 10-14 five-day dark stretch (7-9s "successes", zero reads) is no longer silent.
- **Lane Sourcing provenance + secrets.** `Cleo | Content Lane Sourcing` (`rRAyEUs7NsY06hFy`) was writing drafts as `source_type='inspiration_sweep'` (49 rows polluting the shift corpus): new `lane_sourcing` source_type, rows backfilled, workflow patched, plus DB trigger `trg_fix_lane_sourcing` enforcing the invariant at the SSOT. Same workflow had hardcoded Anthropic + Perplexity API keys in HTTP headers: replaced with n8n credential bindings (rotate both keys). Both workflows now have sanitized snapshots in `scripts/n8n/`.

### 2026-07-16: Growth tab - acquisition mission control, autonomy cockpit, profit governor

- **New 12th tab `acquisition` ("Growth")**: the act-surface for autonomous customer acquisition (Subscriptions stays the read-only revenue watch). Per lane: nurture funnel (`acquisition_capture_to_paid`), touch progress, Send Approval Deck (batch approve/reject; L2 sampling banner), Lane Playbook (inline-amendable `venture_registry.voice_profile`), Frame A/B leaderboard, Content→capture attribution, GEO citations, Reply Inbox, churn win-backs, Autonomy Ladder cockpit, Profit Governor. Six consolidated service-role routes under `api/acquisition/*` (sends ledger carries PII - never the anon client).
- **decisions_waiting v4 (live)**: `sequence_approval` (typed ruling, amend-then-approve) + `send_sample` (queue kind → Growth deck); legacy `send-{id}` task rows view-excluded while queued. Rejections write `feedback_queue` so Vera's rejection-rate ladder stays mechanical.
- **Hard money gates in the control plane**: promotion blocked at ≤$0 contribution margin (unoverridable); paid budgets need attributed revenue (Gate 4) + $500/mo global cap; 6h governor cron warns at 80% burn and circuit-breaks at 100% (pauses the lane's mapped n8n workflows - Unsubscribe is never in the map). Budget/breaker/lane config in `system_config` (`acquisition_lanes/budgets/lane_workflows/paused_lanes`).
- **Standing rule hardened (Krish, 2026-07-16): the autonomous system never requires Krish's personal brand in public.** Product-mailbox senders everywhere; reply/win-back drafts carry never-write-as-Krish voice rules; personal-posting playbook tactics excluded.
- **n8n**: 3 live CTRL acquisition workflows checked in (sanitized); new Send Dispatcher / Reply Intake / GEO Citation Sweep workflow JSONs + Nurture Scheduler sampling patch + Frame A/B sweep spec await import (see `docs/GROWTH_TAB_RUNBOOK.md` - session's auto-permission layer declined to create live email-sending workflows autonomously).
- **E2E**: Playwright suite added (`e2e/growth.spec.ts`, mocked APIs, 4 green); orphaned `WorkflowImprovements.tsx` removed (its burn-bar idiom lives on in `BudgetBar`).

### 2026-07-10: Portfolio overhaul: advisory-sales retirement (+ Control Center decision idiom, waves 1-2)

- **Advisory sales dropped fleet-wide** (REOPENED 2026-08-05 under the digital-brain thesis): AdFixus + Meliora retired, Mindmaker repositioned (missionary vehicle + content channel + build-lab; Maven lessons + CTRL retained). Gutted/Merciless/OnAlert now totally retired. O-2 rewritten to product MRR + content audience growth. DB: AdFixus venture archived, 74 advisory leads superseded, Felix `active=false` (audit_log `portfolio_overhaul`). n8n: Felix Opportunity Pipeline Tracker, Nell Apollo Contact Enrichment, Nell Lead Document Ingest, Nell Draft Outbound Messages unpublished (~outbound budget reclaimed). Briefs reoriented with dated blocks: Maya to product growth, Nell to guest booking only, Nova to platform-building with no advisory pitching. QUEUED: Zara Signal Sweep still carries the buyer-signal-to-leads branch aimed at the retired pipeline (surgical patch next session); Hunter's job-sweep purpose is arguably complete (Krish's call); Mindmaker site advisory-sales removal is a separate product pass.
- **Content Engine v2 + coherence waves 1-2 shipped to prod** (PRs #179-#182): weekly brief + 37-shift provenance-labeled register replace one-at-a-time triage; unified typed decisions (`content_decisions` in `decisions_waiting`; view v3 hides future-deferred tasks); Home anchor counts only typed rulings with queue chips + ambient fold; Today is a 3-verb queue (approve / send back with note / defer); Leads/Guests/Network land in bounded triage decks; dictation-first mobile inputs. Weekly rhythm: Feed ingest daily 11:30 UTC, shifts detect Fri 17:30, brief assembles Fri 18:00, purge Mon 14:00 (Vercel crons, zero n8n budget).

Pruned to the last 90 days. Older history is git-archaeology territory.

### 2026-07-07 (later) - revenue truth layer + subscriber visibility + Nova resurrection

- **Stripe | Revenue Intake** replaces the last two per-product webhook clones: one workflow, both live paths unchanged, HMAC signature verification that arms itself when `system_config.stripe_webhook_signing_secrets` is populated (adversarially tested: forged event rejected + audited, signed event verified; secrets disarmed until Krish supplies real whsec values).
- **System | Stripe Reconciliation | Nightly** (05:00 UTC): Stripe is now the customers-table ground truth for the `mindmaker_llc` account; price/product mapping via `system_config.stripe_price_product_map`, unmapped ids surface in audit_log. First run found and restored a paying mm_ctrl subscriber the webhooks had missed.
- **Subscriptions tab** (control-center PR #177): full active-subscriber roster with signup dates, product/plan/MRR, attribution, and Stripe-verified badges; summary strip. Read-only per the watch lock. En route: fixed a mobile flexbox min-size bug (overflow-hidden flex items need flex-shrink-0); same latent bug flagged in three older customer panels.
- **Nova**: 15 pre-existing silent defects fixed across P1-P3 (identity-prepend never attached; post-LLM nodes reading wiped fields); Visibility Sweeper resurrected from dead Perplexity/Anthropic credentials (root causes recorded in fleet-ops: API-created vendor-typed credentials do not inject on httpRequest nodes, use generic httpHeaderAuth; and a bound credential is inert unless the node declares authentication=genericCredentialType); the product-data research chain is live as an independent parallel chain.

### 2026-07-07 - Acquisition OS Phases 1-3 shipped: CTRL capture lane public, engine live, distribution surfaces up

- **CTRL B2C lane (Phase 1), public and L1-proven:** `/download` capture page live on ctrl.themindmaker.ai (mm-ctrl PR #333 + `VITE_FF_CAPTURE=true`); `capture-lead` edge function on CTRL's Supabase forwards to the new Acquisition workflows (Capture Intake, Nurture Scheduler daily 14:00 UTC, Unsubscribe); `acquisition_sends` L1 ledger + `acquisition_capture_to_paid` view + `acquisition_utm_conventions` config; Leo's Friday Pulse gained the funnel section. Full cycle verified with real email on the verified `themindmaker.ai` Resend domain before launch. Fixes en route: `leads_source_type_check` gained `capture`; `venture_registry` gained the missing `mm_ctrl` lane row (leads FK had blocked captures).
- **Phase 2:** Full Time podcast RSS + `/episode/$id` share pages live (full-time PR #4 + manual CLI deploy; that Vercel project is NOT GitHub-linked, fix proposed); `episodes.audio_bytes` backfilled 8/8 real. Pulse demand test spec'd; warm-intro shortlist (top 20 of 3,982 connections) screened from Krish's LinkedIn export.
- **Phase 3:** Legibility `llms.txt` truth-corrected + MCP manifest live (legibility PR #27); Nova P4 product-data pitch lane (Mon 15:00 UTC, Gmail drafts only, additive-verified 80→100 nodes) + `visibility_targets.pitch_type`/`product_slug`; autonomy ladder columns on `venture_registry` + Vera weekly demotion check live.
- **Found during the work, queued:** Nova P1-P3 pre-existing silent defects (identity-prepend field mismatch; post-LLM dead context) and the Sweeper product-research chain rebuild (first design correctly refused: converging branches into shared once-per-all-items Code nodes silently drops rows).

### 2026-07-06 - product retirement (Gutted/Merciless/OnAlert) + Legibility/Full Time onboard + Acquisition OS v1.1

Krish directive: permanently retire Gutted, Merciless, and OnAlert from the OS control plane and replace them with Legibility and Full Time, as part of standing up the Acquisition OS (§11.5).

- **Retired everywhere the OS acts:** 6 workflows deactivated (Stripe + Feedback per product); 8 more active workflows patched to drop the trio as live products (Maya Revenue Engine + Acquisition Sweeper, Marcus Synthesis, Fleet Attribution Health probe, Competitor Scan, Priya Daily + Weekly, Proposal→GitHub Issue router); all 14 `agents.brief_content` rows cleaned (product-truth URLs, enums, sample prose); `system_config.fleet_skill_workflow_map_v1` purged of the 6 workflow ids; `ventures.onalert` → `archived`; 13 stale `priya-health-alert` tasks superseded; 3 `product_truth` rows deleted. Historical data (customers, workflow_runs, attribution events) preserved. The apps stay deployed until Krish manually sunsets Stripe accounts, Vercel projects, and domains.
- **Onboarded:** `venture_registry` gained `legibility` + `full_time` (and `fractionl` split into `fractionl_pulse` + `fractionl_circle`, Circle parked); Priya's Daily Health Scan now probes legibility (`legibility.io`) and full-time (`full-time-alpha.vercel.app`), live-verified writing 6 `product_health` rows; `customer_product` enum gained `legibility` + `full_time`. Neither app has a product-truth endpoint, customer sweep, or live Stripe webhook yet; explicit TODOs sit in the patched workflows instead of invented endpoints.
- **Control Center:** bare `fractionl` venture slug renamed to `fractionl_pulse` across 8 UI/API files (this PR).
- Same day, earlier: the mm-ctrl Stripe webhook 500s were fixed (workflow_runs `agent_id` drift + responseMode) along with 3 fleet-wide silent bugs, including the missing `customers (product, stripe_customer_id)` unique index that had broken every revenue upsert since May.

### 2026-07-01 (later) - full OS audit: SEV-0 credential leak, monitoring rebuilt, API-usage tracking, RLS hardening

A 16-agent adversarial audit of every OS surface found the surface-green was partly false. Fixes landed the same day (docs §3.4.1–3.4.3):

- **SEV-0 - leaked `service_role` key.** The production OS-DB `service_role` JWT was committed in the **public** `krishanraja/control-center` repo (7 workflow JSONs + git history) and inlined across 56 workflows. Contained: repo made **private**; all 217 Supabase-calling n8n http nodes migrated off the inline key onto ONE `supabaseApi` credential (`mncHyFryG0WxyDM1`, true service_role) → 26+ workflows fully de-keyed and **rotation is now a single credential update**. Root-caused a related outage: the old "Supabase Service Role" credential was mislabeled **anon**, so PR #168's SECURITY-DEFINER lockdown broke `audit_*` RPCs for n8n until the re-point. **Held for a coordinated window:** the key rotation itself + 47 Code nodes that still hardcode the key (see rotation runbook).
- **Monitoring was dark.** The `*/5` Critical Infra Monitor reported "all healthy" unconditionally - `system_health` was 44 days stale (its only writer had no cron + hardcoded `n8n=healthy`). Rebuilt with a VPS `write-system-health.py` (`*/15`, live probes) + a freshness guard in `audit_critical_infra()` (stale data now pages instead of lying).
- **API-usage tracking built.** ~25 non-LLM paid APIs had zero usage/quota/spend visibility. New `api_call_log` + `api_usage_state` (28 APIs) + `api-balance-poller.py` (nightly) + `api-usage-alerter.py` (hourly, thresholds + poll-staleness guard) → ops Telegram.
- **Alert delivery repaired.** `api-credit-monitor.sh` (wrong `jq` token path + silent hard-FAIL branches) and `vera-nightly` (rotated hardcoded token) now page correctly.
- **RLS hardened (verified vs frontend):** anon `UPDATE audit_log` tamper policy dropped; `opportunities` made service-role-only; mis-scoped `role=public` ALL policies on `business_metrics`/`marcus_synthesis`/`zara_signals` reduced to anon-read-only.
- **Also:** dropped a duplicate `workflow_runs` index; added logrotate; fixed the Drive-sync false-green (`render-identity` no longer stamps the shared checksum; `sync-to-drive` now surfaces `gog` stderr). **Follow-ups:** recreate 28 deleted agent Drive Docs; Maya Customer-Acquisition Sweeper (5 empty per-venture creds); Hunter Job Sweep node-order bug.

### 2026-07-01 - n8n full reconciliation: billing-cycle un-throttle, broken-workflow fix/disable, execution-budget governance, doc drift corrected

Post-billing-reset pass on `krishraja10101.app.n8n.cloud`. **The plan cap is 10,000/mo, not 2,500** (the 2026-06-19 entry below is wrong): June accumulated ~10,928 executions by June 23, then returned 100% `"Execution limit reached"` rejections June 24–30 until the July 1 reset - a 2,500 cap would have been hit by June 8. See §3.4.1.

- **Doc drift corrected.** Live instance is **100 workflows / 90 active**, not the "~81 / ~76" the doc claimed (undercount of ~19). Folded in the entire missing **`Krish |`** inbox/objective group (6), `Mindmaker OS | RE Dossier Engine`, `Fleet | Attribution`, 4 extra Cleo + 3 extra Nell workflows; removed the phantom "Deep Enrich Retry Sweep" (no live workflow) and the double-counted Cleo "Capture Idea Webhook". Rebuilt the §3.4 table (sums to exactly 90).
- **Broken workflows disabled** (100% error post-reset; reclaims ~1,800/mo): `Maya | Churn → Exit Interview` (`Wi360t9fBPjlo0t1`, every 30m - literal `{{ }}` sent to Supabase because the URL field wasn't an expression, + `$credentials` in a Code node) and `Sonnet | Task Lever Rater` (`9nEfCXvTHJQ3OFqQ`, every 2h - `$credentials` in a Code node). Fix-specs retained; both are cleanly repairable in the UI (move the credentialed HTTP out of the Code nodes; prefix the URL with `=`).
- **Schedules restored (budget-aware).** `System | Audience Pipeline` sync 3h → **15m** (node renamed "Sync every 15m"); `Nova | Visibility Sweeper` retry sub-trigger 12h → **6h** (weekly Mon 11:00 sweep unchanged). `Critical Infrastructure Monitor` **retired** from n8n (its 5-min coverage now runs off-budget on the VPS). Net steady state **~7,411 scheduled execs/mo** (~99% cron), under the 8k target and 10k cap.
- **Execution-budget governance deployed (§3.4.1).** External VPS governor (`n8n-exec-governor.py`, hourly, off n8n's budget) warns at 7k / trips at 8k by deactivating non-critical workflows - live in the root crontab, cumulative counter seeded (95 execs cycle-to-date, projected ~6.9k/mo). Plus a `*/5` VPS port of the zero-AI Critical Infra Monitor (the "permanent fix") - live and verified healthy. The n8n monitor is kept active as a redundant 3h backup (retirement is a one-toggle follow-up; an automated guardrail blocked auto-retiring it).
- **Coverage risks fixed:** re-enabled `Kai | Dependency Mapper + Credential Health` (`fBgBwoAg0YdkabtU`, on probation - no prior execution history, watch its first 4h run); set `Zara | Content Pipeline` (`DQVPdupeKAhocqdP`) schedule to explicit **daily 08:00** (was an interval-less `{triggerAtHour:8}`).

### 2026-06-18 - All-tabs consistency rebuild: secondary tabs (Today / Intel / Org / Subscriptions) join the shared spine (LIVE)

Closed out the all-tabs rebuild by porting the four secondary tabs that still leaned on the legacy `NextActionStrip` over to the shared `DoThisNextHero` (`docs/plans/all-tabs-rebuild/STATE.md` ledger updated; `NextActionStrip.tsx` deleted; `grep NextActionStrip src/` is clean). Every operational tab now renders through one hero with one grammar:
- **Today** - `src/components/today/NextTaskHero.tsx`. Most-overdue task wins (amber "Start with X · Nd overdue"), then due-today (sky), then first waiting (violet "Unblock X"), then "Inbox zero" (clear). Action selects the task in the SplitPane.
- **Intel (desktop)** - `src/components/intel/NextIntelDesktopHero.tsx`. Hot Zara signal (score ≥ 8, status received) → **"Promote to bet"** now does the real promote (POST `/api/bets` + flip `zara_signals.status='actioned'`). Previously this button only scrolled + outlined the row - a P-3 violation ("every click goes where the click promises"). When nothing's hot, the hero stays calm ("N signals tracked - nothing scoring 8+ yet").
- **Intel (mobile)** - `src/components/intel/NextIntelMobileHero.tsx`. Ranks `home_intelligence.external_signals` by urgency × days_until, surfaces "Open {signal} · URGENCY · Nd"; the underlying `DetailSheet` carries Create-task / Add-to-bets.
- **Org (Desktop + Mobile)** - `src/components/org/NextOrgHero.tsx`. Vera's pending corrections → "Review Vera's edit for {agent} · {N} downvotes · {pattern}". Desktop scrolls + outlines the correction row; mobile hands off to the desktop route by hash so the approve/reject UI is one tap away. Calm when the roster is tight.
- **Subscriptions (Desktop + Mobile)**: `src/components/customers/SubscriptionsWatchHero.tsx`. Read-only watch by design (Krish 2026-06-17 outcome lock). Maya's expansion plays → "Reach out to {name} · ${mrr}/mo" (emerald); otherwise calm "Watching the revenue · $X/mo MRR · N paid · no expansion plays waiting" (no button, `clear` tone). Since 2026-07-07 (PR #177) the surface also renders `SubscribersList`: every `kind='paid'` customer newest-first with name/email, product chip, plan, MRR, signed-up date (absolute + relative), attribution channel, and a Stripe-verified badge on reconciled rows; summary strip carries active MRR, count, newest subscriber, per-product chips. Still read-only.

Verified: `tsc --noEmit` clean, `vite build` green (1838 modules), no `NextActionStrip` references left in `src/`. Home keeps its existing Focus Ritual spine (AltitudeSpine + BoardDaily + DecisionsInbox) - intentionally not a single hero. Flows still has no next-action hero; needs Krish's outcome lock before building (open in `docs/plans/all-tabs-rebuild/STATE.md`).

### 2026-06-17 - All-tabs consistency rebuild: shared "Do this next" hero + test-data hygiene across Pipeline / Network / Visibility / Subscriptions (LIVE)

Extended the Content-tab principles to the four priority decision tabs, with consistency made structural (one shared component, not per-tab clones). Krish's stated outcomes drove each (`docs/plans/all-tabs-rebuild/CHARTER.md`). All merged to main, prod-verified both viewports:
- **Shared `src/components/shared/DoThisNextHero.tsx`** - the ONE hero every tab renders through (kind/headline/sub/action/tone). Content's `NextBestActionHero` refactored onto it; Pipeline/Network/Visibility feed it tab-specific selectors. Consistent grammar, tones (emerald=approve, violet=act, sky=schedule/enrich, amber=time-sensitive), 44px targets.
- **`src/lib/recordHygiene.ts`** (`isTestRecord`) - hides test/demo rows (`test-*`, timestamped ids, demo domains, `laurenkthermos`) from every live view (Pipeline, Network, Visibility, Subscriptions). View-only filter; data stays in the DB. Effect: Pipeline 30→5 active, Subscriptions dropped its test-only Gutted card, Network test rows gone.
- **Pipeline** (outcome: contact fast): `NextLeadHero` does a real action - Draft email → Enrich → Promote → Follow up → clear. The ~10-button `LeadCard` collapsed to one state-correct primary + "More" overflow + quiet Drop.
- **Network** (outcome: predictive score + venture segmentation + immediate action): `src/lib/networkScore.ts` `predictiveScore(contact, venture)` 0-100 = heat × venture-fit × tier × reachability, recency-decayed, scoped to the active venture filter. `NextNetworkHero` surfaces the top contact ("Reach out to X - 96/100 · heat 92 · fit 90 · warm"). The 1,000-contact unbounded grid (6,776 DOM nodes) is now ranked + **bounded** (HAND_CAP 12 / REVIEW_CAP 24; overflow → 1-by-1 deck) - verified 6,776→~205 nodes.
- **Visibility** (outcome: one engine, inbound+outbound): `NextVisibilityHero` spans both - Confirm a replied guest → Apply to a CFP closing soon → Pitch an enriched guest → Apply to a queued stage.
- **Subscriptions** (outcome: read-only watch): test-data filtered in `useCustomers` so MRR / counts / Recent are honest; kept read-only (no pushed action), honest empties intact.

Plan + design harness: `docs/plans/all-tabs-rebuild/`. Secondary tabs (Home/Today/Org/Intel/Flows) not yet done. Commits b3b6df7 → 406f8e0.

### 2026-06-17 - Content tab honesty rebuild: one state machine, develop-not-relabel, "Do this next" hero (LIVE)

Fixed the Content tab's core problem (Krish: "duplicated UI where buttons do nothing and the counts don't add up, and I can't just pick up a card and develop it"). Root cause, code-confirmed: the tab carried **four copies of one content state machine** (`DesktopContent` lanes, `triageConfig.buildContentTriageConfig` deck, `decisionActions` idea rail, `useContentTriage`) whose "advance" actions only **relabeled** a card's `state` without developing it - producing empty `review`/`drafting` cards, dead-end buttons, and a fabricated "Sent to Zara for research" toast (no Zara call ever existed). Shipped, all unconditional (not flag-gated), merged to main, prod-verified both viewports:
- **Single source of truth** in `src/lib/contentEngine.ts`: `STATE_ORDER`, `ADVANCE_NEXT`, `STATE_PRIORITY`, `GATE_STATES`, `isActiveIdea`, `hasRealBody`, `advanceMode` (`relabel`/`develop`/`open`), `canEnterState`, `contentBuckets`, and `nextBestAction`. `useContentTriage` + `triageConfig` now import it - no copies.
- **Advance = develop, not relabel:** `researching`/`drafting` RIGHT opens the Composer to write a real draft; only `seeded→researching` stays a pure relabel. The decision rail's relabel buttons became **"Open & develop"**; ready `review` cards lead with **Approve**.
- **Server honest-state guard** (`api/content-ideas.ts` PATCH): a card cannot enter `review`/`approved` without a real body (≥200 chars or a live `cleo_chat`) → **409 `state_guard`**. Verified on prod. Zombie review/drafting cards can no longer be created. A one-off migration (`scripts/migrations/2026-06-17-content-hygiene.sql`) demoted 15 pre-existing empty-body zombies to `researching`.
- **One count, honest labels** (`contentBuckets`): the header reads "N in flight · M to approve" instead of contradictory per-surface numbers.
- **"Do this next" hero** (`src/components/content/NextBestActionHero.tsx` + `nextBestAction`): the single anti-confusion spine, on both desktop and mobile, surfacing the one highest-priority action (Approve → Schedule → Continue draft → Develop → seed → clear) with a one-tap state-correct button. Replaces the ambiguous `NextActionStrip`.
- **Composer flows finish→next:** a "Next →" button + Save Draft jump straight to the next-best card (no list round-trip); the "voice ok" pill no longer shows on a blank page; a "Cleo unsure" badge surfaces low-confidence classifications.
- **Em-dash-at-rest audit:** 0/309 stored bodies carried em/en dashes - `sanitizeVoice()` on write already keeps stored data clean; no backfill needed.

Full planning + design harness lives at `docs/plans/content-tab-rebuild/` (CORE_PROBLEM, PRINCIPLES with 22 principles incl. P-22 "anticipate the next action", NIRVANA jobs, PLAN, OBSERVATIONS, STATE). Deferred by design: the literal inline two-pane workbench (the full-screen Composer is the correct deep-work surface per the device-mode principle; the "Next →" flow delivers the finish→next outcome without the high-risk embed). Minor follow-up: the hero's `intent=schedule` is passed but the Composer does not yet special-case it (calendar click-to-schedule already exists). See §5.7.

### 2026-06-19: n8n execution budget right-sized ~~to stay under the 2,500/mo cap~~ [CAP FIGURE CORRECTED - real cap is 10,000/mo; see the 2026-07-01 entry and §3.4.1]

The n8n Cloud instance was projecting ~6,200 executions/month against a 2,500/month plan cap (a single 15-min poll, `Nell | Briefing Stuck-Generating Sweep`, was ~2,920/mo by itself). Because ~93% of executions are cron-triggered, the monthly total is deterministic, so the fix was to right-size the heaviest schedules, not the logic. Seven triggers were cut and republished (n8n saves edits as a draft until `publish_workflow` promotes them to the active version):

- `Nell | Briefing Stuck-Generating Sweep` (`sad7ffZPVEE469Gg`): every 15 min -> every 4h. It only catches rare hard crashes; normal failures already self-resolve to `ready` via the generator, so a high-frequency poll was waste.
- `System | Mindmaker OS | Audience Pipeline` (`7sYzU1FidUo2w1Lh`) sync tick: hourly -> every 3h (daily 07:30 reconcile unchanged).
- `System | Mindmaker OS | Critical Infrastructure Monitor` (`SXdHes0WwIovjPAB`): every 2h -> every 3h (the node name had long read '5m'; the live runtime was every 2h).
- `Mindmaker OS | RE Dossier Engine` (`aXvyxnTHAT1jjPet`): every 2h -> every 6h.
- `System | Mindmaker OS | Workflow Monitor` (`ceWoxAIadebfpxvh`): every 4h -> every 6h.
- `System | Mindmaker OS | Silent Success Detector` (`F6srw1yE9uH67q14`): every 4h -> every 8h.
- `Nova | Mindmaker OS | Visibility Sweeper` (`SIDlCqURzTVsVt70`) retry sub-trigger: every 6h -> every 12h (the weekly Mon 11:00 UTC sweep unchanged).

Projected steady state after the cuts: ~2,135 executions/month, under the cap with ~365 headroom. Monitoring cadence was kept healthy (Critical Infra still every 3h). Re-measure the 7-day actual to confirm. Open follow-up: make the generator (`4RfAKh6U5guCmTrc`) stamp `briefing_status='failed'` on its own error via an Error Workflow, so the Stuck-Generating poll can drop to a daily backstop or be retired.

### 2026-06-15 - Guest pre-enrichment triage (LIVE) + Speaker Briefing generator (built; blocked on an n8n Cloud runner crash; UI in unmerged PR #147)

Shipped a pre-enrichment triage layer on the guests pillar so a guest's worth is judged BEFORE any LLM/research spend (the "don't burn the fleet on hundreds of weak guests" guard). **LIVE on prod (durable):** `guests` gains `triage_score int` (0-100), `triage_reason text`, `triage_signals jsonb`, plus briefing scalars `briefing_status` (`none`/`generating`/`ready`/`failed`, CHECK-constrained), `briefing_doc_url`, `briefing_doc_id`, `briefing_requested_at`, `briefing_generated_at`. A deterministic `public.compute_guest_triage(public.guests)` function + `BEFORE INSERT/UPDATE` trigger `trg_guests_triage` auto-scores every guest at **$0** (no LLM) from data already on the row - title seniority parsed from one_liner/why_fit/notes, contact reachability (email/linkedin/personal), quality_score/fit_score, and source quality - so it is strictly cheaper than the Sonnet-derived `fit_score` and precedes that spend. Backfilled all 102 guests (12 strong / 41 maybe / 49 skip; 50 unreachable correctly sunk). Output location pinned: Drive folder "Speaker Briefings" (`1AQ84HCrPx_KVUky-TM-J7-RyvFWEauwg`) + `system_config.briefing_drive_folder_id` and `drive_folders.speaker_briefings`; a `completeness_contracts` row (`guest-speaker-briefing`) covers the workflow.

**BUILT but BLOCKED:** n8n `Nell | Mindmaker OS | Guest Speaker Briefing` (`4RfAKh6U5guCmTrc`, active) - webhook -> 3 research arms (Brave x2 + Perplexity sonar-pro) -> Sonnet 4.6 synthesis (the only LLM node) -> self-minting Google Doc via the Content Factory's proven markdown->HTML->Drive-multipart converter (NOT coupled to the live Factory, which is `responseMode:onReceived`, returns nothing, and ignores a supplied draft/folder override) -> stamp guest + Telegram. Plus `Nell | Briefing Stuck-Generating Sweep` (`sad7ffZPVEE469Gg`, active, 15-min). The AI output is verified excellent (full sourced briefing), but the **Gate-2 Code node deterministically crashes the n8n Cloud external task runner** on the full parsed briefing (`DefaultTaskRunnerDisconnectAnalyzer` / TaskBroker WS disconnect; not data-size-explained at a ~140KB working set; `retryOnFail` is on but a deterministic crash is not caught by retries). So it does NOT yet reliably produce a Doc - needs n8n-side investigation (runner logs / memory / `N8N_RUNNERS_*`).

**UNMERGED:** control-center PR #147 - `api/guests/[id]/briefing.ts` (idempotent generate trigger, 15-min guard, optimistic `generating` flip) + GuestCard triage chip (Strong/Maybe/Skip + reason), list sorted by `triage_score` desc, and the Generate/View/Retry button. Also fixes a LIVE bug: `api/guests/[id]/draft-email.ts` selected nonexistent columns (`role`/`company`/`why_relevant`) so every draft-email 404'd - repointed to `one_liner`/`why_fit`. Full spec: `guest-briefing-spec.md`.

### 2026-06-12 - Vera gap closure loop: audit findings now route to owned tasks (the "fire department")

Closed the structural gap Arlo's Execution Discipline report surfaced and live-verification confirmed: Vera's behavioural auditor had written 1,139 findings across 72 audits in 9 weeks, all with `status: null`, while only 2 (stale) `corrections` and 1 Vera-owned task ever existed - detection with no actuation ("a smoke detector with no fire department"). New `vera_gaps` ledger + `route_vera_gaps()` / `reconcile_vera_gaps()` / `vera_gap_owner()` RPCs + a 9th `decisions_waiting` branch (`vera_gap`) + a Friday-11:30-UTC VPS cron (`vera-gap-cycle.sh`, zero-AI-cost). The router dedupes the latest weekly audit's non-`errors` findings (errors are already healed by the §8.8 four-tier system) into owned, tracked tasks (`krish_reviewed=true` so they stay off Krish's Home panel until escalated), auto-closes resolved gaps, and escalates only gaps flagged across ≥2 weekly audits. First run routed 8 cadence-liveness gaps to Arlo; validated end-to-end (idempotent re-run, escalation branch fires at cycles_open>=2, no panel flood). Decisions locked: auto-create owned tasks; quality/behavioural scope (skip the error band). Caveat captured in §8.8.7: Vera currently emits only `cadence`/`errors` bands, so this routes workflow-liveness gaps today; `vera_gap_owner` already routes real quality bands to the name-prefix agent. Also fixed off the same report: the loz briefing, API-credit-monitor and breaking-news crons were on invalid or depleting models (kimi/deepseek-flash/`moonshot-v1-8k` primaries + dead dateless `anthropic/claude-haiku-4-5` fallbacks) - repaired to the allowlisted `anthropic/claude-haiku-4-5-20251001` with cross-provider fallbacks; the breaking-news monitor (built to catch exactly the missed-news incident) had been un-runnable because both its primary and only fallback were rejected by the gateway model allowlist. See §8.8.7.

### 2026-06-11 - Content tab rebuilt around a full-screen Cleo Composer (+ mobile review deck)
The Content Engine's inline card (`ContentEnginePanel` stacked inside `ContentIdeaCardActionable`, with `ResearchAndTransform`) was replaced by a full-screen **Composer** (`src/components/content/ContentComposer.tsx`): one piece per screen, draft canvas + a single-panel rail (Cleo chat · Refine · Materials · Research · Standards), opened by deep-linking `#/content?idea=<id>`. New capabilities: a **Materials** store (`meta.materials[]`, `/materials` route) that keeps the research corpus Krish used to lose, grounds every generation, and rides into the Doc; a **Cleo chat** writing partner (`/chat`, `meta.cleo_chat`); **Save Draft** (`/save-draft`) as the one end CTA that sanitizes + saves the body, attaches materials, fires the content factory (Google Doc + Telegram via @krish_approvals_bot), and moves the piece to `review` (renamed from Push-to-Cleo); **Refine → Adapt to lane** folding the duplicate Transform into tone+length+zoom presets; and `sanitizeVoice()` killing em dashes on every generate / refine / chat / save / capture path. Mobile became **review-first**: `MobileContent` is a "Ready for you" deck (only `review` / `approved` / urgent), and the Composer's `narrow` body is read-mode + one-tap magic + sticky Save Draft. Fixed a latent bug: the old card saved `body` via the anon client, which RLS blocks, so inline draft edits silently never persisted, all writes now route through the API. PRs #132 + #134, merged to main, prod-verified (real factory fire confirmed: Doc in Drive + Telegram alert). See §5.7 + §8.6.

### 2026-06-10 - Autonomous OS diagnostics live + first OS cleanliness pass

Arlo installed deterministic OS diagnostics (`scripts/os-autonomous-diagnostics.py`) with a 30-min VPS sentinel and a 6-hourly OpenClaw sentinel that escalates cross-system criticals as **Urgent Claude Code CLI Repair Alerts** rather than silently repairing (see §8.8.6). The first Claude Code CLI cleanliness pass then, against live state: (1) found the template-drift urgent alert was a **stale false positive** - it fired ~5 min before Arlo's own template remediation; a live full re-run shows zero template findings - and archived it to `resolved/`; (2) closed **8 stale active tasks** (3 Marcus-synthesis review pings, 2 superseded content drafts, 1 stale follow-up, plus the May-12 content FIX + MANDATE rows, now superseded by the live `Cleo | Mindmaker OS` content pipeline) → `superseded`; (3) committed the long-pending workspace restructure (purge of checked-in `node_modules`, the deprecated `active/*.json` flat-state files, and `cold/`+`recycling/` archives; no live file lost); (4) migrated the Fireflies + Loz-news-briefing cron-payload tokens to `credentials/*.env` (chmod 600) references (Krish to rotate both); (5) reconciled this doc across all copies - the control-center repo copy had drifted ~1 day and is now realigned - and normalized the canonical to LF.

### 2026-06-09 - Control Center UX tiers (PRs #121–125) + doc reconciled to live state
Control Center shipped a CEO-audit polish pass and four UX tiers. #121: killed the `∞d` date glyph, made `Esc` close sheets/overlays, added loading skeletons. #122: triage keeps the focused row in view on action + content-calendar empty state. #123: Home "waiting-on-you" composition chips + per-kind batch review. #124: content calendar click-to-schedule a draft. #125: Services "Draft email" opens the outreach sheet (angle / venture / tone). This architecture doc was also reconciled against live state: merged §4.11 (unified audience pipeline) and the content-corpus references that had diverged across the five byte-identical copies, de-historicized section headers, collapsed the scattered closure-architecture "Day 2–5" roadmap into a single §17.7, and retired the stale §22 audit-reconciliation section (its still-true facts already live in the body).

### 2026-06-09 - Content channel corpus added (`skills/content-corpus`)
New shared skill `/root/.openclaw/skills/content-corpus/SKILL.md`, the channel companion to `krish-voice`. Voice was the *how*; the corpus is the *what/who/how-good* per channel. Defines mandates, audience, register/gear, format, opening/closing moves, antagonist, source-artifact preference, commercial mechanic, and a per-channel uniqueness + kind/helpful check for the four content brands - **Techonomic** (investigate how the digital world gets paid for; interrogative essay, Gear A), **The Builder Economy** (the why beneath the why; inspiring podcast + IG, Gear B), **Signal & Noise** (no-BS devil's-advocate/what-if; dialogic audio, Gear B), **Mindmaker Live** (weekly Headlines/Resources/Perspectives, each with a why-it-matters so-what; teaching digest, Gear A) - plus the **lead + visibility outbound overlay** (strategic intent on top of `krish-voice` mechanics; Cleo Email Draft / Nell / Nova / Felix). Central to it is the **Five Standards gate** every piece must clear: undeniably unique (artifact > listening > research), well-researched (sourced or owned, never invented), thoughtful, kind (warm to people, sharp on ideas, never cruel), helpful (reader leaves with something usable). Linked from §6.3, §8.6, §11.3, §19. Content agents load it alongside `krish-voice` before composing.

### 2026-06-03 - Unified audience pipeline: all four Mindmaker properties → Control Center, paid-vs-free enforced
Closed the gap between the canonical "one audience list" design and live state. CTRL, the marketing site (five capture edge functions), Builder Economy, and Mindmaker Live (Substack CSV) now all write the app DB `audience_contacts` table. A cross-DB bridge carries that into this OS DB: `pull_audience_contacts()` (http extension + Vault-held app key) routes each contact through `sync_audience_contact()`, scheduled by the `audience-tick` edge function via n8n `System | Mindmaker OS | Audience Pipeline` (`7sYzU1FidUo2w1Lh`, sync 15 min / reconcile daily). Rule: **payment is the only switch, never both** - paid → `customers` (Subscriptions), free → `leads` with `source_type='audience'` collapsed by email; a `customers` trigger (`trg_enforce_audience_invariant`) moves people on payment and tags churned leads `status='churned'`; `reconcile_audience_invariant()` is the backstop. New schema: `leads.audience_sources/churned_at/audience_synced_at`, `churned` + `audience` added to the status/source checks, `customer_product` gains `mindmaker`/`mindmaker_live`. Control Center renders an Audience pill, source chips, Churned badge, and a Substack CSV dropzone. See §4.11. Capture edge functions shipped via `mm-ctrl#129`, `mindmaker#109/#110`; UI via `control-center#116`.

### **2026-06-02 - Engagement ledger + RE feedback + Podchaser visibility surfacing**

Five-part build addressing leads-feedback, S&N guest re-surfacing, Podchaser podcast discovery, and visibility-event targeting. Root cause across three of the four: no identity-keyed "already engaged" memory that generators consult.

- **Engagement-ledger spine.** Extended `concept_id` (+ index) to `guests` and `visibility_targets` (previously only on `leads`/`contacts`/`tasks`). Backfilled all rows via `compute_concept_slug`. Added a non-partial unique index on `visibility_targets(concept_id)` for idempotent upserts.
- **S&N "already-interviewed" memory.** Ingested 30 past guests from Podchaser episode history (show id 6164314) as `published`, plus 44 POSSIBLE-2026 contacts from Krish's schedule sheet as `recorded`/`dropped`. `guests` SN rows now 90 (86 engaged). This is the memory the scout dedups against.
- **Guest Scout dedup bug FIXED (`8DlMfyTYsbnQGYR2`).** `Supabase: Get Existing` was querying the dropped `nell_candidates` table → existing-set always empty → every candidate treated as new. Repointed to `guests` (all statuses) and rewrote `Dedup Candidates` to match on normalized name+email, source-agnostic.
- **Podchaser → Visibility.** Closed-Loop PR Engine (`hCbvRXoGWaqG1Znx`) found podcasts but never wrote them to `visibility_targets` - and searched with `sort: LATEST_EPISODE` which returns music/noise, not relevance. Fixed the search to default relevance; surfaced 10 exec-audience podcasts into `visibility_targets` (type=`podcast`). FOLLOW-UP: make the PR Engine write discovered podcasts to `visibility_targets` for approval before auto-pitching.
- **Visibility Sweeper retargeted (`SIDlCqURzTVsVt70`).** Perplexity + Anthropic prompts now gate on non-technical business-leader audiences and hard-exclude developer/ML/practitioner events. Purged 19 stale conferences; repopulated with 5 business-leader events.
- **RE feedback (Control Center PR #113, not yet merged).** The Relationship Engine "Leads" tab (`contacts`) shipped with no FeedbackButton (and a mobile control mis-pointed at `opportunities`). Added the `contacts` feedback surface + free-text reason; a 👎 now sets `triage_status='skipped'` (immediate suppression) while still feeding Vera. Added `contactTriage.isHandQueue()`: an already-engaged S&N contact only enters the warm queue if they score highly for a different venture.
- FOLLOW-UPS: Builder Economy episode history not yet ingested (not found on Podchaser - needs its RSS/feed); TOOLS.md has a copy-paste corruption (OpenAI/Instantly/Fireflies/Brandfetch wrongly list Podchaser's token-mint as their auth).

### **2026-06-02 (later) - Content tab: brand lanes + sourcing engine + Transform config**

The Content tab moves from one pillar-tagged stream to **four brand lanes** (destinations), each a publishing commitment. Pillars remain the orthogonal theme layer.

- **Lanes:** `signal_noise` (written, ~biweekly, AI×monetization in media/adtech/martech), `mindmaker` (2/wk: `roundup` slot + `field_learning` slot), `techonomic` (weekly investigative, Perplexity-led), `builder_economy_ig` (daily, upbeat "built with AI", Krish posts manually to @the_builder_economy). BE *podcast* stays in the guest pipeline; this lane is Instagram only.
- **Schema (live + migration):** `content_ideas.lane/lane_slot/cadence_due_at`; `content_cadence` ledger (5 rows, RLS); `recompute_content_cadence()` fn. Migrations in `scripts/migrations/2026-06-02-*.sql`. 81 ideas backfilled (38 mindmaker / 37 techonomic / 6 signal_noise).
- **UI (PR #114, merged):** lane toggle + per-lane CadenceBar (status dot, last-shipped, next-due, krish-voice gear) on desktop + mobile; client-side cadence so it works pre-cron.
- **Voice contracts:** `system_config.content_lane_*` (5 keys) hold per-lane research_prompt + draft_system, built on krish-voice (Gear A for S&N/MM-roundup/Techonomic; Gear B for MM-field/BE-IG; open-web-monetization posture, banned-words list).
- **Sourcing engine:** `Cleo | Content Lane Sourcing` (n8n rRAyEUs7NsY06hFy, daily) recomputes cadence, finds due lanes, runs Perplexity research → Sonnet draft (lane voice) → `content_ideas` draft with sources in `meta.research`. Publish stays manual (S&N→Wix, BE→IG, all approval-gated; nothing auto-publishes).
- **RE feedback (PR #113, merged):** feedback on the Relationship Engine "Leads" (contacts) surface + free-text reason + 👎→triage_status='skipped' + `isHandQueue()` warm-lead rule.
- **Also:** Podchaser→Visibility workflow (PIjxpuLXdDrRoBin) active; PR Engine + Podchaser search fixed (relevance sort); TOOLS.md auth corruption fixed.

> **Update 2026-06-02 (same day):** the "FOLLOW-UP (not built)" items above are now SHIPPED - `/api/content-ideas/:id/transform` (industrialized Transform, parent→child lane rows) and `/api/content-ideas/:id/dive-deeper` (scoped Perplexity), plus the `ResearchAndTransform` panel in the expanded card (PR #115, merged + deployed + endpoint-tested live). `PERPLEXITY_API_KEY` added to Vercel; `content_ideas.parent_idea_id` migrated. The full `docs/CONTENT_TAB_SPEC.md` is implemented. Residual: the lane-sourcing n8n workflow lacks a `workflow_runs` heartbeat and its first scheduled run is its first n8n-level test (logic validated out-of-band; writes drafts only).

### **2026-06-01 - LLM cost-runaway fix: Gemini-fallback storm killed, model routing hardened, daily spend alert added**

A ~$900 Gemini + ~$900 Anthropic bill spike was traced to one mechanism. The OpenClaw agent **fallback ladder** ran `... -> anthropic/claude-sonnet-4-6 -> ... -> google/gemini-3.1-pro-preview`, and the Anthropic API key stored in n8n was dead (401 "invalid x-api-key"). Failing Anthropic-tier calls therefore **cascaded down to Gemini 3.1 Pro**, and full agent-session crons loaded 67K-250K tokens of workspace context into Gemini on every run. Worst offender: the **`Arlo - Hourly Feedback Pickup`** cron (broken for weeks, 1,237 runs, ~$96 of Gemini, hunting a `pickup_feedback.py` that does not exist).

**Load-bearing billing fact:** the gateway's Anthropic auth is OAuth `token` (Claude **subscription**, flat fee), NOT the per-token API bill. Google uses an `api_key` (per-token). So interactive Agatha/Opus is on the subscription, and **Gemini was the real per-token leak.** Source-side logs (OpenClaw trajectories + `cron/runs/*.jsonl` + n8n executions) accounted for only ~$150 of the Gemini; the remainder was not in any tracked system, pointing to accumulation over a longer window or **third-party abuse of leaked keys** (every key had been pasted into chats; see Pending).

**Fixed (all live + verified):**

* Disabled the `Hourly Feedback Pickup` cron (`openclaw cron disable`).
* Rerouted **every** gateway fallback ladder Gemini -> DeepSeek (`deepseek-v4-flash`); removed all `google/*` fallbacks. Primary stays `deepseek-v4-pro`. (`agents.defaults.model.fallbacks` + per-agent `agents.list[*].model.fallbacks`.)
* n8n: deactivated `Sonnet | Task Lever Rater` (was wrongly bound to the `Apollo` credential and ran every 5 min), then rewrote it + `Nell | Lead Document Ingest` to **DeepSeek** (cred `DeepSeek account` = `UnCSUB5l0zz2BYa0`, type `deepSeekApi`; OpenAI-format body; parse `choices[0].message.content`); Task Lever Rater cadence 5min -> 2h.
* Fixed MT-003 violation: `Cleo | Synthesis Engine` Opus 4.7 -> Sonnet 4.6.
* Added a deterministic **daily spend alert**: `/root/.openclaw/workspace-ops/scripts/token-spend-alert.sh` (VPS crontab `0 14 * * *`) runs `openclaw gateway usage-cost`, posts a digest to Krish's Telegram, and prefixes a ⚠️ if the latest day exceeds $75. Zero LLM cost.

**Runbook - if LLM costs spike again (any tool reading this: do these in order):**

1. `openclaw gateway usage-cost` - authoritative OpenClaw spend by day (the daily Telegram alert surfaces this).
2. Rank cron spend: aggregate `/root/.openclaw/cron/runs/*.jsonl` (`action:finished` lines carry `model`/`provider`/`usage`) grouped by job. Catches broken crons that re-run forever for nothing.
3. n8n: `GET /api/v1/executions` -> find high-count or all-error workflows; pull one execution with `includeData=true` to see the failing node and whether an LLM node billed *before* the error (an error after a successful LLM call still costs money; a 401 before it does not).
4. Validate keys cheaply (0-token GET probes): `GET https://api.anthropic.com/v1/models` (x-api-key header) and `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`. A dead Anthropic key is the classic trigger for a Gemini-fallback storm.
5. Provider consoles are the only source for usage-by-key (Anthropic Console -> Usage; Google Cloud -> Generative Language API -> Metrics). If the pattern does not match OS jobs, suspect leaked-key abuse and rotate.

**New standing rules:**

* **CFG-COST-001 - No premium models in background fallback ladders.** Cron/agent fallbacks route to DeepSeek (`deepseek-v4-flash`), never `google/gemini-*-pro` or `claude-opus-*`. Premium models are opt-in per task, not a fallback default.
* **CFG-COST-002 - A dead/invalid primary key must be fixed, not absorbed.** If an Anthropic-tier credential 401s, repair the credential; never let the ladder silently soak the failure into Gemini/Opus.
* **CFG-COST-003 - Model tiering by job nature (extends MT-003):** writing/synthesis -> Sonnet; classification/extraction/scoring/admin -> DeepSeek (`deepseek-chat`) or Haiku; never Opus in n8n.
* **N8N-COST-004 - Prompt caching is for repeated calls only.** Do NOT add `cache_control` to once-per-run cron LLM nodes: with a 5-minute cache TTL and a single call per run it is a net cost *increase* (cache-write premium, zero reads). Caching belongs to the interactive gateway agents, where it is already on.

**Gotchas (for future edits to this OS):**

* openclaw.json changes need a clean restart via `sudo XDG_RUNTIME_DIR=/run/user/0 systemctl --user restart openclaw-gateway.service`. The `openclaw gateway restart` CLI does NOT see the systemd `--user` unit (`openclaw-gateway.service`) and is effectively a no-op; `config.reload.mode` is `off`.
* `agents.defaults.models` is the **curated model-picker catalog** (keys = `provider/model` IDs; allowed per-model keys are `alias`/`params`/`streaming`). A stray `cost` key makes the whole config schema-invalid and blocks the CLI; fix by stripping `cost`, NOT by deleting the block - deleting it makes the picker fall back to the full merged catalog (hundreds of models).
* n8n public API `PUT /workflows/{id}` rejects `settings` keys outside its allowlist (`availableInMCP`, `binaryMode` fail). Send only `{executionOrder, saveDataErrorExecution, saveDataSuccessExecution, saveExecutionProgress, saveManualExecutions, executionTimeout, errorWorkflow, timezone}`.


### 2026-05-30 (later) - Fleet attribution warehouse + six-app autonomous commerce wiring

All six builder products (Circle, Pulse, CTRL, Gutted, Merciless, OnAlert) are now live-emitting lifecycle + revenue events into one shared `attribution` warehouse on `gojpffsrxybbpbdzzrvs`, and the growth agents read the resulting funnel/revenue views + each app's product-truth surface. The OS now runs the six apps' attribution-driven sales + marketing autonomously. Full contract in **11.4**.

- **Switched on the 4 dormant apps:** CTRL/OnAlert/Pulse warehouse secrets set; Gutted/OnAlert/Pulse Vercel env + redeploy; Circle + Merciless were already live. Each verified end-to-end (test event → `attribution.events` → `funnel_by_campaign`, then cleaned up).
- **Warehouse robustness fix:** `ingest-attribution` now normalizes gutted's `attribution.events/1` envelope (`event_name`/`idempotency_key`/nested `utm`/`value_cents`) as well as the canonical shape - gutted's events had been silently rejected ("bad event"). Provenance committed to `control-center/warehouse/`.
- **Agents wired:** `brief_content` updated for Maya, Leo, Cleo, Nell, Nova, Felix, Hunter, Zara, Marcus. New standards **ATTR-001** (link tagging) + **PRODTRUTH-001** (fetch-don't-hardcode).
- **New OS objects:** `public.product_truth` cache (6 apps populated), `public.attribution_app_health` view, n8n `Fleet | Attribution & Product-Truth Health` monitor (daily, active).
- **Pending (Krish):** OnAlert Stripe events (needs the Stripe key); credential rotation; Circle/Merciless OAuth scopes; live single-card purchase tests.

### 2026-05-30 - Focus System: daily spine + weekly takeover + full focus mode (PR #102)

One coherent spine from objective to today (full architecture in 5.6). PR #102 also landed the objective layer (the former stacked PRs #97-101) to `main` as part of the same merge. The daily spine is live (`VITE_DAILY_FOCUS_ENABLED` is on); the weekly takeover and Full Focus Mode are merged but gated off (`VITE_WEEKLY_FOCUS_ENABLED`, `VITE_FOCUS_MODE_ENABLED`) pending dogfood.

- **Daily spine.** New `DailyDriver` + `ContextHeader` / `TrackStep` / `CloseStep` collapse five overlapping Home surfaces into one phase machine (context → commit → track + mapping banner → close). `useTaskParentObjectives` promoted to a shared hook. Brief reframed as the pre-commit frame; the Friday retro moved below the fold (retro-only `DailyBriefBanner`); new end-of-day reflection writes a `daily_reflection` feedback row and seeds tomorrow. No new tables; reuses the daily-focus APIs.
- **Weekly takeover.** New `weekly_focus` + `weekly_focus_milestones` tables (migration applied + verified live, RLS + realtime). New `useWeeklyFocus` hook (London-Monday week key, localStorage gating), `/api/weekly-focus/commit`, and `WeeklyFocusTakeover` (Monday-insist four-step wizard reusing `NominationTray` + `MilestoneCalibrator`, capped at 3). Committed milestones bias the daily picker via a `serves_milestone` read-join on `/api/daily-focus/suggestions`.
- **Full Focus Mode.** New `FocusLanes` + `useFocusMode` + `FocusModeToggle`, wired into Today / Services / Subscriptions / Visibility / Content / Bets (desktop + mobile): each tab regroups its list into the 3 daily-target lanes. Activates the dormant `useFocusFiltered`.
- **n8n.** Focus Calibrator (`zEA4wGECQdqBpDmO`) candidate pool extended to `content_ideas` + `guests` (pushed live + mirrored in `scripts/n8n/krish-focus-calibrator.workflow.json`) so those tabs' focus lanes populate.

**New tables:** `weekly_focus`, `weekly_focus_milestones`. **New routes:** `/api/weekly-focus/commit`. **New reason code:** `daily_reflection`. **New realtime channel:** `weekly-focus-rt-shared`. **New flags:** `VITE_WEEKLY_FOCUS_ENABLED`, `VITE_FOCUS_MODE_ENABLED` (both default off). **Workflow patch:** Focus Calibrator pool. **PRs superseded:** #99, #100, #101 (content merged via #102; left open, content is on main).

### 2026-05-26 (later) - Visibility classification + Builder Economy scouting fix (PRs #75 → #80)

Five PRs cleaning up two intertwined problems Krish flagged: press journalists were getting routed into `guests` as Signal & Noise podcast candidates instead of into `visibility_targets` as press relationships, and the entire Builder Economy guest pile was HN-username trash with no contact info. Plus a Visibility tab UX pass (inline Enrich + clickable source URL + disabled Apply on stub rows).

- **PR #75 - Audit (`docs/audits/2026-05-26-visibility-classification-audit.md`).** Schema reality check, quantified mess (20/20 builder_economy guests were HN handles with no email; 16/16 signal_noise guests were journalists; 4 visibility_targets stuck as migration stubs, 4 more enriched without URLs), workflow inspection, broken `/api/visibility-targets/[id]/enrich-deep` endpoint (selecting nonexistent `name` column) flagged.
- **PR #76 - Schema (`fix/visibility-schema-classification`).** Added `guests.target_type` (`podcast_guest` | `press_target` | `dual`) with CHECK constraint, default `'podcast_guest'`. Widened `visibility_targets.type` CHECK to include `'press_relationship'` and `'speaking'`. New `nell_rejected` table (RLS on, anon read + service write) for the new editorial-bar quality gate's silent skips. Backfilled `target_type='press_target'` on 13 guests matching the journalist heuristic.
- **PR #77 - Nell scout (`fix/nell-scout-routing-and-quality-gate`).** Live n8n workflow `8DlMfyTYsbnQGYR2` (Nell Guest Scout) patched in-place. Four nodes rewritten: scoring prompt now emits `target_type` + `skip_reason` + `contact_method`; parser buckets into qualified_guests / qualified_press / rejected; insert step does all three inserts via fetch; the broken `Store Qualified` node (which had been silently writing to the dropped `nell_candidates` table since 2026-05-22) was defanged. Editorial bar: HN-username skip, single-Show-HN-post skip, no-contact skip, per-show fit floors (6 builder_economy, 7 signal_noise). Live-tested against 10 fixtures: 4 of 5 journalists routed to press_target, both HN usernames correctly skipped, all 3 founder fixtures landed in guests with high fit. Companion v2 patch maps upstream source labels into the `guests_source_check` allowed vocabulary (`'nell_outbound'`) and preserves the original label in `raw_data.upstream_source`.
- **PR #78 - Visibility UX (`fix/visibility-card-inline-enrich-and-link`).** `VisibilityTargetCard` gains an inline `Enrich` button when the row looks like a stub (no `deep_enriched_at` or `why_relevant` starts with the migration text); `Apply` is replaced with `Enrich` on stubs so users can't file an application before Nova has produced context. Primary link button falls back to `source_url` when `event_url` and `cfp_url` are null, with label adapting per `type`. `VisibilityTargetType` widened to include `press_relationship` and `speaking`. Fixed `api/visibility-targets/[id]/enrich-deep.ts` selecting nonexistent `name` column → real `title` column. `tsc` + `vite build` clean.
- **PR #79 - Backfill + Nova URL persistence (`fix/backfill-visibility-migration-stubs`).** One-shot script `scripts/backfill-visibility-stubs.ts` walks migration-stub rows, runs targeted Brave queries, picks event-domain URLs, patches `source_url`+`event_url`. Companion patch to Nova Visibility Deep Enrich workflow (`kbHAHuxfzQLLlysG`): `Patch Target` body now writes `event_url`/`cfp_url`/`source_url`; Sonnet prompt wrapped with `URL_FIELDS_INSTRUCTION` requiring URLs to be grounded in Brave research (no hallucination). After both runs every visibility_targets row has a URL.
- **PR #80 - Triage existing pile (`fix/triage-existing-guest-mess`).** `scripts/triage-existing-guests.ts` moved 13 press_target guests into `visibility_targets` as `press_relationship` (with LinkedIn / personal / Twitter URL as `source_url`), then dropped them from guests. Dropped all 20 HN-sourced builder_economy guests. Discovered `guests_status_check` only allows `'scouted','enriched','pitched','responded','scheduled','confirmed','recorded','published','dropped'` (no `'skipped'` despite DATABASE.md implying it); script uses `'dropped'` as the drop-status.
- **Post-merge.** All 20 dropped builder_economy guests permanently deleted from Supabase per Krish's call. Curated seed of 12 verified AI builders (Karpathy, Howard, Chase, Masad, Srinivas, Kilpatrick, Troynikov, Tey, Patel, Chintala, Staniszewski, Rauch) classified through the new editorial-bar prompt and inserted as fresh `enriched` builder_economy guests - every one with verifiable LinkedIn/Twitter, fit_score 7–10. URL-less press_relationship rows backfilled with LinkedIn URLs via Brave.

**New columns/tables:** `guests.target_type`, `nell_rejected`. **Widened CHECK:** `visibility_targets.type` includes `press_relationship` + `speaking`. **Fixed endpoint:** `/api/visibility-targets/[id]/enrich-deep`. **Workflow patches:** Nell Guest Scout (`8DlMfyTYsbnQGYR2`), Nova Visibility Deep Enrich (`kbHAHuxfzQLLlysG`). **Audit:** `docs/audits/2026-05-26-visibility-classification-audit.md` + final report `docs/audits/2026-05-26-visibility-classification-fix-complete.md`.

### 2026-05-27 - Cleo content inspiration pipeline + Vera-dormancy finding

Two new Cleo workflows shipped from Web Claude brief (Mindmaker OS content inspiration pipeline), executed by Claude Code on local Windows machine via the Supabase Management API + n8n MCP. Migration source-of-truth: `supabase/migrations/20260527160000_content_inspiration_pipeline_001.sql` in `krishanraja/control-center`.

- **New workflow `Cleo | Mindmaker OS | Inspiration Sweep`** (`D4W5TF1sP9lE828c`, 35 nodes, daily 06:00 UTC) - reads Gmail label `AI Newsletters` (full bodies, not snippets), exports Drive inspiration folder contents, loads `content_pillars` + cleo brief + thresholds, Sonnet 4.6 extracts publish-ready seeds against pillar bar (anti_patterns + evidence_required), Perplexity sonar-pro adds contrarian + adjacent stories per survivor, inserts `content_ideas` with `source_type=inspiration_sweep`. Zero rows is a valid output. Gemini 2.5 Pro fallback on Anthropic error.
- **New workflow `Cleo | Mindmaker OS | Synthesis Engine`** (`ES32WlTsgnr63qO3`, 28 nodes, Wed + Sun 12:00 UTC) - reads 14d of content_ideas + zara_signals + inspiration folder, Opus 4.7 hypothesizes 0-3 non-obvious angles connecting 3+ threads. Six-rule hard filter: 3+ threads, non-obvious, falsifiable, pillar-linked, confidence>=0.85, 3+ named entities. Inserts as `source_type=synthesis_hypothesis`. Zero rows is valid.
- **Both workflows INACTIVE pending credential binding** in n8n UI (Gmail, Google Drive, Supabase account, Anthropic, Gemini, Perplexity API).
- **Old `Cleo | Mindmaker OS | Newsletter Sweep`** (`ZICpbmlXil11qMjs`) flagged for archive after 7 days of clean Inspiration Sweep runs. Was a triggerCount=0 sub-workflow with metadata-only Gmail reads (no bodies), name-only Drive reads (no contents), no pillar awareness, output went to Set node never to Supabase. Rename to `ZZ ARCHIVED | Cleo | Newsletter Sweep`.

**New table:** `content_pillars` (5 seeded - agentic_ops, open_web_econ, builder_economy, ai_decision_making, portfolio_operating). Each pillar carries `good_looks_like` jsonb, `anti_patterns` jsonb array, `evidence_required` jsonb array. Loaded at runtime by both workflows. RLS: anon SELECT, service_role ALL.
**New columns on `content_ideas`:** `pillar_id text REFERENCES content_pillars(id)`, `brand_fit_score int CHECK 1-10`, `meta jsonb DEFAULT empty`, `body text`, `concept_id text` (Day 2 closure scope, added now to minimize churn).
**CHECK expanded:** `content_ideas_source_type_check` now permits `inspiration_sweep` + `synthesis_hypothesis`.
**New system_config keys (11):** `cleo_inspiration_min_brand_fit`=6, `cleo_inspiration_gmail_label`=`AI Newsletters`, `cleo_inspiration_gmail_lookback_days`=7, `cleo_inspiration_drive_lookback_days`=14, `cleo_inspiration_max_emails_per_run`=20, `cleo_inspiration_max_docs_per_run`=15, `cleo_synthesis_min_confidence`=0.85, `cleo_synthesis_min_threads`=3, `cleo_synthesis_min_named_entities`=3, `cleo_synthesis_lookback_days`=14. Plus repaired `cleo_inspiration_folder_id`=`1FNztJOU82M8zb6IIbUAbvuI6Kr0pF5Hu` (was stale `1zspGabjdCcVTs037EsgnmPHTix9UOMsJ`).
**Control Center:** `ContentIdeaCardActionable` now renders pillar chip (color-coded), brand_fit chip, Synthesis chip, falsifiable_test line for synthesis cards, connected_threads chips, contrarian + adjacent_stories disclosure for inspiration-sweep cards. New hook `useContentPillars`. Type drift fixed on `ContentIdeaRow` (+ brand_fit_score, quality_score, pillar_id, meta). `LeadSourcePill` extended with two new source labels.
**Live bug fixed silently:** `content_ideas.body` column did not exist before this migration, despite `ContentIdeaCardActionable.saveBody()` writing to it and `Cleo Content Transform` expecting it. The ALTER ADD COLUMN restores the broken Save/Expand flow.

**CRITICAL FINDING - VERA LEARNING LOOP IS DORMANT.**

Empirical verification on 2026-05-27 by Claude Code (test feedback rows submitted via `/api/feedback`, verified in `feedback_queue`, then cleaned up):

- `Vera | Mindmaker OS | Feedback Aggregation` (`FZBDYXXfT1MBrAF6`) - zero rows in `workflow_runs` ever. Workflow is marked active but has never executed (or has never written a heartbeat - both equally broken from an observability standpoint).
- `Vera | Mindmaker OS | Behavioural Auditor` (`l0nujD2PBYGeEtXx`) - same. Zero runs ever.
- `feedback_queue` was completely empty for 90 days before the test. Total ever consumed by Vera = 0.
- Only 2 `corrections` rows exist in the last 90 days; both originated from `krish_correction_2026-05-12` (direct insert) and `realtime_session` (manual) - neither from the feedback loop. Both still pending approval.

Outcome O-4 ("same mistake doesn't survive four occurrences") is **not currently being met**. The self-improving promise of the OS exists in design but not in execution. Fix surface: investigate the Vera cron trigger and heartbeat node. Until Vera runs, content_ideas + visibility_targets quality cannot improve from Krish's thumbs-downs no matter how many rejections accumulate.

**Output quality snapshot** (informational, 2026-05-27):
- `visibility_targets` last 30d: 20 total, 17 (85%) are stubs (no deep_enriched_at / suggested_talk_title / audience_size). Deep Enrich Retry Sweep mentioned in section 13 is not draining the backlog.
- `content_ideas` last 60d: 5 total. None have pillar_id (predate migration). 3 of 5 missing source_url (CLO-006 violation). Two would auto-reject under the new pillar bar (anti-pattern framing: "AI's role in reshaping...", "rise of AI-driven decision-making..."). The new workflows target 0-4 high-bar ideas/week to replace this weak baseline.

### 2026-05-25 (later) - Closure Architecture Day 1 (Streams 1 + 2, both complete)

Two parallel streams, both landed the same day. Stream 1 (Supabase) ran on a local Claude Code session; Stream 2 (VPS workspace audit) ran on the VPS. Both reports live under `docs/audits/2026-05-25-closure-day1-stream{1,2}-*.md` in `krishanraja/control-center`. Companion Agatha-inbox note at `hot/agatha-inbox/2026-05-25-closure-day1-stream2.md` summarises the headline findings.

- **Stream 1 - concept-level closure foundation (PROCEED-WITH-NOTE).** Supabase migration: `tasks.concept_id text` + `leads.concept_id text` (both indexed); new tables `concept_decisions` (PK = concept_id) and `status_change_log` (bigserial PK + indexes); new functions `compute_concept_slug(text)`, `close_concept(text,text,text)`, `reopen_concept(text,text,text)`, and trigger function `log_status_change()`; AFTER UPDATE OF status triggers on tasks and leads. Backfill: 4 outreach concepts (Disney, Marketbridge, Vertex Inc., Alma Media Corp) tagged across both tables. Disney canary executed: lead `ready → closed_lost`, task already `superseded` (skip-list working), `concept_decisions` + `status_change_log` + `audit_log concept_closed` event all materialised. **Documented deviation:** runbook's `'dead'` for leads violates `leads_status_check`; Stream 1 substituted `'closed_lost'` (already in the constraint vocabulary). Day 2 housekeeping decides whether to ALTER the constraint or canonicalize. **Manual-trigger limitation:** the Marcus Daily Brief workflow uses the legacy `n8n-nodes-base.cron` trigger which is not executable via the public n8n API or MCP `execute_workflow`. Verified instead by direct `marcus_daily_pull()` call: zero Disney mentions across all arrays - next 06:30 cron will drop Disney from `top_three` by construction.
- **Stream 2 - workspace filesystem-staleness audit (read-only, complete).** Verified Stream 1's database changes via REST queries (concept_decisions row for Disney present, status_change_log captures the transition, Disney lead reads `closed_lost` with `concept_id='concept:org:disney'`, all four outreach concepts backfilled, `audit_log concept_closed` event emitted). Catalogued where every layer of the workspace references known-closed concepts: Layer 8 memory files, Layer 7 warm reports (with attention to the largest accumulators - `handoff-queue.json`, `stage-pipeline.json`, `visibility-pipeline.json`), Layer 5 templates, Layer 4 active action docs, Layer 9 hot files, Layer 1 core configs, Layer 10 agent SKILL.md renders. Inspected render scripts (`render-plan.py`, `render-identity.py`, `regenerate-standards-digest.py`) and confirmed none currently filter against `concept_decisions` (expected - table is brand new; Day 3 wiring task). Quantified workspace references to the three Day-2 batch-closure candidates (Marketbridge, Vertex Inc., Alma Media Corp) across all layers. No filesystem modifications; report + Agatha-inbox note only. Open question carried into Day 2: canonicalize on `closed_lost` versus ALTER the constraint to add `'dead'` - both streams recommend the former (lower blast radius, vocabulary already established).

**New tables:** `concept_decisions`, `status_change_log`. **New columns:** `tasks.concept_id`, `leads.concept_id`. **New RPCs:** `compute_concept_slug`, `close_concept`, `reopen_concept`, `log_status_change` (trigger function). **New audit_log event types:** `concept_closed`, `concept_reopened`. **New standards:** CLO-001, CLO-002, CLO-003 (closure rules). **At-risk batch for Day 2:** Marketbridge, Vertex Inc., Alma Media Corp.

### 2026-05-25 - Audit closure (PRs #67 → #70)

The "pedantic CEO audit" turned every visible-but-broken surface into a real, end-to-end-verified workflow. Closed in four PRs:

- **PR #67, Full transformation.** Supabase migration: `leads.enrichment_status` + `leads.deep_enriched_at` + email-draft tracking columns on leads/customers/guests + new `email_drafts` table + `mark_entity_emailed` RPC. 8 new `/api/*` proxy routes (lead/customer/guest draft-email, lead enrich, visibility-targets enrich-deep + apply, automations rerun). Frontend: viewport zoom fix, Toast safe-area, naming pass (Services/Subscriptions/Visibility), Disney "Unnamed" fix. **New N8N workflow `Cleo | Email Draft`** (Gmail OAuth drafts). **Cleo Content Transform activated** (previously dormant since 2026-05-23). Duplicate **Agatha Visibility Deep Enrich → ZZ ARCHIVED**.
- **PR #68, Deferred polish + Agatha pipeline patch.** Agatha Lead Deep Enrich now writes `enrichment_status='enriched'` on success (clears optimistic-pending). Mobile overflow menu on ContentIdeaCard secondary buttons. DecisionsWaitingPanel limit 4→12. Cmd+K/Cmd+I hint on DesktopHome. MobileOrg Edit brief. MobileIntel Create task + Add to bets on signal DetailSheet. Mobile + DesktopFlows Rerun button on workflow cards. MobileCustomers Log call + Mark for outreach.
- **PR #69, Rerun route fix.** `/api/automations/:id/rerun` rewritten - looks up the workflow's webhook trigger node and POSTs to its webhook URL; returns 422 with guidance for schedule-only workflows. (Previous implementation hit a non-existent N8N endpoint.)
- **PR #70, Audit closure.** N8N workflow snapshots committed under `n8n/workflows/*.json` for the five workflows central to the audit (Agatha Lead Deep Enrich, Cleo Content Transform, Nova Visibility Deep Enrich, Cleo Email Draft, archived Agatha Visibility duplicate). `n8n/workflows/README.md` with a per-workflow CHANGELOG (six bugs surfaced + fixed during the audit's verification round - Brave token rotation, Brave URL shape, Brave Accept header, Sonnet credential mis-wire, jsonBody shape, Parse Sonnet shape).

End-to-end live verification: 6 viewports × 11 tabs (0 errors), 11 API routes (correct codes), Cleo Transform on a real idea (200 + real LinkedIn variant), Lead Draft email UI click flow (real Gmail draft `r6827848582574950084`), Lead Deep Enrich (Sonnet wrote enrichment_status + scores back), Rerun route (202 webhook / 422 schedule).

### 2026-05-22 - 7-PR OS rebuild (#49 → #56) + visibility follow-ups (#58, #60)

The rebuild rewired the system around per-venture leads, a podcast guests pillar, four-tier self-healing, weekly Plan refresh, and a unified decisions surface.

- **PR #49** Tab registry, sidebar/nav parity, Open All routes, mobile logo, Capture Idea hardening.
- **PR #50** Zara fix - dropped Perplexity Error Passthrough; hardened Filter Valid Signals; rewrote Parse Perplexity; purged error rows.
- **PR #51** Cleo extraction + feedback foundation - Sonnet 4.6 rewrite; FeedbackButton across 5 surfaces; `/api/feedback`; Vera correction-loop scaffolding.
- **PR #52** Visibility + Guests pillar - new tables `visibility_targets` and `guests`; Nova Visibility Sweeper; Nell Guest Sheet Bulk Import; Nell Guest Confirmed Cascade.
- **PR #53** Leads multi-tag + venture-aware ICP - `venture_registry`, `leads.tags`, `leads.icp_scores`, `leads.primary_venture`.
- **PR #54** Four-tier self-healing - `completeness_contracts`, `silent_failures`, three audit RPCs; Silent Success Detector (4h), Critical Infrastructure Monitor (5m), Vera Failure Pattern Sweep (Sun 07:00 UTC); CriticalAlertBanner.
- **PR #55** Living `agent_plans` + unified `decisions_waiting` view; Agatha Weekly Plan Refresh (Mon 09:00 UTC); DecisionsWaitingPanel.
- **PR #56** Cross-cutting hardening + brief edits + deprecation drops (`nova_target_conferences`, `nell_candidates`).
- **PR #58** Visibility depth follow-ups - 12/12 visibility_targets enriched.
- **PR #60** Sweeper retry + Nell Guest Pitch Draft canonicalisation - 36/36 guests backfilled; decisions_waiting includes status='enriched' guests with pitch preview.

### Prior to rebuild (PRs #41 → #47, rolled out 2026-05-21)

- **PR #41** Leads pillar reshape; new `customers` table + enums; Agatha Lead Deep Enrich; Maya Customer Acquisition Sweeper; Stripe mm-ctrl Revenue Alert.
- **PR #42** Rollout fixes; `home_intelligence.customer_signals` jsonb.
- **PR #43** Money Machine - `customers` attribution columns; MrrTicker + CustomerSourcesPanel.
- **PR #44** Bet Board - `bets` table; 90-day hit-rate.
- **PR #45** Customer Compounding - `customer_contacts`; CustomerCouncilCard/ExpansionRadar; Maya Churn → Exit Interview Task.
- **PR #46** Marcus as COO - `home_intelligence.daily_brief / weekly_retro / monday_premortem`; `/api/ask-marcus`.
- **PR #47** Anti-busywork - `tasks.lever_score` + `est_hours_to_revenue`; KillListModal.

---

## 21. Update protocol

Edit this file when the architecture *genuinely* changes: new agent, new pillar, new SSOT table, retired component, new aspirational target, **new closure-architecture surface**. Do not edit it for transient incidents (use `audit_log` + an `agent_plans` blocker entry). Do not embed credentials. Do not paste in agent briefs (they belong in `agents.brief_content`). When in doubt, ask: "will this be true in a week?" If yes → here. If no → somewhere else.

**Anti-duplication rule.** This is the only OS architecture document. If you're tempted to write a sibling - "OS-2026-XX.md", "Mindmaker Architecture v2.txt", "complete-os-reference.md" - anywhere in the workspace, edit this file instead. Multiple architecture docs drift; one canonical file does not.

**Canonical mirror locations (the inventory).** This document is mirrored to the locations below. When you update one, update all of them. Krish refers agents to this doc at the start of any OS update, so this list is the single source of truth for "where does this doc live" - you do not need to be told the locations again.

1. **Repo (easiest to PR and review).** `krishanraja/control-center` → `docs/MINDMAKER_OS_ARCHITECTURE.md`. Locally on Krish's Windows machine: `C:\Users\krish\control-center\docs\MINDMAKER_OS_ARCHITECTURE.md`.
2. **VPS (what agents read on session wake).** `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md`. Per-agent workspaces (`workspace-cleo`, `workspace-ops`, ...) symlink to this canonical copy.
3. **`mindmaker-os` skill, Claude Code.** `C:\Users\krish\.claude\skills\mindmaker-os\SKILL.md` (YAML frontmatter + this body).
4. **`mindmaker-os` skill, Cursor.** `C:\Users\krish\.cursor\skills-cursor\mindmaker-os\SKILL.md` (same body as #3).
5. **`mindmaker-os` skill on the VPS.** `/root/.openclaw/skills/mindmaker-os/SKILL.md` (rendered/synced copy that skill-aware agents on the VPS load).
6. **Google Drive (human-readable mirror).** Infrastructure folder, file id `1F0srFZSS-Nvg2RlUG84zVSvuiN9o8zDc`. Updated **in place by id** by the VPS script `/root/.openclaw/workspace/scripts/sync-to-drive.py` (gog CLI), verified working 2026-07-07; run it after the surface-1-to-5 sync. (The Drive MCP remains create-only, so never try to update this file through MCP; manual drag-drop is only the fallback if the script's gog auth breaks.)

The document BODY (everything below the YAML frontmatter) must be byte-identical across locations 1 through 5. Location 6 (Drive) lags until Krish manually replaces it. The repo is for PR and review; the VPS is what agents actually read on wake; the two skill copies are what Claude Code and Cursor load; Drive is what humans share.

