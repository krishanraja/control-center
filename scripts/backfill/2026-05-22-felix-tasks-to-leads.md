# Backfill — migrate Felix's advisory_sales tasks into the `leads` table

**One-off.** Today the 4 tasks with `workstream='advisory_sales'` (Disney,
Marketbridge, Alma Media, Vertex) are Felix's enterprise outreach. They
should live in `leads` (the unit of action) with the tasks marked
superseded and linked back via `promoted_task_id`.

## Pre-check

```sql
SELECT id, title, status, agent, updated_at
  FROM tasks
 WHERE workstream = 'advisory_sales' AND status != 'done';
```

Expected: 4 rows with titles like `Outreach: <Company> — <revenue>`.

```sql
SELECT count(*) FROM leads;
```

Expected: 0.

## Run — one-shot SQL

```sql
WITH src AS (
  SELECT
    id  AS task_id,
    title,
    -- Title shape: "Outreach: <Company> — <revenue tag>"
    trim(split_part(split_part(title, ':', 2), '—', 1)) AS company,
    nullif(trim(split_part(title, '—', 2)), '')         AS revenue_tag,
    agent,
    updated_at
  FROM tasks
  WHERE workstream = 'advisory_sales' AND status != 'done'
),
inserted AS (
  INSERT INTO leads (
    id, full_name, company, source_type, source_ref, status,
    assignee_agent, why_relevant, next_step,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    NULL,
    s.company,
    'manual',
    s.task_id::text,
    'ready',
    coalesce(s.agent, 'felix'),
    'Enterprise advisory target' || coalesce(' — ' || s.revenue_tag, ''),
    'Map decision maker, schedule intro call',
    now(),
    now()
  FROM src s
  RETURNING id, source_ref
)
UPDATE tasks t
   SET status = 'superseded', updated_at = now()
  FROM inserted i
 WHERE t.id::text = i.source_ref;

-- Link the lead back to the (now-superseded) task via promoted_task_id
UPDATE leads l
   SET promoted_task_id = l.source_ref::uuid
 WHERE l.source_ref IS NOT NULL
   AND EXISTS (SELECT 1 FROM tasks t WHERE t.id::text = l.source_ref);
```

## Verify

```sql
SELECT full_name, company, assignee_agent, status, promoted_task_id
  FROM leads
 ORDER BY created_at DESC
 LIMIT 5;
```

Expected: 4 rows, all `assignee_agent='felix'`, all `status='ready'`,
all with `promoted_task_id` set.

```sql
SELECT id, title, status FROM tasks WHERE workstream='advisory_sales';
```

Expected: 4 rows, all `status='superseded'`.

## Roll-back

```sql
-- Restore tasks
UPDATE tasks SET status='waiting'
 WHERE workstream='advisory_sales' AND status='superseded';

-- Drop the manually-created leads
DELETE FROM leads WHERE source_type='manual' AND assignee_agent='felix';
```
