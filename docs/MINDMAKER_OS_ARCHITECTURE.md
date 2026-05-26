# Mindmaker OS — Architecture Reference

> **Audience.** Every AI tool aligned to the Mindmaker OS — Claude Code agents on the VPS, Cursor / Claude Desktop sessions, the N8N runtime's LLM nodes, and the Control Center's `/api/ask-marcus` chat. Plus humans (Krish, contractors, future-you) who need to understand the system end to end.
>
> **Purpose.** This is the **central, aspirational source of truth** for how the OS is built, what its outcomes are, and how it works. Read it on session wake; align decisions against it; if anything you do contradicts it, you change either this doc or the action — never both silently.
>
> **Scope rule.** Document only what should still be true in a week. If a fact ages out faster than that — the day's task list, an in-flight migration, who's on-call — it belongs in `agent_plans`, `tasks`, or a memory file, not here.
>
> **Secrets rule.** This file contains NO credentials. Every key, token, webhook URL, and API endpoint lives in `TOOLS.md` (workspace root) and Supabase `system_config`. When something here says "fetch the X key", that means "look it up in TOOLS.md".
>
> **Canonical location.** `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md` on the VPS. Mirror in `docs/MINDMAKER_OS_ARCHITECTURE.md` in the `control-center` repo and in Google Drive folder `Infrastructure` (`1y4dncntB8WsKgLjTzC-YZ3KgWXyfwIt5`). Anything else describing "the OS" or "the architecture" anywhere in the workspace is stale and should be archived to `cold/`.
>
> **Last verified against live state.** 2026-05-26, after audit close (C+F batch shipped to main). Empirical reconciliation: 14/14 agents action.md fresh; 66 tables + 2 views (`decisions_waiting` now 6-branch with corrections; `standards_efficacy` view live); 75 active N8N workflows; RLS restored on `visibility_targets` + `guests`; Vera Feedback Aggregation auth-bug fixed (learning loop re-armed); Stripe heartbeats live across all 6 product workflows.

---

## 0. Mental model in five sentences

1. **Mindmaker OS is a fleet of AI agents that runs Krish Raja's business portfolio** — consulting (Mindmaker, Meliora, AdFixus), builder products (Fractionl, OnAlert, Gutted, Merciless, mm-ctrl), and content brands (Builder Economy, Signal & Noise, Techonomic) — so Krish spends his hours on decisions, not admin.
2. **Supabase is the single source of truth.** Every piece of state — agent identity, sprint plans, tasks, leads, guests, customers, bets, standards, audit log, completeness contracts, silent failures, email drafts — lives in one Postgres database (66 entries: 64 base tables + 2 views). Local JSON for state is banned.
3. **Agents come in two shapes.** *Claude Code agents* (7 — Agatha, Cleo, Arlo, plus four personal-life agents) run inside OpenClaw on a VPS with workspace files, Telegram bots, and full conversational capability. *N8N workflow agents* (~75 active workflows across 14 production roles (post-2026-05-26 audit)) run on cron or webhook, do one thing, and write the result back to Supabase.
4. **The Control Center (`controlcenter.krishraja.com`) is the single pane of glass.** It reads Supabase via Postgres Realtime; Krish's clicks (approve, reject, promote, deep enrich, schedule, kill, **draft email**) write back to Supabase and fire webhooks to the Orchestrator, which routes them to the right agent. The Home tab is anchored by a unified `decisions_waiting` view that surfaces every kind of thing currently waiting on Krish.
5. **The OS learns and self-heals.** Krish's rejections go to `feedback_queue`; Vera groups them into `corrections`; Agatha turns those into edits on `agents.brief_content` or `standards_registry`. The four-tier silent-failure system (completeness contracts → Silent Success Detector → Critical Infrastructure Monitor → Failure Pattern Sweep) catches workflows that fail without errors. **Same mistake doesn't survive four occurrences; same silent failure doesn't survive a week.**

If a section below contradicts this five-sentence model, the model is right and the section is stale. File an issue.

---

## 1. Outcomes — what the OS is for

The OS is judged by these outcomes, not by activity. Everything in this doc — every workflow, every table, every cron — exists to move one of these:

| # | Outcome | How we measure | Current vs target |
|---|---|---|---|
| **O-1** | Krish under 2 hrs/day on ops | Time logged + `decisions_waiting` count under 10 | Target: under 10. Live: tracked on Home as the unified panel badge. |
| **O-2** | $20K/month consulting revenue inside 60 days of audit close | Stripe Mindmaker + Meliora + AdFixus revenue, MTD | Tracked by MrrTicker + Leo Weekly Report. |
| **O-3** | One person running what traditionally takes 15-30 | Active workflows × success rate × outputs landed | 75 active workflows (verified via N8N API 2026-05-26). Vera scores fleet health weekly. |
| **O-4** | Same mistake doesn't survive four occurrences | `feedback_queue` → `corrections` → brief edit cycle time | Vera Feedback Aggregation runs Sun 06:00 UTC. |
| **O-5** | Same silent failure doesn't survive a week | `silent_failures` → `corrections` via Failure Pattern Sweep | Vera Failure Pattern Sweep runs Sun 07:00 UTC. |
| **O-6** | Zero content published without Krish approval | Standards PUB-001 / PUB-005; audit_log review | Enforced in workflow graph; `X-Agatha-Secret` gates the LinkedIn distribution endpoint. |
| **O-7** | Decision lag under 24h on enriched surfaces | `decisions_waiting.age_hours` p50 | Lead/guest/visibility targets surface enriched with rich previews so Krish answers in seconds. |

When a section of this doc describes a workflow, table, or surface, it should be possible to trace back to one of these outcomes in one sentence. If not, that section is suspect.

---

## 2. What's in the box

### 2.1 Infrastructure layer

| Component | Role | Where |
|---|---|---|
| VPS (Ubuntu 22.04) | Hosts OpenClaw, every workspace, system crontab, helper scripts | `/root/.openclaw/` |
| OpenClaw | Agent framework — sessions, cron, Telegram/Discord routing, gateway | `/root/.openclaw/openclaw.json` |
| Supabase | Postgres database (state SSOT), PostgREST API, edge functions, auth, realtime | Project `gojpffsrxybbpbdzzrvs` |
| N8N Cloud | ~81 workflows running on cron/webhook — orchestrator, agent jobs, integrations | `krishraja10101.app.n8n.cloud` |
| Vercel | Hosts Control Center (React + Vite + TS) + `/api/*` proxy functions | Project `control-center` |
| GitHub | Source for Control Center + checked-in N8N workflow snapshots + this doc | `krishanraja/control-center` |
| Google Workspace | Docs, Sheets, Drive, Gmail — output + collaboration + email drafts via OAuth | `krish@themindmaker.ai` |

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

- **Opus 4.7** — Agatha (chat) only. Never in N8N. Never another agent.
- **Sonnet 4.6** — default for any agent doing real work (drafting, synthesis, review, enrichment, plan refresh, email-draft composition).
- **Haiku 4.5** — heartbeats, classification, quick lookups, all N8N cron LLM calls *except* Vera and Sonnet-grade work (Lead Rater, Enrich, Guest Pitch Draft, Plan Refresh, Failure Pattern Sweep, Email Draft).
- **DeepSeek V4 Flash** — cheapest tier, used for lightweight monitoring crons.
- **GPT-4.1-nano** — currently used by `Nell | Lead Document Ingest` extraction step (a known cost optimisation; the legacy node name still says "Claude: Extract Leads").

### 2.3 External integrations (non-model)

| Service | Purpose |
|---|---|
| Stripe (6 accounts) | Payments for Mindmaker, Fractionl Circle, Fractionl Pulse, OnAlert, Gutted, Merciless, mm-ctrl |
| Apollo.io | Lead sourcing + ICP filtering + verified contacts |
| Instantly.ai | Cold email sequencing |
| Apify | Web scrapers (25 registered actors — see `apify_actor_registry`) |
| Brave Search | Web search — used by every research-leaning agent and `Agatha | Lead Deep Enrich` |
| Podchaser | Podcast discovery for guest booking |
| Perplexity, Exa, PhantomBuster, BuiltWith, NewsAPI, Tranco | Research helpers |
| Telegram | Per-agent bots (8 distinct accounts) for chat + push |
| Discord | Open group chat surface for Agatha |
| Gmail (OAuth) | **Email drafts** — every Draft email action across leads/customers/guests creates a draft in Krish's mailbox via the `Cleo | Email Draft` workflow. **Nothing auto-sends. Krish sends manually.** |

Full credential registry + auth patterns + endpoints: `TOOLS.md`. Credentials are also tracked in Supabase `system_config.credential_health` for expiry monitoring.

---

## 3. The agent fleet (the OS in motion)

### 3.1 Two shapes, one fleet

**Claude Code agents** live in OpenClaw, have a workspace, a Telegram bot, identity files, and conversational memory across sessions (via files). They are interactive — you message them, they message back, they take multi-turn instructions.

**N8N workflow agents** are one-shot scheduled or webhook-triggered jobs. They wake, fetch context, call an LLM (or not), write the result to Supabase + (often) Telegram + (sometimes) Drive, and die. No state between runs except what they wrote to the DB.

Some agents (Vera, Marcus, Cleo, Nova, Nell, Agatha) exist in *both* forms. Intentional split: the N8N side runs the routine pulse; the Claude Code side handles ad-hoc deeper work.

### 3.2 The 14 production agents

These are the agents the OS itself tracks via `agents.brief_content` (identity) and `agent_plans` (sprint plan). Personal-life agents (loz/steph/finno/maa) live only in OpenClaw config; they're outside the Mindmaker business and don't appear here.

#### Executive pod

| Agent | Role | Trigger | KPI focus |
|---|---|---|---|
| **Agatha** | Chief Operating Officer | chat (Telegram + Discord) | Decision throughput, blocked-on-Krish under 5 |
| **Marcus** | Business Development Intelligence + COO synthesis | scheduled (4×/day) | Synthesis quality, customer + market signal density |

#### Growth pod

| Agent | Role | Trigger | KPI focus |
|---|---|---|---|
| **Cleo** | Content Production & Voice (coordinator) | webhook only (Krish-triggered) | Posts approved/published per week; **email drafts** approved per week |
| **Felix** | Enterprise Sales Pipeline | scheduled (5×/day) | Active opportunities, advisory leads moved |
| **Hunter** | Job Sourcing | scheduled (Mon + Thu) | 9-10/10 roles matched to Krish's criteria |
| **Maya** | Customer Acquisition (Marketing / SEO) | scheduled (7×/day) | SEO striking-distance gains, customer sweep freshness |
| **Nell** | Outbound + Podcast Guest Booking | scheduled (3×/day) | Guests booked, replies, conversations |
| **Nova** | Visibility & Speaking | scheduled (2×/day + Mon weekly sweep) | Confirmed talks, PR placements |
| **Zara** | Signal Intelligence & Market Research | scheduled (5×/day) | Distinct fresh signals/day; warm paths to Felix/Nova |

#### Ops pod

| Agent | Role | Trigger | KPI focus |
|---|---|---|---|
| **Arlo** | Technical Ops & Infrastructure | scheduled | System uptime, sync lag, deploy health |
| **Kai** | Technical Architecture / Integrations | scheduled (6×/day) | Credential health, workflow health, dependency map currency |
| **Leo** | Chief Revenue Officer | scheduled (weekly) | Revenue MTD, runway clarity, 3-venture funnel maps |
| **Priya** | Product Strategy | scheduled (1×/day) | Per-product health score, weekly rollup |
| **Vera** | Chief of Staff & Quality | scheduled (2×/day + Fri deep + Sun feedback + Sun failure-pattern sweep) | Standards compliance, drift detection, audit closure |

The roster lives in three places that must agree: Supabase `agents` (authoritative), `docs/AGENTS.md` in this repo, and `api/agents/[name].ts:available_agents` (fallback list). If the table grows or shrinks, all three change in the same commit.

### 3.3 Personal-life Claude Code agents (not in Supabase `agents`)

| Agent | Workspace | Telegram bot | Purpose |
|---|---|---|---|
| Lozatron (`loz`) | `~/.openclaw/workspace-loz` | Loz Bot | Lauren's personal AI; daily news briefings; separate from Krish-side ops |
| Aria (`steph`) | `~/.openclaw/workspace-steph` | Steph Bot | Steph's thinking partner; sandboxed |
| Finno (`finno`) | `~/.openclaw/workspace-finno` | Finno Bot | Krish's personal therapy + financial reflection; strictly isolated from business |
| Devi (`maa`) | `~/.openclaw/workspace-maa` | Maa Bot | Family health coordinator for Krish's mother; group chat enabled |

**Hard rule.** `laurenkthermos@gmail.com` is Lauren's, not Krish's. NEVER use it for Drive/Docs/Gmail outside `loz` workspace.

### 3.4 N8N workflow inventory (~81 workflows, ~75 active)

Live counts as of 2026-05-25 via `GET /api/v1/workflows`. Grouped by name prefix:

| Prefix | Count | Role |
|---|---|---|
| **System** | 20 | Orchestrator, Control Center Live Sync, Morning Brief, Error Monitor, Workflow Monitor, Cost Advisor, Status Board API, Krish Approval Callback, Monthly All Hands, Apify Registry Keeper, Truth Reconciler, Silent Success Detector, Critical Infrastructure Monitor, Status Update Receiver, Product Proposal → GitHub Issue, Proposal Executor, Competitor Health Scan, Workflow Optimizer (inactive), Deep Enrich Retry Sweep, etc. |
| **Cleo** | 8 | Omnichannel Content Factory, Draft Post on Demand, LinkedIn Distribution, Log Content Performance, Newsletter Sweep, Content Idea Capture (Sonnet 4.6), Capture Idea Webhook, **Cleo | Email Draft (new)** — Gmail OAuth draft creation for leads/customers/guests |
| **Nell** | 8 | Guest Scout, Apollo Contact Enrichment, Draft Outbound Messages (LinkedIn DMs + Telegram), Lead Document Ingest (venture-aware, multi-tag), Guest Sheet Bulk Import, Guest Confirmed Cascade, Guest Pitch Draft (Sonnet 4.6, 36/36 backfilled) |
| **Agatha** | 8 | Content Angle Approval, Portfolio Pipeline Triage/Dispatch/Analytics, Product Proposal Review, State of Union Weekly, **Lead Deep Enrich (repaired 2026-05-25 — fixed credential bindings + URL shape bugs)**, Weekly Plan Refresh (Mon 09:00 UTC) |
| **Stripe** | 6 | Revenue alerts: Merciless, OnAlert, Gutted, Fractionl, mm-ctrl, Mindmaker OS Payment Alert |
| **Feedback** | 5 | Weekly per product (Fractionl Circle, Fractionl Pulse, Gutted, Merciless, OnAlert) |
| **Nova** | 4 | Closed-Loop PR Engine, Visibility Sweeper (Mon 11:00 UTC), enrich endpoints |
| **Marcus** | 4 | Synthesis + Home Intelligence, Daily Brief 06:30, Friday Retro 17:00, Monday Pre-mortem 08:00 |
| **Vera** | 3 | Behavioural Auditor, Feedback Aggregation (Sun 06:00 UTC), Failure Pattern Sweep (Sun 07:00 UTC) |
| **Maya** | 3 | Closed-Loop Revenue Engine, Customer Acquisition Sweeper, Churn → Exit Interview Task |
| **Zara** | 2 | Content Pipeline (Zara→Cleo→Maya), Layer 1 Signal Inbox (Drive watcher) |
| **Priya** | 2 | Daily Health Scan, Weekly Product Rollup |
| **Sonnet** | 1 | Task Lever Rater — rates active tasks 0-10 on `lever_score` so the OS can flag busywork |
| **Kai** | 1 | Dependency Mapper + Credential Health (every 4h) |
| **Leo** | 1 | Revenue Weekly Report (Friday) |
| **Hunter** | 1 | Job Sweep (Mon + Thu) |
| **Felix** | 1 | Opportunity Pipeline Tracker (Mon–Fri) |
| **ZZ ARCHIVED Agatha** | 1 | Duplicate Visibility Deep Enrich (archived during 2026-05-25 audit) — kept for history, inactive |
| **Other** | 2 | Misc/legacy |

A point-in-time snapshot of the five workflows most central to the audit is checked into the repo at `n8n/workflows/*.json`. See that folder's README for inventory + a per-workflow audit changelog. Canonical state still lives in the N8N runtime; the JSON files are for diff review, recovery, and historical record.

### 3.5 Telegram bot → agent binding

`openclaw.json → bindings[]` maps Telegram account IDs to Claude Code agents:

| Bot account | Bound agent | Bot purpose |
|---|---|---|
| `agatha`, `default` | `main` (Agatha) | Strategic chat (primary surface) |
| `ops` | `ops` (Arlo) | Infra escalations |
| `cleo` | `cleo` (Cleo) | Content drafts |
| `loz` | `loz` (Lozatron) | Lauren-only |
| `steph` | `steph` (Aria) | Steph-only |
| `finno` | `finno` (Finno) | Personal therapy |
| `maa` | `maa` (Devi) | Family-only |

---

## 4. Supabase — single source of truth (~65 tables/views)

Every piece of OS state lives in one of these tables. Categorised by change rate and role. Full schema in `docs/DATABASE.md`. RLS is enabled on every table.

### 4.1 Identity & rules (rare changes)

| Table | Purpose | Notes |
|---|---|---|
| `agents` (14 rows) | Per-agent identity + brief_content + KPIs | `brief_content` is the canonical operating manual — rendered to `skills/agent-{id}/SKILL.md` every 15 min |
| `agent_capabilities`, `api_registry`, `api_endpoints`, `apify_actor_registry` | What agents can do, what APIs exist, registered scrapers | |
| `standards_registry` (~167 rows) | Behavioural rules enforced fleet-wide (V-001, GIT-001, MT-003, PUB-001, …) | Rendered nightly to `hot/standards-digest.md` |
| `ventures` (8 active) | Portfolio metadata | See §11 |
| `venture_registry` (3 rows) | Active venture surfaces for multi-tag leads/guests (`mindmaker`, `signal_noise`, `builder_economy`) | Drives per-venture lanes in the Leads tab and the venture chip on LeadCard |
| `completeness_contracts` (6 seeds) | Per-workflow output contracts — Tier 1 of the self-healing system | Shape: `{workflow_id, expected_min_rows, expected_columns, freshness_window_hours}` |

### 4.2 Plans & work in flight (weekly to daily changes)

| Table | Purpose |
|---|---|
| `agent_plans` (14 rows) | One sprint plan per agent — `current_phase`, `objective`, `blockers`, `next_milestone`, `progress_pct`, `doc_link`, `last_rendered_at`. Refreshed weekly by `Agatha Weekly Plan Refresh` (Mon 09:00 UTC) via `refresh_agent_plans()` RPC + Sonnet 4.6 |
| `tasks` | The unit of action — `id`, `title`, `agent`, `status` (`waiting`/`active`/`in_progress`/`blocked`/`done`/`pending-agatha-review`/`pending-review`/`paused`/`superseded`), `workstream`, `created`, plus `lever_score` + `est_hours_to_revenue` (from PR #47) |
| `goals` | Strategic goals (per-quarter) |
| `workstreams`, `workstream_contexts` | Workstream definitions + rolling context |
| `opportunities`, `sequences`, `contacted_persons` | Deal pipeline + outbound sequences + CRM log |
| `leads` | Sales pipeline unit. Columns include `assignee_agent`, `fit_score`, `attainability_score`, `icp_score` (legacy), `icp_scores` (jsonb, per-venture), `tags` (text[]), `primary_venture` (FK → venture_registry), `tier`, `why_relevant`, `primary_tension`, `next_step`, `follow_up_at`, `promoted_task_id`, `deep_enriched_at`, **`enrichment_status`**, **`last_emailed_at`**, **`last_email_draft_id`**, **`last_email_draft_url`** (last four added in audit 2026-05-25) |
| `guests` | Podcast guests for Builder Economy + Signal & Noise. Columns: `podcast_target` (`builder-economy`/`signal-and-noise`), `status` (`new`/`enriched`/`confirmed`/`skipped`/`done`), `pitch_draft`, `suggested_angles` (jsonb), `scheduled_task_id`, `skipped_at`, `deep_enriched_at`, `cascade_fired_at`, **`last_outreach_at`** (audit 2026-05-25) |
| `visibility_targets` | Speaking + PR opportunities. Written by Nova Visibility Sweeper (Mon 11:00 UTC) + deep-enrich endpoint |
| `content_ideas` | Cleo's idea backlog — written by Capture Idea + Layer 1 Signal Inbox + Guest Confirmed Cascade |

### 4.3 Customers, revenue, bets

| Table | Purpose |
|---|---|
| `customers` | Cross-product customer ledger. `customer_kind` enum (`paid`/`free_signup`/`trial`/`waitlist`/`churned`), `customer_product` enum (6 products), `mrr_usd`, `stripe_customer_id`, dedupe indexes. Plus 4 attribution columns (`attribution_lead_id`, `attribution_task_id`, `attribution_channel`, `attribution_confidence`). Plus **`needs_outreach_at`**, **`last_emailed_at`**, **`last_email_draft_id`**, **`last_email_draft_url`** (audit 2026-05-25) |
| `customer_contacts` | One row per customer conversation. Mined by Marcus for `customer_voice` themes from the last 7 days. Drives the Customer Council card on the Customers tab |
| `bets` | Falsifiable business hypotheses — `title`, `hypothesis`, `time_box_days`, `est_mrr_impact_usd`, `status` (`live`/`won`/`lost`/`partial`), `learning`, `actual_mrr_impact_usd`. 90-day hit-rate computed in the Bets tab |
| `business_metrics` | Revenue MTD, pipeline value, content metrics |

### 4.4 Operational firehose (high write)

| Table | Purpose |
|---|---|
| `workflow_runs` | Every N8N workflow writes a heartbeat per execution — primary fleet-health signal |
| `audit_log` | Append-only audit trail of agent runs + Krish actions |
| `feedback_queue` | Krish's rejections + comments — fuel for the learning loop (consumed by Vera Feedback Aggregation Sun 06:00 UTC) |
| `corrections` | Patterns Vera extracts from `feedback_queue` (≥3 matches, confidence > 0.85) AND from `silent_failures` via Failure Pattern Sweep |
| `silent_failures` | Tier 1–4 of the self-healing system. Rows written by completeness gates + Silent Success Detector + Critical Infrastructure Monitor; resolved by humans or grouped into `corrections` by Vera |
| `learning_events` | Self-improvement loop events |
| `standards_efficacy` | How well each standard is being followed |
| `system_health` | Per-component infra signals |
| `home_intelligence` | The Control Center home feed — `summary`, `metrics`, `external_signals`, `customer_signals`, `customer_voice`, plus Marcus-COO surfaces (`daily_brief`, `weekly_retro`, `monday_premortem` + their `*_at` and `*_ack_at` timestamps). All structured fields are JSONB |
| **`email_drafts`** | **New in audit 2026-05-25.** One row per Gmail draft created via the Cleo Email Draft workflow. Columns: `id`, `entity_type` (`lead`/`customer`/`guest`), `entity_id`, `gmail_draft_id`, `gmail_draft_url`, `subject`, `body_html`, `recipient_email`, `intent`, `created_at`, `sent_at` (null until manually sent). Idempotency on `(entity_type, entity_id, intent)` within 24h. |

### 4.5 Agent-specific scratchpads

`marcus_synthesis`, `maya_budget_state`, `maya_competitive_changes`, `maya_reddit_accounts`, `maya_striking_distance`, `hunter_search_urls`, `hunter_seen_roles`, `kai_workflow_snapshots`, `vera_audit`, `zara_signals`, `product_health`, `competitor_health`.

(`nova_target_conferences` and `nell_candidates` were DROPPED in PR #56 after data migrated to `visibility_targets` and `guests`. References in any doc, brief, or workflow are stale.)

### 4.6 System & sync plumbing

`approvals`, `pending_flags`, `sync_queue`, `google_drive_sync`, `schema_migrations`, `system_improvements`, `system_config`, `crons`, `memory`, `plan_execution`, `skill_deliveries`, `workflow_proposals`, `credential_health`, `credential_expiry`, `fleet_drift_report`.

### 4.7 The `decisions_waiting` view

Postgres view defined in PR #55. Unions five source tables into a single uniform shape (`{kind, id, title, agent, age_hours, link, meta}`) so the Control Center Home tab can render one panel covering every kind of thing waiting on Krish:

| `kind` | Source | What it surfaces |
|---|---|---|
| `task` | `tasks` where status ∈ (`waiting`, `pending-agatha-review`, `pending-review`, `blocked`) | Decisions on individual tasks |
| `lead` | `leads` where `promoted_task_id IS NULL AND deep_enriched_at IS NOT NULL` | Enriched leads awaiting promote/reassign/draft-email |
| `guest` | `guests` where `status='enriched'` | Guests with pitch_draft + suggested_angles ready for Krish review |
| `visibility` | `visibility_targets` where `status='enriched'` | Speaking/PR targets ready for Krish review |
| `idea` | `content_ideas` where `status='pending'` | Captured ideas awaiting greenlight |

The `meta` JSONB carries the per-kind enrichment (pitch_draft preview, suggested_angles, tier, fit_score, etc.) so the panel renders rich previews without a join.

### 4.8 RPCs worth knowing

| RPC | Purpose |
|---|---|
| `refresh_agent_plans()` | Refreshes all 14 `agent_plans` rows. Called weekly by Agatha Weekly Plan Refresh |
| `audit_silent_failures()` | Used by Silent Success Detector (4h cron) to detect ok-but-empty runs |
| `audit_critical_infra()` | Used by Critical Infrastructure Monitor (5m cron) to detect credential/RLS failures |
| `audit_failure_patterns()` | Used by Vera Failure Pattern Sweep (Sun 07:00 UTC) to cluster silent_failures into corrections |
| **`mark_entity_emailed(entity_type, entity_id, draft_id, draft_url)`** | **New in audit 2026-05-25.** Idempotent helper called by the Cleo Email Draft workflow to stamp `last_emailed_at`, `last_email_draft_id`, `last_email_draft_url` on the relevant entity (lead/customer/guest) atomically |

### 4.9 RLS posture

Every table has RLS enabled. Pattern: `anon` reads (for Control Center dashboards) + `service_role` writes (for agents). N8N agents authenticate as `service_role` through the `Supabase account 2` credential. Adding a table without RLS will fail Vera's audit.

---

## 5. The Control Center — single pane of glass

- **URL.** `controlcenter.krishraja.com` (Vercel); repo `krishanraja/control-center`.
- **Stack.** React 18 + TypeScript + Vite + Tailwind + Supabase JS client.
- **Data layer.** Direct PostgREST reads with the anon key + Postgres Realtime subscriptions. Mutations that need service-role context go through `/api/*` Vercel functions.
- **Deploy.** Push to `main` → Vercel auto-deploys. **Never touch Vercel directly.**
- **Git author.** Every commit must be `Krish Raja <hello@krishraja.com>` (standard V-004 / GIT-001).
- **ESM constraint.** Because `package.json` declares `"type": "module"`, every relative import inside `api/*` must use the `.js` extension (e.g. `import { supabase } from './_supabase.js'`). Without it, Vercel returns a silent 500.

### 5.1 Tabs and their backing data

| Tab | What it shows | Tables / views read |
|---|---|---|
| **Home** | CriticalAlertBanner → DailyBriefBanner → MrrTicker → StreakPills → Marcus headline + Signals + Needs-you → **DecisionsWaitingPanel** (unified across tasks/leads/guests/visibility/ideas) → KillListModal | `home_intelligence`, `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas`, `customers`, `bets`, `silent_failures`, `decisions_waiting` |
| **Today** | Tasks marked active/in_progress/blocked, drift badges on stale rows | `tasks` |
| **Leads (Services)** | Per-venture lanes (mindmaker / signal_noise / builder_economy) with LeadCards: Promote / Reassign / Schedule follow-up / Deep enrich / **Draft email** | `leads`, `venture_registry` |
| **Guests (Visibility)** | GuestImportDropzone, GuestCard: Confirm / Skip / Deep enrich / Edit pitch / **Draft email** | `guests` |
| **Visibility (events)** | VisibilityTargetCard: deep-enrich + edit + approve/reject/snooze + past speakers + CFP details + effort + next actions checklist | `visibility_targets` |
| **Customers (Subscriptions)** | MrrTicker + CustomerSourcesPanel + CustomerCouncilCard + ExpansionRadar + per-product FeedCards + per-customer **Draft email** / Log call / Mark for outreach | `customers`, `customer_contacts`, `home_intelligence` |
| **Bets** | Bet Board: live bets with time-box fill bars, place-bet flow, 90-day hit-rate, MRR-impact panel | `bets` |
| **Plans** | Per-agent sprint state with phase/objective/blockers; rendered fresh weekly | `agent_plans` |
| **Org** | Agent grid; inline Identity editor (writes to `agents.brief_content` via sync); Flag; mobile Edit brief | `agents` |
| **Flows / Systems** | N8N workflow health, credential health, silent_failures by tier; **Rerun button per workflow card** | `workflow_runs`, `credential_health`, `kai_workflow_snapshots`, `silent_failures` |
| **Intel** | Marcus headline + AskMarcus chat (`/api/ask-marcus`) + Zara signals + deep-research outputs + Create task / Add to bets buttons on signals | `zara_signals`, `marcus_synthesis`, `home_intelligence`, `customers`, `leads`, `bets` |

### 5.2 `/api/*` proxy routes

Every action that needs service-role context OR fires an N8N webhook routes through a Vercel function in `api/`. Inventory as of audit close 2026-05-25:

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

(Bold rows added during the 2026-05-25 audit. Full implementation specs in `docs/API.md`.)

### 5.3 Mutation control flow (Krish acts → OS reacts)

1. **User action.** Krish clicks Approve / Reject / Promote / Confirm / Deep enrich / Draft email / Place bet / Rerun.
2. **Supabase mutation.** The UI updates the relevant row — directly via the JS client for simple updates, or through an `/api/*` Vercel function when service-role context is required.
3. **Webhook trigger.** Supabase `pg_net` (or the `/api/*` route directly) posts to the **Orchestrator** (N8N workflow `u0kIULJBJL4dGcuR`, path `/webhook/mindmaker-orchestrator`) — or to a workflow's own webhook for direct flows like email-draft.
4. **Routing.** The Orchestrator routes by event type to the right downstream workflow.
5. **Agent execution.** The workflow runs, calls the LLM tier appropriate to the job (Sonnet 4.6 for substance, Haiku 4.5 for classification), writes the result back to Supabase.
6. **Realtime echo.** The UI's subscription receives the change and the relevant component re-renders within a tick.

**Hard rule.** No content publishes without explicit Krish approval. The LinkedIn Distribution endpoint is guarded by `X-Agatha-Secret`; only the Krish Approval Callback workflow holds the header. The **email-draft path drafts only** — Gmail's Draft API is used; nothing auto-sends. Standards PUB-001 / PUB-005.

### 5.4 Realtime subscriptions

The dashboard subscribes to Postgres Realtime via `@supabase/supabase-js`. Hot subscriptions:

| Hook | Table / view | Channel |
|---|---|---|
| `useRealtimeTasks` | `tasks` | `tasks-rt-shared` (one channel, fanned out — see ADR-002) |
| `useRealtimeLeads` | `leads` | `leads-rt-shared` |
| `useRealtimeGuests` | `guests` | `guests-rt-shared` |
| `useVisibilityTargets` | `visibility_targets` | `visibility-rt-shared` |
| `useCustomers` | `customers` | `customers-rt-shared` |
| `useRealtimeDecisionsWaiting` | `decisions_waiting` | `decisions-rt-shared` |
| `useCriticalAlerts` | `silent_failures` filtered to tier 3 | `critical-alerts` |

**Hard rule.** One channel per table per browser session, fanned out via context/hooks. Opening a second channel for the same table is a performance bug. See ADR-002.

### 5.5 Sync infrastructure (Arlo's domain)

- `cc-sync-engine.sh` — every 5 min, refreshes `home_intelligence`, polls N8N for workflow status, flags stale tasks, writes audit trail.
- `cc-doc-creator.sh` — every 15 min, for any task with `description` but no `link_primary`, creates a Google Doc and writes the URL back.
- `cc-task-router.sh` — routes ad-hoc instructions from chat into `tasks`.
- `poll_sync_queue.py` — every 5 min, drains `sync_queue` (cross-system reconciliation).
- `Control Center Live Sync` (N8N) — auxiliary realtime layer.

---

## 6. Workspace architecture (Claude Code agents)

### 6.1 Standard layout

Every Claude Code agent workspace follows the same file convention. Loading order on session wake is described in §7.

```
workspace/
  MINDMAKER_OS_ARCHITECTURE.md   ← THIS FILE — canonical, single OS reference
  IDENTITY.md         — name, role, emoji, vibe
  USER.md             — who the agent serves and how
  ORG.md              — fleet-wide identity (every agent loads this)
  SOUL.md             — personality, voice, operating principles
  CLAUDE.md           — current operating contract (Session Startup Protocol; lives at /root/.openclaw/CLAUDE.md)
  TOOLS.md            — every API/credential/endpoint the OS uses
  MEMORY.md           — long-term curated memory; ONLY loaded in direct Krish chats
  HEARTBEAT.md        — periodic checklist for heartbeat polls
  memory/             — YYYY-MM-DD.md daily logs
  hot/                — runtime-managed: standards-digest.md, systems.md, agatha-inbox/
  warm/               — working docs: agent plans, reports, signal files
  active/             — live state: action docs (rendered from agent_plans), in-flight initiatives
  cold/               — archive
  reference/          — long-lived per-topic documentation
  scripts/            — automation (render-identity.py, regenerate-standards-digest.py, …)
  skills/             — workspace-local skills (per-agent SKILL.md is at /root/.openclaw/skills/agent-{id}/SKILL.md)
  supabase/           — DB helper scripts
  brand/              — brand assets
```

### 6.2 Agatha's workspace is the canonical one

`/root/.openclaw/workspace` is the *main* workspace. Agatha is COO and shares this filesystem with the system itself (cron scripts, render pipeline, the shared skills library). Other business-agent workspaces (`workspace-cleo`, `workspace-ops`, etc.) are slimmer — they symlink shared files (`AGENTS.md`, `TOOLS.md`, `USER.md`, `USER_REFERENCE.md`, `MINDMAKER_OS_ARCHITECTURE.md`, `AGENTS_REFERENCE.md`) from Agatha's workspace and have their own agent-specific files (`SOUL.md`, `IDENTITY.md`, `MEMORY.md`, `HEARTBEAT.md`). Personal-life agents (loz, steph, finno, maa) live outside the Mindmaker business and are not governed by this architecture.

### 6.3 Shared skills library

Path: `/root/.openclaw/skills/`, ~107 skills. Loaded by absolute path from any workspace.

| Skill | Purpose |
|---|---|
| `agent-{id}/SKILL.md` | Per-agent operating manual — rendered from `agents.brief_content` every 15 min. **Edit the DB, not the file.** |
| `krish-voice/SKILL.md` | Krish's writing voice — **mandatory before any outbound content or email draft** (rules V-001..V-007) |
| `brand/SKILL.md` | Mindmaker brand positioning |
| `google-docs-api/SKILL.md`, `google-sheets-api/SKILL.md`, `google-slides-api/SKILL.md` | Formatting standards for each surface |
| `knowledge-system/SKILL.md` | Where polished output lands in Drive |
| `n8n/SKILL.md` | 3,500+ lines of battle-tested N8N patterns — **mandatory before editing workflow JSON** |
| `supabase-edge/SKILL.md` | Edge function development standards |

---

## 7. The agent operating contract (CLAUDE.md)

Every Claude Code agent session follows the same wake protocol (`/root/.openclaw/CLAUDE.md`).

### 7.1 Session wake, step by step

**Step 0 — Identity resolution.** Determine `MY_AGENT_ID` from `$AGENT_ID` env or `.agent-id` in workspace root. **Hard fail** + Telegram-Krish if neither resolves.

**Step 1 — Load Identity (static).**
1. `IDENTITY.md`
2. `ORG.md`
3. `/root/.openclaw/skills/agent-${MY_AGENT_ID}/SKILL.md` (rendered from `agents.brief_content`)

Hard fail if SKILL.md missing → Telegram-Krish: "brief not rendered, run `render-identity.py`".

**Step 2 — Load Standards.**
4. `hot/standards-digest.md` (rendered nightly from `standards_registry`)

**Step 3 — Load Plan (dynamic).**
5. Supabase `agent_plans` row for `MY_AGENT_ID` (via `supabase-tools.py`)
6. `active/${MY_AGENT_ID}-action.md` (rendered from the agent's Action Doc)

**Graduated stale handling.** If `agent_plans.last_rendered_at > 72h`, enter READ-ONLY mode — reads/research OK, sends/commits/Supabase-writes blocked. Telegram-Krish: "off-sprint, plan render stale ({age})". The `Agatha Weekly Plan Refresh` workflow (Mon 09:00 UTC) keeps every plan inside the 72h window in normal operation.

**Step 4 — Memory.**
7. `MEMORY.md` — **only** in direct Krish chats. Never in shared contexts (Discord, group chats).

**Step 5 — Workstream detection.** `detect_workstream(MY_AGENT_ID, first_user_message)` → continue / ask / new.

### 7.2 Lexicon discipline

- **Identity** = static. Lives in SKILL.md / IDENTITY.md / ORG.md / `agents.brief_content`. Rare changes.
- **Plan** = dynamic. Lives in `agent_plans` + Action Doc body + `active/${MY_AGENT_ID}-action.md`. Weekly changes.
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
- No markdown artifacts in emails — professional HTML.
- Verify before reporting done.
- Log errors before fixing them.

---

## 8. Data flows that matter

Each subsection traces one Krish-facing outcome end-to-end. Use these as the canonical truth when reasoning about how a click becomes a row becomes an action.

### 8.1 Lead flow — from CSV drop to enriched lead to advisory call to email draft

```
Krish uploads CSV via Control Center LeadImportDropzone
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
```

### 8.2 Guest flow — from sheet drop to confirmed guest to promo drafts

```
Krish uploads/pastes guest list via Control Center GuestImportDropzone
    → POST /webhook/guest-doc-ingest  (Nell Guest Sheet Bulk Import)
        → Anthropic Sonnet 4.6 extract → Parse + Validate
            → Fetch existing guests → dedupe by email/name
                → Insert guests (status='new')
                    → visible in Guests tab

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
```

### 8.3 Visibility flow (speaking + PR)

```
Nova Visibility Sweeper (Mon 11:00 UTC weekly)
    → Perplexity sonar-pro scrapes new conferences/podcasts/PR opps
        → Anthropic Sonnet 4.6 normalises
            → Parse + Validate → dedupe → Insert visibility_targets (status='new')

Hourly: Deep Enrich Retry Sweep finds visibility_targets with status='new'
    → POST /api/visibility-targets/:id/enrich-deep
        → Sonnet 4.6 generates fit_score + why_relevant + suggested_angle
            → PATCH visibility_targets (status='enriched', deep_enriched_at)
                → surfaces in decisions_waiting + Visibility tab

Krish approves / declines via VisibilityTargetCard;
"Apply" flow → POST /api/visibility-targets/:id/apply
```

### 8.4 Customer flow — Stripe webhook to Customers tab to email draft

```
Stripe (per-product) fires checkout.session.completed
    → POST /webhook/{merciless|onalert|gutted|fractionl|mmctrl}-stripe-revenue
        → Stripe Webhook node
            ├─ Telegram alert
            ├─ Log to workflow_runs
            ├─ Lookup Attribution (recent leads/tasks by email/domain)
            └─ Supabase: Upsert Customer → customers table
                (idempotent via product+stripe_customer_id; populates
                attribution_lead_id, attribution_task_id,
                attribution_channel, attribution_confidence)

Nightly 7AM UTC: Maya | Customer Acquisition Sweeper
    → GET each product Supabase profiles/subscriptions/waitlist
    → Normalise → Upsert customers

Krish clicks "Draft email" on a CustomerCard
    → POST /api/customers/:id/draft-email
        → same email-draft path; intent inferred from customer_kind
            (paid → check-in; trial → conversion; churned → win-back)
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
                — Krish voice; no em dashes; HTML body (no markdown);
                ≤180 words for cold; ≤120 words for warm;
                explicit CTA in last sentence
            → Gmail OAuth: gmail.users.drafts.create
            → INSERT email_drafts (idempotent on entity+intent within 24h)
            → mark_entity_emailed(entity_type, entity_id, draft_id, draft_url)
            → response: {ok, draft_id, draft_url, subject, body_preview}

Krish opens the draft in Gmail, edits if needed, hits send.
Gmail does NOT auto-send. Standards PUB-001 / PUB-005 still hold.
```

### 8.6 Content flow — signal to published post

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

Cleo | Content Transform (activated during 2026-05-25 audit)
    → idea_id + target format (linkedin/newsletter/x/podcast)
        → Sonnet 4.6 produces channel-specific variant
            → PATCH content_ideas.transformed_outputs (jsonb)
```

**Hard rule (PUB-001 / PUB-005).** No content leaves the system without explicit Krish approval. **The email-draft path is exempt because nothing is sent** — Gmail Drafts only.

### 8.7 Self-improvement loop — Krish corrects, OS adapts

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

**The promise: same mistake doesn't survive four occurrences.** FeedbackButton surfaces: `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas`.

### 8.8 Self-healing — four-tier silent-failure system

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

### 8.9 Marcus synthesis — Home Intelligence feed

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

---

## 9. Cron and scheduling

Three scheduler layers cover different shapes of work.

### 9.1 OpenClaw cron (`/root/.openclaw/cron/jobs.json`) — ~38 jobs

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
| `0 11 * * 1-5 ET` | enterprise-gigs-agent | Meliora + AdFixus pipeline |
| `0 9 * * 1,2,4,5 ET` | visibility-agent | Speaking/podcast outreach |
| `0 7 * * 1 ET` | weekly-synthesis, content-engine-sweep2 | Monday morning content + intel |
| `30 16 * * 1,3,5 UTC` | Marcus Home Intelligence backstop | Backstop for the N8N synthesis |
| `0 13 * * 1,4 UTC` | Layer 1 Signal Inbox Check | Drain Krish's Drive drop folder |
| Every hour | Arlo, Hourly Feedback Pickup | Sip from feedback_queue |
| `0 9 28-31 * *` | monthly-all-hands | End-of-month executive review |

### 9.2 VPS system crontab — zero AI cost

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
```

### 9.3 N8N cron (inside each workflow)

N8N workflows carry their own `cron` / `schedule` nodes. The ~81 workflows together fire hundreds of times a day. See `workflow_runs` for the live cadence; Kai's Dependency Mapper rolls it up.

Notable scheduled workflows:

| Cadence | Workflow | Role |
|---|---|---|
| Every hour | Deep Enrich Retry Sweep | Picks up `status='new'` leads/guests/visibility, re-fires the appropriate enrich endpoint |
| Every 5 min | Critical Infrastructure Monitor | Tier 3 self-healing |
| Every 4 hours | Silent Success Detector | Tier 2 self-healing |
| Mon 09:00 UTC | Agatha Weekly Plan Refresh | Refreshes all 14 agent_plans via Sonnet 4.6 |
| Mon 11:00 UTC | Nova Visibility Sweeper | Weekly Perplexity scrape → visibility_targets |
| Sun 06:00 UTC | Vera Feedback Aggregation | Weekly feedback_queue → corrections rollup |
| Sun 07:00 UTC | Vera Failure Pattern Sweep | Tier 4 self-healing |

### 9.4 Cost discipline

| Tier | Where | Why |
|---|---|---|
| Free (zero AI) | VPS crontab shell scripts | Always pick this if no reasoning needed |
| Cheap (Haiku, GPT-4.1-nano, DeepSeek Flash) | N8N monitoring + classification | Hourly+ cadence |
| Standard (Sonnet 4.6) | Agent work, drafting, synthesis, code, enrichment, plan refresh, email drafts | Per-session use |
| Premium (Opus 4.7) | **Agatha chat only** | Decisions, not background jobs |

---

## 10. Google Drive structure

All polished output lands in a fixed Drive hierarchy. **Hard rule: never create a file in Drive root.**

| Folder | Drive ID | Contents |
|---|---|---|
| Agent Briefs | `1s3bAJDx1Ze9R6r5atf0j0Y1CsIak_-q5` | Auto-managed by sync; per-agent subfolders |
| Infrastructure | `1y4dncntB8WsKgLjTzC-YZ3KgWXyfwIt5` | OS docs, migration reports, architecture (this file mirrored here) |
| Client Work | `1E2-OsR1Dr5IqhRcfv4w0DyNF3kC9_VBh` | Meliora proposals, client deliverables |
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

### 11.1 Consulting / advisory

| Venture | Role | OS surface |
|---|---|---|
| **Mindmaker** (themindmaker.ai) | CEO & Founder, AI consulting sprints | Primary venture. Stripe → `Mindmaker OS Payment Alert`. Felix runs outbound. Cleo runs the content engine. Tagged `mindmaker_buyer` in venture_registry |
| **Meliora** (meliora.company) | Lead Associate, GenAI transformation for telco/media | `enterprise-gigs-agent` cron tracks pipeline; lives in `tasks` with `workstream='advisory_sales'` |
| **AdFixus** (adfixus.com) | Enterprise Consultant, identity & data infra | Same pipeline mechanism as Meliora |

### 11.2 Builder products (each has Stripe revenue alerts + weekly feedback loop)

| Product | Domain | Customer slug | OS surface |
|---|---|---|---|
| **mm-ctrl (CTRL)** | ctrl.themindmaker.ai | `mm_ctrl` | Memory Web / Edge / Daily Briefing surface for Mindmaker. Webhook `/webhook/mmctrl-stripe-revenue` |
| **Fractionl Circle** | circle.fractionl.ai | `fractionl_circle` | Subscriptions table sweep |
| **Fractionl Pulse** | pulse.fractionl.ai | `fractionl_pulse` | Waitlist table sweep |
| **OnAlert** | onalert.app | `onalert` | Profiles sweep + revenue alert |
| **Gutted** | www.gutted.app | `gutted` | Profiles sweep + revenue alert |
| **Merciless** | merciless.app | `merciless` | user_subscriptions sweep + revenue alert |

### 11.3 Creator / content

| Brand | Domain | OS surface |
|---|---|---|
| **The Builder Economy** | thebuildereconomy.com | Conversations with AI builders; daily Instagram cron. Tagged `builder_economy` in venture_registry |
| **Signal & Noise** | (podcast) | AI in media; co-founded with Rio Longacre + Brett House. Nell Guest Scout feeds candidates. Tagged `signal_noise` |
| **Techonomic** | techonomic.co | Krish's strategic writing platform |
| **Personal Brand** | (LinkedIn / X) | Cleo's content engine target #1 |

---

## 12. Standards (the rulebook)

`standards_registry` holds ~167 rules rendered nightly to `hot/standards-digest.md`. Categories:

| Family | Examples |
|---|---|
| **Brand Voice** | V-001..V-007, CLEO-001, BRAND-001 — writing voice, banned phrases, AI smell test |
| **Git** | GIT-001, V-004 — author identity is `hello@krishraja.com` |
| **Google Docs/Sheets/Slides** | GDOC-001..003, SHEET-001..002, SLIDE-001..004 |
| **Google Drive** | DRIVE-001, VFY-002 — folder routing, no duplicates |
| **Email** | EMAIL-001..005 — professional HTML, no markdown artifacts (applies to email-draft surface too) |
| **Code** | CODE-001..005 — TypeScript, accessibility, Supabase RLS |
| **Process** | AUD-003, SCRIPT-001..003, RESEARCH-001 — verify before "done", no fake output |
| **Publishing** | PUB-001, PUB-005 — explicit Krish approval required (note: email-draft surface is drafts only, not publishing) |
| **Model tiering** | MT-003 — Opus is Agatha-only |
| **N8N** | N8N-002..006 — workflow JSON discipline, no `typeVersion: null`, no `$env` |

**Enforcement chain.** `standards_registry` → `regenerate-standards-digest.py` (2:30 AM UTC) → `hot/standards-digest.md` → loaded on session wake → `deliver_gate.py` runs before output → violations logged to `audit_log` → Vera audits compliance → repeat offenders become hard standards.

---

## 13. Failure modes and how the OS heals

| Symptom | First place to look | Healer |
|---|---|---|
| Workflow silently stops firing | `workflow_runs` (per-workflow last entry) | Workflow Monitor + Kai every 4h |
| Workflow runs but produces no output | `silent_failures` (tier 1 or 2) | Tier 1 completeness gate + Silent Success Detector (4h) |
| Credential expired / RLS denying writes | `silent_failures` (tier 3), `credential_health` | Critical Infrastructure Monitor (5m) → CriticalAlertBanner |
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
| Email draft fails | `email_drafts` row missing for entity + Vercel function log | Re-click Draft email — idempotent on `(entity, intent, 24h)` |
| Workflow Rerun returns 422 | Schedule-only workflow (no webhook trigger) | Trigger via n8n UI's Execute Workflow button (documented in `/api/automations/:id/rerun`) |

**Generic debugging playbook.**

1. Check `workflow_runs` for the relevant `workflow_name` — recent failures?
2. Check `silent_failures` for the same workflow — any tier 1/2 hits in the last 24h?
3. Check `audit_log` filtered by `actor` — what did the agent think it did?
4. Check `credential_health` — was the upstream API reachable?
5. Pull the failing execution from N8N (`/api/v1/executions/{id}?includeData=true`) — what node errored?
6. Compare repo source-of-truth (`n8n/workflows/*.json`) against live workflow — has someone edited live without committing?

---

## 14. Operational lookup — where to find things

| You need… | Look at |
|---|---|
| The OS architecture (this doc) | VPS: `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md` · Repo: `docs/MINDMAKER_OS_ARCHITECTURE.md` · Drive: Infrastructure folder |
| An API key or credential | `TOOLS.md` (workspace root) — never paste in docs or briefs |
| What an agent does | `agents.brief_content` (DB) → `skills/agent-{id}/SKILL.md` (rendered) |
| What an agent should do this sprint | `agent_plans` row + `active/{id}-action.md` |
| Live agent run history | `audit_log`, `workflow_runs` |
| Why a workflow keeps failing | N8N executions API + `kai_workflow_snapshots` + `silent_failures` |
| Per-product customer counts | `customers` GROUP BY product (anon REST works) |
| Pipeline state | `tasks` (manual) + `leads` (sales, per-venture) + `opportunities` (early) + `guests` (podcast) + `visibility_targets` (PR/speaking) |
| Everything currently waiting on Krish | `decisions_waiting` view |
| Every email draft created (and whether sent) | `email_drafts` table |
| The N8N source-of-truth JSON for audited workflows | `n8n/workflows/*.json` in `control-center` repo |
| The current schema | Supabase Studio OR `information_schema.tables` |
| What changed last week | `git log` on `control-center` + `schema_migrations` table + recent PRs |

---

## 15. Architectural decisions worth knowing

### 15.1 Supabase is canonical, files are derived
Local JSON for state is banned. SKILL.md, standards-digest.md, action.md are **output-only** — rendered from Supabase on a schedule, never edited in place.

### 15.2 Identity vs Plan is a hard boundary
If you propose a new file or table, declare which side: static (Identity) or dynamic (Plan). Anything in the middle becomes a maintenance liability.

### 15.3 Approval is a wall, not a step
No content publishes without Krish's explicit approval. The LinkedIn Distribution endpoint is guarded by `X-Agatha-Secret`; only the Krish Approval Callback workflow has the header. **The email-draft path is a deliberate exception because Gmail Drafts don't publish anything** — Krish still hits send.

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
Direct anon writes are fine when RLS permits. When service role is required, the path is always `/api/<route>` — never `import { createClient } from 'supabase-js' with service-role key` in browser code.

### 15.15 The viewport-fit invariant
Every primary tab must fit at 1280×800 without page scroll; sub-panels scroll internally. Mobile viewport must not zoom on input focus (Toast positioning respects safe-area).

---

## 16. Krish's ideal day — what "working" looks like

**Before Krish wakes:**

- Agatha's State of Union lands in Telegram (9AM EST weekdays).
- Marcus Daily Brief lands in `home_intelligence.daily_brief` (06:30 UTC, weekdays).
- Loz sends Lauren her daily Publish Press briefing (7AM EST).
- Overnight cron has completed; results in Supabase.

**Work hours:**

- Gmail-monitor flags important threads at 9AM / 1PM / 5PM ET.
- Krish opens Control Center → Home → DecisionsWaitingPanel.
  - Target count under 10. Each row has a rich preview so he answers in seconds.
  - Lead waiting? Read why_relevant + primary_tension → Promote / Draft email / Schedule follow-up.
  - Guest waiting? Read pitch_draft → Confirm / Skip / Edit pitch.
  - Visibility waiting? Read suggested_angle → Apply / Decline / Snooze.
  - Idea waiting? Greenlight or kill.
- He sends queued email drafts (he hits send, not draft).
- Approves Cleo's LinkedIn posts.
- Makes the strategic calls Agatha surfaces.
- Chats: Agatha for strategy, Cleo for content, Finno for personal reflection.

**Background (no Krish input needed):**

- Zara sweeps signals, Felix tracks pipeline, Hunter scans job boards.
- Maya runs SEO intel + nightly customer sweep.
- Priya monitors product health.
- Kai checks every credential + workflow every 4 hours.
- Arlo syncs Control Center every 5 minutes.
- Vera audits standards compliance daily, deep audit Fridays, feedback aggregation Sundays.
- Marcus refreshes Home Intelligence Mon/Wed/Fri + Sunday deep + Daily Brief weekdays.
- Critical Infrastructure Monitor watches credentials every 5 min.
- Silent Success Detector watches downstream effects every 4 hours.
- Deep Enrich Retry Sweep picks up unenriched leads/guests/visibility every hour.

**Weekly cadence:**

- Mon: Agatha Plan Refresh (09:00 UTC), Nova Visibility Sweeper (11:00 UTC), weekly-synthesis, product-agent.
- Tue–Thu: Zara signals, Felix pipeline, content drafts.
- Wed: marketing-agent, newsletter-draft.
- Fri: Leo revenue pulse, Vera deep audit, Marcus Friday Retro 17:00.
- Sun: Vera Feedback Aggregation 06:00, Vera Failure Pattern Sweep 07:00, Truth Reconciler backstop.
- Last day of month: monthly-all-hands.

---

## 17. Aspirational targets — where this is going

The current state runs. The aspirational state is what closes the gap to Outcome O-1 ("Krish under 2 hrs/day on ops"), O-2 ("$20K/month inside 60 days"), and the OS's North Star (one person running what 15-30 traditionally does).

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

Current `decisions_waiting` unifies 5 sources (tasks, leads, guests, visibility, ideas). The aspirational expansion adds:
- `customer_check_in_due` (paid customers Krish hasn't talked to in N days)
- `bet_resolution_due` (live bets past their time_box_days)
- `kill_list_candidate` (tasks ≥21 days untouched — currently a separate modal, should be unified)

### 17.4 Truth-Reconciler-driven self-pruning

Current Truth Reconciler reports drift weekly. Aspirational: it proposes corrections automatically (e.g. "Cleo brief references a workflow_id that no longer exists; PR-edit the brief"). Krish approves in Org tab; render-identity picks up the patch within 15 min.

### 17.5 Mobile-first action surface (delivered 2026-05-25, polish in flight)

Lead/Customer/Guest cards expose Draft email + Deep enrich on mobile DetailSheets. Aspirational: every Decision-Waiting row offers its primary action with a single tap, including from a 320px viewport, with haptic-style toast confirmations. Polish iterations track in `docs/AUDIT_STATUS.md`.

### 17.6 Outbound conversion attribution

Today: customers have `attribution_channel`, `attribution_lead_id`, `attribution_task_id`. Aspirational: every `email_drafts.id` is joinable to the eventual `customers` row that closed, so Krish can see "this Mindmaker Strategy Day closed because of this draft Cleo wrote on this date." Closing this loop turns the email-draft surface into measurable revenue, not just convenience.

---

## 18. Glossary

| Term | Definition |
|---|---|
| **Control Center** | The React dashboard at `controlcenter.krishraja.com`. (Formerly "org-os-dashboard" — name banned.) |
| **Identity** | Static agent config. Lives in `agents.brief_content`. Rare changes. |
| **Plan** | Dynamic sprint state. Lives in `agent_plans` + Action Doc body. Refreshed weekly. |
| **Orchestrator** | Central N8N webhook router (`u0kIULJBJL4dGcuR`) that dispatches Control Center events to agent workflows. |
| **Standards Registry** | Supabase table of ~167 behavioural rules enforced fleet-wide. |
| **Deliver Gate** | `deliver_gate.py` — enforces standards before agent output leaves the workspace. |
| **Brief Content** | Per-agent operating manual stored in `agents.brief_content`. Rendered to SKILL.md. |
| **Heartbeat** | Periodic poll where agents check `HEARTBEAT.md` for pending tasks. |
| **Signal** | A market or business intelligence data point captured by Zara, Maya, or the Layer 1 Signal Inbox. |
| **Layer 1 Signal Inbox** | The Google Drive folder Krish drops files into; the system processes them into `zara_signals` and tasks. |
| **Feedback Queue** | `feedback_queue` — Krish's rejections, fuel for the learning loop. |
| **Corrections** | `corrections` — patterns Vera extracts from `feedback_queue` (≥3 matches) or from `silent_failures` (Failure Pattern Sweep). |
| **Workflow Run** | A row in `workflow_runs` — the heartbeat every N8N workflow writes per execution. |
| **Pod** | An organisational grouping in `agents.pod` — `executive` / `growth` / `ops`. |
| **Sweeper** | A workflow that polls something on a cron (Maya for customer Supabases nightly; Deep Enrich Retry hourly; Nova Visibility weekly). |
| **Completeness Contract** | A row in `completeness_contracts` declaring the minimum acceptable output of a workflow. Tier 1 of self-healing. |
| **Silent Failure** | A row in `silent_failures`. A workflow ran without erroring but produced no value. Tiered 1–4 by detection mechanism. |
| **Decisions Waiting** | The unified Postgres view + Home panel covering everything across tasks/leads/guests/visibility/ideas currently awaiting Krish. |
| **Venture Registry** | The 3-row `venture_registry` table (mindmaker, signal_noise, builder_economy) that drives multi-tag leads and per-venture lanes. |
| **Email Draft** | A row in `email_drafts`. A Cleo-authored Gmail draft sitting in Krish's mailbox, never sent until Krish sends it. |
| **mark_entity_emailed** | Idempotent RPC called by the Cleo Email Draft workflow to stamp `last_emailed_at` and email-draft IDs on the relevant entity. |

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
/root/.openclaw/workspace-ops/                               # Arlo
/root/.openclaw/workspace-cleo/                              # Cleo
/root/.openclaw/workspace-loz/                               # Lozatron
/root/.openclaw/workspace-steph/                             # Aria
/root/.openclaw/workspace-finno/                             # Finno
/root/.openclaw/workspace-maa/                               # Devi

# Shared skills (~107 of them)
/root/.openclaw/skills/agent-{name}/SKILL.md                 # Per-agent rendered identity
/root/.openclaw/skills/krish-voice/SKILL.md                  # Mandatory for outbound + email drafts
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
```

---

## 20. Recent architectural changes — rolling changelog

Pruned to the last 90 days. Older history is git-archaeology territory.

### 2026-05-25 — Audit closure (PRs #67 → #70)

The "pedantic CEO audit" turned every visible-but-broken surface into a real, end-to-end-verified workflow. Closed in four PRs:

- **PR #67, Full transformation.** Supabase migration: `leads.enrichment_status` + `leads.deep_enriched_at` + email-draft tracking columns on leads/customers/guests + new `email_drafts` table + `mark_entity_emailed` RPC. 8 new `/api/*` proxy routes (lead/customer/guest draft-email, lead enrich, visibility-targets enrich-deep + apply, automations rerun). Frontend: viewport zoom fix, Toast safe-area, naming pass (Services/Subscriptions/Visibility), Disney "Unnamed" fix. **New N8N workflow `Cleo | Email Draft`** (Gmail OAuth drafts). **Cleo Content Transform activated** (previously dormant since 2026-05-23). Duplicate **Agatha Visibility Deep Enrich → ZZ ARCHIVED**.
- **PR #68, Deferred polish + Agatha pipeline patch.** Agatha Lead Deep Enrich now writes `enrichment_status='enriched'` on success (clears optimistic-pending). Mobile overflow menu on ContentIdeaCard secondary buttons. DecisionsWaitingPanel limit 4→12. Cmd+K/Cmd+I hint on DesktopHome. MobileOrg Edit brief. MobileIntel Create task + Add to bets on signal DetailSheet. Mobile + DesktopFlows Rerun button on workflow cards. MobileCustomers Log call + Mark for outreach.
- **PR #69, Rerun route fix.** `/api/automations/:id/rerun` rewritten — looks up the workflow's webhook trigger node and POSTs to its webhook URL; returns 422 with guidance for schedule-only workflows. (Previous implementation hit a non-existent N8N endpoint.)
- **PR #70, Audit closure.** N8N workflow snapshots committed under `n8n/workflows/*.json` for the five workflows central to the audit (Agatha Lead Deep Enrich, Cleo Content Transform, Nova Visibility Deep Enrich, Cleo Email Draft, archived Agatha Visibility duplicate). `n8n/workflows/README.md` with a per-workflow CHANGELOG (six bugs surfaced + fixed during the audit's verification round — Brave token rotation, Brave URL shape, Brave Accept header, Sonnet credential mis-wire, jsonBody shape, Parse Sonnet shape).

End-to-end live verification: 6 viewports × 11 tabs (0 errors), 11 API routes (correct codes), Cleo Transform on a real idea (200 + real LinkedIn variant), Lead Draft email UI click flow (real Gmail draft `r6827848582574950084`), Lead Deep Enrich (Sonnet wrote enrichment_status + scores back), Rerun route (202 webhook / 422 schedule).

### 2026-05-22 — 7-PR OS rebuild (#49 → #56) + visibility follow-ups (#58, #60)

The rebuild rewired the system around per-venture leads, a podcast guests pillar, four-tier self-healing, weekly Plan refresh, and a unified decisions surface.

- **PR #49** Tab registry, sidebar/nav parity, Open All routes, mobile logo, Capture Idea hardening.
- **PR #50** Zara fix — dropped Perplexity Error Passthrough; hardened Filter Valid Signals; rewrote Parse Perplexity; purged error rows.
- **PR #51** Cleo extraction + feedback foundation — Sonnet 4.6 rewrite; FeedbackButton across 5 surfaces; `/api/feedback`; Vera correction-loop scaffolding.
- **PR #52** Visibility + Guests pillar — new tables `visibility_targets` and `guests`; Nova Visibility Sweeper; Nell Guest Sheet Bulk Import; Nell Guest Confirmed Cascade.
- **PR #53** Leads multi-tag + venture-aware ICP — `venture_registry`, `leads.tags`, `leads.icp_scores`, `leads.primary_venture`.
- **PR #54** Four-tier self-healing — `completeness_contracts`, `silent_failures`, three audit RPCs; Silent Success Detector (4h), Critical Infrastructure Monitor (5m), Vera Failure Pattern Sweep (Sun 07:00 UTC); CriticalAlertBanner.
- **PR #55** Living `agent_plans` + unified `decisions_waiting` view; Agatha Weekly Plan Refresh (Mon 09:00 UTC); DecisionsWaitingPanel.
- **PR #56** Cross-cutting hardening + brief edits + deprecation drops (`nova_target_conferences`, `nell_candidates`).
- **PR #58** Visibility depth follow-ups — 12/12 visibility_targets enriched.
- **PR #60** Sweeper retry + Nell Guest Pitch Draft canonicalisation — 36/36 guests backfilled; decisions_waiting includes status='enriched' guests with pitch preview.

### Prior to rebuild (PRs #41 → #47, rolled out 2026-05-21)

- **PR #41** Leads pillar reshape; new `customers` table + enums; Agatha Lead Deep Enrich; Maya Customer Acquisition Sweeper; Stripe mm-ctrl Revenue Alert.
- **PR #42** Rollout fixes; `home_intelligence.customer_signals` jsonb.
- **PR #43** Money Machine — `customers` attribution columns; MrrTicker + CustomerSourcesPanel.
- **PR #44** Bet Board — `bets` table; 90-day hit-rate.
- **PR #45** Customer Compounding — `customer_contacts`; CustomerCouncilCard/ExpansionRadar; Maya Churn → Exit Interview Task.
- **PR #46** Marcus as COO — `home_intelligence.daily_brief / weekly_retro / monday_premortem`; `/api/ask-marcus`.
- **PR #47** Anti-busywork — `tasks.lever_score` + `est_hours_to_revenue`; KillListModal.

---

## 21. Update protocol

Edit this file when the architecture *genuinely* changes: new agent, new pillar, new SSOT table, retired component, new aspirational target. Do not edit it for transient incidents (use `audit_log` + an `agent_plans` blocker entry). Do not embed credentials. Do not paste in agent briefs (they belong in `agents.brief_content`). When in doubt, ask: "will this be true in a week?" If yes → here. If no → somewhere else.

**Anti-duplication rule.** This is the only OS architecture document. If you're tempted to write a sibling — "OS-2026-XX.md", "Mindmaker Architecture v2.txt", "complete-os-reference.md" — anywhere in the workspace, edit this file instead. Multiple architecture docs drift; one canonical file does not.

**Sync rule.** Three locations should always match:
1. VPS: `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md` (canonical)
2. Repo: `docs/MINDMAKER_OS_ARCHITECTURE.md`
3. Drive: Infrastructure folder

When you edit one, sync the other two. The repo is the easiest place to PR and review; the VPS is what agents actually read on session wake; Drive is what humans share.


---

## 16. Audit reconciliation — 2026-05-26

> **Status.** This section captures every fix that landed in the 2026-05-25 → 2026-05-26 audit remediation pass. Anything below describes the **current live state**, not the audit's *findings* (those live in `audits/2026-05-25-os-e2e-audit.md` for archaeology). When the doc above contradicts this section, this section wins.

### 16.1 P0 (4 fires extinguished)

| ID | What broke | What's live now |
|---|---|---|
| A1 | Marcus Daily Brief Telegram chat_id `5712840770` → `chat not found` | chat_id = `6773796504`. First validated cron tick: 06:30 UTC next cycle. |
| A2 | Self-healing tier workers all 401 (Silent Success Detector + Critical Infra Monitor + Vera Failure Pattern Sweep) | All 3 HTTP nodes now `authentication=predefinedCredentialType, nodeCredentialType=httpHeaderAuth`. Critical Infra Monitor 5-min ticks all success. |
| A3 | Agatha Lead Deep Enrich Brave Search 422 (`$json[0]` undefined + wrong Accept header) | Brave URL uses `$json.full_name`, Accept: `application/json`. Webhook executions succeeding. |
| A4 | Kai Dependency Mapper OOM crashes every 4h | Stop-gap v5: `Fetch Current Workflows` URL has `?active=true&excludePinnedData=true` (trims 2.4MB payload). **Real fix (sub-workflow refactor) deferred to Phase 2.** |

### 16.2 P1 reconciled (8 items)

| ID | Change |
|---|---|
| B | Architecture doc reconciliation — this section. §4 column-drift items still pending auto-generation. |
| C1 | Priya Daily Health Scan: `Map Task to Goal` jsCode prepended with **CLO-001 guard** — no task on `broken=0 AND stale=0`. 7 historical Priya noise tasks closed via `concept:priya:health-alert-noop`. |
| C2 | `render-plan.py` `CANONICAL_AGENTS` now includes `arlo`. `active/arlo-action.md` refreshes on the Mon 02:30 UTC tick. |
| C3 | Dead route `api/nell-candidates/[id]/schedule.ts` removed from control-center. |
| C4 | Status Update Receiver `Validate & Normalise` enforces workflow_id+workflow_name (**CLO-002**). DB layer no longer accepts anonymous heartbeats (4 pre-fix rows remain as historical). |
| C5 | `decisions_waiting` view now 6-branch (added `kind='correction'`). Frontend: hook + panel + routeDecision + DecisionDetail + DesktopOrg `?correction=:id` hash effect + `data-correction-id={c.id}` row anchor. Two stuck corrections (arlo 42d, agatha 13d) now surface in unified queue. |
| C6 | 6 Stripe workflows each have `Write Heartbeat` HTTP node off the entry webhook. Uses existing `httpHeaderAuth` credential — no embedded JWT. |
| F1 | `/api/health` agent-freshness now reads `agent_plans.last_rendered_at` (cron-maintained) instead of `agents.last_run` (unmaintained). Home dashboard no longer perma-red. |

### 16.3 P1 deeper fixes shipped in second batch (5 items)

| ID | Change |
|---|---|
| F2 | `<meta name="build-sha">` + `<meta name="build-time">` injected by vite plugin. Every SPA load attributable to a commit. |
| F3 | Cleo Content Idea Capture (`nu7nQGZ3Pc3mEaoH`) → **CLO-006** guard: rejects seeded ideas missing `source_url`. Ends the "AI-generated content idea with no external link" class. |
| F4 | Critical Infrastructure Monitor adds `Write system_health heartbeat` HTTP node every 5 min — upserts `system_health.N8N Cloud` row. Fixes the "system_health 40-day stale" finding. |
| F5 | Vera Feedback Aggregation (`FZBDYXXfT1MBrAF6`) — 5 HTTP nodes (Fetch Unconsumed Feedback, Anthropic Propose Brief Edits, Write Corrections, Mark Feedback Consumed, Audit Log) all had the same A2 auth bug. Patched. **Learning loop now closes**: feedback_queue → corrections → agent briefs. |
| F6 | Mobile FeedbackButton: FeedRow primitive now accepts `feedback={{ sourceTable, sourceId, agentId }}` prop. MobileLeads (1) + MobileToday (4) wired. **Mobile coverage went 0 → 48 FB buttons** across critical surfaces. |
| F7 | `/api/feedback` ALLOWED_TABLES expanded from 5 to 10 surfaces (tasks, customers, bets, opportunities, corrections added). REASON_OPTIONS expanded to match. Krish can now thumb-down a Marcus top_three item. |
| F8 | Marcus Daily Brief — Parse + stamp node appended with **CLO-004** guard: re-stamps every `top_three.expires_at` to NOW+24h to defeat Sonnet's year-2025 hallucination. |
| F9 | RLS restored on `visibility_targets` + `guests` (both had RLS=on, 0 policies → empty UI). Added anon-SELECT and service_role-ALL policies matching every peer table. Visibility + Guests tabs now populated. |

### 16.4 Phase 2 — open items

| # | Item | Effort |
|---|---|---|
| P2-1 | Kai sub-workflow refactor (split `Fetch Current Workflows` into a child workflow so runData isn't carried through main) | ~45 min |
| P2-2 | §4 Supabase schema section auto-generated from `information_schema.columns` (kills the 6-table column-name drift) | ~1 h |
| P2-3 | Mobile FeedbackButton JSX wire on MobileContent / MobileGuests / MobileBets (imports present, render pending) + MobileCustomers / MobileOrg / MobileIntel / MobileFlows hand-wire | ~45 min |
| P2-4 | DesktopLeads — surface `lead.linkedin_url` as an external link chip per row | ~15 min |
| P2-5 | Workflow naming normalization — rename 9 non-canonical strays + workflow_runs.workflow_name backfill in same SQL tx | ~30 min |
| P2-6 | +5 completeness contracts (Marcus Daily Brief, Cleo Email Draft, Agatha Lead Deep Enrich, Felix Pipeline, Maya CAC) | ~45 min |
| P2-7 | Rotate `sbp_d44...` Supabase Management token (pasted in chat ×2 in 30 days) | 2 min |

### 16.5 What this section ASSUMES, document elsewhere if false

- `/api/health` returns degraded if **more than 2** agents' `agent_plans.last_rendered_at` is older than 30h. The threshold was chosen to absorb the weekly Plan Refresh slot (Mon 02:30 UTC) plus jitter; revisit if Plan Refresh moves to daily or sub-weekly.
- Stripe heartbeat row in `workflow_runs` does NOT capture which Stripe event type fired — just that the webhook was hit. Per-event-type breakdown lives in the existing `Log to Supabase` node downstream of `Payment?`.
- C5's `corrections` branch only surfaces `status='analyzed' AND approval_state='pending'` rows. Approved/rejected corrections do NOT appear in `decisions_waiting` — they're terminal states.
- CLO-005 hash-param effect retries 10× at 200ms intervals. If `pendingCorrections` takes >2s to mount, the highlight is missed silently (no error).
