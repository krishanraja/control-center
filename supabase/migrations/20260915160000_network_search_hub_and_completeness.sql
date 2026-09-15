-- network_search: rank on what the record actually contains.
--
-- Two changes, both consequences of enrichment finally reaching the surface
-- (see ADR-022 and 20260915140000).
--
-- 1. thin_evidence stops meaning "an importer called rules_v1 wrote this" and
--    starts meaning "this record is incomplete". The old test kept the warning
--    badge on 90 of the first 169 people we had bought full profiles for.
--
-- 2. Actionability gains a HUB term from follower count. This is the signal
--    Krish asked for at the outset — who is a node rather than a leaf — and it
--    could not be used before because the number lived in a jsonb blob.
--
-- Deliberately NOT a new hard filter and NOT a new top-level weight: the five
-- scoring terms and their proportions are measured, and this rebalances inside
-- actionability rather than re-tuning the whole ranker on a hunch.
--
-- Dropped rather than replaced: the return type gains columns.
DROP FUNCTION IF EXISTS public.network_search(text, text, text, jsonb, text[], text, text[], text[], int, int, int);

CREATE FUNCTION public.network_search(
  p_query_vec   text    DEFAULT NULL,   -- pgvector literal, or NULL to skip the semantic term
  p_keywords    text    DEFAULT NULL,   -- websearch_to_tsquery input, or NULL
  p_venture     text    DEFAULT NULL,   -- venture key for the multiplier
  p_constraints jsonb   DEFAULT '[]'::jsonb,  -- [{field, values[], weight}] — SOFT
  p_tiers       text[]  DEFAULT NULL,   -- explicit UI filter — HARD
  p_min_conf    text    DEFAULT NULL,   -- explicit UI filter — HARD
  p_roles       text[]  DEFAULT NULL,   -- explicit UI filter — HARD
  p_countries   text[]  DEFAULT NULL,   -- explicit UI filter — HARD. ISO-2 or any
                                        -- text network_geo_canon understands.
  p_limit       int     DEFAULT 40,
  p_pool        int     DEFAULT 400,   -- per-path recall depth (semantic/lexical/venture/geo)
  p_floor       int     DEFAULT 200    -- query-independent relationship floor
)
RETURNS TABLE (
  contact_id uuid,
  full_name text,
  company text,
  title text,
  email text,
  linkedin_url text,
  twitter_handle text,
  origin_channel text,
  origin_campaign text,
  first_met_context text,
  followers int,
  completeness smallint,
  who text,
  why_them text,
  hook text,
  risk text,
  roles text[],
  surface_when text[],
  network_tier text,
  best_channel text,
  reachable_via text[],
  confidence text,
  intel_method text,
  seniority text,
  country text,
  geo_code text,
  industry text,
  venture_scores jsonb,
  thin_evidence boolean,
  match_score numeric,
  query_relevance numeric,
  s_semantic numeric,
  s_lexical numeric,
  s_constraint numeric,
  s_relationship numeric,
  s_actionability numeric,
  venture_multiplier numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH q AS (
  SELECT
    CASE WHEN p_query_vec IS NULL OR p_query_vec = '' THEN NULL
         ELSE p_query_vec::vector END                        AS qvec,
    -- OR the terms, do not AND them. websearch_to_tsquery defaults to AND, and
    -- measured against the real corpus that is fatal: "chief marketing officer
    -- bank AI" required all five lexemes and matched 4 rows out of 10,670,
    -- while "podcast guest shipped AI product" matched zero. A search promising
    -- to always return answers cannot have its keyword tier silently switch off
    -- as the query gets more specific. Rewriting the separators to `or` keeps
    -- websearch's safe parsing (it never raises on arbitrary user text, unlike
    -- to_tsquery) while making every additional term add recall instead of
    -- removing it.
    CASE WHEN p_keywords IS NULL OR btrim(p_keywords) = '' THEN NULL
         ELSE websearch_to_tsquery('english',
                regexp_replace(btrim(p_keywords), '\s+', ' or ', 'g')) END AS tsq,
    -- Pre-PARSED, not just pre-split. The coverage term below runs once per
    -- candidate row, and building a tsquery from text is not free: parsing the
    -- same six words a thousand times was measurable. Parse once here, match
    -- many times below.
    CASE WHEN p_keywords IS NULL OR btrim(p_keywords) = '' THEN NULL
         ELSE (SELECT array_agg(plainto_tsquery('english', lexeme))
               FROM unnest(to_tsvector('english', p_keywords))) END AS lexqueries,
    -- The hard geography filter, canonicalised once. NULLIF on the empty array
    -- is deliberate: a country list where nothing was recognised means we did
    -- not understand the request, and answering it with zero people would be a
    -- confident wrong answer. It degrades to no filter, exactly like every
    -- other unparseable input in this function.
    NULLIF(
      (SELECT array_agg(DISTINCT g) FROM (
         SELECT public.network_geo_canon(x) AS g FROM unnest(coalesce(p_countries, '{}')) x
       ) z WHERE g IS NOT NULL),
      '{}'::text[]
    ) AS geos
),
cons AS (
  -- Constraints, with geography canonicalised ONCE rather than once per
  -- candidate row. network_geo_canon reads a table, so it is stable rather than
  -- immutable, and calling it inside the per-row scoring lateral would run it
  -- ~10,000 times per search for a value that cannot change between rows.
  --
  -- Both 'geo' and 'country' are accepted from the planner and normalised to
  -- 'geo'. A geo constraint whose values do not resolve to any country is
  -- DROPPED, not kept empty: an empty value list would score zero for everyone
  -- and quietly penalise the whole corpus for one unrecognised place name.
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
  -- The countries a SOFT constraint mentioned. Used only for recall: a person
  -- in the right country who is nobody's nearest neighbour still deserves to be
  -- scored, and the constraint term cannot promote someone who was never in the
  -- candidate pool.
  SELECT NULLIF(array_agg(DISTINCT x), '{}'::text[]) AS g
  FROM cons, jsonb_array_elements(cons.c) el, jsonb_array_elements_text(el->'values') x
  WHERE el->>'field' = 'geo'
),
cand AS (
  -- Candidate recall.
  --
  -- The first version scored every row, which is the purest way to guarantee an
  -- answer, and measured at 4.6 SECONDS once a query vector was present: 10,670
  -- detoasted 1536-dim vectors is 64MB of reads per search. Without the vector
  -- the same scan is 150-500ms.
  --
  -- So the cheap path stays exhaustive and only the expensive one is gated. And
  -- the gate is a UNION of orthogonal recall paths, one of which is
  -- QUERY-INDEPENDENT, which is what keeps the always-answer promise structural
  -- rather than aspirational: even a query that matches nothing semantically and
  -- nothing lexically still has the strongest relationships in the pool, which
  -- is exactly what the nonsense-query probe showed the scorer falling back to.
  --
  -- Every path carries the hard geography predicate. It is an index scan on
  -- ci_geo_code and it is what stops a country filter from being applied to an
  -- already-truncated pool.

  -- (a) No query vector: score everything. Cheap, and fully exhaustive.
  SELECT ci.contact_id
  FROM public.contact_intelligence ci
  WHERE (SELECT qvec FROM q) IS NULL AND ci.is_person
    AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))

  UNION

  -- (b) Semantic recall. Served by the HNSW index (top-k ordering).
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT qvec FROM q) IS NOT NULL AND ci.embedding IS NOT NULL AND ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.embedding <=> (SELECT qvec FROM q)
   LIMIT p_pool)

  UNION

  -- (c) Lexical recall. Catches literal strings — a company name, a surname —
  --     that an embedding will not reliably place.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT tsq FROM q) IS NOT NULL AND ci.is_person
     AND ci.intel_tsv @@ (SELECT tsq FROM q)
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ts_rank_cd(ci.intel_tsv, (SELECT tsq FROM q)) DESC
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

  -- (e) The relationship floor. Query-independent by design: this is the union
  --     member that makes "always return answers" true no matter what was
  --     asked.
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
    ci.who, ci.why_them, ci.hook, ci.risk,
    ci.roles, ci.surface_when, ci.network_tier, ci.best_channel,
    ci.reachable_via, ci.confidence, ci.intel_method,
    ci.seniority, ci.country, ci.geo_code, ci.industry, ci.venture_scores,
    -- Thin evidence is now a property of the RECORD, not of the importer that
    -- happened to write it. intel_method='rules_v1' kept flagging people we had
    -- since bought full profiles for: 90 of the first 169 enriched were still
    -- badged "no profile was ever read" while holding one.
    (ci.completeness < 50) AS thin_evidence,

    -- ── Semantic ────────────────────────────────────────────────────────────
    -- Cosine similarity, rescaled onto the band real queries actually occupy.
    -- [0.30, 0.62] is measured, not guessed; see the note in
    -- 20260810234500_network_search_rpc.sql and re-measure with
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
    -- Weighted partial credit. No constraints means 0.5, a deliberate neutral:
    -- an unconstrained query must not be scored as though everyone failed.
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
            -- Resolved geography, so "in the UK" also matches the people whose
            -- country column is empty but whose location or email says Britain.
            --
            -- THREE outcomes, not two. An unknown location scores the same 0.5
            -- neutral this term uses when there is no constraint at all, because
            -- "we never recorded where they are" is not the same claim as "they
            -- are definitely somewhere else" and must not be priced like it.
            --
            -- Measured on the corpus before this branch existed: a SOFT UK
            -- constraint returned 200 Britons out of 200 rows and buried all 151
            -- of the 164 tier-1 people whose location was never captured. That is
            -- a hard filter wearing a soft label, and it is the exact failure
            -- geo_code was introduced to avoid. The hard filter (p_countries) is
            -- still strict: that is the operator saying "UK only" out loud, and
            -- the UI tells them how many people it cannot place.
            WHEN 'geo'          THEN CASE WHEN ci.geo_code = ANY(vals) THEN 1
                                          WHEN ci.geo_code IS NULL THEN 0.5
                                          ELSE 0 END
            WHEN 'network_tier' THEN CASE WHEN ci.network_tier = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'best_channel' THEN CASE WHEN ci.best_channel = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'confidence'   THEN CASE WHEN ci.confidence  = ANY(vals) THEN 1 ELSE 0 END
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
          -- Cast: the geo branch above returns 0.5, which makes this CASE
          -- numeric, and `w` is float8. Postgres has no float8 * numeric.
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
    -- Rebalanced around completeness, which measures the record rather than the
    -- importer, and given a hub term.
    --
    -- The hub term is log-scaled follower count, NOT connections_count:
    -- LinkedIn caps the latter at 500 for its "500+" display, so everyone
    -- consequential shows the same number and it separates nobody. Measured on
    -- the first 169 enriched, followers ran 161 to 7,284+ while connections_count
    -- was 500 for nearly all of them. ln() because the difference between 200
    -- and 2,000 followers is real and the difference between 20,000 and 200,000
    -- is mostly noise for this purpose.
    (
      (CASE WHEN coalesce(array_length(ci.reachable_via, 1), 0) > 0 THEN 0.30 ELSE 0 END)
    + (CASE ci.confidence WHEN 'high' THEN 0.22 WHEN 'medium' THEN 0.13 ELSE 0.04 END)
    + (0.28 * (ci.completeness::numeric / 100))
    + (CASE WHEN ci.followers IS NULL THEN 0
            ELSE 0.20 * least(1, ln(greatest(ci.followers, 1))::numeric / ln(20000)) END)
    ) AS s_actionability,

    -- ── Venture multiplier ──────────────────────────────────────────────────
    -- Penalty-only, [0.65, 1.0]. A venture score should suppress the
    -- irrelevant, not manufacture relevance.
    CASE
      WHEN p_venture IS NULL THEN 1.0
      ELSE 0.65 + 0.35 * (coalesce((ci.venture_scores->>p_venture)::numeric, 0) / 100)
    END AS venture_multiplier

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
  who, why_them, hook, risk, roles, surface_when, network_tier, best_channel,
  reachable_via, confidence, intel_method, seniority, country, geo_code, industry,
  venture_scores, thin_evidence,
  -- Weights are renormalised over the terms that are actually present, so a
  -- recommend-mode call with no text query is not silently scored out of 0.50.
  round((greatest(0, least(100,
    100 * venture_multiplier * (
        (0.34 * coalesce(s_semantic, 0) + 0.16 * coalesce(s_lexical, 0)
       + 0.22 * s_constraint + 0.18 * s_relationship + 0.10 * s_actionability)
      / (  (CASE WHEN s_semantic IS NULL THEN 0 ELSE 0.34 END)
         + (CASE WHEN s_lexical  IS NULL THEN 0 ELSE 0.16 END)
         + 0.22 + 0.18 + 0.10 )
    )
  )))::numeric, 1) AS match_score,
  -- The query-dependent signal ALONE, isolated from relationship value and
  -- actionability. This is the number the API thresholds to decide whether to
  -- tell Krish nothing actually matched. NULL when neither tier ran.
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
$$;

COMMENT ON FUNCTION public.network_search IS
  'Hybrid semantic + lexical + constraint + relationship scoring over contact_intelligence. Constraints are SOFT (weighted partial credit); the only hard filters are is_person, do_not_contact, and explicit UI filters (tiers, roles, confidence, countries). Geography resolves through contact_intelligence.geo_code and pushes down into candidate recall. Always returns rows unless a hard filter excludes everyone.';

REVOKE ALL ON FUNCTION public.network_search FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_search TO service_role;
