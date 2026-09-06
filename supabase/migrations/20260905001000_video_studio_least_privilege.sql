-- Replace inherited service-role privileges with the exact Video Studio surface.
-- Existing project default privileges grant service_role ALL on new objects, so
-- narrow GRANT statements are not sufficient unless the inherited ACL is reset.

begin;

revoke all on public.video_studio_jobs from service_role;
revoke all on public.video_studio_job_platform_states from service_role;
revoke all on public.video_studio_review_requests from service_role;
revoke all on public.video_studio_commands from service_role;
revoke all on public.video_studio_review_events from service_role;
revoke all on public.video_studio_command_receipts from service_role;
revoke all on public.video_studio_preview_upload_slots from service_role;
revoke all on public.video_studio_runner_heartbeats from service_role;
revoke all on public.video_studio_rate_limits from service_role;
revoke all on public.video_studio_projection_events from service_role;
revoke all on public.video_studio_preview_retention_events from service_role;
revoke all on public.video_studio_command_recoveries from service_role;

grant select, insert, update on public.video_studio_jobs to service_role;
grant select, insert, update on public.video_studio_job_platform_states to service_role;
grant select, insert, update on public.video_studio_review_requests to service_role;
grant select, insert, update on public.video_studio_commands to service_role;
grant select, insert on public.video_studio_review_events to service_role;
grant select, insert on public.video_studio_command_receipts to service_role;
grant select, insert on public.video_studio_preview_upload_slots to service_role;
grant select, insert, update on public.video_studio_runner_heartbeats to service_role;
grant select, insert, update on public.video_studio_rate_limits to service_role;
grant select, insert on public.video_studio_projection_events to service_role;
grant select, insert on public.video_studio_preview_retention_events to service_role;
grant select, insert on public.video_studio_command_recoveries to service_role;

revoke execute on function public.video_studio_valid_platforms(text[]) from service_role;
revoke execute on function public.video_studio_touch_updated_at() from service_role;
revoke execute on function public.video_studio_reject_append_only_mutation() from service_role;
revoke execute on function public.video_studio_protect_command_core() from service_role;
revoke execute on function public.video_studio_protect_review_core() from service_role;
revoke execute on function public.video_studio_take_rate_limit(text, text, integer, integer) from service_role;
revoke execute on function public.video_studio_preview_retention_candidates(timestamptz, integer) from service_role;
revoke execute on function public.video_studio_record_preview_retention(uuid, uuid, timestamptz, integer) from service_role;
revoke execute on function public.video_studio_project_review(text, text, uuid, text, jsonb) from service_role;
revoke execute on function public.video_studio_enqueue_command(text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text) from service_role;
revoke execute on function public.video_studio_record_decision(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text) from service_role;
revoke execute on function public.video_studio_recover_failed_review(uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text) from service_role;
revoke execute on function public.video_studio_claim_command(text, text, integer) from service_role;
revoke execute on function public.video_studio_record_heartbeat(text, text, text, integer[], text, uuid, integer, timestamptz, text, integer) from service_role;
revoke execute on function public.video_studio_reserve_preview_upload(uuid, text, text, text, text, text, text, integer, text) from service_role;
revoke execute on function public.video_studio_complete_command(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, timestamptz, timestamptz) from service_role;

grant execute on function public.video_studio_valid_platforms(text[]) to service_role;
grant execute on function public.video_studio_take_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.video_studio_preview_retention_candidates(timestamptz, integer) to service_role;
grant execute on function public.video_studio_record_preview_retention(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.video_studio_project_review(text, text, uuid, text, jsonb) to service_role;
grant execute on function public.video_studio_enqueue_command(text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text) to service_role;
grant execute on function public.video_studio_record_decision(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text) to service_role;
grant execute on function public.video_studio_recover_failed_review(uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text) to service_role;
grant execute on function public.video_studio_claim_command(text, text, integer) to service_role;
grant execute on function public.video_studio_record_heartbeat(text, text, text, integer[], text, uuid, integer, timestamptz, text, integer) to service_role;
grant execute on function public.video_studio_reserve_preview_upload(uuid, text, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.video_studio_complete_command(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, timestamptz, timestamptz) to service_role;

commit;
