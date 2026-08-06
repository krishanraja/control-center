# Glossary

> **Scope.** Single source of truth for terms used across the codebase,
> the UI, and the documentation. Where a term is defined in detail in
> another doc, that doc is linked — the entry here is the short form.

---

## A

**ADR** — Architecture Decision Record. A short markdown file in
[`docs/DECISIONS/`](./DECISIONS/) capturing one architectural choice and
the trade-offs considered. Numbered sequentially.

**Agent** — A non-human actor in the organisation. Has a slug, display
name, pod, and brief. May be a Coordinator, Executor, or Monitor (see
[`AGENTS.md`](./AGENTS.md#agent-taxonomy)).

**`agent_id`** — The owning-agent column on `workflow_runs`. Stores the
lowercase slug. Renamed from `agent` on 2026-04-15.

**`agents.id`** — Primary key of the `agents` table. The lowercase slug
(e.g. `cleo`). The canonical join key for every cross-table agent
reference. See [Slug-as-Key](./AGENTS.md#slug-as-key).

**Agatha** — The COO agent. Only agent accountable directly to Krish;
delegates to the rest of the fleet. Bound to the primary Telegram bot.

**Audit log** — The `audit_log` table. Append-only stream of every
significant event in the system. Drives Live Activity and the Intel feed.

---

## B

**Bet** — A row in the `bets` table. A falsifiable business hypothesis
with a time-box, an `est_mrr_impact_usd`, and a status
(`live`/`won`/`lost`/`partial`). The Bets tab tracks the 90-day hit
rate.

**Brief** — Long-form text defining an agent's voice, mission, and
mandate. Stored as `agents.brief_content`. Rendered to
`~/.openclaw/skills/agent-{id}/SKILL.md` on the VPS every 15 min by
`render-identity.py`.

**Blocker** — A task with `status='blocked'` whose progress depends on
an external action. Blockers age and are surfaced on Home / Today.

**Builder Economy** — Krish's podcast brand and Instagram account for AI
builders. One of the venture targets for guest booking. Slug
`builder_economy` in `venture_registry`.

---

## C

**Cleo** — The content coordinator agent. Owns voice quality across all
five content streams. Receives ideas via the Cmd+I QuickCaptureIdea
surface.

**Completeness Contract** — A row in `completeness_contracts` declaring
the minimum acceptable output of a workflow. Tier 1 of the four-tier
self-healing system.

**Coordinator** — An agent that plans and reviews but does not execute
N8N workflows directly. Has `expected_runs_per_day = null`. A coordinator
with no `workflow_runs` is expected, not broken.

**Control Center** — This product. The CEO-facing dashboard for
Mindmaker OS. Previously known as "org-os-dashboard" (name banned).

**Corrections** — Rows in the `corrections` table. Patterns Vera
extracts from `feedback_queue` (≥3 matches, confidence > 0.8) or from
`silent_failures` (Failure Pattern Sweep). Drive agent brief edits and
new `standards_registry` rules.

**Critical Infrastructure Monitor** — N8N system workflow, 5-min cadence.
Tier 3 of the self-healing system. Watches `credential_health`,
`system_health`, and RLS denials in `audit_log`; writes critical-severity
rows to `silent_failures`.

**Customer** — A row in the `customers` table. Cross-product ledger
keyed by `(customer_product, stripe_customer_id)`. `customer_kind` enum:
`paid`/`free_signup`/`trial`/`waitlist`/`churned`.

**`customer_contacts`** — One row per logged conversation with a
customer. Feeds the CustomerCouncilCard on the Customers tab and
Marcus's `customer_voice` synthesis.

---

## D

**Decisions Waiting** — The unified Postgres view + Home panel covering
everything across tasks / leads / guests / visibility / ideas currently
awaiting Krish. Reads from `decisions_waiting`. New "waiting on Krish"
surfaces must add a `UNION ALL` branch to the view, never a sibling
panel.

**Deep enrich** — The act of running an LLM-backed enrichment over a
freshly captured `leads` / `guests` / `visibility_targets` row. Fired by
the appropriate Orchestrator webhook (lead-deep-enrich,
guest-deep-enrich, visibility-deep-enrich) or by the hourly Deep Enrich
Retry Sweep.

**Deep Enrich Retry Sweep** — Hourly N8N workflow that re-fires deep
enrich for any unenriched row.

**Deliver Gate** — `deliver_gate.py` on the VPS. Enforces standards
before agent output leaves the workspace. Not invoked by Control Center.

**Drive sync** — The background job that syncs polished agent output
into Google Drive. Logged via `audit_log` `event_type='drive_sync_run'`.

---

## E

**Executor** — An agent that runs scheduled N8N workflows and produces
artefacts. Has `expected_runs_per_day != null` and contributes to the
agent-freshness health check.

**Event-driven** — The platform's overall pattern. State changes write
to Supabase, Supabase fires webhooks (via `pg_net`), agents react,
agents write back. See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## F

**Failure Pattern Sweep** — Weekly N8N workflow (Sun 07:00 UTC) owned by
Vera. Tier 4 of the self-healing system. Groups `silent_failures` rows
over the last 7 days; ≥3 matches in the same class → write a
`corrections` row.

**Feedback Queue** — `feedback_queue`. Krish's rejections + comments.
Fuel for the learning loop. Consumed by Vera Feedback Aggregation
(Sun 06:00 UTC).

**Felix** — The enterprise sales pipeline agent. Receives warm paths
from Zara; runs Apollo enrichment, drafts proposals, tracks deals.

**Flag** — A CEO-initiated note against an agent indicating something
needs attention. Surfaced via `PendingFlagModal` on next session start.
Cannot be silently dismissed.

**Flow** — Synonym for an N8N workflow. The Flows tab lists them grouped
by `workflow_id`.

---

## G

**Goal** — A row in the `goals` table representing a measurable target
for a period (weekly / monthly / quarterly). Surfaced on Home with a
progress bar.

**Growth (pod)** — One of the three primary pods. Owns revenue, pipeline,
visibility, and content. Members: Cleo, Felix, Maya, Nell, Nova, Zara,
Hunter.

**Guest** — A row in the `guests` table. A podcast guest candidate for
Builder Economy or Signal & Noise. Lifecycle: `new` → `enriched` →
`confirmed` → `done` (or `skipped`). Replaces the deprecated
`nell_candidates` table (dropped in PR #56).

---

## H

**Home Intelligence** — The singleton row in `home_intelligence` keyed
by `id='current'`. Contains the headline, body, recommended-focus
summary, KPI metrics, external signals, customer signals, customer
voice, and Marcus's COO surfaces (`daily_brief`, `weekly_retro`,
`monday_premortem`). Refreshed by Marcus's synthesis workflows.

**Hunter** — Agent. Daily job sourcing + application specialist. Scans
boards at 08:00 UTC, scores roles against Krish's rubric (only 9-10/10
reach Krish).

---

## I

**Intel (tab)** — User-facing name for the strategic-metrics tab.
Implemented as `DesktopExec.tsx` and routed under the `exec` tab id.
Hosts the AskMarcus chat surface.

**Intelligence feed** — The chronological stream of `audit_log` rows
shown on the Intel tab. Same source as Live Activity, different framing.

---

## K

**Kai** — The integrations / technical-architecture agent. Owns
credential health, workflow health, API quirks (kept in
`system_config.known_quirks`).

**KPI strip** — The metric tile row near the top of Home / Intel. Sourced
from `home_intelligence.metrics`. Collapses entirely when empty.

**Krish** — The CEO. The only intended user of Control Center. Audit-log
actor for every manual action (`actor='krish'`).

---

## L

**Lane** — A column on the Leads tab. One per active row in
`venture_registry` (`mindmaker`, `signal_noise`, `builder_economy`).
Rendered by `LeadVentureLane`.

**Lead** — A row in the `leads` table. A sales prospect with
`assignee_agent`, `tags[]`, per-venture `icp_scores` jsonb,
`primary_venture` (FK), `fit_score`, `attainability_score`,
`promoted_task_id`, `deep_enriched_at`.

**Live Activity** — The realtime activity feed on Home. Subscribes to
`audit_log` INSERTs.

---

## M

**Mandate** — The operating charter section of an agent's brief. Defines
what the agent is allowed and required to do.

**Marcus** — The synthesis agent. Refreshes Home Intelligence
(Mon/Wed/Fri + Sunday deep) and writes the daily brief, Friday retro,
and Monday pre-mortem.

**Mindmaker OS** — The broader autonomous-organisation platform Control
Center is the dashboard for. Canonical architecture lives in
`MINDMAKER_OS_ARCHITECTURE.md` on the VPS workspace root.

**Mission** — The one-paragraph north star of an agent's brief.

**Monitor (agent type)** — An agent whose job is continuous health or
audit. Examples: Vera, Arlo, Kai. Monitors should rarely surface unless
something is wrong.

**MrrTicker** — Live MRR tile on Home and Customers. Sums
`customers.mrr_usd` where `customer_kind='paid'`.

---

## N

**N8N** — The workflow orchestration engine that hosts agent
automations. ~76 workflows on the production tenant
(`krishraja10101.app.n8n.cloud`). Reachable via webhooks fired from
Supabase or from Control Center's `/api/*` routes.

**Nell** — The outbound + podcast-guest-booking agent. Owns Apollo
enrichment, cold sequences via Instantly, and the Guest pipeline.

**Nova** — The visibility + speaking agent. Runs the weekly Visibility
Sweeper (Mon 11:00 UTC, Perplexity sonar-pro → Sonnet 4.6).

---

## O

**Operations (pod)** — One of the three primary pods. Runs the machine —
infrastructure, quality, product, revenue ops. Members: Vera, Leo,
Priya, Arlo, Kai.

**Orchestrator** — Central N8N webhook router
(`u0kIULJBJL4dGcuR`, `/webhook/mindmaker-orchestrator`) that dispatches
Control Center events to the right agent workflow.

---

## P

**Pod** — Organisational grouping for agents. Three primary pods:
Executive, Operations, Growth. Render order is fixed top-to-bottom on
the Org tab.

**Priority** — Task urgency tier. Recognised values: `critical`,
`urgent`, `high`, `medium`, `normal`, `low`. Drives the Needs You
ranking on Home.

**`priority_override`** — Integer column on `tasks` for manual CEO
boosting. Higher values rank earlier within the same priority tier.

**Primary Venture** — The `primary_venture` FK on `leads` and `guests`.
Drives which lane the row appears in on the Leads / Guests tabs.

**Proposal** — A workflow improvement suggested by an agent. Lives in
`workflow_proposals`. Awaits Krish approve / reject on the Flows tab.

---

## Q

**Quick Capture Idea** — The Cmd+I surface available on every tab.
POSTs to the Cleo idea-capture webhook (Sonnet 4.6 extractor) and either
inserts into `content_ideas` or logs a skip.

---

## R

**Realtime** — Supabase `postgres_changes` subscriptions. The UI joins
one shared channel per table (`tasks-rt-shared`, `leads-rt-shared`,
etc.) and fans updates out. ADR-002.

**Revenue Pulse** — The headline + body + recommended-focus block on
Home. Sourced from `home_intelligence.summary`. Stored as JSON-encoded
text and parsed defensively.

**RLS** — Row Level Security. Postgres-level access control. Enabled on
every Supabase table. `anon` reads (for the dashboard), `service_role`
writes (for the OS).

---

## S

**Signal & Noise** — The podcast brand for AI in media. Slug
`signal_noise` in `venture_registry`. Co-founded with Rio Longacre +
Brett House.

**Silent Failure** — A row in the `silent_failures` table. A workflow
that ran without erroring but produced no actual value. Tiered 1-4 by
detection mechanism (completeness contract / Silent Success Detector /
Critical Infrastructure Monitor / Failure Pattern Sweep). Tier 3
surfaces on Home as the CriticalAlertBanner.

**Silent Success Detector** — N8N system workflow, 4h cadence. Tier 2
of the self-healing system. For each (workflow_id, ok=true) run in the
last 4h, checks for zero downstream effects in the target table; writes
a tier-2 silent_failures row if so.

**Slug** — The lowercase, alphanumeric identifier for an agent. Stored
as `agents.id`. The single canonical token used to join across tables.
See [Slug-as-Key](./AGENTS.md#slug-as-key).

**SLI** — Service Level Indicator. A measurable signal of system
behaviour. Listed in [`OBSERVABILITY.md`](./OBSERVABILITY.md).

**Split pane** — Master-detail layout primitive used by Today, Plans,
and Org. See [`COMPONENTS.md`](./COMPONENTS.md).

**Standards Registry** — Supabase `standards_registry`. ~167 behavioural
rules enforced fleet-wide. Rendered nightly to `hot/standards-digest.md`
on the VPS. Loaded on agent session wake; enforced by `deliver_gate.py`
before any output ships.

**Sweeper** — A workflow that polls something on a cron (Maya for
customer Supabases nightly; Deep Enrich Retry hourly; Nova Visibility
weekly).

**Sync pipeline** — The VPS-hosted process that pushes a snapshot of
external task state into Supabase via `POST /api/sync`. Authenticated
with `SYNC_SECRET`.

**System (actor)** — The `audit_log.actor` value used for unattended
jobs that are not attributable to an individual agent. Example: drive
sync runs.

**Systems (tab)** — The infrastructure-health tab. Renders from
`system_health`, `credential_health`, `silent_failures`, and the live
`/api/health` snapshot.

---

## T

**Tab** — A top-level section of the UI. The eleven tabs are Home,
Today, Leads, Customers, Guests, Content, Bets, Org, Intel (routed as
`exec`), Flows (routed as `workflows`), Systems. Routed via `App.tsx`.

**Task** — A unit of work. The primary row in the `tasks` table. Lives
through statuses `active → in_progress → waiting → blocked → done`,
with branches into `pending-agatha-review`, `pending-review`, `paused`,
`superseded`. Also carries `lever_score` and `est_hours_to_revenue`
(PR #47) for anti-busywork rating.

**Today** — The "what needs you before EOD" tab. Splits into Due and
Waiting on You.

**Token** — In the slug-expansion sense: any of the candidate strings
(`id`, `name`, lowercased variants) the UI uses when querying with
`.in()` to tolerate legacy data.

---

## U

**Unknown (health)** — The fourth status value used when a component
cannot be checked. Excluded from the worst-component overall rollup.

---

## V

**Venture** — A business project. Eight active rows in `ventures` cover
the full portfolio (Mindmaker, Meliora, AdFixus, mm-ctrl, Fractionl
Circle, Fractionl Pulse, OnAlert, Gutted, Merciless). Plus content
brands (Builder Economy, Signal & Noise, personal brand). Techonomic was
retired 2026-08-06 and folded into Mindmaker LIVE.

**Venture Registry** — The 3-row `venture_registry` table
(`mindmaker`, `signal_noise`, `builder_economy`) that drives multi-tag
leads and per-venture lanes on Leads.

**Vera** — The Chief of Staff / Quality agent. Owns standards
compliance, drift detection, and audit closure. Runs daily,
deep audit Fridays, feedback aggregation Sundays, failure pattern sweep
Sundays.

**Verify (CI job)** — The single CI job (`.github/workflows/ci.yml`).
Runs `npm ci`, `npm run lint`, `npx tsc --noEmit`.

**Vercel** — The hosting platform. Provides the Vite-built static UI and
the `/api/*` serverless functions.

**Visibility Target** — A row in `visibility_targets`. A speaking or PR
opportunity. Replaces the deprecated `nova_target_conferences` table
(dropped in PR #56).

---

## W

**Webhook (pg_net)** — Supabase's outbound HTTP mechanism. Fires N8N
workflows in response to row changes.

**Workflow** — An N8N automation owned by an agent. Identified by
`workflow_id`; many runs per workflow over time.

**`workflow_runs`** — Append-only log of every N8N execution. Joined to
agents via `agent_id` (legacy `agent` for pre-2026-04-15 rows).

---

## Z

**Zara** — The signal intelligence agent. Runs the daily signal sweep
(Mon-Fri 10AM), feeds warm paths to Felix, and seeds content ideas to
Cleo.
