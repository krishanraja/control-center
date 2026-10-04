-- contacts.linkedin_url holds a LinkedIn profile URL in one canonical form, or
-- nothing. Krish asked for the cleanup on 2026-10-04.
--
-- 132 rows held something else, written by earlier importers: 45 "Search
-- LinkedIn" placeholders, three "TBD", LinkedIn post text from an event import,
-- Twitter URLs in the wrong field, 34 profile URLs missing "https://", and 14
-- "linkedin | twitter" pairs joined by a pipe. None was a person's identity,
-- and the pairs hid a perfectly good profile behind a separator.
--
-- Nothing was thrown away. Every original value is kept whole in
-- contacts_linkedin_url_cleanup_20261004 before anything changed, so the post
-- text and the placeholders can be read back if they ever matter.
--
-- One lesson from doing it, recorded because it cost a pass: three updates to
-- the same table in one statement (data-modifying CTEs) do not stack. Where two
-- touched the same row only one applied, so the Twitter move won and 34
-- LinkedIn fixes silently did not happen. The arithmetic gave it away: 34 + 64
-- is not 132. They are separate statements below.
--
-- The trigger is the gate that stops the next one: whatever an importer writes,
-- a profile is stored canonically, a Twitter URL becomes the handle where none
-- is set, and anything that is not a profile is not stored as one.

CREATE TABLE IF NOT EXISTS public.contacts_linkedin_url_cleanup_20261004 (
  contact_id uuid PRIMARY KEY,
  original_linkedin_url text NOT NULL,
  original_twitter_handle text,
  cleaned_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.contacts_linkedin_url_cleanup_20261004 (contact_id, original_linkedin_url, original_twitter_handle)
SELECT id, linkedin_url, twitter_handle FROM public.contacts
WHERE linkedin_url IS NOT NULL
  AND linkedin_url !~* '^https?://([a-z]+\.)?linkedin\.com/(in|pub)/[^\s|,]+/?(\?.*)?$'
ON CONFLICT (contact_id) DO NOTHING;

UPDATE public.contacts c
SET twitter_handle = substring(b.original_linkedin_url FROM '(?:twitter|x)\.com/([A-Za-z0-9_]{1,30})')
FROM public.contacts_linkedin_url_cleanup_20261004 b
WHERE c.id = b.contact_id
  AND coalesce(c.twitter_handle, '') = ''
  AND b.original_linkedin_url ~* '(twitter|x)\.com/[A-Za-z0-9_]';

UPDATE public.contacts
SET linkedin_url = CASE
  WHEN public.linkedin_slug(linkedin_url) IS NOT NULL
    THEN 'https://www.linkedin.com/in/' || public.linkedin_slug(linkedin_url)
  ELSE NULL END
WHERE linkedin_url IS NOT NULL
  AND linkedin_url !~* '^https?://([a-z]+\.)?linkedin\.com/(in|pub)/[^\s|,]+/?(\?.*)?$';

CREATE OR REPLACE FUNCTION public.contacts_tidy_linkedin_url()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $body$
DECLARE
  s text;
  tw text;
BEGIN
  IF NEW.linkedin_url IS NULL THEN RETURN NEW; END IF;
  -- A Twitter URL in the wrong field still says where the person is.
  tw := substring(NEW.linkedin_url FROM '(?:twitter|x)\.com/([A-Za-z0-9_]{1,30})');
  IF tw IS NOT NULL AND coalesce(NEW.twitter_handle, '') = '' THEN
    NEW.twitter_handle := tw;
  END IF;
  s := public.linkedin_slug(NEW.linkedin_url);
  NEW.linkedin_url := CASE WHEN s IS NULL THEN NULL ELSE 'https://www.linkedin.com/in/' || s END;
  RETURN NEW;
END
$body$;

DROP TRIGGER IF EXISTS contacts_tidy_linkedin_url_trg ON public.contacts;
CREATE TRIGGER contacts_tidy_linkedin_url_trg
  BEFORE INSERT OR UPDATE OF linkedin_url ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_tidy_linkedin_url();

SELECT public.refresh_relationship_rollup();
