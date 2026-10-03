-- A correspondent does not have to have an email address.
--
-- correspondent_stats was keyed on (email_normalized, channel, account), which
-- was right while mail and calendar were the only sources. 3,773 of Krish's
-- 11,755 contacts have a LinkedIn URL and no email at all: a third of the
-- network, invisible to the sync, and exactly the people the LinkedIn message
-- export is there to light up.
--
-- So the key becomes person_key: the email when there is one, otherwise
-- li:<slug>. email_normalized stays and keeps meaning an email address, which
-- is why it becomes nullable rather than being made to hold `li:...` strings.
-- Nothing already stored changes value or identity: person_key is backfilled
-- from email_normalized, so every existing row keeps its key.

-- A LinkedIn URL has many spellings. The slug is the identity.
CREATE OR REPLACE FUNCTION public.linkedin_slug(p_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $body$
  -- substring, not replace: a string that is not a profile URL must come back
  -- NULL, or 'not a url' becomes its own identity and two unrelated people
  -- with unparsed values collide under one key.
  -- lower() wraps the INPUT, not the result: POSIX substring is case
  -- sensitive, so 'LinkedIn.com/in/Foo' matched nothing until it did.
  SELECT nullif(btrim(
    substring(lower(coalesce(p_url, '')) FROM 'linkedin\.com/(?:in|pub)/([^/?#]+)')
  ), '')
$body$;

COMMENT ON FUNCTION public.linkedin_slug(text) IS
  'The identifying part of a LinkedIn profile URL, lowercased: everything after /in/ or /pub/ and before the first slash, query or fragment. Returns NULL for anything that is not a profile URL.';

ALTER TABLE public.correspondent_stats
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS person_key text;

UPDATE public.correspondent_stats SET person_key = email_normalized WHERE person_key IS NULL;

ALTER TABLE public.correspondent_stats ALTER COLUMN person_key SET NOT NULL;
ALTER TABLE public.correspondent_stats ALTER COLUMN email_normalized DROP NOT NULL;

ALTER TABLE public.correspondent_stats DROP CONSTRAINT IF EXISTS correspondent_stats_pkey;
ALTER TABLE public.correspondent_stats
  ADD CONSTRAINT correspondent_stats_pkey PRIMARY KEY (person_key, channel, account);

COMMENT ON COLUMN public.correspondent_stats.person_key IS
  'Who this row is about: the lowercased email where one is known, otherwise li:<linkedin slug>. The same person reached by both appears under both keys until a contact row joins them.';

-- One row per person per channel per account, now keyed by person_key.
CREATE OR REPLACE FUNCTION public.merge_correspondent_stats(p_rows jsonb)
RETURNS integer LANGUAGE sql SET search_path TO 'public', 'pg_temp' AS $body$
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS x(
      email_normalized text, linkedin_url text, channel text, account text, display_name text,
      first_at timestamptz, last_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz,
      inbound_count integer, outbound_count integer, meeting_count integer, last_topic text)
  ), keyed AS (
    SELECT nullif(lower(btrim(email_normalized)), '') AS email_normalized,
           linkedin_url,
           coalesce(
             nullif(lower(btrim(email_normalized)), ''),
             'li:' || public.linkedin_slug(linkedin_url)
           ) AS person_key,
           channel, account, display_name, first_at, last_at, last_inbound_at, last_outbound_at,
           coalesce(inbound_count, 0) AS inbound_count,
           coalesce(outbound_count, 0) AS outbound_count,
           coalesce(meeting_count, 0) AS meeting_count,
           last_topic
    FROM incoming
  ), up AS (
    INSERT INTO public.correspondent_stats AS s (
      person_key, email_normalized, linkedin_url, channel, account, display_name,
      first_at, last_at, last_inbound_at, last_outbound_at,
      inbound_count, outbound_count, meeting_count, last_topic, updated_at)
    SELECT person_key, email_normalized, linkedin_url, channel, account, display_name,
           first_at, last_at, last_inbound_at, last_outbound_at,
           inbound_count, outbound_count, meeting_count, last_topic, now()
    FROM keyed
    WHERE person_key IS NOT NULL AND person_key <> 'li:'
    ON CONFLICT (person_key, channel, account) DO UPDATE SET
      email_normalized = coalesce(s.email_normalized, EXCLUDED.email_normalized),
      linkedin_url = coalesce(EXCLUDED.linkedin_url, s.linkedin_url),
      display_name = coalesce(EXCLUDED.display_name, s.display_name),
      first_at = least(s.first_at, EXCLUDED.first_at),
      last_at = greatest(s.last_at, EXCLUDED.last_at),
      last_inbound_at = greatest(s.last_inbound_at, EXCLUDED.last_inbound_at),
      last_outbound_at = greatest(s.last_outbound_at, EXCLUDED.last_outbound_at),
      inbound_count = s.inbound_count + EXCLUDED.inbound_count,
      outbound_count = s.outbound_count + EXCLUDED.outbound_count,
      meeting_count = s.meeting_count + EXCLUDED.meeting_count,
      last_topic = coalesce(EXCLUDED.last_topic, s.last_topic),
      updated_at = now()
    RETURNING 1)
  SELECT count(*)::int FROM up
$body$;

-- The rollup now finds a contact by email OR by LinkedIn slug. Written out in
-- full rather than patched because the join is what changes, and the previous
-- body is preserved exactly below it: same channel filters, same recency
-- column, same formula, same rounding.
CREATE OR REPLACE FUNCTION public.refresh_relationship_rollup()
RETURNS integer LANGUAGE sql SET search_path TO 'public', 'pg_temp' AS $body$
  WITH matched AS (
    SELECT c.id AS contact_id, s.*
    FROM public.correspondent_stats s
    JOIN public.contacts c
      ON c.email_normalized = s.email_normalized
      OR (s.person_key LIKE 'li:%'
          AND c.linkedin_url IS NOT NULL
          AND public.linkedin_slug(c.linkedin_url) = substr(s.person_key, 4))
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

CREATE INDEX IF NOT EXISTS correspondent_stats_email_idx ON public.correspondent_stats (email_normalized) WHERE email_normalized IS NOT NULL;
