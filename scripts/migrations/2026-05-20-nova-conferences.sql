-- Enrich nova_target_conferences so Visibility cards can show audience,
-- deadline, why-relevant, CFP link, format and recommended next step.
-- The Visibility lane today shows just "Submit proposal: AI Summit London"
-- with no link, no audience, no rationale — these columns fix that.
-- Nova's Closed-Loop PR Engine (workflow id hCbvRXoGWaqG1Znx) will be
-- updated to populate the new columns at scrape time.

ALTER TABLE nova_target_conferences
  ADD COLUMN IF NOT EXISTS audience_size         int,
  ADD COLUMN IF NOT EXISTS audience_description  text,
  ADD COLUMN IF NOT EXISTS deadline_at           timestamptz,
  ADD COLUMN IF NOT EXISTS event_start_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cfp_url               text,
  ADD COLUMN IF NOT EXISTS ticket_price_usd      int,
  ADD COLUMN IF NOT EXISTS format                text,
  ADD COLUMN IF NOT EXISTS location              text,
  ADD COLUMN IF NOT EXISTS why_relevant          text,
  ADD COLUMN IF NOT EXISTS relevance_score       int,
  ADD COLUMN IF NOT EXISTS recommended_next_step text;

-- Best-effort CHECK on the new `format` column (drop+add to be idempotent).
ALTER TABLE nova_target_conferences DROP CONSTRAINT IF EXISTS nova_format_check;
ALTER TABLE nova_target_conferences
  ADD CONSTRAINT nova_format_check
  CHECK (format IS NULL OR format IN ('in_person','hybrid','online'));

CREATE INDEX IF NOT EXISTS nova_deadline_idx ON nova_target_conferences (deadline_at)
  WHERE deadline_at IS NOT NULL;
