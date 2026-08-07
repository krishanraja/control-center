-- Add COMPOUND to the hosted Data API without replacing any existing schemas.
do $$
declare
  exposed_schemas text;
begin
  select split_part(setting, '=', 2)
    into exposed_schemas
  from pg_db_role_setting role_setting
  join pg_roles role on role.oid = role_setting.setrole
  cross join lateral unnest(role_setting.setconfig) setting
  where role.rolname = 'authenticator'
    and setting like 'pgrst.db_schemas=%'
  limit 1;

  if exposed_schemas is null or btrim(exposed_schemas) = '' then
    exposed_schemas := 'public, graphql_public';
  end if;

  if not exists (
    select 1
    from regexp_split_to_table(exposed_schemas, '\\s*,\\s*') schema_name
    where schema_name = 'compound'
  ) then
    execute format(
      'alter role authenticator set pgrst.db_schemas to %L',
      exposed_schemas || ', compound'
    );
  end if;
end
$$;

notify pgrst, 'reload config';
