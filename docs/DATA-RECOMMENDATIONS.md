# Data Pipeline & Supabase Improvement Recommendations

> Recommendations for enhancing the Control Center data infrastructure to unlock additional BI capabilities and improve operational efficiency.

## Priority 1: Critical Data Gaps

### 1.1 Populate `venture_id` on Tasks

**Current State**: The `venture_id` field exists but is rarely populated, preventing venture-based filtering and health tracking.

**Recommendation**:
- Add `venture_id` to task creation workflows in N8N
- Create a migration script to backfill existing tasks based on title/group_label patterns
- Add a venture dropdown in the task detail UI for manual assignment

**Impact**: Enables Venture Health cards, venture filtering in Plans, and venture-based reporting.

```sql
-- Backfill example
UPDATE tasks 
SET venture_id = 'mindmaker' 
WHERE title ILIKE '%mindmaker%' OR group_label ILIKE '%mindmaker%';
```

### 1.2 Add `source_url` to BD Signals

**Current State**: BD signals (tasks from `bd-agent` or `zara`) don't consistently have source URLs.

**Recommendation**:
- Ensure all BD signal creation workflows include `link_primary` with the source URL
- Add `source_type` field (`linkedin`, `news`, `job_board`, `twitter`, etc.)
- Store raw scraped content in `evidence` field

**Impact**: Enables "Read Source" links in Market Signals feed.

### 1.3 Revenue Data Pipeline

**Current State**: `home_intelligence` table exists but has no revenue data.

**Recommendation**:
- Create N8N workflow to pull MRR from Stripe/payment provider
- Store daily snapshots in `home_intelligence` with `type: 'revenue_pulse'`
- Include breakdown by product/venture

**Schema Addition**:
```sql
INSERT INTO home_intelligence (type, headline, summary, data) VALUES (
  'revenue_pulse',
  '$12,450 MRR',
  'Up 8% from last month. MindMaker Leaders driving growth.',
  '{"mrr": 12450, "growth_pct": 8, "by_product": {"leaders": 8200, "sprints": 4250}}'
);
```

## Priority 2: Enhanced Analytics

### 2.1 Task Velocity Metrics

**Current State**: No tracking of task completion velocity.

**Recommendation**:
- Add `started_at` timestamp to tasks (when moved to `in_progress`)
- Calculate cycle time: `completed_at - started_at`
- Calculate lead time: `completed_at - created`
- Store weekly aggregates in a `metrics` table

**New Table**:
```sql
CREATE TABLE task_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  tasks_created int,
  tasks_completed int,
  avg_cycle_time_hours decimal,
  avg_lead_time_hours decimal,
  by_agent jsonb,
  by_status jsonb
);
```

### 2.2 Agent Performance Scoring

**Current State**: Agent workloads visible but no performance metrics.

**Recommendation**:
- Track tasks completed per agent per week
- Track average response time (time from `waiting` to action)
- Track error rate from `workflow_runs`
- Create agent scorecards

**New Table**:
```sql
CREATE TABLE agent_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  week_start date NOT NULL,
  tasks_completed int,
  avg_response_hours decimal,
  workflow_runs int,
  workflow_errors int,
  total_cost decimal,
  UNIQUE(agent, week_start)
);
```

### 2.3 Blocker Analysis

**Current State**: Aging blockers shown but no root cause analysis.

**Recommendation**:
- Add `blocked_reason` field to tasks
- Categorize blockers: `waiting_on_external`, `waiting_on_krish`, `technical_issue`, `dependency`
- Track blocker resolution time
- Create blocker trends report

### 2.4 Goal Progress Automation

**Current State**: Goal progress is manually updated.

**Recommendation**:
- Link goals to tasks via `goal_id` field
- Auto-calculate progress based on linked task completion
- Create goal-task relationship table

```sql
CREATE TABLE goal_tasks (
  goal_id uuid REFERENCES goals(id),
  task_id uuid REFERENCES tasks(id),
  weight decimal DEFAULT 1.0,
  PRIMARY KEY (goal_id, task_id)
);
```

## Priority 3: Infrastructure Improvements

### 3.1 Realtime Channel Optimization — ✅ Resolved

`useRealtimeTasks` now maintains a single module-level Supabase channel
(`tasks-rt-shared`) and a shared task cache. All consumers subscribe through
the cache and filter client-side, so there is at most one `tasks` channel per
browser session regardless of how many components mount the hook. See
`src/hooks/useRealtimeTasks.ts`.

### 3.2 Database Indexes

**Current State**: Unknown index coverage.

**Recommendation**:
```sql
-- High-impact indexes
CREATE INDEX idx_tasks_status_updated ON tasks(status, updated_at DESC);
CREATE INDEX idx_tasks_agent_status ON tasks(agent, status);
CREATE INDEX idx_tasks_venture_status ON tasks(venture_id, status);
CREATE INDEX idx_audit_log_agent_created ON audit_log(agent, created_at DESC);
CREATE INDEX idx_workflow_runs_agent_started ON workflow_runs(agent, started_at DESC);
```

### 3.3 Data Retention Policy

**Current State**: All data retained indefinitely.

**Recommendation**:
- Archive `audit_log` entries older than 90 days to cold storage
- Archive completed tasks older than 6 months
- Keep `workflow_runs` for 30 days, aggregate older data

```sql
-- Archive old audit logs
INSERT INTO audit_log_archive 
SELECT * FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';
```

### 3.4 Materialized Views for Dashboards

**Current State**: Dashboard queries run against raw tables.

**Recommendation**:
```sql
CREATE MATERIALIZED VIEW dashboard_summary AS
SELECT 
  COUNT(*) FILTER (WHERE status = 'active') as active_tasks,
  COUNT(*) FILTER (WHERE status = 'blocked') as blocked_tasks,
  COUNT(*) FILTER (WHERE status = 'waiting') as waiting_tasks,
  COUNT(*) FILTER (WHERE status = 'done' AND completed_at > NOW() - INTERVAL '7 days') as completed_this_week,
  COUNT(DISTINCT agent) as active_agents
FROM tasks
WHERE status != 'done' OR completed_at > NOW() - INTERVAL '7 days';

-- Refresh every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refresh-dashboard', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW dashboard_summary');
```

## Priority 4: New Data Sources

### 4.1 External Integrations

| Source | Data | Use Case |
|--------|------|----------|
| Stripe | MRR, churn, LTV | Revenue Pulse |
| Google Analytics | Traffic, conversions | Growth metrics |
| Calendly | Meeting volume | Leo's KPIs |
| GitHub | Commits, PRs | Arlo's velocity |
| N8N API | Workflow stats | Agent economics |

### 4.2 Sentiment Analysis

**Recommendation**:
- Run sentiment analysis on `feedback_text` and `krish_notes`
- Store sentiment scores for trend analysis
- Alert on negative sentiment patterns

### 4.3 Time Tracking

**Recommendation**:
- Add `time_spent_minutes` to tasks
- Track via N8N workflow execution time
- Enable cost-per-task analysis

## Implementation Roadmap

| Phase | Items | Timeline |
|-------|-------|----------|
| 1 | Venture ID backfill, BD signal source URLs | Week 1 |
| 2 | Revenue pipeline, database indexes | Week 2 |
| 3 | Task velocity metrics, agent performance | Week 3-4 |
| 4 | Materialized views, data retention | Week 5 |
| 5 | External integrations | Ongoing |

## Monitoring Recommendations

1. **Query Performance**: Enable `pg_stat_statements` to identify slow queries
2. **Realtime Load**: Monitor Supabase realtime connection count
3. **Webhook Reliability**: Track webhook success/failure rates
4. **Data Freshness**: Alert if `system_health` hasn't updated in 2 hours
