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
| `id` | uuid | Primary key |
| `name` | text | Agent name (e.g., "Arlo") |
| `slug` | text | Lowercase identifier |
| `role` | text | Job title |
| `pod` | text | Pod assignment (`executive`, `operations`, `growth`) |
| `status` | text | `active`, `paused`, `archived` |
| `avatar_color` | text | Avatar background color |
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

Intelligence briefs and revenue data for the Home dashboard.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `type` | text | `revenue_pulse`, `brief`, `metric` |
| `headline` | text | Main headline |
| `summary` | text | Summary text |
| `data` | jsonb | Structured data payload |
| `created_at` | timestamp | Creation time |

### `audit_log`

Activity feed for all system events.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `event_type` | text | Event type identifier |
| `agent` | text | Agent that triggered event |
| `details` | jsonb | Event details |
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
| `agent` | text | Owning agent |
| `status` | text | `running`, `success`, `error` |
| `cost` | decimal | Execution cost |
| `started_at` | timestamp | Start time |
| `finished_at` | timestamp | End time |
| `error_message` | text | Error details if failed |

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

## Indexes (Recommended)

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_agent ON tasks(agent);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX idx_tasks_venture_id ON tasks(venture_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_system_health_status ON system_health(status);
```

## Row Level Security (RLS)

Currently using service role key for full access. For production multi-tenant:

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's tasks"
ON tasks FOR SELECT
USING (org_id = auth.jwt()->>'org_id');
```
