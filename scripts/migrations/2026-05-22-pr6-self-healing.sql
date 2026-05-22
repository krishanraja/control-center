-- PR 6: self-healing four-tier silent failure system
-- Tables: completeness_contracts (per-workflow contracts), silent_failures (detection log).
-- Idempotent: every statement uses IF NOT EXISTS / ON CONFLICT.

BEGIN;

-- 1. completeness_contracts: per (workflow_id, target_table) contract that
-- says what "useful work" looks like. Silent Success Detector and Tier 1
-- Gate nodes both read from this.
CREATE TABLE IF NOT EXISTS public.completeness_contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         text        NOT NULL,
  workflow_name       text,
  target_table        text        NOT NULL,
  required_fields     text[]      NOT NULL,
  forbidden_patterns  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  min_rows_per_run    integer     NOT NULL DEFAULT 0,
  description         text,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, target_table)
);

CREATE INDEX IF NOT EXISTS idx_completeness_contracts_active
  ON public.completeness_contracts(active, workflow_id);

ALTER TABLE public.completeness_contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='completeness_contracts' AND policyname='cc_anon_read'
  ) THEN
    CREATE POLICY cc_anon_read ON public.completeness_contracts FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='completeness_contracts' AND policyname='cc_service_all'
  ) THEN
    CREATE POLICY cc_service_all ON public.completeness_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

DROP TRIGGER IF EXISTS completeness_contracts_set_updated_at ON public.completeness_contracts;
CREATE TRIGGER completeness_contracts_set_updated_at
  BEFORE UPDATE ON public.completeness_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Seed contracts for the six workflows the brief calls out.
INSERT INTO public.completeness_contracts
  (workflow_id, workflow_name, target_table, required_fields, forbidden_patterns, min_rows_per_run, description)
VALUES
  ('xAfMItfI8UfAqb3M', 'OS - Zara Signal Sweep', 'zara_signals',
   ARRAY['company_name','summary','signal_score'],
   '{"description":["-error$","perplexity-error"],"signal_score":"lt:1"}'::jsonb,
   0, 'Zara writes signal rows that must have a named company, summary >= 20 chars, signal_score >= 1.'),
  ('hCbvRXoGWaqG1Znx', 'Nova - Closed-Loop PR Engine', 'visibility_targets',
   ARRAY['name','kind','url'],
   '{}'::jsonb,
   0, 'Legacy Nova workflow. Must have name, kind, url.'),
  ('SIDlCqURzTVsVt70', 'Nova - Visibility Sweeper', 'visibility_targets',
   ARRAY['event_name','event_url','quality_score'],
   '{}'::jsonb,
   0, 'PR 4 visibility enrichment. Must have name, url, and quality_score.'),
  ('fUlQUlyZp1DRRwWT', 'Nell - Lead Document Ingest', 'leads',
   ARRAY['full_name','primary_venture','tags','why_relevant','quality_score'],
   '{"quality_score":"eq:red"}'::jsonb,
   0, 'Lead ingest. Names, ventures, tags, why_relevant required. Red-flagged rows must not be written.'),
  ('nu7nQGZ3Pc3mEaoH', 'Cleo - Content Idea Capture', 'content_ideas',
   ARRAY['idea','thesis','distribution','confidence'],
   '{"confidence":"lt:0.5"}'::jsonb,
   0, 'Content ideas must have thesis, distribution targets, and confidence >= 0.5.'),
  ('8DlMfyTYsbnQGYR2', 'Nell - Guest Scout', 'guests',
   ARRAY['full_name','show_target','why_relevant'],
   '{}'::jsonb,
   0, 'Guest candidates must name the person, target show, and a one-sentence why.')
ON CONFLICT (workflow_id, target_table) DO UPDATE SET
  workflow_name      = EXCLUDED.workflow_name,
  required_fields    = EXCLUDED.required_fields,
  forbidden_patterns = EXCLUDED.forbidden_patterns,
  description        = EXCLUDED.description,
  active             = true,
  updated_at         = now();

-- 3. silent_failures: detection log. Drives Home banner + Telegram + Vera consumption.
CREATE TABLE IF NOT EXISTS public.silent_failures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id           text        NOT NULL,
  workflow_name         text,
  detected_at           timestamptz NOT NULL DEFAULT now(),
  tier                  smallint    NOT NULL CHECK (tier IN (1,2,3,4)),
  failure_type          text        NOT NULL,
  detail                text,
  run_count             integer     NOT NULL DEFAULT 1,
  re_prompted_at        timestamptz,
  re_prompt_succeeded   boolean,
  escalated_to_krish_at timestamptz,
  resolved_at           timestamptz,
  resolution_note       text
);

CREATE INDEX IF NOT EXISTS idx_silent_failures_unresolved
  ON public.silent_failures(detected_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_silent_failures_workflow
  ON public.silent_failures(workflow_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_silent_failures_tier_unresolved
  ON public.silent_failures(tier, detected_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.silent_failures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='silent_failures' AND policyname='sf_anon_read'
  ) THEN
    CREATE POLICY sf_anon_read ON public.silent_failures FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='silent_failures' AND policyname='sf_service_all'
  ) THEN
    CREATE POLICY sf_service_all ON public.silent_failures FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- schema_migrations row inserted via Supabase management API apply_migration endpoint.

COMMIT;
