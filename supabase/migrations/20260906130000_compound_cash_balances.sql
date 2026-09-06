-- COMPOUND cash on hand. One row per member per date saying how much cash was
-- in the bank that day, in US dollars. The Spend tab already knows what goes
-- out; with this it can say how many months that would last. Same posture as
-- the view settings table: RLS enabled and forced, the member reads and writes
-- only their own rows, nothing is granted to anon, and no figure is seeded
-- here. Balances are typed into the Settings sheet by the member.

create table compound.cash_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  as_of date not null,
  amount_usd numeric not null check (amount_usd >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, as_of)
);

comment on table compound.cash_balances is 'Per-member cash on hand in USD, one row per date. Entered by the member in Settings; read by the spend API to work out runway.';

create index cash_balances_user_date_idx on compound.cash_balances (user_id, as_of desc);

alter table compound.cash_balances enable row level security;
alter table compound.cash_balances force row level security;

create policy cash_balances_read_self
  on compound.cash_balances for select to authenticated
  using (user_id = (select auth.uid()));
create policy cash_balances_insert_self
  on compound.cash_balances for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy cash_balances_update_self
  on compound.cash_balances for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger cash_balances_set_updated_at
  before update on compound.cash_balances
  for each row execute function compound.set_updated_at();

revoke all on compound.cash_balances from public, anon;
grant select, insert, update on compound.cash_balances to authenticated;
grant all on compound.cash_balances to service_role;

-- The Data API caches the schema. Without this the new table is invisible to
-- the app even though the compound schema is already exposed.
notify pgrst, 'reload schema';
