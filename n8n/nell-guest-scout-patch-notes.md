# Nell Guest Scout — patch notes (2026-05-26)

Workflow id `8DlMfyTYsbnQGYR2`. Snapshot in `n8n/workflows/` not auto-pulled; this note documents what changed and why so future agents can understand the workflow without re-deriving it.

## What the workflow used to do

1. Poll Product Hunt top posts, HN Show HN, Digiday RSS, Rebooting RSS, NiemanLab RSS
2. Merge + dedup against `nell_candidates` (table)
3. Score each candidate on `fit_score` + `attainability_score` (Sonnet)
4. Filter to fit≥7 AND attain≥7
5. Apollo-enrich, draft pitches
6. Insert qualified into `nell_candidates`
7. Telegram digest + Gmail draft

## Why it was broken

`nell_candidates` was dropped in PR #56 (2026-05-22) and replaced by `guests`. The `Store Qualified` HTTP node was still pointing at the dropped table, so the workflow has been silently writing nothing since then. All 36 rows currently in `guests` came from a one-off migration on 2026-05-22, not from any scout run.

Additionally, the scoring prompt produced no `target_type` discriminator, so journalists got bucketed as podcast guests and HN usernames passed through as builder_economy candidates without any verifiable contact info.

## What this patch changes (4 nodes)

### `Prep Scoring Prompt`

Rewritten to emit the new editorial-bar schema. Every candidate gets a `target_type` (`podcast_guest`, `press_target`, `dual`), a `skip_reason` when an editorial rule fails, and a `contact_method`. Explicit skip rules:

- HN username with no resolvable real name
- Contact method `none` AND target_type `podcast_guest`
- Fit below the per-show bar (6 for builder_economy, 7 for signal_noise)
- A single Show HN post is not qualification for builder_economy

### `Parse Scores + Filter`

Now buckets into three arrays: `qualified_guests`, `qualified_press`, `rejected`. Legacy keys (`qualified`, `qualified_count`, etc.) preserved so downstream Build Digest and Split Candidates nodes keep working.

Routing rules:

- `target_type='press_target'` → `qualified_press`
- `target_type='dual'` → both buckets if the guest bar passes
- `target_type='podcast_guest'` → `qualified_guests` only if fit/attain/contact gates pass; otherwise into `rejected`
- Any `skip_reason` set → `rejected`

### `Prep Supabase Insert`

Replaced with an insert router. Performs three parallel inserts via fetch inside the code node:

- `qualified_guests` → `guests` (with `target_type`, `quality_score`, `one_liner`, `why_fit`, contact fields, `source='nell-scout'`)
- `qualified_press` → `visibility_targets` (with `type='press_relationship'`, `source_url`, `why_relevant`, `status='queued'`)
- `rejected` → `nell_rejected` (silent audit log; PR 1 created this table)

Sets `insert_body='[]'` for downstream compatibility with the existing `Store Qualified` node.

### `Store Qualified`

Defanged to no-op: URL repointed at `/rest/v1/guests`, body fixed to `[]`. Kept in graph so the downstream Build Digest / Audit Log connections continue to fire. Future cleanup can remove this node entirely once `Build Digest` is rewired to read directly from `Prep Supabase Insert`.

## Live fixture test

Ran the new prompt against 10 fixtures (5 journalists, 3 founders, 2 HN usernames) via the live Anthropic API. Results:

| Name | Target Type | Podcast | Fit | Attain | Contact | Skip Reason |
|---|---|---|---|---|---|---|
| Joanna Stern | press_target | - | 9 | 6 | twitter | - |
| Jessica Davies | press_target | - | 8 | 7 | email | - |
| Deborah Turness | podcast_guest | signal_noise | 9 | 5 | linkedin | - |
| Ronan Shields | press_target | - | 8 | 7 | email | - |
| Andrew Deck | press_target | - | 9 | 6 | email | - |
| Harrison Chase | podcast_guest | builder_economy | 10 | 7 | twitter | - |
| Amjad Masad | podcast_guest | builder_economy | 10 | 6 | twitter | - |
| Logan Kilpatrick | podcast_guest | builder_economy | 9 | 8 | twitter | - |
| keepamovin | podcast_guest | builder_economy | 6 | 3 | none | hn-post-only-not-durable-builder |
| erohead | podcast_guest | builder_economy | 5 | 2 | none | hn-post-only-not-durable-builder |

Notes on the calls:

- Deborah Turness was a BBC News head, so the classifier read her as a senior media executive (signal_noise guest) rather than an active reporter (press_target). Defensible. The press_target rule explicitly lists reporters/correspondents/columnists/editors at outlets, not executives.
- Both HN usernames were correctly skipped with the durable-builder rule.
- All three real founders routed cleanly to builder_economy with high fit.
- The Apollo enrich step downstream will fill in `contact_method='none'` rows with real emails when one exists in Apollo; if not, the row stays out of `guests` per the editorial bar.

## Source mix follow-up (not in this patch)

The brief asked for a source-mix shift to demote HN Show HN and add Substack notes, Crunchbase AI funding RSS, recent AI conference rosters, and LinkedIn operator posts. The HN Show HN node is left in place but the quality gate now drops single-Show-HN candidates with zero contact info, so the harm is bounded. Adding higher-signal sources is a separate workflow change tracked in a follow-up task.
