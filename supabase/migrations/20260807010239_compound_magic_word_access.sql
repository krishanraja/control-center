-- COMPOUND records only one-way client fingerprints for magic-word throttling.
-- The word itself and client IP addresses are never stored.

create table if not exists compound.access_attempts (
  id uuid primary key default gen_random_uuid(),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('reserved', 'accepted', 'rejected', 'error')),
  attempted_at timestamptz not null default now()
);

create index if not exists access_attempts_fingerprint_time_idx
  on compound.access_attempts (fingerprint_hash, attempted_at desc);

alter table compound.access_attempts enable row level security;
alter table compound.access_attempts force row level security;

revoke all on compound.access_attempts from public, anon, authenticated;
grant all on compound.access_attempts to service_role;

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
    from compound.access_attempts
    where fingerprint_hash = p_fingerprint_hash
      and outcome in ('reserved', 'rejected', 'error')
      and attempted_at >= now() - interval '15 minutes'
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

-- The older email-delivery reservation is no longer used. Remove its elevated
-- execution context while leaving the applied migration history intact.
alter function compound.reserve_login_delivery(text) security invoker;

comment on table compound.access_attempts is
  'COMPOUND magic-word rate-limit audit. Contains no word or client IP address.';

comment on function compound.reserve_access_attempt(text) is
  'Atomically reserves a COMPOUND magic-word attempt with a five-try, fifteen-minute limit.';
