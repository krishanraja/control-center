-- Pillar 4 — Marcus as COO. Four new JSONB columns on home_intelligence:
--   daily_brief, weekly_retro, monday_premortem (the three Marcus surfaces)
--   customer_voice (themes mined from customer_contacts — written by the
--     Marcus synthesis workflow per marcus-customer-voice-patch.md)
-- JSON shape for the three Marcus-COO surfaces is defined in
-- marcus-cofounder-prompt-patch.md.

ALTER TABLE home_intelligence
  ADD COLUMN IF NOT EXISTS daily_brief        jsonb,
  ADD COLUMN IF NOT EXISTS daily_brief_at     timestamptz,
  ADD COLUMN IF NOT EXISTS weekly_retro       jsonb,
  ADD COLUMN IF NOT EXISTS weekly_retro_at    timestamptz,
  ADD COLUMN IF NOT EXISTS weekly_retro_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS monday_premortem   jsonb,
  ADD COLUMN IF NOT EXISTS monday_premortem_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_voice     jsonb;

CREATE INDEX IF NOT EXISTS home_intel_daily_brief_idx
  ON home_intelligence (daily_brief_at DESC NULLS LAST);
