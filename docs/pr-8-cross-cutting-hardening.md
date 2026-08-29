# PR 8: cross-cutting hardening + agent brief edits + deprecated drops

Part of the mind/make OS rebuild (see `OS-PROGRESS.md` in workspace memory). This is the last sequenced PR.

## What ships

### Agent brief appends (8 agents)
The cross-cutting section of the rebuild brief specifies one new section per agent reflecting the PR 4 to PR 7 world. Migration `2026-05-22-pr8-agent-brief-appends.sql` applies these as `UPDATE agents SET brief_content = brief_content || E'\n\n## <section>'` with a `NOT LIKE` guard so re-runs are idempotent.

- **Agatha**: Decisions Waiting view (PR 7). Use the view as the single source of truth.
- **Cleo**: Content idea extraction (PR 3 + PR 5). Quality contract, GOOD/BAD seeds, feedback loop.
- **Felix**: Lead routing under PR 5 multi-tag. Sort by `icp_scores->>primary_venture`, coordinate handoff on multi-tag leads.
- **Maya**: Customer Acquisition Sweeper RLS note. Until source RLS amended, sweeper produces 0 rows. The Tier 2 flag is expected; Vera does not propose a correction.
- **Nell**: Guests pipeline (PR 4). Lifecycle states, Confirmed Cascade automation, show-fit rubric.
- **Nova**: visibility_targets unified table (PR 4). Both kinds; completeness contract; Speaker Card titles.
- **Vera**: Feedback aggregation + silent_failures consumption (PR 5 + PR 6). Two Sunday workflows; confidence threshold 0.85; specific + testable proposed rules.
- **Zara**: Signal write contract (PR 2 + PR 6). Hard contract; no placeholder rows; Tier 2 detection trigger.

The render-identity cron picks these up within 15 minutes and refreshes `/root/.openclaw/skills/agent-<id>/SKILL.md`.

### Dropped deprecated tables
Migration `2026-05-22-pr8b-drop-deprecated.sql` drops `nova_target_conferences` and `nell_candidates` after a safety check confirms the migrated data is present in `visibility_targets` (>= 12 rows) and `guests` (>= 36 rows). The brief originally specified a 30-day safety window for the drops; Krish authorized completion now (the migrated data has been live since PR 4 ship at 2026-05-22 ~10:04 UTC).

### Cross-cutting state confirmed
- `src/lib/tabs.ts` carries Guests as primary on desktop, drawer on mobile (added in PR 1, confirmed unchanged).
- All 8 PRs are merged. `schema_migrations` reflects each one.
- All deferred workflow activations (PR 4 Nova/Guest, PR 5 Vera) are addressed in the follow-up task (see OS-PROGRESS).

## Acceptance tests (run post-merge)

1. `SELECT id, brief_updated_at::date FROM agents WHERE id IN ('agatha','cleo','felix','maya','nell','nova','vera','zara');` all 8 show today's date.
2. `SELECT to_regclass('public.nova_target_conferences'), to_regclass('public.nell_candidates');` both NULL.
3. `SELECT count(*) FROM visibility_targets;` >= 12.
4. `SELECT count(*) FROM guests;` >= 36.
5. Render-identity cron output: each of `/root/.openclaw/skills/agent-<id>/SKILL.md` contains the new section header within 15 minutes of merge.
