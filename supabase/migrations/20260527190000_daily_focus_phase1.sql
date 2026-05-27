-- Phase 1 of focus + tasks inbox brief: Daily Focus Picker.
--
-- Marcus nominates 3, Krish accepts/swaps/adds his own, hits Lock. Whole
-- Home re-ranks into 3 lanes plus a muted lane. Carry-over if a day's
-- targets aren't all complete. 3-for-3 streak alongside existing streaks.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.daily_focus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_date date NOT NULL,

  target_1_text                  text,
  target_1_concept_id            text,
  target_1_source                text CHECK (target_1_source IN ('marcus_nominated','krish_swapped','krish_added') OR target_1_source IS NULL),
  target_1_replaced_marcus_pick  jsonb,
  target_1_completed_at          timestamptz,

  target_2_text                  text,
  target_2_concept_id            text,
  target_2_source                text CHECK (target_2_source IN ('marcus_nominated','krish_swapped','krish_added') OR target_2_source IS NULL),
  target_2_replaced_marcus_pick  jsonb,
  target_2_completed_at          timestamptz,

  target_3_text                  text,
  target_3_concept_id            text,
  target_3_source                text CHECK (target_3_source IN ('marcus_nominated','krish_swapped','krish_added') OR target_3_source IS NULL),
  target_3_replaced_marcus_pick  jsonb,
  target_3_completed_at          timestamptz,

  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','calibrated','complete','carried_over')),
  calibrated_at       timestamptz,
  completed_at        timestamptz,
  carried_from_date   date,

  relevance_index     jsonb NOT NULL DEFAULT '{}'::jsonb,
  marcus_suggestions  jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_focus_focus_date_idx ON public.daily_focus (focus_date);
CREATE INDEX        IF NOT EXISTS daily_focus_status_idx     ON public.daily_focus (status);

ALTER TABLE public.daily_focus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_daily_focus"          ON public.daily_focus;
DROP POLICY IF EXISTS "service_role_all_daily_focus"   ON public.daily_focus;

CREATE POLICY "anon_read_daily_focus"
  ON public.daily_focus FOR SELECT TO anon USING (true);
CREATE POLICY "service_role_all_daily_focus"
  ON public.daily_focus FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_daily_focus_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_focus_touch_updated_at ON public.daily_focus;
CREATE TRIGGER daily_focus_touch_updated_at
  BEFORE UPDATE ON public.daily_focus
  FOR EACH ROW EXECUTE FUNCTION public.touch_daily_focus_updated_at();

-- mark_target_complete: idempotent per-target completion. If all 3 complete,
-- the row moves to status='complete' and completed_at is stamped.
CREATE OR REPLACE FUNCTION public.mark_target_complete(p_date date, p_target_num int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.daily_focus;
  v_all_complete boolean;
BEGIN
  IF p_target_num NOT IN (1,2,3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_target_num must be 1, 2, or 3');
  END IF;

  EXECUTE format(
    'UPDATE public.daily_focus
        SET target_%1$s_completed_at = COALESCE(target_%1$s_completed_at, now()),
            updated_at = now()
      WHERE focus_date = $1
   RETURNING *',
    p_target_num
  ) INTO v_row USING p_date;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no daily_focus row for that date');
  END IF;

  v_all_complete := v_row.target_1_completed_at IS NOT NULL
                AND v_row.target_2_completed_at IS NOT NULL
                AND v_row.target_3_completed_at IS NOT NULL;

  IF v_all_complete AND v_row.status <> 'complete' THEN
    UPDATE public.daily_focus
       SET status = 'complete', completed_at = now()
     WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'date', p_date,
    'target', p_target_num,
    'all_complete', v_all_complete
  );
END;
$$;
