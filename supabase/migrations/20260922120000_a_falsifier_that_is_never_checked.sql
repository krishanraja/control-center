-- The corrections log, finally wired to something.
--
-- investigation_claims has carried falsifier_due_on since 2026-08-05, and the
-- migration that added it says exactly what it is for:
--
--   "A falsifier is a product, not just a gate: falsifier_due_on feeds the
--    public corrections log, which turns an apology page into a scoreboard."
--
-- The column has been written on every claim since. Nothing has ever read it.
-- There is no job that wakes up when a date passes, no record of whether a
-- claim held, and therefore no scoreboard. The audit that prompted this found
-- one write and no reads anywhere in the codebase.
--
-- That is the most valuable thing in this system left on the floor. Gathering
-- AI news is commodity work: anyone with GDELT and a model gets the same
-- headlines, and the twenty cards Home shows are worth exactly what any other
-- aggregator's twenty are worth. A dated, public record of calls this system
-- made and whether they came true is not commodity. It cannot be bought, it
-- cannot be caught up on, and it gets more valuable every month it runs.
--
-- Two design decisions worth stating.
--
-- A claim coming due is recorded SEPARATELY from a claim being ruled on. If
-- the only row were the verdict, a claim whose date passed and which nobody
-- ever looked at would be indistinguishable from one that never came due, and
-- a scoreboard that quietly omits the awkward ones is worse than no
-- scoreboard. came_due is written by the machine the day it happens, and it is
-- permanent whether or not a ruling ever follows.
--
-- The verdict is NOT automated, and that is deliberate rather than a gap.
-- Asking the same system that made a claim to grade it produces a number
-- nobody should trust, least of all publicly. The machine's job is to make the
-- date impossible to miss and the record impossible to quietly edit. The
-- ruling is Krish's, recorded through api/claims/rule.ts with its evidence.

create table if not exists public.claim_resolutions (
  id          bigint generated always as identity primary key,
  claim_id    uuid not null references public.investigation_claims(id) on delete restrict,

  -- 'came_due' is the machine noticing. 'ruled' is a person deciding.
  event       text not null check (event in ('came_due', 'ruled')),

  -- held: the claim survived its own falsifier. broke: the falsifier fired and
  -- the claim was wrong. unclear: checked, genuinely indeterminate, which is an
  -- honest answer and is counted as its own thing rather than folded into
  -- either side. not_checkable: the falsifier turned out not to be checkable
  -- after all, which is a finding about our own claim writing.
  verdict     text check (verdict in ('held', 'broke', 'unclear', 'not_checkable')),
  rationale   text,
  evidence    jsonb not null default '[]'::jsonb,
  ruled_by    text,
  due_on      date,
  created_at  timestamptz not null default now(),

  constraint claim_resolutions_ruling_has_a_verdict
    check (event <> 'ruled' or verdict is not null),
  constraint claim_resolutions_due_has_no_verdict
    check (event <> 'came_due' or verdict is null),
  constraint claim_resolutions_ruling_says_who
    check (event <> 'ruled' or (ruled_by is not null and length(btrim(ruled_by)) > 0))
);

-- A claim comes due once. A re-run of the sweep must not write a second one.
create unique index if not exists claim_resolutions_one_due
  on public.claim_resolutions (claim_id) where event = 'came_due';

create index if not exists claim_resolutions_claim on public.claim_resolutions (claim_id, created_at desc);
create index if not exists claim_resolutions_verdict on public.claim_resolutions (verdict) where verdict is not null;

comment on table public.claim_resolutions is
  'Whether the calls this system made came true. came_due is written by the machine the day a falsifier matures and is permanent whether or not anyone rules; ruled is a person deciding, with evidence. Append only, so the scoreboard cannot be tidied after the fact, which is the only thing that makes it worth publishing.';
comment on column public.claim_resolutions.verdict is
  'held, broke, unclear or not_checkable. unclear is a real answer and is counted separately rather than folded into either side. not_checkable is a finding about our own claim writing, not about the world.';

-- Append only. A scoreboard whose losing rows can be edited later is not a
-- scoreboard, and this is the table most likely to be tempting to tidy.
create or replace function public.claim_resolutions_are_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'claim_resolutions is append only: a ruling cannot be deleted'
      using hint = 'A ruling that turned out to be wrong is corrected by recording a further ruling. The first one stays, because a record that can be tidied proves nothing.';
  end if;
  raise exception 'claim_resolutions is append only: a ruling cannot be edited'
    using hint = 'Record a new ruling. The scoreboard reads the latest and keeps the rest.';
end;
$$;

drop trigger if exists claim_resolutions_append_only on public.claim_resolutions;
create trigger claim_resolutions_append_only
  before update or delete on public.claim_resolutions
  for each row execute function public.claim_resolutions_are_append_only();

-- ── What is waiting for a ruling ───────────────────────────────────────────

create or replace view public.claims_due as
select
  c.id as claim_id,
  c.investigation_id,
  c.ref,
  c.text as claim,
  c.falsifier,
  c.falsifier_due_on,
  c.source_url,
  c.source_domain,
  (current_date - c.falsifier_due_on)::integer as days_overdue,
  d.created_at as noticed_at
from public.investigation_claims c
left join public.claim_resolutions d
  on d.claim_id = c.id and d.event = 'came_due'
where c.falsifier_due_on is not null
  and c.falsifier_due_on <= current_date
  and not exists (
    select 1 from public.claim_resolutions r
    where r.claim_id = c.id and r.event = 'ruled'
  );

comment on view public.claims_due is
  'Claims whose falsifier has matured and which nobody has ruled on. days_overdue is the number that matters: a corrections log that is three months behind is a claim about diligence that is not true.';

-- ── The scoreboard ─────────────────────────────────────────────────────────
--
-- The latest ruling per claim, then counted. Earlier rulings stay in the table
-- and are deliberately not counted twice: changing your mind about a call is
-- allowed and is part of the record, but it is not two calls.

create or replace view public.claim_scoreboard as
with latest as (
  select distinct on (claim_id) claim_id, verdict, created_at
  from public.claim_resolutions
  where event = 'ruled'
  order by claim_id, created_at desc
)
select
  count(*)::integer as ruled,
  count(*) filter (where verdict = 'held')::integer as held,
  count(*) filter (where verdict = 'broke')::integer as broke,
  count(*) filter (where verdict = 'unclear')::integer as unclear,
  count(*) filter (where verdict = 'not_checkable')::integer as not_checkable,
  -- The published number. Denominator is held plus broke only: an unclear or
  -- an unusable falsifier is not evidence either way, and quietly counting it
  -- as a win is how a scoreboard becomes marketing.
  case
    when count(*) filter (where verdict in ('held', 'broke')) = 0 then null
    else round(
      count(*) filter (where verdict = 'held')::numeric
      / count(*) filter (where verdict in ('held', 'broke')) * 100, 1)
  end as hit_rate_pct,
  (select count(*) from public.claims_due)::integer as awaiting_ruling
from latest;

comment on view public.claim_scoreboard is
  'The number this is all for: of the checkable calls that have been ruled on, how many held. unclear and not_checkable are excluded from the denominator rather than counted as wins, and awaiting_ruling sits beside it so a flattering rate cannot be read without seeing how much is unjudged.';

alter table public.claim_resolutions enable row level security;
revoke all on public.claim_resolutions from anon, authenticated;
revoke update, delete on public.claim_resolutions from public;
