-- Create the `leads` table. Leads are first-class entities, not tasks.
-- The Control Center is gaining a Leads tab with source-grouped lanes; the
-- previous "leads" was an inferred classification of certain tasks
-- (see src/lib/pipelines.ts). That stays for now, but new domain data lives here.
--
-- Provenance is the headline property: every lead carries source_type +
-- source_ref + source_url so the UI can render "from <source>" on every card
-- and the deep-link back to origin always works.

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- person
  full_name      text,
  email          text,
  linkedin_url   text,
  twitter_handle text,
  company        text,
  title          text,

  -- provenance (the unifying glue across all ingestion routes)
  source_type    text NOT NULL CHECK (source_type IN (
    'podcast_audience',
    'drive_import',
    'manual',
    'apollo',
    'nell_candidate',
    'signal_inbox'
  )),
  source_ref            text,
  source_url            text,
  source_document_id    text,
  source_document_name  text,

  -- enrichment
  fit_score           int,
  attainability_score int,
  icp_score           int,
  tier                text,
  why_relevant        text,
  primary_tension     text,

  -- workflow
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','enriching','ready','contacted','conversation',
    'closed_won','closed_lost','superseded'
  )),
  next_step      text,
  owner          text DEFAULT 'krish',
  assignee_agent text,

  -- audit
  raw_extraction jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  superseded_by  uuid REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS leads_status_fit_idx   ON leads (status, fit_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS leads_source_idx       ON leads (source_type, source_ref);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_dedupe
  ON leads (lower(email)) WHERE email IS NOT NULL;

-- Touch updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION touch_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_touch_updated_at ON leads;
CREATE TRIGGER leads_touch_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION touch_leads_updated_at();

-- RLS: anon role can read (dashboard), service_role writes (N8N / server APIs).
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_anon_read ON leads;
CREATE POLICY leads_anon_read ON leads
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS leads_service_all ON leads;
CREATE POLICY leads_service_all ON leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
