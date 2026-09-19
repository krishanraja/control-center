-- One intake: everything that could become a piece arrives in one ledger, is
-- assessed once, and ends with a state and a reason.
--
-- Ruling (Krish, 2026-09-19): "one pipeline, zero duplicative machinery, one
-- set of data coming in, assessed, scored, decided on and proposed."
--
-- ── The defect ─────────────────────────────────────────────────────────────
-- Six paths write content_ideas today and none of them knows about the others.
-- Counted on 2026-09-19: inspiration_sweep 146, pool_headline 76, aeo_signal
-- 15, build_signal 4, creator_move 3, lane_sourcing 3. Beside those, three
-- ledgers record what was READ without saying what became of it:
-- inspiration_messages (338 Gmail newsletters), inspiration_drive_files (17
-- Drive files) and hunter_newsletter_posts (21 posts from a jobs newsletter,
-- with no checked-in writer). Each path has its own dedupe (a partial unique
-- index on source_url here, one on source_ref there, a seen-ledger keyed on
-- the message id, one keyed on file_id:modifiedTime), its own governor, its own
-- cap, and its own idea of what "already read" means. The story-level question
-- (is this the same event told by five outlets) is answered in three places
-- with three thresholds, and the terminal question (why is this not in my
-- queue) is answered nowhere: a newsletter the sweep read and made nothing of
-- leaves no row saying so.
--
-- A seventh source is coming. mm-ctrl (a different Supabase project) gathers
-- GDELT, Hacker News, curated RSS and Brave News and clusters across them. It
-- already arrives here by a side door: content-engine's /api/feed/ingest reads
-- mm-ctrl's corroborated daily pool and inserts two days of it as pool_headline
-- ideas. Wiring it as a real source without a shared intake would make seven
-- pipelines, not one.
--
-- ── What this migration does ───────────────────────────────────────────────
-- 1. One vocabulary of sources, one of states, one of owners. Foreign keys, not
--    CHECK-with-literals, for the reason recorded on venture_formats and the
--    learning bank on 2026-09-19: a CHECK carrying literals has to be dropped
--    and rewritten to add a value, so nobody adds one and the code invents a
--    string instead.
-- 2. intake_items: one row per thing that arrived, from any source, with a
--    story key for dedupe by story rather than by file, a state, and a named
--    reason for every drop. A row is never deleted; it ends.
-- 3. content_ideas.source_type moves from a CHECK of seventeen literals to a
--    foreign key on intake_sources. Every one of the seventeen gets a row, so
--    the key admits exactly what the CHECK admitted and no writer breaks. The
--    ten values with zero rows are kept inactive: the rename ledger is the
--    table itself, and a value nobody writes any more is a fact worth keeping.
-- 4. A backfill, in this file, so the ledger is complete from the first run:
--    one intake row per existing idea (promoted, pointing at the idea), one per
--    Gmail message the sweep read (assessed, because the sweep read it), one per
--    Drive file, one per Hunter post. The counts are asserted at the end and the
--    migration fails loudly if any source is short.
-- 5. A bridge trigger on content_ideas, dated and meant to be dropped: while
--    the six direct writers still write ideas, every new idea mirrors into
--    intake as promoted, so the ledger stays whole during the move. An idea
--    the runner promotes carries meta.intake_item_id and flips its own intake
--    row instead of making a second one.
--
-- ── What it deliberately does not do ───────────────────────────────────────
-- It does not move any writer. The six paths keep writing content_ideas until
-- each is pointed at intake_items in its own change. It does not delete or
-- rewrite a single existing row. It does not wire mm-ctrl: that gets a named,
-- inactive slot so the slug exists before the code does. It does not decide
-- anything: the runner that reads state = 'new' is specified in
-- makeyourmindup/engine/INTAKE_RUNNER_SPEC.md and built separately.
--
-- Every column name referenced below was checked against information_schema
-- on the live project on 2026-09-19 before this file was written.

begin;

-- ── 1. The vocabularies ────────────────────────────────────────────────────

create table if not exists public.intake_owners (
  slug        text primary key,
  label       text not null,
  what        text not null,
  sort_order  int not null default 50
);
comment on table public.intake_owners is
  'Which system is responsible for a source: the thing to open when the source goes quiet. The four the design named plus openclaw, because the VPS agent sessions wrote one of the old source types and a wrong owner is worse than a fifth row.';

insert into public.intake_owners (slug, label, what, sort_order) values
  ('n8n',            'n8n',            'An n8n Cloud workflow. Its execution count is the one budget the fleet has no cap on, which is a known gap.', 10),
  ('content-engine', 'content-engine', 'A Vercel cron or route in krishanraja/content-engine under apps/control-plane. Its schedule is in that repo''s vercel.json and its runs land in content_engine_runs.', 20),
  ('mm-ctrl',        'mm-ctrl',        'An edge function in the CTRL Supabase project (a different project from this one). Read across the boundary, never written.', 30),
  ('manual',         'manual',         'Krish, by hand: typed, pasted, or dropped in a folder he owns.', 40),
  ('openclaw',       'openclaw',       'A Claude Code agent session on the OpenClaw VPS. Named because two retired source types came from there; nothing writes from it today.', 50)
on conflict (slug) do update set label = excluded.label, what = excluded.what, sort_order = excluded.sort_order;

create table if not exists public.intake_states (
  slug        text primary key,
  label       text not null,
  what        text not null,
  terminal    boolean not null default false,
  sort_order  int not null default 50
);
comment on table public.intake_states is
  'The four things that can be true of an intake row. new: nobody has read it. assessed: the runner read and scored it and it is neither picked nor dropped; it may come back if its story grows. promoted: it became a content_ideas row. dropped: it will not be promoted and drop_reason says why. A row leaves new exactly once and never returns to it.';

insert into public.intake_states (slug, label, what, terminal, sort_order) values
  ('new',      'new',      'Arrived and unread. The runner''s queue is every row in this state.', false, 10),
  ('assessed', 'assessed', 'Read, gated and scored. Not picked this week and not dropped. Its scores are in raw.assessment. It is re-read only if its story gains a member.', false, 20),
  ('promoted', 'promoted', 'Became a content_ideas row; promoted_idea_id says which. What happens to the idea after that is the idea''s own state, not this one.', true, 30),
  ('dropped',  'dropped',  'Will not be promoted. drop_reason names the rule, and raw carries the value the rule observed.', true, 40)
on conflict (slug) do update set label = excluded.label, what = excluded.what, terminal = excluded.terminal, sort_order = excluded.sort_order;

create table if not exists public.intake_sources (
  slug        text primary key,
  label       text not null,
  what        text not null,
  active      boolean not null default true,
  owner       text not null references public.intake_owners(slug) on update cascade,
  formerly    text,
  sort_order  int not null default 50,
  created_at  timestamptz not null default now()
);
comment on table public.intake_sources is
  'Every path by which material can arrive. A source that is not listed cannot write a row, which is the point. active = false is a named slot: the slug exists so code and documents can refer to it before or after anything writes it.';
comment on column public.intake_sources.what is
  'What the source is and where it comes from, in plain words, with the count on the day it was listed. Written for whoever is asking why a source went quiet.';
comment on column public.intake_sources.formerly is
  'The rename ledger. The name this path had before intake existed: the workflow, the route, the table or the content_ideas.source_type value. Kept so a log line from July can still be looked up, and so a slug can be renamed without losing where it came from.';

insert into public.intake_sources (slug, label, what, active, owner, formerly, sort_order) values
  -- The six live ideas paths, in order of volume on 2026-09-19.
  ('inspiration_sweep', 'Gmail newsletter sweep',
   'Sonnet reads the AI Newsletters Gmail label twice a day and writes seeds straight into content_ideas. 146 ideas by 2026-09-19. The messages it read are the gmail_newsletters rows; this slug is the ideas it made from them.',
   true, 'n8n', 'Cleo | mind/make OS | Inspiration Sweep (n8n workflow D4W5TF1sP9lE828c); content_ideas.source_type = inspiration_sweep', 10),
  ('pool_headline', 'CTRL headlines pool',
   'mm-ctrl''s own gather (GDELT, Hacker News, curated RSS, Brave News, cross-source clustering) already arriving by a side door: content-engine reads the corroborated daily pool from the CTRL project and inserts two days of it as ambient feed rows, gated on the beat. 76 ideas. When mm_ctrl_gather is wired this path folds into it and the slug stays in formerly.',
   true, 'content-engine', '/api/feed/ingest, daily 11:30 UTC, reading live_headlines_cache in the CTRL project; content_ideas.source_type = pool_headline', 20),
  ('aeo_signal', 'AEO research recommendations',
   'One research packet per subject per week, posted in from the AEO engine. Its recommendations become ideas, governed and capped. 15 ideas. Growth material rather than publication material, so it mostly belongs in the holding lane.',
   true, 'content-engine', 'POST /api/aeo/ingest from krishanraja/AEO-Engine (GitHub Actions, Sunday 04:00 UTC); content_ideas.source_type = aeo_signal', 30),
  ('build_signal', 'The week''s builds',
   'One row per repository with commits in the scorecard week. 4 ideas. The NOT US gate in every mandate means these are evidence for a piece and never its subject.',
   true, 'content-engine', '/api/discover-build-signals, Saturday 05:00 UTC; content_ideas.source_type = build_signal', 40),
  ('creator_move', 'Creator scout',
   'The transferable move in a curated creator''s recent LinkedIn posts, pulled weekly through Apify. 3 ideas.',
   true, 'content-engine', '/api/discover-creator-posts, Tuesday 08:00 UTC; content_ideas.source_type = creator_move', 50),
  ('lane_sourcing', 'Lane sourcing',
   'Drafts sourced for a named lane. 3 ideas. Its rows used to be written as inspiration_sweep and were separated on 2026-08-19; a trigger on content_ideas keeps them separate.',
   true, 'n8n', 'Cleo | Content Lane Sourcing (n8n workflow rRAyEUs7NsY06hFy); content_ideas.source_type = lane_sourcing', 60),
  -- The three read-ledgers that never said what became of what they read.
  ('gmail_newsletters', 'Gmail newsletters, as read',
   'One row per Gmail message the sweep has read: 338 by 2026-09-19 across 39 newsletters. Backfilled as assessed, because the sweep already read each one and either made an idea from it or did not.',
   true, 'n8n', 'inspiration_messages, the sweep''s seen-ledger written through register_inspiration_messages', 70),
  ('drive_files', 'Drive inspiration folder',
   'Screenshots and documents Krish drops in the Drive folder. 17 files by 2026-09-19. Two writers share one ledger (the engine''s scan every two hours and the n8n sweep), which is why that ledger is keyed on the file and its modified time rather than on the run.',
   true, 'content-engine', 'inspiration_drive_files (file_id:modifiedTime), written by /api/inspiration/drive-scan and by the n8n sweep through register_inspiration_drive_files', 80),
  ('hunter_newsletter_posts', 'Hunter newsletter posts',
   '21 posts from a jobs newsletter, 2026-08-06 to 2026-09-04, read for hiring, talent_moves and reach_out_advice signals. No checked-in workflow, route or document names this table, and the Hunter agent was retired on 2026-07-10, so the writer is unverified. Inactive until someone names it.',
   false, 'n8n', 'hunter_newsletter_posts', 90),
  -- The human path and the slot that is coming.
  ('manual', 'Typed in by hand',
   'Krish typed or pasted it. Zero rows by 2026-09-19; the one + button on a phone is where this will come from.',
   true, 'manual', 'content_ideas.source_type = manual', 100),
  ('mm_ctrl_gather', 'mm-ctrl gather',
   'named slot, not yet wired',
   false, 'mm-ctrl', null, 110),
  -- The ten content_ideas.source_type values with zero rows on 2026-09-19.
  -- Listed so the foreign key admits everything the CHECK admitted. Inactive
  -- because nothing writes them. Owners are attributed from the architecture
  -- document (Capture Idea, the Layer 1 Signal Inbox, the Synthesis pipeline
  -- and Zara''s sweep are n8n workflows), not from code, because no code that
  -- writes them was found in control-center or content-engine.
  ('signal_inbox',         'Signal inbox',          'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = signal_inbox (Layer 1 Signal Inbox)', 200),
  ('cleo_chat',            'Cleo chat',             'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = cleo_chat (Capture Idea)', 210),
  ('agatha_chat',          'Agatha chat',           'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = agatha_chat (Capture Idea)', 220),
  ('openclaw_workspace',   'OpenClaw workspace',    'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'openclaw', 'content_ideas.source_type = openclaw_workspace', 230),
  ('zara_signal',          'Zara signal',           'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = zara_signal', 240),
  ('synthesis_hypothesis', 'Synthesis hypothesis',  'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = synthesis_hypothesis (the Synthesis pipeline)', 250),
  ('synthesis',            'Synthesis',             'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = synthesis', 260),
  ('customer_voice',       'Customer voice',        'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = customer_voice', 270),
  ('crm_opportunity',      'CRM opportunity',       'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'n8n',      'content_ideas.source_type = crm_opportunity', 280),
  ('requested_research',   'Requested research',    'In the old CHECK, zero rows, no live writer found on 2026-09-19. Kept inactive so the foreign key admits it.', false, 'manual',   'content_ideas.source_type = requested_research', 290)
on conflict (slug) do update set
  label = excluded.label, what = excluded.what, active = excluded.active,
  owner = excluded.owner, formerly = excluded.formerly, sort_order = excluded.sort_order;

-- ── 2. The reasons an intake row may end on ────────────────────────────────
-- Same table the learning bank uses for a hand-off, because a drop and a
-- hand-off are the same shape: a named rule, a sentence for Krish, and a note
-- about what would stop it recurring. The most frequent one each month is the
-- highest-value thing to go and fix, and that only works if every path counts
-- in one place.
insert into public.handoff_reasons (slug, label, says, fix_hint, severity) values
  ('kill_list_veto', 'kill list veto',
   'The kill list vetoed this before any model saw it: a retired name, a product name where editorial should be, corporate filler, or a sermon line. The rule and the sample are on the row.',
   'Usually nothing to build. If one rule dominates the count for one source, that source is the thing to look at, and whether a rule written for our copy should apply to someone else''s headline is Krish''s call.', 'blocking'),
  ('duplicate_story', 'same story, another outlet',
   'This is the same story as one already in intake, told by another outlet or arriving by another path. It was folded into that row and counts as corroboration, not as a second candidate.',
   'Nothing to fix. If the fold was wrong, story_key is what to correct; dedupe_of says which row it was folded into.', 'advisory'),
  ('source_denylisted', 'low-quality host',
   'The host is on the low-quality list or matches the content-mill pattern, so nothing from it is read.',
   'If a real outlet was caught, take it off the one shared denylist. Do not special-case it in the runner.', 'blocking'),
  ('no_number_to_chase', 'no number',
   'The rubric found no number to chase. An idea without a number is a thought, not a piece.',
   'Either the source carries a figure the extractor missed, or it never had one. Check raw.assessment.number_quoted before blaming the rule.', 'blocking'),
  ('over_covered', 'everyone is writing this',
   'Everyone is already writing this one, and it is neither funny enough nor fresh enough in its angle to earn a slot anyway.',
   'Force a better angle. That sends it back to be re-pitched rather than killed, and the re-pitch arrives as a new intake row.', 'blocking'),
  ('no_format_claims_it', 'no subchannel claims it',
   'No active subchannel mandate claims this subject. general is a holding lane, not a slot.',
   'If the same kind of subject keeps landing here, either the mandates are missing a paragraph or a fourth subchannel is being asked for. Both are Krish''s call.', 'blocking'),
  ('mandate_missing', 'a format has no mandate',
   'An active subchannel has no mandate text, so the runner cannot score against it and will not guess one. The whole run stopped.',
   'Write venture_formats.mandate. The mandate lives there in full prose and nowhere else.', 'blocking'),
  ('unreadable_source', 'could not be read',
   'The file or page could not be read: the download failed, the type is not one we open, it was too big, or the reader returned nothing usable.',
   'raw carries the exact skip reason from the reader. The reader''s own retry policy owns the fix; intake only records the verdict.', 'degraded')
on conflict (slug) do update set label = excluded.label, says = excluded.says, fix_hint = excluded.fix_hint, severity = excluded.severity;

-- ── 3. The ledger ──────────────────────────────────────────────────────────
create table if not exists public.intake_items (
  id                uuid primary key default gen_random_uuid(),
  source            text not null references public.intake_sources(slug) on update cascade,
  source_ref        text not null,
  story_key         text,
  url               text,
  title             text,
  claim             text,
  snippet           text,
  received_at       timestamptz,
  first_seen_at     timestamptz not null default now(),
  dedupe_of         uuid references public.intake_items(id) on delete set null,
  state             text not null default 'new' references public.intake_states(slug) on update cascade,
  assessed_at       timestamptz,
  promoted_idea_id  uuid references public.content_ideas(id) on delete set null,
  drop_reason       text references public.handoff_reasons(slug) on update cascade,
  raw               jsonb not null default '{}'::jsonb,

  -- One row per thing per source. The source's own id for the thing, never a
  -- run id: a run ref makes every seed from one run collide with every other.
  constraint intake_items_source_ref_unique unique (source, source_ref),
  constraint intake_items_source_ref_not_blank check (length(btrim(source_ref)) > 0),
  -- The state and its columns agree. An idea id on a row that is not promoted
  -- is a lie; a drop with no reason is a silence; an unread row has no
  -- assessed_at. The one asymmetry is deliberate: a promoted row may lose its
  -- idea, because the Monday purge is allowed to delete a feed idea, and
  -- "promoted, then purged" is the truth of what happened.
  constraint intake_items_idea_only_when_promoted check (promoted_idea_id is null or state = 'promoted'),
  constraint intake_items_dropped_says_why check (state <> 'dropped' or drop_reason is not null),
  constraint intake_items_new_is_unread check (state <> 'new' or assessed_at is null),
  constraint intake_items_not_its_own_duplicate check (dedupe_of is null or dedupe_of <> id)
);

comment on table public.intake_items is
  'One row per thing that arrived, from any source, whatever became of it. This is the one set of data coming in. A row is never deleted: it ends as promoted or dropped, or rests as assessed, and the reason is on the row. A week where nothing was promoted must be distinguishable from a week nothing arrived, and this table is how.';
comment on column public.intake_items.source_ref is
  'The source''s own identity for this thing: a Gmail message id, a Drive file key, a URL, an idea id. Unique per source. Never a run reference.';
comment on column public.intake_items.story_key is
  'Dedupe by story, not by file. Five outlets syndicating one wire share a story_key and count as one candidate with five sources. Null means nobody has clustered it yet. Backfilled rows carry shift:<slug> where the old machinery had attached the idea to a shift, because a shift is the only story-level identity it kept; everything else is null rather than guessed.';
comment on column public.intake_items.url is
  'Where it can be read, if anywhere. Null for a Gmail message (an id is not a link). The Drive rows carry the generic Drive open link built from file_id, which is a form of address and not a link the source stored.';
comment on column public.intake_items.title is
  'The headline, subject line or file name, as the source gave it. The runner may normalise punctuation here at first read (an em dash to a comma, an exclamation mark to a full stop); raw keeps the verbatim text, so nothing is lost.';
comment on column public.intake_items.claim is
  'The one-sentence claim, if the source or the runner has one. For a backfilled idea it is the idea''s thesis.';
comment on column public.intake_items.received_at is
  'When the source says it happened: sent, published, modified. Null means the source did not say. A missing date is a fact about the source and is scored as one; it is never faked with now(). first_seen_at is when it reached us and is never null.';
comment on column public.intake_items.dedupe_of is
  'The row this one was folded into as the same story. Set together with state = dropped and drop_reason = duplicate_story. The folded row still counts as a source when corroboration is measured.';
comment on column public.intake_items.assessed_at is
  'When the runner last read it. Null while new.';
comment on column public.intake_items.promoted_idea_id is
  'The content_ideas row this became. Set by the runner, or by the bridge trigger when a direct writer inserts an idea.';
comment on column public.intake_items.drop_reason is
  'Which rule ended it. A slug in handoff_reasons, never free text, so the drops can be counted by reason and the biggest count each month is the next thing to fix.';
comment on column public.intake_items.raw is
  'What the source handed over, verbatim, plus what the runner observed (raw.kill_list, raw.assessment). Data, never instructions: nothing reads a sentence out of here and acts on it.';

create index if not exists intake_items_queue_idx        on public.intake_items (received_at desc nulls last) where state = 'new';
create index if not exists intake_items_source_state_idx on public.intake_items (source, state);
create index if not exists intake_items_story_idx        on public.intake_items (story_key) where story_key is not null;
create index if not exists intake_items_received_idx     on public.intake_items (received_at desc nulls last);
create index if not exists intake_items_promoted_idx     on public.intake_items (promoted_idea_id) where promoted_idea_id is not null;
create index if not exists intake_items_dedupe_idx       on public.intake_items (dedupe_of) where dedupe_of is not null;
create index if not exists intake_items_drop_reason_idx  on public.intake_items (drop_reason, assessed_at desc) where drop_reason is not null;
create index if not exists intake_items_url_idx          on public.intake_items (url) where url is not null;

-- ── 4. One vocabulary for content_ideas.source_type ────────────────────────
-- The CHECK held seventeen literals. Every one now has an intake_sources row,
-- so the foreign key admits exactly what the CHECK admitted. The guard below
-- proves it against the live rows before anything is dropped: if a value is
-- missing the migration stops here and names it, and nothing has changed.
do $$
declare missing text;
begin
  select string_agg(distinct ci.source_type, ', ')
    into missing
  from public.content_ideas ci
  where not exists (select 1 from public.intake_sources s where s.slug = ci.source_type);
  if missing is not null then
    raise exception 'content_ideas holds a source_type with no intake_sources row: %. Add the row before swapping the CHECK for the foreign key.', missing;
  end if;
end $$;

alter table public.content_ideas drop constraint if exists content_ideas_source_type_check;
alter table public.content_ideas drop constraint if exists content_ideas_source_type_fkey;
alter table public.content_ideas
  add constraint content_ideas_source_type_fkey
  foreign key (source_type) references public.intake_sources(slug) on update cascade;

comment on column public.content_ideas.source_type is
  'Which intake source this idea came from. A foreign key on intake_sources since 2026-09-19, where it used to be a CHECK of seventeen literals. An unknown value still fails the write and names itself in the error; the difference is that adding one is a row, not a rewrite.';

-- ── 5. The backfill ────────────────────────────────────────────────────────
-- Four inserts, one per old ledger. Each is idempotent on (source, source_ref).
-- Nothing in the old tables is touched.

-- 5a. Every idea, as promoted. The intake row is keyed on the idea's own id,
-- not on content_ideas.source_ref, because that column holds the RUN for the
-- two biggest paths (inspiration-sweep-2026-07-03, pool:2026-08-11): 53 groups
-- of ideas share a ref that way, and they are many seeds from one run, not
-- duplicates. The run ref is kept in raw. dedupe_of is left null: nobody
-- clustered these and the backfill will not pretend to.
-- An idea that already has an intake row pointing at it is skipped, whatever
-- that row's source_ref is: once the runner promotes from intake, the row it
-- flips is keyed on the source's ref (a Gmail id, a file key), not on the idea
-- id, and a re-run of this file must not mint a second row beside it.
insert into public.intake_items
  (source, source_ref, story_key, url, title, claim, snippet, received_at, first_seen_at,
   dedupe_of, state, assessed_at, promoted_idea_id, drop_reason, raw)
select
  ci.source_type,
  ci.id::text,
  case when sh.slug is not null then 'shift:' || sh.slug end,
  ci.source_url,
  ci.idea,
  ci.thesis,
  ci.source_snippet,
  coalesce(ci.source_captured_at, ci.created_at),
  ci.created_at,
  null,
  'promoted',
  ci.created_at,
  ci.id,
  null,
  jsonb_build_object(
    'backfill',      '20260919120000_one_intake',
    'from',          'content_ideas',
    'source_ref',    ci.source_ref,
    'source_url',    ci.source_url,
    'idea_state',    ci.state,
    'lane',          ci.lane,
    'lane_slot',     ci.lane_slot,
    'horizon',       ci.horizon,
    'canonical_url', ci.canonical_url,
    'title_norm',    ci.title_norm,
    'content_hash',  ci.content_hash,
    'shift_id',      ci.shift_id,
    'buried_at',     ci.buried_at,
    'buried_reason', ci.buried_reason,
    'source_label',  ci.meta ->> 'source_label'
  )
from public.content_ideas ci
join public.intake_sources s on s.slug = ci.source_type
left join public.shifts sh on sh.id = ci.shift_id
where not exists (select 1 from public.intake_items x where x.promoted_idea_id = ci.id)
on conflict (source, source_ref) do nothing;

-- 5b. Every Gmail message the sweep read, as assessed. The sweep read it and
-- either made an idea (a promoted row above, under inspiration_sweep) or made
-- nothing; either way it has been read. A message id is not a link, so url is
-- null. A newsletter is a container and not a story, so story_key is null.
insert into public.intake_items
  (source, source_ref, story_key, url, title, claim, snippet, received_at, first_seen_at,
   dedupe_of, state, assessed_at, promoted_idea_id, drop_reason, raw)
select
  'gmail_newsletters',
  im.gmail_message_id,
  null,
  null,
  im.subject,
  null,
  null,
  im.received_at,
  im.first_seen_at,
  null,
  'assessed',
  im.first_seen_at,
  null,
  null,
  jsonb_build_object(
    'backfill',       '20260919120000_one_intake',
    'from',           'inspiration_messages',
    'thread_id',      im.thread_id,
    'from_email',     im.from_email,
    'newsletter_key', im.newsletter_key,
    'run_ref',        im.run_ref
  )
from public.inspiration_messages im
on conflict (source, source_ref) do nothing;

-- 5c. Every Drive file the scan registered. The scan's own verdict is
-- mirrored: a skip reason means dropped as unreadable, a processed time means
-- assessed, neither means new. On 2026-09-19 all 17 are processed with no skip
-- reason, so all 17 land as assessed; the other two branches exist for the
-- next file, not for these.
insert into public.intake_items
  (source, source_ref, story_key, url, title, claim, snippet, received_at, first_seen_at,
   dedupe_of, state, assessed_at, promoted_idea_id, drop_reason, raw)
select
  'drive_files',
  df.file_key,
  null,
  'https://drive.google.com/open?id=' || df.file_id,
  df.name,
  null,
  null,
  df.modified_at,
  df.first_seen_at,
  null,
  case
    when df.skip_reason is not null then 'dropped'
    when df.processed_at is not null then 'assessed'
    else 'new'
  end,
  case
    when df.skip_reason is not null or df.processed_at is not null then coalesce(df.processed_at, df.first_seen_at)
  end,
  null,
  case when df.skip_reason is not null then 'unreadable_source' end,
  jsonb_build_object(
    'backfill',     '20260919120000_one_intake',
    'from',         'inspiration_drive_files',
    'file_id',      df.file_id,
    'mime_type',    df.mime_type,
    'size_bytes',   df.size_bytes,
    'run_ref',      df.run_ref,
    'processed_at', df.processed_at,
    'skip_reason',  df.skip_reason,
    'retry_after',  df.retry_after,
    'attempts',     df.attempts
  )
from public.inspiration_drive_files df
on conflict (source, source_ref) do nothing;

-- 5d. Every Hunter post. The link is both the identity and the address. A post
-- with a processed time was read, whatever its error column says about one
-- signal inside it.
insert into public.intake_items
  (source, source_ref, story_key, url, title, claim, snippet, received_at, first_seen_at,
   dedupe_of, state, assessed_at, promoted_idea_id, drop_reason, raw)
select
  'hunter_newsletter_posts',
  hp.link,
  null,
  hp.link,
  hp.title,
  null,
  null,
  coalesce(hp.published_at, hp.fetched_at),
  hp.fetched_at,
  null,
  case when hp.processed_at is not null then 'assessed' else 'new' end,
  hp.processed_at,
  null,
  null,
  jsonb_build_object(
    'backfill',     '20260919120000_one_intake',
    'from',         'hunter_newsletter_posts',
    'signals',      hp.signals,
    'model',        hp.model,
    'error',        hp.error,
    'published_at', hp.published_at
  )
from public.hunter_newsletter_posts hp
on conflict (source, source_ref) do nothing;

-- ── 6. The bridge, dated ───────────────────────────────────────────────────
-- Until each of the six direct writers is pointed at intake_items, a new idea
-- mirrors into intake so the ledger stays whole. An idea the runner promotes
-- carries meta.intake_item_id and flips its own row instead. Drop this trigger
-- in the change that moves the last direct writer, and say so in that change.
create or replace function public.intake_mirror_content_idea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  intake_id uuid;
begin
  if new.meta is not null and new.meta ? 'intake_item_id' then
    begin
      intake_id := (new.meta ->> 'intake_item_id')::uuid;
    exception when others then
      intake_id := null;
    end;
  end if;

  if intake_id is not null then
    update public.intake_items
       set state            = 'promoted',
           promoted_idea_id = new.id,
           assessed_at      = coalesce(assessed_at, now()),
           drop_reason      = null
     where id = intake_id;
    if found then
      return new;
    end if;
  end if;

  insert into public.intake_items
    (source, source_ref, url, title, claim, snippet, received_at, first_seen_at,
     state, assessed_at, promoted_idea_id, raw)
  values
    (new.source_type, new.id::text, new.source_url, new.idea, new.thesis, new.source_snippet,
     coalesce(new.source_captured_at, new.created_at), new.created_at,
     'promoted', new.created_at, new.id,
     jsonb_build_object('bridge', 'intake_mirror_content_idea', 'source_ref', new.source_ref, 'lane_slot', new.lane_slot))
  on conflict (source, source_ref) do nothing;
  return new;
end $$;

comment on function public.intake_mirror_content_idea() is
  'Bridge, dated 2026-09-19. Mirrors a directly written content_ideas row into intake_items as promoted, or flips the intake row a runner-promoted idea names in meta.intake_item_id. To be dropped when the last direct writer moves to intake.';

drop trigger if exists trg_intake_mirror_content_idea on public.content_ideas;
create trigger trg_intake_mirror_content_idea
  after insert on public.content_ideas
  for each row execute function public.intake_mirror_content_idea();

-- ── 7. What the desk reads ─────────────────────────────────────────────────
-- Computed every time, never stored. The machine writes rows; Control Center
-- renders them; a cached count is a number that agrees with the past.
-- security_invoker so a read through the view is checked against the reader's
-- own policies on the tables underneath (anon read, below), instead of running
-- as the view's owner and stepping around RLS.
create or replace view public.intake_by_source
with (security_invoker = true) as
select
  s.slug                                                        as source,
  s.label,
  s.owner,
  s.active,
  s.formerly,
  count(i.id)                                                   as items,
  count(*) filter (where i.state = 'new')                       as new_items,
  count(*) filter (where i.state = 'assessed')                  as assessed,
  count(*) filter (where i.state = 'promoted')                  as promoted,
  count(*) filter (where i.state = 'dropped')                   as dropped,
  max(i.received_at)                                            as latest_received_at,
  min(i.first_seen_at) filter (where i.state = 'new')           as oldest_unread_since
from public.intake_sources s
left join public.intake_items i on i.source = s.slug
group by s.slug, s.label, s.owner, s.active, s.formerly, s.sort_order
order by s.sort_order;

comment on view public.intake_by_source is
  'One line per source: how much arrived, how much is unread, and how old the oldest unread row is. A source with items and a latest_received_at weeks ago has gone quiet; a source with active = true and no rows has never spoken.';

create or replace view public.intake_drops_by_reason
with (security_invoker = true) as
select
  i.drop_reason                     as reason,
  h.label,
  h.severity,
  count(*)                          as drops,
  count(*) filter (where i.assessed_at >= now() - interval '30 days') as drops_last_30_days,
  max(i.assessed_at)                as last_dropped_at
from public.intake_items i
join public.handoff_reasons h on h.slug = i.drop_reason
where i.state = 'dropped'
group by i.drop_reason, h.label, h.severity
order by drops_last_30_days desc, drops desc;

comment on view public.intake_drops_by_reason is
  'Why things end, counted. The top line over the last thirty days is the highest-value thing to go and fix.';

-- ── 8. RLS ─────────────────────────────────────────────────────────────────
-- Anon reads, only the service role writes. Nothing on a phone writes intake;
-- the human path arrives through an API route holding the service key.
alter table public.intake_owners  enable row level security;
alter table public.intake_states  enable row level security;
alter table public.intake_sources enable row level security;
alter table public.intake_items   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['intake_owners', 'intake_states', 'intake_sources', 'intake_items']
  loop
    execute format('drop policy if exists "%s anon read" on public.%I', t, t);
    execute format('create policy "%s anon read" on public.%I for select to anon using (true)', t, t);
    execute format('drop policy if exists "%s service all" on public.%I', t, t);
    execute format('create policy "%s service all" on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $$;

-- ── 9. The count, asserted ─────────────────────────────────────────────────
-- Deterministic checks first. Each old ledger must have exactly one intake row
-- per row of its own, or the migration fails here and rolls back everything
-- above. A backfill that is short by one is a ledger nobody can trust.
do $$
declare
  n_ideas     int; n_ideas_in    int;
  n_gmail     int; n_gmail_in    int;
  n_drive     int; n_drive_in    int;
  n_hunter    int; n_hunter_in   int;
begin
  -- Every idea has at least one intake row pointing at it. Counted by idea,
  -- not by intake row keyed on the idea id, so that a re-run after the runner
  -- has promoted ideas from intake (rows keyed on the source's own ref) still
  -- adds up.
  select count(*) into n_ideas  from public.content_ideas;
  select count(distinct ci.id) into n_ideas_in
    from public.content_ideas ci
    join public.intake_items i on i.promoted_idea_id = ci.id;
  if n_ideas <> n_ideas_in then
    raise exception 'backfill short on content_ideas: % ideas, % have an intake row pointing at them', n_ideas, n_ideas_in;
  end if;

  select count(*) into n_gmail from public.inspiration_messages;
  select count(*) into n_gmail_in
    from public.intake_items i
    join public.inspiration_messages im on im.gmail_message_id = i.source_ref
   where i.source = 'gmail_newsletters';
  if n_gmail <> n_gmail_in then
    raise exception 'backfill short on inspiration_messages: % messages, % intake rows', n_gmail, n_gmail_in;
  end if;

  select count(*) into n_drive from public.inspiration_drive_files;
  select count(*) into n_drive_in
    from public.intake_items i
    join public.inspiration_drive_files df on df.file_key = i.source_ref
   where i.source = 'drive_files';
  if n_drive <> n_drive_in then
    raise exception 'backfill short on inspiration_drive_files: % files, % intake rows', n_drive, n_drive_in;
  end if;

  select count(*) into n_hunter from public.hunter_newsletter_posts;
  select count(*) into n_hunter_in
    from public.intake_items i
    join public.hunter_newsletter_posts hp on hp.link = i.source_ref
   where i.source = 'hunter_newsletter_posts';
  if n_hunter <> n_hunter_in then
    raise exception 'backfill short on hunter_newsletter_posts: % posts, % intake rows', n_hunter, n_hunter_in;
  end if;

  raise notice 'one_intake backfill: % ideas promoted, % gmail messages assessed, % drive files, % hunter posts. % intake rows in total.',
    n_ideas_in, n_gmail_in, n_drive_in, n_hunter_in, (select count(*) from public.intake_items);
end $$;

commit;

-- APPLIED 2026-09-19 and read back against the live project: 623 intake rows,
-- 247 promoted (every content_ideas row), 376 assessed (338 Gmail messages,
-- 17 Drive files, 21 Hunter posts), 0 new, 0 dropped. 21 sources, 9 active.
-- content_ideas_source_type_fkey present, the seventeen-literal CHECK gone,
-- trg_intake_mirror_content_idea present.
--
-- Proved in a rolled-back transaction: a direct content_ideas insert mirrors
-- exactly one promoted intake row; an invented source_type is refused by the
-- foreign key; an intake row set to dropped with no drop_reason is refused.
