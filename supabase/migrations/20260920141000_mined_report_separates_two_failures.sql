-- A verification call caught this one minute after 20260920140000 applied.
--
-- mark_inspiration_messages_mined reported `already_mined: asked - marked`,
-- which is right only if every id asked about exists. Called with one id that
-- was not in the table at all it answered `already_mined: 1`, which is the same
-- shape of quiet untruth the migration above exists to remove: a caller passing
-- garbage ids would read a clean "all already done". The two cases are counted
-- separately now, and an id the ledger has never heard of is named as such.

create or replace function public.mark_inspiration_messages_mined(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ids     text[];
  n       int;
  present int;
begin
  select array_agg(x) into ids
  from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) as t(x);

  -- Zero ids is valid and says so. The sweep legitimately runs with nothing
  -- new to read, and a silent 0 there is indistinguishable from a caller that
  -- forgot to pass the ids.
  if ids is null or array_length(ids, 1) is null then
    return jsonb_build_object('marked', 0, 'asked', 0, 'reason', 'no_ids_given');
  end if;

  select count(*) into present
  from public.inspiration_messages
  where gmail_message_id = any(ids);

  update public.inspiration_messages
     set mined_at = now(),
         run_ref  = coalesce(nullif(p->>'run_ref', ''), run_ref)
   where gmail_message_id = any(ids)
     and mined_at is null;
  get diagnostics n = row_count;

  return jsonb_build_object(
    'marked',        n,
    'asked',         array_length(ids, 1),
    'run_ref',       p->>'run_ref',
    -- A re-run of the same batch is how a retry looks and must be idempotent
    -- rather than noisy, so already_mined is normal.
    'already_mined', present - n,
    -- An id the ledger has never seen is NOT normal: it means the caller and
    -- the ledger disagree about what was fetched, and it gets its own number.
    'not_registered', array_length(ids, 1) - present
  );
end $$;

comment on function public.mark_inspiration_messages_mined(jsonb) is
  'Called by the Inspiration Sweep immediately after the extraction model returns, with { ids: [gmail_message_id], run_ref }. Marks those messages read so Seen Filter skips them next time. Idempotent, and reports already_mined and not_registered separately. Until this runs, the messages stay unseen and come back on the next sweep.';

revoke all on function public.mark_inspiration_messages_mined(jsonb) from public, anon, authenticated;
grant execute on function public.mark_inspiration_messages_mined(jsonb) to service_role;

-- APPLIED 2026-09-20. Verified: ghost id alone gives {marked 0, already_mined 0,
-- not_registered 1}; a real id plus a ghost gives {already_mined 1,
-- not_registered 1}.
--
-- END TO END, n8n execution 43145 (66s, success): one newsletter had its
-- mined_at nulled by hand, the sweep listed 33 messages and found 2 unseen (the
-- reopened one plus a genuinely new one), Anthropic returned 2 survivors, and
-- Mark Messages Mined reported {asked 2, marked 2, already_mined 0,
-- not_registered 0}. Upsert Seed RPC recorded the reopened one as a recurrence
-- rather than a second row, so re-reading a newsletter costs a recurrence entry
-- and not a duplicate idea.
