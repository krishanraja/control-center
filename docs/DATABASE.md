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

- **`ventures`** — 8 rows: 6 active (`mindmaker`, `fractionl`,
  `builder-economy`, `signal-noise`, `personal-brand`, `ops`) and 2
  archived (`adfixus`, `onalert`). Filter on `status = 'active'`;
  archived rows are kept so historical attribution still resolves.
- **`venture_registry`** — 3-row table (`mindmaker`, `signal_noise`,
  the active rows) that drives multi-tag leads and per-venture lanes
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

The goal ladder: one table, four rungs, discriminated by `horizon`. The
objective layer repurposed this table in May 2026
(`scripts/migrations/2026-05-29-objective-layer-1b-repurpose-goals.sql`);
this section had still described the pre-May shape, including a `period`
column and a `team_focus` column that never existed here. `team_focus`
is a `system_config` key, not a goals column, and `id` is text, not uuid.

`GET /api/goals/ladder` is the one read. `POST /api/objectives` is the one
create, gated by `api/_goalGate.ts`. Entry is guarded structurally by
`scripts/check-goal-ladder.mts`.

| Column | Type | Description |
|---|---|---|
| `id` | **text** | Primary key. Namespaced, e.g. `os:licensable`, `obj:venture:slug` |
| `title` | text | The goal |
| `horizon` | text | `os` \| `mid_term` \| `weekly` \| `venture_objective`. The rung |
| `parent_id` | text | What this serves. Required for every rung except `os` |
| `status` | text | `proposed` \| `active` \| `paused` \| `done` \| `dropped` |
| `venture` | text | For `venture_objective` |
| `target` / `current` / `progress` / `notes` | text/int | Legacy weekly-goal fields, still written by the ladder's inline edit |
| `owner` / `week_of` | text | Legacy, pre-ladder |
| `objective_kind`, `definition_of_done`, `why_now`, `target_horizon`, `primary_kpi`, `secondary_kpi` | | Objective-layer detail |
| `priority` | int | Sort order within a rung |
| `is_auto`, `created_by`, `source` | | Provenance. `source` is `krish_declared` \| `marcus_nominated` \| `agatha_decomposed` |
| `concept_id` | text | Closure cascade |
| `gate_verdict` | jsonb | The gate's judgment at save time |
| `gate_overridden` | boolean | True when saved despite a failing verdict |
| `activated_at`, `completed_at`, `review_due_at`, `created_at`, `updated_at` | timestamptz | |

`gate_verdict` and `gate_overridden`, the `horizon` NOT NULL constraint,
and the corrected `goals_health` view ship in
`supabase/migrations/20260811210000_goals_ladder_integrity.sql`.

### `goals_health`

View over `goals`. Staleness thresholds by rung: weekly 10d,
venture_objective 30d, mid_term 45d, os 90d. `orphaned` is a non-OS goal
with no parent. Covers `status IN ('active','proposed')` only; paused,
done and dropped goals get no row, and `api/goals/ladder.ts` reads a
missing row as not-stale, which is correct for all three.

### `revenue_events` / `revenue_subscriptions`

Revenue pulled straight from Stripe by `api/revenue/sync.ts`. **Service-role
only** (anon and authenticated hold no grants); the dashboard reads them
through `GET /api/revenue`.

They answer different questions and are never summed together:

- **`revenue_events`** — one row per Stripe **balance transaction**, so the
  fees are settled: `stripe_fee_cents`, `app_fee_cents` (Substack takes 10%),
  `net_cents`. `kind` is derived, not guessed: refunds are `refund`, an invoice
  resolving to a subscription is `recurring`, everything else is `one_time`.
  Idempotent on the transaction id, so a re-sync is a no-op.
- **`revenue_subscriptions`** — current state of every subscription. This, and
  only this, produces MRR. `mrr_cents` normalises the price to one month
  (year ÷ 12, week × 52 ÷ 12).

**Currency.** Stripe settles into the account currency and reports the
`exchange_rate` it used, so `currency`/`gross_cents` are already settled;
`presented_currency`/`presented_gross_cents` keep what the customer actually
paid (A$1,000 rather than US$701.30). `mrr_usd_cents` is **NULL** for non-USD
plans rather than converted at a guessed rate.

### `service_registry` / `spend_invoices` / `spend_monthly`

The money-OUT twin (2026-08-25, migration `20260825183443_spend_and_connections.sql`).
**Service-role only**, same access rule and reasoning as the revenue tables;
the dashboard reads the computed summary through `GET /api/spend`.

- **`service_registry`** — one row per service the OS pays for or
  authenticates to (56 seeded, reconciled against the n8n credential store
  and the `api_usage_state` seeds). Metadata columns say WHERE the key lives
  (`env_key_name` — a NAME, never a value; resolution is deploy env →
  `app_secrets`), HOW to check it (`check_kind`: `balance` / `ping` /
  `none`), how loudly to fail (`criticality` — only `critical` rows mirror
  into `system_health` and can raise the Home banner), and how receipts
  match it (`vendor_match`). Sweep-state columns (`last_status`, `balance`,
  `last_checked_at`, …) are written only by
  `/api/health/connections-sweep`; the seed's `on conflict` never touches
  them.
- **`spend_invoices`** — one row per receipt email in the Gmail
  "Subscriptions" label, written by `/api/spend/ingest`. Idempotent on
  `gmail_message_id`, so backfills re-run as no-ops. Refunds are
  `kind='refund'` and net out of every total. `amount_usd`/`amount_aud` are
  **NULL when no FX rate is known** (flagged `needs_review`) — a missing
  rate is never treated as 1.0, the `revenue_events` rule. A receipt the
  parser could not read still lands, `needs_review=true` with a
  `review_note`: unread money is flagged, never silently dropped.
- **`spend_monthly`** — `security_invoker` rollup view (month × service,
  refunds netted) for ad-hoc/warehouse reads; the UI does not read it.

**Why these exist.** `customers.mrr_usd` is written by an n8n expression that
falls back to the Checkout session grand total, so a one-off advisory invoice
lands as "per month" revenue. Nothing in the old schema separated recurring
from one-off. As of 2026-08-11 the live account had collected $842.56 net all
time, **76.9% of it from a single one-time payment**, against a dashboard that
read $16,500.

### `meter_daily` / `spend_alerts_sent`

The usage meter (2026-08-27, migration `20260827090000_usage_meter.sql`).
**Service-role only**, same rule as the spend tables; the browser reads the
rollup inside `GET /api/spend`.

**Why it exists.** `service_registry` answers *how much a provider cost*.
Nothing answered *which unit of the OS spent it*. The two columns that
looked like they did were fiction: `workflow_runs.cost_usd` held $0.00 for
1,419 runs across twelve agents (one distinct value in thirty days), and
`api_call_log` held eighteen rows, every one written by the connections
sweep itself. Neither had ever seen agent traffic.

- **`meter_daily`** — one row per `provider × unit_kind × unit_key × day ×
  bucket`. `unit_kind` is `actor` (Apify) / `workflow` (n8n) / `agent`
  (Anthropic); `bucket` is the one sub-dimension worth splitting by per
  provider — run origin, execution mode, model. `unit_label` caches the
  resolved human name so steady-state syncs need no provider round trips,
  and `category` carries Apify's `task_category` from
  `apify_actor_registry` (NULL = an actor that ran but is in no registry
  row). `usd` is real money where the vendor prices it and computed from
  real token counts where the OS meters itself; **n8n rows leave `usd` at
  0 on purpose** — n8n Cloud bills per execution and reports no rate, so
  `unit_name` says what `units` counts rather than a made-up dollar figure
  sitting in the same column as real ones. The mirror rule applies to Apify:
  `/v2/actor-runs` returns the shortened run object with `usageTotalUsd` but no
  `usage` breakdown, so Apify rows carry dollars and leave `unit_name` NULL —
  an unreported unit says nothing, never zero.
- **Two write paths, not interchangeable.** Provider-derived truth (Apify,
  n8n) is REPLACED: the collector recomputes a whole UTC day from the
  vendor's own records and upserts over it, so a re-run or an overlapping
  window cannot double-count. Self-metered events (Anthropic) are ADDED one
  call at a time through the `meter_add()` RPC — replacing there would keep
  only the last call of the day.
- **`spend_alerts_sent`** — one row per money line already crossed, keyed
  `<service>:<state>:<cycle-start>` (or `spike:<provider>:<unit>:<week>`).
  Claimed BEFORE the email is sent, so an hourly cron turns one crossing
  into one email rather than twenty-four; a claim whose send fails is
  deleted again so a fixed mailer is not permanently silenced.
- **`service_registry.included_usd` / `overage_trigger_usd` /
  `cycle_usd` / `cycle_start` / `cycle_end`** — the prepaid truth. Apify's
  plan includes $29 and charges early once the extra passes $50. The sweep
  used to report `maxMonthlyUsageUsd − monthlyUsageUsd`: headroom to the
  HARD cap, which sat far above the prepaid, so the dot stayed green in the
  same week Apify emailed to say the prepaid was spent. `balance` is now
  headroom to the INCLUDED amount and goes negative as overage accrues;
  `cycle_*` are written by `/api/meter/apify-sync` from the vendor's own
  billing window, never guessed from the calendar month.

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

Podcast guest candidates for Built conversations, carried on the Signal & Noise feed.
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
| `distribution` | text[] | Channels (whitelist: `linkedin`, `newsletter`, `signal-noise-pod`, `builder-economy-pod`, `x`). `techonomic` is legacy-only (brand retired 2026-08-06) |
| `confidence` | numeric | 0-1, hard contract `>= 0.5` for insert |
| `quality_score` | text | `green` / `amber` / `red` |
| `body` | text | Long-form draft (sanitized on save: no em dashes). Edited in the Composer; written via the API, never the anon client (RLS blocks anon writes) |
| `lane` | text | `mindmaker_live`, the only content venture since the 2026-08-11 refocus, with the format in `lane_slot` (`paid` / `built`). Legacy rows may still hold `techonomic`, `mymu`, `makeyourmindup`, `mindmaker`, `signal_noise`, `builder_economy` or `builder_economy_ig`; all map forward via `normalizeLane` and read as Mindmaker |
| `lane_slot` | text | Mindmaker: `roundup` / `field_learning`; null elsewhere |
| `state` | text | `seeded` → `researching` → `drafting` → `review` → `approved` → `published` / `dropped` |
| `cadence_due_at` | timestamptz | Next-due for the lane/slot; drives mobile "urgent" + the All-view sort |
| `meta` | jsonb | Engine + Composer state (see below) |
| `source_type` | text | `agatha_chat`, `cleo_chat`, `signal_inbox`, etc. |
| `source_ref` | text | Origin reference (telegram message id, doc id, etc.) |
| `created_at` | timestamp | |

**`meta` (jsonb) keys:** `revisions[]`, `challenges[]`, `standards`, `cleo_pushes[]`, `deep_dives[]`, `transformed_outputs` (also a top-level column), plus the Composer additions **`materials[]`** (attached research corpus — `{id,kind,title,content|url,bytes,at}`), **`cleo_chat[]`** (chat transcript), and **`saved_drafts[]`** (Save Draft stamps). No separate tables; `meta` is the durable home for engine + Composer state.

**RLS:** anon `SELECT` only; `service_role` ALL. All writes go through `/api/*` (service role) — the Composer's draft autosave, materials, chat, and save-draft all PATCH/POST server-side for this reason.

---

## Revenue tables (PR #43, #44, #45)

### `customers`

Cross-product customer ledger. Owned by Stripe webhooks + Maya
Customer Acquisition Sweeper (nightly).

This section previously described columns that do not exist: `customer_kind`,
`customer_product`, `name`, `signup_at`, `tenure_days`, and
`attribution_confidence` as numeric. The real columns are below; the
authoritative DDL is `scripts/migrations/2026-05-22-customers.sql`.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `kind` | enum `customer_kind` | `paid`, `free_signup`, `trial`, `waitlist`, `churned`. Lifecycle, NOT a revenue type |
| `product` | enum `customer_product` | Eleven values today; `legibility` replaced `plinth` 2026-08-07 |
| `email` / `full_name` | text | email lowercased, dedupe key |
| **`mrr_usd`** | numeric(10,2) | **Not trustworthy as MRR.** Written by an n8n expression that falls back to the Checkout session grand total, so a one-off payment lands as "per month" and an annual charge lands as one month. Use `revenue_events` / `revenue_subscriptions` instead |
| `plan` | text | Free-text Stripe nickname, not a recurrence indicator |
| `ltv_usd` | numeric(10,2) | Never written by anything in this repo |
| `stripe_customer_id` | text | dedupe key |
| `stripe_subscription_id` | text | Falls back to the session/invoice id on `checkout.session.completed`, so it holds non-subscription ids for one-time purchases |
| `attribution_lead_id` | uuid | FK → `leads.id` |
| `attribution_task_id` | text | FK → `tasks.id` |
| `attribution_channel` | text | `utm_source`, else `agent:<assignee>` |
| `attribution_confidence` | **text** | `exact_email` / `utm` / `fuzzy_name` / `unattributed` / `reconciled` |
| `signed_up_at` / `became_paid_at` / `churned_at` | timestamptz | Webhook receipt time, not Stripe's timestamp |
| `source`, `country`, `raw` | text/jsonb | `raw` is the only place the full Stripe event survives |
| `created_at` / `updated_at` | timestamptz | `updated_at` via trigger |

**Dedupe indexes:** `(product, stripe_customer_id)` and `(product, lower(email))`.

**No `stripe_account` column**, so account identity here is inferred from
`product`. Only the warehouse (`attribution.events`) carries it explicitly.

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

### Function & view hardening (2026-07-01)

Beyond table RLS, the database functions and views are hardened independently of
the app auth model (full breakdown in [`DB_HEALTH.md`](./DB_HEALTH.md), rationale
in [ADR-008](./DECISIONS/008-security-hardening-and-auth-rls-scope.md)):

- **`search_path` pinned** on every user-defined function (advisor 0011).
- **`SECURITY DEFINER` functions** are `service_role`-only — `EXECUTE` was
  revoked from `public`/`anon`/`authenticated` (advisors 0028/0029). The
  frontend makes zero `.rpc()` calls; triggers fire regardless of grants.
- **`SECURITY DEFINER` views** (`decisions_waiting`, `triage_queue`,
  `standards_efficacy`, `attribution_app_health`) are definer **by design** so
  the anon client can read them without per-table RLS. Converting them to
  `SECURITY INVOKER` is gated on the auth work in ADR-008 — do not change them
  standalone or Home goes blank.

### Migration ledger

`supabase_migrations.schema_migrations` was reconciled on 2026-07-01: 17
migrations that had been applied out-of-band (under different version stamps)
were marked applied — after verifying each one's objects exist — **without
re-running any DDL**, so every repo file in `supabase/migrations/` is now in the
ledger and `supabase db push` is a clean no-op. Historically the ledger and repo
diverged; do not `db push` a DB whose ledger you have not reconciled.

---

## Deprecated / dropped tables

These appear in older code, older docs, and `git log`. They are gone.
References to them should be updated.

| Table | Replaced by | Dropped in |
|---|---|---|
| `nell_candidates` | `guests` | PR #56 (2026-05-22) |
| `nova_target_conferences` | `visibility_targets` | PR #56 (2026-05-22) |
| `tasks.json` / `goals.json` etc. (local JSON state) | Supabase tables | OS v3 migration (2026-04) |

---

## `contact_intelligence` — the network judgment layer

1:1 with `contacts` (`contact_id` is both PK and FK, `ON DELETE CASCADE`).
10,649 rows, all embedded.

**RLS: service-role only. No anon policy, deliberately.** `contacts` is
anon-readable (`contacts_anon_select ... USING (true)`), and `why_them` and
`risk` are private assessments of named people. See
[ADR-011](./DECISIONS/011-contact-intelligence-sibling-table.md).

| Column group | Columns |
|---|---|
| Judgment | `who`, `why_them`, `hook`, `risk` |
| Routing | `roles[]`, `surface_when[]`, `best_channel`, `reachable_via[]` |
| Venture | `venture_scores` (jsonb, 0-100 per venture), `primary_venture`, `mindmaker_buyer_family` |
| Evidence tier | `network_tier`, `tier_weight`, `priority`, `fit`, `warmth` |
| Provenance | `confidence`, `intel_method`, `evidence[]`, `source_count`, `source_list[]` |
| Firmographic | `seniority`, `country`, `geo_code`, `industry` |
| Hygiene | `is_person`, `name_quality`, `reciprocated_email`, `email_inbound/outbound/last` |
| Retrieval | `intel_doc`, `intel_tsv` (generated), `embedding vector(1536)` |

`network_tier` is an **evidence** statement (how many independent sources assert
this person). `contacts.consent_tier` is a **permission** statement (what we are
allowed to do). They are different axes and the mapping between them is
deliberately lossy and one-way: a bulk file can promote a tier, never demote
one.

`intel_doc` is the single retrieval surface. Both `intel_tsv` and `embedding`
derive from it, so the lexical and semantic tiers can never disagree about what
was indexed.

`geo_code` is ISO-3166 alpha-2, **resolved rather than stored**: it falls back
through `country`, then `contacts.location`, then the email ccTLD
(`network_geo_resolve`). The fallback is the point. `country` alone is populated
for 3,679 of 10,597 people and for **9 of the 164 in tier 1**, the people who
have actually replied, so a filter reading `country` directly would hide almost
everyone Krish knows best the moment he picked a market. Resolution lifts known
geography to roughly 4,600.

It is denormalised onto this table, not computed per query, because
`network_search`'s candidate recall paths read `contact_intelligence` alone and
are capped at 400 rows each; an indexed column lets a country filter push down
into them instead of being applied to an already-truncated pool. It cannot be a
`GENERATED` column: the resolution reads `contacts` and `geo_country`, and a
generated expression must be immutable and single-table.

Kept current by two triggers (`ci_geo_code_trg` on this table's `country`,
`contacts_geo_code_trg` on `contacts.location` / `email`) rather than only at
import, so it cannot drift the way an import-time derived column silently does.
`refresh_network_geo()` re-resolves the whole corpus and returns the number of
rows changed; run it after an import or after `geo_country` gains an alias.

**Whatever is unknown stays unknown.** `geo_code` is NULL for roughly 6,400
people and is never guessed at: `.com`, `.io`, `.ai` and `.co` are sold
worldwide and resolve to nothing. `network_geo_facets()` returns that count
alongside the per-country totals, and `/api/network/geo` hands it to the UI, so
a filtered list can say how many people it could not place.

## `geo_country` — the country reference

Anon-readable (a country list carries none of `contact_intelligence`'s privacy
weight). `code` (ISO-2 PK), `name`, `aliases[]`, `cctld[]`, `featured`.

Aliases are the resolution surface: informal names, demonyms and the major
cities that turn up in a free-text location field, all lowercase. Two-letter US
state codes are deliberately **absent** — "CA" is Canada far more often than
California, and a wrong country is worse than an unknown one. Whole-string ISO
codes are matched, but only for the whole string, so the UI's `CA` is Canada
while `San Francisco, CA` resolves through the city alias to the US.

`featured` marks GB, AU and US, matching the geography default already documented
in [`ICP.md`](./ICP.md) and [`APOLLO_ICP_RUBRIC.md`](./APOLLO_ICP_RUBRIC.md);
the filter chips and the sourcing rubric should not disagree about which three
countries matter.

### Indexes

`hnsw (embedding vector_cosine_ops)` — **HNSW, not ivfflat**. ivfflat needs
training data; built on an empty table at migration time its centroids would be
garbage, and the importer adds all 10,649 rows immediately afterwards. HNSW has
no training step, so creating it before the load is correct rather than merely
tolerable, which keeps the migration order-independent.

Plus GIN on `intel_tsv`, `roles`, `surface_when`, `venture_scores`, btree on
`network_tier` / `primary_venture` / `seniority` / `country` / `geo_code`, and a
partial index on the browse default (tiers 1-3, real judgment, actual humans).

## `network_search()` — the scorer

`SECURITY INVOKER`, granted to `service_role` only.

```
match_score = 100 x venture_multiplier x weighted_mean(
    0.34 semantic       cosine, rescaled onto the measured band [0.30, 0.62]
    0.16 lexical        ts_rank_cd, rescaled in-set, x coverage squared
    0.22 constraint     weighted partial credit, 0.5 when unconstrained
                        (`geo` matches the RESOLVED geo_code; `country` folds into it)
    0.18 relationship   tier_weight, warmth, reciprocated, log(source_count)
    0.10 actionability  reachable, confidence, intel_method, name_quality
)
```

Weights renormalise over the terms actually present, so a recommend-mode call
with no text query is not silently scored out of 0.50.

**Constraints are SOFT.** They contribute weighted partial credit; they never
filter. The only hard filters are `is_person`, `do_not_contact`, and whatever
the operator sets explicitly in the UI (`p_tiers`, `p_roles`, `p_min_conf`,
`p_countries`). This is what makes "always return answers" structural rather
than a promise the caller has to keep.

Candidate recall is a UNION of orthogonal paths, one of which is
**query-independent** (the strongest relationships in the network). That is what
a nonsense query falls back to. The no-vector path stays fully exhaustive.

`p_countries` **pushes down into every recall path** rather than filtering their
output. Each path is capped at `p_pool` (400) rows, so a UK search that filtered
afterwards would examine 400 mostly-Australian neighbours and return the handful
of Britons among them, out of 382. Scoping the paths spends those slots where
the answer is. A soft `geo` constraint gets its own recall path for the same
reason: the constraint term cannot promote someone who was never scored.

A soft `geo` constraint has **three** outcomes, not two: 1.0 in the named
country, **0.5 for an unknown location** (the same neutral this term uses when
there is no constraint at all), 0.0 for known-to-be-elsewhere. The middle case is
load-bearing. With two outcomes, a soft "in the UK" returned 200 Britons out of
200 rows and buried all 151 of the 164 tier-1 contacts whose location was never
recorded, because scoring them 0 priced "we never collected this" identically to
"they are definitely in Sydney". That is a hard filter wearing a soft label, and
it is the exact failure `geo_code` exists to prevent. `p_countries` stays strict:
that is the operator saying "UK only" out loud, and the UI tells them how many
people it cannot place. Probe P8 in `scripts/network/probes.sql` guards it.

Both `p_countries` and `geo` constraint values run through
`network_geo_canon`, so ISO codes, country names and city names are one filter.
Values that resolve to nothing **degrade rather than empty the result**: an
unrecognised `p_countries` becomes no filter, and an unrecognised `geo`
constraint is dropped instead of scoring zero against the whole corpus.

### Calibration

The semantic band is measured, not assumed. `public.cosine_probe(p_vec)` samples
2,500 embedded rows and reports the percentile distribution for a query vector.
Measured against this corpus:

```
query                          p50    p99    max
CMO at a bank, AI governance   0.351  0.556  0.657
publisher identity             0.329  0.491  0.596
podcast guest thesis           0.308  0.471  0.525
"purple monkey dishwasher"     0.100  0.199  0.275
```

The first band was guessed at `[0.55, 0.95]`, which sat above the 99th
percentile of every real query and disabled the entire semantic tier.
**Re-measure with `cosine_probe` if the embedding model or the `intel_doc` shape
changes; both move this band.**
