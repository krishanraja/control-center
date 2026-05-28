-- Marcus synthesis upgrade — alternates + per-card leverage reasoning.
--
-- Marcus's daily brief gains two new outputs alongside top_three:
--   top_three_alternates: 4 alternate cards (same shape as top_three),
--     also synthesized by Marcus rather than slot-ranked from queues.
--     The "+4 more" picker in FocusCalibrator reads these directly so
--     /api/daily-focus/suggestions no longer pads with a raw
--     decisions_waiting slice.
--   top_three_reasoning: a short paragraph (≤ 400ch) describing the
--     synthesis lens Marcus applied today — the cross-source frame
--     that produced the picks. Surfaced as a tooltip / header copy.
--
-- Card shape evolves: existing fields preserved, new ones added.
-- Parsers are defensive so old rows (pre-upgrade) keep validating.
--   leverage_score: number (0-100)  -- Marcus's self-rated leverage
--   reasoning: text (≤ 180ch)        -- why this beats today's alternates
--   beats?: text[]                   -- optional, alternate titles displaced

ALTER TABLE home_intelligence
  ADD COLUMN IF NOT EXISTS top_three_alternates jsonb,
  ADD COLUMN IF NOT EXISTS top_three_reasoning  text;
