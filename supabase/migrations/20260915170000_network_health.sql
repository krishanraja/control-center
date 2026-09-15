-- network_health(): what the network actually holds, per tier, in one read.
--
-- Written as an RPC rather than assembled in the API route because it is seven
-- aggregates over 10,700 rows and doing it client-side means seven round trips
-- and a number that is internally inconsistent by the time it renders.
--
-- The columns it reports on all arrived in 20260915140000 (see ADR-022). Before
-- that, "how complete is this record" had no answer that did not involve
-- reading a jsonb blob per person.
--
-- Cost is reported in UNITS, not dollars: this function knows how many people
-- need which provider, and the price of a provider is not a database fact. The
-- route multiplies.
CREATE OR REPLACE FUNCTION public.network_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH base AS (
  SELECT
    coalesce(c.consent_tier, 'unset')            AS tier,
    (c.linkedin_url IS NOT NULL)                 AS has_linkedin,
    (c.email IS NOT NULL)                        AS has_email,
    (ci.contact_id IS NULL)                      AS invisible,
    coalesce(ci.completeness, 0)                 AS completeness,
    coalesce(ci.embed_stale, false)              AS embed_stale,
    ci.enriched_at
  FROM public.contacts c
  LEFT JOIN public.contact_intelligence ci ON ci.contact_id = c.id
  WHERE c.status IS DISTINCT FROM 'do_not_contact'
),
per_tier AS (
  SELECT
    tier,
    count(*)                                                   AS people,
    count(*) FILTER (WHERE has_linkedin)                       AS linkedin,
    count(*) FILTER (WHERE has_email)                          AS email,
    count(*) FILTER (WHERE invisible)                          AS invisible,
    round(avg(completeness))::int                              AS avg_completeness,
    count(*) FILTER (WHERE completeness < 50)                  AS weak,
    count(*) FILTER (WHERE completeness >= 75)                 AS strong,
    count(*) FILTER (WHERE embed_stale)                        AS stale_embedding,
    -- Work the two providers can each do, counted separately because they are
    -- not substitutes. Apify needs a URL to scrape and cannot discover one;
    -- Coresignal searches by name and is the only path for someone with no URL,
    -- at roughly 200x the price. Anything enriched inside a year is left alone.
    count(*) FILTER (
      WHERE has_linkedin AND NOT invisible
        AND (enriched_at IS NULL OR enriched_at < now() - interval '12 months')
    )                                                          AS apify_due,
    count(*) FILTER (
      WHERE NOT has_linkedin AND NOT invisible
        AND (enriched_at IS NULL OR enriched_at < now() - interval '12 months')
    )                                                          AS coresignal_due
  FROM base GROUP BY tier
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'total', (SELECT count(*) FROM base),
  'invisible', (SELECT count(*) FROM base WHERE invisible),
  'stale_embedding', (SELECT count(*) FROM base WHERE embed_stale),
  'tiers', coalesce(jsonb_agg(to_jsonb(per_tier) ORDER BY
    -- Ordered by how much Krish cares, not alphabetically and not by size:
    -- this readout exists to decide where the next dollar goes.
    CASE tier WHEN 'warm' THEN 1 WHEN 'permissioned' THEN 2
              WHEN 'cold_engaged' THEN 3 WHEN 'cold_scraped' THEN 4 ELSE 5 END),
    '[]'::jsonb)
) FROM per_tier;
$$;

COMMENT ON FUNCTION public.network_health IS
  'Per-consent-tier coverage, completeness and enrichment backlog for the Network Health panel. Reports provider work in units (apify_due, coresignal_due); pricing lives in the API route, not here.';

REVOKE ALL ON FUNCTION public.network_health FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_health TO service_role;
