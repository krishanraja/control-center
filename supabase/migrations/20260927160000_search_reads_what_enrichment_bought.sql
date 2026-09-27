-- Search reads what the enrichment bought, and stops burying the people it was
-- bought for.
--
-- Krish, 2026-09-27: "the way my network scores against searches is terrible,
-- and with terrible reasoning. We did a huge expensive enrichment job, why are
-- the results still so poor?"
--
-- Measured on production the same day, before this migration. Every number
-- below is a count from the live tables, not an estimate.
--
-- ── 1. Enrichment demoted every person it touched ─────────────────────────
-- tier_weight is read by the ranker on a 0-100 scale (0.40 * tier_weight/100
-- is the largest single relationship term) and by the relationship floor that
-- guarantees a warm person is always a candidate. The import wrote 0-100
-- (100/85/70/50/15 by tier). enrich-person, add-person and import-circle wrote
-- 1-3. So all 2,478 enriched people carried tier_weight 2 or 3, BELOW the 15 a
-- cold lead carries, and 418 of them are core network. The Circle roster (384)
-- and the stubs (119) were at 1 and 0 for the same reason. api/bridges noticed
-- the two scales on 2026-09-16 and stopped reading the column; the ranker kept
-- reading it.
--
-- enrich-person also rewrote network_tier from how many data providers found
-- the person, which is a different question from how well Krish knows them.
-- 67 people with a reciprocated email thread lost 1_reciprocated that way.
-- Before enrichment, 1_reciprocated and reciprocated_email agreed on all 97
-- rows that still carry the import's tier.
--
-- Fix: tier_weight is DERIVED from network_tier by one function, in the
-- trigger, so no writer can put a second scale in it again. A reciprocated
-- email pins 1_reciprocated. The route stops demoting (api/network/enrich-person.ts).
--
-- ── 2. Enrichment wrote a seniority vocabulary the ranker cannot read ─────
-- The planner emits founder_cxo | vp_director | manager_senior | ic_unknown and
-- the scorer compared with `=`. The enrichment judgment wrote c_level, founder,
-- owner, vp, director, manager, ic: 2,411 rows. So any question implying
-- seniority ("senior", "CMO", "founders") scored every enriched person 0 on that
-- constraint. best_channel split the same way: 2,425 'linkedin' beside 2,203
-- 'linkedin_dm'. And the planner's 'mindmake_buyer_family' has never matched the
-- scorer's 'mindmaker_buyer_family', so that constraint scored everyone 0.
--
-- Fix: seniority_band() and channel_canon() map every spelling to the planner's
-- vocabulary, the rows are repaired, the trigger normalises every future write,
-- and the scorer compares normalised values on both sides.
--
-- ── 3. What was bought is not in the index ────────────────────────────────
-- The profile scrape returned a career history (about six roles) and twelve
-- skills for 2,478 people. They were stored in contacts.dossier._direct.facts,
-- which nothing that ranks reads. "Who do I know who used to work at Amazon"
-- could only be answered if the model's why_them happened to mention it.
--
-- ── 4. The index was written in the judge's voice, not the person's ───────
-- intel_doc led with who · why_them · hook: the model's opinion of why someone
-- matters, written in August against AdFixus (805 rows still name it) and full
-- of negations. For 1,481 people the ONLY place the word "AI" appears is that
-- judgment ("carries no AI decision rights, media data or capital relevance"),
-- so a search for AI people matched people the model had said were not. The
-- placeholders did the same thing to "data": 5,229 docs match it and 3,290 of
-- those only because they read "No role data captured" or "Insufficient
-- profile data".
--
-- Fix: the retrieval text is FACTS. What they do (who), title, company,
-- industry, place, headline, the opening of their summary, their career and
-- their skills, their live intent, their name. why_them, hook and risk stay on
-- the row for the sheet and the explanation pass; they are no longer matched
-- against. Placeholders are never indexed. Length stays inside the budget
-- 20260915250000 set: measured below.
--
-- The trigger reads the dossier from contacts, and enrich-person writes the
-- dossier AFTER contact_intelligence, so a new trigger on contacts rebuilds the
-- doc when the dossier (or title, company, location, name) changes. Without it
-- the career of a newly enriched person would reach the index only by accident.
--
-- ── 5. Half of every score ignored the question ───────────────────────────
-- match_score was 0.34 semantic + 0.16 keywords + 0.22 constraints + 0.18
-- relationship + 0.10 actionability, added together. Relationship and
-- actionability do not depend on what was asked, so a warm contact with no
-- match at all scored ~38 and outranked a stranger who was exactly the answer.
-- "retail media adtech", keywords only: ranks 2 to 8 had query relevance
-- 0.004 to 0.031 and scored 57, while a retail media product GM (0.68) and a
-- holding company's chief product officer (0.80) sat below them.
--
-- Fix: when a question was asked, relevance decides and the relationship
-- adjusts. score = Q * (0.65 + 0.35 * R), where Q is the question terms
-- (semantic, keywords, and constraints when there are any) and R is
-- relationship and actionability. Among people who answer the question
-- equally, the warmer one ranks higher; someone who does not answer it cannot
-- be carried up by warmth. Recommend mode, which has no question, still ranks
-- on relationship and fit exactly as before.
--
-- ── 6. The keyword gate kept an arbitrary thousand ────────────────────────
-- Path (c) took the first 1,000 matching rows in physical order, then ranked
-- those. For a common word that is a lottery: "data" matches 5,229. The window
-- is now ordered by how many of the query's words each row contains, which is
-- cheap (an @@ per word, no position walk): 140ms measured for a five-word
-- query matching 9,341 rows.
--
-- ── Rollout ──────────────────────────────────────────────────────────────
-- Applying this rebuilds every intel_doc (step 5 below) and marks each changed
-- row embed_stale. Keyword matching improves immediately; the semantic tier
-- keeps finding people on their old vectors until
-- `npx tsx scripts/network/reembed-stale.ts --commit` runs (~11,700 rows of
-- text-embedding-3-small, well under a dollar).

SELECT '[1,2,3]'::vector IS NOT NULL AS pgvector_loaded;

-- ── One vocabulary per field ───────────────────────────────────────────────

-- The planner's four bands are the vocabulary. Every other spelling any
-- provider or model has written maps onto one of them. An unrecognised value is
-- kept as written rather than guessed into a band.
CREATE OR REPLACE FUNCTION public.seniority_band(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(btrim(p)) IN ('founder_cxo', 'c_level', 'c_suite', 'cxo', 'chief',
                             'founder', 'cofounder', 'co_founder', 'owner',
                             'partner', 'executive') THEN 'founder_cxo'
    WHEN lower(btrim(p)) IN ('vp_director', 'vp', 'svp', 'evp', 'director', 'head')
      THEN 'vp_director'
    WHEN lower(btrim(p)) IN ('manager_senior', 'manager', 'senior', 'lead')
      THEN 'manager_senior'
    WHEN lower(btrim(p)) IN ('ic_unknown', 'ic', 'entry', 'junior', 'intern',
                             'training', 'unpaid', 'unknown') THEN 'ic_unknown'
    ELSE lower(btrim(p))
  END
$fn$;

CREATE OR REPLACE FUNCTION public.channel_canon(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(btrim(p)) = 'linkedin'  THEN 'linkedin_dm'
    WHEN lower(btrim(p)) = 'instagram' THEN 'instagram_dm'
    ELSE lower(btrim(p))
  END
$fn$;

-- The one scale. Same numbers api/bridges/index.ts TIER_STRENGTH prints.
CREATE OR REPLACE FUNCTION public.tier_weight_for(p text)
RETURNS integer
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE p
    WHEN '1_reciprocated'  THEN 100
    WHEN '2_core_network'  THEN 85
    WHEN '3_known_network' THEN 70
    WHEN '4_owned_network' THEN 50
    WHEN '5_cold_lead'     THEN 15
    ELSE 0
  END
$fn$;

-- ── Repair the rows ────────────────────────────────────────────────────────
-- Before the trigger is widened to watch these columns, so none of these fire a
-- doc rebuild one row at a time. Step 5 rebuilds every doc once.

UPDATE public.contact_intelligence
   SET seniority = public.seniority_band(seniority)
 WHERE seniority IS DISTINCT FROM public.seniority_band(seniority);

UPDATE public.contact_intelligence
   SET best_channel = public.channel_canon(best_channel)
 WHERE best_channel IS DISTINCT FROM public.channel_canon(best_channel);

UPDATE public.contact_intelligence
   SET network_tier = '1_reciprocated'
 WHERE reciprocated_email AND network_tier IS DISTINCT FROM '1_reciprocated';

UPDATE public.contact_intelligence
   SET tier_weight = public.tier_weight_for(network_tier)
 WHERE tier_weight IS DISTINCT FROM public.tier_weight_for(network_tier);

-- ── The retrieval text ─────────────────────────────────────────────────────
-- A pure function so the trigger, a probe and a future backfill all compose
-- the same text. Bounded field by field: 20260915250000 measured what an
-- unbounded doc does to ts_rank_cd against an 8s timeout.
CREATE OR REPLACE FUNCTION public.ci_retrieval_text(
  p_who text, p_name text, p_title text, p_company text, p_industry text,
  p_location text, p_headline text, p_summary text, p_facts jsonb,
  p_intent_line text
)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $fn$
  SELECT btrim(regexp_replace(concat_ws(' · ',
    -- What they do now, in one sentence. Placeholders written when nothing was
    -- known are not facts about the person and are never indexed.
    CASE WHEN p_who ~* '^\s*(no role data|insufficient profile data|unknown)' THEN NULL
         ELSE NULLIF(left(p_who, 300), '') END,
    NULLIF(p_title, ''),
    NULLIF(p_company, ''),
    NULLIF(p_industry, ''),
    NULLIF(p_location, ''),
    NULLIF(left(p_headline, 200), ''),
    NULLIF(left(p_summary, 300), ''),
    -- Career: where they have been, which is most of what "who do I know who
    -- has done X" is asking. Six roles, as the scrape returns them.
    (SELECT 'Career: ' || left(string_agg(
              CASE
                WHEN nullif(e->>'company', '') IS NULL THEN e->>'title'
                WHEN nullif(e->>'title', '') IS NULL
                  OR lower(e->>'title') = lower(e->>'company') THEN e->>'company'
                ELSE (e->>'title') || ' at ' || (e->>'company')
              END, '; ' ORDER BY ord), 420)
       FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(p_facts->'career') = 'array'
                   THEN p_facts->'career' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(e, ord)
      WHERE ord <= 6
        AND coalesce(nullif(e->>'title', ''), nullif(e->>'company', '')) IS NOT NULL
     HAVING count(*) > 0),
    (SELECT 'Skills: ' || left(string_agg(s, ', ' ORDER BY ord), 220)
       FROM jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(p_facts->'skills') = 'array'
                   THEN p_facts->'skills' ELSE '[]'::jsonb END) WITH ORDINALITY AS y(s, ord)
      WHERE ord <= 12 AND btrim(s) <> ''
     HAVING count(*) > 0),
    p_intent_line,
    -- Last: a name is for finding someone by surname, and carries nothing the
    -- embedding should weigh.
    NULLIF(p_name, '')
  ), '\s+', ' ', 'g'))
$fn$;

CREATE OR REPLACE FUNCTION public.ci_rebuild_doc_and_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_name text; c_title text; c_company text; c_location text;
  c_has_li boolean; c_has_email boolean; c_facts jsonb;
  new_doc text;
  intent_line text;
BEGIN
  SELECT c.full_name, c.title, c.company, c.location,
         c.linkedin_url IS NOT NULL, c.email_normalized IS NOT NULL,
         CASE WHEN jsonb_typeof(c.dossier) = 'object'
              THEN c.dossier->'_direct'->'facts' END
    INTO c_name, c_title, c_company, c_location, c_has_li, c_has_email, c_facts
  FROM public.contacts c WHERE c.id = NEW.contact_id;

  -- One vocabulary, enforced here rather than trusted to every writer. See the
  -- header: three writers, three scales, and nothing noticed for twelve days.
  NEW.seniority    := public.seniority_band(NEW.seniority);
  NEW.best_channel := public.channel_canon(NEW.best_channel);
  IF NEW.reciprocated_email THEN
    NEW.network_tier := '1_reciprocated';
  END IF;
  NEW.tier_weight := public.tier_weight_for(NEW.network_tier);

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

  new_doc := public.ci_retrieval_text(
    NEW.who, c_name,
    coalesce(NULLIF(NEW.current_title, ''), c_title),
    coalesce(NULLIF(NEW.current_company, ''), c_company),
    NEW.industry, coalesce(c_location, NEW.country),
    NEW.headline, NEW.summary, c_facts, intent_line);

  IF new_doc IS DISTINCT FROM NEW.intel_doc THEN
    NEW.intel_doc := new_doc;
    NEW.embed_stale := true;
  END IF;

  NEW.completeness := public.contact_completeness(
    NEW.name_quality, coalesce(c_has_li, false), coalesce(c_has_email, false),
    NEW.headline, NEW.summary, NEW.followers, NEW.why_them, NEW.enriched_at);

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

-- Widened to the columns the trigger now normalises, so a write to any of them
-- cannot skip the normalisation.
DROP TRIGGER IF EXISTS ci_rebuild_doc_trg ON public.contact_intelligence;
CREATE TRIGGER ci_rebuild_doc_trg
  BEFORE INSERT OR UPDATE OF
    who, why_them, hook, industry, country, name_quality, followers, headline,
    summary, current_title, current_company, enriched_at, intent_score,
    intent_topics, intent_stance, sells_competing_services, competitor_source,
    seniority, best_channel, network_tier, tier_weight, reciprocated_email
  ON public.contact_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.ci_rebuild_doc_and_score();

-- ── contacts → the doc ─────────────────────────────────────────────────────
-- The doc is composed from both tables, and only one of them had a trigger.
-- Touching name_quality with its own value is what fires the rebuild; the same
-- device scripts/network/rebuild-docs.ts uses.
CREATE OR REPLACE FUNCTION public.contacts_refresh_intel_doc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.contact_intelligence ci
     SET name_quality = ci.name_quality
   WHERE ci.contact_id = NEW.id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS contacts_intel_doc_trg ON public.contacts;
CREATE TRIGGER contacts_intel_doc_trg
  AFTER UPDATE OF dossier, title, company, location, full_name ON public.contacts
  FOR EACH ROW
  WHEN (OLD.dossier   IS DISTINCT FROM NEW.dossier
     OR OLD.title     IS DISTINCT FROM NEW.title
     OR OLD.company   IS DISTINCT FROM NEW.company
     OR OLD.location  IS DISTINCT FROM NEW.location
     OR OLD.full_name IS DISTINCT FROM NEW.full_name)
  EXECUTE FUNCTION public.contacts_refresh_intel_doc();

-- ── Rebuild every doc, once ────────────────────────────────────────────────
-- As postgres, which carries no statement_timeout (authenticator's 8s is why
-- rebuild-docs.ts batches over REST). Rows whose text changes are marked
-- embed_stale; see Rollout in the header.
UPDATE public.contact_intelligence SET name_quality = name_quality;

-- ── The scorer ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.network_search(
  p_query_vec   text    DEFAULT NULL,
  p_keywords    text    DEFAULT NULL,
  p_venture     text    DEFAULT NULL,
  p_constraints jsonb   DEFAULT '[]'::jsonb,
  p_tiers       text[]  DEFAULT NULL,
  p_min_conf    text    DEFAULT NULL,
  p_roles       text[]  DEFAULT NULL,
  p_countries   text[]  DEFAULT NULL,
  p_limit       integer DEFAULT 40,
  p_pool        integer DEFAULT 400,
  p_floor       integer DEFAULT 200
)
RETURNS TABLE(
  contact_id uuid, full_name text, company text, title text, email text,
  linkedin_url text, twitter_handle text, origin_channel text,
  origin_campaign text, first_met_context text, followers integer,
  completeness smallint, intent_score smallint, intent_stance text,
  intent_evidence text, intent_evidence_url text, intent_topics text[],
  intent_summary text, last_post_at timestamptz, who text, why_them text,
  hook text, risk text, roles text[], surface_when text[], network_tier text,
  best_channel text, reachable_via text[], confidence text, intel_method text,
  seniority text, country text, geo_code text, industry text,
  venture_scores jsonb, thin_evidence boolean, sells_competing_services boolean,
  match_score numeric, query_relevance numeric, s_semantic numeric,
  s_lexical numeric, s_constraint numeric, s_relationship numeric,
  s_actionability numeric, venture_multiplier numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
-- Scoped to this function on purpose. See the header.
SET hnsw.ef_search TO '120'
AS $function$
WITH q AS (
  SELECT
    CASE WHEN p_query_vec IS NULL OR p_query_vec = '' THEN NULL
         ELSE p_query_vec::vector END                        AS qvec,
    -- OR the terms, do not AND them. websearch_to_tsquery defaults to AND, and
    -- measured against the real corpus that is fatal: "chief marketing officer
    -- bank AI" required all five lexemes and matched 4 rows out of 10,670,
    -- while "podcast guest shipped AI product" matched zero. A search promising
    -- to always return answers cannot have its keyword tier silently switch off
    -- as the query gets more specific.
    CASE WHEN p_keywords IS NULL OR btrim(p_keywords) = '' THEN NULL
         ELSE websearch_to_tsquery('english',
                regexp_replace(btrim(p_keywords), '\s+', ' or ', 'g')) END AS tsq,
    -- Pre-PARSED, not just pre-split. The coverage term below runs once per
    -- candidate row, and building a tsquery from text is not free.
    CASE WHEN p_keywords IS NULL OR btrim(p_keywords) = '' THEN NULL
         ELSE (SELECT array_agg(plainto_tsquery('english', lexeme))
               FROM unnest(to_tsvector('english', p_keywords))) END AS lexqueries,
    -- The hard geography filter, canonicalised once. A country list where
    -- nothing was recognised degrades to no filter, because answering it with
    -- zero people would be a confident wrong answer.
    NULLIF(
      (SELECT array_agg(DISTINCT g) FROM (
         SELECT public.network_geo_canon(x) AS g FROM unnest(coalesce(p_countries, '{}')) x
       ) z WHERE g IS NOT NULL),
      '{}'::text[]
    ) AS geos
),
cons AS (
  -- Constraints, with geography canonicalised ONCE rather than once per
  -- candidate row. network_geo_canon reads a table, so calling it inside the
  -- per-row scoring lateral would run it ~10,000 times per search for a value
  -- that cannot change between rows.
  --
  -- Both 'geo' and 'country' are accepted and normalised to 'geo'. A geo
  -- constraint whose values resolve to nothing is DROPPED, not kept empty: an
  -- empty value list would score zero for everyone and quietly penalise the
  -- whole corpus for one unrecognised place name.
  SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb) AS c
  FROM (
    SELECT
      ord,
      CASE WHEN el->>'field' IN ('geo', 'country')
        THEN jsonb_build_object('field', 'geo',
                                'weight', coalesce(el->'weight', to_jsonb(1.0::float8)),
                                'values', codes)
        ELSE el END AS e,
      (el->>'field' IN ('geo', 'country')) AS is_geo,
      codes
    FROM jsonb_array_elements(coalesce(p_constraints, '[]'::jsonb)) WITH ORDINALITY AS a(el, ord)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT z.g) AS codes
      FROM (SELECT public.network_geo_canon(v) AS g
            FROM jsonb_array_elements_text(el->'values') v) z
      WHERE z.g IS NOT NULL
    ) gv ON el->>'field' IN ('geo', 'country')
  ) t
  WHERE NOT (is_geo AND codes IS NULL)
),
geosoft AS (
  -- The countries a SOFT constraint mentioned. Used only for recall: the
  -- constraint term cannot promote someone who was never in the pool.
  SELECT NULLIF(array_agg(DISTINCT x), '{}'::text[]) AS g
  FROM cons, jsonb_array_elements(cons.c) el, jsonb_array_elements_text(el->'values') x
  WHERE el->>'field' = 'geo'
),
cand AS (
  -- Candidate recall: a UNION of orthogonal paths, one of which is
  -- QUERY-INDEPENDENT, which is what keeps the always-answer promise structural
  -- rather than aspirational. Every path carries the hard geography predicate,
  -- so a country filter is never applied to an already-truncated pool.

  -- (a) No query vector: the floor goes DEEP rather than everywhere.
  --
  --     This used to be an unbounded scan, on the reasoning that a search
  --     without a semantic tier should at least be exhaustive. Measured, that
  --     cost 6.2s to score 11,704 people against an 8s statement timeout, which
  --     made the DEGRADED path the one most likely to fail outright. See this
  --     migration's header for what the bound keeps and what it drops. It is
  --     `greatest(p_floor, 2000)` so a caller who explicitly asks for a deeper
  --     floor still gets one.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT qvec FROM q) IS NULL AND ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.tier_weight DESC, ci.warmth DESC NULLS LAST
   LIMIT greatest(coalesce(p_floor, 200), 2000))

  UNION

  -- (b) Semantic recall. Served by the HNSW index, and bounded by
  --     hnsw.ef_search (set on this function), not by p_pool.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT qvec FROM q) IS NOT NULL AND ci.embedding IS NOT NULL AND ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.embedding <=> (SELECT qvec FROM q)
   LIMIT p_pool)

  UNION

  -- (c) Lexical recall. Catches literal strings — a company name, a surname —
  --     that an embedding will not reliably place.
  --
  --     BOUNDED (20260923102803). The inner LIMIT stops the gate reading and
  --     cover-density-ranking every match in the corpus to choose p_pool of
  --     them.
  --
  --     ORDERED (20260927160000). The window used to have no ORDER BY, so it
  --     kept the first thousand matches in physical order: for a common word
  --     ("data" matches 5,229 rows) which thousand was a lottery. It now keeps
  --     the rows that contain the most of the query's words, then the fullest
  --     records. Counting words is an @@ per lexeme, not a position walk: 140ms
  --     measured for a five-word query matching 9,341 rows. ts_rank_cd, the
  --     expensive part, still only ever runs over the window.
  (SELECT z.contact_id
   FROM (
     SELECT ci.contact_id, ci.intel_tsv
     FROM public.contact_intelligence ci
     WHERE (SELECT tsq FROM q) IS NOT NULL AND ci.is_person
       AND ci.intel_tsv @@ (SELECT tsq FROM q)
       AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
     ORDER BY (SELECT count(*) FROM unnest((SELECT lexqueries FROM q)) lq
                WHERE ci.intel_tsv @@ lq) DESC,
              ci.completeness DESC
     LIMIT greatest(p_pool, 1) * 4
   ) z
   ORDER BY ts_rank_cd(z.intel_tsv, (SELECT tsq FROM q)) DESC
   LIMIT p_pool)

  UNION

  -- (d) Venture recall, so a named venture reaches its best-fit people even
  --     when they are nobody's nearest neighbour.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE p_venture IS NOT NULL AND ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY coalesce((ci.venture_scores->>p_venture)::numeric, 0) DESC
   LIMIT p_pool)

  UNION

  -- (e) The relationship floor. Query-independent by design. Served by
  --     ci_relationship_floor_idx.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.tier_weight DESC, ci.warmth DESC NULLS LAST
   LIMIT p_floor)

  UNION

  -- (f) Soft geography recall. "Who do I know in London" parses to a weighted
  --     constraint, not a filter, so without this path the strongest Londoners
  --     would only be scored if they happened to fall out of (b), (c) or (e).
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT g FROM geosoft) IS NOT NULL AND ci.is_person
     AND ci.geo_code = ANY((SELECT g FROM geosoft)::text[])
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.tier_weight DESC, ci.warmth DESC NULLS LAST
   LIMIT p_pool)
),
scored AS (
  SELECT
    ci.contact_id,
    -- The enriched title and company where there is one. contacts.title is
    -- only ever filled where blank, so for 939 enriched people it still reads
    -- whatever the import said, and the row printed that over a profile we
    -- had just paid to read.
    c.full_name,
    coalesce(NULLIF(ci.current_company, ''), c.company) AS company,
    coalesce(NULLIF(ci.current_title, ''), c.title)     AS title,
    c.email, c.linkedin_url,
    c.twitter_handle, c.origin_channel, c.origin_campaign, c.first_met_context,
    ci.followers, ci.completeness,
    public.intent_live_score(ci.intent_score, ci.last_post_at) AS intent_score,
    ci.intent_stance, ci.intent_evidence, ci.intent_evidence_url,
    ci.intent_topics, ci.intent_summary, ci.last_post_at,
    ci.who, ci.why_them, ci.hook, ci.risk,
    ci.roles, ci.surface_when, ci.network_tier, ci.best_channel,
    ci.reachable_via, ci.confidence, ci.intel_method,
    ci.seniority, ci.country, ci.geo_code, ci.industry, ci.venture_scores,
    -- Thin evidence is a property of the RECORD, not of the importer that
    -- happened to write it.
    (ci.completeness < 50) AS thin_evidence,

    -- ── Semantic ────────────────────────────────────────────────────────────
    -- Cosine similarity, rescaled onto the band real queries actually occupy.
    -- [0.30, 0.62] is measured, not guessed; re-measure with
    -- public.cosine_probe() if the embedding model or the intel_doc shape
    -- changes.
    CASE
      WHEN q.qvec IS NULL OR ci.embedding IS NULL THEN NULL
      ELSE greatest(0, least(1, (((1 - (ci.embedding <=> q.qvec)) - 0.30) / 0.32)))
    END AS s_semantic,

    -- ── Lexical ─────────────────────────────────────────────────────────────
    CASE
      WHEN q.tsq IS NULL THEN NULL
      ELSE ts_rank_cd(ci.intel_tsv, q.tsq)
    END AS s_lexical_raw,

    -- Coverage: what FRACTION of the query's lexemes this row actually
    -- contains. Coverage is what separates "matched the query" from "matched a
    -- word in the query".
    CASE
      WHEN q.lexqueries IS NULL THEN NULL
      ELSE (
        SELECT count(*)::float8 / greatest(array_length(q.lexqueries, 1), 1)
        FROM unnest(q.lexqueries) lq
        WHERE ci.intel_tsv @@ lq
      )
    END AS lex_coverage,

    -- ── Constraint fit ──────────────────────────────────────────────────────
    -- Weighted partial credit. No constraints means 0.5, a deliberate neutral,
    -- and has_cons says so, so the final score can leave a neutral out of the
    -- question rather than averaging it in.
    -- Unknown field names contribute nothing rather than erroring, so a planner
    -- hallucinating a column degrades the score instead of the request.
    (jsonb_array_length(cons.c) > 0) AS has_cons,
    CASE WHEN jsonb_array_length(cons.c) = 0 THEN 0.5
    ELSE coalesce((
      SELECT sum(w * hit) / nullif(sum(w), 0)
      FROM (
        SELECT
          coalesce((el->>'weight')::float8, 1.0) AS w,
          (CASE el->>'field'
            -- Normalised on BOTH sides. The rows are repaired and the trigger
            -- normalises every write, but a planner that says "vp" should still
            -- mean vp_director.
            WHEN 'seniority'    THEN CASE WHEN public.seniority_band(ci.seniority) = ANY(
                                            ARRAY(SELECT public.seniority_band(v) FROM unnest(vals) v))
                                          THEN 1 ELSE 0 END
            WHEN 'country'      THEN CASE WHEN ci.country   = ANY(vals) THEN 1 ELSE 0 END
            -- THREE outcomes, not two. An unknown location scores the same 0.5
            -- neutral this term uses when there is no constraint at all,
            -- because "we never recorded where they are" is not the same claim
            -- as "they are definitely somewhere else". With two outcomes a soft
            -- UK constraint returned 200 Britons out of 200 rows and buried 151
            -- of the 164 tier-1 people whose location was never captured.
            WHEN 'geo'          THEN CASE WHEN ci.geo_code = ANY(vals) THEN 1
                                          WHEN ci.geo_code IS NULL THEN 0.5
                                          ELSE 0 END
            WHEN 'network_tier' THEN CASE WHEN ci.network_tier = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'best_channel' THEN CASE WHEN public.channel_canon(ci.best_channel) = ANY(
                                            ARRAY(SELECT public.channel_canon(v) FROM unnest(vals) v))
                                          THEN 1 ELSE 0 END
            WHEN 'confidence'   THEN CASE WHEN ci.confidence  = ANY(vals) THEN 1 ELSE 0 END
            -- Only a LIVE stance counts. Matching a stale one would answer "who
            -- is stuck on AI" with someone who was stuck last year.
            WHEN 'intent_stance' THEN CASE
              WHEN coalesce(public.intent_live_score(ci.intent_score, ci.last_post_at), 0) > 0 AND ci.intent_stance = ANY(vals) THEN 1
              ELSE 0 END
            WHEN 'primary_venture' THEN CASE WHEN ci.primary_venture = ANY(vals) THEN 1 ELSE 0 END
            -- Both spellings. The planner's allow-list said mindmake_, the column
            -- says mindmaker_, and the mismatch fell to ELSE 0 for everyone.
            WHEN 'mindmaker_buyer_family' THEN CASE WHEN ci.mindmaker_buyer_family = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'mindmake_buyer_family'  THEN CASE WHEN ci.mindmaker_buyer_family = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'roles'         THEN CASE WHEN ci.roles         && vals THEN 1 ELSE 0 END
            WHEN 'surface_when'  THEN CASE WHEN ci.surface_when  && vals THEN 1 ELSE 0 END
            WHEN 'reachable_via' THEN CASE WHEN ci.reachable_via && vals THEN 1 ELSE 0 END
            -- Free-text fields match on substring, so "media agency" hits
            -- "independent media agency" the way a person would expect.
            WHEN 'industry' THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE ci.industry ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            -- Current employer and title, from the profile where we read one
            -- and from the import where we did not. Past employers are in the
            -- retrieval text's career line, which the keyword tier reads; a
            -- 'company' constraint means where they are NOW.
            WHEN 'company'  THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v
               WHERE ci.current_company ILIKE '%' || v || '%'
                  OR c.company          ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            WHEN 'title'    THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v
               WHERE ci.current_title ILIKE '%' || v || '%'
                  OR c.title          ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            ELSE 0
          -- Cast: the geo branch returns 0.5, which makes this CASE numeric,
          -- and `w` is float8. Postgres has no float8 * numeric.
          END)::float8 AS hit
        FROM jsonb_array_elements(cons.c) el
        CROSS JOIN LATERAL (
          SELECT array(SELECT jsonb_array_elements_text(el->'values')) AS vals
        ) x
      ) t
    ), 0.5) END AS s_constraint,

    -- ── Relationship value ──────────────────────────────────────────────────
    (
      0.40 * (ci.tier_weight::numeric / 100)
    + 0.30 * (coalesce(ci.warmth, 0)::numeric / 100)
    + 0.15 * (CASE WHEN ci.reciprocated_email THEN 1 ELSE 0 END)
    + 0.15 * (least(ci.source_count, 5)::numeric / 5)
    ) AS s_relationship,

    -- ── Actionability ───────────────────────────────────────────────────────
    -- Where a follower count exists it is log-scaled and never read as
    -- connections_count: LinkedIn caps that at 500, so everyone consequential
    -- reports the same number and it separates nobody.
    (
      (CASE WHEN coalesce(array_length(ci.reachable_via, 1), 0) > 0 THEN 0.26 ELSE 0 END)
    + (CASE ci.confidence WHEN 'high' THEN 0.18 WHEN 'medium' THEN 0.11 ELSE 0.03 END)
    + (0.24 * (ci.completeness::numeric / 100))
    + (0.17 * greatest(
         CASE WHEN ci.followers IS NULL THEN 0
              ELSE least(1, ln(greatest(ci.followers, 1))::numeric / ln(20000)) END,
         CASE WHEN ci.is_influencer THEN 0.90
              WHEN ci.is_creator THEN 0.55
              ELSE 0 END))
    -- Intent: the only term in the whole ranker that decays on its own. Capped
    -- well below the relationship terms on purpose, because a stranger posting
    -- about agents must not outrank someone Krish actually knows.
    + (0.15 * (coalesce(public.intent_live_score(ci.intent_score, ci.last_post_at), 0)::numeric / 100))
    ) AS s_actionability,

    -- ── Venture multiplier ──────────────────────────────────────────────────
    -- Penalty-only, [0.65, 1.0]. A venture score should suppress the
    -- irrelevant, not manufacture relevance.
    CASE
      WHEN p_venture IS NULL THEN 1.0
      ELSE 0.65 + 0.35 * (coalesce((ci.venture_scores->>p_venture)::numeric, 0) / 100)
    END AS venture_multiplier,

    -- Whether this person sells what Krish sells. NULL means nobody judged.
    ci.sells_competing_services AS is_competitor

  FROM public.contact_intelligence ci
  JOIN public.contacts c ON c.id = ci.contact_id
  CROSS JOIN q
  CROSS JOIN cons
  WHERE ci.contact_id IN (SELECT contact_id FROM cand)
    AND ci.is_person                                    -- the one implicit hard filter
    AND (p_tiers    IS NULL OR ci.network_tier = ANY(p_tiers))
    AND (p_roles    IS NULL OR ci.roles && p_roles)
    AND (q.geos     IS NULL OR ci.geo_code = ANY(q.geos))
    AND (p_min_conf IS NULL OR
         CASE ci.confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END >=
         CASE p_min_conf    WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
    AND c.status IS DISTINCT FROM 'do_not_contact'
),
rescaled AS (
  -- Lexical rank is rescaled against the strongest match in this result set,
  -- not against a constant, and coverage is SQUARED so one incidental word
  -- match cannot read as a third of a perfect match.
  SELECT scored.*,
    CASE WHEN s_lexical_raw IS NULL THEN NULL
         ELSE (s_lexical_raw / nullif(max(s_lexical_raw) OVER (), 0))
              * power(coalesce(lex_coverage, 0), 2) END AS s_lexical
  FROM scored
)
SELECT
  contact_id, full_name, company, title, email, linkedin_url,
  twitter_handle, origin_channel, origin_campaign, first_met_context,
  followers, completeness,
  intent_score, intent_stance, intent_evidence, intent_evidence_url,
  intent_topics, intent_summary, last_post_at,
  who, why_them, hook, risk, roles, surface_when, network_tier, best_channel,
  reachable_via, confidence, intel_method, seniority, country, geo_code, industry,
  venture_scores, thin_evidence,
  is_competitor AS sells_competing_services,
  -- The question decides; the relationship adjusts (20260927160000).
  --
  --   Q = what was asked: semantic 0.34, keywords 0.16, and constraints 0.22
  --       when there are any, renormalised over the terms that ran.
  --   R = who is worth the message: relationship 0.18, actionability 0.10,
  --       renormalised to 0-1.
  --   score = Q * (0.65 + 0.35 * R)
  --
  -- This used to be all five terms ADDED, so half of every score ignored the
  -- question and a warm contact who matched nothing scored ~38 and sat above a
  -- stranger who was exactly the answer. Multiplying keeps what the addition was
  -- for (among people who answer equally, the one Krish knows ranks higher, by up
  -- to about a third) and drops what it was never meant to do (carry someone who
  -- does not answer the question up the list on warmth alone).
  --
  -- Recommend mode has no question and, with no constraints either, Q does not
  -- exist. It then ranks on R alone, which is the same ORDER the old formula
  -- produced for that case (the neutral constraint term was a constant).
  round((greatest(0, least(100,
    100 * venture_multiplier * (CASE WHEN is_competitor THEN 0.45 ELSE 1 END) * (
      CASE
        WHEN s_semantic IS NULL AND s_lexical IS NULL AND NOT has_cons
          THEN (0.18 * s_relationship + 0.10 * s_actionability) / 0.28
        ELSE
          (   (0.34 * coalesce(s_semantic, 0) + 0.16 * coalesce(s_lexical, 0)
             + (CASE WHEN has_cons THEN 0.22 * s_constraint ELSE 0 END))
            / (  (CASE WHEN s_semantic IS NULL THEN 0 ELSE 0.34 END)
               + (CASE WHEN s_lexical  IS NULL THEN 0 ELSE 0.16 END)
               + (CASE WHEN has_cons           THEN 0.22 ELSE 0 END) )
          )
          * (0.65 + 0.35 * ((0.18 * s_relationship + 0.10 * s_actionability) / 0.28))
      END
    )
  )))::numeric, 1) AS match_score,
  -- The query-dependent signal ALONE, isolated from relationship value and
  -- actionability. This is what the API thresholds to decide whether to tell
  -- Krish nothing actually matched. NULL when neither tier ran.
  CASE
    WHEN s_semantic IS NULL AND s_lexical IS NULL THEN NULL
    ELSE round((
      (0.34 * coalesce(s_semantic, 0) + 0.16 * coalesce(s_lexical, 0))
      / ((CASE WHEN s_semantic IS NULL THEN 0 ELSE 0.34 END)
       + (CASE WHEN s_lexical  IS NULL THEN 0 ELSE 0.16 END))
    )::numeric, 3)
  END AS query_relevance,
  round(coalesce(s_semantic, 0)::numeric, 3) AS s_semantic,
  round(coalesce(s_lexical, 0)::numeric, 3)  AS s_lexical,
  round(s_constraint::numeric, 3)            AS s_constraint,
  round(s_relationship::numeric, 3)          AS s_relationship,
  round(s_actionability::numeric, 3)         AS s_actionability,
  round(venture_multiplier::numeric, 3)      AS venture_multiplier
FROM rescaled
ORDER BY match_score DESC, s_relationship DESC
LIMIT least(coalesce(p_limit, 40), 200);
$function$;
-- No GRANT: CREATE OR REPLACE keeps the existing ACL, and re-granting here
-- would be the place a privilege quietly widens one day.
