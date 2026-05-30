-- Objective Layer, Phase 1, step 1c: create the milestones table.
--
-- Milestones are the missing layer in the spine. Each objective
-- decomposes into 2 to 5 milestones, each completable in roughly one
-- week, which is the unit Krish blocks deep-work time for. Tasks attach
-- upward to milestones (via tasks.milestone_id, added in step 1d).
--
-- Authorship lifecycle:
--   marcus_proposed     Marcus drafts a sequence so Krish never faces a blank page.
--   krish_authored      Krish hand-wrote a milestone Marcus missed.
--   krish_tweaked       Krish edited Marcus's draft.
--   agatha_decomposed   Agatha auto-decomposed an auto-tagged objective.
--
-- Status lifecycle:
--   proposed   Marcus drafted it; Krish has not yet approved.
--   accepted   Krish approved; not yet started.
--   active     Work in flight.
--   done       Completed.
--   dropped    Rejected or abandoned.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.milestones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id               text NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text,
  sequence              int  NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'proposed'
                         CHECK (status IN ('proposed','accepted','active','done','dropped')),
  source                text NOT NULL DEFAULT 'marcus_proposed'
                         CHECK (source IN ('marcus_proposed','krish_authored','krish_tweaked','agatha_decomposed')),
  est_deep_work_hours   int,
  proposed_at           timestamptz,
  accepted_at           timestamptz,
  completed_at          timestamptz,
  marcus_reasoning      text,
  concept_id            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the common access patterns:
--   per-objective milestone list (the tree view).
--   per-status filters (the proposal tray, the active set).
--   ordered listing within an objective.
CREATE INDEX IF NOT EXISTS milestones_goal_id_idx
  ON public.milestones (goal_id);

CREATE INDEX IF NOT EXISTS milestones_status_idx
  ON public.milestones (status);

CREATE INDEX IF NOT EXISTS milestones_goal_sequence_idx
  ON public.milestones (goal_id, sequence);

-- RLS: standard pair. anon reads for the Control Center; service_role
-- writes for the agents (Marcus proposes, Agatha decomposes).
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='milestones' AND policyname='milestones_anon_read'
  ) THEN
    CREATE POLICY milestones_anon_read ON public.milestones
      FOR SELECT TO anon USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='milestones' AND policyname='milestones_service_all'
  ) THEN
    CREATE POLICY milestones_service_all ON public.milestones
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- updated_at trigger using the shared public.tg_set_updated_at() function.
DROP TRIGGER IF EXISTS milestones_set_updated_at ON public.milestones;
CREATE TRIGGER milestones_set_updated_at
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMIT;
