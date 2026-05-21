-- PR 2 of os-rebuild: purge Zara's perplexity-error garbage rows.
--
-- The Zara Signal Sweep workflow (xAfMItfI8UfAqb3M) had a "Perplexity Error
-- Passthrough" Code node that wrote placeholder rows to zara_signals on every
-- Perplexity failure. As of 2026-05-21 the table had 7 such rows
-- (description='perplexity-error', signal_score=-10, company_name=NULL).
--
-- PR 2 removes the Passthrough node entirely, hardens the downstream filter
-- to require company_name + summary>=20 chars + signal_score>=1, and routes
-- parse errors to audit_log instead. This script wipes the existing garbage.
--
-- Applied live via Supabase management API on 2026-05-21 15:27 UTC. Recorded
-- here for audit trail and future restore-from-fresh-db runs.

DELETE FROM public.zara_signals
WHERE description = 'perplexity-error' OR signal_score < 0;

INSERT INTO public.audit_log (event_type, actor, target, details)
VALUES (
  'zara_error_rows_purged',
  'cli-rebuild-brief',
  'zara_signals',
  '{"rows_deleted": 7, "reason": "PR 2 cleanup; hardened filter + removed Perplexity Error Passthrough prevent recurrence"}'
);
