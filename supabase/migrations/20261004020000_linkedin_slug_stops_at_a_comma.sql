-- A LinkedIn slug never holds a comma or whitespace, so neither may the key.
--
-- The message export separates group-message recipients with a comma. The
-- importer split on whitespace alone, and the slug pattern stopped only at
-- '/', '?' or '#', so two URLs glued by a comma read as one person:
-- "li:amyleannabaker,https:". 24 group threads were keyed that way, covering
-- 68 messages: the first recipient got a broken identity and everyone else on
-- the thread got no credit at all. The profile scrape then resolved 14 of the
-- broken URLs (the scraper strips the junk) and wrote them onto new contacts
-- with the comma still attached; those are repaired below.
--
-- The function's behaviour changes under an expression index, so the index is
-- rebuilt. Without that it would keep returning the old, glued values.

CREATE OR REPLACE FUNCTION public.linkedin_slug(p_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $body$
  SELECT nullif(btrim(substring(lower(coalesce(p_url, '')) FROM 'linkedin\.com/(?:in|pub)/([^/?#,[:space:]]+)')), '')
$body$;

REINDEX INDEX public.contacts_linkedin_slug_idx;

UPDATE public.contacts
SET linkedin_url = regexp_replace(linkedin_url, ',https:$', '')
WHERE linkedin_url ~ '^https://www\.linkedin\.com/in/[^,\s]+,https:$';
