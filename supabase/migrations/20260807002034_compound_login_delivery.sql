-- COMPOUND owns its login delivery audit and rate-limit state.
-- Email addresses are never stored here, only a one-way SHA-256 digest.

create table compound.login_deliveries (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('reserved', 'sent', 'failed')),
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  provider_message_id text,
  failure_code text
);

create index login_deliveries_email_requested_idx
  on compound.login_deliveries (email_hash, requested_at desc);

alter table compound.login_deliveries enable row level security;
alter table compound.login_deliveries force row level security;

revoke all on compound.login_deliveries from public, anon, authenticated;
grant all on compound.login_deliveries to service_role;

comment on table compound.login_deliveries is
  'COMPOUND-only auth email delivery audit and rate-limit state. Contains no plaintext email address.';

create or replace function compound.reserve_login_delivery(p_email_hash text)
returns table (delivery_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_id uuid;
begin
  if p_email_hash !~ '^[0-9a-f]{64}$' then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  -- Serialize reservations for one address so parallel requests cannot bypass the limits.
  perform pg_advisory_xact_lock(hashtextextended(p_email_hash, 0));

  if exists (
    select 1
    from compound.login_deliveries
    where email_hash = p_email_hash
      and status in ('reserved', 'sent')
      and requested_at >= now() - interval '1 minute'
  ) then
    return query select null::uuid, 'minute_limit'::text;
    return;
  end if;

  if (
    select count(*)
    from compound.login_deliveries
    where email_hash = p_email_hash
      and status = 'sent'
      and requested_at >= now() - interval '1 hour'
  ) >= 5 then
    return query select null::uuid, 'hour_limit'::text;
    return;
  end if;

  insert into compound.login_deliveries (email_hash, status)
  values (p_email_hash, 'reserved')
  returning id into reserved_id;

  return query select reserved_id, 'reserved'::text;
end;
$$;

revoke all on function compound.reserve_login_delivery(text) from public, anon, authenticated;
grant execute on function compound.reserve_login_delivery(text) to service_role;

comment on function compound.reserve_login_delivery(text) is
  'Atomically reserves a COMPOUND login email while enforcing its minute and hourly limits.';
