-- The retrieval text got three and a half times longer, and search timed out.
--
-- Enrichment put the whole LinkedIn "about" blob into intel_doc: summary
-- averages 893 characters and runs to 2,000, so enriched docs averaged 1,488
-- against 423 for unenriched. ts_rank_cd is cover-density ranking — it walks
-- lexeme positions — so the lexical recall path alone measured 3.49s over the
-- 3,540 rows a normal question matches, and the whole search came to 7.8s
-- against an 8s statement timeout. The Network tab returned
-- "canceling statement due to statement timeout" on a real query.
--
-- The fix is not a bigger timeout. A profile summary is self-description: the
-- substance is in the opening sentences and the rest is tone. The full text
-- stays in the summary column, where the sheet and the judgment model can read
-- it; only what is worth MATCHING goes into the index.
--
-- Same reasoning for headline, which is short in practice but unbounded in
-- principle — an unbounded field in an index is a timeout waiting for the right
-- record.
--
-- Existing rows keep the doc the previous composition built, so apply this with
-- scripts/network/rebuild-docs.ts --commit, then reembed-stale.
CREATE OR REPLACE FUNCTION public.ci_rebuild_doc_and_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
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
      -- Bounded. What is worth matching, not everything that was stored.
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

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
