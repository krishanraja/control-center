-- Podchaser-sourced podcast targets surfaced in the Visibility lane.
-- The Nova Closed-Loop PR Engine (workflow id hCbvRXoGWaqG1Znx) already
-- searches Podchaser GraphQL but writes nothing back to a UI-readable
-- table — the results only feed the outbound-email pipeline. This table
-- gives the Control Center a place to render "shows Nova found, ranked
-- by fit", with deep links to listen + pitch.
--
-- Apply order:
--   1. This migration (creates table + RLS).
--   2. scripts/n8n/podchaser-oauth-patch.md   (fixes the expired API token).
--   3. scripts/n8n/podchaser-surface-patch.md (adds upsert nodes here).

CREATE TABLE IF NOT EXISTS podchaser_podcasts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  podchaser_id             text NOT NULL UNIQUE,
  title                    text NOT NULL,
  author                   text,                  -- host name(s)
  web_url                  text,
  description              text,
  number_of_episodes       int,
  latest_episode_date      timestamptz,
  latest_episode_title     text,
  latest_episode_summary   text,
  fit_score                int,                   -- Haiku-rated 0-10 vs. Mindmaker ICP
  why_relevant             text,
  recommended_next_step    text,
  host_email               text,
  host_linkedin            text,
  pitch_status             text DEFAULT 'discovered',
  last_scraped_at          timestamptz DEFAULT now(),
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

ALTER TABLE podchaser_podcasts DROP CONSTRAINT IF EXISTS podchaser_pitch_status_check;
ALTER TABLE podchaser_podcasts
  ADD CONSTRAINT podchaser_pitch_status_check
  CHECK (pitch_status IN ('discovered','queued','pitched','responded','booked','dropped'));

CREATE INDEX IF NOT EXISTS podchaser_status_fit_idx
  ON podchaser_podcasts (pitch_status, fit_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS podchaser_latest_episode_idx
  ON podchaser_podcasts (latest_episode_date DESC NULLS LAST);

-- Touch updated_at on every update.
CREATE OR REPLACE FUNCTION touch_podchaser_podcasts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS podchaser_podcasts_touch_updated_at ON podchaser_podcasts;
CREATE TRIGGER podchaser_podcasts_touch_updated_at
  BEFORE UPDATE ON podchaser_podcasts
  FOR EACH ROW EXECUTE FUNCTION touch_podchaser_podcasts_updated_at();

-- RLS: anon role reads (dashboard), service_role writes (N8N).
ALTER TABLE podchaser_podcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS podchaser_podcasts_anon_read ON podchaser_podcasts;
CREATE POLICY podchaser_podcasts_anon_read ON podchaser_podcasts
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS podchaser_podcasts_service_all ON podchaser_podcasts;
CREATE POLICY podchaser_podcasts_service_all ON podchaser_podcasts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
