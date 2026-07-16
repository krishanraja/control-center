# API Reference

> **Scope.** Common Supabase query patterns and Realtime subscriptions
> used by Control Center. Plus a directory of the Vercel serverless
> functions under `api/`. Not exhaustive — for the canonical schema, see
> [`DATABASE.md`](./DATABASE.md); for the per-tab data contracts, see
> [`PRODUCT.md`](./PRODUCT.md).

## Supabase client

Two clients exist:

**Browser** (`src/lib/supabase.ts`) — uses the anon key. Subject to RLS.

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

**Server** (`api/_supabase.ts`) — uses the service-role key. Bypasses
RLS. Only ever imported from `api/*` files.

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

> **ESM gotcha.** Because `package.json` declares `"type": "module"`, the
> import inside `api/*` must include the `.js` extension:
> `import { supabase } from './_supabase.js'`. Without it, Vercel returns
> a silent 500 on the deployed function.

## Query patterns

### Tasks

```typescript
// Fetch active
await supabase
  .from('tasks')
  .select('*')
  .neq('status', 'done')
  .order('updated_at', { ascending: false })

// Approve (mark in_progress)
await supabase
  .from('tasks')
  .update({
    status: 'in_progress',
    krish_reviewed: true,
    updated_at: new Date().toISOString()
  })
  .eq('id', taskId)

// Mark done — the DB trigger auto-stamps completed_at
await supabase
  .from('tasks')
  .update({
    status: 'done',
    krish_reviewed: true
  })
  .eq('id', taskId)
```

### Leads (PR #53 multi-tag)

```typescript
// Per-venture lane
await supabase
  .from('leads')
  .select('*')
  .eq('primary_venture', 'mindmaker')
  .is('promoted_task_id', null)
  .order('icp_scores->mindmaker', { ascending: false })

// Schedule follow-up
await supabase
  .from('leads')
  .update({ follow_up_at: new Date(Date.now() + 7 * 86400_000).toISOString() })
  .eq('id', leadId)

// Promote (use the /api/leads/promote endpoint — it sets promoted_task_id atomically)
await fetch('/api/leads/promote', {
  method: 'POST',
  body: JSON.stringify({ leadId })
})
```

### Guests (PR #52)

```typescript
// Enriched and waiting for Krish
await supabase
  .from('guests')
  .select('*')
  .eq('status', 'enriched')
  .order('deep_enriched_at', { ascending: false })

// Confirm (via /api endpoint to fire the cascade)
await fetch('/api/guests/confirm', {
  method: 'POST',
  body: JSON.stringify({ guestId })
})
```

### Visibility targets

```typescript
await supabase
  .from('visibility_targets')
  .select('*')
  .in('status', ['new', 'enriched'])
  .order('fit_score', { ascending: false })
```

### Customers

```typescript
// Total MRR
const { data } = await supabase
  .from('customers')
  .select('mrr_usd')
  .eq('customer_kind', 'paid')

const mrr = (data ?? []).reduce((sum, c) => sum + Number(c.mrr_usd ?? 0), 0)

// By attribution channel
await supabase
  .from('customers')
  .select('attribution_channel, mrr_usd')
  .eq('customer_kind', 'paid')
```

### Bets

```typescript
// Live bets
await supabase
  .from('bets')
  .select('*')
  .eq('status', 'live')
  .order('opened_at', { ascending: false })

// 90-day hit rate
const since = new Date(Date.now() - 90 * 86400_000).toISOString()
await supabase
  .from('bets')
  .select('status')
  .gte('closed_at', since)
  .neq('status', 'live')
```

### Content ideas

```typescript
// Pending review
await supabase
  .from('content_ideas')
  .select('*')
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
```

### Decisions waiting (the unified view)

```typescript
// The single panel anchoring Home
await supabase
  .from('decisions_waiting')
  .select('*')
  .order('age_hours', { ascending: false })
  .limit(50)
```

The view returns a uniform shape per row:
`{ kind, id, title, agent, age_hours, link, meta jsonb }`. The `meta`
jsonb carries the per-kind enrichment (pitch_draft preview,
suggested_angles, tier, fit_score, etc.) so the panel renders rich
previews without joining the source tables.

### Agents

```typescript
// Active roster
await supabase
  .from('agents')
  .select('*')
  .eq('active', true)
  .order('pod', { ascending: true })
```

### Home intelligence

```typescript
// Singleton row
await supabase
  .from('home_intelligence')
  .select('*')
  .eq('id', 'current')
  .single()
```

The `summary` column is JSON-encoded *text*, not jsonb — parse
defensively.

### Audit log

```typescript
// Recent activity (cross-actor)
await supabase
  .from('audit_log')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20)

// Per-agent activity (token expansion — see AGENTS.md slug-as-key)
await supabase
  .from('audit_log')
  .select('*')
  .in('actor', ['cleo', 'Cleo'])
  .order('created_at', { ascending: false })
  .limit(10)
```

### Workflow runs

```typescript
// Recent (handles legacy column fallback)
const { data } = await supabase
  .from('workflow_runs')
  .select('id, workflow_id, workflow_name, agent_id, agent, status, cost_usd, cost, run_at, started_at, error_message')
  .order('run_at', { ascending: false })
  .limit(50)

const normalised = (data ?? []).map(r => ({
  ...r,
  agent_id: r.agent_id ?? r.agent,
  cost_usd: r.cost_usd ?? r.cost,
  run_at: r.run_at ?? r.started_at
}))
```

See [ADR-004](./DECISIONS/004-agent-id-rename.md) for the legacy
fallback rationale.

### Silent failures

```typescript
// Tier-3 critical (anchors CriticalAlertBanner)
await supabase
  .from('silent_failures')
  .select('*')
  .eq('tier', 3)
  .is('resolved_at', null)
  .order('detected_at', { ascending: false })
```

### System health

```typescript
await supabase
  .from('system_health')
  .select('*')
  .order('system_name', { ascending: true })
```

## Realtime subscriptions

The dashboard uses one shared channel per table (ADR-002). Open the
channel once per browser session and fan it out via context or hook.

```typescript
const channel = supabase
  .channel('tasks-rt-shared')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks'
  }, (payload) => {
    // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    // payload.new: new row data
    // payload.old: old row data (for UPDATE/DELETE)
  })
  .subscribe()

// Cleanup on unmount
supabase.removeChannel(channel)
```

For the `decisions_waiting` view, subscribe to each source table that
the view unions and re-query the view on change:

```typescript
supabase
  .channel('decisions-rt-shared')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refetch)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, refetch)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, refetch)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'visibility_targets' }, refetch)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'content_ideas' }, refetch)
  .subscribe()
```

## Error handling

```typescript
const { data, error } = await supabase.from('tasks').select('*')

if (error) {
  console.error('Supabase error:', error.message)
  // error.code: PostgreSQL error code (e.g. '42501' RLS denial)
  // error.details: Additional details
  // error.hint: Suggestion for fixing
}
```

RLS denials (`error.code === '42501'`) are common when a mutation should
have routed through `/api/*` instead of the anon-key client. Don't catch
and ignore — surface a toast so Krish knows the write failed.

## Pagination

```typescript
const PAGE_SIZE = 20

const { data, count } = await supabase
  .from('tasks')
  .select('*', { count: 'exact' })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  .order('updated_at', { ascending: false })

const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)
```

## Full-text search

```typescript
await supabase
  .from('tasks')
  .select('*')
  .textSearch('title', 'deployment plan', { type: 'websearch' })
```

---

## Vercel serverless functions (`api/*`)

Used when the browser client cannot do the job — service-role writes,
webhook fan-out, third-party API calls that need server-only secrets.
All `api/*` functions auto-deploy on push to `main`.

### Auth

| Surface | Auth |
|---|---|
| Reads (every tab) | Anon key + RLS |
| Most writes | Anon key + RLS |
| Service-role mutations | `/api/*` Vercel functions (carry `SUPABASE_SERVICE_ROLE_KEY`) |
| Inbound sync from VPS | `x-sync-secret` header against `SYNC_SECRET` env |
| Inbound webhooks from N8N | Shared secret per endpoint |
| AskMarcus chat | Anthropic API key server-side |

### Endpoint directory

| Endpoint | Purpose |
|---|---|
| `/api/agents` | Roster summary |
| `/api/agents/[name]` | Per-agent detail (brief + tasks + drive sync state) |
| `/api/acquisition/overview` | Growth tab read spine: per-lane funnel, touch progress, autonomy, churn queue, frame conversion, content attribution (service-role — sends carry PII) |
| `/api/acquisition/sends` | Queued-send list + batch approve/reject (`{ids[], action}`); approve pings the n8n dispatcher, reject feeds `feedback_queue` |
| `/api/acquisition/sequences` | Sequence proposals: approve / reject / amend (edit touches in place while `proposed`) |
| `/api/acquisition/lanes/[slug]` | Lane control plane: promote (mechanical 422 gates + unoverridable profit gate) / demote / pause / resume / set_budget (Gate 4) / set_voice |
| `/api/acquisition/governor` | Per-lane economics + budget burn; 6h Vercel cron evaluates 80% warn / 100% circuit-breaker |
| `/api/acquisition/replies` | Nurture reply inbox: list + draft product-brand reply / close |
| `/api/ask-marcus` | Anthropic-backed Q&A grounded in customers/leads/bets/home_intelligence |
| `/api/approvals` | Approval queue |
| `/api/approvals/*` | Per-resource approval flows |
| `/api/automations` | Workflow automation status |
| `/api/bets/*` | Bet placement + close |
| `/api/content-ideas` | Cleo idea backlog read + write (`PATCH` incl. `body`, sanitized) |
| `/api/content-ideas/:id/materials` | GET/POST/DELETE the piece's research corpus (`meta.materials[]`) |
| `/api/content-ideas/:id/chat` | Cleo writing-partner chat (multi-turn, grounded in draft + materials) |
| `/api/content-ideas/:id/save-draft` | Composer end CTA: sanitize + save body, fire content factory → Doc + Telegram, → `review` |
| `/api/content-ideas/:id/{revise,challenge,score,dive-deeper,transform}` | Refine / enrich / Five-Standards / scoped research / lane variants |
| `/api/corrections/*` | Correction-loop endpoints |
| `/api/customer-contacts/*` | Customer conversation log |
| `/api/data` | Aggregated dashboard payload |
| `/api/feedback` | Routes rejections into `feedback_queue` |
| `/api/goals` | Weekly/monthly goals |
| `/api/guests/*` | Guest CRUD, confirm cascade |
| `/api/health` | Live aggregate health (worst component wins) |
| `/api/leads/*` | Lead CRUD, promote, deep-enrich trigger |
| `/api/metrics` | KPI tile data |
| `/api/nell-candidates/*` | Legacy endpoint kept for back-compat (table dropped in PR #56; redirects to `/api/guests/*`) |
| `/api/refresh-health` | Force a health re-check |
| `/api/reject` | Generic reject handler (writes feedback_queue) |
| `/api/skills/*` | Skill Forge endpoints (OpenAI-backed) |
| `/api/status` | N8N workflow + execution status snapshot |
| `/api/sync` | Inbound write from the VPS sync pipeline (guarded by `SYNC_SECRET`) |
| `/api/sync-brief` | Inbound write for `agents.brief_content` edits |
| `/api/task` | Task CRUD |
| `/api/today` | Today-tab payload |
| `/api/trigger-agent` | Manual agent trigger (inserts a task, pg_net fires N8N) |

**Direct (non-n8n) mode.** The enrich/draft/briefing actions normally proxy to
n8n, but accept a `{ "mode": "direct" }` body to bypass n8n and run server-side
(active while n8n is down until ~Jul 1). Direct paths:

| Endpoint | Direct behavior |
|---|---|
| `POST /api/{leads,contacts}/:id/enrich` | Apollo + PDL + web → Claude research brief into `raw_extraction.direct_research`; auto-falls back to direct if the n8n webhook errors |
| `POST /api/{leads,guests,contacts,customers}/:id/draft-email` | Composes a Gmail **draft** via `api/_google.ts` (service-account DWD, `krish@themindmaker.ai`); never sends |
| `POST /api/guests/:id/briefing` | Generates a Google Doc briefing; sets `briefing_doc_url` + `briefing_status='ready'` |

Apollo lead **search + bulk reveal** (not exposed as an API route) runs via
`scripts/apollo/burn.ts` — see `docs/APOLLO_CREDIT_BURNDOWN.md`.
