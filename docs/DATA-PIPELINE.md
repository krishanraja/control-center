# Data Pipeline

> **Scope.** How data moves through Control Center — from a Krish click in
> the UI, through Supabase, through the N8N Orchestrator, back into
> Supabase, and onto the screen via Realtime. The mechanics of the
> event-driven loop the dashboard sits inside.
>
> **Not in this document.** Per-tab data contracts live in
> [`PRODUCT.md`](./PRODUCT.md). Schema details live in
> [`DATABASE.md`](./DATABASE.md). Agent roster + slug-as-key rules live in
> [`AGENTS.md`](./AGENTS.md). Broader-OS cron topology lives in
> `MINDMAKER_OS_ARCHITECTURE.md` §8 on the VPS workspace root.

## Event-Driven Architecture

Control Center is the dashboard slice of Mindmaker OS. Data flows through
this loop:

```
Krish Action (UI)
    ↓
Supabase (table mutation, anon or service-role)
    ↓
pg_net trigger OR explicit /api/* webhook
    ↓
N8N Orchestrator (u0kIULJBJL4dGcuR, /webhook/mindmaker-orchestrator)
    ↓
Downstream agent workflow (executes, calls LLM, calls external APIs)
    ↓
Supabase (writes result back)
    ↓
Postgres Realtime (postgres_changes)
    ↓
UI (one realtime tick later, the affected component re-renders)
```

The dashboard never talks to N8N or the VPS directly. Every cross-system
communication goes through Supabase.

## The Event Loop, step by step

### 1. Krish takes an action in the UI

Examples: approve a task, promote a lead, confirm a guest, place a bet,
deep-enrich a visibility target.

### 2. Supabase mutation

The UI writes to the relevant row. Low-stakes mutations use the anon key
+ RLS:

```typescript
await supabase
  .from('tasks')
  .update({
    status: 'in_progress',
    krish_reviewed: true,
    updated_at: new Date().toISOString()
  })
  .eq('id', taskId)
```

Mutations that need service-role context (bypass RLS, fire a webhook with
a service-role secret) route through `/api/*`:

```typescript
await fetch('/api/leads/promote', {
  method: 'POST',
  body: JSON.stringify({ leadId })
})
```

Every Krish action also writes an `audit_log` row with `actor='krish'`
and a meaningful `event_type` (standard: action provenance).

### 3. Webhook trigger

Two mechanisms fire downstream work:

**`pg_net` triggers** for routine row changes that should fan out
automatically (task status changes, lead enrichment completions). The
trigger calls the Orchestrator with the changed row in the payload:

```sql
CREATE OR REPLACE FUNCTION notify_orchestrator()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://krishraja10101.app.n8n.cloud/webhook/mindmaker-orchestrator',
    body := jsonb_build_object(
      'event_type', 'task_status_changed',
      'id', NEW.id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'agent', NEW.agent
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Explicit `/api/*` webhook POSTs** for actions that need a specific
endpoint (deep enrich, guest confirm cascade). The `/api/*` function calls
the Orchestrator directly with a service-role secret in the
`X-Agatha-Secret` header.

### 4. Orchestrator routing

The Orchestrator (`u0kIULJBJL4dGcuR`) is a single N8N workflow with a
Switch node that routes by `event_type`:

| `event_type` | Routed to |
|---|---|
| `approve` (content) | Krish Approval Callback → Cleo LinkedIn Distribution |
| `deep_enrich_lead` | Agatha Lead Deep Enrich |
| `deep_enrich_guest` | Nell Guest Pitch Draft (canonicalised in PR #60) |
| `deep_enrich_visibility` | Nova Visibility Deep Enrich |
| `confirm_guest` | Nell Guest Confirmed Cascade |
| `task_status_changed` (waiting → in_progress) | Agent-specific workflow for the owning agent |
| `idea_capture` | Cleo Content Idea Capture (Sonnet 4.6 extractor) |

### 5. Agent execution

The downstream workflow runs:
- Loads its agent brief and Krish voice rules from Supabase.
- Calls the appropriate LLM tier (Sonnet 4.6 for substance, Haiku 4.5 for
  classification, no Opus in N8N — standard MT-003).
- Calls any external APIs it needs (Apollo, Brave Search, Perplexity,
  etc.).
- Writes results back to Supabase.
- Writes one row to `workflow_runs` with `status`, `cost_usd`,
  `duration_ms`.
- Writes one or more rows to `audit_log` describing what it did.

### 6. UI realtime update

Control Center's hooks subscribe to `postgres_changes` on one shared
channel per table (ADR-002):

```typescript
const channel = supabase
  .channel('tasks-rt-shared')  // open once per browser session
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks'
  }, (payload) => {
    // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    // payload.new: new row data
    // payload.old: old row data (for UPDATE/DELETE)
    refresh()
  })
  .subscribe()
```

The component re-renders within a tick. Total round-trip from click to
visible update is typically < 2 seconds.

## Agent fleet at a glance

The 14 production agents that drive workflows in the system. Slugs are
authoritative; see [`AGENTS.md`](./AGENTS.md) for the full taxonomy.

### Executive

| Agent | Role | Schedule |
|---|---|---|
| `agatha` | Chief Operating Officer | Chat (Telegram + Discord) |
| `marcus` | Business Development Intelligence / Synthesis | 4×/day (Mon/Wed/Fri synthesis + Sunday deep; Daily Brief 06:30, Friday Retro 17:00, Monday Pre-mortem 08:00) |

### Operations

| Agent | Role | Schedule |
|---|---|---|
| `vera` | Chief of Staff & Quality | 2×/day + Fri deep + Sun feedback agg + Sun failure-pattern sweep |
| `leo` | Chief Revenue Officer | Weekly Fri 16:00 |
| `priya` | Product Strategy | Daily |
| `arlo` | Technical Operations & Infrastructure | Sun 03:00 + on-demand |
| `kai` | Technical Architecture / Integrations | Every 4h (Dependency Mapper + Credential Health) |

### Growth

| Agent | Role | Schedule |
|---|---|---|
| `cleo` | Content Production & Voice (Coordinator) | Webhook only (Krish-triggered) |
| `felix` | Enterprise Sales Pipeline | Mon-Fri 11:00 + 4 other ticks |
| `maya` | Customer Acquisition (Marketing/SEO) | 7×/day (incl. nightly Customer Acquisition Sweeper + Churn → Exit Interview Task) |
| `nell` | Outbound + Podcast Guest Booking | 3×/day |
| `nova` | Visibility & Speaking | Tue/Fri 09:00 + Mon 11:00 Visibility Sweeper |
| `zara` | Signal Intelligence & Market Research | Mon-Fri 10:00 + 4 other ticks |
| `hunter` | Job Sourcing & Application Specialist | Daily 08:00 UTC + on-demand |

## Webhook payloads

### Task status change

```json
{
  "event_type": "task_status_changed",
  "id": "uuid",
  "title": "Task title",
  "old_status": "waiting",
  "new_status": "in_progress",
  "agent": "cleo",
  "owner": "krish",
  "krish_reviewed": true,
  "krish_notes": "Approved with changes",
  "updated_at": "2026-05-25T21:30:00Z"
}
```

### Lead deep enrich

```json
{
  "event_type": "deep_enrich_lead",
  "lead_id": "uuid",
  "primary_venture": "mindmaker",
  "tags": ["mindmaker_buyer"],
  "assignee_agent": "felix"
}
```

### Guest confirmed cascade

```json
{
  "event_type": "confirm_guest",
  "guest_id": "uuid",
  "podcast_target": "signal-and-noise",
  "name": "Guest Name",
  "email": "guest@example.com"
}
```

### Idea capture

```json
{
  "source_type": "agatha_chat",
  "source_ref": "<telegram_message_id>",
  "source_url": "<telegram deep link>",
  "source_snippet": "<the message body>",
  "raw_text": "<the message body>",
  "captured_at": "2026-05-25T21:30:00Z"
}
```

The Cleo Content Idea Capture workflow returns:

```json
{
  "is_idea": true,
  "idea": "Concrete one-line idea",
  "thesis": "Sharp POV",
  "distribution": ["linkedin", "newsletter"],
  "confidence": 0.85,
  "quality_score": "green",
  "rejection_reason": null
}
```

Hard contract for insert into `content_ideas`: `is_idea=true` and
`confidence >= 0.5`. Below bar → skip insert, write `audit_log` row
`cleo_idea_capture_skipped` with `skip_reason`.

## N8N workflow patterns

### Orchestrator routing (entry point)

```
Webhook /webhook/mindmaker-orchestrator
    ↓
Switch (by event_type)
    ↓
Per-event downstream workflow
    ↓
Supabase: write result back
    ↓
Telegram notify (where relevant)
    ↓
workflow_runs heartbeat
```

### Deep enrich pattern (leads / guests / visibility)

```
Webhook /webhook/{lead,guest,visibility}-deep-enrich
    ↓
Supabase: fetch the row
    ↓
External research (Brave Search / Perplexity / Apollo)
    ↓
Sonnet 4.6: synthesise structured enrichment
    ↓
Parse + validate JSON shape
    ↓
Supabase: PATCH the row (sets deep_enriched_at + status='enriched')
    ↓
Telegram notify Krish
    ↓
workflow_runs heartbeat
```

### Confirmed cascade (guests)

```
Webhook /webhook/guest-confirmed-cascade
    ↓
Supabase: fetch the guest
    ↓
Insert 3 tasks (prep / recording / 72h follow-up)
    ↓
Sonnet 4.6: draft 3 promo posts
    ↓
Insert 3 content_ideas (status='pending')
    ↓
Gmail: draft thank-you (if email present)
    ↓
Supabase: upsert contacted_persons
    ↓
Supabase: stamp guests.cascade_fired_at
```

The cascade is idempotent — re-confirming a guest re-fires it (useful
when a transient failure left tasks missing).

## Inspiration lanes (how fresh intel arrives)

`Cleo | Mindmaker OS | Inspiration Sweep` (`D4W5TF1sP9lE828c`, n8n) is the
workflow that turns raw material into `content_ideas` rows with
`source_type='inspiration_sweep'`. It runs twice a day (06:00 ET and 18:00
UTC) and reads two independent lanes:

| Lane | Source | Ledger | Zero-input alert |
|---|---|---|---|
| Gmail newsletters | Gmail label from `system_config.cleo_inspiration_gmail_label`, `newer_than:7d`, 50 listed / 20 new processed per run | `inspiration_messages` (`gmail_message_id`) | `Gmail Zero?` → tier-2 `silent_failures`, `failure_type='no_input'` |
| Drive folder | Drive folder from `system_config.cleo_inspiration_folder_id`, `modifiedTime` within `cleo_inspiration_drive_lookback_days` | `inspiration_drive_files` (`file_id:modifiedTime`) | `Drive Silent?` → tier-2 `silent_failures`, `failure_type='drive_lane_no_content'` |

Both ledgers exist so a source is read exactly once. The Drive key includes
`modifiedTime`, so **editing** a file legitimately re-enters it into the sweep
while an untouched file never does. Drive registration happens *after* the
file reaches the extractor, so a mid-run failure retries rather than silently
marking material read.

The Drive lane carries images and PDFs as well as text. Screenshots are the
common case (LinkedIn posts), so the request has a byte budget:
`cleo_inspiration_max_image_bytes` (raw bytes, base64 inflates ~1.37x) and
`cleo_inspiration_max_images_per_run`. Selection is newest-first; anything cut
is reported as `drive_deferred_over_budget` and left out of the ledger so the
next pass picks it up.

### Checking a lane is alive

```sql
select * from inspiration_lane_health;
```

One row per lane, with `status`:

- `ok` — material arrived and seeds came out of it.
- `input_starved` — nothing arrived in 7 days. Not a bug: no newsletters
  landed, or nothing was dropped in the folder.
- `not_converting` — material arrived and produced **nothing** for a week.
  This is the one to chase. It is the state the Drive lane sat in, unnoticed,
  from 2026-06-25 to 2026-08-19, because the workflow wrote no Drive counters
  at all.

Per-run detail is in the heartbeat metadata:

```sql
select run_at, metadata from workflow_runs
where workflow_id = 'D4W5TF1sP9lE828c' order by run_at desc limit 5;
```

`metadata` carries both lanes: `gmail_listed` / `gmail_new` / `gmail_overflow`
and `drive_listed` / `drive_new` / `drive_selected` / `drive_content_blocks` /
`drive_deferred_over_budget`. `drive_new > 0` with `drive_content_blocks = 0`
means Krish dropped material and none of it reached the model — check Drive
OAuth scope and the binary download.

Two other lanes feed `content_ideas` without Krish providing anything:
`/api/feed/ingest` (daily 11:30 UTC, `source_type='pool_headline'`) and
Cleo's Content Lane Sourcing (`lane_sourcing`). Neither is part of the sweep.

## Runtime truth vs self-reported health

The four tiers below are all written **by the workflows they measure**, and the
heartbeat is the last node in a run. A workflow that dies partway writes no
`workflow_runs` row at all, and no row is indistinguishable from "not scheduled
today". That blind spot hid three broken credentials for three months while
`credential_health` reported 20/20 healthy.

`api/health/fleet-reconcile.ts` (Vercel cron, every 6h) closes it by asking the
**n8n executions API** what actually happened, then writing `workflow_health`.
It runs on Vercel rather than in n8n on purpose: a monitor inside the system it
monitors cannot report its own death.

```sql
select * from fleet_failures;              -- what is broken, grouped by cause
select workflow_name, status, error_rate, last_error_message
from workflow_health where status <> 'healthy' order by errors_28d desc;
```

`status` is `healthy | degraded | failing | dead | idle`. **`dead` includes a
scheduled, active workflow with zero executions in 28 days** — the case no
self-reported heartbeat can ever produce. `failure_class` groups by cause
(`credential | quota | logic | network`) so one expired key is one alert, not
six. Quota is classified before credential deliberately: n8n wraps most non-2xx
errors in "perhaps check your credentials?" and puts the real cause in
`error.description`.

If `N8N_API_KEY` is not set the route returns 503 and says fleet health is
UNKNOWN. It never reports a green fleet it did not look at.

## Content freshness: expiry vs staleness

Two different clocks, and they catch different things.

| | Monday purge (`api/purge/run.ts`) | Staleness archive (`api/content-ideas/archive-stale.ts`) |
|---|---|---|
| Cadence | Mon 14:00 UTC | Daily 10:00 UTC |
| Clock | `expires_at`, set from the seed's temporal class | `state_changed_at`, moved only by a real state transition |
| Measures | is the story still current | has Krish actually moved on it |
| Action | hard delete | `buried_at` + `buried_reason` prefixed `stale:` |
| Skips | drafting / review / approved / published | shift-linked, library-graduated, published |

Staleness deliberately does **not** use `updated_at`: background re-scoring
touches rows constantly, so 74-day-old abandoned items reported "touched 8 days
ago" and nothing looked idle.

**Archived is not forgotten.** `api/shifts/detect.ts` re-admits rows whose
`buried_reason` starts with `stale:` to the trend corpus. Krish stops seeing an
idea he never actioned; the trend gate keeps counting it as the real dated
citation it was. Rows buried for any other reason stay out, and dedupe burials
especially: their citations already live in the keeper's `meta.recurrences`.

## The feedback loop, end to end

```
Krish rejects (FeedbackButton)  ->  feedback_queue
    -> Vera Feedback Aggregation (Sun 06:00), clusters by agent+surface+reason_code
       threshold: 3 matches, or 2 with an explicit reason_code
    -> corrections  (status='analyzed', approval_state='pending')
    -> decisions_waiting kind='correction'
    -> POST api/corrections/approve  ->  edits agents.brief_content
    -> next agent session loads the new rule
```

Every state string above is load-bearing. `decisions_waiting` selects
corrections on `status='analyzed' AND approval_state='pending'`, and the approve
endpoint rejects anything whose `approval_state` is not `pending`. A producer
writing any other vocabulary produces corrections that are invisible and
unapprovable. Vera wrote `open`/`proposed` from the day it shipped until
2026-08-19, which is one of three reasons this loop had never closed.

Nothing auto-applies. A correction changes agent behaviour only after Krish
approves it.

## Self-healing pattern (four tiers)

The OS's hardest class of failure is a workflow that "succeeds" (writes
`workflow_runs.status='success'`) but produces no actual value. Four
tiers catch it. Control Center surfaces the output but does not run these
itself.

| Tier | Detector | Cadence | What it catches |
|---|---|---|---|
| 1 | `completeness_contracts` row per workflow_id, checked by the workflow's terminal node | Real-time per execution | "Did this workflow write at least `expected_min_rows` rows with `expected_columns` populated within `freshness_window_hours`?" |
| 2 | Silent Success Detector (N8N system workflow) | Every 4h | For each (workflow_id, ok=true) run, checks downstream effects (rows inserted in the target table). Zero effects → `silent_failures` row, tier=2. |
| 3 | Critical Infrastructure Monitor (N8N system workflow) | Every 5m | Watches `credential_health`, `system_health`, RLS denials in `audit_log`. Critical issues → `silent_failures` row, tier=3. Surfaced on Home as `CriticalAlertBanner`. |
| 4 | Vera Failure Pattern Sweep | Weekly (Sun 07:00 UTC) | Groups `silent_failures` over the last 7 days by pattern. ≥3 matching failures in same workflow class → `corrections` row → Agatha turns it into a brief edit or standards-registry rule. |

The promise: same silent failure doesn't survive a week.

## Self-improvement loop

```
Krish rejects output in Control Center (FeedbackButton with reason)
    ↓
feedback_queue row
    ↓
Vera Feedback Aggregation (Sun 06:00 UTC)
    ↓
Groups unconsumed rejections by agent + pattern
    ↓
>= 3 matches & confidence > 0.8 → corrections row
    ↓
Agatha reviews corrections weekly
    ↓
Proposes edit to agents.brief_content OR new standards_registry rule
    ↓
render-identity.py (every 15 min) re-renders SKILL.md
OR
regenerate-standards-digest.py (2:30 AM UTC) re-renders standards-digest.md
    ↓
Next agent session wake loads the new rule
```

The promise: same Krish-rejected mistake doesn't survive four occurrences.

The FeedbackButton surfaces: `tasks`, `leads`, `guests`,
`visibility_targets`, `content_ideas`. Each surface routes the feedback
to the right agent and the right standards subset.

## Monitoring writes

### `workflow_runs`

Every N8N execution writes a row (one per execution, success or failure):

```sql
INSERT INTO workflow_runs (
  workflow_id,
  workflow_name,
  agent_id,        -- lowercase slug, must match agents.id
  status,          -- 'running' | 'success' | 'error'
  outcome,         -- optional tag
  cost_usd,
  quality_score,
  duration_ms,
  run_at,
  error_message    -- populated when status='error'
) VALUES (...);
```

> **Legacy columns.** Pre-2026-04-15 rows used `agent` / `started_at` /
> `cost` (renamed to `agent_id` / `run_at` / `cost_usd`). UI queries read
> the new names first and fall back to the legacy names. See ADR-004 for
> the migration story.

### `audit_log`

Every significant event writes a row:

```sql
INSERT INTO audit_log (
  event_type,           -- snake_case, present-tense verb-first
  actor,                -- slug | 'krish' | 'system' | 'vps-pipeline'
  target,               -- optional human-readable subject
  details               -- jsonb or text
) VALUES (
  'task_approved',
  'krish',
  'Cleo LinkedIn draft',
  '{"task_id": "...", "krish_notes": "..."}'
);
```

## Error handling

### N8N execution errors

1. Workflow catches the error in a try/catch node or surfaces it via
   N8N's automatic error workflow.
2. Logs to `workflow_runs` with `status='error'` and the error message.
3. Workflow Monitor (system workflow `ceWoxAIadebfpxvh`) auto-rolls back
   recently deployed proposals that failed.
4. If the failure crosses the silent-success threshold, a tier-2
   `silent_failures` row gets written.
5. If critical, Telegram alert fires to Krish via Agatha bot.

### Webhook failures (pg_net)

1. pg_net retries the webhook automatically (configurable per trigger).
2. Persistent failures write to `audit_log` with `event_type='webhook_failure'`.
3. Kai's Credential Health workflow surfaces patterns of failure linked
   to a specific credential.

### Realtime drops

1. The Supabase JS client auto-reconnects on network blip.
2. Hooks re-fetch on `visibilitychange` to backfill anything missed
   during a tab freeze.
3. A stuck channel is a known failure mode — soft reload picks it up.

## Performance considerations

### Idempotency

Webhooks should be idempotent — processing the same event twice should
not corrupt state. Key patterns:

- **Upserts on natural keys.** `customers` dedupes on
  `(customer_product, stripe_customer_id)` and
  `(customer_product, lower(email))`.
- **Idempotent timestamps.** `cascade_fired_at`, `deep_enriched_at`,
  `promoted_task_id` — set on first run, no-op on subsequent runs.
- **Conditional update guards.** "Set status to enriched only if status
  is new" → avoids cascading state transitions on replay.

### Rate limiting

External API rate limits are enforced inside N8N workflows (Apollo, Brave
Search, Perplexity, Anthropic, OpenAI). Known quirks live in
`system_config.known_quirks` and Kai maintains them.

### Realtime channel reuse

One channel per table per browser session. Reusing the channel is a
performance constraint, not a stylistic preference — Supabase Realtime
charges per concurrent connection and the dashboard hits limits if
careless. See ADR-002.

### Deterministic > LLM for numbers

When an N8N node asks an LLM to count things (revenue MTD, lead counts,
follow-ups due), the LLM will produce *plausible* zeros without DB tool
access. Pattern: fetch the data with a small HTTP node before the LLM
call, OR compute deterministically after parsing. Marcus's
Write-to-Supabase node is the reference implementation.
