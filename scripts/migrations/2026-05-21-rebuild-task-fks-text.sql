-- Follow-up to PR #41 (leads-follow-up.sql + nell-scheduled-task.sql).
--
-- At original-migration time, `leads.promoted_task_id` and
-- `nell_candidates.scheduled_task_id` were declared as `uuid REFERENCES
-- tasks(id)`. Because `tasks.id` is `text`, the FK silently dropped at
-- migration time (Postgres rejects FK between mismatched types but the
-- ADD COLUMN succeeded without the REFERENCES clause taking effect).
--
-- Audit on 2026-05-21 showed:
--   leads.promoted_task_id   — 4 rows with values, 0 orphans
--   nell_candidates.scheduled_task_id — 0 rows with values
--
-- Safe to ALTER TYPE text in place; ADD CONSTRAINT after.

ALTER TABLE leads
  ALTER COLUMN promoted_task_id TYPE text USING promoted_task_id::text;

ALTER TABLE nell_candidates
  ALTER COLUMN scheduled_task_id TYPE text USING scheduled_task_id::text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name='leads_promoted_task_id_fkey' AND table_name='leads'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_promoted_task_id_fkey
      FOREIGN KEY (promoted_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name='nell_candidates_scheduled_task_id_fkey' AND table_name='nell_candidates'
  ) THEN
    ALTER TABLE nell_candidates
      ADD CONSTRAINT nell_candidates_scheduled_task_id_fkey
      FOREIGN KEY (scheduled_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;
