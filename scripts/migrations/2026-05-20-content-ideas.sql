-- Create the `content_ideas` table — the unified inbox for content seeds.
--
-- Today, ideas come from five+ scattered places: Layer 1 Signal Inbox (Drive),
-- Cleo bot chats, Agatha bot chats, OpenClaw workspace `# IDEA:` markers,
-- Zara market signals, and manual quick-capture in the Control Center.
-- They all funnel through one N8N webhook (/webhook/idea-capture) which
-- writes to this table with a strict source_type.

CREATE TABLE IF NOT EXISTS content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- the seed
  idea         text NOT NULL,
  thesis       text,
  distribution jsonb,                                  -- e.g. ["linkedin","newsletter","signal-noise-pod"]

  -- provenance (the elegant-magic glue)
  source_type text NOT NULL CHECK (source_type IN (
    'signal_inbox',
    'cleo_chat',
    'agatha_chat',
    'openclaw_workspace',
    'zara_signal',
    'manual'
  )),
  source_ref          text,
  source_url          text,
  source_snippet      text,
  source_captured_at  timestamptz,

  -- state
  state text NOT NULL DEFAULT 'seeded' CHECK (state IN (
    'seeded','researching','drafting','review','approved','published','dropped'
  )),
  draft_link     text,
  assigned_to    text DEFAULT 'cleo',
  scheduled_for  date,
  published_at   timestamptz,
  published_url  text,

  -- enrichment
  confidence       numeric,
  related_idea_ids uuid[],

  -- audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_ideas_state_idx   ON content_ideas (state, created_at DESC);
CREATE INDEX IF NOT EXISTS content_ideas_source_idx  ON content_ideas (source_type, source_ref);

CREATE OR REPLACE FUNCTION touch_content_ideas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_ideas_touch_updated_at ON content_ideas;
CREATE TRIGGER content_ideas_touch_updated_at
  BEFORE UPDATE ON content_ideas
  FOR EACH ROW EXECUTE FUNCTION touch_content_ideas_updated_at();

ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_ideas_anon_read ON content_ideas;
CREATE POLICY content_ideas_anon_read ON content_ideas
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS content_ideas_service_all ON content_ideas;
CREATE POLICY content_ideas_service_all ON content_ideas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
