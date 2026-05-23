-- Visibility targets: deep enrichment columns.
--
-- Goal: every CFP / event / podcast appearance Krish sees in the Today inbox
-- carries enough context that he can decide in 30 seconds whether to invest
-- time in proposing. Drives the new VisibilityTargetDetail surface and the
-- Nova Visibility Deep Enrich workflow.

ALTER TABLE public.visibility_targets
  ADD COLUMN IF NOT EXISTS organizer            text,
  ADD COLUMN IF NOT EXISTS organizer_reputation text,
  ADD COLUMN IF NOT EXISTS audience_sector      text,
  ADD COLUMN IF NOT EXISTS audience_seniority   text,
  ADD COLUMN IF NOT EXISTS past_speakers        jsonb,
  ADD COLUMN IF NOT EXISTS cfp_requirements     jsonb,
  ADD COLUMN IF NOT EXISTS proposed_talk        jsonb,
  ADD COLUMN IF NOT EXISTS strategic_value      text,
  ADD COLUMN IF NOT EXISTS angle                text,
  ADD COLUMN IF NOT EXISTS effort_estimate      jsonb,
  ADD COLUMN IF NOT EXISTS risk_notes           text,
  ADD COLUMN IF NOT EXISTS next_actions         text[],
  ADD COLUMN IF NOT EXISTS deep_enriched_at     timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_version   integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_visibility_targets_deep_enriched
  ON public.visibility_targets (deep_enriched_at NULLS FIRST, deadline_at);

COMMENT ON COLUMN public.visibility_targets.strategic_value IS
  'One paragraph: which venture (Mindmaker, AdFixus, Meliora, Signal Noise) this opportunity serves and why.';
COMMENT ON COLUMN public.visibility_targets.angle IS
  'One paragraph: Krishs unique POV that the average speaker cannot bring.';
COMMENT ON COLUMN public.visibility_targets.next_actions IS
  'Ordered list of next actions, including draft talk, prep slides, submit CFP, book travel.';
