# PR 2: Zara fix

## Problem

The Zara Signal Sweep workflow (`xAfMItfI8UfAqb3M`) runs Mon-Fri at 10am EST. As of 2026-05-21 the `zara_signals` table had 7 rows from the last 5 days, all with `description='perplexity-error'`, `signal_score=-10`, `company_name=NULL`, `summary=NULL`. Zara's `agent_plans` row reported "3 consecutive errors, workflow crashing, Top priority fix." Felix downstream had "No warm paths currently queued from Zara."

## Root cause

In the workflow's `Call Perplexity Signal Filter` node, the output fanned out to two parallel branches:

1. `Parse Perplexity Response` (Code node) which produces a structured signal.
2. `Perplexity Error Passthrough` (Code node) which ALWAYS fired and wrote a placeholder row to keep the pipeline non-empty.

Branch 2 was a defensive fallback that became a bug: every run pumped placeholder rows into `zara_signals` regardless of whether Perplexity succeeded. The downstream `Filter Valid Signals Only` only checked `is_signal=true` and was supposed to drop these, but it was failing open because the passthrough rows weren't going through it.

## Fix

Applied live to n8n on 2026-05-21 via the management API.

1. **Removed `Perplexity Error Passthrough`** entirely. The Code node and all its connections are gone.
2. **Rewrote `Parse Perplexity Response`** to set `is_signal=false` and populate `error` when Perplexity returns no content or unparseable JSON. Also enforces a hard contract: a signal must have `company_name`, `summary` length >= 20, and `signal_score >= 1`, otherwise `is_signal=false`.
3. **Hardened `Filter Valid Signals Only`** with five conditions joined by AND:
   - `is_signal` is true
   - `signal_score >= 1`
   - `company_name` is not empty
   - `summary` length >= 20
   - `description` does not contain `-error` (case-insensitive)
4. **Added `Log Perplexity Error IF` + `Log Perplexity Error HTTP`** nodes. When `error` is set on a parsed item, the IF node routes it through an HTTP POST to `audit_log` (`event_type='zara_perplexity_parse_error'`) so we keep diagnostics, then merges back into `Filter Valid Signals Only` where it's dropped. When `error` is empty, the IF routes directly to the filter.
5. **Set workflow `saveDataErrorExecution='all'`** so failed executions stay inspectable.
6. **Purged** the 7 existing `perplexity-error` rows from `zara_signals` (see `scripts/migrations/2026-05-21-pr2-zara-purge.sql`).
7. **Updated `agent_plans`** for Zara (blockers cleared, phase=Post-fix verification) and Felix (waiting on next sweep). See `scripts/migrations/2026-05-21-pr2-agent-plans-update.sql`.

## Verification

| # | Check | Status |
|---|---|---|
| 1 | `zara_signals` has zero rows with `description LIKE '%-error%'` or `signal_score < 0` | Verified 2026-05-21 15:27 UTC |
| 2 | Workflow active=true after PUT, all credentials preserved | Verified |
| 3 | At least 1 valid signal row appears within 24h of next sweep | Pending (next Mon 10am EST) |
| 4 | `agent_plans` Zara row has `blockers IS NULL` | Verified |
| 5 | Perplexity parse errors land in `audit_log` as `zara_perplexity_parse_error` | Pending (next sweep with a real error) |
| 6 | `Perplexity Error Passthrough` no longer exists in the workflow | Verified |

## Rollback

```bash
curl -X PUT "https://krishraja10101.app.n8n.cloud/api/v1/workflows/xAfMItfI8UfAqb3M" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/root/.openclaw/workspace/backups/zara-signal-sweep-pre-pr2-20260521T152355Z.json
```

The 7 deleted perplexity-error rows stay deleted; they were garbage and recovery is unnecessary. Re-run `2026-05-21-pr2-agent-plans-update.sql` in reverse if needed.
