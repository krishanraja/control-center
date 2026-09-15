-- A score with no stance is a claim from a retired classifier.
--
-- 77 rows were left carrying intent_score 85 with no stance, no evidence and no
-- stored posts: the output of the first intent model, which asked only "is this
-- person posting about AI" and was replaced twice the same day. They were the
-- worst possible state — high enough to lift someone in the ranker, with no
-- stance so the row rendered no chip at all. Influential and invisible.
--
-- They cannot be re-judged, because that version threw the post text away. So
-- the score goes to NULL, which is the honest reading: not "nothing there" but
-- "we no longer know". posts_checked_at is deliberately left in place, so the
-- posts backfill picks them up again once Apify's usage limit is lifted.
UPDATE public.contact_intelligence
   SET intent_score = NULL,
       intent_topics = NULL,
       intent_summary = NULL
 WHERE intent_score IS NOT NULL
   AND intent_stance IS NULL;

-- And the invariant made structural, so no future version of the classifier can
-- leave the same wreckage behind. The writer always sets both together: a
-- stance is what a score means.
ALTER TABLE public.contact_intelligence
  DROP CONSTRAINT IF EXISTS ci_intent_score_needs_stance;
ALTER TABLE public.contact_intelligence
  ADD CONSTRAINT ci_intent_score_needs_stance
  CHECK (intent_score IS NULL OR intent_score = 0 OR intent_stance IS NOT NULL)
  NOT VALID;
ALTER TABLE public.contact_intelligence
  VALIDATE CONSTRAINT ci_intent_score_needs_stance;
