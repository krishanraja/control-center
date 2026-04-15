# Data Pipeline

## Event-Driven Architecture

Control Center is the UI layer of MindMaker OS v3's event-driven architecture. Data flows through a pipeline of:

```
Human Action → Supabase → Webhooks → N8N Agents → Supabase → UI
```

## The Event Loop

### 1. Human Input (Control Center)

User takes an action in the UI:
- Approves a task
- Adds notes
- Changes status
- Reviews a proposal

### 2. Supabase Update

The UI writes directly to Supabase:

```typescript
await supabase
  .from('tasks')
  .update({
    status: 'active',
    krish_reviewed: true,
    updated_at: new Date().toISOString()
  })
  .eq('id', taskId)
```

### 3. Webhook Trigger (pg_net)

Supabase database triggers fire webhooks via `pg_net`:

```sql
CREATE OR REPLACE FUNCTION notify_task_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://n8n.example.com/webhook/task-update',
    body := jsonb_build_object(
      'id', NEW.id,
      'status', NEW.status,
      'agent', NEW.agent,
      'old_status', OLD.status
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_update_webhook
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_update();
```

### 4. N8N Agent Processing

N8N workflow receives the webhook and:
- Validates the payload
- Routes to appropriate sub-workflow
- Executes agent logic
- Updates Supabase with results

### 5. UI Realtime Update

Control Center receives the update via `postgres_changes`:

```typescript
supabase
  .channel('tasks-rt-1')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks'
  }, (payload) => {
    // Refetch or update local state
    fetchAll()
  })
  .subscribe()
```

## Agent Types

### Executive Agents

| Agent | Role | Triggers |
|-------|------|----------|
| Agatha | Chief Operating Officer | Task approvals, strategic decisions |
| Marcus | Business Development Intelligence | Market signals, opportunity analysis |

### Operations Agents

| Agent | Role | Triggers |
|-------|------|----------|
| Arlo | Technical Operations & Infrastructure | System health, deployments |
| Vera | Chief of Staff & Quality Assurance | Audits, compliance |
| Leo | Chief Revenue Officer | Revenue tracking, pipeline |
| Priya | Product Strategy | Feature requests, roadmap |
| Kai | Technical Architecture | Code reviews, architecture |

### Growth Agents

| Agent | Role | Triggers |
|-------|------|----------|
| Cleo | Content Production | Content calendar, drafts |
| Maya | Customer Acquisition | Outreach, campaigns |
| Hunter | Job Sourcing | Recruitment, hiring |
| Nova | Community | Engagement, support |
| Felix | Finance | Invoicing, expenses |
| Nell | Networking | Relationships, introductions |
| Zara | BD Signals | Market monitoring |

## Webhook Payloads

### Task Update

```json
{
  "id": "uuid",
  "title": "Task title",
  "status": "active",
  "old_status": "waiting",
  "agent": "arlo",
  "owner": "krish",
  "krish_reviewed": true,
  "krish_notes": "Approved with changes",
  "updated_at": "2026-04-14T21:30:00Z"
}
```

### Task Create

```json
{
  "id": "uuid",
  "title": "New task",
  "status": "active",
  "agent": "agatha",
  "created": "2026-04-14T21:30:00Z"
}
```

## N8N Workflow Patterns

### Task Router

```
Webhook → Switch (by agent) → Agent-specific workflow → Supabase update
```

### Scheduled Audits

```
Cron (hourly) → Query Supabase → Analyze → Create audit_log entry → Update system_health
```

### BD Signal Processing

```
RSS/API Poll → Filter relevance → Create signal → Create task for review
```

## Monitoring

### Workflow Runs Table

Every N8N execution logs to `workflow_runs`:

```sql
INSERT INTO workflow_runs (
  workflow_id,
  workflow_name,
  agent,
  status,
  cost,
  started_at,
  finished_at
) VALUES (...);
```

### Audit Log

All significant events log to `audit_log`:

```sql
INSERT INTO audit_log (
  event_type,
  agent,
  details
) VALUES (
  'task_approved',
  'arlo',
  '{"task_id": "...", "approved_by": "krish"}'
);
```

## Error Handling

### N8N Errors

1. Workflow catches error
2. Logs to `workflow_runs` with `status: 'error'`
3. Updates `system_health` if critical
4. Sends alert to ops-bot

### Webhook Failures

1. pg_net retries 3 times
2. Failed webhooks log to `webhook_failures` table
3. Arlo monitors and alerts

## Performance Considerations

### Debouncing

Multiple rapid updates should be debounced in N8N to prevent cascading workflows.

### Idempotency

Webhooks should be idempotent — processing the same event twice should not cause issues.

### Rate Limiting

N8N workflows should respect external API rate limits (OpenAI, Google, etc.).
