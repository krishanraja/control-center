-- 2026-06-05 — make contacts first-class in the email-draft ledger
--
-- Context: the "Leads" tab (Relationship Engine) drafts outreach from the
-- `contacts` table via the Cleo Email Draft workflow, which calls
-- `mark_entity_emailed(...)`. That RPC + the `email_drafts.entity_type` CHECK
-- only modelled lead|customer|guest, so contact drafts were logged as `lead`
-- and `contacts` rows were never stamped with last_emailed_at.
--
-- This migration was authored from a sandbox that could NOT reach the database
-- (the direct Postgres host is IPv6-only and the Management API is blocked), so
-- it has not been applied. Run it in the Supabase SQL editor.
--
-- Sections 1 and 2 are safe + idempotent and can be run as-is.
-- Section 3 changes the SHARED mark_entity_emailed RPC (leads/customers/guests
-- depend on it). It is intentionally left commented out: paste your CURRENT
-- function definition first
--   (select pg_get_functiondef(oid) from pg_proc where proname='mark_entity_emailed';)
-- then add the `contact` branch shown below so you don't lose existing behaviour.

begin;

-- 1) Stamp columns on contacts (additive, safe) -----------------------------
alter table public.contacts
  add column if not exists last_emailed_at      timestamptz,
  add column if not exists last_email_draft_id  text,
  add column if not exists last_email_draft_url text;

-- 2) Allow 'contact' in the email_drafts ledger CHECK -----------------------
do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.email_drafts'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%entity_type%';
  if cname is not null then
    execute format('alter table public.email_drafts drop constraint %I', cname);
  end if;
  alter table public.email_drafts
    add constraint email_drafts_entity_type_check
    check (entity_type in ('lead','customer','guest','contact'));
end $$;

commit;

-- 3) Teach mark_entity_emailed to handle contacts ---------------------------
-- REVIEW BEFORE RUNNING. Merge this branch into your current definition rather
-- than replacing it blind. The key additions are:
--   (a) accept 'contact' (stop coercing it to 'lead'), and
--   (b) stamp the contacts table on entity_type='contact'.
--
-- Sketch of the contacts branch to add to the existing body:
--
--   elsif p_entity_type = 'contact' then
--     update public.contacts
--        set last_emailed_at      = now(),
--            last_email_draft_id  = p_draft_id,
--            last_email_draft_url = p_draft_url
--      where id = p_entity_id;
--
-- ...and ensure the email_drafts insert uses the real p_entity_type ('contact')
-- instead of defaulting/normalising it to 'lead'.
