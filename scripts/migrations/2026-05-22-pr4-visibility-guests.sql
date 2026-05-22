-- PR 4.1: visibility_targets + guests
--
-- Replaces the legacy nova_target_conferences and nell_candidates tables with
-- two canonical pipelines. Both legacy tables are kept and marked deprecated
-- so existing workflows keep functioning during the 30-day safety window;
-- PR 8 drops them.
--
-- visibility_targets is the unified pipeline for everything Nova surfaces
-- (CFPs, conferences, podcasts, newsletters, guest appearances). Carries the
-- fields the Visibility lane needs on every card: event_url, cfp_url,
-- deadline_at, audience, why_relevant, suggested_talk_title.
--
-- guests is the pipeline for podcast guests on Signal & Noise and Builder
-- Economy. Status progresses scouted -> enriched -> pitched -> responded ->
-- scheduled -> confirmed -> recorded -> published. Hitting 'confirmed' fires
-- the Nell Guest Confirmed Cascade (prep task, recording task, 3 promo
-- drafts, Gmail draft, contacted_persons upsert, 72h follow-up).
--
-- Applied via Supabase MCP apply_migration on 2026-05-22. This file is the
-- canonical record for the repo.

CREATE TABLE IF NOT EXISTS public.visibility_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'conference'
    CHECK (type IN ('cfp','conference','podcast','newsletter','guest_appearance','other')),
  event_url text,
  cfp_url text,
  deadline_at timestamptz,
  event_start_at timestamptz,
  audience text,
  audience_size integer,
  why_relevant text,
  suggested_talk_title text,
  relevance_score integer,
  quality_score text CHECK (quality_score IN ('red','amber','green')),
  recommended_next_step text,
  status text NOT NULL DEFAULT 'sourced'
    CHECK (status IN ('sourced','queued','applied','accepted','rejected','done','dropped')),
  format text,
  location text,
  ticket_price_usd integer,
  source text NOT NULL DEFAULT 'nova_sweep',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  migrated_from_nova_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visibility_targets_status_idx   ON public.visibility_targets (status);
CREATE INDEX IF NOT EXISTS visibility_targets_deadline_idx ON public.visibility_targets (deadline_at);
CREATE INDEX IF NOT EXISTS visibility_targets_quality_idx  ON public.visibility_targets (quality_score);
CREATE INDEX IF NOT EXISTS visibility_targets_type_idx     ON public.visibility_targets (type);

CREATE TABLE IF NOT EXISTS public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  linkedin_url text,
  twitter_handle text,
  personal_url text,
  podcast_target text NOT NULL DEFAULT 'either'
    CHECK (podcast_target IN ('signal_noise','builder_economy','either')),
  one_liner text,
  why_fit text,
  best_channel text,
  pitch_draft text,
  fit_score integer,
  attainability_score integer,
  quality_score text CHECK (quality_score IN ('red','amber','green')),
  status text NOT NULL DEFAULT 'scouted'
    CHECK (status IN ('scouted','enriched','pitched','responded','scheduled','confirmed','recorded','published','dropped')),
  scheduled_at timestamptz,
  recorded_at timestamptz,
  published_at timestamptz,
  notes text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','sheet_import','nell_outbound','referral','migration')),
  migrated_from_nell_candidates_id uuid,
  cascade_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guests_status_idx  ON public.guests (status);
CREATE INDEX IF NOT EXISTS guests_target_idx  ON public.guests (podcast_target);
CREATE INDEX IF NOT EXISTS guests_quality_idx ON public.guests (quality_score);

INSERT INTO public.visibility_targets (
  title, type, event_url, cfp_url, deadline_at, event_start_at,
  audience, audience_size, why_relevant, relevance_score, quality_score,
  recommended_next_step, format, location, ticket_price_usd,
  status, source, migrated_from_nova_id, raw_data, created_at
)
SELECT
  n.name, 'conference', n.url, n.cfp_url, n.deadline_at, n.event_start_at,
  n.audience_description, n.audience_size, n.why_relevant, n.relevance_score, n.quality_score,
  n.recommended_next_step, n.format, n.location, n.ticket_price_usd,
  CASE WHEN n.active THEN 'sourced' ELSE 'dropped' END,
  'nova_legacy_backfill', n.id, to_jsonb(n.*) - 'id', n.created_at
FROM public.nova_target_conferences n
WHERE NOT EXISTS (SELECT 1 FROM public.visibility_targets v WHERE v.migrated_from_nova_id = n.id);

INSERT INTO public.guests (
  name, email, linkedin_url, twitter_handle, personal_url,
  podcast_target, one_liner, why_fit, best_channel, pitch_draft,
  fit_score, attainability_score, status, notes, raw_data,
  source, migrated_from_nell_candidates_id, created_at
)
SELECT
  nc.name, nc.email, nc.linkedin_url, nc.twitter_handle, nc.personal_url,
  CASE
    WHEN lower(coalesce(nc.podcast_target,'')) IN ('signal_noise','signal-noise','signal noise','signal-and-noise','signal and noise') THEN 'signal_noise'
    WHEN lower(coalesce(nc.podcast_target,'')) IN ('builder_economy','builder-economy','builder economy') THEN 'builder_economy'
    ELSE 'either'
  END,
  nc.signal_description, nc.signal_description, nc.best_channel, nc.pitch_draft,
  nc.fit_score, nc.attainability_score,
  CASE
    WHEN lower(coalesce(nc.status,'')) IN ('scouted','sourced','new') THEN 'scouted'
    WHEN lower(coalesce(nc.status,'')) IN ('enriched','enrich') THEN 'enriched'
    WHEN lower(coalesce(nc.status,'')) IN ('pitched','outreach_sent') THEN 'pitched'
    WHEN lower(coalesce(nc.status,'')) IN ('responded','replied') THEN 'responded'
    WHEN lower(coalesce(nc.status,'')) IN ('scheduled','booked') THEN 'scheduled'
    WHEN lower(coalesce(nc.status,'')) IN ('confirmed','confirmed_recording') THEN 'confirmed'
    WHEN lower(coalesce(nc.status,'')) IN ('recorded') THEN 'recorded'
    WHEN lower(coalesce(nc.status,'')) IN ('published','live') THEN 'published'
    WHEN lower(coalesce(nc.status,'')) IN ('skipped','dropped','rejected') THEN 'dropped'
    ELSE 'scouted'
  END,
  nc.notes, to_jsonb(nc.*) - 'id', 'migration', nc.id, nc.surfaced_at
FROM public.nell_candidates nc
WHERE NOT EXISTS (SELECT 1 FROM public.guests g WHERE g.migrated_from_nell_candidates_id = nc.id);

COMMENT ON TABLE public.nova_target_conferences IS
  'DEPRECATED 2026-05-22 by PR 4. Migrated to public.visibility_targets. Will be dropped in PR 8 after 30-day safety window.';
COMMENT ON TABLE public.nell_candidates IS
  'DEPRECATED 2026-05-22 by PR 4. Migrated to public.guests. Will be dropped in PR 8 after 30-day safety window.';

CREATE OR REPLACE FUNCTION public.visibility_targets_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS visibility_targets_touch_updated_at ON public.visibility_targets;
CREATE TRIGGER visibility_targets_touch_updated_at BEFORE UPDATE ON public.visibility_targets
FOR EACH ROW EXECUTE FUNCTION public.visibility_targets_touch_updated_at();

CREATE OR REPLACE FUNCTION public.guests_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS guests_touch_updated_at ON public.guests;
CREATE TRIGGER guests_touch_updated_at BEFORE UPDATE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.guests_touch_updated_at();

INSERT INTO public.schema_migrations (version, description, executed_by, executed_at, forward_sql)
SELECT
  '2026-05-22-pr4-visibility-guests',
  'PR 4.1: create visibility_targets + guests, backfill from nova_target_conferences and nell_candidates, deprecate legacy tables, add updated_at triggers',
  'cli-rebuild-brief',
  now(),
  'See scripts/migrations/2026-05-22-pr4-visibility-guests.sql in krishanraja/control-center pr-4-visibility-guests branch'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='2026-05-22-pr4-visibility-guests');

INSERT INTO public.system_improvements (improvement_type, target, executed_by, executed_at, notes, pr_branch)
VALUES (
  'schema_migration',
  'visibility_targets, guests, nova_target_conferences, nell_candidates',
  'cli-rebuild-brief',
  now(),
  'PR 4.1: created visibility_targets + guests, backfilled 12 nova rows + 36 nell rows, marked legacy tables deprecated for PR 8 drop',
  'pr-4-visibility-guests'
);
