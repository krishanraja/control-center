-- Stop ranking Krish's competitors above his buyers.
--
-- A live search for "CEOs of mid-market firms getting serious about AI"
-- returned, at the top, a founder whose own stored risk line reads "Runs a
-- competing AI transformation practice; commercial overlap could limit how
-- openly he shares." Krish sells AI advisory. Rival AI advisory firms are the
-- last people the lane should surface as buyers.
--
-- ── Why it happened ────────────────────────────────────────────────────────
-- network_search cannot demote anyone. Every branch of its constraint ladder
-- returns 1 or 0 (geo alone has a 0.5), clampWeight forces weights into
-- [0.1, 1] so a negative cannot be expressed, and the score is sum(w*hit)/
-- sum(w), where a negative would corrupt the denominator rather than demote.
-- The only downward force in the whole function is venture_multiplier, floored
-- at 0.65.
--
-- Meanwhile `risk` - the one field that names the problem in plain words - is
-- NOT part of intel_doc (see this file's predecessor, 20260915250000), so it
-- is invisible to both the semantic and the lexical tier, and it is not in
-- CONSTRAINT_FIELDS, so it cannot be filtered either. It is rendered on the
-- row, which means Krish can read why the person was wrong only after they
-- have been ranked first.
--
-- api/_icpScore.ts has known this rule since the leads lane was built
-- (isAIVendor, capping the buyer lanes at 25). It is referenced twice, both
-- inside that one file. The Network lane has never known the rule exists.
--
-- ── Krish's ruling, 2026-09-16 ─────────────────────────────────────────────
-- Demote hard, keep visible. Competitors are still intro paths and podcast
-- guests, which is exactly why the pilots classifier already sorts them to
-- "can introduce" rather than dropping them. Detect by rule now, and by model
-- as people are re-enriched, with the model winning where it has spoken.

-- ── 1. The typed verdict ───────────────────────────────────────────────────
ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS sells_competing_services boolean,
  ADD COLUMN IF NOT EXISTS competitor_source text;

ALTER TABLE public.contact_intelligence
  DROP CONSTRAINT IF EXISTS contact_intelligence_competitor_source_check;
ALTER TABLE public.contact_intelligence
  ADD CONSTRAINT contact_intelligence_competitor_source_check
  CHECK (competitor_source IS NULL OR competitor_source IN ('rule', 'model'));

COMMENT ON COLUMN public.contact_intelligence.sells_competing_services IS
  'True when this person sells the advisory/consulting work Krish sells. NULL means nobody has judged, which is not the same as false. Demotes in network_search; never excludes.';
COMMENT ON COLUMN public.contact_intelligence.competitor_source IS
  'rule = the deterministic company/industry test; model = the enrichment judgment. The model wins where it has spoken, so a re-enrich can correct the rule but a rule pass can never overwrite the model.';

-- ── 2. The rule ────────────────────────────────────────────────────────────
-- Mirrors isAIVendor in api/_icpScore.ts: a standalone "AI" token in the
-- company name, or an industry that is software / IT / artificial
-- intelligence. Deliberately narrowed to SERVICES words as well, because the
-- leads version is a buyer-lane cap where a false positive costs a score, and
-- here a false positive demotes a real person in a list Krish reads.
CREATE OR REPLACE FUNCTION public.looks_like_a_competitor(
  p_company text,
  p_industry text,
  p_title text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    -- (A) A services FIRM whose services are about AI.
    (
      (coalesce(p_company,'') ~* '(consult|advisor|advisory|agency|partners)'
        OR coalesce(p_industry,'') ~* 'management consult')
      AND
      (coalesce(p_company,'') ~* '(^|[^a-z])ai([^a-z]|$)'
        OR coalesce(p_company,'') ~* 'artificial intelligence'
        OR coalesce(p_industry,'') ~* 'artificial intelligence'
        OR coalesce(p_title,'') ~* '(^|[^a-z])ai([^a-z]|$)')
    )
    OR
    -- (B) An independent who says both things in their own title. Catches the
    -- solo operator at "Independent" or a neutrally named company, who (A)
    -- cannot see.
    (
      coalesce(p_title,'') ~* '(^|[^a-z])ai([^a-z]|$)'
      AND coalesce(p_title,'') ~* '(consultant|consulting|advisor|advisory|agency)'
    );
$$;

COMMENT ON FUNCTION public.looks_like_a_competitor IS
  'Deterministic competitor test, tuned against the live corpus 2026-09-16: 30 of 11,755, none in tiers 1-2. Both halves of (A) are required and "transformation" is deliberately absent from the services vocabulary, because a first cut that included it flagged "Microsoft, AI Transformation Lead" - an internal buyer - and putting "management consult" in the AI half flagged every change-management consultant. Errs toward missing a competitor rather than demoting a buyer; the model verdict closes the gap on re-enrich.';

GRANT EXECUTE ON FUNCTION public.looks_like_a_competitor TO service_role;

-- ── 3. Keep it current, the way intel_doc is kept current ──────────────────
-- Recomputed by the same BEFORE INSERT OR UPDATE trigger that rebuilds
-- intel_doc, so the verdict cannot go stale behind a convention someone has
-- to remember. The model's verdict is never overwritten.
CREATE OR REPLACE FUNCTION public.ci_rebuild_doc_and_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  c_name text; c_title text; c_company text; c_location text;
  c_has_li boolean; c_has_email boolean;
  new_doc text;
  intent_line text;
BEGIN
  SELECT c.full_name, c.title, c.company, c.location,
         c.linkedin_url IS NOT NULL, c.email_normalized IS NOT NULL
    INTO c_name, c_title, c_company, c_location, c_has_li, c_has_email
  FROM public.contacts c WHERE c.id = NEW.contact_id;

  intent_line := CASE
    WHEN coalesce(NEW.intent_score, 0) > 0 THEN
      btrim(concat_ws(' ',
        CASE NEW.intent_stance
          WHEN 'asking'     THEN 'Asking publicly for help with'
          WHEN 'struggling' THEN 'Hitting problems with'
          WHEN 'hiring'     THEN 'Hiring and building a team for'
          WHEN 'evaluating' THEN 'Evaluating and piloting'
          WHEN 'building'   THEN 'Building and shipping'
          WHEN 'teaching'   THEN 'Teaching practice in'
          WHEN 'selling'    THEN 'Selling'
          ELSE 'Posting about'
        END,
        coalesce(array_to_string(NEW.intent_topics, ', '), 'AI')))
    ELSE NULL END;

  new_doc := btrim(regexp_replace(concat_ws(' · ',
      NULLIF(NEW.who, ''), NULLIF(NEW.why_them, ''), NULLIF(NEW.hook, ''),
      NULLIF(c_name, ''),
      NULLIF(coalesce(NEW.current_title, c_title), ''),
      NULLIF(coalesce(NEW.current_company, c_company), ''),
      NULLIF(NEW.industry, ''), NULLIF(coalesce(c_location, NEW.country), ''),
      NULLIF(left(NEW.headline, 200), ''),
      NULLIF(left(NEW.summary, 300), ''),
      intent_line
    ), '\s+', ' ', 'g'));

  IF new_doc IS DISTINCT FROM NEW.intel_doc THEN
    NEW.intel_doc := new_doc;
    NEW.embed_stale := true;
  END IF;

  NEW.completeness := public.contact_completeness(
    NEW.name_quality, coalesce(c_has_li, false), coalesce(c_has_email, false),
    NEW.headline, NEW.summary, NEW.followers, NEW.why_them, NEW.enriched_at);

  -- The competitor verdict. The model outranks the rule: once enrichment has
  -- judged this person, a later rule pass must not silently flip it back.
  -- true or NULL, never false: NULL means nobody has judged this person, which
  -- is a different claim from "judged, and not a competitor". The ranker reads
  -- it as no demotion either way, and the UI only ever shows the positive.
  IF NEW.competitor_source IS DISTINCT FROM 'model' THEN
    IF public.looks_like_a_competitor(
         coalesce(NEW.current_company, c_company), NEW.industry,
         coalesce(NEW.current_title, c_title)) THEN
      NEW.sells_competing_services := true;
      NEW.competitor_source := 'rule';
    ELSE
      NEW.sells_competing_services := NULL;
      NEW.competitor_source := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- The trigger has to fire on the columns the verdict reads, too.
DROP TRIGGER IF EXISTS ci_rebuild_doc_trg ON public.contact_intelligence;
CREATE TRIGGER ci_rebuild_doc_trg
  BEFORE INSERT OR UPDATE OF
    who, why_them, hook, industry, country, name_quality, followers, headline,
    summary, current_title, current_company, enriched_at, intent_score,
    intent_topics, intent_stance, sells_competing_services, competitor_source
  ON public.contact_intelligence
  FOR EACH ROW EXECUTE FUNCTION ci_rebuild_doc_and_score();

-- ── 4. Backfill, without touching intel_doc or embeddings ──────────────────
-- Only the rows the rule actually flags are written - about 30 of 11,755.
--
-- The first cut updated every row and timed out. It was also wrong: writing
-- false to 11,725 people asserts "judged, and not a competitor" about a corpus
-- nobody has judged. NULL is the honest value and the ranker reads it the same
-- way.
--
-- Still runs with the trigger disabled. The trigger now fires on
-- sells_competing_services, so touching rows through it would recompute
-- intel_doc and mark anything that differs embed_stale - queueing re-embeds on
-- the database the app reads from, which is the exact load that turned a slow
-- search into a failing one on 2026-09-15 (PR #345).
ALTER TABLE public.contact_intelligence DISABLE TRIGGER ci_rebuild_doc_trg;

UPDATE public.contact_intelligence ci
   SET sells_competing_services = true,
       competitor_source = 'rule'
  FROM public.contacts c
 WHERE c.id = ci.contact_id
   AND ci.competitor_source IS DISTINCT FROM 'model'
   AND public.looks_like_a_competitor(
         coalesce(ci.current_company, c.company), ci.industry,
         coalesce(ci.current_title, c.title));

ALTER TABLE public.contact_intelligence ENABLE TRIGGER ci_rebuild_doc_trg;

CREATE INDEX IF NOT EXISTS ci_competitor_idx
  ON public.contact_intelligence (sells_competing_services)
  WHERE sells_competing_services;
