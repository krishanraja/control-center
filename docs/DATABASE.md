# Database Schema

## Overview

Control Center uses Supabase PostgreSQL with realtime subscriptions. All tables support `postgres_changes` for live UI updates.

## Core Tables

### `tasks`

The primary work item table. Tasks represent actionable items assigned to agents or waiting for human review.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `title` | text | Task title |
| `description` | text | Detailed description |
| `status` | text | `active`, `in_progress`, `waiting`, `blocked`, `done` |
| `owner` | text | Human owner (e.g., "krish") |
| `agent` | text | Assigned agent (e.g., "arlo", "agatha") |
| `next_step` | text | Current action required |
| `priority` | text | Priority level |
| `priority_override` | int | Manual priority boost |
| `group_label` | text | Grouping/category |
| `workstream` | text | Business workstream |
| `krish_notes` | text | CEO notes |
| `krish_reviewed` | bool | Has CEO reviewed |
| `due_date` | timestamp | Due date |
| `created` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |
| `started_at` | timestamp | Auto-set when status changes to `in_progress` (DB trigger) |
| `completed_at` | timestamp | Completion time |
| `notes` | text | General notes |
| `feedback_text` | text | Feedback from agents |
| `link_primary` | text | Primary document URL (Google Doc, etc.) |
| `link_secondary` | text | Secondary document URL |
| `evidence` | text | Evidence/artifact path |
| `venture_id` | text | Associated venture/project |

### `agents`

Agent profiles and pod assignments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key — lowercase slug (e.g. `cleo`). Used as the join key on `tasks.agent`, `workflow_runs.agent_id`, and `audit_log.actor` |
| `name` | text | Display name (e.g., "Cleo") |
| `role` | text | Job title |
| `pod` | text | Pod assignment (`executive`, `ops`, `growth`) |
| `active` | bool | Is the agent in the active roster |
| `mandate` | text | Mandate / operating charter |
| `mission` | text | Mission statement (surfaced in Org detail) |
| `personality` | text | Personality brief |
| `brief_content` | text | Long-form brief content |
| `last_run` | timestamp | Last known execution |
| `last_output` | text | Last output summary |
| `expected_runs_per_day` | int | Expected cadence (used for freshness checks) |
| `created_at` | timestamp | Creation time |

### `goals`

Weekly/monthly goals with progress tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `title` | text | Goal title |
| `current` | text | Current status description |
| `progress` | int | Progress percentage (0-100) |
| `status` | text | `active`, `done`, `paused` |
| `period` | text | `weekly`, `monthly`, `quarterly` |
| `created_at` | timestamp | Creation time |

### `home_intelligence`

Intelligence briefs and revenue data for the Home dashboard. Singleton row keyed by `id = 'current'`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key — typically `current` |
| `summary` | text | JSON-encoded `{ headline, body, recommended_focus }`. Stored as `text`, not `jsonb` — parse defensively |
| `metrics` | jsonb | Array of `{ id, label, value, progress_pct, sub? }` KPI tiles rendered on Home |
| `updated_at` | timestamp | Last refresh time |

### `audit_log`

Activity feed for all system events.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `event_type` | text | Event type identifier |
| `actor` | text | Who triggered the event — agent slug, `krish`, or `system` |
| `target` | text | Optional subject of the event (e.g. `Google Drive Sync`) |
| `details` | jsonb \| text | Event details; may be a plain string, `{message}`, or `{summary}` |
| `created_at` | timestamp | Event time |

### `system_health`

Infrastructure monitoring data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `system_name` | text | System identifier |
| `status` | text | `healthy`, `warning`, `critical`, `down` |
| `message` | text | Status message |
| `last_check` | timestamp | Last health check time |
| `metadata` | jsonb | Additional data |

### `workflow_runs`

N8N workflow execution history.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workflow_id` | text | N8N workflow ID |
| `workflow_name` | text | Human-readable name |
| `agent_id` | text | Owning agent slug (lowercase, matches `agents.id`) |
| `status` | text | `running`, `success`, `error` |
| `outcome` | text | Outcome tag (optional, e.g. `draft_posted`) |
| `cost_usd` | decimal | Execution cost in USD |
| `quality_score` | decimal | Optional quality score |
| `duration_ms` | int | Execution duration in milliseconds |
| `run_at` | timestamp | Run start time (primary sort key) |
| `error_message` | text | Error details if failed |
| `created_at` | timestamp | Row insertion time |

> **Legacy columns.** Prior to 2026-04-15 this table used `agent` (renamed → `agent_id`) and `started_at` (renamed → `run_at`). Rows written before the migration may still have the old column values populated. UI queries should read `agent_id`/`run_at` first and fall back to the legacy names only when rehydrating historical data. See `src/components/desktop/DesktopOrg.tsx` for the fallback pattern.

### `ventures`

Business ventures/projects for task grouping.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Venture name |
| `slug` | text | URL-safe identifier |
| `status` | text | `active`, `paused`, `archived` |

### `signals`

External BD signals from market monitoring.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `title` | text | Signal title |
| `source` | text | Source URL |
| `source_type` | text | `linkedin`, `news`, `job_board`, etc. |
| `summary` | text | Signal summary |
| `relevance_score` | int | 0-100 relevance |
| `created_at` | timestamp | Discovery time |

## Realtime Subscriptions

The UI subscribes to these tables via `postgres_changes`:

```typescript
supabase
  .channel('unique-channel-name')
  .on('postgres_changes', { 
    event: '*', 
    schema: 'public', 
    table: 'tasks' 
  }, callback)
  .subscribe()
```

## Indexes

### Active Indexes (Added 2026-04-15)

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_tasks_status_updated_at` | `status`, `updated_at` | Faster dashboard loads |
| `idx_tasks_agent_status` | `agent`, `status` | Faster agent workload views |
| `idx_tasks_venture_status` | `venture_id`, `status` | Faster venture health cards |
| `idx_audit_log_actor_created_at` | `actor`, `created_at` | Faster activity feeds |
| `idx_workflow_runs_agent_run_at` | `agent_id`, `run_at` | Faster agent economics view |

### Legacy Indexes

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_agent ON tasks(agent);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX idx_tasks_venture_id ON tasks(venture_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_system_health_status ON system_health(status);
```

## Database Triggers

### `started_at` Auto-Stamp Trigger

When a task's status changes to `in_progress`, the database automatically sets `started_at` to the current timestamp. This enables cycle time tracking (`completed_at - started_at = actual work duration`).

```sql
CREATE OR REPLACE FUNCTION stamp_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND (OLD.status IS DISTINCT FROM 'in_progress') THEN
    NEW.started_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_stamp_started_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION stamp_started_at();
```

## Row Level Security (RLS)

Currently using service role key for full access. For production multi-tenant:

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's tasks"
ON tasks FOR SELECT
USING (org_id = auth.jwt()->>'org_id');
```
