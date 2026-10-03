-- How close Krish is to each person, from his own mail, calendars and meeting
-- notes, kept current instead of imported once.
--
-- Krish, 2026-10-03: "my biggest weak point is asking for help from my
-- network ... I'm willing to invest in making this feature 11 out of 10."
--
-- Measured that day: contact_intelligence.email_inbound / email_outbound /
-- email_last / reciprocated_email / warmth were written ONCE, from a CSV built
-- outside this repo; the newest email they know about is 2026-08-07. Nothing
-- read a mailbox, a calendar or meeting notes on a schedule, and a job change,
-- the best moment to get back in touch, was invisible because current_title
-- and current_company are overwritten by every enrichment and never compared.
--
-- Three accounts feed this: krish@mindmake.co (Workspace, read through the
-- existing service account by domain-wide delegation), hello@krishraja.com (a
-- separate account) and krishanraja@gmail.com (consumer), the last two through
-- a one-time Google sign-in. Wispr Flow meeting notes arrive through a weekly
-- scheduled session, since Wispr has no API.
--
-- What is stored: counts and dates per counterpart address. Never a message
-- body, never a subject line. That is enforced in api/_relationshipSync.ts
-- (format=metadata, three headers) and is what keeps these tables safe to read
-- anywhere a contact is shown.
--
-- relationship_signals already exists as an empty event log
-- (signal_type/payload) and is left alone; this is a summary, keyed by address
-- so people Krish corresponds with who are not yet in the network are kept
-- rather than discarded.

-- ── Connected Google accounts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_accounts (
  email           text        PRIMARY KEY,
  -- 'delegated': minted by the service account impersonating this user.
  -- 'oauth': a refresh token from a one-time sign-in.
  auth_kind       text        NOT NULL CHECK (auth_kind IN ('delegated', 'oauth')),
  -- OAuth only. Service role only, like app_secrets.
  refresh_token   text,
  scopes          text[],
  connected_at    timestamptz NOT NULL DEFAULT now(),
  -- Incremental cursors: the newest message / event already counted.
  mail_cursor     timestamptz,
  calendar_cursor timestamptz,
  last_sync_at    timestamptz,
  last_error      text
);
ALTER TABLE public.google_accounts ENABLE ROW LEVEL SECURITY;

-- ── Per-address, per-channel, per-account counts ──────────────────────────
CREATE TABLE IF NOT EXISTS public.correspondent_stats (
  email_normalized  text        NOT NULL,
  -- email | calendar | meeting_note | linkedin_message | linkedin_engagement
  channel           text        NOT NULL,
  account           text        NOT NULL,
  display_name      text,
  first_at          timestamptz,
  last_at           timestamptz,
  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,
  inbound_count     integer     NOT NULL DEFAULT 0,
  outbound_count    integer     NOT NULL DEFAULT 0,
  meeting_count     integer     NOT NULL DEFAULT 0,
  -- Meeting notes only: one line on what was discussed last.
  last_topic        text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_normalized, channel, account),
  CONSTRAINT correspondent_stats_channel_chk CHECK (channel IN
    ('email', 'calendar', 'meeting_note', 'linkedin_message', 'linkedin_engagement'))
);
CREATE INDEX IF NOT EXISTS correspondent_stats_last_idx ON public.correspondent_stats (last_at DESC);
ALTER TABLE public.correspondent_stats ENABLE ROW LEVEL SECURITY;

-- Merge one batch of counts into the summary. Additive on counts, max on
-- dates, so a sync can run in any number of slices.
CREATE OR REPLACE FUNCTION public.merge_correspondent_stats(p_rows jsonb)
RETURNS integer
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS x(
      email_normalized text, channel text, account text, display_name text,
      first_at timestamptz, last_at timestamptz,
      last_inbound_at timestamptz, last_outbound_at timestamptz,
      inbound_count integer, outbound_count integer, meeting_count integer,
      last_topic text)
  ), up AS (
    INSERT INTO public.correspondent_stats AS s (
      email_normalized, channel, account, display_name, first_at, last_at,
      last_inbound_at, last_outbound_at, inbound_count, outbound_count,
      meeting_count, last_topic, updated_at)
    SELECT lower(btrim(email_normalized)), channel, account, display_name,
           first_at, last_at, last_inbound_at, last_outbound_at,
           coalesce(inbound_count, 0), coalesce(outbound_count, 0),
           coalesce(meeting_count, 0), last_topic, now()
    FROM incoming
    WHERE email_normalized IS NOT NULL AND btrim(email_normalized) <> ''
    ON CONFLICT (email_normalized, channel, account) DO UPDATE SET
      display_name     = coalesce(EXCLUDED.display_name, s.display_name),
      first_at         = least(s.first_at, EXCLUDED.first_at),
      last_at          = greatest(s.last_at, EXCLUDED.last_at),
      last_inbound_at  = greatest(s.last_inbound_at, EXCLUDED.last_inbound_at),
      last_outbound_at = greatest(s.last_outbound_at, EXCLUDED.last_outbound_at),
      inbound_count    = s.inbound_count + EXCLUDED.inbound_count,
      outbound_count   = s.outbound_count + EXCLUDED.outbound_count,
      meeting_count    = s.meeting_count + EXCLUDED.meeting_count,
      last_topic       = CASE WHEN EXCLUDED.last_at >= coalesce(s.last_at, '-infinity')
                              THEN coalesce(EXCLUDED.last_topic, s.last_topic)
                              ELSE s.last_topic END,
      updated_at       = now()
    RETURNING 1
  )
  SELECT count(*)::int FROM up
$fn$;

-- ── Roll the summary up onto the person ───────────────────────────────────
-- Warmth, 0-100, from what actually happened rather than an import:
--   recency      when they last heard from Krish or he from them, halving
--                about every six months
--   reciprocity  both directions, ever
--   depth        how much two-way traffic, log-scaled
--   meetings     met on a calendar or in a meeting note, log-scaled and
--                weighted by how recently
-- Only people with at least one signal are touched; everyone else keeps the
-- imported warmth, which is a guess but better than a zero.
CREATE OR REPLACE FUNCTION public.refresh_relationship_rollup()
RETURNS integer
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH per_person AS (
    SELECT c.id AS contact_id,
           sum(s.inbound_count)  FILTER (WHERE s.channel IN ('email', 'linkedin_message')) AS inbound,
           sum(s.outbound_count) FILTER (WHERE s.channel IN ('email', 'linkedin_message')) AS outbound,
           sum(s.meeting_count)  FILTER (WHERE s.channel IN ('calendar', 'meeting_note')) AS meetings,
           max(s.last_at) AS last_any,
           max(s.last_at) FILTER (WHERE s.channel IN ('calendar', 'meeting_note')) AS last_meeting,
           max(greatest(s.last_inbound_at, s.last_outbound_at))
             FILTER (WHERE s.channel = 'email') AS last_email
    FROM public.correspondent_stats s
    JOIN public.contacts c ON c.email_normalized = s.email_normalized
    GROUP BY c.id
  ), scored AS (
    SELECT contact_id, inbound, outbound, meetings, last_email,
      least(100, round(100 * (
          0.40 * exp(-greatest(0, extract(epoch FROM now() - last_any) / 86400) / 260)
        + 0.20 * (CASE WHEN coalesce(inbound, 0) > 0 AND coalesce(outbound, 0) > 0 THEN 1 ELSE 0 END)
        + 0.20 * least(1, ln(1 + least(coalesce(inbound, 0), coalesce(outbound, 0))) / ln(40))
        + 0.20 * least(1, ln(1 + coalesce(meetings, 0)) / ln(12))
              * coalesce(exp(-greatest(0, extract(epoch FROM now() - last_meeting) / 86400) / 365), 0)
      )))::int AS warmth
    FROM per_person
  ), upd AS (
    UPDATE public.contact_intelligence ci SET
      email_inbound      = coalesce(sc.inbound, 0),
      email_outbound     = coalesce(sc.outbound, 0),
      email_last         = coalesce(sc.last_email::date, ci.email_last),
      -- Same meaning the import gave it: they have written to Krish and he to
      -- them. The trigger pins 1_reciprocated from it.
      reciprocated_email = (coalesce(sc.inbound, 0) > 0 AND coalesce(sc.outbound, 0) > 0),
      warmth             = sc.warmth
    FROM scored sc
    WHERE ci.contact_id = sc.contact_id
      AND (ci.warmth IS DISTINCT FROM sc.warmth
        OR ci.email_inbound IS DISTINCT FROM coalesce(sc.inbound, 0)
        OR ci.email_outbound IS DISTINCT FROM coalesce(sc.outbound, 0)
        OR ci.reciprocated_email IS DISTINCT FROM (coalesce(sc.inbound, 0) > 0 AND coalesce(sc.outbound, 0) > 0))
    RETURNING 1
  )
  SELECT count(*)::int FROM upd
$fn$;

-- ── Job changes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_role_history (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id   uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title        text,
  company      text,
  -- When a refresh first showed something else.
  replaced_at  timestamptz NOT NULL DEFAULT now(),
  source       text
);
CREATE INDEX IF NOT EXISTS contact_role_history_contact_idx
  ON public.contact_role_history (contact_id, replaced_at DESC);
ALTER TABLE public.contact_role_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_intelligence ADD COLUMN IF NOT EXISTS role_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.ci_record_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A real move between two known roles only. A first enrichment filling a
  -- blank is not a job change, and neither is a change of capitalisation.
  IF OLD.current_company IS NOT NULL AND NEW.current_company IS NOT NULL
     AND lower(btrim(OLD.current_company)) IS DISTINCT FROM lower(btrim(NEW.current_company))
  THEN
    INSERT INTO public.contact_role_history (contact_id, title, company, source)
    VALUES (OLD.contact_id, OLD.current_title, OLD.current_company, NEW.enriched_source);
    NEW.role_changed_at := now();
  ELSIF OLD.current_title IS NOT NULL AND NEW.current_title IS NOT NULL
     AND lower(btrim(OLD.current_title)) IS DISTINCT FROM lower(btrim(NEW.current_title))
     AND lower(btrim(coalesce(OLD.current_company, ''))) = lower(btrim(coalesce(NEW.current_company, '')))
  THEN
    -- A new title at the same company: a promotion or an internal move.
    INSERT INTO public.contact_role_history (contact_id, title, company, source)
    VALUES (OLD.contact_id, OLD.current_title, OLD.current_company, NEW.enriched_source);
    NEW.role_changed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ci_role_change_trg ON public.contact_intelligence;
CREATE TRIGGER ci_role_change_trg
  BEFORE UPDATE OF current_title, current_company ON public.contact_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.ci_record_role_change();
