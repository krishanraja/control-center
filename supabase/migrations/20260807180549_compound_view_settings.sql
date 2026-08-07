-- COMPOUND view settings. Industry exclusions apply across every tab, so they
-- follow the member rather than the browser. Same isolation posture as the rest
-- of the schema: allowlisted members only, RLS forced, nothing granted to anon.

create table compound.view_settings (
  user_id uuid primary key references compound.members(user_id) on delete cascade,
  excluded_industries text[] not null default '{}'::text[]
    check (cardinality(excluded_industries) <= 400),
  updated_at timestamptz not null default now()
);

comment on table compound.view_settings is 'Per-member COMPOUND display settings. Industry exclusions only, no market data.';

alter table compound.view_settings enable row level security;
alter table compound.view_settings force row level security;

create policy view_settings_read_self
  on compound.view_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy view_settings_insert_self
  on compound.view_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy view_settings_update_self
  on compound.view_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger view_settings_set_updated_at
  before update on compound.view_settings
  for each row execute function compound.set_updated_at();

revoke all on compound.view_settings from public, anon;
grant select, insert, update on compound.view_settings to authenticated;
grant all on compound.view_settings to service_role;

-- The Data API caches the schema. Without this the new table is invisible to
-- the app even though the compound schema is already exposed.
notify pgrst, 'reload schema';
