-- Make enrichment reach the surface, automatically, forever.
--
-- ── The failure this fixes ──────────────────────────────────────────────────
-- 1,700 Coresignal credits bought profiles for 169 people. Measured immediately
-- afterwards:
--
--   169 of 169  contact_intelligence.updated_at OLDER than the enrichment
--   130 of 169  intel_doc does not contain the headline that was bought
--    90 of 169  still intel_method='rules_v1', so the Network tab was badging
--               them "thin evidence: no profile was ever read" while a full
--               profile sat in the row
--
-- The data landed in contacts.raw — an untyped jsonb drawer nothing queries.
-- Search ranks on intel_doc, which was never rebuilt. follower_count, the one
-- honest hub signal in the whole payload, was invisible to the ranker, the UI
-- and every query.
--
-- The root cause is not that one script forgot. It is that rebuilding intel_doc
-- was a CONVENTION every importer had to remember, and conventions lose. This
-- migration makes it a trigger, so the next enrichment reaches search whether
-- or not its author thought about it.
--
-- ── Why typed columns rather than more jsonb ────────────────────────────────
-- ADR-011 settled that the judgment layer is a sibling table, not columns on
-- `contacts`, because `contacts` is anon-readable and these are private
-- assessments. Enrichment facts belong on that same sibling for the same
-- reason, and typed rather than blobbed because a value in jsonb cannot be
-- ranked, filtered, indexed or rendered without every reader re-deriving it.

-- ── 1. The facts, typed ────────────────────────────────────────────────────
ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS followers        int,
  ADD COLUMN IF NOT EXISTS headline         text,
  ADD COLUMN IF NOT EXISTS summary          text,
  ADD COLUMN IF NOT EXISTS current_title    text,
  ADD COLUMN IF NOT EXISTS current_company  text,
  ADD COLUMN IF NOT EXISTS experience_count int,
  ADD COLUMN IF NOT EXISTS enriched_source  text,
  ADD COLUMN IF NOT EXISTS enriched_at      timestamptz;

COMMENT ON COLUMN public.contact_intelligence.followers IS
  'LinkedIn follower count. The hub signal. Deliberately NOT connections_count, which LinkedIn caps at 500 for its "500+" display — every consequential person maxes it out, so it carries no information. Measured on the first 169 enriched: followers averaged 10,526 and spread from 161 to 7,284+, connections_count was 500 for nearly all of them.';
COMMENT ON COLUMN public.contact_intelligence.enriched_source IS
  'Which provider asserted these fields (coresignal | apify | pdl | apollo). Kept so a later, better source can overwrite a worse one, and so a provider found to be wrong can be undone by source rather than by guesswork.';

-- ── 2. Staleness that degrades rather than breaks ──────────────────────────
-- NOT a nulled embedding. Nulling would drop the person out of semantic recall
-- entirely for the window between enrichment and the re-embed job — making the
-- search worse at the exact moment we improved the data. embed_stale keeps the
-- old vector working while marking it for refresh.
ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS embed_stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ci_embed_stale_idx
  ON public.contact_intelligence (updated_at) WHERE embed_stale;

-- ── 3. How complete is this person, 0-100 ──────────────────────────────────
-- The number that lets the Control Center say what is missing, what a run would
-- buy, and what actually improved afterwards. Weighted by what makes a contact
-- ACTIONABLE rather than by how many fields are populated: a verified profile
-- URL you can click is worth more than a bio you cannot act on.
CREATE OR REPLACE FUNCTION public.contact_completeness(
  p_name_quality text, p_has_linkedin boolean, p_has_email boolean,
  p_headline text, p_summary text, p_followers int, p_why_them text,
  p_enriched_at timestamptz
) RETURNS smallint
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (
      (CASE WHEN p_name_quality = 'full' THEN 20 ELSE 0 END)          -- findable at all
    + (CASE WHEN p_has_linkedin           THEN 25 ELSE 0 END)          -- one click to them
    + (CASE WHEN p_has_email              THEN 15 ELSE 0 END)          -- a channel that carries a message
    + (CASE WHEN coalesce(p_headline, p_summary) IS NOT NULL THEN 15 ELSE 0 END)
    + (CASE WHEN p_followers IS NOT NULL  THEN 10 ELSE 0 END)          -- hub score
    + (CASE WHEN p_why_them IS NOT NULL   THEN 10 ELSE 0 END)          -- a reason to talk to them
    -- Freshness, not presence. A title collected two years ago is asserted with
    -- the same confidence as one collected today unless something decays it.
    + (CASE WHEN p_enriched_at > now() - interval '12 months' THEN 5
            WHEN p_enriched_at IS NOT NULL THEN 2 ELSE 0 END)
  )::smallint;
$$;

ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS completeness smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ci_completeness_idx ON public.contact_intelligence (completeness DESC);

-- ── 4. The trigger that makes it automatic ─────────────────────────────────
-- Composes intel_doc from every part that carries signal, recomputes
-- completeness, and marks the vector stale when the text actually changed.
--
-- Reads `contacts` for identity and reach, the same shape as ci_set_geo_code.
-- The two live in one trigger because they need the same lookup and firing
-- twice would double the read for no benefit.
CREATE OR REPLACE FUNCTION public.ci_rebuild_doc_and_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  c_name text; c_title text; c_company text; c_location text;
  c_has_li boolean; c_has_email boolean;
  new_doc text;
BEGIN
  SELECT c.full_name, c.title, c.company, c.location,
         c.linkedin_url IS NOT NULL, c.email_normalized IS NOT NULL
    INTO c_name, c_title, c_company, c_location, c_has_li, c_has_email
  FROM public.contacts c WHERE c.id = NEW.contact_id;

  -- Enrichment wins over import for title and company: it was read from a
  -- profile, where the import value was typed by whoever built the sheet.
  new_doc := btrim(regexp_replace(concat_ws(' · ',
      NULLIF(NEW.who, ''), NULLIF(NEW.why_them, ''), NULLIF(NEW.hook, ''),
      NULLIF(c_name, ''),
      NULLIF(coalesce(NEW.current_title, c_title), ''),
      NULLIF(coalesce(NEW.current_company, c_company), ''),
      NULLIF(NEW.industry, ''), NULLIF(coalesce(c_location, NEW.country), ''),
      NULLIF(NEW.headline, ''), NULLIF(NEW.summary, '')
    ), '\s+', ' ', 'g'));

  -- Only mark the vector stale when the indexed text actually moved. An
  -- unrelated column update must not queue a paid embedding call.
  IF new_doc IS DISTINCT FROM NEW.intel_doc THEN
    NEW.intel_doc := new_doc;
    NEW.embed_stale := true;
  END IF;

  NEW.completeness := public.contact_completeness(
    NEW.name_quality, coalesce(c_has_li, false), coalesce(c_has_email, false),
    NEW.headline, NEW.summary, NEW.followers, NEW.why_them, NEW.enriched_at);

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ci_rebuild_doc_trg ON public.contact_intelligence;
CREATE TRIGGER ci_rebuild_doc_trg
  BEFORE INSERT OR UPDATE OF
    who, why_them, hook, industry, country, name_quality,
    followers, headline, summary, current_title, current_company, enriched_at
  ON public.contact_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.ci_rebuild_doc_and_score();

-- The identity side. A contact gaining a LinkedIn URL or an email changes that
-- person's completeness, and nothing on contact_intelligence fired.
CREATE OR REPLACE FUNCTION public.contacts_refresh_completeness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.linkedin_url IS DISTINCT FROM OLD.linkedin_url
     OR NEW.email_normalized IS DISTINCT FROM OLD.email_normalized
     OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    UPDATE public.contact_intelligence ci
       SET completeness = public.contact_completeness(
             ci.name_quality, NEW.linkedin_url IS NOT NULL,
             NEW.email_normalized IS NOT NULL, ci.headline, ci.summary,
             ci.followers, ci.why_them, ci.enriched_at)
     WHERE ci.contact_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_completeness_trg ON public.contacts;
CREATE TRIGGER contacts_completeness_trg
  AFTER UPDATE OF linkedin_url, email_normalized, full_name ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_refresh_completeness();

REVOKE ALL ON FUNCTION public.contact_completeness FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_completeness TO service_role;
