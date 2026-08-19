-- Freshness + learning loop (2026-08-19, second pass).
--
-- Audit findings this migration answers:
--
-- (b) FRESHNESS. The Monday purge exempts drafting/review/approved/published
--     from expiry deletion, so the moment an idea leaves 'seeded' it becomes
--     immortal. Live right now: 160 unburied rows, 80 already past expires_at.
--     `drafting` is 49 rows of which 48 are expired (avg age 31d). `review` is
--     9 rows, all 9 expired, avg age 70d, oldest 74d.
--
--     `updated_at` cannot detect this. Background re-scoring sweeps touch rows
--     constantly, so those 74-day-old review items report "touched 8 days ago"
--     and ZERO rows look idle. Archiving on updated_at would archive nothing.
--     What is needed is a DECISION-progress signal, not a row-touch signal:
--     new `state_changed_at`, moved only when `state` actually changes.
--
-- (b2) ARCHIVE != FORGET. api/shifts/detect.ts filters `.is('buried_at', null)`,
--     so burying a row also removes it from the trend corpus. "Archive it, keep
--     reading trends from it, stop surfacing it to me" is impossible today.
--     Fixed on the reader side (detect.ts) rather than here; this migration adds
--     the `stale:` reason prefix that lets the reader tell an archived-but-real
--     row apart from a deduped duplicate, which must NOT re-enter the corpus
--     (its citations were already folded into its keeper's meta.recurrences).
--
-- (a) FRAGILITY. Every health signal in the OS is self-reported by the workflow
--     that is supposed to be healthy, and heartbeats are written at the END of a
--     run. A workflow that dies at node 3 writes nothing, and nothing is
--     indistinguishable from "not scheduled today". Evidence: HARO Ingestion has
--     failed 94/94 on a deleted Gmail credential, Maya's sweeper 12/12, Vera's
--     Feedback Aggregation 2/2 on a 401, while `credential_health` holds 20 rows
--     all marked healthy, last verified 2026-05-19. The sensor is unplugged and
--     stuck on green. `workflow_health` below is written by an EXTERNAL observer
--     (api/health/fleet-reconcile.ts, a Vercel cron) that reads the n8n
--     executions API. An n8n workflow monitoring n8n has the same blind spot.

-- ---------------------------------------------------------------------------
-- 1. Decision-progress timestamp for content_ideas
-- ---------------------------------------------------------------------------

ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_content_idea_state_changed()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Only real state transitions count. A re-score, an enrichment write, or a
  -- meta patch is not progress on a decision and must not reset the clock.
  IF TG_OP = 'INSERT' THEN
    NEW.state_changed_at := COALESCE(NEW.state_changed_at, now());
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.state_changed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_content_ideas_state_changed ON public.content_ideas;
CREATE TRIGGER trg_content_ideas_state_changed
  BEFORE INSERT OR UPDATE ON public.content_ideas
  FOR EACH ROW EXECUTE FUNCTION public.touch_content_idea_state_changed();

-- Backfill. There is no state history for content_ideas (status_change_log only
-- ever covered leads and tasks), so created_at is the only honest floor: we know
-- the row has been in its current state at most this long, and for anything
-- still sitting in review after 74 days that is precisely the point.
UPDATE public.content_ideas
SET state_changed_at = created_at
WHERE state_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS content_ideas_state_changed_idx
  ON public.content_ideas (state_changed_at)
  WHERE buried_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Staleness archive: bury on neglect, keep for trends
-- ---------------------------------------------------------------------------

-- Buries any live idea whose STATE has not moved in p_days. Bury, never delete:
-- the row stays queryable and (per the detect.ts change shipped alongside this)
-- keeps feeding shift detection. Rows Krish has committed to are exempt:
-- anything linked to a shift, graduated to the library, or already published.
CREATE OR REPLACE FUNCTION public.archive_stale_content_ideas(
  p_days    int     DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_days int;
  v_cutoff timestamptz;
  v_rows jsonb;
  v_ids uuid[];
  v_n int := 0;
BEGIN
  v_days := COALESCE(
    p_days,
    NULLIF((SELECT value FROM public.system_config WHERE key = 'content_staleness_archive_days'), '')::int,
    14);
  v_days := GREATEST(3, LEAST(v_days, 180));
  v_cutoff := now() - make_interval(days => v_days);

  SELECT COALESCE(array_agg(id), '{}')
  INTO v_ids
  FROM public.content_ideas
  WHERE buried_at IS NULL
    AND COALESCE(state_changed_at, created_at) < v_cutoff
    AND COALESCE(state, 'seeded') NOT IN ('published', 'absorbed')
    AND shift_id IS NULL       -- feeding a live shift: Krish committed to it
    AND library_at IS NULL;    -- graduated: evergreen by decision

  v_n := COALESCE(array_length(v_ids, 1), 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'idea', left(idea, 90), 'state', state,
           'idle_days', round(extract(epoch FROM (now() - COALESCE(state_changed_at, created_at))) / 86400)
         ) ORDER BY COALESCE(state_changed_at, created_at)), '[]'::jsonb)
  INTO v_rows
  FROM (SELECT id, idea, state, state_changed_at, created_at
        FROM public.content_ideas
        WHERE id = ANY(v_ids)
        ORDER BY COALESCE(state_changed_at, created_at)
        LIMIT 25) s;

  IF NOT p_dry_run AND v_n > 0 THEN
    UPDATE public.content_ideas ci
    SET buried_at = now(),
        -- The 'stale:' prefix is load-bearing. detect.ts re-admits these to the
        -- trend corpus; rows buried as duplicates stay out, because their
        -- citations already live in their keeper's meta.recurrences.
        buried_reason = 'stale: no state change in ' || v_days || ' days (was ' || COALESCE(ci.state,'seeded') || ')'
    WHERE ci.id = ANY(v_ids);
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run, 'idle_days_threshold', v_days,
    'archived', CASE WHEN p_dry_run THEN 0 ELSE v_n END,
    'would_archive', v_n, 'sample', v_rows);
END $$;

REVOKE EXECUTE ON FUNCTION public.archive_stale_content_ideas(int, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_stale_content_ideas(int, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_stale_content_ideas(int, boolean) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.archive_stale_content_ideas(int, boolean) TO service_role;

INSERT INTO public.system_config (key, value) VALUES
  ('content_staleness_archive_days', '14')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. External runtime truth for the fleet
-- ---------------------------------------------------------------------------

-- One row per n8n workflow, written by api/health/fleet-reconcile.ts from the
-- n8n executions API. This is the only table in the OS whose health data does
-- not come from the thing being measured.
CREATE TABLE IF NOT EXISTS public.workflow_health (
  workflow_id     text PRIMARY KEY,
  workflow_name   text,
  active          boolean,
  is_scheduled    boolean,
  runs_28d        integer NOT NULL DEFAULT 0,
  errors_28d      integer NOT NULL DEFAULT 0,
  error_rate      numeric,
  last_run_at     timestamptz,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error_node text,
  last_error_type text,
  last_error_message text,
  -- healthy | degraded | failing | dead | idle
  status          text NOT NULL DEFAULT 'healthy',
  -- credential | quota | logic | network | unknown - so a credential outage is
  -- one alert about credentials, not six unrelated workflow alerts.
  failure_class   text,
  checked_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_health_status_idx ON public.workflow_health (status);

ALTER TABLE public.workflow_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read workflow_health" ON public.workflow_health;
CREATE POLICY "anon read workflow_health" ON public.workflow_health
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "service write workflow_health" ON public.workflow_health;
CREATE POLICY "service write workflow_health" ON public.workflow_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- What is actually broken right now, grouped by cause rather than by workflow.
CREATE OR REPLACE VIEW public.fleet_failures AS
SELECT failure_class,
       count(*)                                   AS workflows,
       sum(errors_28d)                            AS failed_runs_28d,
       max(last_error_at)                         AS most_recent,
       jsonb_agg(jsonb_build_object(
         'workflow', workflow_name,
         'status', status,
         'error_rate', error_rate,
         'node', last_error_node,
         'message', left(COALESCE(last_error_message,''), 160)
       ) ORDER BY errors_28d DESC)                AS detail
FROM public.workflow_health
WHERE status IN ('failing','dead','degraded')
GROUP BY failure_class;

GRANT SELECT ON public.workflow_health, public.fleet_failures TO anon, authenticated, service_role;

COMMENT ON TABLE public.workflow_health IS
  'External runtime truth for the n8n fleet, written by api/health/fleet-reconcile.ts from the n8n executions API. Unlike workflow_runs (self-reported by each workflow at the END of a run, so a workflow that dies mid-run writes nothing) this sees failures the OS is otherwise blind to.';
