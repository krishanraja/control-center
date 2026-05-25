# Observability

> **Scope.** This document defines what we observe in Control Center, where
> the signals live, how health is derived, and what alerts mean. It is the
> contract between operators (Krish, Vera) and the platform.
>
> **Not in this document.** Schema details for the underlying tables live in
> [`DATABASE.md`](./DATABASE.md). Pipeline mechanics (webhooks, retries) live
> in [`DATA-PIPELINE.md`](./DATA-PIPELINE.md). What the UI surfaces about
> health (Systems tab) is specified in [`PRODUCT.md`](./PRODUCT.md).

---

## What We Observe

| Signal | Source of truth | Surface |
|---|---|---|
| Task lifecycle events | `audit_log` (writes from sync, agents, manual actions) | Home → Live Activity, Intel → Intelligence Feed |
| Workflow executions | `workflow_runs` (one row per N8N run) | Flows tab, Org → N8N Runs, Intel → Agent Cost |
| Component health | `system_health` (one row per tracked component) | Systems tab |
| Aggregate health | `GET /api/health` (derived live, not stored) | Sidebar status indicator, external monitors |
| Agent freshness | `agents.last_run` vs `agents.expected_runs_per_day` | Derived inside `/api/health` |
| Credential health | `credential_health` table | Derived inside `/api/health`, Systems tab |
| Silent failures | `silent_failures` table (tiered 1-4) | Home → CriticalAlertBanner (tier 3), Systems tab (all tiers) |
| Drive sync runs | `audit_log` rows with `actor = 'system'` and `event_type` matching `drive_sync*` | Home → Live Activity |

If a system action does not write at least one of these, it is invisible.
**Invisible work is treated as not-done.**

### The silent-failure tier model (PR #54)

A workflow that "succeeds" (writes `workflow_runs.status='success'`) but
produces no actual value is the hardest class of failure. Four tiers
catch it:

| Tier | Detector | Cadence | What it catches |
|---|---|---|---|
| 1 | `completeness_contracts` row per workflow_id, gated by the workflow's terminal node | Real-time per execution | "Did this workflow write at least `expected_min_rows` rows with `expected_columns` populated within `freshness_window_hours`?" |
| 2 | Silent Success Detector (N8N system workflow) | Every 4h | For each (workflow_id, ok=true) run, checks downstream effects. Zero effects → tier-2 row. |
| 3 | Critical Infrastructure Monitor (N8N system workflow) | Every 5m | Watches `credential_health`, `system_health`, RLS denials. Critical issues → tier-3 row. **Anchors Home `CriticalAlertBanner` via `useCriticalAlerts`.** |
| 4 | Vera Failure Pattern Sweep (N8N) | Weekly (Sun 07:00 UTC) | Groups tier-1/2/3 over the last 7 days; ≥3 matching failures → `corrections` row → Agatha brief edit. |

The promise: **same silent failure does not survive a week.** Control
Center surfaces the output but does not run these — they live in the OS
infrastructure (see `MINDMAKER_OS_ARCHITECTURE.md` §7.7).

---

## The Health Model

`api/health.ts` is the single authority for "is the platform healthy?"
The UI's sidebar dot, any external uptime monitor, and Vera's daily audit
all read from it.

### Component levels

```
healthy → degraded → failed
                       ↑ critical
```

`unknown` is a fourth value used when a component cannot be checked. It
does not contribute to the overall status.

### Components currently tracked

| Component | Healthy when | Degraded when | Failed when |
|---|---|---|---|
| `supabase-connection` | task count query succeeds | — | task count query errors |
| `agents` | ≥ 11 active agents | < 11 active agents | — |
| `system-services` | no `system_health` row reports `failing` | — | one or more `failing` rows |
| `agent-freshness` | every agent with a cadence is within 1 expected interval | 1–2 agents stale | ≥ 3 agents stale or any agent has never run |
| `workflow-runs` (24h) | ≥ 90% success rate | 60–89% success rate, or zero runs in 24h | < 60% success rate |
| `credentials` | every `credential_health` row is healthy | any row reports `degraded` / `warning` | any row reports `failing` / `failed` / `critical` |
| `api-endpoints` | always healthy (asserted at the end of the check) | — | — |

### Aggregate status

The overall `status` is the worst component status, with one override:
critical alerts force `failed` regardless of component levels. Badge
mapping is fixed:

| Status | Badge |
|---|---|
| healthy | green |
| degraded | amber |
| failed | red |

There is no intermediate colour. Inventing one is a bug.

---

## Alerts

`/api/health` returns an `alerts: []` array. Each alert has:

| Field | Values |
|---|---|
| `severity` | `info`, `warning`, `critical` |
| `component` | the component slug above (or `health-check` for meta-failures) |
| `message` | human-readable, present-tense |
| `timestamp` | ISO 8601 UTC |

### Severity → action

| Severity | Expected response | Surface |
|---|---|---|
| critical | Acknowledge within 15 min. Block other work until investigated. | Sidebar dot turns red; PendingFlagModal-style nudge planned (TODO). |
| warning | Investigate within the working day. | Sidebar dot turns amber. |
| info | Awareness only; no action required. | Activity feed only. |

### Currently emitted alerts

- `supabase-connection` failure → critical
- `agent-freshness` stale (1-2) → warning
- `agent-freshness` stale (≥ 3) → critical
- `workflow-runs` < 60% success → critical
- `credentials` failing → critical
- `silent_failures` tier-3 critical row inserted → critical (surfaces as `CriticalAlertBanner` on Home, independent of `/api/health`)
- Health check meta-failure → critical (with component `health-check`)

---

## SLIs and SLOs

The platform is single-tenant and pre-revenue, so formal SLAs are
overkill. The following SLIs are still tracked and inform whether the
product is degrading:

| SLI | Target | Source | Measured how |
|---|---|---|---|
| Workflow success rate (24h) | ≥ 90% | `workflow_runs.status` | Direct ratio in `/api/health` |
| Agent freshness | 100% of executors within 2× expected cadence | `agents.last_run` | Component above |
| Realtime delivery | ≥ 99% of `tasks` writes visible in UI within 2s | observed | No automated metric yet (TODO) |
| Action latency | ≤ 1s perceived for inline actions | observed | No automated metric yet (TODO) |
| Page-load (cold) | ≤ 2s p95 on broadband | observed | No automated metric yet (TODO) |

When a target is missed, file a follow-up via `audit_log` with
`event_type = 'sli_breach'` so the trend is auditable.

---

## Logging Conventions

### `audit_log` writes

Every meaningful event must include:

| Field | Convention |
|---|---|
| `actor` | The slug responsible. Use `krish` for CEO actions, `system` for unattended jobs, `vps-pipeline` for the sync pipeline, otherwise an agent slug. |
| `event_type` | `snake_case`, present-tense verb-first. Examples: `task_approved`, `drive_sync_run`, `sli_breach`. |
| `target` | Optional human-readable subject, e.g. `Google Drive Sync`. Used for grouping in the Activity feed. |
| `details` | Either a string (used directly as the message) or an object with `{ message }` or `{ summary }`. The renderer falls through these in order. |

Plain `console.log` calls are not durable observability. They are
acceptable for dev only. For anything that should be inspectable post-hoc,
write to `audit_log`.

### `workflow_runs` writes

Every N8N execution must produce one row, even on failure. Failure rows
populate `error_message`. Cost is in `cost_usd`; `agent_id` is the
lowercase slug. See [`AGENTS.md#slug-as-key`](./AGENTS.md#slug-as-key) for
why this matters.

### `system_health` writes

Long-running services (sync workers, brief sync, BD signals) update
`system_health` with their current state. The Systems tab and
`/api/health` both read from this. Update on state change, not on every
heartbeat — heartbeat noise dilutes the signal.

---

## Retention

Until ADR-005 says otherwise:

| Table | Retention |
|---|---|
| `audit_log` | indefinite |
| `workflow_runs` | indefinite |
| `silent_failures` | indefinite (rows are cheap; trend analysis matters) |
| `system_health` | latest row per component (overwrite) |
| `credential_health` | latest row per credential (overwrite) |

Retention is cheap because volumes are small. When monthly inserts cross
~1M rows in any of the unbounded tables, revisit per
[`DATA-RECOMMENDATIONS.md`](./DATA-RECOMMENDATIONS.md) §3.

---

## Observability of the Observability

A health-check that lies is worse than no health-check. Two safeguards:

1. **Self-report**: any thrown error inside `/api/health` produces a
   `health-check` critical alert with status 500. The badge will go red
   and the message will be the error string.
2. **Periodic audit (planned)**: Vera runs a weekly check that the alerts
   set is non-empty for the last 7 days *or* every component reports
   healthy. A platform that has reported healthy + no alerts for 7 days
   is suspect — most likely the writers stopped emitting.

When 2 lands, document it in this file and add an `audit_log` event_type
`observability_audit_run`.
