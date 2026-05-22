-- PR 5.1: leads multi-tag + venture-aware ICP foundation
-- Adds venture_registry table, multi-tag/per-venture-score columns on leads,
-- and backfills the existing 4 leads so the new ingest workflow can run safely.
-- Idempotent: every statement uses IF NOT EXISTS / ON CONFLICT.

BEGIN;

-- 1. venture_registry: canonical list of ventures one lead can map to.
CREATE TABLE IF NOT EXISTS public.venture_registry (
  slug             text PRIMARY KEY,
  display_name     text        NOT NULL,
  kind             text        NOT NULL,
  icp_description  text        NOT NULL,
  scoring_criteria jsonb       NOT NULL DEFAULT '{}'::jsonb,
  active           boolean     NOT NULL DEFAULT true,
  sort_order       integer     NOT NULL DEFAULT 100,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venture_registry_active
  ON public.venture_registry(active, sort_order);

ALTER TABLE public.venture_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venture_registry' AND policyname = 'venture_registry_service_all'
  ) THEN
    CREATE POLICY venture_registry_service_all ON public.venture_registry
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venture_registry' AND policyname = 'venture_registry_anon_read'
  ) THEN
    CREATE POLICY venture_registry_anon_read ON public.venture_registry
      FOR SELECT TO anon USING (true);
  END IF;
END$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS venture_registry_set_updated_at ON public.venture_registry;
CREATE TRIGGER venture_registry_set_updated_at
  BEFORE UPDATE ON public.venture_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Seed ventures Krish actively runs.
INSERT INTO public.venture_registry (slug, display_name, kind, icp_description, scoring_criteria, sort_order)
VALUES
  ('mindmaker', 'Mindmaker', 'product',
   'Non-technical founders or operators serious about adopting AI in their workflow. Maven cohort buyers, paid community members, vibe-coding-curious execs.',
   '{"weights": {"role_fit": 0.30, "intent_signals": 0.25, "ai_fluency_gap": 0.20, "budget_signal": 0.15, "audience_overlap": 0.10}, "tier_thresholds": {"hot": 80, "warm": 60, "watch": 40}}'::jsonb,
   10),
  ('signal_noise', 'Signal & Noise', 'podcast',
   'Builders or operators with a strong contrarian thesis, novel craft, or under-told story relevant to ambitious founders. Guest candidates, not buyers.',
   '{"weights": {"narrative_strength": 0.35, "novelty": 0.25, "audience_pull": 0.20, "availability_signal": 0.10, "krish_curiosity": 0.10}, "tier_thresholds": {"hot": 75, "warm": 55, "watch": 35}}'::jsonb,
   20),
  ('builder_economy', 'Builder Economy', 'podcast',
   'Solo or small-team builders shipping unusually leveraged work. Tools, infra, distribution stories that compound. Guests, partners, occasional sponsors.',
   '{"weights": {"leverage_score": 0.35, "ship_cadence": 0.25, "infra_thesis": 0.20, "audience_pull": 0.10, "krish_curiosity": 0.10}, "tier_thresholds": {"hot": 75, "warm": 55, "watch": 35}}'::jsonb,
   30)
ON CONFLICT (slug) DO NOTHING;

-- 3. leads: new columns for multi-venture surfacing.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags            text[]  NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS icp_scores      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_venture text    NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_primary_venture_fk'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_primary_venture_fk
      FOREIGN KEY (primary_venture) REFERENCES public.venture_registry(slug)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_leads_primary_venture_status
  ON public.leads(primary_venture, status);
CREATE INDEX IF NOT EXISTS idx_leads_tags_gin
  ON public.leads USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_leads_icp_scores_gin
  ON public.leads USING gin(icp_scores);

-- 4. Backfill existing leads: assume Mindmaker buyer track; preserve prior icp_score.
UPDATE public.leads
   SET primary_venture = 'mindmaker',
       tags = CASE
                WHEN 'mindmaker_buyer' = ANY(tags) THEN tags
                ELSE array_append(tags, 'mindmaker_buyer')
              END,
       icp_scores = COALESCE(icp_scores, '{}'::jsonb)
                    || jsonb_build_object('mindmaker', COALESCE(icp_score, 0))
 WHERE primary_venture IS NULL;

COMMIT;
