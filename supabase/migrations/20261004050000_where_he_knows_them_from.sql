-- Where Krish knows someone from, and the schools he shares with them.
--
-- The Meta export (Facebook, Instagram, phone contacts; 1,325 people, 2026-10-04)
-- is mostly his life before LinkedIn: school, university, friends. Nothing in
-- the record could say so. A person was "a contact" whether he met them last
-- week at a conference or sat next to them at school.
--
-- TIE. contact_intelligence.tie says which of his networks a person is in:
--   personal      Facebook or Instagram, and not a LinkedIn connection
--   professional  a LinkedIn connection, and not on Facebook or Instagram
--   both          both
--   NULL          neither (a mailbox correspondent, a roster, a list)
-- It is a fact about where the link lives, not a judgment of closeness. Phone
-- contacts count as neither: an address book holds plumbers and CFOs alike.
--
-- SCHOOLS. krish_tenures held his employers. It now holds his schools too, and
-- shared_history reads a person's education beside their career. An education
-- row, unlike a career row, carries years, so for a school the record CAN say
-- "the same years as you" where the years overlap, and says nothing about time
-- where they do not. Schools never make someone 'alumni': that play means a
-- former colleague, and the ask flow words it that way.
--
-- MEASURED BEFORE TRUSTED. These patterns also decide which Apify LinkedIn
-- matches on Meta contacts are believed. Against Krish's own LinkedIn
-- connections, Apify picked the right profile 70 times in 118 (59%). Where the
-- profile listed one of his schools it was right 7 times in 7, and one of his
-- close employers 28 in 29 (the miss was the BBC, a wide employer). Nothing
-- else it reports, its own match score included, separated right from wrong.

BEGIN;

-- ── Schools beside employers ─────────────────────────────────────────────────

ALTER TABLE public.krish_tenures
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'employer';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'krish_tenures_kind_check') THEN
    ALTER TABLE public.krish_tenures ADD CONSTRAINT krish_tenures_kind_check CHECK (kind IN ('employer', 'school'));
  END IF;
END $$;

-- From Krish's LinkedIn export (Education.csv). Each pattern was run against
-- the spellings people actually use. "Manchester Metropolitan" is a different
-- university; UMIST was a separate one until 2004; HBS Online is a course
-- anyone can take. None of them match. No \m or \M word boundaries: the
-- import reads these patterns in JavaScript too, where they mean something
-- else, so a word end is spelled out.
INSERT INTO public.krish_tenures (key, label, pattern, started, finished, krish_title, closeness, kind) VALUES
  ('sutton_grammar', 'Sutton Grammar School', '^sutton grammar',
   '2004-01-01', '2005-12-31', NULL, 'close', 'school'),
  ('manchester', 'the University of Manchester',
   '^((the )?(victoria )?university of manchester(?! institute of science)|manchester university|(alliance )?manchester business school)',
   '2005-01-01', '2008-12-31', NULL, 'wide', 'school'),
  ('uca', 'the University for the Creative Arts',
   '^((the )?university (college )?for the creative arts|(uca|ucca)($|[^a-z]))',
   '2010-01-01', '2011-12-31', NULL, 'wide', 'school'),
  ('hbs', 'Harvard Business School', '^harvard business school(?! online)',
   '2020-01-01', '2021-12-31', 'Executive Education', 'wide', 'school')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, pattern = EXCLUDED.pattern, started = EXCLUDED.started,
  finished = EXCLUDED.finished, krish_title = EXCLUDED.krish_title,
  closeness = EXCLUDED.closeness, kind = EXCLUDED.kind;

COMMENT ON COLUMN public.krish_tenures.kind IS
  'employer: matched against career and current company, and a close one makes someone alumni. school: matched against education, recorded in shared_history with years, never makes anyone alumni.';

-- ── Education is searchable ──────────────────────────────────────────────────
-- The live definition with one segment added after Skills. Without it "who
-- went to Manchester" could not be asked of anyone.

CREATE OR REPLACE FUNCTION public.ci_retrieval_text(p_who text, p_name text, p_title text, p_company text, p_industry text, p_location text, p_headline text, p_summary text, p_facts jsonb, p_intent_line text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(regexp_replace(concat_ws(' · ',
    CASE WHEN p_who ~* '^\s*(no role data|insufficient profile data|unknown)' THEN NULL
         ELSE NULLIF(left(p_who, 300), '') END,
    NULLIF(p_title, ''),
    NULLIF(p_company, ''),
    NULLIF(p_industry, ''),
    NULLIF(p_location, ''),
    NULLIF(left(p_headline, 200), ''),
    NULLIF(left(p_summary, 300), ''),
    (SELECT 'Career: ' || left(string_agg(
              CASE
                WHEN nullif(e->>'company', '') IS NULL THEN e->>'title'
                WHEN nullif(e->>'title', '') IS NULL
                  OR lower(e->>'title') = lower(e->>'company') THEN e->>'company'
                ELSE (e->>'title') || ' at ' || (e->>'company')
              END, '; ' ORDER BY ord), 420)
       FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(p_facts->'career') = 'array'
                   THEN p_facts->'career' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(e, ord)
      WHERE ord <= 6
        AND coalesce(nullif(e->>'title', ''), nullif(e->>'company', '')) IS NOT NULL
     HAVING count(*) > 0),
    (SELECT 'Skills: ' || left(string_agg(s, ', ' ORDER BY ord), 220)
       FROM jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(p_facts->'skills') = 'array'
                   THEN p_facts->'skills' ELSE '[]'::jsonb END) WITH ORDINALITY AS y(s, ord)
      WHERE ord <= 12 AND btrim(s) <> ''
     HAVING count(*) > 0),
    (SELECT 'Education: ' || left(string_agg(
              CASE WHEN nullif(e->>'degree', '') IS NULL THEN e->>'school'
                   ELSE (e->>'school') || ' (' || (e->>'degree') || ')' END, '; ' ORDER BY ord), 220)
       FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(p_facts->'education') = 'array'
                   THEN p_facts->'education' ELSE '[]'::jsonb END) WITH ORDINALITY AS z(e, ord)
      WHERE ord <= 4 AND nullif(e->>'school', '') IS NOT NULL
     HAVING count(*) > 0),
    p_intent_line,
    NULLIF(p_name, '')
  ), '\s+', ' ', 'g'))
$function$;

-- ── Shared history reads schools ─────────────────────────────────────────────
-- The live definition, with education as a fourth source of rows, each row
-- tagged with the kind of tenure it may match, and two keys on every entry:
-- kind, and for a school the years on both sides and whether they overlap.
-- 'alumni' still comes only from a close EMPLOYER.

CREATE OR REPLACE FUNCTION public.refresh_shared_history_and_plays()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH roles AS (
    SELECT ci.contact_id, e->>'title' AS their_title,
           btrim(lower(regexp_replace(coalesce(e->>'company', ''), '[®™]', '', 'g'))) AS co, false AS current,
           'employer'::text AS kind, NULL::text AS their_years
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.dossier->'_direct'->'facts'->'career') = 'array'
           THEN c.dossier->'_direct'->'facts'->'career' ELSE '[]'::jsonb END) e
    UNION ALL
    SELECT ci.contact_id, ci.current_title AS their_title,
           btrim(lower(regexp_replace(coalesce(ci.current_company, ''), '[®™]', '', 'g'))) AS co, true AS current,
           'employer'::text, NULL::text
    FROM public.contact_intelligence ci
    UNION ALL
    SELECT ci.contact_id, c.title AS their_title,
           btrim(lower(regexp_replace(coalesce(c.company, ''), '[®™]', '', 'g'))) AS co, false AS current,
           'employer'::text, NULL::text
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    UNION ALL
    SELECT ci.contact_id, NULL::text AS their_title,
           btrim(lower(coalesce(e->>'school', ''))) AS co, false AS current,
           'school'::text, nullif(btrim(e->>'period'), '')
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.dossier->'_direct'->'facts'->'education') = 'array'
           THEN c.dossier->'_direct'->'facts'->'education' ELSE '[]'::jsonb END) e
  ), matched AS (
    SELECT r.contact_id, t.key, t.label, t.closeness, t.kind, r.their_title, r.current, r.their_years,
           extract(year FROM t.started)::int AS krish_from, extract(year FROM t.finished)::int AS krish_to,
           (regexp_match(coalesce(r.their_years, ''), '((?:19|20)\d\d)'))[1]::int AS their_from,
           (regexp_match(coalesce(r.their_years, ''), '.*((?:19|20)\d\d)'))[1]::int AS their_to
    FROM roles r JOIN public.krish_tenures t ON r.co ~* t.pattern AND t.kind = r.kind
    WHERE r.co <> ''
  ), years AS (
    -- Academic years run September to June, so two ranges that only touch at
    -- an end year ("2002 - 2005" against "2005 - 2008") never shared a year.
    -- A single year is a graduation year and counts where it falls inside.
    SELECT m.*,
      (m.their_from IS NOT NULL AND m.krish_from IS NOT NULL AND
        CASE WHEN m.their_to IS NULL OR m.their_to = m.their_from
             THEN m.their_from BETWEEN m.krish_from AND coalesce(m.krish_to, m.krish_from)
             ELSE m.their_from < coalesce(m.krish_to, m.krish_from) AND m.their_to > m.krish_from END) AS overlap
    FROM matched m
  ), hits AS (
    -- One entry per tenure; where someone lists a school twice, the row that
    -- overlaps Krish's years is the one kept.
    SELECT DISTINCT ON (y.contact_id, y.key) y.*
    FROM years y
    ORDER BY y.contact_id, y.key, y.current DESC, y.overlap DESC, y.their_years DESC NULLS LAST
  ), shared AS (
    SELECT contact_id,
           jsonb_agg(
             CASE WHEN kind = 'school' THEN
               jsonb_build_object('key', key, 'label', label, 'closeness', closeness, 'their_title', NULL,
                 'current', false, 'kind', 'school', 'their_years', their_years,
                 'krish_years', krish_from::text || CASE WHEN krish_to IS DISTINCT FROM krish_from THEN ' to ' || krish_to::text ELSE '' END,
                 -- Only years both sides state can overlap. No years, no claim.
                 'same_years', overlap)
             ELSE
               jsonb_build_object('key', key, 'label', label, 'closeness', closeness,
                 'their_title', their_title, 'current', current, 'kind', 'employer')
             END
             ORDER BY (kind = 'employer') DESC, (closeness = 'close') DESC, label) AS history,
           bool_or(closeness = 'close' AND kind = 'employer') AS is_alumni
    FROM hits GROUP BY contact_id
  ), people AS (
    SELECT ci.contact_id, coalesce(s.history, '[]'::jsonb) AS history, coalesce(s.is_alumni, false) AS is_alumni,
           lower(coalesce(ci.current_title, c.title, '') || ' | ' || coalesce(ci.headline, '')) AS t
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    LEFT JOIN shared s ON s.contact_id = ci.contact_id
  ), played AS (
    SELECT contact_id, history,
      array_remove(ARRAY[
        CASE WHEN is_alumni THEN 'alumni' END,
        CASE WHEN t ~ '(operating partner|value[- ]creation|venture partner|head of platform|platform (director|lead|head)|portfolio (support|operations|director|services|growth|success)|\mchair(man|woman|person)?\M|vistage|\mypo\M|executive coach|ceo coach|leadership coach|fractional (cro|cmo|cco|coo|chief)|peer (group|advisory)|managing partner|agency (founder|principal|owner))' THEN 'multiplier' END,
        CASE WHEN t ~ '(\m(cro|cco|ceo|cmo|cdo)\M|chief (revenue|commercial|executive|marketing|growth|operating|digital|product)|head of (revenue|sales|commercial|growth|monetisation|monetization|partnerships)|commercial director|\mpresident\M|general manager|managing director|svp|evp|vice president|\mvp\M)' THEN 'buyer' END,
        CASE WHEN t ~ '(editor|journalist|reporter|correspondent|columnist|newsletter|substack|podcast|conference|programm(e|ing) (director|manager|lead)|curator|events? (director|lead|manager|producer)|content director|speaker bureau)' THEN 'amplifier' END,
        CASE WHEN t ~ '(founder|co-founder|cofounder)' AND t ~ '(\mai\M|artificial intelligence|\mllm|agentic|\magents?\M|genai|gen ai|machine learning)' THEN 'subject' END
      ], NULL) AS plays
    FROM people
  ), upd AS (
    UPDATE public.contact_intelligence ci SET shared_history = p.history, plays = p.plays
    FROM played p
    WHERE ci.contact_id = p.contact_id
      AND (ci.shared_history IS DISTINCT FROM p.history OR ci.plays IS DISTINCT FROM p.plays)
    RETURNING 1
  )
  SELECT count(*)::int FROM upd
$function$;

-- ── Tie ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.contact_intelligence ADD COLUMN IF NOT EXISTS tie text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_intelligence_tie_check') THEN
    ALTER TABLE public.contact_intelligence ADD CONSTRAINT contact_intelligence_tie_check
      CHECK (tie IS NULL OR tie IN ('personal', 'professional', 'both'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS contact_intelligence_tie_idx ON public.contact_intelligence (tie) WHERE tie IS NOT NULL;

COMMENT ON COLUMN public.contact_intelligence.tie IS
  'Which of Krish''s networks this person is in: personal (Facebook or Instagram), professional (a LinkedIn connection), both, or NULL. Where the link lives, not how close it is. Rebuilt by refresh_ties().';

CREATE OR REPLACE FUNCTION public.refresh_ties()
RETURNS integer LANGUAGE sql SET search_path TO 'public', 'pg_temp' AS $fn$
  WITH personal AS (
    -- A link that rests on a name alone does not make anyone personal until
    -- Krish confirms it.
    SELECT contact_id FROM public.contact_identities
    WHERE kind IN ('facebook', 'instagram') AND verified AND retired_at IS NULL
    UNION
    SELECT id FROM public.contacts WHERE sources @> '[{"source": "instagram_export"}]'::jsonb
  ), professional AS (
    SELECT i.contact_id FROM public.contact_identities i
    JOIN public.linkedin_connections lc ON lc.linkedin_slug = i.value
    WHERE i.kind = 'li_slug' AND i.retired_at IS NULL
    UNION
    SELECT id FROM public.contacts WHERE sources @> '[{"source": "linkedin_export"}]'::jsonb
  ), t AS (
    SELECT ci.contact_id,
      CASE WHEN p.contact_id IS NOT NULL AND q.contact_id IS NOT NULL THEN 'both'
           WHEN p.contact_id IS NOT NULL THEN 'personal'
           WHEN q.contact_id IS NOT NULL THEN 'professional' END AS tie
    FROM public.contact_intelligence ci
    LEFT JOIN personal p ON p.contact_id = ci.contact_id
    LEFT JOIN professional q ON q.contact_id = ci.contact_id
  ), upd AS (
    UPDATE public.contact_intelligence ci SET tie = t.tie
    FROM t WHERE ci.contact_id = t.contact_id AND ci.tie IS DISTINCT FROM t.tie
    RETURNING 1
  )
  SELECT count(*)::int FROM upd
$fn$;

-- The back catalogue as a door: people he knows personally, the ones who can
-- now buy or open doors first, then the ones with a profile worth reading.
-- A new function rather than a parameter on network_by_play: changing that
-- signature means dropping it, and two overloads with defaults are ambiguous
-- to PostgREST.
CREATE OR REPLACE FUNCTION public.network_by_tie(p_tie text DEFAULT 'personal', p_limit integer DEFAULT 40)
 RETURNS TABLE(contact_id uuid)
 LANGUAGE sql STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ci.contact_id
  FROM public.contact_intelligence ci
  JOIN public.contacts c ON c.id = ci.contact_id
  WHERE ci.is_person
    AND c.status IS DISTINCT FROM 'do_not_contact'
    AND (CASE WHEN p_tie = 'personal' THEN ci.tie IN ('personal', 'both') ELSE ci.tie = p_tie END)
  ORDER BY
    ('buyer' = ANY(ci.plays) OR 'multiplier' = ANY(ci.plays) OR 'amplifier' = ANY(ci.plays)) DESC,
    (ci.shared_history @> '[{"kind": "school"}]'::jsonb) DESC,
    -- IS TRUE: a NULL source would otherwise sort first under DESC, and every
    -- new import with no evidence at all would rank above measured friends.
    (ci.warmth_source = 'measured') IS TRUE DESC,
    ci.warmth DESC NULLS LAST,
    ci.completeness DESC
  LIMIT least(coalesce(p_limit, 40), 200)
$function$;

-- The same NULL-first ordering sat in network_by_play: 1,099 rows with no
-- warmth source ranked above measured relationships in every door. The live
-- definition with that one line changed.
CREATE OR REPLACE FUNCTION public.network_by_play(p_play text DEFAULT 'alumni'::text, p_employer text DEFAULT NULL::text, p_limit integer DEFAULT 40)
 RETURNS TABLE(contact_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ci.contact_id
  FROM public.contact_intelligence ci
  JOIN public.contacts c ON c.id = ci.contact_id
  WHERE ci.is_person
    AND c.status IS DISTINCT FROM 'do_not_contact'
    AND (p_play IS NULL OR p_play = ANY(ci.plays))
    AND (p_employer IS NULL OR ci.shared_history @> jsonb_build_array(jsonb_build_object('key', p_employer)))
  ORDER BY
    CASE WHEN p_play = 'alumni' OR p_play IS NULL
         THEN ('buyer' = ANY(ci.plays) OR 'multiplier' = ANY(ci.plays))
         ELSE ('alumni' = ANY(ci.plays)) END DESC,
    (ci.warmth_source = 'measured') IS TRUE DESC,
    ci.warmth DESC NULLS LAST,
    ci.completeness DESC
  LIMIT least(coalesce(p_limit, 40), 200)
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
