-- Extend the BEFORE UPDATE trigger on tasks to also stamp completed_at when
-- a task transitions to 'done'. Mirrors the existing started_at pattern in
-- docs/DATABASE.md §Database Triggers.
--
-- Why: 12 done tasks landed with completed_at = NULL because the original
-- trigger only stamped started_at. The "published this week" tile (and any
-- future cycle-time metric) underreports until both columns are populated
-- on transition.
--
-- Behaviour:
--   - status -> 'in_progress'  ⇒ stamp started_at if not already set
--   - status -> 'done'         ⇒ stamp completed_at if not already set
--   - if completed_at is set explicitly in the UPDATE, do not clobber it
-- Backfills the 12 historical rows from updated_at after the trigger is in
-- place, so historical "published" counts are correct.

-- 1. Replace the trigger function (keeps started_at logic, adds completed_at)
CREATE OR REPLACE FUNCTION stamp_task_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND (OLD.status IS DISTINCT FROM 'in_progress') THEN
    IF NEW.started_at IS NULL THEN
      NEW.started_at = NOW();
    END IF;
  END IF;

  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Swap the trigger to point at the new function. Drop+create rather than
--    rename so the old started_at-only function can be cleaned up safely.
--    Real existing names in this DB: trigger `trg_set_started_at`, function `set_started_at()`.
--    (Also drop the documented `tasks_stamp_*` names in case any environment uses them.)
DROP TRIGGER IF EXISTS trg_set_started_at      ON public.tasks;
DROP TRIGGER IF EXISTS tasks_stamp_started_at  ON public.tasks;
DROP TRIGGER IF EXISTS tasks_stamp_timestamps  ON public.tasks;

CREATE TRIGGER tasks_stamp_timestamps
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION stamp_task_timestamps();

-- 3. Drop the old functions (now unreferenced)
DROP FUNCTION IF EXISTS set_started_at();
DROP FUNCTION IF EXISTS stamp_started_at();

-- 4. Backfill: stamp completed_at from updated_at for done rows missing it.
--    updated_at is the closest signal we have to "when this transitioned to
--    done" since we have no history table.
UPDATE public.tasks
SET completed_at = updated_at
WHERE status = 'done'
  AND completed_at IS NULL
  AND updated_at IS NOT NULL;

-- 5. Verify
-- SELECT
--   count(*) FILTER (WHERE status = 'done')                            AS done_total,
--   count(*) FILTER (WHERE status = 'done' AND completed_at IS NOT NULL) AS done_stamped
-- FROM public.tasks;
-- Expected: done_total == done_stamped (no nulls remaining for done rows).
