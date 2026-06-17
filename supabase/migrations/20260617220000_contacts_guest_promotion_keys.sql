-- Keys the guest->contact promotion path needs (api/_guest-to-contact.ts).
--
-- These were implied by the helper but missing from the schema: source_guest_id
-- (the dedup/provenance link from a contact back to the guest it was promoted
-- from) and linkedin_url_norm (the normalized LinkedIn used as a dedup tier).
--
-- linkedin_url_norm uses a NON-unique index on purpose: contacts.linkedin_url
-- contains junk placeholders ("Search LinkedIn", "TBD", ...) and some genuine
-- duplicates, which a UNIQUE index would reject. The promotion helper only needs
-- these columns for lookups, not uniqueness. (This is the deliberate divergence
-- from the UNIQUE index in 20260617120000_dedup_keys_and_synthesis.sql, which
-- could never be applied to live data for that reason.)
--
-- Idempotent.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source_guest_id   uuid,
  ADD COLUMN IF NOT EXISTS linkedin_url_norm text;

CREATE INDEX IF NOT EXISTS contacts_source_guest_id_idx
  ON public.contacts (source_guest_id)
  WHERE source_guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_linkedin_url_norm_idx
  ON public.contacts (linkedin_url_norm)
  WHERE linkedin_url_norm IS NOT NULL;

COMMENT ON COLUMN public.contacts.source_guest_id IS
  'Guest this contact was promoted from (api/_guest-to-contact.ts). Dedup + provenance.';
COMMENT ON COLUMN public.contacts.linkedin_url_norm IS
  'Normalized LinkedIn URL (linkedinNorm in api/_text.ts). Non-unique: contacts.linkedin_url has junk placeholders and dupes.';
