-- The browser can approve or reject a workflow proposal, and nothing else.
--
-- Found 2026-10-03 while moving the service-role key out of the n8n fleet.
-- The 2026-09-09 migration (20260909110000_revoke_anon_writes.sql) narrowed
-- workflow_proposals to UPDATE for anon, because the Flows tab approves and
-- rejects with the anonymous key. It did not narrow which columns, so anyone
-- holding that key (it ships in the frontend by design) could rewrite a
-- proposal's proposed_changes and current_workflow_id, set it to approved, and
-- call the Proposal Executor's open webhook. The executor then applied the
-- change to n8n with an admin API key: a stranger could rewrite any workflow,
-- including the ones holding the Supabase, Anthropic and Gmail credentials.
--
-- Ruling (Krish, 2026-10-03): switch the Proposal Executor off and lock the
-- table so the browser can only decide on a proposal, never change it. The
-- executor was unpublished the same day. It had applied nothing since
-- 2026-08-29.
--
-- What the browser keeps, established from the code rather than assumed:
--   src/components/desktop/DesktopFlows.tsx and src/components/mobile/
--   MobileFlows.tsx are the only anon writers. Both list proposals whose
--   status is 'proposed' or 'pending', and both send exactly status
--   ('approved' or 'rejected'), approved_by, approved_at and updated_at.
--   The column grant and the policy below allow that and nothing wider.
--
-- service_role bypasses RLS and keeps its table grant, so api/ and the n8n
-- workflows are unaffected. authenticated has no UPDATE policy today, so it is
-- held to the same four columns now rather than inheriting the whole table the
-- day ADR-008 gives it one.

begin;

revoke update on table public.workflow_proposals from anon, authenticated;
grant update (status, approved_by, approved_at, updated_at)
  on public.workflow_proposals to anon, authenticated;

alter policy "anon_update_workflow_proposals" on public.workflow_proposals
  using (status in ('proposed', 'pending'))
  with check (status in ('approved', 'rejected'));

commit;

-- Applied live 2026-10-03 through the Supabase connector (ledger version
-- 20261003204501). Proved as anon in a rolled-back block: approving a
-- proposal is allowed; writing proposed_changes or current_workflow_id is
-- refused with "permission denied for table workflow_proposals".
