-- The intake has to stay whole, not be whole once.
--
-- 20260919120000_one_intake.sql backfilled every read ledger into intake_items
-- and gave content_ideas a bridge trigger so a directly written idea keeps
-- mirroring. The three READ ledgers got the backfill and no bridge. Their
-- writers kept running.
--
-- Two hours after that migration applied, inspiration_messages held 340 rows
-- against 338 gmail_newsletters intake rows: the Gmail sweep had run twice and
-- neither message reached the ledger that is supposed to hold everything that
-- ever arrived. That is not a small gap, it is the whole promise: a table whose
-- job is to answer "why is this not in my queue" cannot answer it about a
-- newsletter it never heard of, and the drift grows twice a day forever.
--
-- So each read ledger gets the same bridge content_ideas already had. The
-- triggers are dated in the same way and come out in the same change: when a
-- writer is pointed at intake_items directly, its bridge goes with it.
--
-- Every function here is SECURITY DEFINER and every one carries the revoke and
-- grant pair, which 20260919120000 forgot on its own bridge and had to add in a
-- follow-up. A SECURITY DEFINER function with no revoke is published by
-- PostgREST at /rest/v1/rpc/<name> for anon and authenticated, which is what
-- Supabase lints 0028 and 0029 report. Written in from the start here.

begin;

-- ── 1. Gmail newsletters ───────────────────────────────────────────────────
-- The sweep reads a message and either makes an idea from it or does not;
-- either way it has been read, so the intake row lands 'assessed'. A message
-- id is not a link, so url stays null, and a newsletter is a container rather
-- than a story, so story_key stays null. Same shape as the 5b backfill.
create or replace function public.intake_mirror_inspiration_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.intake_items
    (source, source_ref, title, received_at, first_seen_at, state, assessed_at, raw)
  values
    ('gmail_newsletters', new.gmail_message_id, new.subject,
     new.received_at, coalesce(new.first_seen_at, now()),
     'assessed', coalesce(new.first_seen_at, now()),
     jsonb_build_object(
       'bridge',         'intake_mirror_inspiration_message',
       'from',           'inspiration_messages',
       'thread_id',      new.thread_id,
       'from_email',     new.from_email,
       'newsletter_key', new.newsletter_key,
       'run_ref',        new.run_ref))
  on conflict (source, source_ref) do nothing;
  return new;
end $$;

comment on function public.intake_mirror_inspiration_message() is
  'Bridge, dated 2026-09-19. Mirrors a Gmail message the sweep registered into intake_items as assessed. To be dropped when the sweep writes intake_items directly.';

revoke all on function public.intake_mirror_inspiration_message() from public, anon, authenticated;
grant execute on function public.intake_mirror_inspiration_message() to service_role;

drop trigger if exists trg_intake_mirror_inspiration_message on public.inspiration_messages;
create trigger trg_intake_mirror_inspiration_message
  after insert on public.inspiration_messages
  for each row execute function public.intake_mirror_inspiration_message();

-- ── 2. Drive files ─────────────────────────────────────────────────────────
-- This ledger is written twice per file: once when the scan first lists it, and
-- again when it is processed or skipped. So the bridge fires on both and the
-- second write moves the state, rather than inserting a second row or leaving
-- the first one stale at 'new'. The verdict mapping is the scan's own, exactly
-- as the 5c backfill read it.
create or replace function public.intake_mirror_drive_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_state text;
  next_assessed timestamptz;
  next_drop text;
begin
  next_state := case
    when new.skip_reason is not null then 'dropped'
    when new.processed_at is not null then 'assessed'
    else 'new'
  end;
  next_assessed := case
    when new.skip_reason is not null or new.processed_at is not null
      then coalesce(new.processed_at, new.first_seen_at, now())
  end;
  next_drop := case when new.skip_reason is not null then 'unreadable_source' end;

  insert into public.intake_items
    (source, source_ref, url, title, received_at, first_seen_at,
     state, assessed_at, drop_reason, raw)
  values
    ('drive_files', new.file_key,
     'https://drive.google.com/open?id=' || new.file_id,
     new.name, new.modified_at, coalesce(new.first_seen_at, now()),
     next_state, next_assessed, next_drop,
     jsonb_build_object(
       'bridge',       'intake_mirror_drive_file',
       'from',         'inspiration_drive_files',
       'file_id',      new.file_id,
       'mime_type',    new.mime_type,
       'size_bytes',   new.size_bytes,
       'run_ref',      new.run_ref,
       'processed_at', new.processed_at,
       'skip_reason',  new.skip_reason,
       'attempts',     new.attempts))
  on conflict (source, source_ref) do update
    set state       = excluded.state,
        assessed_at = excluded.assessed_at,
        drop_reason = excluded.drop_reason,
        raw         = public.intake_items.raw || excluded.raw
    -- Never drag a promoted row backwards. Once a file became an idea, the
    -- scan re-listing it does not un-promote it.
    where public.intake_items.state <> 'promoted';
  return new;
end $$;

comment on function public.intake_mirror_drive_file() is
  'Bridge, dated 2026-09-19. Mirrors a Drive inspiration file into intake_items and moves its state when the scan processes or skips it. Never moves a promoted row backwards. To be dropped when the scan writes intake_items directly.';

revoke all on function public.intake_mirror_drive_file() from public, anon, authenticated;
grant execute on function public.intake_mirror_drive_file() to service_role;

drop trigger if exists trg_intake_mirror_drive_file on public.inspiration_drive_files;
create trigger trg_intake_mirror_drive_file
  after insert or update on public.inspiration_drive_files
  for each row execute function public.intake_mirror_drive_file();

-- ── 3. Hunter newsletter posts ─────────────────────────────────────────────
-- The source is inactive: 21 rows, none since 2026-09-04, and no checked-in
-- workflow names the table. The bridge goes on anyway, because the cost is one
-- function and the alternative is finding out it started writing again by
-- noticing a number disagree in a month.
create or replace function public.intake_mirror_hunter_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.intake_items
    (source, source_ref, url, title, received_at, first_seen_at, state, assessed_at, raw)
  values
    ('hunter_newsletter_posts', new.link, new.link, new.title,
     coalesce(new.published_at, new.fetched_at), coalesce(new.fetched_at, now()),
     case when new.processed_at is not null then 'assessed' else 'new' end,
     new.processed_at,
     jsonb_build_object(
       'bridge',       'intake_mirror_hunter_post',
       'from',         'hunter_newsletter_posts',
       'signals',      new.signals,
       'model',        new.model,
       'error',        new.error,
       'published_at', new.published_at))
  on conflict (source, source_ref) do update
    set state       = excluded.state,
        assessed_at = excluded.assessed_at,
        raw         = public.intake_items.raw || excluded.raw
    where public.intake_items.state <> 'promoted';
  return new;
end $$;

comment on function public.intake_mirror_hunter_post() is
  'Bridge, dated 2026-09-19. Mirrors a Hunter newsletter post into intake_items. The source is inactive; the bridge exists so that it restarting is visible rather than silent.';

revoke all on function public.intake_mirror_hunter_post() from public, anon, authenticated;
grant execute on function public.intake_mirror_hunter_post() to service_role;

drop trigger if exists trg_intake_mirror_hunter_post on public.hunter_newsletter_posts;
create trigger trg_intake_mirror_hunter_post
  after insert or update on public.hunter_newsletter_posts
  for each row execute function public.intake_mirror_hunter_post();

-- ── 4. Catch up what drifted between the two migrations ────────────────────
-- Re-runs 5b, 5c and 5d for anything that arrived since. Idempotent on
-- (source, source_ref), so this is also the repair anyone can run by hand if a
-- bridge is ever dropped and re-added.
insert into public.intake_items
  (source, source_ref, title, received_at, first_seen_at, state, assessed_at, raw)
select 'gmail_newsletters', im.gmail_message_id, im.subject,
       im.received_at, im.first_seen_at, 'assessed', im.first_seen_at,
       jsonb_build_object('backfill', '20260919140000_intake_stays_whole',
                          'from', 'inspiration_messages',
                          'thread_id', im.thread_id, 'from_email', im.from_email,
                          'newsletter_key', im.newsletter_key, 'run_ref', im.run_ref)
from public.inspiration_messages im
on conflict (source, source_ref) do nothing;

insert into public.intake_items
  (source, source_ref, url, title, received_at, first_seen_at, state, assessed_at, drop_reason, raw)
select 'drive_files', df.file_key,
       'https://drive.google.com/open?id=' || df.file_id, df.name,
       df.modified_at, df.first_seen_at,
       case when df.skip_reason is not null then 'dropped'
            when df.processed_at is not null then 'assessed' else 'new' end,
       case when df.skip_reason is not null or df.processed_at is not null
            then coalesce(df.processed_at, df.first_seen_at) end,
       case when df.skip_reason is not null then 'unreadable_source' end,
       jsonb_build_object('backfill', '20260919140000_intake_stays_whole',
                          'from', 'inspiration_drive_files', 'file_id', df.file_id,
                          'mime_type', df.mime_type, 'skip_reason', df.skip_reason)
from public.inspiration_drive_files df
on conflict (source, source_ref) do nothing;

insert into public.intake_items
  (source, source_ref, url, title, received_at, first_seen_at, state, assessed_at, raw)
select 'hunter_newsletter_posts', hp.link, hp.link, hp.title,
       coalesce(hp.published_at, hp.fetched_at), hp.fetched_at,
       case when hp.processed_at is not null then 'assessed' else 'new' end,
       hp.processed_at,
       jsonb_build_object('backfill', '20260919140000_intake_stays_whole',
                          'from', 'hunter_newsletter_posts', 'signals', hp.signals)
from public.hunter_newsletter_posts hp
on conflict (source, source_ref) do nothing;

-- ── 5. Assert every ledger is whole, or roll the whole thing back ──────────
do $$
declare miss_gmail int; miss_drive int; miss_hunter int; miss_ideas int;
begin
  select count(*) into miss_gmail from public.inspiration_messages im
   where not exists (select 1 from public.intake_items i
                     where i.source='gmail_newsletters' and i.source_ref=im.gmail_message_id);
  select count(*) into miss_drive from public.inspiration_drive_files df
   where not exists (select 1 from public.intake_items i
                     where i.source='drive_files' and i.source_ref=df.file_key);
  select count(*) into miss_hunter from public.hunter_newsletter_posts hp
   where not exists (select 1 from public.intake_items i
                     where i.source='hunter_newsletter_posts' and i.source_ref=hp.link);
  select count(*) into miss_ideas from public.content_ideas ci
   where not exists (select 1 from public.intake_items i where i.promoted_idea_id = ci.id);
  if miss_gmail + miss_drive + miss_hunter + miss_ideas > 0 then
    raise exception 'intake is not whole: % gmail, % drive, % hunter, % ideas unmirrored',
      miss_gmail, miss_drive, miss_hunter, miss_ideas;
  end if;
  raise notice 'intake whole: % rows across % sources',
    (select count(*) from public.intake_items),
    (select count(distinct source) from public.intake_items);
end $$;

commit;

-- APPLIED 2026-09-19 and read back. Every ledger is whole against intake_items:
-- gmail 340 of 340, drive 17 of 17, hunter 21 of 21, ideas 247 of 247, zero
-- unmirrored on any of them. Total 625 intake rows, up from the 623 the first
-- migration left, which is the two newsletters that arrived in between.
--
-- Proved in a rolled-back transaction: inserting a row into
-- inspiration_messages creates exactly one gmail_newsletters intake row in
-- state assessed. No intake_mirror_* function is executable by anon or
-- authenticated.
