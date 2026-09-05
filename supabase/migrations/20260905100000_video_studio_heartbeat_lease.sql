-- Qualify every video_studio_commands reference in the active-lease renewal.
-- The function's lease_expires_at output parameter otherwise shadows the
-- table column in PL/pgSQL and makes every long-running runner renewal fail.

begin;

create or replace function public.video_studio_record_heartbeat(
  p_runner_id_hash text,
  p_runner_status text,
  p_software_commit text,
  p_command_schema_versions integer[],
  p_drive_state text,
  p_active_command_id uuid,
  p_pending_receipts integer,
  p_occurred_at timestamptz,
  p_lease_token_hash text,
  p_lease_seconds integer
) returns table (accepted boolean, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease_expires_at timestamptz;
begin
  if p_active_command_id is not null then
    update public.video_studio_commands as c
    set lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds)
    where c.id = p_active_command_id
      and c.status = 'leased'
      and c.lease_owner_hash = p_runner_id_hash
      and c.lease_token_hash = p_lease_token_hash
      and c.lease_expires_at > pg_catalog.now()
    returning c.lease_expires_at into v_lease_expires_at;
    if not found then
      accepted := false;
      lease_expires_at := null;
      return next;
      return;
    end if;
  end if;

  insert into public.video_studio_runner_heartbeats (
    runner_id_hash, runner_status, software_commit, command_schema_versions,
    drive_state, active_command_id, pending_receipts, occurred_at, received_at
  ) values (
    p_runner_id_hash, p_runner_status, p_software_commit, p_command_schema_versions,
    p_drive_state, p_active_command_id, p_pending_receipts, p_occurred_at, pg_catalog.now()
  ) on conflict (runner_id_hash) do update set
    runner_status = excluded.runner_status,
    software_commit = excluded.software_commit,
    command_schema_versions = excluded.command_schema_versions,
    drive_state = excluded.drive_state,
    active_command_id = excluded.active_command_id,
    pending_receipts = excluded.pending_receipts,
    occurred_at = excluded.occurred_at,
    received_at = pg_catalog.now();

  accepted := true;
  lease_expires_at := v_lease_expires_at;
  return next;
end;
$$;

revoke execute on function public.video_studio_record_heartbeat(text, text, text, integer[], text, uuid, integer, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.video_studio_record_heartbeat(text, text, text, integer[], text, uuid, integer, timestamptz, text, integer) to service_role;

commit;
