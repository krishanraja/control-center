-- Shared history and plays: who Krish has worked beside, and what each person
-- can actually do for him.
--
-- 644 contacts list one of Krish's former employers in their career history,
-- and 253 of them are now senior enough to buy or introduce. Nothing could ask
-- for them. The career rows were stored for search text and never read as a
-- relationship. Krish, 2026-10-03: "This is probably your warmest list and the
-- one you're most likely ignoring."
--
-- WHAT THIS CAN AND CANNOT CLAIM. A contact's career entry carries a duration
-- ("3 yrs 9 mos"), not a start and end date. So the record can say both people
-- were at Nine. It cannot say they were there at the same time, and nothing
-- downstream may say "you worked together". The tenure dates below are Krish's
-- own, from his LinkedIn export, kept so that a future source with real dates
-- can test overlap without a schema change.
--
-- WHY THE PATTERNS ARE ANCHORED. Matching the word anywhere in the company name
-- was tried against live data first and would have made colleagues of: Group
-- Nine Media (a US company), "nine to five", Ninetwothree AI Studio, Excite
-- Holidays (travel, not Excite Media), Universal McCann (a sibling agency), and
-- people at Videology and TVN.ASIA, companies Amobee and Tremor bought, who
-- never worked at either. Each pattern is matched against the start of a
-- normalised company name.
--
-- CLOSE OR WIDE. Captify grew to 18 people under Krish. Microsoft has 220,000.
-- "Also at Microsoft" is a true sentence that implies a closeness it does not
-- carry, so each employer is marked: close ones make someone alumni, wide ones
-- are recorded and said with the size attached.

CREATE TABLE IF NOT EXISTS public.krish_tenures (
  key text PRIMARY KEY,
  label text NOT NULL,
  pattern text NOT NULL,
  started date,
  finished date,
  krish_title text,
  closeness text NOT NULL CHECK (closeness IN ('close', 'wide'))
);

COMMENT ON TABLE public.krish_tenures IS
  'Krish''s own employers, from his LinkedIn export (Positions.csv, 2026-02). pattern is a case-insensitive regex matched against the START of a normalised company name. closeness says whether sharing the employer implies the people likely knew each other.';

INSERT INTO public.krish_tenures (key, label, pattern, started, finished, krish_title, closeness) VALUES
  ('nine',          'Nine',                  '^(nine( entertainment( co\.?| company)?| network( australia)?| digital| publishing| radio)?|mi9.*|ninemsn.*|cudo \(ninemsn.*)$', '2014-08-01', '2017-09-30', 'Head of Data & Automation', 'close'),
  ('amobee',        'Amobee (now Nexxen)',   '^(amobee|nexxen|tremor (video|international))',  '2017-10-01', '2020-12-31', 'Director of Product & Platform Strategy', 'close'),
  ('captify',       'Captify',               '^captify',                                         '2020-12-01', '2025-01-31', 'Managing Director, APAC', 'close'),
  ('excite',        'Excite Media',          '^(excite( digital)? media|excite|adlux)$',          '2013-01-01', '2014-06-30', 'Group Sales Manager', 'close'),
  ('adfixus',       'AdFixus',               '^adfixus',                                         '2024-09-01', NULL,         'Fractional SVP, Customer Identity', 'close'),
  ('ticket_fairy',  'The Ticket Fairy',      '^(the )?ticket fairy',                             '2020-01-01', '2021-04-30', 'Consultant', 'close'),
  ('growth_faculty','Growth Faculty',        '^(the )?growth faculty',                           '2021-05-01', '2022-04-30', 'Consultant', 'close'),
  ('meliora',       'Meliora',               '^meliora',                                         '2025-08-01', NULL,         'Advisory, AI CX', 'close'),
  ('microsoft',     'Microsoft',             '^microsoft',                                       '2008-10-01', '2012-10-31', 'Technical Account Manager / Strategist', 'wide'),
  ('bbc',           'the BBC',               '^bbc',                                             '2007-06-01', '2008-04-30', 'Broadcast Journalist', 'wide'),
  ('mccann',        'McCann',                '^mccann',                                          '2008-04-01', '2008-10-31', 'Account Manager', 'wide')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, pattern = EXCLUDED.pattern, started = EXCLUDED.started,
  finished = EXCLUDED.finished, krish_title = EXCLUDED.krish_title, closeness = EXCLUDED.closeness;

ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS shared_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS plays text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.contact_intelligence.shared_history IS
  'Krish''s employers this person also worked at: [{key, label, closeness, their_title, current}]. Says both were there, never that they overlapped: career rows carry durations, not dates.';

COMMENT ON COLUMN public.contact_intelligence.plays IS
  'What this person can do for Krish, from Krish''s five categories (2026-10-03): alumni (shared a close employer), multiplier (one relationship reaches many buyers), buyer (holds a commercial budget), amplifier (puts him in rooms or in print), subject (an AI-native story for makeyourmindup). A person can hold several.';

CREATE INDEX IF NOT EXISTS contact_intelligence_plays_idx ON public.contact_intelligence USING gin (plays);
CREATE INDEX IF NOT EXISTS contact_intelligence_shared_history_idx ON public.contact_intelligence USING gin (shared_history jsonb_path_ops);

-- One pass recomputes both, for everyone. Cheap: regexes over a few thousand
-- career rows. Called by the daily relationship sync so new enrichment lands.
CREATE OR REPLACE FUNCTION public.refresh_shared_history_and_plays()
RETURNS integer LANGUAGE sql SET search_path TO 'public', 'pg_temp' AS $body$
  WITH roles AS (
    -- Every place a person has worked, current company included: someone at
    -- Captify now is as much a Captify person as someone who left.
    SELECT ci.contact_id,
           e->>'title' AS their_title,
           btrim(lower(regexp_replace(coalesce(e->>'company', ''), '[®™]', '', 'g'))) AS co,
           false AS current
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.dossier->'_direct'->'facts'->'career') = 'array'
           THEN c.dossier->'_direct'->'facts'->'career' ELSE '[]'::jsonb END) e
    -- Where they are NOW comes only from a profile read (current_company).
    -- contacts.company is whatever the record said when it was imported, often
    -- from Krish's own mailbox of the time: 360 contacts read "Amobee", a
    -- company renamed Nexxen in 2023. They did share the employer, so the row
    -- counts, but "now at Amobee" would be a false sentence on screen.
    UNION ALL
    SELECT ci.contact_id, ci.current_title AS their_title,
           btrim(lower(regexp_replace(coalesce(ci.current_company, ''), '[®™]', '', 'g'))) AS co,
           true AS current
    FROM public.contact_intelligence ci
    UNION ALL
    SELECT ci.contact_id, c.title AS their_title,
           btrim(lower(regexp_replace(coalesce(c.company, ''), '[®™]', '', 'g'))) AS co,
           false AS current
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
  ), hits AS (
    SELECT DISTINCT ON (r.contact_id, t.key)
           r.contact_id, t.key, t.label, t.closeness, r.their_title, r.current
    FROM roles r
    JOIN public.krish_tenures t ON r.co ~* t.pattern
    WHERE r.co <> ''
    -- Prefer the current role when someone is still there, so the line can
    -- say "now at Captify" rather than an old title.
    ORDER BY r.contact_id, t.key, r.current DESC
  ), shared AS (
    SELECT contact_id,
           jsonb_agg(jsonb_build_object(
             'key', key, 'label', label, 'closeness', closeness,
             'their_title', their_title, 'current', current)
             ORDER BY (closeness = 'close') DESC, label) AS history,
           bool_or(closeness = 'close') AS is_alumni
    FROM hits GROUP BY contact_id
  ), people AS (
    SELECT ci.contact_id,
           coalesce(s.history, '[]'::jsonb) AS history,
           coalesce(s.is_alumni, false) AS is_alumni,
           lower(coalesce(ci.current_title, c.title, '') || ' | ' || coalesce(ci.headline, '')) AS t
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    LEFT JOIN shared s ON s.contact_id = ci.contact_id
  ), played AS (
    SELECT contact_id, history,
      array_remove(ARRAY[
        CASE WHEN is_alumni THEN 'alumni' END,
        CASE WHEN t ~ '(operating partner|value[- ]creation|venture partner|head of platform|platform (director|lead|head)|portfolio (support|operations|director|services|growth|success)|\mchair(man|woman|person)?\M|vistage|\mypo\M|executive coach|ceo coach|leadership coach|fractional (cro|cmo|cco|coo|chief)|peer (group|advisory)|managing partner|agency (founder|principal|owner))'
             THEN 'multiplier' END,
        CASE WHEN t ~ '(\m(cro|cco|ceo|cmo|cdo)\M|chief (revenue|commercial|executive|marketing|growth|operating|digital|product)|head of (revenue|sales|commercial|growth|monetisation|monetization|partnerships)|commercial director|\mpresident\M|general manager|managing director|svp|evp|vice president|\mvp\M)'
             THEN 'buyer' END,
        CASE WHEN t ~ '(editor|journalist|reporter|correspondent|columnist|newsletter|substack|podcast|conference|programm(e|ing) (director|manager|lead)|curator|events? (director|lead|manager|producer)|content director|speaker bureau)'
             THEN 'amplifier' END,
        CASE WHEN t ~ '(founder|co-founder|cofounder)' AND t ~ '(\mai\M|artificial intelligence|\mllm|agentic|\magents?\M|genai|gen ai|machine learning)'
             THEN 'subject' END
      ], NULL) AS plays
    FROM people
  ), upd AS (
    UPDATE public.contact_intelligence ci
    SET shared_history = p.history, plays = p.plays
    FROM played p
    WHERE ci.contact_id = p.contact_id
      AND (ci.shared_history IS DISTINCT FROM p.history OR ci.plays IS DISTINCT FROM p.plays)
    RETURNING 1
  )
  SELECT count(*)::int FROM upd
$body$;

-- Browse the network by what people can do for Krish rather than by what they
-- match. One function for all five plays, so the network tab has one push mode
-- with five doors rather than five special lists. With an employer it narrows
-- to the people who were at that one.
--
-- Order: inside the alumni play the senior people first, because a former
-- colleague who now holds a budget is the warmest buyer there is. Inside every
-- other play the alumni first, because a multiplier who once sat beside him is
-- a far easier first message than one who never did. Then measured warmth over
-- guessed, then warmth, then how much is known.
DROP FUNCTION IF EXISTS public.network_alumni(text, integer);
CREATE OR REPLACE FUNCTION public.network_by_play(p_play text DEFAULT 'alumni', p_employer text DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS TABLE(contact_id uuid)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $body$
  SELECT ci.contact_id
  FROM public.contact_intelligence ci
  JOIN public.contacts c ON c.id = ci.contact_id
  WHERE ci.is_person
    AND c.status IS DISTINCT FROM 'do_not_contact'
    AND (p_play IS NULL OR p_play = ANY(ci.plays))
    AND (p_employer IS NULL
         OR ci.shared_history @> jsonb_build_array(jsonb_build_object('key', p_employer)))
  ORDER BY
    CASE WHEN p_play = 'alumni' OR p_play IS NULL
         THEN ('buyer' = ANY(ci.plays) OR 'multiplier' = ANY(ci.plays))
         ELSE ('alumni' = ANY(ci.plays)) END DESC,
    (ci.warmth_source = 'measured') DESC,
    ci.warmth DESC NULLS LAST,
    ci.completeness DESC
  LIMIT least(coalesce(p_limit, 40), 200)
$body$;

SELECT public.refresh_shared_history_and_plays();
