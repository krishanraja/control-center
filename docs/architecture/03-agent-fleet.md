# The agent fleet: reference detail

> **Reference detail for section 3 of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- Hunter is described as retired in 3.2 and 3.4. It is ACTIVE (`agents.active = true`, read 2026-10-05) and runs from GitHub Actions and the `hunter/tick` Vercel cron, not from n8n or OpenClaw.
- Workflow counts (82 active, 105 tracked, "~85 active") are from July 2026. The live count is the n8n API; `node scripts/n8n/audit.mjs --verbose` reports it.
- Cleo's `Draft Post on Demand` and `LinkedIn Distribution` workflows were retired on 2026-10-05. Nothing publishes to LinkedIn automatically.
- Model names in 2.2 and 3.4 (Opus 4.7, Sonnet 4.6, Gemini 2.5 Pro) are dated. Routing is in `docs/MODEL_ROUTING_AUDIT.md` and guarded by `check-model-routing`.
- The personal-life agents in 3.3 are outside the business and never appear in Control Center.

---

## 3. The agent fleet (the OS in motion)

### 3.1 Two shapes, one fleet

**Claude Code agents** live in OpenClaw, have a workspace, a Telegram bot, identity files, and conversational memory across sessions (via files). They are interactive - you message them, they message back, they take multi-turn instructions.

**N8N workflow agents** are one-shot scheduled or webhook-triggered jobs. They wake, fetch context, call an LLM (or not), write the result to Supabase + (often) Telegram + (sometimes) Drive, and die. No state between runs except what they wrote to the DB.

Some agents (Vera, Marcus, Cleo, Nova, Nell, Agatha) exist in *both* forms. Intentional split: the N8N side runs the routine pulse; the Claude Code side handles ad-hoc deeper work.

### 3.2 The production agents (14 tracked, 12 active)

These are the agents the OS itself tracks via `agents.brief_content` (identity) and `agent_plans` (sprint plan). Personal-life agents (loz/steph/finno/maa) live only in OpenClaw config; they're outside the Mindmake business and don't appear here.

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
| ~~**Kai**~~ | ~~Technical Architecture / Integrations~~ | **RETIRED 2026-09-07** | Superseded by `/api/health/fleet-reconcile` (workflow health) and `/api/health/connections-sweep` (credential health), both Vercel crons every 6h. Kai was an n8n workflow monitoring n8n, which shares the blind spot it existed to close. |
| **Leo** | Chief Revenue Officer | scheduled (weekly) | Revenue MTD, runway clarity, 3-venture funnel maps |
| ~~**Priya**~~ | ~~Product Strategy~~ | **RETIRED 2026-09-14** | The twice-daily scan wrote a `product_health` row, opened a task, created a Google Doc bug report and sent three Telegram messages per run; none of it changed a decision. Health of the live apps is already covered by `/api/health/fleet-reconcile` and the Vercel deploy checks. |
| **Vera** | Chief of Staff & Quality | scheduled (2×/day + Fri deep + Sun feedback + Sun failure-pattern + Sun success-induction sweep) | Standards compliance, drift detection, audit closure, skills induced from wins |

The roster lives in three places that must agree: Supabase `agents` (authoritative), `docs/AGENTS.md` in this repo, and `api/agents/[name].ts:available_agents` (fallback list). If the table grows or shrinks, all three change in the same commit.

### 3.3 Personal-life Claude Code agents (not in Supabase `agents`)

| Agent | Workspace | Telegram bot | Purpose |
|---|---|---|---|
| Lozatron (`loz`) | `~/.openclaw/workspace-loz` | Loz Bot | a family member's personal AI; daily news briefings; separate from Krish-side ops |
| Aria (`steph`) | `~/.openclaw/workspace-steph` | a friend Bot | a friend's thinking partner; sandboxed |
| Finno (`finno`) | `~/.openclaw/workspace-finno` | Finno Bot | Krish's personal therapy + financial reflection; strictly isolated from business |
| Devi (`maa`) | `~/.openclaw/workspace-maa` | Maa Bot | Family health coordinator for Krish's mother; group chat enabled |

**Hard rule.** `<a family member's personal address, removed>` is a family member's, not Krish's. NEVER use it for Drive/Docs/Gmail outside `loz` workspace.

### 3.4 N8N workflow inventory (~105 workflows tracked, ~82 active, ~23 inactive)

Live inventory (reconciled against the runtime 2026-07-01), grouped by name prefix. Active counts reflect the 2026-07-01 changes (2 broken workflows disabled, Kai mapper re-enabled, Critical Infra Monitor retired to the VPS - see §3.4.1 / changelog) and the 2026-07-10 portfolio-overhaul unpublishings (Felix tracker, Hunter Job Sweep, Nell Apollo Enrichment + Lead Document Ingest + Draft Outbound):

| Prefix | Active | Role |
|---|---|---|
| **System** | 18 | Orchestrator, Control Center Live Sync, Daily Morning Brief, Error Monitor, Workflow Monitor, Cost Advisor, Status Board API, Krish Approval Callback, Krish Feedback Receiver, Monthly All Hands, Apify Registry Keeper, Truth Reconciler, Silent Success Detector, Status Update Receiver, Product Proposal → GitHub Issue, Proposal Executor, Competitor Health Scan, **Audience Pipeline** (sync every 15m + reconcile daily 07:30). (Critical Infrastructure Monitor **retired 2026-07-01** - now runs on the VPS at `*/5`; §3.4.1.) |
| **Cleo** | 11 | Omnichannel Content Factory, Draft Post on Demand, LinkedIn Distribution, Log Content Performance, Newsletter Sweep, Content Idea Capture, Email Draft (Gmail OAuth), + **Content Transform**, **Content Lane Sourcing**, **Inspiration Sweep**, **Synthesis Engine** |
| **Nell** | 7 | Guest Scout, Guest Sheet Bulk Import, Guest Confirmed Cascade, Guest Pitch Draft, + **Briefing Stuck-Generating Sweep** (every 4h), **Guest Pitch Enrich (Exa)**, **Guest Speaker Briefing** (Apollo Contact Enrichment, Draft Outbound Messages, Lead Document Ingest unpublished 2026-07-10) |
| **Agatha** | 8 | Content Angle Approval, Portfolio Pipeline Triage/Dispatch/Analytics, Product Proposal Review, State of Union Weekly, Lead Deep Enrich, Weekly Plan Refresh (Mon 09:00 UTC). Closure Intent Receiver still planned (§17.7). |
| **Krish** | 6 | **NEW GROUP** - Inbox Return Detector (every 15m), Inbox Router, Inbox Classifier, Inbox Digest (Sun 17:00 UTC), Focus Calibrator, Objective Milestone Proposer |
| **Stripe** | 3 | **Revenue Intake** (consolidated 2026-07-07: one workflow hosting both live webhook paths `/webhook/{mmctrl\|fractionl}-stripe-revenue`, HMAC signature verification arms itself when `system_config.stripe_webhook_signing_secrets` is populated; forged-event rejection adversarially tested); **Reconciliation Nightly** (05:00 UTC, Stripe is ground truth: upserts subscribers from live subscriptions via `system_config.stripe_price_product_map`, marks lapsed paid rows churned, surfaces unmapped price ids in audit_log instead of guessing); mind/make OS Payment Alert. (The per-product alert clones are retired: Merciless/OnAlert/Gutted 2026-07-06, Fractionl/mm-ctrl superseded by Revenue Intake 2026-07-07) |
| **Feedback** | 2 | Weekly per product (Fractionl Circle, Fractionl Pulse). (Gutted/Merciless/OnAlert weeklies deactivated 2026-07-06, product retirement) |
| **Vera** | 4 | Behavioural Auditor, Feedback Aggregation (Sun 06:00 UTC), Failure Pattern Sweep (Sun 07:00 UTC), Success Induction Sweep (Sun 08:00 UTC) |
| **Nova** | 4 | Closed-Loop PR Engine, Visibility Sweeper (Mon 11:00 UTC; retry sub-trigger every 6h), Podchaser → Visibility (Outbound), enrich endpoint |
| **Marcus** | 4 | Synthesis + Home Intelligence (Mon + Wed/Fri + Sun deep), Daily Brief 06:30, Friday Retro 17:00, Monday Pre-mortem 08:00 |
| **Zara** | 3 | Content Pipeline (Zara→Cleo→Maya; interval set to daily 08:00 on 2026-07-01), Layer 1 Signal Inbox, OS - Zara Signal Sweep (Mon–Fri 10:00 EST) |
| **Maya** | 2 | Closed-Loop Revenue Engine, Customer Acquisition Sweeper. (Churn → Exit Interview **disabled 2026-07-01** - broken; §3.4.1) |
| ~~**Priya**~~ | 0 | **RETIRED AND UNPUBLISHED 2026-09-14.** `Daily Health Scan` (`dm2CccS71EVO8kJY`) and `Weekly Product Rollup` (`jpii0fEFmNTk2jCt`) are unpublished in n8n and moved to `scripts/n8n/_retired/`. Their Google Doc bug reports and Telegram alerts are gone with them. |
| ~~**Kai**~~ | 0 | **RETIRED AND ARCHIVED 2026-09-07.** Both `Dependency Mapper + Credential Health` (`fBgBwoAg0YdkabtU`) and its `Slim Workflows Fetch` helper are archived. It had returned `issues_detected` 83 consecutive times into a void, and nothing read `kai_workflow_snapshots` (29,320 rows, zero consumers). |
| **Acquisition** | 3 | **NEW 2026-07-07**: CTRL Capture Intake (webhook `/webhook/ctrl-capture`), CTRL Nurture Scheduler (daily 14:00 UTC; L1 approvals via `send-<id>` tasks), CTRL Unsubscribe (webhook `/webhook/ctrl-unsub`). See §11.5 |
| **Fleet** | 1 | **NEW** - Attribution & Product-Truth Health (daily 06:15 UTC) |
| **mind/make OS** | 1 | **NEW** - RE Dossier Engine (Relationship Engine, every 6h) |
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
> **2026-08-12 incident, recorded because the wrong conclusion is the easy one.** When the fleet went silent from 27 July, the governor described below was the obvious suspect: the symptom (most workflows inactive, a handful of critical ones still running) is exactly its trip signature. It was not the cause. Toggling `active` stamps `updatedAt`, and exactly ONE workflow was modified on 2026-07-27 - a governor trip would have stamped all of them. The real faults were (a) the `Status Update Receiver` rejecting 100% of traffic because the CLO-002 guard treated agent heartbeats, which legitimately carry no `workflow_id`, as anonymous; and (b) the Orchestrator failing 83% of dispatches with "Workflow is not active and cannot be executed" against sub-workflows that were already off. **The lesson worth keeping: a trip signature and a trip are not the same evidence.** Check `updatedAt` before blaming the governor.
>
> The deeper lesson is about monitoring. `workflow_runs` is the primary fleet-health signal (§4), `silent_failures` is derived from it, and BOTH are written by the fleet. A fleet that stops writing therefore produces a clean board rather than an alarm - a 23% error rate (58 of 250 executions) recorded as perfect silence. `useFleetLiveness` now computes staleness from the ABSENCE of rows, so it survives the recorder dying; a monitor sharing a dependency with the thing it monitors is not a monitor.

2. **External VPS governor (warning only since 2026-09-09; there is no automated cap).** A cron on the OpenClaw VPS (`/root/.openclaw/workspace/scripts/n8n-exec-governor.py`, hourly) - outside n8n's own budget so it cannot be starved as the cap approaches - maintains a cumulative per-cycle execution counter (robust to n8n's history-retention pruning) and **warns** into `/var/log/os-pull-only-alerts.log` at 7,000/cycle (or projected ≥ 9,500; it warned the ops Telegram until 2026-09-06), with a per-workflow alarm at 200 executions an hour. **It no longer trips.** Until 2026-09-09 this paragraph said it deactivated every active workflow not in a critical whitelist at 8,000/cycle; that branch was removed by ruling that day (`krishanraja/ai-harness`, `state/vps-surface-declaration-2026-09-09.md`), because had it ever fired it would have deactivated 77 of 86 workflows with no record of what was active and no path back. The harness's own words: "the execution cap still does not exist anywhere. The governor now warns and never acts, which was the ruling, so nothing caps n8n spend. That is a deliberate, known gap." The only hard stop is n8n's native 10,000/month, which starves the critical workflows too. Corrected 2026-09-19 after a VPS audit re-confirmed warn-only; this paragraph had described the old behaviour for ten days.

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
| `loz` | `loz` (Lozatron) | a family member-only |
| `steph` | `steph` (Aria) | a friend-only |
| `finno` | `finno` (Finno) | Personal therapy |
| `maa` | `maa` (Devi) | Family-only |

---
