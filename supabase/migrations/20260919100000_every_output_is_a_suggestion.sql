-- The learning bank: every machine output is a suggestion, every response is a
-- verdict, and the gap between them is the only thing that teaches.
--
-- Ruling (Krish, 2026-09-19): "Everything should be suggested / assumed by the
-- machine, and I am able to iterate / tweak / feedback everything to completion
-- which should be compared against the original suggestion to build a durable
-- learning bank over time that slowly and gradually makes the machine more and
-- more autonomous."
--
-- ── Why this is one table and not eleven features ──────────────────────────
-- Slate picks, format assignment, headlines, derivative plans, carousel
-- layouts, video cut points and publish timing are the same shape: the machine
-- proposes, Krish responds, and the difference is evidence. Built as separate
-- features they each grow their own half-built feedback path, and this repo has
-- already paid for that twice. content_edit_events was built for text edits
-- alone and holds ONE row; learning_events holds twelve; the learning/compile
-- job concluded it had nothing to learn from and the response was to mark the
-- lane starvationIsNormal, which silenced the symptom of a broken chain rather
-- than fixing it. One ledger, every surface, or the bank stays empty again.
--
-- ── Three properties this schema enforces rather than documents ────────────
--
-- 1. A SUGGESTION WITHOUT A REASON CANNOT BE WRITTEN. `reason` is NOT NULL.
--    Krish, 2026-09-19: "I need clear failure messages with reasons when things
--    like that happen." A proposal that cannot say why it was made is not
--    reviewable, and an unreviewable proposal teaches nothing when it is
--    rejected, because there is no stated belief to have been wrong.
--
-- 2. A HAND-OFF IS A SUGGESTION, NOT A SILENCE. When the machine cannot decide
--    it writes a row with proposed = null and a named handoff_reason. That
--    makes the hand-offs countable, and the most frequent hand-off reason each
--    month is the highest-value thing to go and fix. Today those cases return
--    a bare null, a false, or a quiet fallback, so nobody can name them.
--
-- 3. THE DELTA CANNOT CARRY THE SUBJECT. The anti-echo rule says taste data may
--    inform FORM and CRAFT and must never rank a candidate higher by SUBJECT.
--    A learning bank that records "he liked the Canva one" starts proposing
--    Canva, returns a full slate while doing it, and the failure is invisible
--    because a mirror always looks productive. delta's allowed keys are held by
--    a CHECK, so a writer that reaches for the topic fails the insert and says
--    which key was refused.

begin;

-- ── 1. The vocabularies. Foreign keys, not CHECK-with-literals ─────────────
-- Same reason as venture_formats on 2026-09-19: a CHECK carrying literals has
-- to be dropped and rewritten to add a value, so in practice nobody adds one
-- and the code invents a string instead. A row can be added by anyone; an
-- unknown value still fails the write and names itself in the error.

create table if not exists public.suggestion_surfaces (
  slug        text primary key,
  label       text not null,
  what        text not null,
  subject     text not null,
  active      boolean not null default true,
  sort_order  int not null default 50,
  created_at  timestamptz not null default now()
);
comment on table public.suggestion_surfaces is
  'Every kind of decision the machine is allowed to make on Krish''s behalf. Adding a surface here is how a new machine decision becomes reviewable and measurable; a decision made on a surface that is not listed cannot be written down, which is the point.';

insert into public.suggestion_surfaces (slug, label, what, subject, sort_order) values
  ('slate_pick',        'slate pick',          'Which ideas make the week''s slate, and in what order.', 'content_ideas', 10),
  ('format_assignment', 'format assignment',   'Which subchannel a piece belongs to. The boundary between split.the.bill and lift.the.lid is a question, not a surface, so this is a judgement and gets reviewed like one.', 'content_ideas', 20),
  ('headline',          'headline',            'The headline and the opening line.', 'content_ideas', 30),
  ('derivative_plan',   'derivative plan',     'Which assets one piece should fan out into, and which are worth skipping.', 'content_assets', 40),
  ('artifact_design',   'your.call design',    'The interactive opening artifact: the claim under test, the evidence shown, and the question put to the reader.', 'content_assets', 50),
  ('carousel_layout',   'carousel layout',     'The paginated diagram for Instagram, built from the format''s own diagram language.', 'content_assets', 60),
  ('video_cuts',        'video cuts',          'Where the long cut is broken into shorts, and which moments carry.', 'content_assets', 70),
  ('publish_timing',    'publish timing',      'When a piece goes out, against the format''s cadence and what else is queued.', 'content_assets', 80),
  ('amplification',     'amplification',       'What to do with a piece after it lands: a second surface, a follow-up, a repost with a new angle.', 'content_assets', 90),
  ('autonomy_promotion','autonomy promotion',  'The machine asking to be trusted further on one surface, with the evidence attached. Recursive on purpose: the ladder advances the same way everything else does, by proposal and verdict.', 'autonomy_ladder', 100)
on conflict (slug) do update set label = excluded.label, what = excluded.what, subject = excluded.subject;

create table if not exists public.verdict_kinds (
  slug          text primary key,
  label         text not null,
  what          text not null,
  counts_clean  boolean not null,
  sort_order    int not null default 50
);
comment on column public.verdict_kinds.counts_clean is
  'Whether this verdict counts as the machine having got it right unaided. Only accepted does. A tweak is a near miss and is the most useful row in the bank, because it carries a small, legible delta; a replace is a miss with a usable target; a reject is a miss with no target and teaches least.';

insert into public.verdict_kinds (slug, label, what, counts_clean, sort_order) values
  ('accepted', 'accepted',  'Taken as proposed, unchanged.', true, 10),
  ('tweaked',  'tweaked',   'Kept, with changes. The delta is small and legible, which makes this the most instructive verdict in the bank.', false, 20),
  ('replaced', 'replaced',  'The shape was right and the content was not, so it was rewritten. A miss with a target attached.', false, 30),
  ('rejected', 'rejected',  'Thrown out with nothing kept. Teaches least, because there is no final to compare against, which is why reason_code matters most here.', false, 40),
  ('deferred', 'deferred',  'Not now. Not a judgement on quality, and deliberately excluded from the accept rate so that a busy week cannot demote the machine.', false, 50)
on conflict (slug) do update set label = excluded.label, what = excluded.what, counts_clean = excluded.counts_clean;

create table if not exists public.autonomy_rungs (
  slug        text primary key,
  label       text not null,
  what        text not null,
  rank        int not null unique
);
insert into public.autonomy_rungs (slug, label, what, rank) values
  ('propose',    'propose',    'The machine suggests and does nothing else. Krish decides every instance. Where every surface starts.', 1),
  ('assist',     'assist',     'The machine suggests and prepares the work, so the thing is ready to look at rather than ready to start. Nothing leaves the building. This is where most surfaces should live for a long time.', 2),
  ('autonomous', 'autonomous', 'The machine acts without asking, within the surface''s stated bounds, and every action is still recorded as a suggestion with an automatic accepted verdict so the bank keeps measuring it. Never covers publishing, sending or spending.', 3)
on conflict (slug) do update set label = excluded.label, what = excluded.what;

-- The named ways the machine is allowed to stop. Today these sites return a
-- bare null, a false, or a silent fallback to something wrong: the guest scout
-- falls through to retired brand text, the final pass falls to the generic
-- house register, the factory mapper returns 'dynamic' which is the teardowns
-- folder, and the corpus lookup returns a one-paragraph synopsis instead of the
-- playbook. All four produce confident wrong output with no signal.
create table if not exists public.handoff_reasons (
  slug        text primary key,
  label       text not null,
  says        text not null,
  fix_hint    text not null,
  severity    text not null default 'blocking',
  created_at  timestamptz not null default now(),
  constraint handoff_reasons_severity_check check (severity in ('blocking', 'degraded', 'advisory'))
);
comment on column public.handoff_reasons.says is
  'The sentence a human reads. Written for Krish at 7am on a phone, not for a log: name the thing, name what is missing, and do not use a code where a word will do.';
comment on column public.handoff_reasons.fix_hint is
  'What would stop this recurring. The most frequent handoff reason in a month is the highest-value thing to go and build, and this is the note to your future self about what that build is.';

insert into public.handoff_reasons (slug, label, says, fix_hint, severity) values
  ('format_not_in_venture_formats', 'unknown format',
   'This piece names a format that venture_formats does not have, so there is no mandate to write against and I will not guess one.',
   'The caller is looking up by a retired slug. Resolve it through format_aliases first, which is what that ledger is for.', 'blocking'),
  ('format_ambiguous_question',     'two formats could claim this',
   'This subject fits split.the.bill and lift.the.lid equally and the question it asks is not clear enough to separate them.',
   'The boundary is the question, never the surface. Sharpen the thesis to ask either what it costs and who pays, or whether it makes its user sharper, and the format falls out.', 'blocking'),
  ('rubric_unmatched_slot',         'no rubric for this slot',
   'The final pass has no rubric for this slot, so it would fall back to the generic house register and quietly lose the format''s voice.',
   'Add the slot to the rubric, or stop producing that slot.', 'degraded'),
  ('factory_channel_unmapped',      'no factory channel',
   'Nothing maps this piece to a production target, and the fallback drops it into the teardowns folder where nobody looks.',
   'target_channel is a wire contract with the n8n factory. Map it on both sides in one change or not at all.', 'blocking'),
  ('corpus_playbook_missing',       'no playbook for this channel',
   'There is no corpus playbook for this channel, so the model would work from a one-paragraph synopsis and produce something plausible and generic.',
   'Write the playbook, or route this channel to one that has one and say so.', 'degraded'),
  ('evidence_must_be_created',      'the evidence does not exist yet',
   'This needs primary research that has not been done. The material gate says a piece whose evidence must be created rather than found is not commissioned, however good the idea.',
   'Either find a subject whose paper trail is already public, or commission the research separately and as its own decision.', 'blocking'),
  ('source_not_archived',           'the source could rot',
   'This rests on a pricing page or changelog that is not archived, and those change. The piece would stop being checkable within a week.',
   'Archive the surface before recording. lift.the.lid''s mandate makes this a hard gate for exactly this reason.', 'blocking'),
  ('no_outcome_data',               'nothing came back from the platform',
   'No numbers arrived for this piece. That is not zero reach, it is an absent measurement, and the two must never be averaged together.',
   'Either wire the platform, or enter the number by hand. A gap recorded as a gap is honest; a gap recorded as a zero makes every comparison lie.', 'advisory'),
  ('tool_not_trusted_yet',          'not trusted to do this alone yet',
   'This surface is still on propose, so the work is prepared and left for you rather than done.',
   'The ladder moves when the evidence says it should, and only with your approval. Check the promotion proposal.', 'advisory'),
  ('external_action_needs_krish',   'this leaves the building',
   'This would publish, send, schedule or spend, and that always stops here.',
   'Not a gap to close. The approval gate is the design.', 'blocking')
on conflict (slug) do update set label = excluded.label, says = excluded.says, fix_hint = excluded.fix_hint, severity = excluded.severity;

-- ── 2. The anti-echo guard, as a constraint rather than a comment ──────────
-- The delta may describe how the work changed. It may not describe what the
-- work was about. A CHECK cannot hold a subquery, so this is an IMMUTABLE
-- function, which a CHECK can call.
create or replace function public.delta_keys_are_form_only(d jsonb)
returns boolean
language sql immutable
as $$
  select d is null or (
    jsonb_typeof(d) = 'object' and not exists (
      select 1 from jsonb_object_keys(d) as k
      where k not in (
        -- Size and shape.
        'chars_before', 'chars_after', 'pct_shorter', 'sentences_before', 'sentences_after',
        'sections_kept', 'sections_dropped', 'sections_added', 'order_changed',
        -- Craft moves, counted and never quoted.
        'hedges_removed', 'adjectives_removed', 'numbers_added', 'numbers_removed',
        'attributions_added', 'attributions_fixed', 'counterpoints_added',
        'opening_rewritten', 'ending_rewritten', 'moral_removed', 'question_removed',
        'em_dashes_removed', 'exclamations_removed', 'product_names_removed',
        -- Structural verdicts on non-text suggestions.
        'items_kept', 'items_dropped', 'items_added', 'items_reordered',
        'slot_changed', 'format_changed', 'timing_changed_days', 'asset_kinds_changed',
        -- Provenance of the comparison itself.
        'before_hash', 'after_hash', 'rounds'
      )
    )
  )
$$;
comment on function public.delta_keys_are_form_only(jsonb) is
  'The anti-echo rule, enforced. Every allowed key describes FORM or CRAFT. None of them can carry a subject, a topic, a company, a person or a headline, because a bank that learns what Krish writes about starts proposing what he already approved, returns a full slate while doing it, and the failure is invisible because a mirror always looks productive. A writer reaching for the topic fails the insert and the error names the key it tried.';

-- ── 3. The suggestions ─────────────────────────────────────────────────────
create table if not exists public.suggestions (
  id             uuid primary key default gen_random_uuid(),
  surface        text not null references public.suggestion_surfaces(slug) on update cascade,
  subject_table  text not null,
  subject_id     text not null,
  proposed       jsonb,
  reason         text not null,
  confidence     numeric,
  alternatives   jsonb,
  producer       jsonb not null,
  autonomy_rung  text not null default 'propose' references public.autonomy_rungs(slug) on update cascade,
  handoff_reason text references public.handoff_reasons(slug) on update cascade,
  run_id         text,
  created_at     timestamptz not null default now(),

  -- Either it proposed something or it handed off saying why. Never neither,
  -- and never both: "here is my answer and also I could not answer" is how a
  -- caller ends up using a fallback it was told not to trust.
  constraint suggestions_proposed_xor_handoff check (
    (proposed is not null and handoff_reason is null) or
    (proposed is null and handoff_reason is not null)
  ),
  constraint suggestions_confidence_range check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint suggestions_reason_is_a_sentence check (length(btrim(reason)) >= 12)
);

comment on table public.suggestions is
  'Every decision the machine made or declined to make, with the reason it gave at the time. This is the left-hand side of the learning bank. The right-hand side is suggestion_verdicts.';
comment on column public.suggestions.reason is
  'Why, in Krish''s own English, not a code. NOT NULL and at least twelve characters, because "ok" and "n/a" are how a required field becomes decoration. When a rejection comes back, this is the belief that was wrong, and without it the rejection teaches nothing.';
comment on column public.suggestions.alternatives is
  'What else was considered and why it lost. The single most useful field when a suggestion is rejected: nine times in ten the right answer was the runner-up, and knowing the machine saw it and ranked it second is a different problem from it never having seen it.';
comment on column public.suggestions.producer is
  'Which version of the machine said this: agent, model, prompt revision, run. Trust is earned by a specific version. Without this, a prompt change silently inherits the credibility the previous one built, which is how a regression keeps its autonomy.';
comment on column public.suggestions.autonomy_rung is
  'The rung this surface stood at when the suggestion was made, copied in rather than joined, because the ladder moves and history must not move with it.';

create index if not exists suggestions_surface_created_idx on public.suggestions (surface, created_at desc);
create index if not exists suggestions_subject_idx on public.suggestions (subject_table, subject_id);
create index if not exists suggestions_handoff_idx on public.suggestions (handoff_reason, created_at desc)
  where handoff_reason is not null;

-- ── 4. The verdicts ────────────────────────────────────────────────────────
create table if not exists public.suggestion_verdicts (
  id              uuid primary key default gen_random_uuid(),
  suggestion_id   uuid not null references public.suggestions(id) on delete cascade,
  round           int not null default 1,
  verdict         text not null references public.verdict_kinds(slug) on update cascade,
  final           jsonb,
  delta           jsonb,
  reason_code     text,
  note            text,
  seconds_to_verdict int,
  actor           text not null default 'krish',
  created_at      timestamptz not null default now(),

  constraint suggestion_verdicts_one_per_round unique (suggestion_id, round),
  constraint suggestion_verdicts_round_positive check (round >= 1),
  constraint suggestion_verdicts_delta_is_form_only check (public.delta_keys_are_form_only(delta)),
  -- A reject has no final to compare against, so its reason is the only thing
  -- it leaves behind. Require one.
  constraint suggestion_verdicts_reject_says_why check (
    verdict <> 'rejected' or (reason_code is not null or length(btrim(coalesce(note, ''))) >= 8)
  )
);

comment on table public.suggestion_verdicts is
  'Krish''s response to a suggestion, and the measured difference. Multiple rounds are expected and wanted: how many rounds a suggestion took to land is a better autonomy signal than whether it landed, because a thing accepted at round four was wrong three times first.';
comment on column public.suggestion_verdicts.round is
  'Iteration number. Round 1 is the first response to the original suggestion. The last round is the outcome; the count is the cost.';
comment on column public.suggestion_verdicts.delta is
  'Form and craft only, held by a CHECK. See delta_keys_are_form_only.';
comment on column public.suggestion_verdicts.seconds_to_verdict is
  'How long it sat before Krish ruled on it. Half of time-to-ship is queue time rather than work, and it is the half nobody measures.';

create index if not exists suggestion_verdicts_suggestion_idx on public.suggestion_verdicts (suggestion_id, round);
create index if not exists suggestion_verdicts_created_idx on public.suggestion_verdicts (created_at desc);

-- ── 5. The ladder ──────────────────────────────────────────────────────────
-- Evidence is computed, never stored, so it cannot drift from the rows it
-- claims to summarise. The rung is stored, because it is a decision.
create table if not exists public.autonomy_ladder (
  surface            text primary key references public.suggestion_surfaces(slug) on update cascade,
  rung               text not null default 'propose' references public.autonomy_rungs(slug) on update cascade,
  promote_after      int not null default 20,
  demote_below_rate  numeric not null default 0.6,
  bounds             text,
  last_change_at     timestamptz,
  last_change_reason text,
  changed_by         text,
  updated_at         timestamptz not null default now(),
  constraint autonomy_ladder_promote_after_sane check (promote_after >= 5)
);

comment on table public.autonomy_ladder is
  'How far the machine is trusted, per surface. It moves by proposal and verdict like everything else: the machine writes a suggestion on the autonomy_promotion surface with the evidence attached, and Krish rules on it. Nothing here advances itself. Ruling (Krish, 2026-09-19): autonomy is gradual and earned.';
comment on column public.autonomy_ladder.promote_after is
  'How many clean accepts in a row would justify proposing a promotion. A floor of five stops a surface claiming a record off two lucky weeks.';
comment on column public.autonomy_ladder.demote_below_rate is
  'Below this clean-accept rate over the last thirty verdicts, the machine proposes its own demotion. Demotion is proposed, not automatic, for the same reason promotion is: a bad fortnight during a house move is not evidence about the machine.';
comment on column public.autonomy_ladder.bounds is
  'What autonomous means on THIS surface, in plain words, and what it still never covers. An unbounded autonomous rung is an unbounded agent.';

insert into public.autonomy_ladder (surface, rung, bounds)
select slug, 'propose',
       'Not yet set. Every surface starts on propose and nothing is bounded until it is promoted.'
from public.suggestion_surfaces
on conflict (surface) do nothing;

-- The evidence, computed from the rows themselves.
create or replace view public.autonomy_evidence as
with last_round as (
  select distinct on (v.suggestion_id) v.suggestion_id, v.verdict, v.round, v.created_at, v.seconds_to_verdict
  from public.suggestion_verdicts v
  order by v.suggestion_id, v.round desc
),
joined as (
  select s.surface, s.id, s.handoff_reason, lr.verdict, lr.round, lr.created_at, lr.seconds_to_verdict,
         k.counts_clean
  from public.suggestions s
  left join last_round lr on lr.suggestion_id = s.id
  left join public.verdict_kinds k on k.slug = lr.verdict
)
select
  sf.slug as surface,
  l.rung,
  l.promote_after,
  l.demote_below_rate,
  count(*) filter (where j.id is not null)                                   as suggestions_total,
  count(*) filter (where j.handoff_reason is not null)                       as handoffs,
  count(*) filter (where j.verdict is not null and j.verdict <> 'deferred')  as verdicts_ruled,
  count(*) filter (where j.counts_clean)                                     as clean_accepts,
  round(
    count(*) filter (where j.counts_clean)::numeric
    / nullif(count(*) filter (where j.verdict is not null and j.verdict <> 'deferred'), 0)
  , 3)                                                                       as clean_rate,
  round(avg(j.round) filter (where j.verdict is not null), 2)                as avg_rounds,
  round(avg(j.seconds_to_verdict) filter (where j.seconds_to_verdict is not null), 0) as avg_seconds_to_verdict,
  max(j.created_at)                                                          as last_verdict_at
from public.suggestion_surfaces sf
join public.autonomy_ladder l on l.surface = sf.slug
left join joined j on j.surface = sf.slug
group by sf.slug, l.rung, l.promote_after, l.demote_below_rate;

comment on view public.autonomy_evidence is
  'What the bank actually says about each surface, computed from the rows every time. Never stored: a cached accept rate is a number that agrees with the past rather than the present, and this one decides how much the machine is trusted.';

-- ── 6. RLS ─────────────────────────────────────────────────────────────────
alter table public.suggestions           enable row level security;
alter table public.suggestion_verdicts   enable row level security;
alter table public.autonomy_ladder       enable row level security;
alter table public.suggestion_surfaces   enable row level security;
alter table public.verdict_kinds         enable row level security;
alter table public.autonomy_rungs        enable row level security;
alter table public.handoff_reasons       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['suggestions','suggestion_verdicts','autonomy_ladder',
                           'suggestion_surfaces','verdict_kinds','autonomy_rungs','handoff_reasons']
  loop
    execute format('drop policy if exists "%s anon read" on public.%I', t, t);
    execute format('create policy "%s anon read" on public.%I for select to anon using (true)', t, t);
    execute format('drop policy if exists "%s service all" on public.%I', t, t);
    execute format('create policy "%s service all" on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $$;

-- The brainstorm artifact is opened on a phone and writes verdicts back, so
-- anon needs to insert them. It never needs to write a suggestion: only the
-- machine proposes.
drop policy if exists "suggestion_verdicts anon write" on public.suggestion_verdicts;
create policy "suggestion_verdicts anon write" on public.suggestion_verdicts
  for insert to anon with check (true);

commit;
