-- Rollback for Day 1 Stream 1 closure architecture (2026-05-25)
-- Execute via Supabase Management SQL API or psql.
-- Hard rollback. Removes everything Day 1 created.
-- It does NOT revert the Disney lead status change. To revert that explicitly,
-- run this BEFORE dropping triggers (so the revert is logged):
--   UPDATE leads SET status='ready', updated_at=now() WHERE id='d2dd4b08-dc56-4f07-b57f-a7d003164874';

BEGIN;

DROP TRIGGER IF EXISTS trg_log_status_change_tasks ON tasks;
DROP TRIGGER IF EXISTS trg_log_status_change_leads ON leads;
DROP FUNCTION IF EXISTS log_status_change();
DROP FUNCTION IF EXISTS close_concept(text, text, text);
DROP FUNCTION IF EXISTS reopen_concept(text, text, text);
DROP FUNCTION IF EXISTS compute_concept_slug(text);

DROP TABLE IF EXISTS status_change_log;
DROP TABLE IF EXISTS concept_decisions;

DROP INDEX IF EXISTS idx_tasks_concept_id;
DROP INDEX IF EXISTS idx_leads_concept_id;

ALTER TABLE tasks DROP COLUMN IF EXISTS concept_id;
ALTER TABLE leads DROP COLUMN IF EXISTS concept_id;

-- audit_log rows with event_type IN ('concept_closed','concept_reopened') are left as history.
-- To purge: DELETE FROM audit_log WHERE event_type IN ('concept_closed', 'concept_reopened');

COMMIT;
