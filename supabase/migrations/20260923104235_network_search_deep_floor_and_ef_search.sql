-- The two things the last migration recorded and did not do.
--
-- 20260923102803 fixed the timeout and wrote down two findings it deliberately
-- left alone, because both change what the search returns rather than how fast
-- it returns it. Krish's ruling, 2026-09-23: do both.
--
-- ── 1. The semantic tier asks for 250 neighbours and gets 40 ───────────────
-- pgvector's hnsw.ef_search bounds the HNSW candidate list, defaults to 40, and
-- caps the scan regardless of the LIMIT. So p_pool has never reached path (b),
-- and the 250-vs-400 benchmark recorded in api/_networkSearch.ts compared two
-- numbers that were both really 40.
--
-- It is set on the FUNCTION, not on the role. Raising it for `authenticator`
-- would raise it for every vector query in the product, including the ones that
-- want a cheap nearest-neighbour and not a deep one. 120 rather than 250:
-- measured below, and a tripled candidate list is the part of the range where
-- recall is still buying something.
--
-- Why the odd `SELECT '[1,2,3]'::vector` at the top: `hnsw.ef_search` only
-- exists as a settable parameter once pgvector's library is loaded into the
-- backend, and until then Postgres treats it as an unknown placeholder that
-- only a superuser may name in a function's SET clause. Supabase's `postgres`
-- role is not a superuser, so applying this migration into a fresh connection
-- fails with "permission denied to set parameter" unless something touches a
-- vector first. Casting a literal is that something.
--
-- ── 2. A search with no query vector scored the whole corpus ──────────────
-- Union member (a) exists so that a search with no embedding is still
-- exhaustive. Measured on production it scored all 11,704 people in 6.2s, which
-- against an 8s statement timeout means an embedding outage took the Network
-- tab down with it. The degraded path was the one most likely to fail.
--
-- Scoring cost is linear and measurable: about 1.0ms per candidate row with a
-- query vector (the cosine term detoasts a 1536-dim vector per row) and about
-- 0.53ms without one. A 2,000 row bound is therefore ~1.1s, and this instance
-- swings by a factor of three to four between a good run and a bad one, which
-- puts the worst case around 4s and inside the budget.
--
-- So the no-vector path stops being "everyone" and becomes "the floor goes
-- deep": the same relationship ordering as path (e), 2,000 rows instead of 150,
-- served by ci_relationship_floor_idx. What that keeps: the lexical, venture and
-- geography paths are untouched, so anyone whose words, venture fit or country
-- matches is still reached no matter how cold the relationship. What it drops:
-- people below 2,000 on relationship who match no keyword, no venture and no
-- country, who could previously win on actionability alone.
--
-- The number that settles it: 2,000 candidates is still THREE TIMES the ~650
-- the everyday path scores when a query vector is present. The degraded path
-- remains the deeper of the two, which is the only property worth defending.

SELECT '[1,2,3]'::vector IS NOT NULL AS pgvector_loaded;

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
  --     them. The inner query deliberately has no ORDER BY, which is what keeps
  --     the LIMIT an optimisation barrier rather than a sort Postgres can push
  --     through.
  (SELECT z.contact_id
   FROM (
     SELECT ci.contact_id, ci.intel_tsv
     FROM public.contact_intelligence ci
     WHERE (SELECT tsq FROM q) IS NOT NULL AND ci.is_person
       AND ci.intel_tsv @@ (SELECT tsq FROM q)
       AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
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
    c.full_name, c.company, c.title, c.email, c.linkedin_url,
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
    -- Weighted partial credit. No constraints means 0.5, a deliberate neutral.
    -- Unknown field names contribute nothing rather than erroring, so a planner
    -- hallucinating a column degrades the score instead of the request.
    CASE WHEN jsonb_array_length(cons.c) = 0 THEN 0.5
    ELSE coalesce((
      SELECT sum(w * hit) / nullif(sum(w), 0)
      FROM (
        SELECT
          coalesce((el->>'weight')::float8, 1.0) AS w,
          (CASE el->>'field'
            WHEN 'seniority'    THEN CASE WHEN ci.seniority = ANY(vals) THEN 1 ELSE 0 END
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
            WHEN 'best_channel' THEN CASE WHEN ci.best_channel = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'confidence'   THEN CASE WHEN ci.confidence  = ANY(vals) THEN 1 ELSE 0 END
            -- Only a LIVE stance counts. Matching a stale one would answer "who
            -- is stuck on AI" with someone who was stuck last year.
            WHEN 'intent_stance' THEN CASE
              WHEN coalesce(public.intent_live_score(ci.intent_score, ci.last_post_at), 0) > 0 AND ci.intent_stance = ANY(vals) THEN 1
              ELSE 0 END
            WHEN 'primary_venture' THEN CASE WHEN ci.primary_venture = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'mindmaker_buyer_family' THEN CASE WHEN ci.mindmaker_buyer_family = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'roles'         THEN CASE WHEN ci.roles         && vals THEN 1 ELSE 0 END
            WHEN 'surface_when'  THEN CASE WHEN ci.surface_when  && vals THEN 1 ELSE 0 END
            WHEN 'reachable_via' THEN CASE WHEN ci.reachable_via && vals THEN 1 ELSE 0 END
            -- Free-text fields match on substring, so "media agency" hits
            -- "independent media agency" the way a person would expect.
            WHEN 'industry' THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE ci.industry ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            WHEN 'company'  THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE c.company  ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            WHEN 'title'    THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE c.title    ILIKE '%' || v || '%') THEN 1 ELSE 0 END
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
  -- Weights renormalise over the terms actually present, so a recommend-mode
  -- call with no text query is not silently scored out of 0.50.
  round((greatest(0, least(100,
    100 * venture_multiplier * (CASE WHEN is_competitor THEN 0.45 ELSE 1 END) * (
        (0.34 * coalesce(s_semantic, 0) + 0.16 * coalesce(s_lexical, 0)
       + 0.22 * s_constraint + 0.18 * s_relationship + 0.10 * s_actionability)
      / (  (CASE WHEN s_semantic IS NULL THEN 0 ELSE 0.34 END)
         + (CASE WHEN s_lexical  IS NULL THEN 0 ELSE 0.16 END)
         + 0.22 + 0.18 + 0.10 )
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
