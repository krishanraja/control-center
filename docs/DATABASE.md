# Database Schema

> **Scope.** The Supabase tables and views Control Center actually reads
> and writes. The wider OS uses ~60 tables — only the ones surfaced by
> Control Center are documented in detail here. For the canonical
> full-fleet schema, see `MINDMAKER_OS_ARCHITECTURE.md` §3 on the VPS
> workspace root.

## Overview

Control Center uses Supabase PostgreSQL with Realtime subscriptions. All
tables support `postgres_changes` for live UI updates. Every table has
RLS enabled.

**Project:** `gojpffsrxybbpbdzzrvs`
**URL:** `https://gojpffsrxybbpbdzzrvs.supabase.co`

---

## Identity and roster

### `agents`

Agent profiles and pod assignments.

| Column | Type | Description |
|---|---|---|
| `id` | text | Primary key — lowercase slug (e.g. `cleo`). Join key on `tasks.agent`, `workflow_runs.agent_id`, `audit_log.actor`, `leads.assignee_agent` |
| `name` | text | Display name (e.g., "Cleo") |
| `role` | text | Job title |
| `pod` | text | Pod assignment (`executive`, `ops`, `growth`) |
| `active` | bool | Is the agent in the active roster |
| `mandate` | text | Operating charter |
| `mission` | text | One-paragraph north star |
| `personality` | text | Voice + tone snippet |
| `brief_content` | text | Long-form brief; rendered to `~/.openclaw/skills/agent-{id}/SKILL.md` on the VPS |
| `brief_updated_at` | timestamp | Last brief write |
| `brief_checksum` | text | Content hash for drift detection |
| `last_run` | timestamp | Last known workflow execution |
| `last_output` | text | Last output summary |
| `expected_runs_per_day` | int | Expected cadence; null for Coordinators |
| `created_at` | timestamp | |

See [`AGENTS.md`](./AGENTS.md) for the canonical 14-agent roster and the
slug-as-key rule.

### `ventures` / `venture_registry`

- **`ventures`** — 8 active rows covering the full portfolio (Mindmaker,
  Meliora, AdFixus, mm-ctrl, Fractionl Circle, Fractionl Pulse, OnAlert,
  Gutted, Merciless).
- **`venture_registry`** — 3-row table (`mindmaker`, `signal_noise`,
  `builder_economy`) that drives multi-tag leads and per-venture lanes
  on the Leads tab.

---

## Tasks and plans

### `tasks`

The primary work item table. Tasks represent actionable items assigned
to agents or waiting for human review.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `title` | text | Task title |
| `description` | text | Detailed description |
| `status` | text | `active`, `in_progress`, `waiting`, `blocked`, `done`, `pending-agatha-review`, `pending-review`, `paused`, `superseded` |
| `owner` | text | Human owner (e.g., `krish`) |
| `agent` | text | Assigned agent slug |
| `next_step` | text | Current action required |
| `priority` | text | `critical`, `urgent`, `high`, `medium`, `normal`, `low` |
| `priority_override` | int | Manual priority boost |
| `group_label` | text | Grouping / category |
| `workstream` | text | Business workstream (`content`, `advisory_sales`, `podcast_booking`, etc.) |
| `krish_notes` | text | CEO notes |
| `krish_reviewed` | bool | Has CEO reviewed |
| `due_date` | timestamp | Due date |
| `created` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |
| `started_at` | timestamp | Auto-stamped on transition to `in_progress` (DB trigger) |
| `completed_at` | timestamp | Auto-stamped on transition to `done` (DB trigger) |
| `notes` | text | General notes |
| `feedback_text` | text | Feedback from agents |
| `link_primary` | text | Primary document URL (Google Doc, etc.) |
| `link_secondary` | text | Secondary document URL |
| `evidence` | text | Evidence/artifact path |
| `venture_id` | text | Associated venture |
| `lever_score` | int | 0-10 anti-busywork rating (PR #47) |
| `est_hours_to_revenue` | numeric | Estimated path to revenue impact (PR #47) |
| `source` | text | Origin tag (`manual`, `cron`, `agent`, etc.) |

### `goals`

Weekly/monthly goals with progress tracking.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `title` | text | Goal title |
| `current` | text | Current status description |
| `progress` | int | Progress percentage (0-100) |
| `status` | text | `active`, `done`, `paused` |
| `period` | text | `weekly`, `monthly`, `quarterly` |
| `team_focus` | text | "This week's focus" string for the OS Mission card |
| `created_at` | timestamp | |

### `agent_plans`

One sprint plan per agent (14 rows). Refreshed weekly by Agatha Weekly
Plan Refresh (Mon 09:00 UTC, Sonnet 4.6).

| Column | Type | Description |
|---|---|---|
| `agent_id` | text | FK → `agents.id` |
| `current_phase` | text | e.g. `Week 3 / Sprint 12` |
| `objective` | text | The current phase's outcome |
| `blockers` | text | Active blockers |
| `next_milestone` | text | What ships next |
| `progress_pct` | int | 0-100 |
| `doc_link` | text | Google Doc URL for the long-form plan |
| `last_rendered_at` | timestamp | Used to detect plan staleness (>72h → READ-ONLY) |

---

## Pipeline tables (post-rebuild)

### `leads` (PR #41, #53)

Sales pipeline. Multi-tag, per-venture ICP scoring.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `assignee_agent` | text | FK → `agents.id` |
| `primary_venture` | text | FK → `venture_registry.slug` — drives the lane on the Leads tab |
| `tags` | text[] | Multi-venture tags (e.g. `['mindmaker_buyer','signal_noise_guest']`) |
| `icp_scores` | jsonb | Per-venture ICP scores `{ mindmaker: 87, signal_noise: 62 }` |
| `icp_score` | int | Legacy single-value column; reads should prefer `icp_scores` |
| `fit_score` | int | 0-100 LLM-rated fit |
| `attainability_score` | int | 0-100 LLM-rated reach difficulty |
| `tier` | text | A/B/C tier |
| `why_relevant` | text | LLM-emitted relevance rationale |
| `primary_tension` | text | Buyer pain point |
| `next_step` | text | Recommended next action |
| `follow_up_at` | timestamp | Scheduled follow-up time |
| `promoted_task_id` | uuid | FK → `tasks.id` (set when promoted) |
| `deep_enriched_at` | timestamp | Last deep-enrich pass |
| `created_at` | timestamp | |

### `guests` (PR #52)

Podcast guest candidates for Builder Economy and Signal & Noise.
Replaces the dropped `nell_candidates` table.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Guest name |
| `email` | text | Contact email (used for dedupe) |
| `org` | text | Guest's company / role context |
| `podcast_target` | text | `builder-economy` or `signal-and-noise` |
| `status` | text | `new`, `enriched`, `confirmed`, `skipped`, `done` |
| `pitch_draft` | text | LLM-drafted outreach pitch (Sonnet 4.6, Krish voice) |
| `suggested_angles` | jsonb | Episode angles `[{ title, hook, why_now }, ...]` |
| `scheduled_task_id` | uuid | FK → `tasks.id` (set by Guest Confirmed Cascade) |
| `skipped_at` | timestamp | |
| `deep_enriched_at` | timestamp | |
| `cascade_fired_at` | timestamp | Set when the confirm cascade has run |
| `created_at` | timestamp | |

### `visibility_targets` (PR #52)

Speaking and PR opportunities. Replaces the dropped
`nova_target_conferences` table.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Conference / publication name |
| `kind` | text | `conference`, `podcast`, `pr_outlet`, `award` |
| `status` | text | `new`, `enriched`, `accepted`, `declined`, `done` |
| `fit_score` | int | LLM-rated fit |
| `why_relevant` | text | Rationale |
| `suggested_angle` | text | Why Krish + why now |
| `deep_enriched_at` | timestamp | |
| `created_at` | timestamp | |

### `content_ideas`

Cleo's idea backlog. Written by the Cleo Content Idea Capture workflow
(Sonnet 4.6 extractor; PR #51), the Layer 1 Signal Inbox, and the
Guest Confirmed Cascade.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `idea` | text | One-line idea |
| `thesis` | text | Sharp POV / claim |
| `distribution` | text[] | Channels (whitelist: `linkedin`, `newsletter`, `signal-noise-pod`, `builder-economy-pod`, `techonomic`, `x`) |
| `confidence` | numeric | 0-1, hard contract `>= 0.5` for insert |
| `quality_score` | text | `green` / `amber` / `red` |
| `status` | text | `pending`, `accepted`, `rejected`, `published` |
| `source_type` | text | `agatha_chat`, `cleo_chat`, `signal_inbox`, etc. |
| `source_ref` | text | Origin reference (telegram message id, doc id, etc.) |
| `created_at` | timestamp | |

---

## Revenue tables (PR #43, #44, #45)

### `customers`

Cross-product customer ledger. Owned by Stripe webhooks + Maya
Customer Acquisition Sweeper (nightly).

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `customer_kind` | enum | `paid`, `free_signup`, `trial`, `waitlist`, `churned` |
| `customer_product` | enum | `mindmaker`, `mm_ctrl`, `fractionl_circle`, `fractionl_pulse`, `onalert`, `gutted`, `merciless` |
| `email` | text | (lowercased; dedupe key) |
| `name` | text | |
| `mrr_usd` | numeric | Per-customer MRR contribution |
| `stripe_customer_id` | text | (dedupe key) |
| `attribution_lead_id` | uuid | FK → `leads.id` |
| `attribution_task_id` | text | FK → `tasks.id` |
| `attribution_channel` | text | `cold_email`, `podcast`, `content`, `referral`, `direct`, `unknown` |
| `attribution_confidence` | numeric | 0-1 |
| `signup_at` | timestamp | |
| `churned_at` | timestamp | |
| `tenure_days` | int | Computed |
| `created_at` | timestamp | |

**Dedupe indexes:** `(customer_product, stripe_customer_id)` and
`(customer_product, lower(email))`.

### `customer_contacts`

One row per logged conversation with a customer. Feeds the
CustomerCouncilCard and Marcus's `customer_voice` synthesis.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `customer_id` | uuid | FK → `customers.id` |
| `contact_kind` | text | `exit_interview`, `check_in`, `expansion`, `support`, `nps` |
| `summary` | text | One-paragraph summary |
| `quote` | text | Verbatim if striking |
| `contacted_at` | timestamp | |
| `contacted_by` | text | `krish` or agent slug |

### `bets`

Falsifiable business hypotheses tracked on the Bets tab.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `title` | text | |
| `hypothesis` | text | If we do X, Y will happen |
| `time_box_days` | int | |
| `est_mrr_impact_usd` | numeric | |
| `status` | text | `live`, `won`, `lost`, `partial` |
| `learning` | text | What we learned when closing |
| `actual_mrr_impact_usd` | numeric | Set when closing |
| `opened_at` | timestamp | |
| `closed_at` | timestamp | |

---

## Home + intel

### `home_intelligence`

Singleton row keyed by `id='current'`. Drives the Home feed.

| Column | Type | Description |
|---|---|---|
| `id` | text | Always `current` |
| `summary` | text | JSON-encoded `{ headline, body, recommended_focus }` (parse defensively — stored as text, not jsonb) |
| `metrics` | jsonb | KPI tile array `[{ id, label, value, progress_pct, sub? }]` |
| `external_signals` | jsonb | Signals surfaced by Marcus + deterministic overdue-leads insert |
| `customer_signals` | jsonb | Customer-side roll-up (deterministic fetch by Marcus) |
| `customer_voice` | jsonb | Themes mined from `customer_contacts` (last 7 days) |
| `daily_brief` | jsonb | Marcus's daily COO brief (PR #46) |
| `daily_brief_at` | timestamp | |
| `weekly_retro` | jsonb | Friday retro (PR #46) |
| `weekly_retro_at` | timestamp | |
| `weekly_retro_ack_at` | timestamp | Set when Krish acks |
| `monday_premortem` | jsonb | Monday pre-mortem (PR #46) |
| `monday_premortem_at` | timestamp | |
| `updated_at` | timestamp | |

### `marcus_synthesis`

Marcus's deeper synthesis rows (Sunday deep run + Mon/Wed/Fri runs).
Read by the Intel tab; the latest is the canonical narrative.

---

## Self-healing tables (PR #54)

### `completeness_contracts`

Per-workflow output contract. Tier 1 of the self-healing system.

| Column | Type | Description |
|---|---|---|
| `workflow_id` | text | FK → N8N workflow id |
| `expected_min_rows` | int | Minimum acceptable rows written downstream |
| `expected_columns` | text[] | Required non-null columns |
| `freshness_window_hours` | int | Acceptable lag |

### `silent_failures`

Workflows that "succeeded" but produced no value. Tiered by detector.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workflow_id` | text | |
| `tier` | int | 1 (completeness contract), 2 (Silent Success Detector), 3 (Critical Infrastructure Monitor), 4 (Failure Pattern Sweep) |
| `severity` | text | `low`, `medium`, `high`, `critical` |
| `evidence` | jsonb | Detector-specific evidence |
| `detected_at` | timestamp | |
| `resolved_at` | timestamp | |

The Home `CriticalAlertBanner` subscribes to `silent_failures` filtered
to tier 3 + severity `critical` via `useCriticalAlerts`.

---

## Operational firehose

### `audit_log`

Append-only event stream. Drives Live Activity and the Intel feed.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `event_type` | text | |
| `actor` | text | Agent slug, `krish`, `system`, or `vps-pipeline` |
| `target` | text | Optional subject (e.g. `Google Drive Sync`) |
| `details` | jsonb \| text | Event details |
| `created_at` | timestamp | |

### `workflow_runs`

One row per N8N execution.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `workflow_id` | text | N8N workflow ID |
| `workflow_name` | text | Human-readable name |
| `agent_id` | text | Owning agent slug (lowercase) |
| `status` | text | `running`, `success`, `error` |
| `outcome` | text | Optional outcome tag |
| `cost_usd` | decimal | Execution cost |
| `quality_score` | decimal | Optional |
| `duration_ms` | int | |
| `run_at` | timestamp | Run start (primary sort) |
| `error_message` | text | |
| `created_at` | timestamp | |

> **Legacy columns.** Pre-2026-04-15 rows used `agent` (renamed →
> `agent_id`), `started_at` (renamed → `run_at`), and `cost` (renamed →
> `cost_usd`). UI queries should read the new names first and fall back to
> the legacy names only when rehydrating historical data. See
> `DesktopOrg.tsx` for the canonical fallback pattern.

### `system_health`

Per-component infrastructure signals.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `system_name` | text | |
| `status` | text | `healthy`, `warning`, `critical`, `down`, `unknown` |
| `message` | text | |
| `last_check` | timestamp | |
| `metadata` | jsonb | |

### `credential_health`

Tracked by Kai. Surfaces credential expiry into the Critical
Infrastructure Monitor.

### `feedback_queue` / `corrections`

The learning loop.

- `feedback_queue` — every Krish rejection (Today, Leads, Guests,
  Visibility, Content) writes a row via the `FeedbackButton`.
- `corrections` — patterns Vera extracts from `feedback_queue` (≥3
  matches, confidence > 0.8) OR from `silent_failures` (Failure Pattern
  Sweep). Agatha turns these into edits on `agents.brief_content` or
  new `standards_registry` rules.

---

## The `decisions_waiting` view (PR #55)

Postgres view that unions five source tables into a single uniform
shape, so the Home `DecisionsWaitingPanel` can render one panel covering
everything Krish needs to decide.

```sql
-- shape: { kind, id, title, agent, age_hours, link, meta jsonb }
SELECT 'task' AS kind, ... FROM tasks
  WHERE status IN ('waiting','pending-agatha-review','pending-review','blocked')
UNION ALL
SELECT 'lead' AS kind, ... FROM leads
  WHERE promoted_task_id IS NULL AND deep_enriched_at IS NOT NULL
UNION ALL
SELECT 'guest' AS kind, ... FROM guests
  WHERE status = 'enriched'
UNION ALL
SELECT 'visibility' AS kind, ... FROM visibility_targets
  WHERE status = 'enriched'
UNION ALL
SELECT 'idea' AS kind, ... FROM content_ideas
  WHERE status = 'pending';
```

The `meta` jsonb carries per-kind enrichment (pitch_draft preview,
suggested_angles, tier, fit_score, etc.) so the panel renders rich
previews without joins.

**Invariant.** New "waiting on Krish" surfaces add a `UNION ALL` branch
here, not a sibling panel on Home.

---

## Realtime Subscriptions

The UI subscribes to these tables via `postgres_changes` on one shared
channel per table (ADR-002):

```typescript
supabase
  .channel('tasks-rt-shared')  // open once per browser session
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, callback)
  .subscribe()
```

| Hook | Channel | Source |
|---|---|---|
| `useRealtimeTasks` | `tasks-rt-shared` | `tasks` |
| `useRealtimeLeads` | `leads-rt-shared` | `leads` |
| `useRealtimeGuests` | `guests-rt-shared` | `guests` |
| `useVisibilityTargets` | `visibility-rt-shared` | `visibility_targets` |
| `useCustomers` | `customers-rt-shared` | `customers` |
| `useRealtimeDecisionsWaiting` | `decisions-rt-shared` | `decisions_waiting` view |
| `useCriticalAlerts` | `critical-alerts` | `silent_failures` (tier 3) |

---

## Indexes

### Active indexes

| Index | Columns | Purpose |
|---|---|---|
| `idx_tasks_status_updated_at` | `status`, `updated_at` | Dashboard loads |
| `idx_tasks_agent_status` | `agent`, `status` | Agent workload views |
| `idx_tasks_venture_status` | `venture_id`, `status` | Venture health cards |
| `idx_audit_log_actor_created_at` | `actor`, `created_at` | Activity feeds |
| `idx_workflow_runs_agent_run_at` | `agent_id`, `run_at` | Agent economics |
| `idx_leads_primary_venture_assignee` | `primary_venture`, `assignee_agent` | Per-venture lanes |
| `idx_guests_status_target` | `status`, `podcast_target` | Guest lanes |
| `idx_customers_product_kind` | `customer_product`, `customer_kind` | Per-product feeds |

---

## Database Triggers

### Task timestamp auto-stamp

A single BEFORE UPDATE trigger stamps `started_at` on transition to
`in_progress` and `completed_at` on transition to `done`. Both are
no-ops if the column is already set, so explicit values in the UPDATE
statement are preserved.

```sql
CREATE OR REPLACE FUNCTION stamp_task_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND (OLD.status IS DISTINCT FROM 'in_progress') THEN
    IF NEW.started_at IS NULL THEN NEW.started_at = NOW(); END IF;
  END IF;
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    IF NEW.completed_at IS NULL THEN NEW.completed_at = NOW(); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_stamp_timestamps
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION stamp_task_timestamps();
```

Migration: `scripts/migrations/2026-05-18-stamp-completed-at.sql`.

---

## Row Level Security (RLS)

Every Supabase table has RLS enabled. The pattern:

- **`anon`** role has SELECT on dashboard-facing tables and views so the
  browser can read with the anon key.
- **`service_role`** writes for the OS (N8N workflows and the VPS sync
  pipeline authenticate as service_role via the `Supabase account 2`
  credential).
- **Control Center mutations** use the anon key when policy allows, else
  route through `/api/*` Vercel functions which carry the
  `SUPABASE_SERVICE_ROLE_KEY` env var.

A table added without RLS will fail Vera's audit (standard CODE-005).

---

## Deprecated / dropped tables

These appear in older code, older docs, and `git log`. They are gone.
References to them should be updated.

| Table | Replaced by | Dropped in |
|---|---|---|
| `nell_candidates` | `guests` | PR #56 (2026-05-22) |
| `nova_target_conferences` | `visibility_targets` | PR #56 (2026-05-22) |
| `tasks.json` / `goals.json` etc. (local JSON state) | Supabase tables | OS v3 migration (2026-04) |
