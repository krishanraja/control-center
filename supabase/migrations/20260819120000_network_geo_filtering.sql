-- Geography for the Network tab: resolve where a person is, then let the
-- operator filter and ask by it.
--
-- ── Why this is not just `WHERE country = 'United Kingdom'` ─────────────────
-- Because contact_intelligence.country is populated for 3,679 of 10,597 people.
-- Measured coverage, by relationship tier, before this migration:
--
--   tier                people   country known
--   1_reciprocated        164     9   (5.5%)   <- the people who have REPLIED
--   2_core_network        128    93  (72.7%)
--   3_known_network       575   464  (80.7%)
--   4_owned_network      5913  3113  (52.6%)
--   5_cold_lead          3817     0   (0.0%)
--
-- A naive country filter would therefore hide 155 of the 164 people Krish knows
-- best the moment he clicks "UK". That is the failure this file is written
-- around, and it is addressed three ways:
--
--   1. RESOLVE from more than one signal. contact_intelligence.country, then
--      contacts.location, then the email ccTLD. That lifts known geography from
--      3,679 to ~4,600 people and is the whole reason geo_code exists as a
--      column rather than the query reading `country` directly.
--   2. Keep it SOFT by default. Geography enters the scorer as a weighted
--      constraint like every other parsed signal, so "who do I know in London"
--      ranks London up without deleting everyone whose location we never
--      learned. Hard filtering stays an explicit, labelled operator choice.
--   3. Publish the unknowns. network_geo_facets() returns the unresolved count
--      alongside every country, so the UI can say "6,392 people have no location
--      on file" instead of implying an empty result means an empty network.

-- ── 1. The country reference ───────────────────────────────────────────────
-- A table, not a CASE expression, for three reasons: the facets endpoint needs
-- display labels, an alias ("Britain", "the states", "Sydney") is data rather
-- than logic and should be addable without a deploy, and the ccTLD mapping
-- belongs next to the country it implies.
--
-- Seeded with every country that actually appears in the corpus (72 of them)
-- plus the aliases a person would type. Anything outside the table resolves to
-- NULL, which reads as "unknown", never as a wrong country.
CREATE TABLE IF NOT EXISTS public.geo_country (
  code    text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name    text NOT NULL,
  -- Lowercase alternates: informal names, demonyms, and the major cities that
  -- turn up in a free-text location field. Cities carry the "New York, NY" and
  -- "Sydney" cases; two-letter US state codes are deliberately NOT here,
  -- because "CA" is Canada far more often than it is California and a wrong
  -- country is worse than an unknown one.
  aliases text[] NOT NULL DEFAULT '{}',
  -- Email ccTLD suffixes that imply this country. Only unambiguous ones: .au
  -- and .uk are worth 387 extra resolved people between them, while .io, .ai,
  -- .co and .me are sold globally and imply nothing.
  cctld   text[] NOT NULL DEFAULT '{}',
  -- Offered as a filter chip in the UI without the operator opening a country
  -- list. GB, AU and US, matching the geography default already documented in
  -- docs/ICP.md and docs/APOLLO_ICP_RUBRIC.md ("Krish's markets"). The filter
  -- and the sourcing rubric should not disagree about which three countries
  -- matter.
  featured boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.geo_country IS
  'ISO-3166 alpha-2 reference for network geography. aliases and cctld are the resolution surface; featured drives the default filter chips.';

INSERT INTO public.geo_country (code, name, aliases, cctld, featured) VALUES
  ('GB', 'United Kingdom',
   ARRAY['uk','u.k.','great britain','britain','british','england','english','scotland','scottish','wales','welsh','northern ireland',
         'london','manchester','birmingham','edinburgh','glasgow','bristol','leeds','cambridge','oxford'],
   ARRAY['.uk'], true),
  ('AU', 'Australia',
   ARRAY['au','aus','aussie','australian','oz',
         'sydney','melbourne','brisbane','perth','adelaide','canberra','gold coast','hobart','darwin','newcastle','wollongong',
         'nsw','new south wales','victoria','queensland','western australia','south australia','tasmania'],
   ARRAY['.au'], true),
  ('US', 'United States',
   ARRAY['usa','u.s.','u.s.a.','us','america','american','united states of america','the states','stateside',
         'new york','new york city','nyc','new york city metropolitan area','san francisco','sf','bay area','silicon valley',
         'los angeles','la','chicago','boston','austin','seattle','denver','atlanta','miami','washington dc','washington d.c.',
         'california','texas','florida'],
   ARRAY['.us'], true),
  ('NZ', 'New Zealand', ARRAY['nz','kiwi','auckland','wellington','christchurch'], ARRAY['.nz'], false),
  ('CA', 'Canada',       ARRAY['canadian','toronto','vancouver','montreal','ottawa','calgary'], ARRAY['.ca'], false),
  ('IE', 'Ireland',      ARRAY['republic of ireland','irish','dublin'], ARRAY['.ie'], false),
  ('SG', 'Singapore',    ARRAY['singaporean'], ARRAY['.sg'], false),
  ('IN', 'India',        ARRAY['indian','bangalore','bengaluru','mumbai','delhi','hyderabad','chennai','pune'], ARRAY['.in'], false),
  ('AE', 'United Arab Emirates', ARRAY['uae','emirates','dubai','abu dhabi'], ARRAY['.ae'], false),
  ('DE', 'Germany',      ARRAY['german','deutschland','berlin','munich','hamburg'], ARRAY['.de'], false),
  ('FR', 'France',       ARRAY['french','paris'], ARRAY['.fr'], false),
  ('ES', 'Spain',        ARRAY['spanish','espana','españa','madrid','barcelona'], ARRAY['.es'], false),
  ('IT', 'Italy',        ARRAY['italian','italia','milan','rome'], ARRAY['.it'], false),
  ('NL', 'Netherlands',  ARRAY['holland','dutch','amsterdam'], ARRAY['.nl'], false),
  ('BE', 'Belgium',      ARRAY['belgian','brussels'], ARRAY['.be'], false),
  ('CH', 'Switzerland',  ARRAY['swiss','zurich','geneva'], ARRAY['.ch'], false),
  ('AT', 'Austria',      ARRAY['austrian','vienna'], ARRAY['.at'], false),
  ('SE', 'Sweden',       ARRAY['swedish','stockholm'], ARRAY['.se'], false),
  ('NO', 'Norway',       ARRAY['norwegian','oslo'], ARRAY['.no'], false),
  ('DK', 'Denmark',      ARRAY['danish','copenhagen'], ARRAY['.dk'], false),
  ('FI', 'Finland',      ARRAY['finnish','helsinki'], ARRAY['.fi'], false),
  ('PT', 'Portugal',     ARRAY['portuguese','lisbon'], ARRAY['.pt'], false),
  ('PL', 'Poland',       ARRAY['polish','warsaw'], ARRAY['.pl'], false),
  ('CZ', 'Czechia',      ARRAY['czech republic','czech','prague'], ARRAY['.cz'], false),
  ('SK', 'Slovakia',     ARRAY['slovak','bratislava'], ARRAY['.sk'], false),
  ('RO', 'Romania',      ARRAY['romanian','bucharest'], ARRAY['.ro'], false),
  ('BG', 'Bulgaria',     ARRAY['bulgarian','sofia'], ARRAY['.bg'], false),
  ('GR', 'Greece',       ARRAY['greek','athens'], ARRAY['.gr'], false),
  ('HR', 'Croatia',      ARRAY['croatian','zagreb'], ARRAY['.hr'], false),
  ('RS', 'Serbia',       ARRAY['serbian','belgrade'], ARRAY['.rs'], false),
  ('SI', 'Slovenia',     ARRAY['slovenian','ljubljana'], ARRAY['.si'], false),
  ('HU', 'Hungary',      ARRAY['hungarian','budapest'], ARRAY['.hu'], false),
  ('MK', 'North Macedonia', ARRAY['macedonia','macedonian','skopje'], ARRAY['.mk'], false),
  ('LT', 'Lithuania',    ARRAY['lithuanian','vilnius'], ARRAY['.lt'], false),
  ('LV', 'Latvia',       ARRAY['latvian','riga'], ARRAY['.lv'], false),
  ('EE', 'Estonia',      ARRAY['estonian','tallinn'], ARRAY['.ee'], false),
  ('BY', 'Belarus',      ARRAY['belarusian','minsk'], ARRAY['.by'], false),
  ('UA', 'Ukraine',      ARRAY['ukrainian','kyiv','kiev'], ARRAY['.ua'], false),
  ('LU', 'Luxembourg',   ARRAY[]::text[], ARRAY['.lu'], false),
  ('MT', 'Malta',        ARRAY['maltese','valletta'], ARRAY['.mt'], false),
  ('CY', 'Cyprus',       ARRAY['cypriot','nicosia'], ARRAY['.cy'], false),
  ('IM', 'Isle of Man',  ARRAY['manx'], ARRAY['.im'], false),
  ('JE', 'Jersey',       ARRAY[]::text[], ARRAY['.je'], false),
  ('TR', 'Türkiye',      ARRAY['turkey','turkiye','turkish','istanbul','ankara'], ARRAY['.tr'], false),
  ('IL', 'Israel',       ARRAY['israeli','tel aviv','jerusalem'], ARRAY['.il'], false),
  ('SA', 'Saudi Arabia', ARRAY['saudi','riyadh','jeddah'], ARRAY['.sa'], false),
  ('QA', 'Qatar',        ARRAY['qatari','doha'], ARRAY['.qa'], false),
  ('KW', 'Kuwait',       ARRAY['kuwaiti'], ARRAY['.kw'], false),
  ('EG', 'Egypt',        ARRAY['egyptian','cairo'], ARRAY['.eg'], false),
  ('MA', 'Morocco',      ARRAY['moroccan','casablanca'], ARRAY['.ma'], false),
  ('NG', 'Nigeria',      ARRAY['nigerian','lagos','abuja'], ARRAY['.ng'], false),
  ('KE', 'Kenya',        ARRAY['kenyan','nairobi'], ARRAY['.ke'], false),
  ('ZA', 'South Africa', ARRAY['south african','johannesburg','cape town'], ARRAY['.za'], false),
  ('ZM', 'Zambia',       ARRAY['zambian','lusaka'], ARRAY['.zm'], false),
  ('BW', 'Botswana',     ARRAY['gaborone'], ARRAY['.bw'], false),
  ('JP', 'Japan',        ARRAY['japanese','tokyo','osaka'], ARRAY['.jp'], false),
  ('CN', 'China',        ARRAY['chinese','beijing','shanghai','shenzhen'], ARRAY['.cn'], false),
  ('HK', 'Hong Kong SAR', ARRAY['hong kong','hongkong','hk'], ARRAY['.hk'], false),
  ('TW', 'Taiwan',       ARRAY['taiwanese','taipei'], ARRAY['.tw'], false),
  ('KR', 'South Korea',  ARRAY['korea','korean','seoul'], ARRAY['.kr'], false),
  ('TH', 'Thailand',     ARRAY['thai','bangkok'], ARRAY['.th'], false),
  ('VN', 'Vietnam',      ARRAY['vietnamese','hanoi','ho chi minh city','saigon'], ARRAY['.vn'], false),
  ('MY', 'Malaysia',     ARRAY['malaysian','kuala lumpur'], ARRAY['.my'], false),
  ('ID', 'Indonesia',    ARRAY['indonesian','jakarta'], ARRAY['.id'], false),
  ('PH', 'Philippines',  ARRAY['filipino','manila'], ARRAY['.ph'], false),
  ('PK', 'Pakistan',     ARRAY['pakistani','karachi','lahore'], ARRAY['.pk'], false),
  ('LK', 'Sri Lanka',    ARRAY['sri lankan','colombo'], ARRAY['.lk'], false),
  ('BD', 'Bangladesh',   ARRAY['bangladeshi','dhaka'], ARRAY['.bd'], false),
  ('GE', 'Georgia',      ARRAY['georgian','tbilisi'], ARRAY['.ge'], false),
  ('BR', 'Brazil',       ARRAY['brazilian','brasil','sao paulo','são paulo','rio de janeiro'], ARRAY['.br'], false),
  ('MX', 'Mexico',       ARRAY['mexican','mexico city'], ARRAY['.mx'], false),
  ('AR', 'Argentina',    ARRAY['argentinian','argentine','buenos aires'], ARRAY['.ar'], false),
  ('CL', 'Chile',        ARRAY['chilean','santiago'], ARRAY['.cl'], false),
  -- No ccTLD for Colombia: .co is sold worldwide as a vanity domain and
  -- resolving it to Bogota would be wrong far more often than right.
  ('CO', 'Colombia',     ARRAY['colombian','bogota','bogotá','medellin'], ARRAY[]::text[], false),
  ('EC', 'Ecuador',      ARRAY['ecuadorian','quito'], ARRAY['.ec'], false),
  ('PE', 'Peru',         ARRAY['peruvian','lima'], ARRAY['.pe'], false),
  ('CR', 'Costa Rica',   ARRAY['costa rican','san jose'], ARRAY['.cr'], false),
  ('GT', 'Guatemala',    ARRAY['guatemalan'], ARRAY['.gt'], false),
  ('PA', 'Panama',       ARRAY['panamanian'], ARRAY['.pa'], false),
  ('PR', 'Puerto Rico',  ARRAY['puerto rican','san juan'], ARRAY['.pr'], false)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      aliases = EXCLUDED.aliases,
      cctld = EXCLUDED.cctld,
      featured = EXCLUDED.featured;

-- Alias lookup runs once per search (not per row), but the corpus backfill runs
-- it 10,597 times, so it gets an index rather than 10,597 sequential scans.
CREATE INDEX IF NOT EXISTS geo_country_aliases_gin ON public.geo_country USING gin (aliases);
CREATE INDEX IF NOT EXISTS geo_country_name_lower  ON public.geo_country (lower(name));

ALTER TABLE public.geo_country ENABLE ROW LEVEL SECURITY;
-- Readable by the dashboard: this is a country list, not a judgment about a
-- person, and it carries none of the privacy weight contact_intelligence does.
DROP POLICY IF EXISTS geo_country_read ON public.geo_country;
CREATE POLICY geo_country_read ON public.geo_country FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS geo_country_service ON public.geo_country;
CREATE POLICY geo_country_service ON public.geo_country FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.geo_country TO anon, authenticated;


-- ── 2. Resolution ──────────────────────────────────────────────────────────

/** Free text to ISO-3166 alpha-2, or NULL.
 *
 *  Accepts what the UI sends ("GB"), what the corpus stores ("United Kingdom"),
 *  and what a person types or says ("the UK", "Britain", "London").
 *
 *  Order matters. A bare two-letter input is treated as an ISO code ONLY when
 *  it is the whole string, so the UI's "CA" is Canada. Inside a comma-separated
 *  location the code path is skipped entirely and only names, cities and
 *  aliases are consulted, because "San Francisco, CA" is not Canada. Segments
 *  are read right to left, since "City, Country" is the common order. */
CREATE OR REPLACE FUNCTION public.network_geo_canon(p_raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  s     text;
  seg   text;
  hit   text;
BEGIN
  s := lower(btrim(coalesce(p_raw, '')));
  -- Collapse whitespace and drop the trailing punctuation a spoken query leaves.
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'), ' .,;');
  IF s = '' OR s IN ('unknown','undefined','null','none','n/a','na','remote','nomadic','global','worldwide','earth','emea','apac') THEN
    RETURN NULL;
  END IF;

  -- Whole-string ISO code. Only here, never per segment.
  IF s ~ '^[a-z]{2}$' THEN
    SELECT code INTO hit FROM public.geo_country WHERE code = upper(s);
    IF hit IS NOT NULL THEN RETURN hit; END IF;
  END IF;

  -- Whole string as a name or alias.
  SELECT code INTO hit FROM public.geo_country
   WHERE lower(name) = s OR s = ANY(aliases) LIMIT 1;
  IF hit IS NOT NULL THEN RETURN hit; END IF;

  -- Comma-separated location, read right to left.
  IF position(',' IN s) > 0 THEN
    FOREACH seg IN ARRAY (
      SELECT array_agg(x ORDER BY ord DESC)
      FROM unnest(string_to_array(s, ',')) WITH ORDINALITY AS t(x, ord)
    ) LOOP
      seg := btrim(seg);
      CONTINUE WHEN seg = '';
      SELECT code INTO hit FROM public.geo_country
       WHERE lower(name) = seg OR seg = ANY(aliases) LIMIT 1;
      IF hit IS NOT NULL THEN RETURN hit; END IF;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.network_geo_canon IS
  'Free text (ISO code, country name, alias, city, "City, Country") to ISO-3166 alpha-2, or NULL when unrecognised. Never guesses.';

/** ccTLD of an email address to a country, or NULL.
 *
 *  Only the suffixes listed in geo_country.cctld count. Generic and
 *  vanity TLDs (.com, .io, .ai, .co, .me) are sold worldwide and are read as
 *  unknown rather than as their nominal country, which is the difference
 *  between 387 correctly resolved people and several thousand wrong ones. */
CREATE OR REPLACE FUNCTION public.network_geo_from_email(p_email text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT g.code
  FROM public.geo_country g
  WHERE p_email IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(g.cctld) t
      WHERE lower(btrim(p_email)) LIKE '%' || t
    )
  LIMIT 1;
$$;

/** The resolution chain, in confidence order.
 *
 *  contact_intelligence.country is the enrichment layer's own answer and is
 *  trusted first. contacts.location is the raw import field and recovers 526
 *  people the enrichment never scored. The email ccTLD is last and recovers a
 *  further ~390, almost all Australian. */
CREATE OR REPLACE FUNCTION public.network_geo_resolve(p_country text, p_location text, p_email text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    public.network_geo_canon(p_country),
    public.network_geo_canon(p_location),
    public.network_geo_from_email(p_email)
  );
$$;


-- ── 3. The stored column ───────────────────────────────────────────────────
-- Denormalised onto contact_intelligence rather than resolved per query, for
-- one specific reason: network_search's candidate recall paths read
-- contact_intelligence alone and are LIMIT-capped at 400 rows each. A geography
-- filter applied after recall would search a pool that is already 83% not-UK,
-- so "UK" over a British question would return a handful of the 382 British
-- people and look like a small network. An indexed column lets the filter push
-- down into every recall path instead.
--
-- It also cannot be a GENERATED column: the resolution reads contacts and
-- geo_country, and a generated expression must be immutable and single-table.
ALTER TABLE public.contact_intelligence ADD COLUMN IF NOT EXISTS geo_code text;

COMMENT ON COLUMN public.contact_intelligence.geo_code IS
  'ISO-3166 alpha-2, resolved from country, then contacts.location, then the email ccTLD. NULL means unknown and is never treated as a country.';

CREATE INDEX IF NOT EXISTS ci_geo_code ON public.contact_intelligence (geo_code);

/** Re-resolve geo_code across the corpus. Returns the number of rows changed.
 *
 *  Run after an import, or after geo_country gains an alias. The triggers below
 *  keep ordinary edits current, so this is a repair and backfill tool rather
 *  than something that has to be scheduled. */
CREATE OR REPLACE FUNCTION public.refresh_network_geo()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE n bigint;
BEGIN
  WITH resolved AS (
    SELECT ci.contact_id,
           public.network_geo_resolve(ci.country, c.location, c.email) AS code
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
  ), upd AS (
    UPDATE public.contact_intelligence ci
       SET geo_code = r.code
      FROM resolved r
     WHERE r.contact_id = ci.contact_id
       AND ci.geo_code IS DISTINCT FROM r.code
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_network_geo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_network_geo() TO service_role;

-- Keep it current on write, so geo_code cannot drift the way an import-time
-- derived column silently does. Both sides of the join are covered: the
-- judgment layer's own country, and the identity row's location and email.
CREATE OR REPLACE FUNCTION public.ci_set_geo_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE loc text; em text;
BEGIN
  SELECT c.location, c.email INTO loc, em FROM public.contacts c WHERE c.id = NEW.contact_id;
  NEW.geo_code := public.network_geo_resolve(NEW.country, loc, em);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ci_geo_code_trg ON public.contact_intelligence;
CREATE TRIGGER ci_geo_code_trg
  BEFORE INSERT OR UPDATE OF country, contact_id ON public.contact_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.ci_set_geo_code();

CREATE OR REPLACE FUNCTION public.contacts_refresh_geo_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.contact_intelligence ci
     SET geo_code = public.network_geo_resolve(ci.country, NEW.location, NEW.email)
   WHERE ci.contact_id = NEW.id
     AND ci.geo_code IS DISTINCT FROM public.network_geo_resolve(ci.country, NEW.location, NEW.email);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contacts_geo_code_trg ON public.contacts;
CREATE TRIGGER contacts_geo_code_trg
  AFTER UPDATE OF location, email ON public.contacts
  FOR EACH ROW
  WHEN (OLD.location IS DISTINCT FROM NEW.location OR OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.contacts_refresh_geo_code();

-- Backfill. Written as a direct UPDATE rather than SELECT refresh_network_geo()
-- so the migration is self-contained if the function is later changed.
UPDATE public.contact_intelligence ci
   SET geo_code = public.network_geo_resolve(ci.country, c.location, c.email)
  FROM public.contacts c
 WHERE c.id = ci.contact_id
   AND ci.geo_code IS DISTINCT FROM public.network_geo_resolve(ci.country, c.location, c.email);


-- ── 4. Facets ──────────────────────────────────────────────────────────────
/** Every country present in the network, with its count, plus the unresolved
 *  total as a row with a NULL code.
 *
 *  The unknown row is the point. Geography is known for roughly 43% of the
 *  corpus, so a filter UI that shows only the countries it found would imply
 *  the other 57% do not exist. Returning the unknown count lets the surface say
 *  what is actually true: 382 people are in the UK, and 6,000 are somewhere we
 *  never recorded. */
CREATE OR REPLACE FUNCTION public.network_geo_facets()
RETURNS TABLE (code text, name text, featured boolean, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT ci.geo_code
    FROM public.contact_intelligence ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.is_person
      AND c.status IS DISTINCT FROM 'do_not_contact'
  )
  SELECT g.code, g.name, g.featured, count(s.geo_code)
    FROM public.geo_country g
    JOIN scoped s ON s.geo_code = g.code
   GROUP BY g.code, g.name, g.featured
  UNION ALL
  SELECT NULL, 'Location unknown', false, count(*) FROM scoped WHERE geo_code IS NULL
   ORDER BY 4 DESC;
$$;

COMMENT ON FUNCTION public.network_geo_facets IS
  'Per-country people counts for the Network geo filter, plus a NULL-code row carrying the number of people with no resolved location.';

REVOKE ALL ON FUNCTION public.network_geo_facets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_geo_facets() TO service_role;


-- ── 5. network_search, now geography-aware ─────────────────────────────────
-- Three changes, and only three:
--
--   * `p_countries` — a HARD geography filter, alongside p_tiers/p_roles/
--     p_min_conf. It is the operator's explicit choice, never the planner's.
--   * a `geo` soft constraint — what the planner emits for "who do I know in
--     London". Weighted partial credit like every other constraint, so it ranks
--     rather than filters, and a person whose location we never learned is
--     demoted rather than deleted.
--   * `geo_code` on the way out, so a row can say where the person is.
--
-- The geography filter pushes DOWN into candidate recall rather than being
-- applied to its output. That is the whole reason this is not a two-line
-- change. Each recall path is capped at p_pool (400) rows; filtering their
-- union afterwards would mean a UK search examined 400 mostly-Australian
-- neighbours and returned the ~30 British ones inside them, out of 382. Scoping
-- each path to the requested countries spends those 400 slots where the answer
-- actually is.
--
-- Dropped rather than replaced: the return type gains a column, and
-- CREATE OR REPLACE cannot change a function's result type.
DROP FUNCTION IF EXISTS public.network_search(text, text, text, jsonb, text[], text, text[], int, int, int);

CREATE FUNCTION public.network_search(
  p_query_vec   text    DEFAULT NULL,   -- pgvector literal, or NULL to skip the semantic term
  p_keywords    text    DEFAULT NULL,   -- websearch_to_tsquery input, or NULL
  p_venture     text    DEFAULT NULL,   -- venture key for the multiplier
  p_constraints jsonb   DEFAULT '[]'::jsonb,  -- [{field, values[], weight}] — SOFT
  p_tiers       text[]  DEFAULT NULL,   -- explicit UI filter — HARD
  p_min_conf    text    DEFAULT NULL,   -- explicit UI filter — HARD
  p_roles       text[]  DEFAULT NULL,   -- explicit UI filter — HARD
  p_countries   text[]  DEFAULT NULL,   -- explicit UI filter — HARD. ISO-2 or any
                                        -- text network_geo_canon understands.
  p_limit       int     DEFAULT 40,
  p_pool        int     DEFAULT 400,   -- per-path recall depth (semantic/lexical/venture/geo)
  p_floor       int     DEFAULT 200    -- query-independent relationship floor
)
RETURNS TABLE (
  contact_id uuid,
  full_name text,
  company text,
  title text,
  email text,
  linkedin_url text,
  who text,
  why_them text,
  hook text,
  risk text,
  roles text[],
  surface_when text[],
  network_tier text,
  best_channel text,
  reachable_via text[],
  confidence text,
  intel_method text,
  seniority text,
  country text,
  geo_code text,
  industry text,
  venture_scores jsonb,
  thin_evidence boolean,
  match_score numeric,
  query_relevance numeric,
  s_semantic numeric,
  s_lexical numeric,
  s_constraint numeric,
  s_relationship numeric,
  s_actionability numeric,
  venture_multiplier numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH q AS (
  SELECT
    CASE WHEN p_query_vec IS NULL OR p_query_vec = '' THEN NULL
         ELSE p_query_vec::vector END                        AS qvec,
    -- OR the terms, do not AND them. websearch_to_tsquery defaults to AND, and
    -- measured against the real corpus that is fatal: "chief marketing officer
    -- bank AI" required all five lexemes and matched 4 rows out of 10,670,
    -- while "podcast guest shipped AI product" matched zero. A search promising
    -- to always return answers cannot have its keyword tier silently switch off
    -- as the query gets more specific. Rewriting the separators to `or` keeps
    -- websearch's safe parsing (it never raises on arbitrary user text, unlike
    -- to_tsquery) while making every additional term add recall instead of
    -- removing it.
    CASE WHEN p_keywords IS NULL OR btrim(p_keywords) = '' THEN NULL
         ELSE websearch_to_tsquery('english',
                regexp_replace(btrim(p_keywords), '\s+', ' or ', 'g')) END AS tsq,
    -- Pre-PARSED, not just pre-split. The coverage term below runs once per
    -- candidate row, and building a tsquery from text is not free: parsing the
    -- same six words a thousand times was measurable. Parse once here, match
    -- many times below.
    CASE WHEN p_keywords IS NULL OR btrim(p_keywords) = '' THEN NULL
         ELSE (SELECT array_agg(plainto_tsquery('english', lexeme))
               FROM unnest(to_tsvector('english', p_keywords))) END AS lexqueries,
    -- The hard geography filter, canonicalised once. NULLIF on the empty array
    -- is deliberate: a country list where nothing was recognised means we did
    -- not understand the request, and answering it with zero people would be a
    -- confident wrong answer. It degrades to no filter, exactly like every
    -- other unparseable input in this function.
    NULLIF(
      (SELECT array_agg(DISTINCT g) FROM (
         SELECT public.network_geo_canon(x) AS g FROM unnest(coalesce(p_countries, '{}')) x
       ) z WHERE g IS NOT NULL),
      '{}'::text[]
    ) AS geos
),
cons AS (
  -- Constraints, with geography canonicalised ONCE rather than once per
  -- candidate row. network_geo_canon reads a table, so it is stable rather than
  -- immutable, and calling it inside the per-row scoring lateral would run it
  -- ~10,000 times per search for a value that cannot change between rows.
  --
  -- Both 'geo' and 'country' are accepted from the planner and normalised to
  -- 'geo'. A geo constraint whose values do not resolve to any country is
  -- DROPPED, not kept empty: an empty value list would score zero for everyone
  -- and quietly penalise the whole corpus for one unrecognised place name.
  SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb) AS c
  FROM (
    SELECT
      ord,
      CASE WHEN el->>'field' IN ('geo', 'country')
        THEN jsonb_build_object('field', 'geo',
                                'weight', coalesce(el->'weight', to_jsonb(1.0::float8)),
                                'values', codes)
        ELSE el END AS e,
      (el->>'field' IN ('geo', 'country')) AS is_geo,
      codes
    FROM jsonb_array_elements(coalesce(p_constraints, '[]'::jsonb)) WITH ORDINALITY AS a(el, ord)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT z.g) AS codes
      FROM (SELECT public.network_geo_canon(v) AS g
            FROM jsonb_array_elements_text(el->'values') v) z
      WHERE z.g IS NOT NULL
    ) gv ON el->>'field' IN ('geo', 'country')
  ) t
  WHERE NOT (is_geo AND codes IS NULL)
),
geosoft AS (
  -- The countries a SOFT constraint mentioned. Used only for recall: a person
  -- in the right country who is nobody's nearest neighbour still deserves to be
  -- scored, and the constraint term cannot promote someone who was never in the
  -- candidate pool.
  SELECT NULLIF(array_agg(DISTINCT x), '{}'::text[]) AS g
  FROM cons, jsonb_array_elements(cons.c) el, jsonb_array_elements_text(el->'values') x
  WHERE el->>'field' = 'geo'
),
cand AS (
  -- Candidate recall.
  --
  -- The first version scored every row, which is the purest way to guarantee an
  -- answer, and measured at 4.6 SECONDS once a query vector was present: 10,670
  -- detoasted 1536-dim vectors is 64MB of reads per search. Without the vector
  -- the same scan is 150-500ms.
  --
  -- So the cheap path stays exhaustive and only the expensive one is gated. And
  -- the gate is a UNION of orthogonal recall paths, one of which is
  -- QUERY-INDEPENDENT, which is what keeps the always-answer promise structural
  -- rather than aspirational: even a query that matches nothing semantically and
  -- nothing lexically still has the strongest relationships in the pool, which
  -- is exactly what the nonsense-query probe showed the scorer falling back to.
  --
  -- Every path carries the hard geography predicate. It is an index scan on
  -- ci_geo_code and it is what stops a country filter from being applied to an
  -- already-truncated pool.

  -- (a) No query vector: score everything. Cheap, and fully exhaustive.
  SELECT ci.contact_id
  FROM public.contact_intelligence ci
  WHERE (SELECT qvec FROM q) IS NULL AND ci.is_person
    AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))

  UNION

  -- (b) Semantic recall. Served by the HNSW index (top-k ordering).
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT qvec FROM q) IS NOT NULL AND ci.embedding IS NOT NULL AND ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.embedding <=> (SELECT qvec FROM q)
   LIMIT p_pool)

  UNION

  -- (c) Lexical recall. Catches literal strings — a company name, a surname —
  --     that an embedding will not reliably place.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT tsq FROM q) IS NOT NULL AND ci.is_person
     AND ci.intel_tsv @@ (SELECT tsq FROM q)
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ts_rank_cd(ci.intel_tsv, (SELECT tsq FROM q)) DESC
   LIMIT p_pool)

  UNION

  -- (d) Venture recall, so a named venture reaches its best-fit people even
  --     when they are nobody's nearest neighbour.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE p_venture IS NOT NULL AND ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY coalesce((ci.venture_scores->>p_venture)::numeric, 0) DESC
   LIMIT p_pool)

  UNION

  -- (e) The relationship floor. Query-independent by design: this is the union
  --     member that makes "always return answers" true no matter what was
  --     asked.
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE ci.is_person
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.tier_weight DESC, ci.warmth DESC NULLS LAST
   LIMIT p_floor)

  UNION

  -- (f) Soft geography recall. "Who do I know in London" parses to a weighted
  --     constraint, not a filter, so without this path the strongest Londoners
  --     would only be scored if they happened to fall out of (b), (c) or (e).
  (SELECT ci.contact_id
   FROM public.contact_intelligence ci
   WHERE (SELECT g FROM geosoft) IS NOT NULL AND ci.is_person
     AND ci.geo_code = ANY((SELECT g FROM geosoft)::text[])
     AND ((SELECT geos FROM q) IS NULL OR ci.geo_code = ANY((SELECT geos FROM q)::text[]))
   ORDER BY ci.tier_weight DESC, ci.warmth DESC NULLS LAST
   LIMIT p_pool)
),
scored AS (
  SELECT
    ci.contact_id,
    c.full_name, c.company, c.title, c.email, c.linkedin_url,
    ci.who, ci.why_them, ci.hook, ci.risk,
    ci.roles, ci.surface_when, ci.network_tier, ci.best_channel,
    ci.reachable_via, ci.confidence, ci.intel_method,
    ci.seniority, ci.country, ci.geo_code, ci.industry, ci.venture_scores,
    (ci.intel_method = 'rules_v1') AS thin_evidence,

    -- ── Semantic ────────────────────────────────────────────────────────────
    -- Cosine similarity, rescaled onto the band real queries actually occupy.
    -- [0.30, 0.62] is measured, not guessed; see the note in
    -- 20260810234500_network_search_rpc.sql and re-measure with
    -- public.cosine_probe() if the embedding model or the intel_doc shape
    -- changes.
    CASE
      WHEN q.qvec IS NULL OR ci.embedding IS NULL THEN NULL
      ELSE greatest(0, least(1, (((1 - (ci.embedding <=> q.qvec)) - 0.30) / 0.32)))
    END AS s_semantic,

    -- ── Lexical ─────────────────────────────────────────────────────────────
    CASE
      WHEN q.tsq IS NULL THEN NULL
      ELSE ts_rank_cd(ci.intel_tsv, q.tsq)
    END AS s_lexical_raw,

    -- Coverage: what FRACTION of the query's lexemes this row actually
    -- contains. Coverage is what separates "matched the query" from "matched a
    -- word in the query".
    CASE
      WHEN q.lexqueries IS NULL THEN NULL
      ELSE (
        SELECT count(*)::float8 / greatest(array_length(q.lexqueries, 1), 1)
        FROM unnest(q.lexqueries) lq
        WHERE ci.intel_tsv @@ lq
      )
    END AS lex_coverage,

    -- ── Constraint fit ──────────────────────────────────────────────────────
    -- Weighted partial credit. No constraints means 0.5, a deliberate neutral:
    -- an unconstrained query must not be scored as though everyone failed.
    -- Unknown field names contribute nothing rather than erroring, so a planner
    -- hallucinating a column degrades the score instead of the request.
    CASE WHEN jsonb_array_length(cons.c) = 0 THEN 0.5
    ELSE coalesce((
      SELECT sum(w * hit) / nullif(sum(w), 0)
      FROM (
        SELECT
          coalesce((el->>'weight')::float8, 1.0) AS w,
          (CASE el->>'field'
            WHEN 'seniority'    THEN CASE WHEN ci.seniority = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'country'      THEN CASE WHEN ci.country   = ANY(vals) THEN 1 ELSE 0 END
            -- Resolved geography, so "in the UK" also matches the people whose
            -- country column is empty but whose location or email says Britain.
            --
            -- THREE outcomes, not two. An unknown location scores the same 0.5
            -- neutral this term uses when there is no constraint at all, because
            -- "we never recorded where they are" is not the same claim as "they
            -- are definitely somewhere else" and must not be priced like it.
            --
            -- Measured on the corpus before this branch existed: a SOFT UK
            -- constraint returned 200 Britons out of 200 rows and buried all 151
            -- of the 164 tier-1 people whose location was never captured. That is
            -- a hard filter wearing a soft label, and it is the exact failure
            -- geo_code was introduced to avoid. The hard filter (p_countries) is
            -- still strict: that is the operator saying "UK only" out loud, and
            -- the UI tells them how many people it cannot place.
            WHEN 'geo'          THEN CASE WHEN ci.geo_code = ANY(vals) THEN 1
                                          WHEN ci.geo_code IS NULL THEN 0.5
                                          ELSE 0 END
            WHEN 'network_tier' THEN CASE WHEN ci.network_tier = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'best_channel' THEN CASE WHEN ci.best_channel = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'confidence'   THEN CASE WHEN ci.confidence  = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'primary_venture' THEN CASE WHEN ci.primary_venture = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'mindmaker_buyer_family' THEN CASE WHEN ci.mindmaker_buyer_family = ANY(vals) THEN 1 ELSE 0 END
            WHEN 'roles'         THEN CASE WHEN ci.roles         && vals THEN 1 ELSE 0 END
            WHEN 'surface_when'  THEN CASE WHEN ci.surface_when  && vals THEN 1 ELSE 0 END
            WHEN 'reachable_via' THEN CASE WHEN ci.reachable_via && vals THEN 1 ELSE 0 END
            -- Free-text fields match on substring, so "media agency" hits
            -- "independent media agency" the way a person would expect.
            WHEN 'industry' THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE ci.industry ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            WHEN 'company'  THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE c.company  ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            WHEN 'title'    THEN CASE WHEN EXISTS (
              SELECT 1 FROM unnest(vals) v WHERE c.title    ILIKE '%' || v || '%') THEN 1 ELSE 0 END
            ELSE 0
          -- Cast: the geo branch above returns 0.5, which makes this CASE
          -- numeric, and `w` is float8. Postgres has no float8 * numeric.
          END)::float8 AS hit
        FROM jsonb_array_elements(cons.c) el
        CROSS JOIN LATERAL (
          SELECT array(SELECT jsonb_array_elements_text(el->'values')) AS vals
        ) x
      ) t
    ), 0.5) END AS s_constraint,

    -- ── Relationship value ──────────────────────────────────────────────────
    (
      0.40 * (ci.tier_weight::numeric / 100)
    + 0.30 * (coalesce(ci.warmth, 0)::numeric / 100)
    + 0.15 * (CASE WHEN ci.reciprocated_email THEN 1 ELSE 0 END)
    + 0.15 * (least(ci.source_count, 5)::numeric / 5)
    ) AS s_relationship,

    -- ── Actionability ───────────────────────────────────────────────────────
    (
      (CASE WHEN coalesce(array_length(ci.reachable_via, 1), 0) > 0 THEN 0.35 ELSE 0 END)
    + (CASE ci.confidence WHEN 'high' THEN 0.30 WHEN 'medium' THEN 0.18 ELSE 0.06 END)
    + (CASE WHEN ci.intel_method = 'rules_v1' THEN 0.05 ELSE 0.25 END)
    + (CASE ci.name_quality WHEN 'full' THEN 0.10 WHEN 'partial' THEN 0.05 ELSE 0 END)
    ) AS s_actionability,

    -- ── Venture multiplier ──────────────────────────────────────────────────
    -- Penalty-only, [0.65, 1.0]. A venture score should suppress the
    -- irrelevant, not manufacture relevance.
    CASE
      WHEN p_venture IS NULL THEN 1.0
      ELSE 0.65 + 0.35 * (coalesce((ci.venture_scores->>p_venture)::numeric, 0) / 100)
    END AS venture_multiplier

  FROM public.contact_intelligence ci
  JOIN public.contacts c ON c.id = ci.contact_id
  CROSS JOIN q
  CROSS JOIN cons
  WHERE ci.contact_id IN (SELECT contact_id FROM cand)
    AND ci.is_person                                    -- the one implicit hard filter
    AND (p_tiers    IS NULL OR ci.network_tier = ANY(p_tiers))
    AND (p_roles    IS NULL OR ci.roles && p_roles)
    AND (q.geos     IS NULL OR ci.geo_code = ANY(q.geos))
    AND (p_min_conf IS NULL OR
         CASE ci.confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END >=
         CASE p_min_conf    WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END)
    AND c.status IS DISTINCT FROM 'do_not_contact'
),
rescaled AS (
  -- Lexical rank is rescaled against the strongest match in this result set,
  -- not against a constant, and coverage is SQUARED so one incidental word
  -- match cannot read as a third of a perfect match.
  SELECT scored.*,
    CASE WHEN s_lexical_raw IS NULL THEN NULL
         ELSE (s_lexical_raw / nullif(max(s_lexical_raw) OVER (), 0))
              * power(coalesce(lex_coverage, 0), 2) END AS s_lexical
  FROM scored
)
SELECT
  contact_id, full_name, company, title, email, linkedin_url,
  who, why_them, hook, risk, roles, surface_when, network_tier, best_channel,
  reachable_via, confidence, intel_method, seniority, country, geo_code, industry,
  venture_scores, thin_evidence,
  -- Weights are renormalised over the terms that are actually present, so a
  -- recommend-mode call with no text query is not silently scored out of 0.50.
  round((greatest(0, least(100,
    100 * venture_multiplier * (
        (0.34 * coalesce(s_semantic, 0) + 0.16 * coalesce(s_lexical, 0)
       + 0.22 * s_constraint + 0.18 * s_relationship + 0.10 * s_actionability)
      / (  (CASE WHEN s_semantic IS NULL THEN 0 ELSE 0.34 END)
         + (CASE WHEN s_lexical  IS NULL THEN 0 ELSE 0.16 END)
         + 0.22 + 0.18 + 0.10 )
    )
  )))::numeric, 1) AS match_score,
  -- The query-dependent signal ALONE, isolated from relationship value and
  -- actionability. This is the number the API thresholds to decide whether to
  -- tell Krish nothing actually matched. NULL when neither tier ran.
  CASE
    WHEN s_semantic IS NULL AND s_lexical IS NULL THEN NULL
    ELSE round((
      (0.34 * coalesce(s_semantic, 0) + 0.16 * coalesce(s_lexical, 0))
      / ((CASE WHEN s_semantic IS NULL THEN 0 ELSE 0.34 END)
       + (CASE WHEN s_lexical  IS NULL THEN 0 ELSE 0.16 END))
    )::numeric, 3)
  END AS query_relevance,
  round(coalesce(s_semantic, 0)::numeric, 3) AS s_semantic,
  round(coalesce(s_lexical, 0)::numeric, 3)  AS s_lexical,
  round(s_constraint::numeric, 3)            AS s_constraint,
  round(s_relationship::numeric, 3)          AS s_relationship,
  round(s_actionability::numeric, 3)         AS s_actionability,
  round(venture_multiplier::numeric, 3)      AS venture_multiplier
FROM rescaled
ORDER BY match_score DESC, s_relationship DESC
LIMIT least(coalesce(p_limit, 40), 200);
$$;

COMMENT ON FUNCTION public.network_search IS
  'Hybrid semantic + lexical + constraint + relationship scoring over contact_intelligence. Constraints are SOFT (weighted partial credit); the only hard filters are is_person, do_not_contact, and explicit UI filters (tiers, roles, confidence, countries). Geography resolves through contact_intelligence.geo_code and pushes down into candidate recall. Always returns rows unless a hard filter excludes everyone.';

REVOKE ALL ON FUNCTION public.network_search FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_search TO service_role;
