# API Reference

## Supabase Client

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://gojpffsrxybbpbdzzrvs.supabase.co',
  'your-anon-key'
)
```

## Tasks API

### Fetch All Tasks

```typescript
const { data, error } = await supabase
  .from('tasks')
  .select('*')
  .order('updated_at', { ascending: false })
```

### Fetch Tasks by Status

```typescript
const { data } = await supabase
  .from('tasks')
  .select('*')
  .in('status', ['waiting', 'blocked'])
  .order('updated_at', { ascending: false })
```

### Fetch Tasks by Agent

```typescript
const { data } = await supabase
  .from('tasks')
  .select('*')
  .eq('agent', 'arlo')
  .neq('status', 'done')
```

### Update Task Status

```typescript
const { error } = await supabase
  .from('tasks')
  .update({
    status: 'active',
    krish_reviewed: true,
    updated_at: new Date().toISOString()
  })
  .eq('id', taskId)
```

### Mark Task Done

```typescript
const { error } = await supabase
  .from('tasks')
  .update({
    status: 'done',
    krish_reviewed: true,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .eq('id', taskId)
```

### Add Notes to Task

```typescript
const { error } = await supabase
  .from('tasks')
  .update({
    krish_notes: 'Approved with minor changes needed',
    krish_reviewed: true,
    updated_at: new Date().toISOString()
  })
  .eq('id', taskId)
```

## Agents API

### Fetch All Agents

```typescript
const { data } = await supabase
  .from('agents')
  .select('*')
  .eq('status', 'active')
  .order('pod', { ascending: true })
```

### Fetch Agent Workloads

```typescript
const { data } = await supabase
  .from('tasks')
  .select('agent, status')
  .neq('status', 'done')

// Group by agent and status in JS
const workloads = data.reduce((acc, task) => {
  if (!acc[task.agent]) acc[task.agent] = { active: 0, waiting: 0, blocked: 0 }
  if (task.status === 'active' || task.status === 'in_progress') acc[task.agent].active++
  else if (task.status === 'waiting') acc[task.agent].waiting++
  else if (task.status === 'blocked') acc[task.agent].blocked++
  return acc
}, {})
```

## Goals API

### Fetch Weekly Goals

```typescript
const { data } = await supabase
  .from('goals')
  .select('*')
  .eq('period', 'weekly')
  .eq('status', 'active')
```

### Update Goal Progress

```typescript
const { error } = await supabase
  .from('goals')
  .update({ progress: 75 })
  .eq('id', goalId)
```

## Intelligence API

### Fetch Home Intelligence

```typescript
const { data } = await supabase
  .from('home_intelligence')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10)
```

### Fetch Revenue Pulse

```typescript
const { data } = await supabase
  .from('home_intelligence')
  .select('*')
  .eq('type', 'revenue_pulse')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()
```

## Audit Log API

### Fetch Recent Activity

```typescript
const { data } = await supabase
  .from('audit_log')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20)
```

### Fetch Activity by Agent

```typescript
const { data } = await supabase
  .from('audit_log')
  .select('*')
  .eq('agent', 'arlo')
  .order('created_at', { ascending: false })
  .limit(10)
```

## System Health API

### Fetch All Systems

```typescript
const { data } = await supabase
  .from('system_health')
  .select('*')
  .order('system_name', { ascending: true })
```

### Fetch Unhealthy Systems

```typescript
const { data } = await supabase
  .from('system_health')
  .select('*')
  .in('status', ['warning', 'critical', 'down'])
```

## Workflow Runs API

Column naming reference: as of 2026-04-15 the owning-agent column is `agent_id`
(text, lowercase slug matching `agents.id`) and the run timestamp is `run_at`.
Legacy `agent`/`started_at` columns may still hold historical rows — see
`docs/DATABASE.md#workflow_runs` for the fallback pattern.

### Fetch Recent Runs

```typescript
const { data } = await supabase
  .from('workflow_runs')
  .select('*')
  .order('run_at', { ascending: false })
  .limit(50)
```

### Fetch Agent Costs

```typescript
const { data } = await supabase
  .from('workflow_runs')
  .select('agent_id, cost_usd')
  .gte('run_at', thirtyDaysAgo)

// Sum by agent in JS
const costs = (data || []).reduce((acc, run) => {
  const k = run.agent_id || 'system'
  acc[k] = (acc[k] || 0) + (run.cost_usd || 0)
  return acc
}, {} as Record<string, number>)
```

## Realtime Subscriptions

### Subscribe to Tasks

```typescript
const channel = supabase
  .channel('tasks-realtime')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'tasks' },
    (payload) => {
      console.log('Task changed:', payload)
      // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      // payload.new: new row data
      // payload.old: old row data (for UPDATE/DELETE)
    }
  )
  .subscribe()

// Cleanup
supabase.removeChannel(channel)
```

### Subscribe to System Health

```typescript
const channel = supabase
  .channel('health-realtime')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'system_health' },
    (payload) => {
      if (payload.new.status === 'critical') {
        // Alert!
      }
    }
  )
  .subscribe()
```

### Subscribe to Multiple Tables

```typescript
const channel = supabase
  .channel('dashboard-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handleTasks)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, handleAudit)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'system_health' }, handleHealth)
  .subscribe()
```

## Error Handling

```typescript
const { data, error } = await supabase
  .from('tasks')
  .select('*')

if (error) {
  console.error('Supabase error:', error.message)
  // error.code: PostgreSQL error code
  // error.details: Additional details
  // error.hint: Suggestion for fixing
}
```

## Pagination

```typescript
const PAGE_SIZE = 20

const { data, count } = await supabase
  .from('tasks')
  .select('*', { count: 'exact' })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  .order('updated_at', { ascending: false })

const totalPages = Math.ceil(count / PAGE_SIZE)
```

## Full-Text Search

```typescript
const { data } = await supabase
  .from('tasks')
  .select('*')
  .textSearch('title', 'deployment plan', { type: 'websearch' })
```
