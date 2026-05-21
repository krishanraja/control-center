-- Leads upgrade: follow-up scheduling + opportunity promotion + deep-enrich audit.
-- Pre-existing leads table from 2026-05-20-leads.sql; this adds the columns
-- that unlock "Promote / Reassign / Schedule follow-up / Deep enrich" actions
-- on the LeadCard. Idempotent.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS follow_up_at        timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_task_id    uuid REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deep_enriched_at    timestamptz;

CREATE INDEX IF NOT EXISTS leads_follow_up_idx
  ON leads (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_assignee_idx
  ON leads (assignee_agent, status);
