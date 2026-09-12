-- Production readback showed Supabase's default REFERENCES and TRIGGER grants
-- survived the first migration. Restrict the event inbox to its exact API use.

begin;

revoke all on table public.harness_event_inbox from service_role;
grant select, insert on table public.harness_event_inbox to service_role;

revoke all on sequence public.harness_event_inbox_inbox_id_seq from service_role;
grant usage, select on sequence public.harness_event_inbox_inbox_id_seq to service_role;

commit;
