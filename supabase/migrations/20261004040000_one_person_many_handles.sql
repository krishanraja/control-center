-- One person, many handles, and a merge that loses nothing.
--
-- Krish, 2026-10-04: "merge the duplicates", and "it's imperative that this is
-- only additive". This migration is the machinery for both.
--
-- WHY A CONTACT NEEDS MORE THAN ONE HANDLE. contacts holds one email (a unique
-- index) and one LinkedIn URL. The relationship rollup finds a person's mail
-- and LinkedIn messages through exactly those two values. So merging two rows
-- for the same person would keep one email and silently drop the other's mail
-- history out of warmth: one measured duplicate pair carries 17 in, 2 out and
-- 26 meetings on its second address. contact_identities holds every email and
-- LinkedIn slug a person has ever had, and the rollup now reads through it, so
-- a merged person keeps every thread they ever had.
--
-- It also holds the social handles the Meta export brings (facebook,
-- instagram, phone_book). Those are names, not unique keys, so only email and
-- li_slug are unique across people.
--
-- WHY A MERGE CAN BE AUTOMATIC AT ALL. docs/NETWORK_STRATEGY.md said "a merge
-- tool, never an automatic one: two people with the same name is a coin
-- toss". That stays true. merge_contacts() (20261004060000) is the tool; what
-- calls it decides.
-- Only two rows sharing an identity key (the same LinkedIn profile) merge
-- without Krish. Everything resting on a name goes to him as a suggestion.
--
-- WHAT A MERGE KEEPS. Everything:
--   * the loser's whole row and intelligence, in contact_merges.snapshot
--   * every email and slug, moved to the survivor as identities
--   * every reference to the loser, repointed (opportunities, guests, pilot
--     deals, signals, role history, bridge candidates, network_contacts,
--     strategist reads, suggestions, feedback)
--   * the survivor's own values, which are never overwritten. A blank on the
--     survivor is filled from the loser; a conflict keeps the survivor's and
--     the loser's stays in the snapshot. contact_merges.filled names exactly
--     which fields came across.
-- Two profiles are never deep-merged: a wrong-person career grafted onto the
-- right person is how a namesake's job becomes a "new in seat" signal.
--
-- Krish's own rows are marked, not merged: status do_not_contact with
-- status_reason 'self', so no search, play or ask ever proposes him to himself.

BEGIN;

-- Writers wait for the few seconds this takes, so no contact written between
-- the backfill and the trigger can slip through without its handles.
LOCK TABLE public.contacts IN SHARE ROW EXCLUSIVE MODE;

-- ── Identities ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_identities (
  id bigserial PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email', 'li_slug', 'facebook', 'instagram', 'phone_book')),
  value text NOT NULL CHECK (value <> '' AND value = lower(btrim(value))),
  -- Where the handle was read from: 'contacts.email', 'meta_export', ...
  source text NOT NULL,
  -- How it came to be on THIS contact: 'record' (it is on the row), 'merge',
  -- or the import's match rule ('meta_slug', 'meta_email', 'meta_source',
  -- 'meta_name', 'meta_new'). A name-only link is never 'record'.
  basis text NOT NULL DEFAULT 'record',
  -- False where the link rests on a name alone. Readers say so.
  verified boolean NOT NULL DEFAULT true,
  -- Set when a merge moved the handle here from another contact.
  merged_from uuid,
  -- Set when the row's own email or LinkedIn was replaced by an edit. Kept,
  -- because nothing here is thrown away, but no longer read as the person's:
  -- a corrected address must stop feeding their warmth and must be free for
  -- whoever it really belongs to.
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- An email address or a LinkedIn profile is one person. A Facebook name is not.
CREATE UNIQUE INDEX IF NOT EXISTS contact_identities_handle_uidx
  ON public.contact_identities (kind, value) WHERE kind IN ('email', 'li_slug') AND retired_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contact_identities_once_per_contact_uidx
  ON public.contact_identities (contact_id, kind, value);
CREATE INDEX IF NOT EXISTS contact_identities_lookup_idx
  ON public.contact_identities (kind, value);

COMMENT ON TABLE public.contact_identities IS
  'Every handle a contact is known by. email and li_slug are unique across people and are how correspondent_stats finds a person; facebook, instagram and phone_book are the names the Meta export uses and are not unique. contacts.email and contacts.linkedin_url stay the primary handles; this is the full set.';

-- Service role only. contacts is anon-readable today; nothing new joins it.
ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_identities' AND policyname = 'contact_identities_service_all') THEN
    CREATE POLICY contact_identities_service_all ON public.contact_identities
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Backfill from the row itself. Where two rows hold the same LinkedIn profile
-- today (40 groups), the older one takes the identity; merging them below
-- gives the survivor both rows' handles either way.
INSERT INTO public.contact_identities (contact_id, kind, value, source)
SELECT id, 'email', email_normalized, 'contacts.email'
FROM public.contacts
WHERE email_normalized IS NOT NULL AND email_normalized <> ''
ORDER BY created_at, id
ON CONFLICT DO NOTHING;

INSERT INTO public.contact_identities (contact_id, kind, value, source)
SELECT id, 'li_slug', s, 'contacts.linkedin_url'
FROM (SELECT id, created_at, public.linkedin_slug(linkedin_url) AS s
      FROM public.contacts WHERE linkedin_url IS NOT NULL) x
WHERE s IS NOT NULL
ORDER BY created_at, id
ON CONFLICT DO NOTHING;

-- Every later write records its handles too, so the set cannot fall behind
-- the row. AFTER, because email_normalized is generated and the LinkedIn URL
-- is canonicalised by a BEFORE trigger. An edit that replaces the row's own
-- address or profile retires the old one; a handle a merge brought in is not
-- the row's own and is never retired by an edit.
--
-- A handle another contact already holds is a duplicate that some writer did
-- not catch (every creator should ask contact_for_handle first). It is never
-- dropped silently: it becomes a "same person?" question, once per pair. A
-- failure to ask never blocks the write that raised it.
CREATE OR REPLACE FUNCTION public.ask_same_person(p_new uuid, p_holder uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
BEGIN
  IF p_new = p_holder OR EXISTS (
    SELECT 1 FROM public.suggestions
    WHERE surface = 'contact_merge'
      AND subject_id IN (p_new::text, p_holder::text)
      AND proposed->>'a' IN (p_new::text, p_holder::text)
      AND proposed->>'b' IN (p_new::text, p_holder::text)) THEN
    RETURN;
  END IF;
  INSERT INTO public.suggestions (surface, subject_table, subject_id, proposed, reason, confidence, producer)
  VALUES ('contact_merge', 'contacts', p_new::text,
          jsonb_build_object('a', p_new, 'b', p_holder, 'rule', 'same_handle', 'shared', p_kind),
          CASE p_kind WHEN 'email' THEN 'This email address already belongs to another contact in your network.'
                      ELSE 'This LinkedIn profile already belongs to another contact in your network.' END,
          0.7, jsonb_build_object('agent', 'contacts_record_identities'));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ask_same_person: %', SQLERRM;
END
$fn$;

CREATE OR REPLACE FUNCTION public.contacts_record_identities()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE
  s text;
  old_s text;
  holder uuid;
BEGIN
  s := public.linkedin_slug(NEW.linkedin_url);
  IF TG_OP = 'UPDATE' THEN
    IF OLD.email_normalized IS NOT NULL AND OLD.email_normalized IS DISTINCT FROM NEW.email_normalized THEN
      UPDATE public.contact_identities SET retired_at = now()
      WHERE contact_id = NEW.id AND kind = 'email' AND value = OLD.email_normalized
        AND basis = 'record' AND merged_from IS NULL AND retired_at IS NULL;
    END IF;
    old_s := public.linkedin_slug(OLD.linkedin_url);
    IF old_s IS NOT NULL AND old_s IS DISTINCT FROM s THEN
      UPDATE public.contact_identities SET retired_at = now()
      WHERE contact_id = NEW.id AND kind = 'li_slug' AND value = old_s
        AND basis = 'record' AND merged_from IS NULL AND retired_at IS NULL;
    END IF;
  END IF;
  IF NEW.email_normalized IS NOT NULL AND NEW.email_normalized <> '' THEN
    -- Changed back to an address it had before: the old row comes back,
    -- unless someone else holds that address now.
    UPDATE public.contact_identities SET retired_at = NULL
    WHERE contact_id = NEW.id AND kind = 'email' AND value = NEW.email_normalized AND retired_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.contact_identities o
                      WHERE o.kind = 'email' AND o.value = NEW.email_normalized AND o.retired_at IS NULL);
    SELECT contact_id INTO holder FROM public.contact_identities
    WHERE kind = 'email' AND value = NEW.email_normalized AND retired_at IS NULL AND contact_id <> NEW.id
    LIMIT 1;
    IF holder IS NOT NULL THEN PERFORM public.ask_same_person(NEW.id, holder, 'email'); END IF;
    INSERT INTO public.contact_identities (contact_id, kind, value, source)
    VALUES (NEW.id, 'email', NEW.email_normalized, 'contacts.email')
    ON CONFLICT DO NOTHING;
  END IF;
  IF s IS NOT NULL THEN
    UPDATE public.contact_identities SET retired_at = NULL
    WHERE contact_id = NEW.id AND kind = 'li_slug' AND value = s AND retired_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.contact_identities o
                      WHERE o.kind = 'li_slug' AND o.value = s AND o.retired_at IS NULL);
    holder := NULL;
    SELECT contact_id INTO holder FROM public.contact_identities
    WHERE kind = 'li_slug' AND value = s AND retired_at IS NULL AND contact_id <> NEW.id
    LIMIT 1;
    IF holder IS NOT NULL THEN PERFORM public.ask_same_person(NEW.id, holder, 'li_slug'); END IF;
    INSERT INTO public.contact_identities (contact_id, kind, value, source)
    VALUES (NEW.id, 'li_slug', s, 'contacts.linkedin_url')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE TRIGGER contacts_record_identities_trg
  AFTER INSERT OR UPDATE OF email, linkedin_url ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_record_identities();

-- ── The rollup reads through identities ─────────────────────────────────────
-- The live definition with one change: `matched` joins correspondent_stats to
-- contact_identities instead of to the two columns on contacts. Still two
-- indexed joins, never one OR (20261004000000 records why). Everything else is
-- byte-for-byte the live function.

CREATE OR REPLACE FUNCTION public.refresh_relationship_rollup()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH matched AS (
    -- Through every handle a person has had, so a merged contact keeps the
    -- mail and LinkedIn history of each address and profile it absorbed.
    SELECT i.contact_id, s.*
    FROM public.correspondent_stats s
    JOIN public.contact_identities i ON i.kind = 'email' AND i.value = s.email_normalized AND i.retired_at IS NULL
    WHERE s.email_normalized IS NOT NULL
    UNION ALL
    SELECT i.contact_id, s.*
    FROM public.correspondent_stats s
    JOIN public.contact_identities i ON i.kind = 'li_slug' AND i.value = substr(s.person_key, 4) AND i.retired_at IS NULL
    WHERE s.person_key LIKE 'li:%'
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
$function$;

-- ── Why a contact is off limits ──────────────────────────────────────────────

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS status_reason text;
-- A reason only ever explains do_not_contact, so a bulk status change cannot
-- quietly put someone who has died back into the ask flow.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_status_reason_known') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_reason_known
      CHECK (status_reason IS NULL OR status_reason IN ('self', 'deceased'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_status_reason_needs_dnc') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_reason_needs_dnc
      CHECK (status_reason IS NULL OR status = 'do_not_contact');
  END IF;
END $$;

COMMENT ON COLUMN public.contacts.status_reason IS
  'Why status is do_not_contact, where it is a fact rather than a choice: self (one of Krish''s own addresses or profiles) or deceased. Readers use it to say the right thing, never to re-admit the row.';

-- Krish's own records: four "Krish Raja" rows, "Krish" at a former employer,
-- the Mindmaker role mailboxes and one with no handle at all. One of them was
-- ranked top of his own network. They stay as rows, because mail to and from
-- them is real history, and are kept out of every proposal.
UPDATE public.contacts
SET status = 'do_not_contact', status_reason = 'self'
WHERE id IN (
  'be2b28c4-8210-4f61-ab0a-811b0d520fd2', '55f29c1c-a7c7-4035-b1c3-c47b65c15ebd',
  '7e5813ac-c2a4-4a48-b897-e60590a6afc0', '84cffa7b-4793-4926-b91a-452cc48ad539',
  '28d68a98-44c7-4287-8e8d-ba04f28af424', 'acc35653-1821-454c-825d-28f4059a512d',
  '07f7917c-fffd-45d1-899f-d8eae5138209', 'bffbf170-92da-4541-b725-abc45b2241af',
  '72fca4f8-abe0-4b8a-81a6-4207126cf1d0'
);
UPDATE public.contact_intelligence
SET is_person = false
WHERE contact_id IN (
  'be2b28c4-8210-4f61-ab0a-811b0d520fd2', '55f29c1c-a7c7-4035-b1c3-c47b65c15ebd',
  '7e5813ac-c2a4-4a48-b897-e60590a6afc0', '84cffa7b-4793-4926-b91a-452cc48ad539',
  '28d68a98-44c7-4287-8e8d-ba04f28af424', 'acc35653-1821-454c-825d-28f4059a512d',
  '07f7917c-fffd-45d1-899f-d8eae5138209', 'bffbf170-92da-4541-b725-abc45b2241af',
  '72fca4f8-abe0-4b8a-81a6-4207126cf1d0'
);

-- ── The merge ledger ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_merges (
  id bigserial PRIMARY KEY,
  -- No foreign keys: the ledger has to outlive both rows.
  survivor_id uuid NOT NULL,
  loser_id uuid NOT NULL,
  -- 'same_linkedin', 'same_identity', 'krish_confirmed', ...
  class text NOT NULL CHECK (btrim(class) <> ''),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'auto:<rule>' or 'krish'.
  decided_by text NOT NULL CHECK (btrim(decided_by) <> ''),
  merged_at timestamptz NOT NULL DEFAULT now(),
  -- The survivor's fields that were blank and were filled from the loser.
  filled text[] NOT NULL DEFAULT '{}'::text[],
  -- {loser, loser_intelligence, survivor_before, survivor_intelligence_before,
  --  moved: {table: [ids]}, dropped: {table: [rows]}}. Enough to rebuild the
  -- loser exactly, embeddings aside (they are rebuilt from text).
  snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS contact_merges_survivor_idx ON public.contact_merges (survivor_id);
CREATE INDEX IF NOT EXISTS contact_merges_loser_idx ON public.contact_merges (loser_id);

COMMENT ON TABLE public.contact_merges IS
  'One row per merged-away contact. snapshot holds the loser whole and every id that was repointed, so a merge can be read back or reversed by hand. A stale contact id (a bookmark, a cached proposal) resolves through loser_id to the survivor.';

ALTER TABLE public.contact_merges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contact_merges' AND policyname = 'contact_merges_service_all') THEN
    CREATE POLICY contact_merges_service_all ON public.contact_merges
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── merge_contacts ───────────────────────────────────────────────────────────
-- In 20261004060000_merge_contacts.sql. It deletes the merged-away row, and a
-- statement that deletes needs Krish's own confirmation before it reaches the
-- live database, so it ships as its own step.

-- ── Which of two rows survives ───────────────────────────────────────────────
-- Every field is merged anyway, so this mostly decides whose primary email and
-- whose intelligence row are kept. In order: a row on one of Krish's own
-- LinkedIn connections, a measured relationship, a profile from his own
-- records over one the Meta import guessed, the person's own email (not an
-- assistant's or a shared inbox), the richer profile, then the oldest.
CREATE OR REPLACE FUNCTION public.merge_survivor(p_a uuid, p_b uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT c.id
  FROM public.contacts c
  LEFT JOIN public.contact_intelligence ci ON ci.contact_id = c.id
  WHERE c.id IN (p_a, p_b)
  ORDER BY
    -- A profile Krish's own records stand behind beats anything an import
    -- found: his own LinkedIn connection first, then a relationship the mail
    -- and messages measured.
    EXISTS (SELECT 1 FROM public.linkedin_connections lc
            WHERE lc.linkedin_slug = public.linkedin_slug(c.linkedin_url)) DESC,
    (ci.warmth_source = 'measured') IS TRUE DESC,
    -- A profile from his own records (a connection's export, a roster, a sheet,
    -- one he confirmed) beats one Apify guessed from a Facebook-era name, which
    -- may also have brought the guessed profile's email with it.
    ((public.linkedin_slug(c.linkedin_url) IS NOT NULL OR c.dossier IS NOT NULL OR ci.enriched_at IS NOT NULL)
      AND coalesce(ci.enriched_source, '') <> 'apify (meta export)'
      AND coalesce(c.origin_channel, '') <> 'meta_export') DESC,
    -- The person's own address, not an assistant's or a shared inbox. A name
    -- of one letter proves nothing, so it never counts.
    (c.email_normalized IS NOT NULL AND (
       (length(split_part(btrim(coalesce(c.full_name, '')), ' ', 1)) >= 2
        AND position(lower(split_part(btrim(c.full_name), ' ', 1)) IN split_part(c.email_normalized, '@', 1)) > 0)
       OR (length(regexp_replace(btrim(coalesce(c.full_name, '')), '^.*\s', '')) >= 2
        AND position(lower(regexp_replace(btrim(c.full_name), '^.*\s', '')) IN split_part(c.email_normalized, '@', 1)) > 0))) DESC,
    (c.dossier IS NOT NULL) DESC,
    (ci.enriched_at IS NOT NULL) DESC,
    (ci.embedding IS NOT NULL) DESC,
    coalesce(ci.completeness, 0) DESC,
    EXISTS (SELECT 1 FROM public.pilot_deals p WHERE p.contact_id = c.id) DESC,
    coalesce(ci.email_inbound, 0) + coalesce(ci.email_outbound, 0) DESC,
    c.created_at ASC,
    c.id
  LIMIT 1
$fn$;

-- One question for every creator: is this address or profile someone
-- already, on any handle they have ever had? A merged-away person's old
-- address lives only here, so a creator that asked contacts alone would make
-- them again.
CREATE OR REPLACE FUNCTION public.contact_for_handle(p_email text, p_linkedin text)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT contact_id FROM (
    SELECT contact_id, 1 AS o FROM public.contact_identities
    WHERE kind = 'email' AND value = lower(btrim(p_email)) AND retired_at IS NULL
    UNION ALL
    SELECT contact_id, 2 FROM public.contact_identities
    WHERE kind = 'li_slug' AND value = public.linkedin_slug(p_linkedin) AND retired_at IS NULL
  ) x
  ORDER BY o
  LIMIT 1
$fn$;

-- ── Two questions only Krish can answer ──────────────────────────────────────
-- Both go through the existing learning bank (suggestions + verdicts), so a
-- "no, that is not them" is recorded and the pair is never asked again.
INSERT INTO public.suggestion_surfaces (slug, label, what, subject, active, sort_order) VALUES
  ('contact_merge', 'same person',
   'Two contacts that may be one person, with what each record says side by side. Merged only when Krish says so; a no is kept so the pair is never asked again.',
   'contacts', true, 140),
  ('contact_link', 'which profile',
   'A LinkedIn profile an import guessed for someone Krish knows, where nothing he already has confirms it. Nothing from the profile is written until he says it is them.',
   'contacts', true, 150)
ON CONFLICT (slug) DO NOTHING;

-- The open questions, most valuable first: people Krish has a measured
-- relationship with, or who can buy or open doors, before the rest. A "not
-- sure" goes to the back rather than away. A question whose two sides have
-- since become one contact (an earlier merge) is answered already and never
-- shown.
CREATE OR REPLACE FUNCTION public.people_review_open(p_surface text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, surface text, subject_id text, proposed jsonb, reason text, created_at timestamptz, deferred boolean, value integer)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  WITH open AS (
    SELECT s.*,
      EXISTS (SELECT 1 FROM public.suggestion_verdicts v WHERE v.suggestion_id = s.id AND v.verdict = 'deferred') AS deferred
    FROM public.suggestions s
    WHERE s.surface = p_surface
      AND s.surface IN ('contact_merge', 'contact_link')
      AND NOT EXISTS (SELECT 1 FROM public.suggestion_verdicts v WHERE v.suggestion_id = s.id AND v.verdict <> 'deferred')
      AND NOT (s.surface = 'contact_merge' AND s.proposed->>'a' = s.proposed->>'b')
  )
  SELECT o.id, o.surface, o.subject_id, o.proposed, o.reason, o.created_at, o.deferred,
    (SELECT coalesce(max(
        (CASE WHEN ci.warmth_source = 'measured' THEN coalesce(ci.warmth, 0) ELSE 0 END)
      + (CASE WHEN ci.plays && ARRAY['buyer', 'multiplier', 'alumni', 'amplifier'] THEN 30 ELSE 0 END)), 0)::int
     FROM public.contact_intelligence ci
     WHERE ci.contact_id::text IN (o.subject_id, o.proposed->>'a', o.proposed->>'b')) AS value
  FROM open o
  JOIN public.contacts c ON c.id::text = o.subject_id
  ORDER BY o.deferred, 8 DESC, o.confidence DESC NULLS LAST, o.created_at, o.id
  LIMIT least(coalesce(p_limit, 20), 100)
$fn$;

CREATE OR REPLACE FUNCTION public.people_review_counts()
RETURNS TABLE(surface text, open bigint)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT s.surface, count(*)
  FROM public.suggestions s
  JOIN public.contacts c ON c.id::text = s.subject_id
  WHERE s.surface IN ('contact_merge', 'contact_link')
    AND NOT EXISTS (SELECT 1 FROM public.suggestion_verdicts v WHERE v.suggestion_id = s.id AND v.verdict <> 'deferred')
    AND NOT (s.surface = 'contact_merge' AND s.proposed->>'a' = s.proposed->>'b')
  GROUP BY s.surface
$fn$;

-- Only the service role writes contacts (RLS), so only it fires the trigger
-- that asks.
REVOKE ALL ON FUNCTION public.ask_same_person(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ask_same_person(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.merge_survivor(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contact_for_handle(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_for_handle(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.people_review_open(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.people_review_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_survivor(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.people_review_open(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.people_review_counts() TO service_role;

-- ── The review queue stays private ───────────────────────────────────────────
-- Suggestions are anon-readable apart from the strategist's. A merge or a
-- LinkedIn match names real people side by side, so those surfaces are hidden
-- from the anon key the same way.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'suggestions' AND policyname = 'suggestions anon hides people review') THEN
    CREATE POLICY "suggestions anon hides people review" ON public.suggestions
      AS RESTRICTIVE FOR SELECT TO anon
      USING (surface NOT IN ('contact_merge', 'contact_link'));
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
