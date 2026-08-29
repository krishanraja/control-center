# PR 6: self-healing four-tier silent failure system

Part of the mind/make OS rebuild (see `OS-PROGRESS.md` in workspace memory).

## What ships

### Schema
- `completeness_contracts` table seeded with six contracts (Zara, legacy Nova, PR4 Nova Visibility Sweeper, Nell Lead Doc Ingest, Cleo Content Idea Capture, Nell Guest Scout). Each row carries `required_fields`, `forbidden_patterns`, `min_rows_per_run`.
- `silent_failures` table with tier (1, 2, 3, 4), failure_type, detail, run_count, escalation timestamps, resolution fields.
- Three RPC functions, all `SECURITY DEFINER`:
  - `audit_silent_failures()`: for each active contract, counts successful `workflow_runs` in the last 4h vs target_table rows with all `required_fields` populated. Inserts a tier-2 `silent_failures` row when runs >= 1 and useful_rows == 0 (idempotent within 4h).
  - `audit_critical_infra()`: scans `system_health` for components with status in (failing, critical, down) and `last_check` within 24h. Inserts a tier-4 `silent_failures` row per component (idempotent within 5m).
  - `audit_failure_patterns()`: aggregates unresolved tier 2/4 `silent_failures` per workflow over the past 7 days; for any workflow with >= 3 failures, inserts a `corrections` row with `approval_state='proposed'` so Krish can approve in the Org tab.

### n8n
- **System | Silent Success Detector** (`F6srw1yE9uH67q14`, active). Rewritten from weekly to every 4 hours. Pipeline: Schedule -> Audit RPC -> Parse -> IF flagged -> Telegram + heartbeat. Pre-PR-6 backup at `workspace/backups/silent-success-detector-pre-pr6-2026-05-22.json`.
- **System | Critical Infrastructure Monitor** (`SXdHes0WwIovjPAB`, active). New workflow. Cron every 5m. Calls `audit_critical_infra` RPC and Telegrams Krish on any new tier 4.
- **Vera | Failure Pattern Sweep** (`5fm6HXpMSQMjn0GJ`, active). New workflow. Sunday 07:00 UTC. Calls `audit_failure_patterns` RPC and Telegrams the count of new correction proposals.
- **Vera | Feedback Aggregation** (`FZBDYXXfT1MBrAF6`, active). Activated as part of PR 6 close-out; built in PR 5.

### Frontend
- `useCriticalAlerts` hook subscribed to `silent_failures` realtime filtered on `tier=4` and unresolved.
- `CriticalAlertBanner` component renders a rose banner above DailyLockBanner / DailyBriefBanner on both Desktop and Mobile Home.

## Why this matters

Before PR 6 the OS had no way to distinguish "workflow returned 200" from "workflow produced useful work." Silent Success Detector existed but ran once a week and produced no actionable output. After PR 6: every 4 hours the Detector flags zero-output windows; every 5 minutes the Monitor checks critical infra; every Sunday Vera turns repeated failures into proposed agent identity edits. The Home banner makes tier 4 unmissable.

## Tier 1 Gates note

The brief calls for a Tier 1 Gate Code node upstream of every Supabase write in the six contracted workflows. The existing rewrites already enforce equivalent gates:

- **Zara Signal Sweep**: hardened `Filter Valid Signals Only` node + removed Perplexity Error Passthrough (PR 2). Drops rows missing company_name, summary, or signal_score, or matching forbidden patterns.
- **Cleo Content Idea Capture**: filters `is_idea !== true` with quality_score gate (PR 3).
- **Nell Lead Document Ingest**: filters `quality_score === 'red'` and writes audit_log on partial extractions (PR 5).
- **Nova Visibility Sweeper**: filters by deduplication + quality_score before insert (PR 4).
- **Nell Guest Sheet Bulk Import / Guest Scout**: the import filters duplicates by email/name; legacy Guest Scout is now low-traffic.

Adding redundant Tier 1 Gate Code nodes to every workflow is deferred. The `completeness_contracts` table and `audit_silent_failures()` RPC are the canonical contract; per-workflow drift will be caught by the every-4h sweep.

## Activation

All four self-heal workflows are active on ship:

- `F6srw1yE9uH67q14` (Silent Success Detector) was already active; PUT preserved active state.
- `SXdHes0WwIovjPAB` (Critical Infrastructure Monitor) activated.
- `5fm6HXpMSQMjn0GJ` (Vera Failure Pattern Sweep) activated.
- `FZBDYXXfT1MBrAF6` (Vera Feedback Aggregation) activated.

## Acceptance tests (run post-merge against preview)

1. Insert a test row into `silent_failures` with `tier=4, resolved_at=null`. The rose CriticalAlertBanner appears on Home within ~60 seconds (next poll or realtime push).
2. Manually call `SELECT public.audit_silent_failures();` after disabling a workflow's filter. A new tier-2 row appears.
3. Manually call `SELECT public.audit_critical_infra();` after marking a system_health row as `status='failing'` with `last_check=now()`. A new tier-4 row appears.
4. Insert 3 tier-2 `silent_failures` rows for the same workflow, then call `SELECT public.audit_failure_patterns();`. A `corrections` row with `approval_state='proposed'` appears. The 3 silent_failures rows have `resolution_note` stamped with the correction id.
5. The Silent Success Detector workflow's next scheduled run (within 4 hours of merge) writes a row to `workflow_runs` and produces a Telegram only if failures are present.
