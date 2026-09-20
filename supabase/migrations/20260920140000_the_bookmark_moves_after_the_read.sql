-- The sweep marked a newsletter read before it had read it.
--
-- 20260920120000 recovered the 20 newsletters a dead Anthropic key ate, by
-- hand, after the fact. This is the change that stops it happening again, and
-- it is the one Krish asked for in one line: write the bookmark AFTER the model
-- call, not before.
--
-- Why it could not simply be "move the node". The n8n node that writes the
-- bookmark, `Register Messages`, does two unrelated jobs in one RPC: it upserts
-- newsletter_sources and RETURNS the canonical label map that the very next
-- node feeds into the extraction prompt. Move it late and the prompt loses its
-- labels; leave it early and the bookmark stays early. So the two jobs are
-- separated here by state rather than by position: the row still appears at
-- fetch time, and a new column says whether anything was ever read out of it.
--
--   first_seen_at  the newsletter ARRIVED          (written at fetch, as today)
--   mined_at       the model actually READ it      (written after extraction)
--
-- Seen Filter now reads `inspiration_messages_mined`, so a message that was
-- fetched and never mined is simply unseen on the next run and comes back with
-- no human involved. The recovery RPC becomes a tool for history rather than
-- the only way out.
--
-- Keeping both timestamps is deliberate. `inspiration_lane_health` compares
-- inputs arriving against seeds produced, and that comparison is the one signal
-- that would have caught this outage on day one. Had the row moved wholesale to
-- mining time, inputs and seeds would move together by construction and the
-- view would have lost the ability to disagree with itself.

-- ---------------------------------------------------------------------------
-- 1. The column, and what the 340 existing rows are assumed to be
-- ---------------------------------------------------------------------------

alter table public.inspiration_messages
  add column if not exists mined_at timestamptz;

comment on column public.inspiration_messages.mined_at is
  'When the extraction model actually read this message. NULL means fetched and never read, which is what an outage leaves behind; such a row is not in inspiration_messages_mined and the next sweep offers the message again.';

-- The table never recorded which messages were mined, so history cannot be
-- reconstructed: every existing row is assumed mined. That is not a claim, it
-- is the status quo carried forward, because an unmined row invisible today
-- stays invisible either way. The 20 known casualties are not among them; they
-- were reopened on 2026-09-20 and produced 9 ideas. Anything else already lost
-- stays lost, and nothing new joins it.
update public.inspiration_messages
   set mined_at = first_seen_at
 where mined_at is null;

create index if not exists inspiration_messages_unmined_idx
  on public.inspiration_messages (first_seen_at)
  where mined_at is null;

-- ---------------------------------------------------------------------------
-- 2. What Seen Filter reads
-- ---------------------------------------------------------------------------

create or replace view public.inspiration_messages_mined
with (security_invoker = true) as
  select gmail_message_id, newsletter_key, subject, received_at, first_seen_at, mined_at
  from public.inspiration_messages
  where mined_at is not null;

comment on view public.inspiration_messages_mined is
  'The sweep dedup ledger: messages the model has actually read. The n8n Seen Filter node queries this, not the table, so a fetch that never reached the model does not hide the newsletter for ever.';

grant select on public.inspiration_messages_mined to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The write that happens after the model call
-- ---------------------------------------------------------------------------

create or replace function public.mark_inspiration_messages_mined(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ids  text[];
  n    int;
begin
  select array_agg(x) into ids
  from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) as t(x);

  -- Zero ids is valid and says so. The sweep legitimately runs with nothing
  -- new to read, and a silent 0 there is indistinguishable from a caller that
  -- forgot to pass the ids, which is exactly the confusion this whole file is
  -- about.
  if ids is null or array_length(ids, 1) is null then
    return jsonb_build_object('marked', 0, 'asked', 0, 'reason', 'no_ids_given');
  end if;

  update public.inspiration_messages
     set mined_at = now(),
         run_ref  = coalesce(nullif(p->>'run_ref', ''), run_ref)
   where gmail_message_id = any(ids)
     and mined_at is null;
  get diagnostics n = row_count;

  return jsonb_build_object(
    'marked',  n,
    'asked',   array_length(ids, 1),
    'run_ref', p->>'run_ref',
    -- Already-mined ids are not an error: a re-run of the same batch is how a
    -- retry looks, and it must be idempotent rather than noisy.
    'already_mined', array_length(ids, 1) - n
  );
end $$;

comment on function public.mark_inspiration_messages_mined(jsonb) is
  'Called by the Inspiration Sweep immediately after the extraction model returns, with { ids: [gmail_message_id], run_ref }. Marks those messages read so Seen Filter skips them next time. Idempotent. Until this runs, the messages stay unseen and come back on the next sweep.';

revoke all on function public.mark_inspiration_messages_mined(jsonb) from public, anon, authenticated;
grant execute on function public.mark_inspiration_messages_mined(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. intake_items stops claiming a newsletter was assessed before it was
-- ---------------------------------------------------------------------------
--
-- The mirror fired AFTER INSERT and wrote state 'assessed' with assessed_at =
-- first_seen_at, which for the 20 casualties was a straight untruth: the row
-- said assessed and nothing had assessed it. It now fires on mining, which is
-- the moment the word becomes true.

create or replace function public.intake_mirror_inspiration_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mined_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.mined_at is not null then return new; end if;

  insert into public.intake_items
    (source, source_ref, title, received_at, first_seen_at, state, assessed_at, raw)
  values
    ('gmail_newsletters', new.gmail_message_id, new.subject,
     new.received_at, coalesce(new.first_seen_at, now()),
     'assessed', coalesce(new.mined_at, now()),
     jsonb_build_object('bridge','intake_mirror_inspiration_message','from','inspiration_messages',
       'thread_id',new.thread_id,'from_email',new.from_email,
       'newsletter_key',new.newsletter_key,'run_ref',new.run_ref,
       'mined_at',new.mined_at))
  on conflict (source, source_ref) do nothing;
  return new;
end $$;

drop trigger if exists trg_intake_mirror_inspiration_message on public.inspiration_messages;
create trigger trg_intake_mirror_inspiration_message
  after insert or update of mined_at on public.inspiration_messages
  for each row execute function public.intake_mirror_inspiration_message();

-- ---------------------------------------------------------------------------
-- 5. Reopening stops being a delete
-- ---------------------------------------------------------------------------
--
-- With mined_at, reopening is "this was never read" rather than "forget this
-- arrived". The window, the cap and the dry-run default all stay; what goes is
-- the DELETE, and with it the only way this function could lose a record.

create or replace function public.reopen_unmined_newsletters(
  from_day date,
  to_day   date,
  dry_run  boolean default true
)
returns table (gmail_message_id text, subject text, first_seen_at timestamptz, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  span int := (to_day - from_day);
begin
  if from_day is null or to_day is null then
    raise exception 'reopen_unmined_newsletters needs an explicit from_day and to_day';
  end if;
  if span < 0 then
    raise exception 'from_day % is after to_day %', from_day, to_day;
  end if;
  if span > 31 then
    raise exception 'window is % days; 31 is the maximum, because a wider reopen re-reads and re-bills more than any outage justifies', span;
  end if;

  if dry_run then
    return query
      select im.gmail_message_id, im.subject, im.first_seen_at, 'would reopen'::text
      from public.inspiration_messages im
      where im.first_seen_at::date between from_day and to_day
        and im.mined_at is not null
      order by im.first_seen_at;
  else
    return query
      update public.inspiration_messages im
         set mined_at = null
       where im.first_seen_at::date between from_day and to_day
         and im.mined_at is not null
      returning im.gmail_message_id, im.subject, im.first_seen_at, 'reopened'::text;
  end if;
end $$;

comment on function public.reopen_unmined_newsletters(date, date, boolean) is
  'Clears mined_at for Gmail messages first seen in a window, so the sweep reads them again. Since 20260920140000 the sweep does this for itself when extraction fails, so this is for history and for a bad read rather than a failed one. Defaults to a dry run; the window is required and capped at 31 days. Nothing is deleted and intake_items keeps its record.';

revoke all on function public.reopen_unmined_newsletters(date, date, boolean) from public, anon, authenticated;
grant execute on function public.reopen_unmined_newsletters(date, date, boolean) to service_role;
