-- PR 8b: drop deprecated tables nova_target_conferences + nell_candidates.
-- Krish authorized completion now (not 30 days from now). Migration safety check:
-- ensure visibility_targets and guests have the migrated data before dropping.

BEGIN;

DO $$
DECLARE
  v_visibility_count integer;
  v_guests_count     integer;
  v_nova_count       integer;
  v_nell_count       integer;
BEGIN
  SELECT count(*) INTO v_visibility_count FROM public.visibility_targets;
  SELECT count(*) INTO v_guests_count     FROM public.guests;

  IF v_visibility_count < 12 THEN
    RAISE EXCEPTION 'visibility_targets has only % rows; expected >= 12 (PR 4 backfill). Aborting drop.', v_visibility_count;
  END IF;

  IF v_guests_count < 36 THEN
    RAISE EXCEPTION 'guests has only % rows; expected >= 36 (PR 4 backfill). Aborting drop.', v_guests_count;
  END IF;

  -- Sanity: confirm deprecated tables exist before dropping
  IF to_regclass('public.nova_target_conferences') IS NOT NULL THEN
    SELECT count(*) INTO v_nova_count FROM public.nova_target_conferences;
    RAISE NOTICE 'nova_target_conferences had % rows; dropping (migrated to visibility_targets in PR 4).', v_nova_count;
  END IF;

  IF to_regclass('public.nell_candidates') IS NOT NULL THEN
    SELECT count(*) INTO v_nell_count FROM public.nell_candidates;
    RAISE NOTICE 'nell_candidates had % rows; dropping (migrated to guests in PR 4).', v_nell_count;
  END IF;
END$$;

DROP TABLE IF EXISTS public.nova_target_conferences CASCADE;
DROP TABLE IF EXISTS public.nell_candidates CASCADE;

COMMIT;
