-- Pillar 4 — Marcus as COO. Three new JSONB columns on home_intelligence
-- for the three new Marcus surfaces: daily brief, weekly retro, monday
-- pre-mortem. JSON shape is defined in marcus-cofounder-prompt-patch.md.

ALTER TABLE home_intelligence
  ADD COLUMN IF NOT EXISTS daily_brief        jsonb,
  ADD COLUMN IF NOT EXISTS daily_brief_at     timestamptz,
  ADD COLUMN IF NOT EXISTS weekly_retro       jsonb,
  ADD COLUMN IF NOT EXISTS weekly_retro_at    timestamptz,
  ADD COLUMN IF NOT EXISTS weekly_retro_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS monday_premortem   jsonb,
  ADD COLUMN IF NOT EXISTS monday_premortem_at timestamptz;

CREATE INDEX IF NOT EXISTS home_intel_daily_brief_idx
  ON home_intelligence (daily_brief_at DESC NULLS LAST);
