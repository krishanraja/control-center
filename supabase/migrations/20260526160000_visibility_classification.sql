-- Visibility classification migration.
-- Adds target_type to guests so press journalists can route to visibility_targets,
-- broadens visibility_targets.type to include press_relationship,
-- creates nell_rejected log so the new Nell quality gate can record silent skips,
-- and backfills target_type for the known journalist guests.
-- Additive only, idempotent.

-- ============== guests.target_type ==============

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'podcast_guest';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guests_target_type_check'
  ) THEN
    ALTER TABLE public.guests
      ADD CONSTRAINT guests_target_type_check
      CHECK (target_type IN ('podcast_guest','press_target','dual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS guests_target_type_idx
  ON public.guests (target_type, status);

-- ============== visibility_targets.type widen ==============
-- type is enforced in TypeScript today and previously had a CHECK constraint
-- listing 6 values. Widen it to include press_relationship and speaking so
-- Nell can route press journalists here and Nova can record speaking ops
-- distinct from generic conferences.

ALTER TABLE public.visibility_targets
  DROP CONSTRAINT IF EXISTS visibility_targets_type_check;

ALTER TABLE public.visibility_targets
  ADD CONSTRAINT visibility_targets_type_check
  CHECK (type IN (
    'cfp','conference','podcast','newsletter','guest_appearance',
    'press_relationship','speaking','other'
  ));

-- ============== nell_rejected log ==============
-- Silent-skip audit for the new Nell classifier. The new quality gate logs every
-- candidate it drops so the editorial bar is observable, without surfacing junk
-- to Krish's Triage queue.

CREATE TABLE IF NOT EXISTS public.nell_rejected (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  source_url  text,
  source      text,
  reason      text NOT NULL,
  raw_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nell_rejected_created_at_idx
  ON public.nell_rejected (created_at DESC);

ALTER TABLE public.nell_rejected ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nell_rejected' AND policyname = 'nell_rejected_anon_read'
  ) THEN
    CREATE POLICY nell_rejected_anon_read ON public.nell_rejected
      FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nell_rejected' AND policyname = 'nell_rejected_service_write'
  ) THEN
    CREATE POLICY nell_rejected_service_write ON public.nell_rejected
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============== Backfill: known journalists -> target_type='press_target' ==============
-- Heuristic: one_liner / why_fit / notes references a named press outlet or a journalist role.

UPDATE public.guests
SET target_type = 'press_target'
WHERE target_type = 'podcast_guest'
  AND status NOT IN ('skipped','done')
  AND (
       one_liner ILIKE '%journalist%'
    OR one_liner ILIKE '%reporter%'
    OR one_liner ILIKE '%correspondent%'
    OR one_liner ILIKE '%columnist%'
    OR one_liner ILIKE '%news anchor%'
    OR one_liner ILIKE '%editor-in-chief%'
    OR one_liner ILIKE '%senior editor%'
    OR one_liner ILIKE '%staff writer%'
    OR one_liner ILIKE '%Wirecutter%'
    OR one_liner ILIKE '%NiemanLab%'
    OR one_liner ILIKE '%Digiday%'
    OR one_liner ILIKE '%Wall Street Journal%'
    OR one_liner ILIKE '%WSJ%'
    OR one_liner ILIKE '%BBC%'
    OR one_liner ILIKE '%The Information%'
    OR one_liner ILIKE '%NYT%'
    OR one_liner ILIKE '%New York Times%'
    OR one_liner ILIKE '%Bloomberg%'
    OR one_liner ILIKE '%Axios%'
    OR one_liner ILIKE '%Reuters%'
    OR one_liner ILIKE '%The Atlantic%'
    OR one_liner ILIKE '%The Guardian%'
    OR one_liner ILIKE '%Vox%'
    OR one_liner ILIKE '%The Verge%'
    OR one_liner ILIKE '%Wired%'
    OR one_liner ILIKE '%TechCrunch%'
    OR one_liner ILIKE '%Forbes%'
    OR one_liner ILIKE '%Financial Times%'
    OR one_liner ILIKE '%The Economist%'
    OR why_fit ILIKE '%journalist%'
    OR why_fit ILIKE '%reporter%'
    OR why_fit ILIKE '%correspondent%'
    OR why_fit ILIKE '%columnist%'
  );
