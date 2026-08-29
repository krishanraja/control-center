-- learning_events had RLS enabled and NOT ONE POLICY, which is why it has no
-- reader: only the service role could see it, and nothing holding a service
-- role ever asked. Two routes write it (api/objectives, skill-proposal
-- approval) and the architecture doc calls it the self-improvement ledger, so
-- a write-only ledger was the whole of it.
--
-- Every sibling of this table is anon-readable: skill_proposals, vera_gaps,
-- system_improvements, workflow_health, silent_failures, marcus_synthesis and
-- audit_log all carry an anon SELECT policy. learning_events is the only one
-- that does not, and it holds the same class of content: OS metadata about
-- proposed changes to agent behaviour. No personal data, no credentials.
--
-- Missing policies read as a deliberate lockdown and behave as one, which is
-- why this is worth stating: the absence here is an oversight, and it is the
-- mechanical reason the Friday retro could not be given the OS's own record
-- of what it learned.

alter table public.learning_events enable row level security;

drop policy if exists "learning_events anon read" on public.learning_events;
create policy "learning_events anon read"
  on public.learning_events for select to anon using (true);

drop policy if exists "learning_events service all" on public.learning_events;
create policy "learning_events service all"
  on public.learning_events for all to service_role using (true) with check (true);
