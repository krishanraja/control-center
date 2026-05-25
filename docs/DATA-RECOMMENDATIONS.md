# Data Recommendations

> **Status.** A rolling list of data-side improvements worth doing.
> Replaces the 2026-04 version, most of which has shipped (Stripe
> revenue pipeline, database indexes, `customers` table + attribution,
> `customer_contacts`, `bets`, anti-busywork rating, deep enrich retry
> sweep, four-tier self-healing, `decisions_waiting` view, weekly plan
> refresh). What remains is below.
>
> **Where shipped work is documented.** [`DATABASE.md`](./DATABASE.md) for
> the post-rebuild tables, [`DATA-PIPELINE.md`](./DATA-PIPELINE.md) for
> the event loop, [`pr-*.md`](./) for the rebuild changelog.

## Priority 1 — Close the loop on what's already wired

### 1.1 Lead → customer attribution coverage

**Shipped:** PR #43 added the four `attribution_*` columns on `customers`,
populated by Stripe webhooks + a one-shot backfill.

**Gap:** Attribution confidence is high only for cold-email and podcast
channels (where the matching key is explicit). Content-attributed
conversions still fall into `attribution_channel='unknown'` more often
than they should.

**Recommendation:** Add a lightweight UTM ingestion path on the marketing
sites (Mindmaker, Builder Economy, Signal & Noise) and an `/api/*`
endpoint that lands UTM events into a `marketing_touches` table. Match
during the Stripe webhook step.

### 1.2 `venture_id` on tasks is still optional

`tasks.venture_id` is rarely populated. The Leads tab solved its
venture-attribution problem via `primary_venture`; tasks didn't get the
same treatment.

**Recommendation:** Default `venture_id` from the agent's primary venture
(stored on `agents`) at task-creation time in N8N. Backfill via title /
group_label heuristics for the historical tail.

### 1.3 Goal-task linkage

Goals on Home show a progress bar but progress is hand-edited. No way to
auto-derive progress from completed tasks.

**Recommendation:** Add a `goal_tasks` join table; auto-compute
`goals.progress` from the linked task completions weighted by an explicit
`weight`. Surface goal progress as a derived field, not a stored one.

```sql
CREATE TABLE goal_tasks (
  goal_id uuid REFERENCES goals(id),
  task_id uuid REFERENCES tasks(id),
  weight numeric DEFAULT 1.0,
  PRIMARY KEY (goal_id, task_id)
);
```

## Priority 2 — Observability

### 2.1 Realtime delivery SLI

The OBSERVABILITY doc lists "≥ 99% of `tasks` writes visible in UI within
2s" as an SLI but flags it as "no automated metric yet."

**Recommendation:** Add a `realtime_latency` table; client emits a ping
on `INSERT` arrival; compare against `updated_at` on the row. Roll up
weekly into `audit_log` `event_type='sli_realtime_latency'`.

### 2.2 Webhook failure surfacing

`pg_net` retries silently. If a webhook to the Orchestrator fails three
times, the row never gets processed — and the only visible symptom is
that the downstream effect never happens.

**Recommendation:** Add a `webhook_failures` table populated by pg_net's
failure callback. Add a tier-3 `silent_failures` detector that watches
for stuck rows (e.g. `leads` with `status='new'` for more than the
hourly Deep Enrich Retry Sweep window).

### 2.3 Action-latency SLI

Currently observed, not measured. Inline actions feel snappy but no
automated check.

**Recommendation:** Browser side, wrap mutations in a perf timer and
emit a debounced metric to an `audit_log` row. Alert on a 7-day
rolling p95 above 1.5s.

## Priority 3 — Retention and aggregation

### 3.1 Audit log retention

`audit_log` is unbounded. Cheap today, but cardinality grows linearly.

**Recommendation:** When monthly inserts cross ~1M rows, archive entries
older than 90 days to a cold-storage table and drop from hot. ADR-005
already established the pipeline-first home; an ADR for retention should
follow.

### 3.2 Workflow_runs aggregation

Same as above. The Intel cost chart re-aggregates on every load; the
Flows tab paginates over a full scan.

**Recommendation:** A nightly cron computes `workflow_runs_daily`
roll-ups (per workflow, per agent, per day) — cost, runs, errors, p95
duration. UI reads from the rollup; cold table is for forensics.

### 3.3 Materialized view for Home

`decisions_waiting` is a UNION view; it's fast enough today but will
slow as the source tables grow.

**Recommendation:** Refresh into a materialized view on a 30s cron via
`pg_cron`. Subscribe to the materialized view from the UI; refresh is
cheap because the underlying queries are well-indexed.

## Priority 4 — New surfaces

### 4.1 Sentiment on Krish notes + feedback

`feedback_text` and `krish_notes` carry strong signal about what's
frustrating Krish, but they're not analysed.

**Recommendation:** Run Sonnet 4.6 sentiment + theme extraction on every
new row; store in `feedback_themes`. Surface a weekly digest on Intel
("This week Krish was frustrated by: X / Y / Z").

### 4.2 Time spent per task

No time tracking today. Workflow cost-per-task is approximated from
`workflow_runs.cost_usd` but doesn't include Krish's review time.

**Recommendation:** Optional `time_spent_minutes` on tasks, populated
automatically when a task is opened and closed in the UI (low-friction
auto-timer, not a manual log).

### 4.3 External integrations not yet wired into the dashboard

The Mindmaker OS has the following sources but Control Center surfaces
only a subset:

| Source | Already in OS? | In Control Center? | Gap |
|---|---|---|---|
| Stripe (6 products) | Yes — alerts + customer upsert | Yes — MRR + attribution | None |
| Google Analytics | No | No | Growth-side blind spot |
| Calendly | No (manual) | No | Bookings-per-week unknown |
| GitHub commits / PRs | No | No | Arlo/Krish velocity untracked |
| N8N API workflow stats | Yes via Kai | Partial (Flows tab) | Cost-per-agent rollup is approximate |

**Recommendation:** Prioritise GA + Calendly first — they directly answer
"is the top of the funnel growing?" which the dashboard cannot answer
today.

## Priority 5 — Not yet

These have been considered and rejected for now. Listed so they don't
keep getting re-proposed.

- **Multi-tenant org_id / RLS partitioning.** Single-operator product;
  premature. Will revisit if the dashboard ever opens up to staff.
- **Per-row Postgres triggers writing to `audit_log`.** Tried in PR #?,
  reverted — too much noise, hard to filter. Audit-log writes belong
  in workflow logic, not DB triggers.
- **Full-text search on every table.** Premature; current usage is
  narrow.
