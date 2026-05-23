-- Phase 0 — Mission Control rebuild data contracts.
--
-- Cleo gains a transform webhook that takes (idea_id, target_format) and
-- writes the derivative draft into content_ideas.transformed_outputs[format].
--
-- Shape (transformed_outputs, jsonb object):
--   {
--     linkedin:        { body: text, generated_at: iso8601, model: text },
--     substack:        { title: text, body: text, generated_at: iso8601, model: text },
--     twitter:         { thread: text[], generated_at: iso8601, model: text },
--     cohort_prompt:   { prompt: text, generated_at: iso8601, model: text },
--     mindmaker_block: { block: text, generated_at: iso8601, model: text }
--   }
--
-- Each format is independently writable so a partial transform (just LinkedIn)
-- doesn't clobber a previous Substack draft. The Content tab editor reads this
-- JSON, renders one tab per populated format, and lets Krish copy/edit/save.

ALTER TABLE content_ideas
  ADD COLUMN IF NOT EXISTS transformed_outputs jsonb DEFAULT '{}'::jsonb;
