-- The rollup must not scan the whole table to find a LinkedIn correspondent.
--
-- 20261003230000 taught refresh_relationship_rollup() to match a contact by
-- email OR by LinkedIn slug, and that is exactly the shape Postgres cannot
-- index: an OR across two different columns uses neither index. It was fine
-- while no LinkedIn rows existed. The first real import put 1,865 of them in
-- and the rollup died with 'canceling statement due to statement timeout',
-- after the merge had already written every row, so the import reported
-- success for the half that landed and an error for the half that did not.
--
-- The same match as two indexed joins unioned together runs in a moment.

CREATE INDEX IF NOT EXISTS contacts_linkedin_slug_idx
  ON public.contacts (public.linkedin_slug(linkedin_url))
  WHERE linkedin_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS correspondent_stats_person_key_idx
  ON public.correspondent_stats (person_key);

CREATE OR REPLACE FUNCTION public.refresh_relationship_rollup()
RETURNS integer LANGUAGE sql SET search_path TO 'public', 'pg_temp' AS $body$
  WITH matched AS (
    SELECT c.id AS contact_id, s.*
    FROM public.correspondent_stats s
    JOIN public.contacts c ON c.email_normalized = s.email_normalized
    WHERE s.email_normalized IS NOT NULL
    UNION ALL
    SELECT c.id AS contact_id, s.*
    FROM public.correspondent_stats s
    JOIN public.contacts c ON public.linkedin_slug(c.linkedin_url) = substr(s.person_key, 4)
    WHERE s.person_key LIKE 'li:%' AND c.linkedin_url IS NOT NULL
  ), per_person AS (
    SELECT contact_id,
      sum(inbound_count) FILTER (WHERE channel IN ('email','linkedin_message')) AS inbound,
      sum(outbound_count) FILTER (WHERE channel IN ('email','linkedin_message')) AS outbound,
      sum(meeting_count) FILTER (WHERE channel IN ('calendar','meeting_note')) AS meetings,
      max(last_at) AS last_any,
      max(last_at) FILTER (WHERE channel IN ('calendar','meeting_note')) AS last_meeting,
      max(greatest(last_inbound_at, last_outbound_at)) FILTER (WHERE channel = 'email') AS last_email
    FROM matched
    GROUP BY contact_id
  ), scored AS (
    SELECT contact_id, inbound, outbound, meetings, last_email,
      least(100, round(100 * (
          0.40 * exp(-greatest(0, extract(epoch FROM now() - last_any) / 86400) / 260)
        + 0.20 * (CASE WHEN coalesce(inbound,0) > 0 AND coalesce(outbound,0) > 0 THEN 1 ELSE 0 END)
        + 0.20 * least(1, ln(1 + least(coalesce(inbound,0), coalesce(outbound,0))) / ln(40))
        + 0.20 * least(1, ln(1 + coalesce(meetings,0)) / ln(12))
                * coalesce(exp(-greatest(0, extract(epoch FROM now() - last_meeting) / 86400) / 365), 0)
      )))::int AS warmth
    FROM per_person
  ), upd AS (
    UPDATE public.contact_intelligence ci SET
      email_inbound = coalesce(sc.inbound, 0),
      email_outbound = coalesce(sc.outbound, 0),
      email_last = coalesce(sc.last_email::date, ci.email_last),
      reciprocated_email = (coalesce(sc.inbound,0) > 0 AND coalesce(sc.outbound,0) > 0),
      warmth = sc.warmth,
      warmth_source = 'measured'
    FROM scored sc
    WHERE ci.contact_id = sc.contact_id
      AND (ci.warmth IS DISTINCT FROM sc.warmth
        OR ci.warmth_source IS DISTINCT FROM 'measured'
        OR ci.email_inbound IS DISTINCT FROM coalesce(sc.inbound,0)
        OR ci.email_outbound IS DISTINCT FROM coalesce(sc.outbound,0)
        OR ci.reciprocated_email IS DISTINCT FROM (coalesce(sc.inbound,0) > 0 AND coalesce(sc.outbound,0) > 0))
    RETURNING 1)
  SELECT count(*)::int FROM upd
$body$;
