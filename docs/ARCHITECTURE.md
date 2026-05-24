# Architecture & Engineering Contract

> **Scope.** The data contracts, control flows, and global deployment facts
> of the Control Center repo. Dictates **what** the UI is allowed to do,
> not how it looks. UI-level surface specs live in [`PRODUCT.md`](./PRODUCT.md);
> schema details live in [`DATABASE.md`](./DATABASE.md); broader-OS
> architecture (agent fleet, cron topology, self-healing tiers) lives in
> the canonical `MINDMAKER_OS_ARCHITECTURE.md` on the VPS workspace root.
>
> **Update protocol.** This document describes the Control Center *as it
> exists today*. If you are tempted to describe the OS as a whole, edit the
> canonical OS doc instead and link out from here.

## 1. The OS in one paragraph

Mindmaker OS is a fleet of AI agents (~14 production roles, ~76 N8N
workflows, 7 Claude Code agents) that runs Krish Raja's business
portfolio. **Supabase is the single source of truth** — every piece of
state, agent identity, sprint plan, task, lead, guest, customer, bet,
standard, audit row, silent failure, lives in one Postgres database (~60
tables). **The Control Center is the dashboard slice** — a React + Vite +
TypeScript app at `controlcenter.krishraja.com` that reads Supabase via
Postgres Realtime and writes back through the anon key or thin Vercel
serverless functions. **N8N is the execution layer** — workflows that fire
on cron or webhook, do the work, write the result back to Supabase. The
Control Center never talks to the VPS or N8N directly; every cross-system
communication goes through Supabase.

## 2. Repo boundary

The repo owns:

- The React UI under `src/` (11 tabs, hash-routed, desktop + mobile
  variants).
- Vercel serverless functions under `api/` (read augmentation, service-role
  writes, webhook triggers).
- Supabase migration SQL under `supabase/migrations/`.
- N8N workflow JSON dumps under `n8n/workflows/` and `scripts/n8n/`
  (canonical source of truth for diffing against live workflows).
- Cron definitions under `scripts/cron/`.
- This documentation tree.

The repo does **not** own:

- Agent identities (`agents.brief_content` in Supabase — edit in DB, not
  here).
- The N8N runtime (lives at `krishraja10101.app.n8n.cloud`).
- The OpenClaw runtime on the VPS (lives at `/root/.openclaw/`).
- The canonical OS architecture doc (lives at
  `/root/.openclaw/workspace/MINDMAKER_OS_ARCHITECTURE.md`).
- Standards (`standards_registry` in Supabase, rendered nightly to
  `hot/standards-digest.md`).

## 3. Global facts

### 3.1 Single source of truth

- **Agent IDs and fleet composition.** The canonical SSOT for the agent
  roster is the Supabase `agents` table. The frontend does not hard-code
  agent IDs; it pulls the active set dynamically. See
  [`AGENTS.md#slug-as-key`](./AGENTS.md#slug-as-key) for the cross-table
  join key rule.
- **Workflow names.** The N8N convention is `Agent | Venture | Function`.
  Downstream displays parse on those segments.
- **Standards.** ~167 behavioural rules live in `standards_registry`;
  rendered nightly to `hot/standards-digest.md` on the VPS, loaded on
  agent session wake, enforced by `deliver_gate.py` before any output
  ships. Control Center surfaces standards compliance indirectly through
  Vera's audit signals in `audit_log`.

### 3.2 Deployment

- **Auto-deploy from `main`.** Push to `main` → Vercel deploys. Never use
  the Vercel CLI directly (the project setting bans it as a habit — config
  drift is the only risk).
- **ESM imports require `.js` extension.** Because `package.json` declares
  `"type": "module"`, every relative import inside `api/` must use the
  `.js` extension (e.g. `import { supabase } from './_supabase.js'`).
  Without it, Vercel returns a silent 500 on the deployed function.
- **Git author identity is fixed.** Every commit must be authored as
  `Krish Raja <hello@krishraja.com>` (standards V-004 / GIT-001 in the
  OS standards registry).
- **CI gates merges.** `.github/workflows/ci.yml` runs `npm ci`,
  `npm run lint`, `npx tsc --noEmit` on every PR. `--max-warnings 0` on
  lint — a warning fails CI.

### 3.3 Authentication

- **Reads** use the anon key + RLS. RLS is enabled on every table; the
  `anon` role has SELECT on the dashboard-facing tables and views.
- **Writes** from the browser use the anon key when the table's RLS
  permits, and route through `/api/*` when service-role context is
  required (e.g. mutations that need to bypass RLS or trigger an N8N
  webhook).
- **Inbound writes from the OS** (sync pipeline on the VPS) hit `/api/sync`
  and `/api/sync-brief`, guarded by `SYNC_SECRET` in the `Authorization`
  header.

### 3.4 Realtime

The dashboard subscribes to Postgres Realtime via
`@supabase/supabase-js`. Hot subscriptions:

| Hook | Table / view | Channel |
|---|---|---|
| `useRealtimeTasks` | `tasks` | `tasks-rt-shared` (one channel, fanned out — see ADR-002) |
| `useRealtimeLeads` | `leads` | `leads-rt-shared` |
| `useRealtimeGuests` | `guests` | `guests-rt-shared` |
| `useVisibilityTargets` | `visibility_targets` | `visibility-rt-shared` |
| `useCustomers` | `customers` | `customers-rt-shared` |
| `useRealtimeDecisionsWaiting` | `decisions_waiting` (view) | `decisions-rt-shared` |
| `useCriticalAlerts` | `silent_failures` filtered to tier 3 | `critical-alerts` |

**Hard rule.** Open one channel per table per browser session and fan it
out via context / hooks. Opening a second channel for the same table is a
performance bug. See ADR-002.

## 4. Tab-by-tab data contracts

### 4.1 Home

- **Reads:** `decisions_waiting` (the unified Postgres view),
  `home_intelligence` (`id='current'`), `silent_failures` (tier 3),
  `customers` (for MrrTicker), `bets` (for streak pills), `goals` (top 6),
  `audit_log` (top 30 for the collapsed activity feed).
- **Writes:** No direct mutations from Home itself. Decisions on rows in
  the panel route to the appropriate tab handler. The `CriticalAlertBanner`
  is a read-only consumer of tier-3 `silent_failures`.
- **Failure modes:** Empty `home_intelligence` → falls back to empty
  briefing state. Realtime failure → degrades to a one-shot read on
  mount. `decisions_waiting` view error → panel renders the empty
  state with a "view unreachable" caption (not a spinner).

### 4.2 Today

- **Reads:** `tasks` via `useRealtimeTasks` (shared channel; see ADR-002).
- **Writes:** Status transitions (`active`, `in_progress`, `waiting`,
  `blocked`, `done`), `krish_reviewed=true`, `krish_notes`, `next_step`,
  `due_date`. Inserts into `corrections` when a hard pivot is needed.
- **Failure modes:** Errors are caught by `ErrorBoundary` and surfaced as
  a retry CTA.

### 4.3 Leads (post-PR #53)

- **Reads:** `leads` with `assignee_agent`, `tags[]`, `icp_scores` (jsonb,
  per-venture), `primary_venture` (FK → `venture_registry`); plus
  `venture_registry` (3 rows) for lane definitions.
- **Writes:** Promote (creates a `tasks` row owned by `assignee_agent`,
  sets `leads.promoted_task_id`), reassign (`assignee_agent`), schedule
  follow-up (`leads.follow_up_at`), deep enrich (fires
  `/webhook/lead-deep-enrich` via the Orchestrator, mutates
  `leads.fit_score / icp_scores / attainability_score / why_relevant /
  primary_tension / next_step / deep_enriched_at`).
- **Failure modes:** Empty primary venture → lead surfaces in the "Other"
  bucket. Webhook failure → row stays unenriched; the hourly Deep Enrich
  Retry Sweep picks it up.

### 4.4 Customers (post-PR #43 / #45)

- **Reads:** `customers` (with `customer_kind` enum:
  `paid`/`free_signup`/`trial`/`waitlist`/`churned`, `customer_product`
  enum across 6 products, `mrr_usd`, attribution columns); `customer_contacts`
  (one row per conversation, read for CustomerCouncilCard).
- **Writes:** `customer_contacts` inserts (logged conversations). No direct
  mutations to `customers` from the UI — that table is owned by Stripe
  webhooks and Maya's nightly sweeper.
- **Failure modes:** Missing attribution → row renders with "channel
  unknown".

### 4.5 Guests (post-PR #52)

- **Reads:** `guests` with `podcast_target` (`builder-economy` /
  `signal-and-noise`), `status` (`new`/`enriched`/`confirmed`/`skipped`/
  `done`), `pitch_draft`, `suggested_angles` (jsonb), `deep_enriched_at`;
  `visibility_targets` for the visibility tab variants.
- **Writes:** Confirm (sets `status='confirmed'`, triggers Nell Guest
  Confirmed Cascade — 3 tasks + 3 promo drafts + Gmail draft), Skip (sets
  `skipped_at`), Deep enrich (fires `/webhook/guest-deep-enrich`), edit
  pitch.
- **Failure modes:** Cascade failure → tasks/promos missing; the cascade
  workflow is idempotent and can be re-fired by re-confirming.

### 4.6 Content

- **Reads:** `content_ideas` (status enum: `pending`, `accepted`,
  `rejected`, `published`).
- **Writes:** Accept / reject / edit / promote-to-task. New ideas captured
  via `QuickCaptureIdea` (Cmd+I) which POSTs to the Cleo idea-capture
  webhook (Sonnet 4.6 extractor; see PR #51).
- **Failure modes:** Webhook 5xx → idea is queued client-side until the
  webhook recovers (toast on failure).

### 4.7 Bets (post-PR #44)

- **Reads:** `bets` (title, hypothesis, `time_box_days`,
  `est_mrr_impact_usd`, `status` enum: `live`/`won`/`lost`/`partial`,
  learning text, `actual_mrr_impact_usd`).
- **Writes:** Place bet (insert), close bet (status + learning +
  `actual_mrr_impact_usd`).
- **Failure modes:** None notable; bets are append-mostly.

### 4.8 Org

- **Reads:** `agents` (`active=true`, ordered by `pod`), plus per-agent
  `audit_log` / `workflow_runs` for the detail drawer.
- **Writes:** Inline brief editor writes to `agents.brief_content` via
  `/api/sync-brief`. Flag opens `FlagAgentModal`. Trigger fires
  `/api/trigger-agent` → inserts a `tasks` row → pg_net → N8N.
- **Failure modes:** Empty agent activity ≠ broken agent (coordinators
  legitimately have zero `workflow_runs`). See
  [`AGENTS.md#agent-taxonomy`](./AGENTS.md#agent-taxonomy).

### 4.9 Intel (routed as `exec`)

- **Reads:** `home_intelligence.metrics`, `zara_signals`,
  `marcus_synthesis`, `audit_log` (top 20), `workflow_runs` (top 20),
  `customers`, `leads`, `bets` (grounding context for AskMarcus).
- **Writes:** AskMarcus POST → `/api/ask-marcus` (Anthropic-backed Q&A
  grounded in customers/leads/bets/home_intelligence). No DB mutations.
- **Failure modes:** Anthropic API error → toast + empty response. Missing
  grounding data → answer flags low confidence.

### 4.10 Flows (workflow health + proposals)

- **Reads:** `workflow_runs` (top 50, normalised to backfill
  `agent_id ||= agent` for pre-2026-04-15 legacy rows); `workflow_proposals`
  where `status='pending'`.
- **Writes:** Proposal approve / reject (updates `status`, `approved_by`,
  `approved_at`).

### 4.11 Systems

- **Reads:** `system_health`, `credential_health`, `silent_failures`
  grouped by tier.
- **Writes:** None. Remediation is owned by Arlo / Kai out-of-band.

## 5. The control flow (Krish acts → OS reacts)

1. **User action.** Krish clicks Approve / Reject / Promote / Confirm /
   Deep enrich / Place bet.
2. **Supabase mutation.** The UI updates the relevant row, either via the
   anon key + RLS or through an `/api/*` Vercel function when service-role
   context is required.
3. **Webhook trigger.** Supabase `pg_net` (or an explicit `/api/*` route)
   posts to the **Orchestrator** (N8N workflow `u0kIULJBJL4dGcuR`,
   `/webhook/mindmaker-orchestrator`).
4. **Routing.** The Orchestrator routes by event type to the right
   downstream workflow (e.g. `approve` → Krish Approval Callback →
   LinkedIn Distribution; `deep_enrich_lead` → Agatha Lead Deep Enrich;
   `confirm_guest` → Nell Guest Confirmed Cascade).
5. **Agent execution.** The workflow runs, calls the LLM tier appropriate
   to the job (Sonnet 4.6 for substance, Haiku 4.5 for classification),
   writes the result back to Supabase.
6. **Realtime echo.** The UI's subscription receives the change and the
   relevant component re-renders within a tick.

**Hard rule.** No content publishes without explicit Krish approval. The
LinkedIn Distribution endpoint is guarded by `X-Agatha-Secret`; only the
Krish Approval Callback workflow holds the header. Standards PUB-001 /
PUB-005.

## 6. Background services

| Service | Cadence | Purpose |
|---|---|---|
| `cc-sync-engine.sh` (VPS) | 5 min | Refresh `home_intelligence`, poll N8N workflow status, flag stale tasks, write audit trail |
| `cc-doc-creator.sh` (VPS) | 15 min | For any task with `description` but no `link_primary`, create a Google Doc and write the URL back |
| `cc-task-router.sh` (VPS) | On-demand | Route ad-hoc chat instructions into the `tasks` table |
| `poll_sync_queue.py` (VPS) | 5 min | Drain `sync_queue` for cross-system reconciliation |
| `render-identity.py` (VPS) | 15 min | Render `agents.brief_content` → `~/.openclaw/skills/agent-{id}/SKILL.md` |
| Critical Infrastructure Monitor (N8N) | 5 min | Tier 3 self-healing: credential health, RLS denials, system_health |
| Silent Success Detector (N8N) | 4 hr | Tier 2 self-healing: workflows that ran ok=true but produced zero downstream effects |
| Deep Enrich Retry Sweep (N8N) | hourly | Picks up `status='new'` leads / guests / visibility targets and re-fires the appropriate enrich endpoint |
| Vera Feedback Aggregation (N8N) | Sun 06:00 UTC | Group `feedback_queue` rejections (≥3 matches, confidence > 0.8) into `corrections` |
| Vera Failure Pattern Sweep (N8N) | Sun 07:00 UTC | Tier 4 self-healing: pattern-mine `silent_failures` into `corrections` |
| Agatha Weekly Plan Refresh (N8N) | Mon 09:00 UTC | Refresh all 14 `agent_plans` rows via Sonnet 4.6 |

The Control Center itself runs none of these — they are part of the OS
infrastructure. The dashboard consumes their outputs. See
`MINDMAKER_OS_ARCHITECTURE.md` §8 for the full cron topology.

## 7. Non-obvious invariants

The following must hold; violations are bugs.

1. **Every cross-table agent reference uses the lowercase slug** stored in
   `agents.id`. Mixed-case writes fragment join results. See
   [`AGENTS.md#slug-as-key`](./AGENTS.md#slug-as-key).
2. **Empty ≠ broken.** Every empty state must distinguish "nothing
   happened yet" from "failed to load." A spinner is never an acceptable
   empty state.
3. **One realtime channel per table.** ADR-002. Open it once, fan out.
4. **No silent legacy-column drop.** Schema migrations that rename
   columns must read both old and new until the legacy column is dropped
   (`agent_id ||= agent`, `cost_usd ||= cost`, `run_at ||= started_at`).
5. **Action provenance.** Every Krish action writes an `audit_log` row
   with `actor='krish'` and a meaningful `event_type`.
6. **Viewport-fit at 1280×800.** Every primary tab must fit without page
   scroll; sub-panels scroll internally.
7. **Decisions waiting is unified.** New surfaces add a `UNION ALL` branch
   to the `decisions_waiting` view, not a sibling panel on Home.

## 8. Failure mode quick-reference

| Symptom | First place to look | Healer |
|---|---|---|
| Tab won't load | Browser console + Vercel logs | Push a fix to `main` (auto-deploys) |
| Action fails silently | Supabase logs + `audit_log` | Check RLS policy, check `/api/*` function logs |
| Realtime stops updating | Supabase project status + browser console | Re-subscribe on `visibilitychange` |
| Workflow row shows error | `workflow_runs.error_message` + N8N executions API | Kai (every 4h Dependency Mapper) |
| Workflow ran but no value | `silent_failures` (tier 1 or 2) | Silent Success Detector (4h) → Failure Pattern Sweep (weekly) |
| Credential expired / RLS denying | `silent_failures` (tier 3) + `credential_health` | Critical Infrastructure Monitor (5m) → CriticalAlertBanner |
| Agent output the wrong shape | `feedback_queue` after rejection | Vera Feedback Aggregation Sun 06:00 → Agatha brief edit |
| Build broken | Vercel deployment log | Push fix; if upstream Vercel issue, see DEPLOYMENT.md |
| Cron missed | `audit_log` actor=cron | Silent Success Detector backstop |
| ESM 500 on a function | Vercel function log shows `ERR_MODULE_NOT_FOUND` | Add `.js` to the relative import |

For OS-wide failure modes (drift between SKILL.md and `brief_content`,
standards drift, cron-job time skew on the VPS), see
`MINDMAKER_OS_ARCHITECTURE.md` §12.
