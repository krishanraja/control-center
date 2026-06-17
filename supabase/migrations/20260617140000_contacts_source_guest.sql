-- Recorded podcast guests are not opportunities — they're real relationships.
-- They get promoted out of Visibility into the Network (contacts) tagged with
-- the venture their podcast maps to. This column is the audit link + dedup key
-- so a guest is only ever promoted to one contact, and re-runs are idempotent.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source_guest_id uuid;

CREATE INDEX IF NOT EXISTS contacts_source_guest_id_idx
  ON public.contacts (source_guest_id)
  WHERE source_guest_id IS NOT NULL;
