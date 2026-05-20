-- Allow tasks to be dismissed as 'superseded' from the Control Center.
-- The Today tab currently shows stale tasks (>14d, no progress) including
-- the legacy "Configure ListenNotes API" task whose underlying service has
-- been replaced by Podchaser. A dismiss button writes status='superseded'
-- so the row stays in the audit trail but disappears from the action surface.
--
-- The tasks.status column has no explicit CHECK constraint at the moment
-- (verified via Supabase introspection on 2026-05-20), so no enum widening
-- is required. This migration is mostly documentation + a partial index
-- so the Control Center's stale-collapse query stays fast.

-- Allow the new status value semantically; no schema change needed if
-- the column is plain text. If a CHECK constraint is added later, include
-- 'superseded' in the allowed set.

CREATE INDEX IF NOT EXISTS tasks_status_updated_idx
  ON tasks (status, updated_at DESC)
  WHERE status IN ('active','waiting','new','in_progress');

-- Optional: backfill comment for forensic clarity. Not destructive.
COMMENT ON COLUMN tasks.status IS
  'Task lifecycle: new, active, in_progress, waiting, done, superseded. '
  'superseded = dismissed by Krish because the underlying need no longer exists '
  '(e.g. replaced tool, abandoned workstream).';
