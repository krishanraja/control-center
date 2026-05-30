-- Weekly Focus Takeover (Phase 2 of the focus spine).
--
-- Once a week, Home is taken over by a wizard that forces Krish to commit his
-- weekly focus: accept / tweak / reject Marcus-proposed milestones under his
-- active portfolio objectives, capped at 3 weekly commitments. Those committed
-- milestones then bias Marcus's daily top_three.
--
-- We do NOT infer "weekly focus set this week" from milestone status: status
-- carries forward across weeks and a zero-new-commitment week is valid, so
-- status alone cannot answer "did Krish run the ritual this week". Instead a
-- dedicated weekly_focus row, keyed by the Monday of the week (week_of), records
-- the commitment, and weekly_focus_milestones links the (up to 3) milestones he
-- committed to for that week. The milestones table is unchanged: the weekly
-- meaning lives in the bridge, so history is preserved week over week.
--
-- goals.id is text and milestones.id is uuid: FK column types match each.
-- Idempotent: safe to run repeatedly.

BEGIN;

-- 1. The weekly commitment record. One committed row per week (UNIQUE week_of).
CREATE TABLE IF NOT EXISTS public.weekly_focus (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of       date NOT NULL UNIQUE,           -- Monday (Europe/London) of the committed week
  status        text NOT NULL DEFAULT 'committed'
                 CHECK (status IN ('committed','superseded')),
  committed_at  timestamptz NOT NULL DEFAULT now(),
  retro_ack     boolean NOT NULL DEFAULT false, -- did the wizard's review step ack the Friday retro
  source        text NOT NULL DEFAULT 'krish_committed',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. The bridge: which milestones were committed for which week. week_of is
--    denormalized so the weekly read is a single cheap query; the FK to
--    weekly_focus keeps it consistent. UNIQUE(week_of, milestone_id) blocks
--    committing the same milestone twice in a week.
CREATE TABLE IF NOT EXISTS public.weekly_focus_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_focus_id uuid NOT NULL REFERENCES public.weekly_focus(id) ON DELETE CASCADE,
  week_of         date NOT NULL,
  milestone_id    uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  goal_id         text NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  last_served_at  timestamptz,                  -- stamped when a daily pick advances this milestone
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_of, milestone_id)
);

CREATE INDEX IF NOT EXISTS weekly_focus_week_idx
  ON public.weekly_focus (week_of);
CREATE INDEX IF NOT EXISTS weekly_focus_milestones_week_idx
  ON public.weekly_focus_milestones (week_of);
CREATE INDEX IF NOT EXISTS weekly_focus_milestones_milestone_idx
  ON public.weekly_focus_milestones (milestone_id);

-- 3. RLS: standard pair on both tables. anon reads for the Control Center;
--    service_role writes for the /api/weekly-focus routes (Vercel service key).
ALTER TABLE public.weekly_focus            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_focus_milestones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='weekly_focus' AND policyname='weekly_focus_anon_read'
  ) THEN
    CREATE POLICY weekly_focus_anon_read ON public.weekly_focus
      FOR SELECT TO anon USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='weekly_focus' AND policyname='weekly_focus_service_all'
  ) THEN
    CREATE POLICY weekly_focus_service_all ON public.weekly_focus
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='weekly_focus_milestones' AND policyname='weekly_focus_milestones_anon_read'
  ) THEN
    CREATE POLICY weekly_focus_milestones_anon_read ON public.weekly_focus_milestones
      FOR SELECT TO anon USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='weekly_focus_milestones' AND policyname='weekly_focus_milestones_service_all'
  ) THEN
    CREATE POLICY weekly_focus_milestones_service_all ON public.weekly_focus_milestones
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- 4. updated_at trigger using the shared public.tg_set_updated_at() function.
DROP TRIGGER IF EXISTS weekly_focus_set_updated_at ON public.weekly_focus;
CREATE TRIGGER weekly_focus_set_updated_at
  BEFORE UPDATE ON public.weekly_focus
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. Realtime: the weekly takeover and the in-week tracker subscribe to a
--    shared channel on weekly_focus, mirroring daily_focus. Without this the
--    takeover would not auto-dismiss after a commit on a second device.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='weekly_focus'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_focus;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='weekly_focus_milestones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_focus_milestones;
  END IF;
END$$;

COMMIT;
