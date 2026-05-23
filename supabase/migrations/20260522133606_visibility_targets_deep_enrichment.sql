-- Deep enrichment columns for visibility_targets.
-- Nova's "Visibility Deep Enrich" workflow populates these fields per row;
-- the sweeper triggers enrichment for any row where deep_enriched_at IS NULL.

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
