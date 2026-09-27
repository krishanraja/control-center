-- network_search probe suite.
--
-- Run against any database that has the two network migrations applied:
--   psql "$DATABASE_URL" -f scripts/network/probes.sql
--
-- These are the assertions the scorer has to keep passing. Each one exists
-- because it caught something:
--
--   P1  ranking works at all, and the venture/tier signals do not drown the
--       query signal
--   P2  soft constraints give PARTIAL credit — a person matching 3 of 4 must
--       still rank, which is the whole "scoring not binary" requirement
--   P3  array-valued constraints (roles) work
--   P4  a ridiculous query STILL RETURNS PEOPLE, with query_relevance at 0 to
--       say so honestly. This is the one that must never regress.
--   P5  query_relevance discriminates. It exists because match_score cannot:
--       a well-connected person scores ~38 on relationship and evidence alone,
--       so a nonsense query still produces a respectable match_score.
--   P6  monotonicity — all else equal, more relationship must score higher.
--   P7  a HARD country filter returns only that country, and reaches deep into
--       it rather than into whatever survived a truncated candidate pool
--   P8  a SOFT geo constraint prefers without excluding. This one caught a real
--       regression: with two outcomes instead of three it returned 200 Britons
--       out of 200 rows and buried all 151 tier-1 contacts whose location was
--       never recorded, which is a hard filter wearing a soft label.
--   P9  unrecognised geography degrades to no filter, never to zero rows.
--   P10 one scale, one vocabulary (20260927160000). tier_weight is a function
--       of network_tier, seniority and best_channel are in the planner's
--       words, and a reciprocated email is tier 1. Every count must be 0. The
--       enrichment job broke all three at once and nothing noticed for twelve
--       days, because nothing asserted them.
--   P11 the question decides (20260927160000). A person with no query
--       relevance must not outrank one who answers the question, however warm.
--       `beaten_by_irrelevant` must be 0.
--   P12 what was bought is searchable. Enriched people's career and skills
--       reach the retrieval text, and placeholders never do.
--
--   P5's note above is historical: relationship now scales the match rather
--   than adding to it, so a nonsense query no longer earns ~38. query_relevance
--   is still the right thing to threshold, because soft constraints can score.

\timing on
\pset pager off

\echo '=== P1 · CMOs at banks who care about AI governance ==='
SELECT round(match_score,1) score, query_relevance qrel, full_name,
       left(coalesce(title,''),28) title, left(coalesce(company,''),18) company, network_tier
FROM network_search(NULL, 'chief marketing officer bank AI governance', NULL,
  '[{"field":"title","values":["chief marketing","CMO"],"weight":1.0},
    {"field":"industry","values":["bank","financial"],"weight":0.7}]'::jsonb,
  NULL,NULL,NULL, 5);

\echo '=== P2 · partial credit: 1 of 2 constraints must still rank ==='
SELECT round(match_score,1) score, s_constraint, full_name, country
FROM network_search(NULL, 'identity privacy publisher', NULL,
  '[{"field":"country","values":["Australia"],"weight":1.0},
    {"field":"seniority","values":["founder_cxo"],"weight":1.0}]'::jsonb,
  NULL,NULL,NULL, 5);

\echo '=== P3 · introducer to a media agency ==='
SELECT round(match_score,1) score, full_name, left(coalesce(company,''),20) company, roles, network_tier
FROM network_search(NULL, 'media agency introduction', NULL,
  '[{"field":"roles","values":["introducer"],"weight":1.0},
    {"field":"industry","values":["media agency"],"weight":0.8}]'::jsonb,
  NULL,NULL,NULL, 4);

\echo '=== P4 · RIDICULOUS QUERY — must return rows, qrel must be 0 ==='
SELECT round(match_score,1) score, query_relevance qrel, full_name, network_tier
FROM network_search(NULL, 'purple monkey dishwasher', NULL, '[]'::jsonb, NULL,NULL,NULL, 4);

\echo '=== P4b · ASSERTION: P4 returned rows AND scored zero relevance ==='
SELECT
  count(*) AS rows_returned,
  max(query_relevance) AS max_qrel,
  CASE WHEN count(*) >= 4 AND coalesce(max(query_relevance),0) < 0.05
       THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM network_search(NULL, 'purple monkey dishwasher', NULL, '[]'::jsonb, NULL,NULL,NULL, 20);

\echo '=== P5 · ASSERTION: a real query must clear the weak threshold ==='
SELECT
  max(query_relevance) AS max_qrel,
  CASE WHEN coalesce(max(query_relevance),0) >= 0.10 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM network_search(NULL, 'chief marketing officer bank AI governance', NULL, '[]'::jsonb, NULL,NULL,NULL, 20);

\echo '=== P6 · ASSERTION: relationship monotonicity ==='
-- Same query, no constraints. A tier-1 reciprocated contact must not be
-- out-ranked by a cold lead whose query signal is no better.
-- Each tier is queried in isolation, because an unfiltered top-200 contains no
-- cold leads at all and the comparison would be vacuously true.
WITH t1 AS (SELECT avg(match_score) a FROM network_search(NULL,NULL,NULL,'[]'::jsonb, ARRAY['1_reciprocated'],NULL,NULL,50)),
     t5 AS (SELECT avg(match_score) a FROM network_search(NULL,NULL,NULL,'[]'::jsonb, ARRAY['5_cold_lead'],NULL,NULL,50))
SELECT round(t1.a,1) tier1_avg, round(t5.a,1) tier5_avg,
       CASE WHEN t1.a > t5.a THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM t1, t5;

\echo '=== P7 · recommend mode: Mindmake buyers (must NOT all saturate at 100) ==='
SELECT round(match_score,1) score, full_name, left(coalesce(title,''),26) title,
       (venture_scores->>'mindmake') mm, network_tier
FROM network_search(NULL, NULL, 'mindmake',
  '[{"field":"roles","values":["buyer"],"weight":1.0}]'::jsonb, NULL,NULL,NULL, 5);

\echo '=== P7b · ASSERTION: recommend results must be distinctly ranked ==='
-- The property that matters is no pile-up at the ceiling, not total
-- distinctness: two people with identical inputs SHOULD tie. The first version
-- asserted near-total distinctness and failed on legitimate ties.
SELECT count(*) FILTER (WHERE match_score >= 99.9) AS at_ceiling,
       count(DISTINCT match_score) AS distinct_scores, count(*) AS rows,
       CASE WHEN count(*) FILTER (WHERE match_score >= 99.9) <= 1 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM network_search(NULL, NULL, 'mindmake',
  '[{"field":"roles","values":["buyer"],"weight":1.0}]'::jsonb, NULL,NULL,NULL, 10);


-- ── P7. Hard country filter: exclusive, and deep ───────────────────────────
-- `all_in_country` must be true. `returned` should approach `in_corpus` (or the
-- limit), NOT the handful that would survive filtering an already-truncated
-- 400-row pool: that gap is the whole reason p_countries pushes down into every
-- recall path instead of being applied to their output.
SELECT 'P7' AS probe,
       count(*) AS returned,
       bool_and(geo_code = 'GB') AS all_in_country,
       (SELECT count(*) FROM public.contact_intelligence
         WHERE is_person AND geo_code = 'GB') AS in_corpus
FROM public.network_search(
  p_keywords := 'marketing', p_countries := ARRAY['GB'], p_limit := 200);


-- ── P8. Soft geo prefers, it does not exclude ──────────────────────────────
-- THREE constraint outcomes, not two:
--   in the named country      1.0
--   location never recorded   0.5   <- the neutral, same as "no constraint"
--   known to be elsewhere     0.0
--
-- `unknown_location` must be > 0. When it was 0 the soft constraint was a hard
-- filter: 57% of the corpus, and 151 of the 164 people who have actually
-- replied, have no resolved location, and scoring them identically to someone
-- known to be in another country deleted them from every geographic question.
SELECT 'P8' AS probe,
       count(*) FILTER (WHERE geo_code = 'GB')  AS in_country,
       count(*) FILTER (WHERE geo_code IS NULL) AS unknown_location,
       round(avg(s_constraint) FILTER (WHERE geo_code = 'GB'), 2)  AS score_in_country,
       round(avg(s_constraint) FILTER (WHERE geo_code IS NULL), 2) AS score_unknown,
       round(avg(s_constraint) FILTER (WHERE geo_code IS NOT NULL AND geo_code <> 'GB'), 2) AS score_elsewhere
FROM public.network_search(
  p_keywords := 'marketing',
  p_constraints := '[{"field":"geo","values":["London"],"weight":1.0}]'::jsonb,
  p_limit := 200);


-- ── P9. Unrecognised geography degrades, never empties ─────────────────────
-- Same contract as every other unparseable input here: a misunderstanding costs
-- ranking, never answers. `rows` must be > 0 and `canon_is_null` must be true.
SELECT 'P9' AS probe,
       (SELECT count(*) FROM public.network_search(
          p_keywords := 'marketing', p_countries := ARRAY['Narnia'], p_limit := 20)) AS rows,
       public.network_geo_canon('Narnia') IS NULL AS canon_is_null,
       -- And the canonicaliser's own disambiguation: a bare code is a country,
       -- a city inside a location string wins over a same-looking state code.
       public.network_geo_canon('CA') AS bare_ca,
       public.network_geo_canon('San Francisco, CA') AS sf_ca;


-- ── P10. One scale, one vocabulary ─────────────────────────────────────────
SELECT 'P10' AS probe,
       count(*) FILTER (WHERE tier_weight IS DISTINCT FROM public.tier_weight_for(network_tier)) AS tier_weight_off_scale,
       count(*) FILTER (WHERE seniority IS NOT NULL
                          AND seniority NOT IN ('founder_cxo','vp_director','manager_senior','ic_unknown')) AS seniority_off_vocab,
       count(*) FILTER (WHERE best_channel IN ('linkedin','instagram')) AS channel_off_vocab,
       count(*) FILTER (WHERE reciprocated_email AND network_tier <> '1_reciprocated') AS reciprocated_demoted
FROM public.contact_intelligence;


-- ── P11. The question decides ──────────────────────────────────────────────
-- Keywords only, so it runs without an embedding. Among the top 25, count the
-- people with query_relevance under 0.05 who sit ABOVE someone at 0.5 or more
-- with no constraints in play. Before 20260927160000 a warm contact who matched
-- nothing scored ~38 and did exactly this.
WITH r AS (
  SELECT row_number() OVER () AS rk, query_relevance AS rel
  FROM public.network_search(p_keywords := 'retail media', p_limit := 25)
)
SELECT 'P11' AS probe,
       count(*) FILTER (WHERE a.rel < 0.05 AND EXISTS (
         SELECT 1 FROM r b WHERE b.rk > a.rk AND b.rel >= 0.5)) AS beaten_by_irrelevant
FROM r a;


-- ── P12. What was bought is searchable ─────────────────────────────────────
-- `enriched_with_career` should be most of `enriched`; `placeholder_indexed`
-- must be 0; `past_employer_hits` must be > 0 (an ex-Google person found on the
-- career line, not a current employee).
SELECT 'P12' AS probe,
       count(*) FILTER (WHERE enriched_at IS NOT NULL) AS enriched,
       count(*) FILTER (WHERE enriched_at IS NOT NULL AND intel_doc LIKE '%Career: %') AS enriched_with_career,
       count(*) FILTER (WHERE intel_doc ~* '(no role data captured|insufficient profile data|no hook available)') AS placeholder_indexed,
       count(*) FILTER (WHERE intel_tsv @@ to_tsquery('english', 'google')
                          AND coalesce(current_company, '') !~* 'google'
                          AND intel_doc ~* 'Career: [^·]*google') AS past_employer_hits
FROM public.contact_intelligence;
