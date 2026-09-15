-- Intent: what someone is publishing, and whether that is a reason to talk now.
--
-- Krish's ask, in his words: if anyone is posting about AI on LinkedIn, flag it.
-- This is the storage and the surface for that. The reading of post text into a
-- signal is deterministic and lives in api/_intent.ts, so the evidence on the
-- row is a matched phrase rather than a model's opinion.
--
-- ── Why these are columns and not another jsonb blob ────────────────────────
-- Exactly the lesson of ADR-022, applied before the mistake instead of after:
-- a signal that lives in jsonb cannot be ranked on, cannot be counted in the
-- health panel, and cannot be searched. It reaches the surface or it does not
-- exist.

ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS intent_score smallint,
  ADD COLUMN IF NOT EXISTS intent_topics text[],
  ADD COLUMN IF NOT EXISTS intent_summary text,
  ADD COLUMN IF NOT EXISTS last_post_at timestamptz,
  ADD COLUMN IF NOT EXISTS posts_checked_at timestamptz,
  -- Hub markers. The registered profile actor returns no follower count at all,
  -- confirmed against its own field list across 45 enrichments, so reach is
  -- read from the badges LinkedIn does expose. The influencer badge is rare and
  -- the creator flag marks people who actually publish, which is closer to "is
  -- this person a node" than a raw follower number.
  ADD COLUMN IF NOT EXISTS is_influencer boolean,
  ADD COLUMN IF NOT EXISTS is_creator boolean,
  ADD COLUMN IF NOT EXISTS recommendations_received int;

COMMENT ON COLUMN public.contact_intelligence.intent_score IS
  '0-100 recency-weighted AI-posting signal. NULL means posts were never read, which is not the same as 0 (read, nothing there).';
COMMENT ON COLUMN public.contact_intelligence.posts_checked_at IS
  'When posts were last read. Intent decays, so a stale check is reported as stale rather than as absence.';

-- Partial, because the interesting query is always "who is posting about this",
-- never "list everyone with a null intent score".
CREATE INDEX IF NOT EXISTS ci_intent_idx
  ON public.contact_intelligence (intent_score DESC, last_post_at DESC)
  WHERE intent_score > 0;
CREATE INDEX IF NOT EXISTS ci_intent_topics_idx
  ON public.contact_intelligence USING gin (intent_topics)
  WHERE intent_topics IS NOT NULL;

-- Rebuild the retrieval text to include what someone is publishing about, so
-- "who in my network is working on AI agents" is answerable by search and not
-- only by a filter. Same function as 20260915140000 with the intent line added;
-- the trigger already fires on the column list below.
CREATE OR REPLACE FUNCTION public.ci_rebuild_doc_and_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_name text; c_title text; c_company text; c_location text;
  c_has_li boolean; c_has_email boolean;
  new_doc text;
BEGIN
  SELECT c.full_name, c.title, c.company, c.location,
         c.linkedin_url IS NOT NULL, c.email_normalized IS NOT NULL
    INTO c_name, c_title, c_company, c_location, c_has_li, c_has_email
  FROM public.contacts c WHERE c.id = NEW.contact_id;

  new_doc := btrim(regexp_replace(concat_ws(' · ',
      NULLIF(NEW.who, ''), NULLIF(NEW.why_them, ''), NULLIF(NEW.hook, ''),
      NULLIF(c_name, ''),
      NULLIF(coalesce(NEW.current_title, c_title), ''),
      NULLIF(coalesce(NEW.current_company, c_company), ''),
      NULLIF(NEW.industry, ''), NULLIF(coalesce(c_location, NEW.country), ''),
      NULLIF(NEW.headline, ''), NULLIF(NEW.summary, ''),
      -- Only when the signal is live. Indexing "posting about AI" on a record
      -- whose last AI post was two years ago would make the search answer a
      -- question about today with evidence from then.
      CASE WHEN coalesce(NEW.intent_score, 0) > 0 AND NEW.intent_topics IS NOT NULL
           THEN 'Posting about ' || array_to_string(NEW.intent_topics, ', ')
           ELSE NULL END
    ), '\s+', ' ', 'g'));

  IF new_doc IS DISTINCT FROM NEW.intel_doc THEN
    NEW.intel_doc := new_doc;
    NEW.embed_stale := true;
  END IF;

  NEW.completeness := public.contact_completeness(
    NEW.name_quality, coalesce(c_has_li, false), coalesce(c_has_email, false),
    NEW.headline, NEW.summary, NEW.followers, NEW.why_them, NEW.enriched_at);

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ci_rebuild_doc_trg ON public.contact_intelligence;
CREATE TRIGGER ci_rebuild_doc_trg
  BEFORE INSERT OR UPDATE OF
    who, why_them, hook, industry, country, name_quality, followers, headline,
    summary, current_title, current_company, enriched_at,
    intent_score, intent_topics
  ON public.contact_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.ci_rebuild_doc_and_score();
