-- The fourteen SECURITY DEFINER views, and the premise that expired under them.
--
-- ADR-008 (2026-07-01) considered this exact change and rejected it. The drift
-- migration 20260821200000 restates the reason:
--
--   "the SECURITY DEFINER views (decisions_waiting, triage_queue, +10). They
--    are read by the anon key BECAUSE they are definer; converting them blanks
--    the dashboard until real auth exists."
--
-- That was true in July. It was measured again before writing this, and it is
-- now true for three views, not fourteen. In the months since, most of the
-- tables underneath these views were given `anon read USING (true)` policies
-- for other reasons. Of the forty view-to-table dependencies, thirty six are
-- already reachable by anon directly. Only four are not.
--
-- So eleven of the fourteen can be converted with no effect on any caller, and
-- triage_queue, named in ADR-008 as a reason to hold, is one of them. Nothing
-- reads it at all any more. The decision did not change; the ground under it
-- did, and nobody re-measured. This migration takes the eleven that are now
-- free, closes the three that are not, and leaves ADR-008's actual blocker
-- (real auth) exactly where it stands.
--
-- Worth being plain about what this does NOT fix. The eleven were not leaking
-- anything a caller could not already read one layer down, so converting them
-- removes a bypass rather than closing a hole. The hole is that `contacts`
-- (11,755 rows), `leads`, `guests`, `customers` and `system_config` carry
-- `anon read USING (true)` and the anon key ships in a public repository's
-- browser bundle. 20260909110000_revoke_anon_writes.sql promised "a separate
-- table-by-table pass, personal data first" for exactly this and it has not
-- happened. That is a bigger exposure than all fourteen views combined and it
-- is deliberately not swept into a migration about something else.
--
-- Measured as `role anon` immediately before applying, so the readback after
-- has something real to be compared against:
--
--   acquisition_capture_to_paid    6     newsletter_source_yield    14
--   attribution_app_health         6     pilot_daily                56
--   autonomy_evidence             10     standards_efficacy        169
--   decisions_waiting            149     triage_queue              160
--   events_recommendable         316     visibility_items          624
--   fleet_failures                 2     goals_health                1
--   inspiration_lane_health        2     intake_source_health       22
--
--   decisions_waiting by kind: correction 10, growth_stall 4, guest 54,
--   lead 7, task 1, vera_gap 1, visibility 72.

-- ── 1. The two policies go in FIRST ─────────────────────────────────────────
--
-- decisions_waiting is the Home page, read from the browser through a realtime
-- subscription (src/hooks/useRealtimeDecisionsWaiting.ts). It is a thirteen
-- branch UNION ALL and two of its branches read tables that have RLS on and no
-- policy at all, so anon reaches them only because the view is definer.
--
-- These policies are written before the view is converted so there is never a
-- moment, even inside this transaction, where the dashboard is short of rows.
--
-- Each predicate is copied from the view's own WHERE clause rather than opened
-- wider. anon therefore ends up seeing exactly the rows it sees today: the
-- queued sends and the pending corrections the cards are built from, and not
-- the rest of either table.
--
-- The acquisition_sends predicate is `status = 'queued'` rather than the
-- narrower `status = 'queued' AND sample_required`, and that is deliberate.
-- acquisition_sends appears twice in the view: once as the send_sample branch,
-- and once inside a NOT EXISTS that suppresses a task while it has a queued
-- send waiting. If the policy covered only the sample_required rows, the
-- NOT EXISTS would stop matching, and suppressed tasks would silently REAPPEAR
-- in the task branch. That is the failure this migration is most likely to
-- have caused and is the reason the readback counts kinds, not just rows.
--
-- Honest note on what this achieves: it does not reduce exposure. The
-- send_sample card publishes rendered_subject and the first 240 characters of
-- rendered_body of outbound email to named leads, to anyone holding the anon
-- key, before this change and after it. What changes is that the exposure
-- stops being an invisible property of a view and becomes a policy that
-- pg_policies lists and the next audit can find. Narrowing what Home shows is
-- a product decision and belongs with the contacts pass, not here.

create policy "acquisition_sends anon read queued"
  on public.acquisition_sends
  for select to anon
  using (status = 'queued');

create policy "corrections anon read pending"
  on public.corrections
  for select to anon
  using (status = 'analyzed' and approval_state = 'pending');

-- ── 2. Eleven views that convert with no behaviour change ───────────────────
--
-- Every base table of each already grants anon SELECT and carries a SELECT
-- policy that applies to anon, so the definer property is doing no work.
-- service_role has rolbypassrls = true, so the two server side readers in
-- content-engine keep working untouched:
--   newsletter_source_yield  apps/control-plane/api/inspiration/drive-scan.ts
--   goals_health             apps/control-plane/api/_goals.ts
-- Both build their client from SUPABASE_SERVICE_ROLE_KEY.

alter view public.acquisition_capture_to_paid set (security_invoker = true);
alter view public.autonomy_evidence           set (security_invoker = true);
alter view public.events_recommendable        set (security_invoker = true);
alter view public.fleet_failures              set (security_invoker = true);
alter view public.goals_health                set (security_invoker = true);
alter view public.inspiration_lane_health     set (security_invoker = true);
alter view public.intake_source_health        set (security_invoker = true);
alter view public.newsletter_source_yield     set (security_invoker = true);
alter view public.pilot_daily                 set (security_invoker = true);
alter view public.triage_queue                set (security_invoker = true);
alter view public.visibility_items            set (security_invoker = true);

-- ── 3. decisions_waiting, now that its rows are held by policy ──────────────

alter view public.decisions_waiting set (security_invoker = true);

-- ── 4. The two that were genuinely reaching past a boundary ─────────────────
--
-- attribution_app_health is the sharpest of the fourteen. It reads
-- attribution.events, and anon holds neither USAGE on the attribution schema
-- nor SELECT on the table. The definer view was its only way in, which is
-- privilege escalation across a schema boundary rather than a lint finding.
-- Its only two readers are api/fleet-funnel.ts and api/growth/council-run.ts,
-- both on the service role, so the browser grants are not load bearing.
--
-- standards_efficacy reads standards_registry, which has RLS on and no policy,
-- and today hands anon 169 rows of operating rules with their severity,
-- enforcement, hit counts and efficacy state. Nothing in src/ or api/ reads it.
-- 20260909110000 called standards_registry "the sharpest of them" when closing
-- the write side of the same table. The read side is closed here.
--
-- Revoke first, then convert, so neither is briefly readable as invoker with
-- the grants still attached.

revoke all on public.attribution_app_health from anon, authenticated;
revoke all on public.standards_efficacy     from anon, authenticated;

alter view public.attribution_app_health set (security_invoker = true);
alter view public.standards_efficacy     set (security_invoker = true);

-- ── 5. Four functions with a mutable search_path ────────────────────────────
--
-- Same category ADR-008 accepted on 2026-07-01 and 20260821200000 restored.
-- These four post-date both, so this is restoration of a standing decision
-- rather than a new one. All four reference only public, so pinning preserves
-- behaviour exactly.
--
-- Checked rather than assumed: audit_failure_patterns is SECURITY DEFINER but
-- already has EXECUTE revoked from anon and authenticated, so it is not the
-- anon-callable escalation class ADR-008 closed separately. log_workflow_run
-- and delta_keys_are_form_only are anon-callable but are NOT definer, so they
-- run with the caller's own rights and grant nothing extra.

alter function public.audit_failure_patterns()                  set search_path = public, pg_temp;
alter function public.log_workflow_run(text, text, text)         set search_path = public, pg_temp;
alter function public.delta_keys_are_form_only(jsonb)            set search_path = public, pg_temp;
alter function public.contact_completeness(text, boolean, boolean, text, text, integer, text, timestamptz)
  set search_path = public, pg_temp;
