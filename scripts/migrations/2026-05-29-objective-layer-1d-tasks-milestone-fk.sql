-- Objective Layer, Phase 1, step 1d: add tasks.milestone_id.
--
-- A task either serves a milestone (FK set) or is genuinely tactical
-- (FK null). The null case is legitimate and intended; do not backfill.
-- Existing tasks stay null until Phase 4's triage UI lets Krish attach
-- the ones that actually belong to a milestone. Backfilling here would
-- guess on Krish's behalf at the worst moment (before the milestones
-- exist).
--
-- ON DELETE SET NULL: if a milestone is dropped or replaced, its tasks
-- survive as unattached tactical work; Krish can re-attach.
--
-- Idempotent.

BEGIN;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS milestone_id uuid
    REFERENCES public.milestones(id) ON DELETE SET NULL;

-- Partial index: most tasks will have milestone_id NULL forever. Index
-- only the populated rows so the joined-task lookup stays cheap.
CREATE INDEX IF NOT EXISTS tasks_milestone_id_idx
  ON public.tasks (milestone_id)
  WHERE milestone_id IS NOT NULL;

COMMIT;
