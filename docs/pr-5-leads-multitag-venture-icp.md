# PR 5: leads multi-tag + venture-aware ICP

Part of the Mindmaker OS rebuild (see `OS-PROGRESS.md` in workspace memory).

## What ships

### Schema (`scripts/migrations/2026-05-22-pr5-leads-multitag-venture.sql`)
- New table `venture_registry`: canonical list of ventures one lead can map to. Each row carries `slug` (PK), `display_name`, `kind` (product, podcast, ...), `icp_description`, `scoring_criteria` (jsonb of weights + tier thresholds), `active`, `sort_order`. Seeded with `mindmaker` (product), `signal_noise` (podcast), `builder_economy` (podcast).
- `leads` gets three new columns: `tags text[]` (default `{}`), `icp_scores jsonb` (default `{}`, shape `{<venture_slug>: <int 0-100>}`), `primary_venture text` (FK to `venture_registry.slug`, nullable, `ON DELETE SET NULL`).
- FK constraint `leads_primary_venture_fk` and three new indexes: btree on `(primary_venture, status)`, GIN on `tags`, GIN on `icp_scores`.
- Backfill: every existing lead (4 rows) gets `primary_venture='mindmaker'`, gets `mindmaker_buyer` appended to `tags`, and the prior `icp_score` is copied into `icp_scores->>'mindmaker'`. Old `icp_score` column is preserved as legacy for one PR cycle, dropped in PR 8.
- Idempotent: every statement uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. Safe to re-run.

### n8n workflows
- **Nell Lead Document Ingest** (`fUlQUlyZp1DRRwWT`, active). Rewritten on top of the existing webhook contract (`POST /webhook/lead-doc-ingest`). Sonnet 4.6 extracts structured leads from `raw_text` (pasted) or `drive_file_id` (Drive fetch). Scoring is venture-aware: the model emits an `icp_scores` jsonb per lead with one entry per venture in `venture_registry`. The workflow now derives `primary_venture` from the highest scoring venture (above tier threshold), and writes a `tags` array of the form `[<venture>_buyer, ...]` or `[<venture>_guest, ...]` per the venture `kind`. A new `contacted_persons` lookup runs before insert to dedupe against prior outreach. Backup of pre-PR-5 workflow lives at `workspace/backups/nell-lead-doc-ingest-pre-pr5-2026-05-22.json`.
- **Vera Feedback Aggregation** (`FZBDYXXfT1MBrAF6`, inactive on ship). Schedule: Sunday 06:00 UTC weekly. Pipeline: fetch unconsumed `feedback_queue` rows -> cluster by `(agent_id, source_table, reason_code)` -> Sonnet 4.6 summarises each cluster into a candidate correction -> insert into `corrections` with `approval_state='proposed'` -> mark feedback rows `consumed_by_vera=true`. Ships inactive so PR 6 (self-healing) can wire it into the audit cadence without surprise first runs.

### Frontend
- New `useVentureRegistry` hook (lib-singleton cache, one network roundtrip per session, hot-reload safe). Exposes `{ ventures, loading }` sorted by `sort_order`.
- New `LeadVentureLane` component (desktop): one lane per active venture, plus an "Other" lane for leads that did not clear any venture's warm threshold. Empty lanes still render so the user can see at a glance which ventures have no qualified leads this week.
- `DesktopLeads` swapped from source-typed grouping to venture-grouped lanes. Source-by counts move into a secondary summary on the left rail. Import dropzone stays put.
- `MobileLeads` adopts the same venture grouping via the mobile `FeedCard` primitive. Hero card still highlights top-fit lead.
- `LeadCard` adds two new chip rows: primary-venture pill (violet) + secondary tag chips for cross-venture tags; per-venture ICP score chips (up to three, sorted descending) when `icp_scores` has any non-zero entries, falling back to the legacy single `icp_score` chip otherwise.
- `useRealtimeLeads` types extended with `tags?: string[]`, `icp_scores?: Record<string, number>`, `primary_venture?: string`.

## Why this matters

The old leads pipeline assumed one ICP per lead and one lane per lead. That is wrong for the Mindmaker fleet: a single Maven cohort grad can be a Mindmaker buyer (Felix's lane) AND a Signal & Noise podcast guest candidate (Nell's lane). Forcing a single assignment loses the cross-venture surface. PR 5 makes lead-to-venture a many-to-many relation: `primary_venture` resolves "who owns the next action", `tags` carry secondary venture surfacing, and `icp_scores` shows per-venture fit so a lead can be promoted into multiple workflows.

The Vera Feedback Aggregation workflow is the second half of the feedback loop opened in PR 3: thumbs-down on a lead card writes a `feedback_queue` row, Vera clusters those weekly and proposes corrections that feed into `agents.brief_content`. PR 6 (self-healing) will gate the auto-apply path; for now, corrections land in `proposed` state for human approval via the Org tab's brief editor.

## Acceptance tests (run post-merge against preview)

1. Drop a lead CSV that contains both Mindmaker-buyer and S&N-guest candidates. The workflow inserts each lead once, with `primary_venture` set, `tags` containing every venture the lead qualified for, and `icp_scores` populated per venture.
2. The Leads tab on desktop renders one lane per active venture from `venture_registry`. Each lane shows lead count, expands/collapses, and renders LeadCards with chips for venture + per-venture ICP scores.
3. The Leads tab on mobile groups leads into venture-titled FeedCards. The hero card stays.
4. Thumbs-down on a lead card writes a `feedback_queue` row with `source_table='leads'`, `agent_id=<assignee>`, and the chosen `reason_code`.
5. Manually trigger Vera Feedback Aggregation. It clusters by (agent_id, source_table, reason_code), writes one `corrections` row per cluster with `approval_state='proposed'`, and stamps `consumed_by_vera=true` on the feedback rows.
6. Adding a new venture in `venture_registry` causes the lane to appear in the UI without a deploy (next page load picks it up from the singleton).

## Activation

`fUlQUlyZp1DRRwWT` (Nell Lead Document Ingest) is active immediately; it is a like-for-like contract upgrade of the existing webhook. `FZBDYXXfT1MBrAF6` (Vera) ships inactive; flip on once PR 6 wires it into the audit cadence.
