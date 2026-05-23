# Visibility follow-ups, 2026-05-23

Out-of-repo work that ships alongside PR #58 (visibility depth). Documented here for audit trail; the actual changes live in n8n Cloud, not in this repo's runtime code, so this doc captures intent and the workflow JSONs in `scripts/n8n/` capture state.

## A1: Sweeper auto-call Deep Enrich on unenriched rows (Step 3.2.B)

The Nova Visibility Sweeper (`SIDlCqURzTVsVt70`) used to discover new conferences and insert them with `deep_enriched_at IS NULL`. New rows then sat unenriched until someone fired the Deep Enrich webhook manually.

This adds two automated branches to the Sweeper:

1. **Insert-time wiring** (`Explode Inserted` then `Trigger Deep Enrich`). Fires immediately after a newly-inserted row, one POST per row.
2. **Hourly retry sweep** (`Schedule Retry` then `Fetch Unenriched` then `Explode Unenriched` then `Trigger Deep Enrich (Retry)`). Catches any row where the initial fire failed (n8n quota cap, transient Anthropic 5xx, etc). Limit 10 per tick, ordered by oldest first, so a backlog clears predictably without flooding the API.

Both paths POST `{ target_id, source }` to `https://krishraja10101.app.n8n.cloud/webhook/visibility-deep-enrich`.

Backup of pre-edit Sweeper state: `/root/.openclaw/workspace/backups/nova-visibility-sweeper-pre-3.2.b-retry-2026-05-23.json`.

## A2: Guest pitch_draft enrichment workflow (Phase 6B)

New workflow: `GuWi9nxNHpbFEfyV` (Nell | Mindmaker OS | Guest Pitch Draft). Webhook + cron (every 12h).

Flow: `Webhook` (single-id) OR `Every 12h` then `Fetch Batch` then `Explode Guests` then `Has Min Signal` filter then `Wait 5s` (rate-limit polite) then `Sonnet Pitch` then `Parse Pitch` then `Patch Guest` then `Audit Pitch` then `Respond` (webhook only).

The Sonnet 4.6 prompt encodes Krish voice rules: no em/en dashes, 80 to 150 words, opens with a specific signal from notes or scout context (not "I came across your work"), names the venture by name with a concrete differentiator, mentions exactly one of Builder's Lab, Signal & Noise, or Mindmaker, asks a single ended question, sign-off "Krish".

Output writes to `guests`:
- `pitch_draft`: the 80 to 150 word pitch.
- `notes`: "Suggested angles:\n" plus 3 specific show angles from the model.
- `quality_score`: green or amber or red (model self-grade with rubric).
- `status`: `enriched` when pitch generated and not red.
- `best_channel` is preserved if already set, otherwise inferred.

Scout-time context that may be in the `notes` field at fire-time is preserved durably in the row's `raw_data` jsonb (set during the Nell candidate-to-guest migration). The pitch run overwrites the live `notes` column with the suggested-angles block. This is by design: suggested angles are the operational artifact a human pitcher consults; the original scout signal stays in raw_data for traceability.

### Backfill (2026-05-23)

All 36 guests fired through this workflow. End state:
- 0 dash violations in pitch_draft or notes.
- Word counts in the 80 to 150 range.
- All status='enriched' with non-empty pitch_draft and suggested angles.

## What got merged out

A parallel session created two near-duplicate workflows that were archived once the canonical pair above were confirmed working:

- `JxBnYryvEvbHDTex` (Nell | Guest Pitch Enrich): archived 09:29 UTC. Backup at `/root/.openclaw/workspace/backups/nell-guest-pitch-enrich-pre-archive-2026-05-23.json`.
- `P1arp2BIFQGNDMk5` (Nova | Visibility Backfill Tick): archived 09:42 UTC, redundant with the Sweeper's new retry-sweep branch. Backup at `/root/.openclaw/workspace/backups/visibility-backfill-tick-pre-archive-2026-05-23.json`.

audit_log entries logged for each archive (event_type='n8n_workflow_archive').

## Verification queries

```sql
-- 0 dash violations expected (en dash U+2013, em dash U+2014)
SELECT count(*) FROM guests
WHERE pitch_draft ~ ('[' || chr(8211) || chr(8212) || ']')
   OR notes ~ ('[' || chr(8211) || chr(8212) || ']');

-- All 36 enriched
SELECT count(*) FROM guests WHERE status='enriched' AND pitch_draft IS NOT NULL;

-- 0 unenriched visibility targets after retry tick
SELECT count(*) FROM visibility_targets WHERE deep_enriched_at IS NULL;
```

## Files in this PR

- `scripts/n8n/nova-visibility-sweeper.workflow.json`: live Sweeper state with retry-sweep branch (18 nodes).
- `scripts/n8n/nell-guest-pitch-draft.workflow.json`: live canonical pitch workflow (13 nodes).
- `docs/visibility-followups-2026-05.md`: this doc.

Workflow JSONs are read-only snapshots committed for audit and repo-side review. They are not deployed from the repo; deploys remain via n8n Cloud directly.
