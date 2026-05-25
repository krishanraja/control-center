-- Pedantic CEO audit migration — additive only, idempotent.
-- Adds columns for the new email-draft, deep-enrich, and outreach surfaces.
-- All operations use IF NOT EXISTS / CREATE OR REPLACE so re-running is safe.

-- ============== LEADS ==============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_emailed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_draft_id    text,
  ADD COLUMN IF NOT EXISTS last_email_draft_url   text,
  ADD COLUMN IF NOT EXISTS deep_enriched_at       timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_status      text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_enrichment_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_enrichment_status_check
      CHECK (enrichment_status IS NULL OR enrichment_status IN ('pending','enriching','enriched','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_status_enrichment_idx
  ON public.leads (status, deep_enriched_at NULLS FIRST);

-- Backfill names so "Unnamed" rows promote to company or email-prefix.
UPDATE public.leads
   SET full_name = COALESCE(NULLIF(company, ''), split_part(email, '@', 1))
 WHERE (full_name IS NULL OR full_name = '')
   AND (company IS NOT NULL OR email IS NOT NULL);

-- ============== VISIBILITY TARGETS ==============
ALTER TABLE public.visibility_targets
  ADD COLUMN IF NOT EXISTS source_url   text,
  ADD COLUMN IF NOT EXISTS applied_at   timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at  timestamptz;

UPDATE public.visibility_targets
   SET source_url = raw_data->>'url'
 WHERE source_url IS NULL
   AND raw_data ? 'url';

-- ============== GUESTS ==============
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS last_outreach_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_draft_id    text,
  ADD COLUMN IF NOT EXISTS last_email_draft_url   text;

-- ============== CUSTOMERS ==============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS needs_outreach_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_emailed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_draft_id    text,
  ADD COLUMN IF NOT EXISTS last_email_draft_url   text;

-- ============== EMAIL_DRAFTS LEDGER ==============
CREATE TABLE IF NOT EXISTS public.email_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL CHECK (entity_type IN ('lead','customer','guest')),
  entity_id       uuid NOT NULL,
  gmail_draft_id  text NOT NULL,
  gmail_draft_url text NOT NULL,
  subject         text,
  body_preview    text,
  created_by      text DEFAULT 'krish',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_drafts_entity_idx
  ON public.email_drafts (entity_type, entity_id, created_at DESC);

-- ============== RPC: mark_entity_emailed ==============
-- Called by Cleo Email Draft N8N workflow after Gmail draft is created.
-- audit_log REAL columns (verified live): id, event_type, actor, target,
-- changes, created_at, details, display_message.
CREATE OR REPLACE FUNCTION public.mark_entity_emailed(
  p_entity_type text,
  p_entity_id   uuid,
  p_draft_id    text,
  p_draft_url   text,
  p_subject     text DEFAULT NULL,
  p_body_preview text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_entity_type = 'lead' THEN
    UPDATE public.leads
       SET last_email_draft_id  = p_draft_id,
           last_email_draft_url = p_draft_url,
           last_emailed_at      = now()
     WHERE id = p_entity_id;
  ELSIF p_entity_type = 'customer' THEN
    UPDATE public.customers
       SET last_email_draft_id  = p_draft_id,
           last_email_draft_url = p_draft_url,
           last_emailed_at      = now()
     WHERE id = p_entity_id;
  ELSIF p_entity_type = 'guest' THEN
    UPDATE public.guests
       SET last_email_draft_id  = p_draft_id,
           last_email_draft_url = p_draft_url,
           last_outreach_at     = now()
     WHERE id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Unknown entity_type %', p_entity_type;
  END IF;

  INSERT INTO public.email_drafts (entity_type, entity_id, gmail_draft_id, gmail_draft_url, subject, body_preview)
  VALUES (p_entity_type, p_entity_id, p_draft_id, p_draft_url, p_subject, p_body_preview);

  INSERT INTO public.audit_log (actor, event_type, target, details, display_message)
  VALUES (
    'cleo',
    'email_draft_created',
    p_entity_type || ':' || p_entity_id::text,
    jsonb_build_object(
      'draft_id',    p_draft_id,
      'draft_url',   p_draft_url,
      'entity_type', p_entity_type,
      'entity_id',   p_entity_id,
      'subject',     p_subject
    )::text,
    'Cleo drafted an email to ' || p_entity_type
  );
END $$;

GRANT EXECUTE ON FUNCTION public.mark_entity_emailed(text, uuid, text, text, text, text) TO service_role;
