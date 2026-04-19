# ADR-004: Renaming `workflow_runs.agent` → `agent_id` and `started_at` → `run_at`

- Status: Accepted
- Date: 2026-04-15 (migration); 2026-04-18 (documented)
- Deciders: Krish

## Context

The `workflow_runs` table originally stored its owning agent in a column
named `agent` and its execution timestamp in `started_at`. Two pressures
forced a rename:

1. **Naming drift between tables.** Other tables had begun standardising
   on `*_id` suffixes for foreign-key-like text columns. `agent` looked
   inconsistent next to `agent_id` on `google_drive_sync` and the
   indexes.
2. **Semantic precision on the timestamp.** `started_at` implied a
   matching `finished_at`. In practice many runs are recorded after
   completion as a single row; `run_at` describes the actual semantic
   without implying a paired column.

The new index `idx_workflow_runs_agent_run_at` was added on the new
column names on 2026-04-15.

## Decision

Rename the columns in place:

- `workflow_runs.agent` → `workflow_runs.agent_id`
- `workflow_runs.started_at` → `workflow_runs.run_at`

Keep the legacy columns populated for any pre-migration rows so the UI
can read them as fallbacks. New writes go to the new names only.

## Alternatives considered

- **Add new columns, dual-write, drop the old columns later.** This is
  the textbook approach. Rejected as overkill for a single-tenant
  product where we can reconcile once and move on.
- **Leave the names alone.** Rejected — the inconsistency cost more in
  reader confusion than the rename cost in fallback handling.
- **Drop the old columns immediately.** Rejected. Pre-migration rows
  carry historical truth (Cleo's older runs, in particular) that we did
  not want to lose.

## Consequences

### Positive
- Schema is internally consistent (`*_id` suffix, semantic timestamp
  names).
- New index uses the canonical names.

### Negative
- Every reader that touched `workflow_runs` had to be updated.
- Until the legacy columns are dropped, writers must remember not to
  populate `agent` / `started_at`. Code review enforces this.
- The fallback pattern in `DesktopOrg`, `DesktopFlows`, and `DesktopExec`
  carries a small ongoing maintenance cost.

### Neutral
- Cost was renamed in the same migration (`cost` → `cost_usd`) for
  precision. Same fallback pattern applies.

## Follow-ups

- Once a sweep confirms no rows still use the legacy columns, drop them
  and remove the fallback logic. Open as ADR-007 (planned).
- Update [`docs/DATABASE.md`](../DATABASE.md#workflow_runs) when the
  drop happens; the legacy-column note can then be deleted.
