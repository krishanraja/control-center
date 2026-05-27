-- Phase 0 of focus + tasks inbox brief: capture Marcus top_three overrides.
--
-- Marcus nominates 3 cards a day on home_intelligence.top_three. When Krish
-- swaps a card via the new Home swap affordance, we write a feedback_queue
-- row with reason_code='marcus_priority_override' and a structured `meta`
-- jsonb describing the original pick and the replacement. Vera's weekly
-- Feedback Aggregation already consumes feedback_queue rows; this migration
-- only adds the storage shape the new override path needs.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.feedback_queue
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.feedback_queue.meta IS
  'Structured context attached to a feedback row. For marcus_priority_override the shape is { original_pick_title, original_pick_meta, replaced_with_text, captured_at }. Free-form for other reason_codes.';

CREATE INDEX IF NOT EXISTS feedback_queue_reason_code_captured_idx
  ON public.feedback_queue (reason_code, created_at DESC);
