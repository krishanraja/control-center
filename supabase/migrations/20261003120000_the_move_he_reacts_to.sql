-- The daily move (ADR-028): the strategist's read that nobody asked for.
--
-- strategist_reads held two kinds of read, a goal and a note, both started by
-- Krish. The daily read is started by the hourly cron once per operator-civil
-- day and is waiting for him on Home. It needs a third source, the civil date
-- it was written for, and a guarantee that one day has one daily read: two
-- cron invocations racing each other must not both pay for a read.
--
-- Nothing else changes. RLS stays service role only (migration
-- 20260927100000): the read names warm contacts and quotes his numbers. The
-- moves and asks it proposes go to the suggestion bank on the existing
-- strategist_next_step and strategist_ask surfaces, already hidden from the
-- anon key.
--
-- Until this is applied the cron writes no row, and writes no row means it
-- calls no model: api/_dailyMove.ts refuses to spend on a read it cannot keep.

alter table public.strategist_reads
  drop constraint if exists strategist_reads_source_check;

alter table public.strategist_reads
  add constraint strategist_reads_source_check
  check (source = any (array['goal'::text, 'note'::text, 'daily'::text]));

alter table public.strategist_reads
  add column if not exists read_date date;

comment on column public.strategist_reads.read_date is
  'Daily reads only: the operator-civil date the move is for. Null on goal and note reads.';

-- A daily read is about a day, not about a goal or something he said.
alter table public.strategist_reads
  add constraint strategist_reads_daily_is_a_day
  check (
    source <> 'daily'
    or (read_date is not null and goal_id is null and note_kind is null and note_body is null)
  );

-- One daily read per day. The cron's second invocation in the same minute
-- hits this and stops, instead of writing and paying for a second read.
create unique index if not exists strategist_reads_one_daily_per_day
  on public.strategist_reads (read_date)
  where source = 'daily';
