-- Qualify the audit outcome column so it cannot be confused with the
-- reserve_access_attempt return column of the same name.

create or replace function compound.reserve_access_attempt(p_fingerprint_hash text)
returns table (attempt_id uuid, outcome text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reserved_id uuid;
begin
  if p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint_hash, 0));

  if (
    select count(*)
    from compound.access_attempts as attempts
    where attempts.fingerprint_hash = p_fingerprint_hash
      and attempts.outcome in ('reserved', 'rejected', 'error')
      and attempts.attempted_at >= now() - interval '15 minutes'
  ) >= 5 then
    return query select null::uuid, 'locked'::text;
    return;
  end if;

  insert into compound.access_attempts (fingerprint_hash, outcome)
  values (p_fingerprint_hash, 'reserved')
  returning id into reserved_id;

  return query select reserved_id, 'reserved'::text;
end;
$$;

revoke all on function compound.reserve_access_attempt(text) from public, anon, authenticated;
grant execute on function compound.reserve_access_attempt(text) to service_role;
