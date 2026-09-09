-- Revoke anonymous write access on twenty tables.
--
-- Found 2026-09-09 by reading pg_policies directly. Twenty-four tables carried
-- INSERT, UPDATE, DELETE or ALL policies granted to `anon` or `public`. The
-- anonymous key is published by design in any deployed frontend, and this
-- Control Center is deployed from a public repository, so every one of those
-- was writable by anyone who opened the app and read the key out of it.
--
-- The sharpest of them: `standards_registry` (169 rules) and `agent_plans`
-- (per-agent strategy) were ALL to `public`, meaning a stranger could rewrite
-- the operating standards of the fleet. `schema_migrations` was ALL to `anon`.
-- `corrections`, the learning feed, was ALL to `public`.
--
-- Safety, established before writing this rather than assumed:
--
--   1. `service_role` has rolbypassrls = true (verified in pg_roles), so no
--      writer using the service key is affected by any policy dropped here.
--   2. api/_supabase.ts constructs its client with SUPABASE_SERVICE_ROLE_KEY,
--      so every api/ handler that writes feedback_queue, workflow_runs and the
--      rest is unaffected.
--   3. 53 of the 61 n8n workflows writing workflow_runs pass
--      SUPABASE_SERVICE_ROLE_KEY explicitly in an apikey header.
--   4. src/lib/supabase.ts uses VITE_SUPABASE_ANON_KEY, and the frontend's
--      only writes are audit_log insert, tasks update, pending_flags update,
--      workflow_proposals update, and visibility_targets insert and update.
--      Those five are the ones this migration preserves or narrows.
--   5. No product app (fractionl-pulse, fractionl-circle, mm-ctrl, mindmake)
--      writes any of these tables directly.
--
-- Deliberately NOT touched here, and why:
--
--   workflow_runs   8 of its 61 n8n writers authenticate with n8n's stored
--                   `supabaseApi` credential rather than an explicit service
--                   key header, and that credential's value cannot be read
--                   through the n8n API. If it holds the anon key, revoking
--                   would silence the heartbeat on those eight. Left alone
--                   until the credential is confirmed. This is the one
--                   remaining anonymous write hole after this migration.
--   audit_log       logKrishAction in src/lib/supabase.ts inserts here from
--                   the browser on every action Krish takes.
--   tasks           the dashboard updates task state directly.
--
-- Reads are not addressed here. `contacts` (10,768 rows), `customers`, `leads`,
-- `agents.brief_content` and `system_config` remain anon-readable and are the
-- subject of a separate table-by-table pass, personal data first.

begin;

-- Twenty tables with no anonymous writer anywhere in the codebase.
drop policy if exists "anon_all_agent_capabilities"        on public.agent_capabilities;
drop policy if exists "Allow all access to agent_plans"    on public.agent_plans;
drop policy if exists "anon_all_api_endpoints"             on public.api_endpoints;
drop policy if exists "approvals_insert"                   on public.approvals;
drop policy if exists "approvals_update"                   on public.approvals;
drop policy if exists "anon_all_contacted_persons"         on public.contacted_persons;
drop policy if exists "allow_all_corrections"              on public.corrections;
drop policy if exists "anon_all_credential_health"         on public.credential_health;
drop policy if exists "anon_all_feedback_queue"            on public.feedback_queue;
drop policy if exists "anon_insert_feedback_queue"         on public.feedback_queue;
drop policy if exists "anon_update_feedback_queue"         on public.feedback_queue;
drop policy if exists "anon_update_goals"                  on public.goals;
drop policy if exists "anon_all_hunter_seen_roles"         on public.hunter_seen_roles;
drop policy if exists "anon_all_kai_snap"                  on public.kai_workflow_snapshots;
drop policy if exists "anon_all_maya_competitive_changes"  on public.maya_competitive_changes;
drop policy if exists "anon_all_maya_reddit_accounts"      on public.maya_reddit_accounts;
drop policy if exists "anon_all_maya_striking_distance"    on public.maya_striking_distance;
drop policy if exists "anon_all_memory"                    on public.memory;
drop policy if exists "anon_all_schema_migrations"         on public.schema_migrations;
drop policy if exists "allow_all_standards_registry"       on public.standards_registry;
drop policy if exists "all"                                on public.sync_queue;
drop policy if exists "anon_all_vera_audit"                on public.vera_audit;
drop policy if exists "anon_all_workstream_contexts"       on public.workstream_contexts;
drop policy if exists "allow_all_workstream_contexts"      on public.workstream_contexts;

-- pending_flags: the dashboard updates these. It never inserts or deletes.
drop policy if exists "anon_full_access_pending_flags" on public.pending_flags;
create policy "anon_update_pending_flags" on public.pending_flags
  for update to anon using (true) with check (true);

-- workflow_proposals: the dashboard approves and rejects, which is an update.
-- Nothing in the browser should be able to create or delete a proposal, and
-- `allow_anon_update_proposals` was granted to `public`, wider than anon.
drop policy if exists "anon_all_workflow_proposals"   on public.workflow_proposals;
drop policy if exists "allow_anon_update_proposals"   on public.workflow_proposals;
create policy "anon_update_workflow_proposals" on public.workflow_proposals
  for update to anon using (true) with check (true);

-- Every table above keeps its service_role policy where it had one, and
-- service_role bypasses RLS regardless, so writes from api/ and from the
-- n8n workflows continue unchanged.

commit;
