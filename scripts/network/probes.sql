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

\echo '=== P7 · recommend mode: Mindmaker buyers (must NOT all saturate at 100) ==='
SELECT round(match_score,1) score, full_name, left(coalesce(title,''),26) title,
       (venture_scores->>'mindmaker') mm, network_tier
FROM network_search(NULL, NULL, 'mindmaker',
  '[{"field":"roles","values":["buyer"],"weight":1.0}]'::jsonb, NULL,NULL,NULL, 5);

\echo '=== P7b · ASSERTION: recommend results must be distinctly ranked ==='
-- The property that matters is no pile-up at the ceiling, not total
-- distinctness: two people with identical inputs SHOULD tie. The first version
-- asserted near-total distinctness and failed on legitimate ties.
SELECT count(*) FILTER (WHERE match_score >= 99.9) AS at_ceiling,
       count(DISTINCT match_score) AS distinct_scores, count(*) AS rows,
       CASE WHEN count(*) FILTER (WHERE match_score >= 99.9) <= 1 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM network_search(NULL, NULL, 'mindmaker',
  '[{"field":"roles","values":["buyer"],"weight":1.0}]'::jsonb, NULL,NULL,NULL, 10);
