-- Two corrections to what the health panel is allowed to claim.
--
-- 1. The enrichment backlog excluded the people who need it most. apify_due and
--    coresignal_due both required NOT invisible, so the 119 contacts with no
--    contact_intelligence row at all — never enriched, unreachable by any
--    search — were counted in neither backlog and in no cost quote. The panel
--    said what enrichment was outstanding and left out the worst of it.
--
-- 2. Intent was tracked and never reported. The pipeline reads posts, scores a
--    stance and decays it, and the panel that exists to say what the network
--    holds said nothing about how much of it has been read or how much is live.
--
-- Prices are no longer here OR in the route as a constant: api/network/health.ts
-- reads them from meter_daily through api/_apifyCost.ts. This function reports
-- UNITS of outstanding work and nothing about money.
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
    ci.enriched_at,
    ci.posts_checked_at,
    public.intent_live_score(ci.intent_score, ci.last_post_at) AS live_intent,
    ci.intent_stance
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
    -- Posts read, and how many of those are still saying something. Both are
    -- needed: "nobody is signalling" and "nobody has been read" look identical
    -- on a single number and mean opposite things.
    count(*) FILTER (WHERE posts_checked_at IS NOT NULL)       AS posts_read,
    count(*) FILTER (WHERE coalesce(live_intent, 0) > 0
                       AND intent_stance IS NOT NULL
                       AND intent_stance <> 'selling')         AS signalling,
    count(*) FILTER (WHERE coalesce(live_intent, 0) > 0
                       AND intent_stance IN ('asking', 'struggling', 'hiring', 'evaluating')) AS hot_intent,
    -- Work the two providers can each do, counted separately because they are
    -- not substitutes. Apify needs a URL to scrape and cannot discover one;
    -- Coresignal searches by name and is the only path for someone with no URL,
    -- at roughly 200x the price. Anything enriched inside a year is left alone.
    --
    -- The invisible are INCLUDED: a contact with no intelligence row is the most
    -- enrichment-due person in the network, not the least, and excluding them
    -- kept 119 people out of every backlog and every quote.
    count(*) FILTER (
      WHERE has_linkedin
        AND (enriched_at IS NULL OR enriched_at < now() - interval '12 months')
    )                                                          AS apify_due,
    count(*) FILTER (
      WHERE NOT has_linkedin
        AND (enriched_at IS NULL OR enriched_at < now() - interval '12 months')
    )                                                          AS coresignal_due,
    -- Posts worth re-reading: intent decays to nothing at the cliff, so a read
    -- older than that is not a signal, it is a memory.
    count(*) FILTER (
      WHERE has_linkedin
        AND (posts_checked_at IS NULL OR posts_checked_at < now() - interval '90 days')
    )                                                          AS posts_due
  FROM base GROUP BY tier
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'total', (SELECT count(*) FROM base),
  'invisible', (SELECT count(*) FROM base WHERE invisible),
  'stale_embedding', (SELECT count(*) FROM base WHERE embed_stale),
  'posts_read', (SELECT count(*) FROM base WHERE posts_checked_at IS NOT NULL),
  'signalling', (SELECT count(*) FROM base
                  WHERE coalesce(live_intent, 0) > 0 AND intent_stance IS NOT NULL
                    AND intent_stance <> 'selling'),
  'tiers', coalesce(jsonb_agg(to_jsonb(per_tier) ORDER BY
    -- Ordered by how much Krish cares, not alphabetically and not by size:
    -- this readout exists to decide where the next dollar goes.
    CASE tier WHEN 'warm' THEN 1 WHEN 'permissioned' THEN 2
              WHEN 'cold_engaged' THEN 3 WHEN 'cold_scraped' THEN 4 ELSE 5 END),
    '[]'::jsonb)
) FROM per_tier;
$$;

COMMENT ON FUNCTION public.network_health IS
  'Per-consent-tier coverage, completeness, intent and enrichment backlog for the Network Health panel. Reports provider work in units (apify_due, coresignal_due, posts_due); pricing comes from meter_daily via api/_apifyCost.ts, never from a constant.';

REVOKE ALL ON FUNCTION public.network_health FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_health TO service_role;
