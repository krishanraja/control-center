-- network_search: hybrid retrieval + scoring for the Network tab.
--
-- ── Why this is one RPC and not query-building in Node ──────────────────────
-- The vectors, the tsvector and the indexes are all here. Pulling 10,670 rows
-- into a serverless function to rank them in JS would move ~65MB per search and
-- throw away every index. pgvector's operators are also not exposed through the
-- auto-API, which is the same reason dedup_nearest and reject_reason_neighbors
-- are RPCs.
--
-- ── The design rule: soft constraints, not WHERE clauses ────────────────────
-- Krish: "should be scoring, not binary as I should always return answers
-- unless the query is ridiculous."
--
-- So a parsed constraint ("CMOs", "in Australia") NEVER filters. It contributes
-- a weighted term, and a person matching 3 of 4 constraints still ranks. The
-- only hard filters are is_person (52 shared mailboxes and system aliases are
-- not people) and whatever the operator set explicitly in the UI. That is a
-- structural guarantee of the always-answer promise rather than a promise the
-- caller has to keep.
--
-- Every row is scored. No candidate-generation step, deliberately: at ~10k rows
-- a sequential scan costs tens of milliseconds, and a top-N prefilter is exactly
-- the thing that would drop the one right answer for an unusual query. Revisit
-- if this table passes ~100k.

CREATE OR REPLACE FUNCTION public.network_search(
  p_query_vec   text    DEFAULT NULL,   -- pgvector literal, or NULL to skip the semantic term
  p_keywords    text    DEFAULT NULL,   -- websearch_to_tsquery input, or NULL
  p_venture     text    DEFAULT NULL,   -- venture key for the multiplier
  p_constraints jsonb   DEFAULT '[]'::jsonb,  -- [{field, values[], weight}] — SOFT
  p_tiers       text[]  DEFAULT NULL,   -- explicit UI filter — HARD
  p_min_conf    text    DEFAULT NULL,   -- explicit UI filter — HARD
  p_roles       text[]  DEFAULT NULL,   -- explicit UI filter — HARD
  p_limit       int     DEFAULT 40,
  p_pool        int     DEFAULT 400,   -- per-path recall depth (semantic/lexical/venture)
  p_floor       int     DEFAULT 200    -- query-independent relationship floor
)
RETURNS TABLE (
  contact_id uuid,
  full_name text,
  company text,
  title text,
  email text,
  linkedin_url text,
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
               FROM unnest(to_tsvector('english', p_keywords))) END AS lexqueries
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

  -- (a) No query vector: score everything. Cheap, and fully exhaustive.
  SELECT ci.contact_id
  FROM public.contact_intelligence ci
  WHERE (SELECT qvec FROM q) IS NULL AND ci.is_person

  UNION

  -- (b) Semantic recall. Served by the HNSW index (top-k ordering).
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT qvec FROM q) IS NOT NULL AND ci.embedding IS NOT NULL AND ci.is_person
   ORDER BY ci.embedding <=> (SELECT qvec FROM q)
   LIMIT p_pool)

  UNION

  -- (c) Lexical recall. Catches literal strings — a company name, a surname —
  --     that an embedding will not reliably place.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT tsq FROM q) IS NOT NULL AND ci.is_person
     AND ci.intel_tsv @@ (SELECT tsq FROM q)
   ORDER BY ts_rank_cd(ci.intel_tsv, (SELECT tsq FROM q)) DESC
   LIMIT p_pool)

  UNION

  -- (d) Venture recall, so a named venture reaches its best-fit people even
  --     when they are nobody's nearest neighbour.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE p_venture IS NOT NULL AND ci.is_person
   ORDER BY coalesce((ci.venture_scores->>p_venture)::numeric, 0) DESC
   LIMIT p_pool)

  UNION

  -- (e) The relationship floor. Query-independent by design: this is the union
  --     member that makes "always return answers" true no matter what was
  --     asked.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE ci.is_person
   ORDER BY ci.tier_weight DESC, ci.warmth DESC NULLS LAST
   LIMIT p_floor)
),
scored AS (
  SELECT
    ci.contact_id,
    c.full_name, c.company, c.title, c.email, c.linkedin_url,
    ci.who, ci.why_them, ci.hook, ci.risk,
    ci.roles, ci.surface_when, ci.network_tier, ci.best_channel,
    ci.reachable_via, ci.confidence, ci.intel_method,
    ci.seniority, ci.country, ci.industry, ci.venture_scores,
    (ci.intel_method = 'rules_v1') AS thin_evidence,

    -- ── Semantic ────────────────────────────────────────────────────────────
    -- Cosine similarity, rescaled onto the band real queries actually occupy.
    --
    -- MEASURED, after the first band was guessed and was wrong. [0.55, 0.95]
    -- assumed raw cosine clusters high; against 2,500 real embeddings it does
    -- not. text-embedding-3-small over short profile text gives:
    --
    --   query                          p50    p99    max
    --   CMO at a bank, AI governance   0.351  0.556  0.657
    --   publisher identity             0.329  0.491  0.596
    --   podcast guest thesis           0.308  0.471  0.525
    --   mindmaker buyer thesis         0.336  0.520  0.565
    --   "purple monkey dishwasher"     0.100  0.199  0.275
    --
    -- So a 0.55 floor sat above the 99th percentile of every real query and the
    -- whole tier emitted ~0. Symptom: recommend mode and "who should I talk to
    -- for the podcast" both came back flagged weak, over correct results.
    --
    -- [0.30, 0.62] is read straight off that table. The floor sits between the
    -- nonsense ceiling (0.275) and the real-query median (~0.33), so noise still
    -- lands at exactly 0 while a genuine top match reaches ~1.0. Re-measure with
    -- public.cosine_probe() if the embedding model or the intel_doc shape
    -- changes; both would move this band.
    CASE
      WHEN q.qvec IS NULL OR ci.embedding IS NULL THEN NULL
      ELSE greatest(0, least(1, (((1 - (ci.embedding <=> q.qvec)) - 0.30) / 0.32)))
    END AS s_semantic,

    -- ── Lexical ─────────────────────────────────────────────────────────────
    -- Normalisation 32 is rank/(rank+1), which bounds ts_rank_cd into [0,1).
    -- Exact tokens (a company name, a surname) are what this tier is for; the
    -- semantic tier cannot be trusted to nail a literal string.
    CASE
      WHEN q.tsq IS NULL THEN NULL
      ELSE ts_rank_cd(ci.intel_tsv, q.tsq)
    END AS s_lexical_raw,

    -- Coverage: what FRACTION of the query's lexemes this row actually
    -- contains. Without it, relative rescaling hands a perfect lexical score to
    -- whoever best matches a single incidental token — "purple monkey
    -- dishwasher" scored one profile at lex 1.000 because it happened to
    -- contain one of those words. Coverage is what separates "matched the
    -- query" from "matched a word in the query".
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
    CASE WHEN jsonb_array_length(coalesce(p_constraints, '[]'::jsonb)) = 0 THEN 0.5
    ELSE coalesce((
      SELECT sum(w * hit) / nullif(sum(w), 0)
      FROM (
        SELECT
          coalesce((el->>'weight')::float8, 1.0) AS w,
          CASE el->>'field'
            WHEN 'seniority'    THEN CASE WHEN ci.seniority = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'country'      THEN CASE WHEN ci.country   = ANY(vals) THEN 1 ELSE 0 END
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
          END AS hit
        FROM jsonb_array_elements(p_constraints) el
        CROSS JOIN LATERAL (
          SELECT array(SELECT jsonb_array_elements_text(el->'values')) AS vals
        ) x
      ) t
    ), 0.5) END AS s_constraint,

    -- ── Relationship value ──────────────────────────────────────────────────
    -- What the relationship is actually worth, independent of the query. A
    -- reciprocated email is proof of a live relationship and is weighted as
    -- such; source_count saturates at 5 so a scraping artefact with 9 sources
    -- cannot outrank someone who has replied.
    (
      0.40 * (ci.tier_weight::numeric / 100)
    + 0.30 * (coalesce(ci.warmth, 0)::numeric / 100)
    + 0.15 * (CASE WHEN ci.reciprocated_email THEN 1 ELSE 0 END)
    + 0.15 * (least(ci.source_count, 5)::numeric / 5)
    ) AS s_relationship,

    -- ── Actionability ───────────────────────────────────────────────────────
    -- Can this be acted on, and do we actually know anything. rules_v1 means
    -- title and company were pattern-matched and no profile was ever read: it
    -- costs 0.20 of a possible 1.00 here and sets thin_evidence for the UI. It
    -- is a penalty and a label, never an exclusion.
    (
      (CASE WHEN coalesce(array_length(ci.reachable_via, 1), 0) > 0 THEN 0.35 ELSE 0 END)
    + (CASE ci.confidence WHEN 'high' THEN 0.30 WHEN 'medium' THEN 0.18 ELSE 0.06 END)
    + (CASE WHEN ci.intel_method = 'rules_v1' THEN 0.05 ELSE 0.25 END)
    + (CASE ci.name_quality WHEN 'full' THEN 0.10 WHEN 'partial' THEN 0.05 ELSE 0 END)
    ) AS s_actionability,

    -- ── Venture multiplier ──────────────────────────────────────────────────
    -- [0.7, 1.3]. A multiplier, not a term, so naming a venture re-ranks the
    -- whole set rather than adding a constant to everyone.
    -- Penalty-only, [0.65, 1.0]. A boosting multiplier (the first version used
    -- [0.7, 1.3]) pushed the top of every recommend query past the 0-100 clamp:
    -- five different people came back at exactly 100.0, so the list had no
    -- ordering precisely where ordering matters most. Capping at 1.0 makes
    -- saturation impossible and says the right thing anyway — a venture score
    -- should suppress the irrelevant, not manufacture relevance.
    CASE
      WHEN p_venture IS NULL THEN 1.0
      ELSE 0.65 + 0.35 * (coalesce((ci.venture_scores->>p_venture)::numeric, 0) / 100)
    END AS venture_multiplier

  FROM public.contact_intelligence ci
  JOIN public.contacts c ON c.id = ci.contact_id
  CROSS JOIN q
  WHERE ci.contact_id IN (SELECT contact_id FROM cand)
    AND ci.is_person                                    -- the one implicit hard filter
    AND (p_tiers    IS NULL OR ci.network_tier = ANY(p_tiers))
    AND (p_roles    IS NULL OR ci.roles && p_roles)
    AND (p_min_conf IS NULL OR
         CASE ci.confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END >=
         CASE p_min_conf    WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
    AND c.status IS DISTINCT FROM 'do_not_contact'
),
rescaled AS (
  -- Lexical rank is rescaled against the strongest match in this result set,
  -- not against a constant. Measured raw ts_rank_cd maxima across real queries
  -- ranged from 0.025 to 0.70 — a 28x spread — so any fixed divisor either
  -- flattens one query or saturates another, and normalisation flag 32
  -- (rank/(rank+1)) left the whole tier contributing under 0.005 of the final
  -- score. Relative scaling is safe here because a query that matches nothing
  -- has a maximum of zero, so nullif leaves every row at 0 rather than
  -- promoting the least-bad row to a perfect lexical hit.
  SELECT scored.*,
    -- Coverage is SQUARED. Linear coverage let a single incidental word match
    -- read as a third of a perfect match: "purple monkey dishwasher" scored
    -- 0.333 relevance because one profile contained one of those words, which
    -- is above any sane weak-query threshold. Squaring separates the cases the
    -- way the evidence actually differs: 1 of 3 words is 0.11, 2 of 3 is 0.44,
    -- 3 of 3 is 1.0.
    CASE WHEN s_lexical_raw IS NULL THEN NULL
         ELSE (s_lexical_raw / nullif(max(s_lexical_raw) OVER (), 0))
              * power(coalesce(lex_coverage, 0), 2) END AS s_lexical
  FROM scored
)
SELECT
  contact_id, full_name, company, title, email, linkedin_url,
  who, why_them, hook, risk, roles, surface_when, network_tier, best_channel,
  reachable_via, confidence, intel_method, seniority, country, industry,
  venture_scores, thin_evidence,
  -- Weights are renormalised over the terms that are actually present, so a
  -- recommend-mode call with no text query is not silently scored out of 0.50.
  -- Cast before rounding: the term arithmetic is float8 and round(float8, int)
  -- does not exist in Postgres, only round(numeric, int).
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
  -- actionability. match_score cannot answer "did we understand the question",
  -- because a well-connected person scores ~60 on relationship and evidence no
  -- matter what was asked — a nonsense query still returns a respectable
  -- match_score. This is the number the API thresholds to decide whether to
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
  'Hybrid semantic + lexical + constraint + relationship scoring over contact_intelligence. Constraints are SOFT (weighted partial credit); the only hard filters are is_person, do_not_contact, and explicit UI filters. Always returns rows.';

-- SECURITY INVOKER + no anon grant: this reads why_them and risk, which are
-- private judgments. Only the service role may execute it, so the only way in
-- is through the access-gated /api/network/* routes.
REVOKE ALL ON FUNCTION public.network_search FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_search TO service_role;


-- ── cosine_probe ────────────────────────────────────────────────────────────
-- The calibration instrument for the band above. Committed rather than left as
-- an untracked production object, because untracked schema is precisely the
-- drift this repo already carries (the core public tables have no CREATE TABLE
-- in version control).
--
-- Samples 2,500 embedded rows rather than scanning all of them: the full scan
-- exceeds the PostgREST statement timeout, and percentiles do not need the
-- population.
DROP FUNCTION IF EXISTS public.cosine_probe(text);
CREATE FUNCTION public.cosine_probe(p_vec text)
RETURNS TABLE(p50 numeric, p90 numeric, p99 numeric, p999 numeric, mx numeric, above55 bigint, n bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $probe$
  WITH samp AS (
    SELECT embedding FROM public.contact_intelligence WHERE embedding IS NOT NULL LIMIT 2500
  ), sims AS (
    SELECT 1 - (embedding <=> p_vec::vector) AS cos FROM samp
  )
  SELECT round(percentile_cont(0.50) WITHIN GROUP (ORDER BY cos)::numeric, 3),
         round(percentile_cont(0.90) WITHIN GROUP (ORDER BY cos)::numeric, 3),
         round(percentile_cont(0.99) WITHIN GROUP (ORDER BY cos)::numeric, 3),
         round(percentile_cont(0.999) WITHIN GROUP (ORDER BY cos)::numeric, 3),
         round(max(cos)::numeric, 3),
         count(*) FILTER (WHERE cos >= 0.55), count(*)
  FROM sims;
$probe$;

REVOKE ALL ON FUNCTION public.cosine_probe(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosine_probe(text) TO service_role;
