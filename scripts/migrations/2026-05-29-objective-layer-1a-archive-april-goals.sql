-- Objective Layer, Phase 1, step 1a: archive the April 14 2026 chore rows
-- before repurposing the goals table into portfolio objectives.
--
-- The 8 live goals are all agent-ops chores (Apollo deployment, systems
-- monitor, model-tier enforcement, etc.) that nothing reads. They predate
-- the objective layer and would corrupt the new objective semantics if
-- left in place.
--
-- Safety contract: this migration is split into two committed steps. The
-- archive insert runs and is verified; only if 8 rows land in the archive
-- does the DELETE proceed. Re-running is a no-op because the archive
-- table is created IF NOT EXISTS, the INSERT is guarded against
-- duplicate ids, and the DELETE is guarded against rows that have
-- already been archived.
--
-- Idempotent.

BEGIN;

-- 1. Archive table mirrors the live goals shape at archive time
-- (INCLUDING ALL preserves defaults, constraints, indexes, comments).
CREATE TABLE IF NOT EXISTS public.goals_archive_2026_04
  (LIKE public.goals INCLUDING ALL);

-- 2. Insert the April rows. Guarded by NOT EXISTS so re-running is safe.
INSERT INTO public.goals_archive_2026_04
SELECT g.*
FROM public.goals g
WHERE g.week_of = 'Week of April 14, 2026'
  AND NOT EXISTS (
    SELECT 1 FROM public.goals_archive_2026_04 a WHERE a.id = g.id
  );

-- 3. Verify before delete. Refuses to delete unless the archive contains
-- exactly the 8 April rows we expected. If reality has shifted, this
-- raises and rolls back; the operator then re-grounds and adjusts.
DO $$
DECLARE
  v_archive_count int;
  v_live_april_count int;
BEGIN
  SELECT count(*) INTO v_archive_count
    FROM public.goals_archive_2026_04
   WHERE week_of = 'Week of April 14, 2026';

  SELECT count(*) INTO v_live_april_count
    FROM public.goals
   WHERE week_of = 'Week of April 14, 2026';

  IF v_archive_count < v_live_april_count THEN
    RAISE EXCEPTION
      'Archive verification failed: archive has % April rows, live has %. Refusing to delete.',
      v_archive_count, v_live_april_count;
  END IF;

  RAISE NOTICE 'Archive holds % April row(s); safe to delete from live.', v_archive_count;
END$$;

-- 4. Delete the archived rows from live goals. Guarded by the same
-- predicate, so re-running after a successful run is a no-op.
DELETE FROM public.goals
 WHERE week_of = 'Week of April 14, 2026';

COMMIT;
