-- What he says becomes the plan: the strategist's private store, its three
-- surfaces in the learning bank, and the policies that keep both out of the
-- browser key's reach.
--
-- Krish, 2026-09-27: "If I enter a goal, the tool should actively act like a
-- world class strategy consultant", and "I could just talk into a regular text
-- box with Wispr Flow and explain myself in my own language on a Monday
-- morning, or update any major progress throughout the week, or give a summary
-- of how my week went. ... The system could turn that into recommendations,
-- goals, next steps, etc." His full words are the evidence in
-- docs/focus-purpose/PURPOSE-WORKBOOK.md section 0.7, and only there.
--
-- Ruling (Krish, 2026-09-27): investor and co-founder moves are live now.
-- Ruling (Krish, 2026-09-27): what he says becomes recommendations, goals and
-- next steps. A drafted objective is saved only when he taps "Take it", through
-- the ritual and the goal gate.
--
-- APPLIED LIVE 2026-09-27 with Krish's explicit OK (migration name:
-- what_he_says_becomes_the_plan), read back as service role and as anon.
-- Before it was applied, api/strategist.ts still streamed the read and
-- reported persisted: false, so nothing was lost and nothing reran by itself.
--
-- ── Three properties this file enforces rather than documents ──────────────
--
-- 1. WHAT HE SAID NEVER REACHES THE BROWSER KEY. His notes are mostly about
--    how he feels and what he thinks about what he is doing. suggestions,
--    suggestion_verdicts, pilot_checkins, pilot_asks and worries are all
--    anon-readable (checked live, 2026-09-27), so none of them can hold a note
--    or a read. strategist_reads is service-role only, with anon and
--    authenticated revoked outright rather than merely left without a policy.
--
-- 2. THE STRATEGIST'S ROWS IN THE BANK ARE HIDDEN, THE ENGINE'S ARE NOT. The
--    objectives, asks and next steps a read proposes are written to
--    suggestions like every other machine output, so the bank can learn from
--    them. They name warm contacts and cite scorecard figures, both on NOW.md's
--    never_publish list. RESTRICTIVE anon policies subtract exactly the
--    strategist_ surfaces and the verdicts on them. A restrictive policy only
--    ever narrows what the existing permissive "anon read" policies allow, so
--    the content engine's surfaces, and the brainstorm artifact that reads and
--    rules on them from a phone, are unaffected.
--
-- 3. A NOTE IS KEPT BEFORE THE MODEL RUNS. The route writes the row as pending
--    first, so a read that fails never loses what he said. An incomplete read
--    names its reason by foreign key, and that reason's sentence is fixed text
--    written for Krish, never a provider error: provider errors can carry a
--    secret's name, and this row's text is read back to him.
--
-- No archive is ever shown (FOCUS-PURPOSE constraint 1). The server keeps past
-- notes so Friday can be read against Monday; the route returns only the
-- latest read.
--
-- Idempotent: every create is guarded, every insert has an on conflict clause,
-- and every policy is dropped before it is created.

begin;

-- ── 1. The private store ───────────────────────────────────────────────────
create table if not exists public.strategist_reads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  source           text not null,
  -- A read of a goal that no longer exists means nothing, and "a goal read
  -- needs a goal" below would refuse a set null, so the read goes with it.
  goal_id          text references public.goals(id) on delete cascade,
  note_kind        text,
  note_body        text,
  -- The operator-civil Monday of the week the read belongs to.
  week_start       date not null,
  status           text not null default 'pending',
  sections         jsonb,
  headline         text,
  handoff_reason   text references public.handoff_reasons(slug) on update cascade,
  producer         jsonb,
  last_attempt_at  timestamptz not null default now(),

  constraint strategist_reads_source_check check (source in ('goal', 'note')),
  constraint strategist_reads_note_kind_check check (
    note_kind is null or note_kind in ('week_open', 'update', 'week_close')
  ),
  constraint strategist_reads_status_check check (status in ('pending', 'complete', 'incomplete')),
  -- The two ways in, each with what it cannot do without.
  constraint strategist_reads_goal_read_needs_goal check (source <> 'goal' or goal_id is not null),
  constraint strategist_reads_goal_read_has_no_note check (
    source <> 'goal' or (note_kind is null and note_body is null)
  ),
  constraint strategist_reads_note_read_needs_note check (
    source <> 'note' or (note_kind is not null and length(btrim(coalesce(note_body, ''))) > 0)
  ),
  constraint strategist_reads_note_fits check (note_body is null or length(note_body) <= 12000),
  -- The states agree with their columns. A complete read has something to
  -- show; an incomplete one says why by name.
  constraint strategist_reads_complete_has_sections check (
    status <> 'complete' or (sections is not null and headline is not null)
  ),
  constraint strategist_reads_incomplete_says_why check (
    status <> 'incomplete' or handoff_reason is not null
  )
);

comment on table public.strategist_reads is
  'Every read the strategist made, of a goal or of what Krish said about his week, with the note itself. Service role only: the notes are private and the reads name warm contacts. Only the latest read is ever shown; the rest are kept so a Friday note can be read against the Monday one.';
comment on column public.strategist_reads.note_body is
  'What he said, dictated or typed, verbatim. Written before the model runs, so a failed read never loses it. At most 12,000 characters.';
comment on column public.strategist_reads.sections is
  'The validated read (src/types/strategist.ts StrategistRead). Null until the read completes.';
comment on column public.strategist_reads.handoff_reason is
  'Why an incomplete read stopped, by name. The sentence Krish reads is the handoff reason''s fixed text, never the provider''s.';
comment on column public.strategist_reads.producer is
  'Which version of the machine made the read: agent, persona, model, prompt revision, and on an incomplete read the named checks that failed.';
comment on column public.strategist_reads.last_attempt_at is
  'When the read was last attempted. The client backs off for a day after a failure rather than spending again on every open.';

create index if not exists strategist_reads_goal_idx
  on public.strategist_reads (goal_id, created_at desc) where goal_id is not null;
create index if not exists strategist_reads_week_idx
  on public.strategist_reads (week_start, created_at desc) where source = 'note';
create index if not exists strategist_reads_status_idx
  on public.strategist_reads (status, last_attempt_at desc);

alter table public.strategist_reads enable row level security;
revoke all on public.strategist_reads from anon, authenticated;
grant all on public.strategist_reads to service_role;
drop policy if exists "strategist_reads service all" on public.strategist_reads;
create policy "strategist_reads service all" on public.strategist_reads
  for all to service_role using (true) with check (true);

-- ── 2. Three surfaces in the learning bank ─────────────────────────────────
-- The subject is the read, not a goal or a contact: a role-described ask has
-- no contact, and a drafted objective has no goal until he takes it.
insert into public.suggestion_surfaces (slug, label, what, subject, sort_order) values
  ('strategist_objective', 'strategist objective',
   'A weekly objective drafted from what Krish said or from a goal read, in his words, with the job it serves and the goal above it. It becomes a goal only when he taps Take it, and the goal gate still runs.',
   'strategist_reads', 110),
  ('strategist_ask', 'strategist ask',
   'One bounded ask, to a named warm contact or to a role reached through someone he knows, with exact wording and its exposure ladder level in words. It becomes today''s ask only when he presses the button with his own prediction.',
   'strategist_reads', 120),
  ('strategist_next_step', 'strategist next step',
   'One concrete step for today, drafted from what he said. It lands in today''s 3 only when he taps Put on today.',
   'strategist_reads', 130)
on conflict (slug) do update set label = excluded.label, what = excluded.what, subject = excluded.subject;

insert into public.autonomy_ladder (surface, rung, bounds) values
  ('strategist_objective', 'propose',
   'Propose only. It drafts the wording and saves nothing. A goal is written only when Krish taps Take it, through the goal gate.'),
  ('strategist_ask', 'propose',
   'Propose only. It never sends and never fills his prediction. It becomes today''s ask only when Krish presses the button.'),
  ('strategist_next_step', 'propose',
   'Propose only. It lands in today''s 3 only when Krish taps Put on today, and it never marks anything done.')
on conflict (surface) do nothing;

-- ── 3. The named way a read stops ──────────────────────────────────────────
insert into public.handoff_reasons (slug, label, says, fix_hint, severity) values
  ('strategist_read_incomplete', 'the read did not finish',
   'The read stopped before every part of it passed its checks, so it was not saved as a read. What you said is kept, and you can run it again.',
   'Count which check fails most, from producer.reasons on the incomplete rows. A section that keeps failing needs its instruction rewritten, not a looser check.',
   'degraded')
on conflict (slug) do update set label = excluded.label, says = excluded.says,
  fix_hint = excluded.fix_hint, severity = excluded.severity;

-- ── 4. The browser key cannot see the strategist's rows ────────────────────
-- RESTRICTIVE, so each is ANDed with the permissive "anon read" and "anon
-- write" policies from 20260919100000 rather than widening anything. The
-- underscore is escaped so the pattern is the literal prefix "strategist_".
drop policy if exists "suggestions anon hides strategist" on public.suggestions;
create policy "suggestions anon hides strategist" on public.suggestions
  as restrictive for select to anon
  using (surface not like 'strategist\_%');

-- The subquery runs under the caller's own RLS, so for anon it sees no
-- strategist suggestion, and a verdict on one is neither readable nor writable.
drop policy if exists "suggestion_verdicts anon hides strategist" on public.suggestion_verdicts;
create policy "suggestion_verdicts anon hides strategist" on public.suggestion_verdicts
  as restrictive for select to anon
  using (suggestion_id in (select s.id from public.suggestions s));

drop policy if exists "suggestion_verdicts anon writes only what it sees" on public.suggestion_verdicts;
create policy "suggestion_verdicts anon writes only what it sees" on public.suggestion_verdicts
  as restrictive for insert to anon
  with check (suggestion_id in (select s.id from public.suggestions s));

commit;

notify pgrst, 'reload schema';

-- ── Read-back after applying (service role, then anon) ─────────────────────
--   select count(*) from public.strategist_reads;                 -- service: works
--   select slug from public.suggestion_surfaces where slug like 'strategist\_%';
--                                                                  -- three rows
--   anon: select * from strategist_reads                          -- permission denied
--   anon: select count(*) from suggestions where surface like 'strategist\_%';  -- 0
--   anon: select count(*) from suggestions where surface = 'headline';         -- unchanged
