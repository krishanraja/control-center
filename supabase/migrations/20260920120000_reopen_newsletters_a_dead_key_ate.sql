-- A newsletter read during an outage was never actually read.
--
-- The Inspiration Sweep registers a Gmail message in inspiration_messages
-- straight after fetching its body, which is several nodes BEFORE the Anthropic
-- call that turns it into ideas. That ordering is deliberate and defensible on
-- its own: it stops a crash mid-batch causing every message to be re-fetched
-- and re-billed. Its cost is that the ledger records "I saw this", and every
-- reader treats it as "I processed this".
--
-- Between 2026-09-16 and 2026-09-19 every Anthropic credential in the n8n
-- instance was rejected. The sweep ran on schedule, fetched 20 newsletters
-- across those four days, registered all 20, failed the extraction, and
-- produced zero ideas. The last idea it ever made is dated 2026-09-15, the day
-- before. Those 20 are now permanently invisible to it: listed, marked seen,
-- and never to be offered again. That is four days of the best weekly material
-- Krish has, consumed and discarded, and nothing anywhere said so.
--
-- This is the recovery, written as a named operation rather than left as a
-- DELETE somebody runs by hand at the wrong time. It removes ONLY the dedup
-- bookmark, never a Gmail message and never an idea. The next sweep re-lists
-- those ids, finds them unseen, and reads them properly.
--
-- intake_items keeps its rows throughout: the bridge is on conflict do nothing,
-- so the intake's record that these arrived stays whole and re-registration
-- does not duplicate it. That is the point of having both.

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
  -- A window is required and bounded. An unbounded reopen would re-read and
  -- re-bill the entire history, which is the one way this function could cost
  -- more than the problem it solves.
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
      order by im.first_seen_at;
  else
    return query
      delete from public.inspiration_messages im
      where im.first_seen_at::date between from_day and to_day
      returning im.gmail_message_id, im.subject, im.first_seen_at, 'reopened'::text;
  end if;
end $$;

comment on function public.reopen_unmined_newsletters(date, date, boolean) is
  'Removes the Inspiration Sweep dedup bookmark for Gmail messages first seen in a window, so the sweep reads them again. For recovering newsletters the sweep registered and then failed to extract, which is what a provider outage does to it. Defaults to a dry run; the window is required and capped at 31 days. Deletes a bookmark only: never a Gmail message, never an idea, and intake_items keeps its record either way.';

revoke all on function public.reopen_unmined_newsletters(date, date, boolean) from public, anon, authenticated;
grant execute on function public.reopen_unmined_newsletters(date, date, boolean) to service_role;

-- APPLIED 2026-09-20. Dry run over 2026-09-16 to 2026-09-19 returns the 20
-- newsletters the outage ate. The reopen itself is Krish's call: it is a delete,
-- and a delete gets its own yes however small the blast radius.
