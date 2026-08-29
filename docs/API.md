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
  .eq('primary_venture', 'mindmake')
  .is('promoted_task_id', null)
  .order('icp_scores->mindmake', { ascending: false })

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
| `/api/goals` | PATCH only (`team_focus` + goal mutations). GET was retired 2026-08-11 and now 410s; use `/api/goals/ladder` |
| `/api/revenue` | The two revenue figures: cash collected and committed MRR. Reads the service-role revenue tables |
| `/api/revenue/sync` | Cron (`0 8 * * *`) + POST backstop. Pulls balance transactions and subscriptions from Stripe. Needs `STRIPE_API_KEY` |
| `/api/spend` | The money-out summary: month total (USD, receipts truth), 6-month trend, ranked per-service costs, connections state, renewals due, needs-review count, plus `spenders` (the top metered units over 30 days — actors, workflows and agents in one ranked list, with `silent` naming any provider the meter has no rows for) and `cycles` (each plan's prepaid allowance and where this billing cycle sits inside it). Reads the service-role spend tables |
| `/api/spend/ingest` | Cron (`15 7 * * *`) + POST backstop. Reads the Gmail "Subscriptions" label via the DWD service account (needs the `gmail.readonly` scope on the grant; 503s loudly until then), parses each receipt with one Haiku call (metered), writes `spend_invoices`, nudges Telegram on annual renewals ~14d out and on a ballooning month. `?backfill=<1-12>` widens the window idempotently |
| `/api/meter/apify-sync` | Cron (`5 * * * *`) + POST. Pages `/v2/actor-runs` from a whole-UTC-day cursor, rolls `usageTotalUsd` up by actor × day × run origin (passed through verbatim — the first live sync returned API, MCP and WEB), joins `apify_actor_registry` for `task_category`, and replaces those days in `meter_daily` (idempotent by construction). Dollars only: the list endpoint returns the SHORTENED run object, so compute units are absent and `unit_name` stays null rather than storing a measured-looking zero. Also reads `/v2/users/me/usage/monthly` for the vendor's real cycle window onto `service_registry.cycle_*`, then evaluates the money lines and emails any crossing. `?days=N` (default 3, max 31). Reports `unregistered` — actors that ran but sit in no registry row |
| `/api/meter/n8n-sync` | Cron (`35 */6 * * *`) + POST. Pages executions newest-first to the window edge, rolls them up by workflow × day × mode into `meter_daily` in EXECUTIONS, not dollars (n8n Cloud bills per execution and reports no rate). Reports `oldest_seen` so a short history reads as n8n's retention policy rather than as a quiet workflow. `?days=N` (default 3, max 31) |
| `/api/internal/sonnet-proxy` | Unchanged contract, now metered: the `X-Internal-Caller` header it already required is used as the agent stamp, which is the only way n8n-originated Anthropic spend becomes attributable at all |
| `/api/health/connections-sweep` | Cron (`0 */6 * * *`) + POST backstop ("Check now" in the app). Proof-of-life call per keyed `service_registry` row, balance reads where the vendor exposes one; mirrors blocking states to `api_usage_state` and critical services into `system_health` (the existing tier-4 banner chain). Telegram on transitions only |
| `/api/goals/ladder` | The one read for the whole goal ladder: all four rungs joined to `goals_health` |
| `/api/goals/gate` | Judge a goal against its rung's rubric without writing it. Preview only; `POST /api/objectives` enforces |
| `/api/goals/digest` | The rendered ladder as text (`?format=json` for structure). One canonical URL for any consumer |
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

**Money alerts need `gmail.send`.** `/api/meter/apify-sync` emails Krish when a
plan's prepaid line is crossed (email, not Telegram — his call). It sends
through the same domain-wide-delegated service account the receipts ingest
uses, so `https://www.googleapis.com/auth/gmail.send` has to be on that grant
in Google Admin alongside `gmail.readonly` and `gmail.compose`. Without it the
send returns null and the alert falls back to a Gmail DRAFT, which the sync
reports as `sent: ["<key> (draft)"]` — a draft nobody opens is not an alert, so
that string is the signal to add the scope. `OPS_ALERT_EMAIL` overrides the
recipient; it defaults to `GOOGLE_IMPERSONATE_SUBJECT`.


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

---

## Network intelligence (`/api/network/*`)

Ask the network anything, by text or voice. These are the only routes in the
repo behind an auth gate, because they return `why_them` and `risk`: private
assessments of real, named people. See
[ADR-011](./DECISIONS/011-contact-intelligence-sibling-table.md).

### Auth

`api/_auth.ts` re-checks the same `cc_access` cookie `middleware.ts` already
issues at the edge (`sha256(ACCESS_CODE)`, compared in constant time). No new
secret and nothing for the operator to do: if they can see the dashboard they
can query the network.

CORS origin is pinned (`APP_ORIGIN`, defaulting to the production host) rather
than `*`. A wildcard next to a cookie gate is how the gate gets read by any page
the browser happens to be on.

It **fails open when `ACCESS_CODE` is unset**, matching `middleware.ts` exactly.
Diverging would mean a deploy that drops the var leaves the UI reachable and the
Network tab silently broken, which is the worse failure.

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/network/search` | POST | `{ question, venture?, roles?, tiers?, countries?, filter_mode?, min_confidence?, limit?, rerank? }` | `{ ok, restated, results[], weak, total, plan, geo, degraded[] }` |
| `/api/network/recommend` | POST | `{ venture, intent?, countries?, filter_mode?, limit? }` | same envelope |
| `/api/network/voice` | POST | raw audio body (`bodyParser` off); filters ride the query string (`?countries=GB,AU&filter_mode=soft`) | same envelope plus `transcript` |
| `/api/network/geo` | GET | — | `{ ok, countries[], unknown, known, total }` |
| `/api/network/person/[id]` | GET | — | `{ ok, contact, intelligence }` |
| `/api/network/scan-card` | POST | raw image body (`bodyParser` off), `Content-Type: image/png\|jpeg\|webp\|gif`, ≤3.5MB | `{ ok, person, existing, usable }` |
| `/api/network/add-person` | POST | `{ full_name, title?, company?, location?, linkedin_url?, email?, headline?, origin_venture, origin_campaign, consent_tier?, note?, merge_into? }` | `{ ok, contact_id, created, merged, searchable, warning, blocked[] }` |
| `/api/network/enrich-person` | POST | `{ contact_id, use_apify?, skip_web? }` | `{ ok, status, who, why_them, hook, used[], skipped[], degraded[] }` or `402 { error:'api_credits', blocked[], alert }` |

### Adding a person from a screenshot

Three calls, not one, because a Vercel function dies at 60s and a LinkedIn
profile scrape alone can take 45. Splitting them means a hand-picked person is
never lost to an enrichment timeout.

```
scan-card     image bytes → Claude vision → {name, title, company, location}
              + a duplicate check. READ ONLY — nothing is written, because
              vision misreads and a 10,670-row network is the wrong place to
              discover that afterwards.
add-person    contacts row + contact_intelligence row. BOTH: a contacts row
              alone is invisible to network_search, so "added to the network"
              would not be true.
enrich-person PDL + Apollo + Perplexity/Exa/Brave (+ optional paid Apify
              LinkedIn profile scrape) → merged structured facts → Claude
              judgment → rewritten contact_intelligence + embedding.
```

### Running out of credits is a terminal state, not a degrade

Every provider helper in `api/_enrich.ts` returns `''` on failure. That is the
right shape for a best-effort research brief and the wrong shape for a permanent
record: a run where PDL 402s and Perplexity 429s produced a thin Claude-only
summary, set `enrichment_status='enriched'`, and — because the row now carried a
`dossier` — became permanently ineligible for retry under the `already_enriched`
guard. Nothing anywhere recorded that three of four sources never ran.

`api/_quota.ts` classifies each provider response into three kinds:

| Kind | Meaning | Consequence |
|---|---|---|
| `skipped_no_key` | not configured | silent, expected, listed in `skipped[]` |
| `empty` / `error` | ran, gave nothing | listed in `degraded[]`, run continues |
| `exhausted` / `auth_failed` / `rate_limited` | the account cannot serve the call | **run stops, nothing partial is written, alert raised** |

The blocking kinds set `contacts.enrichment_status='blocked_quota'` (see
`supabase/migrations/20260821090000_enrichment_blocked_quota.sql`) and return
`402` with the provider named. `api/_alert.ts` then writes to three places that
fail differently: Telegram (`TELEGRAM_APPROVALS_*`), `api_usage_state.last_status`
(where the hourly VPS alerter already looks), and `audit_log`. The API response
carries `alert_sent`, so a Telegram that did not send is itself visible rather
than assumed.

Status codes differ per vendor for the same condition — PDL and Apify use 402,
OpenAI 429 with `insufficient_quota`, Apollo 403 with a message — so the body
text is matched as well as the status.

A failed **embedding** is treated as blocking for the same reason: without
`contact_intelligence.embedding` the person is not findable by the surface they
were added for.

`api/_apify.ts` is the shared Apify client (the two older call sites,
`_guestSources.ts` and `content-ideas/[id]/challenge.ts`, still hand-roll their
own). Actor slugs resolve from the `apify_actor_registry` table — primary first,
`killed` excluded — so a misbehaving actor can be switched off without a deploy.
A 2xx with an empty dataset is reported as DEGRADED with the actor named, never
as a clean empty: these actors exit 0 both when the target genuinely has nothing
and when the input shape was wrong.

### The pipeline

```
question -> plan (Claude) -> embed (OpenAI) -> network_search (Postgres) -> rerank (Claude)
```

Every stage degrades and reports itself in `degraded[]`. No `ANTHROPIC_API_KEY`:
the raw question becomes the query. No `OPENAI_API_KEY`: the semantic term is
skipped, weights renormalise, and the scan is actually *cheaper* without a
vector. Rerank fails: scorer order stands. `/recommend` needs no model at all.

**The one outcome ruled out everywhere is an empty result for a reasonable
question.**

### `restated` and `weak`

`restated` is one line stating what the planner understood, rendered above the
results so a misreading is caught by reading a sentence rather than by
distrusting twenty rows.

`weak: true` means the query signal was indistinguishable from noise. The
results are still real people ranked by relationship value; they just do not
answer what was asked. **It is never an empty list.**

Weakness is thresholded on `query_relevance`, not `match_score`. `match_score`
cannot answer "did we understand the question", because a well-connected person
scores ~38 on relationship and evidence no matter what was asked.

### Geography

`countries` takes ISO-3166 alpha-2 codes, country names or city names; Postgres
canonicalises all three (`network_geo_canon`), so `GB`, `United Kingdom`,
`Britain` and `London` are one filter. `filter_mode` decides what it means:

- `soft` (what the UI sends by default) turns the operator's countries, roles
  and tiers into weighted constraints. Matches rank higher, close ones still
  appear, the list never empties.
- `hard` makes them real `WHERE` clauses. This is the only path in the feature
  that can return nothing, and it is always an explicit, labelled choice.

The field defaults to `hard` at the API, which is what `roles` and `tiers` have
always meant to `runNetworkSearch`; only an explicit `soft` relaxes them.

**Geography is resolved, not read off one column.** `contact_intelligence.country`
covers 3,679 of 10,597 people, and only 9 of the 164 in tier 1, the people who
have actually replied. `contact_intelligence.geo_code` falls back through
`contacts.location` and then the email ccTLD, which lifts coverage to roughly
4,600. It is a stored, indexed column so the filter can push down into
`network_search`'s candidate recall paths: each is capped at 400 rows, so
filtering their output instead would search a pool that is mostly the wrong
country and return a fraction of the people who qualify.

A soft geo constraint **prefers without excluding**: the named country scores
1.0, an unknown location scores the 0.5 neutral, and known-to-be-elsewhere
scores 0. Skipping that middle case made soft geo behave exactly like hard geo
and buried the 151 tier-1 people with no location on file.

**The unknowns are published, not hidden.** `/api/network/geo` returns the
per-country counts and, separately, `unknown`: the people with no resolved
location at all. Roughly 6,400 of them. Without that number a country filter
reads as a statement about the network ("you know nobody in the UK") when it is
a statement about the data ("we never recorded where these people are"), so the
UI renders it next to every geography filter.

### Reaching someone

`best_channel` and `reachable_via` are a **judgment about how to approach
someone**, never a promise that an address exists. Measured against the corpus:

| recorded best channel | people | address actually stored |
|---|---|---|
| `phone` | 368 | none, there is no phone column |
| `instagram_dm` | 198 | none, there is no handle column |
| `email` | ~1,200 of them | no email on the row |

So `src/lib/networkReach.ts` resolves the other way round: start from the
addresses on the record (`email`, `linkedin_url`, `twitter_handle`), then let
`best_channel` ORDER them. Every button it produces is one a tap can complete,
and when the recommended channel is not among them the UI says which and why
rather than quietly substituting a different one. A row with nothing actionable
gets no button at all.

### The planner is untrusted input

`api/_networkQuery.ts` sits between a language model and a database call, so
`sanitizePlan` is written as a boundary: field names checked against an
allow-list, weights clamped to [0.1, 1], values and strings length-capped, the
constraint list capped at 8, unknown venture nulled, em dashes stripped.

The planner **cannot emit a hard filter**. If it could, it could return an empty
result for a reasonable question, which is the exact failure this feature exists
to remove. That includes geography: a `geo` constraint parsed out of "who do I
know in London" ranks Londoners up, it does not delete everyone else. Only the
operator's own `countries` + `filter_mode: 'hard'` excludes.

A `geo` constraint whose values resolve to no country at all is **dropped**
rather than kept empty, and an unrecognised `countries` list degrades to no
filter rather than to zero rows. Both follow the same rule as every other
unparseable input here: a misunderstanding costs ranking, never answers.
