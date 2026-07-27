-- Worry compiler (pilot layer v1.1). APPLIED LIVE 2026-07-27
-- (migration name: pilot_worry_compiler).
--
-- Takes a raw mid-day worry and forces it into one of four terminal states so
-- it cannot remain an open loop. An intake and a closer, not a journal: nothing
-- in the app ever renders a browsable list of past worries or their raw_text.
--
-- State semantics, enforced in api/pilot/worries.ts rather than by constraint,
-- because they are conditional on state:
--   test          belief, prediction, test_plan, test_due_date all required.
--                 Open until outcome is recorded, which sets closed_at.
--   action        action_text required. Closed immediately; action_disposition
--                 records whether it was done now or became tomorrow's ONE.
--   relitigation  Closed immediately. outcome_note holds the evidence answer
--                 or the literal 'no new evidence'.
--   weather       expires_at is created_at + 7 days. Closed at expiry, lazily
--                 on read.
--
-- Open test count is rows where state = 'test' and closed_at is null. Capped at
-- five, enforced server-side. The cap is the intervention, not a suggestion.
create table if not exists public.worries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_text text not null,
  state text not null check (state in ('test', 'action', 'relitigation', 'weather')),
  belief text,
  prediction text,
  test_plan text,
  test_due_date date,
  outcome text check (outcome in ('confirmed', 'disconfirmed', 'partial')),
  outcome_note text,
  action_text text,
  action_disposition text check (action_disposition in ('done_now', 'tomorrow_one')),
  closed_at timestamptz,
  expires_at timestamptz
);

create index if not exists worries_open_tests_idx on public.worries (state, closed_at, test_due_date);
create index if not exists worries_created_at_idx on public.worries (created_at desc);

alter table public.worries enable row level security;
drop policy if exists worries_anon_read on public.worries;
create policy worries_anon_read on public.worries for select to anon using (true);
drop policy if exists worries_service_all on public.worries;
create policy worries_service_all on public.worries for all to service_role using (true) with check (true);
grant select on public.worries to anon;
grant all on public.worries to service_role;
