-- Follow-up to PR #41's Marcus prompt patch.
--
-- The patch added `customer_signals[]` to Marcus's brief_content, but the
-- live home_intelligence schema has no `customer_signals` column — only
-- `external_signals` jsonb. The brief said "JSONB is schemaless, no DB
-- migration needed", but customer_signals is a top-level column, not a
-- key inside an existing jsonb. This adds the column so the value Marcus
-- emits actually persists.

ALTER TABLE home_intelligence
  ADD COLUMN IF NOT EXISTS customer_signals jsonb DEFAULT '[]'::jsonb;
