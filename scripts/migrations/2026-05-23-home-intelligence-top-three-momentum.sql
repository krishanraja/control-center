-- Phase 0 — Mission Control rebuild data contracts.
--
-- Marcus's daily brief gains two new outputs:
--   top_three: 3 ranked decisions (revenue, growth, risk). Drives the
--              Mission Control hero on Home. Each card has its own action
--              kind + target id so the UI never has to guess where a click
--              goes — it just hands (kind,id) to routeDecision().
--   momentum:  7-day rolling pulse. Drives MomentumStrip on Home.
--
-- Shape (top_three, jsonb array, length 3):
--   [
--     { kind: 'revenue'|'growth'|'risk',
--       title: text (≤ 80ch),
--       why_now: text (≤ 140ch),
--       action_label: text (e.g. "Open lead"),
--       action_kind: 'task'|'lead'|'guest'|'idea'|'visibility',
--       action_target_id: uuid|text,
--       expires_at: iso8601 }
--   ]
--
-- Shape (momentum, jsonb object):
--   { mrr:        number[],   -- last 7 days, oldest → newest
--     leads:      number[],   -- count of leads added per day
--     shipped:    number[],   -- count of shipped tasks per day
--     visibility: number[],   -- count of visibility actions per day
--     days:       iso8601[] } -- alignment dates

ALTER TABLE home_intelligence
  ADD COLUMN IF NOT EXISTS top_three     jsonb,
  ADD COLUMN IF NOT EXISTS top_three_at  timestamptz,
  ADD COLUMN IF NOT EXISTS momentum      jsonb,
  ADD COLUMN IF NOT EXISTS momentum_at   timestamptz;

CREATE INDEX IF NOT EXISTS home_intel_top_three_idx
  ON home_intelligence (top_three_at DESC NULLS LAST);
