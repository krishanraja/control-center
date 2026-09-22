-- The observation record: everything the machine ever saw, kept forever.
--
-- The audit that prompted this found one store in the whole portfolio that
-- compounds over time: the shifts register. Everything feeding it is designed
-- to be thrown away. CTRL gathers hundreds of articles a day and keeps twenty.
-- The Monday purge hard-deletes whatever did not become a shift. Newsletter
-- bodies are dropped at read. Zara discarded titles and publish dates before
-- it went quiet. Model prices overwrite every six hours.
--
-- Each of those was a defensible call about a WORKING SURFACE. A feed that
-- keeps its own noise makes every downstream reader responsible for filtering
-- it, and that reasoning is sound. The mistake was letting the working surface
-- be the only surface. A story nobody wrote about in September is exactly the
-- row you want in March when the question is "when did this actually start,
-- and who saw it first". Volume, share of voice, how long a theme took to
-- reach a second outlet, which publisher leads and which follows: none of it
-- is answerable from twenty surfaced cards a day. All of it is answerable
-- from what we already fetched and then dropped on the floor.
--
-- So: this table is not an editorial ledger and must not become one. It has no
-- state machine, no review status, no opinion. intake_items already owns the
-- editorial lifecycle of a thing that arrived, and it is one row per thing per
-- source, unique on (source, source_ref), which is right for an editorial
-- ledger and wrong for a measurement series. The same story reaching us on
-- three consecutive days is one intake_items row and three observations, and
-- the three are the signal.
--
-- The one rule here is that nothing is ever rewritten. Not corrected, not
-- reclassified in place, not deleted when it turns out to be junk. Junk is
-- data: the share of a day's gather that was junk is itself a measurement, and
-- a classifier we improve next year should be checkable against what the old
-- one said. Corrections arrive as new rows. This is enforced below by a
-- trigger rather than by convention, because convention is what produced the
-- overwrites this migration exists to stop.

-- Depends on pgvector for the embedding side table in section 2. It is already
-- enabled on this project and already used by the network-search and dedup
-- migrations, which likewise do not re-declare it.

-- ── 1. The observations ────────────────────────────────────────────────────

create table if not exists public.trend_observations (
  id                bigint generated always as identity primary key,

  -- When WE saw it. Never null, never inferred. observed_on is the day key
  -- every volume series groups by; observed_at is the exact moment.
  observed_on       date not null,
  observed_at       timestamptz not null default now(),

  -- Where it came from. origin is the upstream feed (gdelt, hn, rss, brave,
  -- newsapi, exa, control_center, pool_headline, newsletter, zara, creator,
  -- investigation). collector is the job that wrote this row, so a change in
  -- our own plumbing is separable from a change in the world.
  origin            text not null,
  collector         text not null,

  -- The thing itself, as the source gave it.
  title             text not null,
  title_norm        text,
  snippet           text,
  url               text,
  source_host       text,
  source_tier       smallint,

  -- When the SOURCE says it was published, absolute and with a timezone. The
  -- old cards carried "3 hours ago", frozen at gather time, which is unusable
  -- the moment the row is a day old. Null is honest and is scored as null;
  -- it is never backfilled with the observation time.
  published_at      timestamptz,

  -- How the machine read it at the time. Every one of these is a snapshot of
  -- a classifier that will change, which is why they live beside the raw text
  -- rather than replacing it.
  category          text,
  stance            text,
  affects           text[],
  score             numeric,
  source_count      integer,
  source_urls       text[],

  -- Story identity across sources and days. Null until something clusters it.
  -- Filling it later means writing a row in trend_observation_story_keys, not
  -- updating this column: see section 3.
  story_key         text,

  -- Did a human ever see it, and if not, why not. This is the column that
  -- makes the discarded majority worth keeping: "we fetched 900, surfaced 20,
  -- and here is the reason each of the other 880 lost" is a real question
  -- about our own filters that nothing could answer before.
  surfaced          boolean not null default false,
  drop_reason       text,

  -- Dedupe identity. url_hash is sha256 of the normalised URL; content_hash is
  -- sha256 of the title and snippet as given. Both are written by the caller
  -- because the callers span two Supabase projects and a Vercel app, and a
  -- hash computed in three places must be computed the same way: see
  -- apps/control-plane/api/_observations.ts, which is the reference.
  url_hash          text,
  content_hash      text not null,

  -- Identity, as a real table constraint rather than an expression index, so
  -- PostgREST can infer it for an ON CONFLICT DO NOTHING. nulls not distinct
  -- is what makes a URL-less observation (a newsletter item, a Drive file)
  -- dedupe on its text instead of inserting a fresh row every run.
  --
  -- Deliberately NOT keyed on (origin, observed_on, url_hash) alone. A
  -- same-day re-gather that finds a CHANGED headline on the same URL is a
  -- different observation, and that difference is the sort of mundane thing
  -- that turns out to matter: a publisher quietly softening a claim, a price
  -- corrected an hour after launch. Including content_hash means an identical
  -- re-gather collapses and a changed one is kept. Neither loses anything.
  constraint trend_observations_identity
    unique nulls not distinct (origin, observed_on, url_hash, content_hash),

  -- Nothing is thrown away on the way in. Whatever shape the source handed us
  -- goes here verbatim, including fields this schema has no column for. The
  -- next question we want to ask is usually about a field nobody thought
  -- mattered.
  raw               jsonb not null default '{}'::jsonb,

  constraint trend_observations_title_not_blank check (length(btrim(title)) > 0),
  constraint trend_observations_drop_reason_when_not_surfaced
    check (surfaced or drop_reason is not null or collector = 'backfill')
);

create index if not exists trend_observations_observed_on on public.trend_observations (observed_on desc);
create index if not exists trend_observations_story_key on public.trend_observations (story_key) where story_key is not null;
create index if not exists trend_observations_host on public.trend_observations (source_host, observed_on desc);
create index if not exists trend_observations_category on public.trend_observations (category, observed_on desc);
create index if not exists trend_observations_url_hash on public.trend_observations (url_hash) where url_hash is not null;
create index if not exists trend_observations_surfaced on public.trend_observations (surfaced, observed_on desc);

comment on table public.trend_observations is
  'Every AI story this system has ever seen, from every source, whether or not it was ever surfaced. Append only: rows are never updated and never deleted, and that is enforced by a trigger. The working surfaces (content_ideas, live_headlines_cache) stay small and disposable precisely because this exists underneath them.';
comment on column public.trend_observations.drop_reason is
  'Why this observation never reached a human. off_beat, below_trust_floor, not_ai_native, too_old, lane_full, damage, purged_unused. A surfaced row has none. This column is what makes the discarded majority measurable rather than merely absent.';
comment on column public.trend_observations.published_at is
  'The source''s own publication time, absolute. Null when the source did not say, which is a fact about the source and is never replaced with the time we happened to look.';
comment on column public.trend_observations.raw is
  'The source payload verbatim, including fields with no column here. Assume today''s schema is missing the field next year''s question needs.';

-- ── 2. Append only, enforced ───────────────────────────────────────────────
--
-- A comment saying "do not update this table" is how the overwrites that
-- prompted this migration got written in the first place. Every one of them
-- was reasonable in isolation and none of them was noticed for months. So the
-- rule is in the database, where a well-meaning upsert fails loudly on a
-- Tuesday afternoon instead of quietly costing a year of history.
--
-- There is no exception, not even for a column that is null on insert and
-- filled by a later pass. The moment one such exception exists, the trigger
-- has to decide which other columns that write was allowed to touch, and a
-- rule with an exception in it is a rule somebody will widen. Everything a
-- later pass produces (story keys, entities, embeddings) lives in its own
-- side table below, keyed to the observation and stamped with who produced it.

create or replace function public.trend_observations_are_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'trend_observations is append only: row % cannot be deleted', old.id
      using hint = 'A wrong observation is corrected by inserting a corrected row, not by removing the wrong one. What we believed at the time is part of the record.';
  end if;

  raise exception 'trend_observations is append only: row % cannot be updated', old.id
    using hint = 'Re-classifying, re-scoring, re-clustering and embedding all write to their own side table. The earlier reading stays readable.';
end;
$$;

drop trigger if exists trend_observations_append_only on public.trend_observations;
create trigger trend_observations_append_only
  before update or delete on public.trend_observations
  for each row execute function public.trend_observations_are_append_only();

-- Embeddings, one row per observation per model. Re-embedding with a better
-- model adds a row; the vectors every earlier comparison was made against stay
-- exactly as they were, so an old similarity result is still reproducible.
create table if not exists public.trend_observation_embeddings (
  observation_id bigint not null references public.trend_observations(id) on delete restrict,
  model          text not null,
  embedding      vector(1536) not null,
  created_at     timestamptz not null default now(),
  primary key (observation_id, model)
);

comment on table public.trend_observation_embeddings is
  'Vectors for observations, keyed by the model that produced them. A new model is a new row, never a replacement, so similarity work done last year can still be reproduced.';

-- ── 3. Story identity, as a side table ─────────────────────────────────────
--
-- Clustering five outlets onto one story is a judgement, made by a particular
-- clusterer, at a particular threshold, on a particular day. Writing it into
-- trend_observations.story_key would mean every improvement to the clusterer
-- silently destroys the grouping the last six months of analysis was built on,
-- and there would be no way to tell whether a change in the numbers came from
-- the world or from us.
--
-- So assignments live here, append only, stamped with who decided and how
-- confident they were. trend_observations.story_key stays as a convenience
-- column for the writer that already knows the story at insert time; this
-- table is the authority when the two disagree, and current_story_keys below
-- resolves it.

create table if not exists public.trend_observation_story_keys (
  id             bigint generated always as identity primary key,
  observation_id bigint not null references public.trend_observations(id) on delete restrict,
  story_key      text not null,
  clusterer      text not null,
  confidence     numeric,
  assigned_at    timestamptz not null default now(),
  constraint trend_observation_story_keys_once unique (observation_id, clusterer, story_key)
);

create index if not exists trend_observation_story_keys_key
  on public.trend_observation_story_keys (story_key, assigned_at desc);

comment on table public.trend_observation_story_keys is
  'Every story-clustering judgement ever made, by whom and when. A better clusterer adds rows; it never erases what the old one thought, so a change in a trend line can always be traced to the world or to us.';

-- ── 4. Entities ────────────────────────────────────────────────────────────
--
-- The audit's finding: you can ask "is agentic orchestration rising" because
-- there are nine categories, and you cannot ask "how is Anthropic's share of
-- coverage moving against OpenAI" because there is no company, lab, model or
-- person anywhere. Nine lanes is a taxonomy of subjects. This is a registry of
-- things that act.
--
-- Aliases are the whole job. "OpenAI", "Open AI", "openai.com" and "Sam
-- Altman's company" are one entity, and the mentions table is worthless if
-- they are four. The registry is small and hand-correctable on purpose.

create table if not exists public.trend_entities (
  id           bigint generated always as identity primary key,
  slug         text not null unique,
  kind         text not null check (kind in ('lab', 'company', 'model', 'person', 'product', 'institution', 'technique')),
  label        text not null,
  aliases      text[] not null default '{}',
  parent_slug  text references public.trend_entities(slug) on update cascade,
  first_seen_on date,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists trend_entities_kind on public.trend_entities (kind);

comment on table public.trend_entities is
  'The things AI news is about: labs, companies, models, people. Small, curated, hand-correctable. parent_slug carries a model up to the lab that made it, so a question about Anthropic sweeps in every Claude release without anyone maintaining a list.';
comment on column public.trend_entities.aliases is
  'Every written form that means this entity, lowercased. The mention table is only as good as this column.';

create table if not exists public.trend_observation_entities (
  id             bigint generated always as identity primary key,
  observation_id bigint not null references public.trend_observations(id) on delete restrict,
  entity_slug    text not null references public.trend_entities(slug) on update cascade,
  -- Where in the text it was found, and who found it. An alias match and an
  -- LLM read are different kinds of evidence and are not averaged.
  extractor      text not null,
  confidence     numeric,
  matched_on     text,
  extracted_at   timestamptz not null default now(),
  constraint trend_observation_entities_once unique (observation_id, entity_slug, extractor)
);

create index if not exists trend_observation_entities_entity
  on public.trend_observation_entities (entity_slug);
create index if not exists trend_observation_entities_observation
  on public.trend_observation_entities (observation_id);

comment on table public.trend_observation_entities is
  'Which entities each observation mentions, per extractor. Append only for the same reason the story keys are: a better extractor next year must be comparable against this one, not a replacement for it.';

-- ── 5. Weekly metrics ──────────────────────────────────────────────────────
--
-- Everything above is raw. This is the series you actually plot, and it is
-- snapshotted rather than computed on read for two reasons. A read-time
-- computation over a growing table gets slower every week until somebody
-- quietly adds a time limit to it. And more importantly, a metric recomputed
-- on read silently changes its own history the moment the method changes,
-- which is the failure this whole migration is about.
--
-- So a recomputation writes a NEW row with a new computed_at and its own
-- method label. The series keeps both, and a view takes the newest. If a
-- number moves, you can see whether the world moved or the method did.

create table if not exists public.trend_weekly_metrics (
  id             bigint generated always as identity primary key,
  week           text not null,
  dimension      text not null check (dimension in ('category', 'entity', 'source_host', 'origin', 'stance', 'total')),
  dimension_key  text not null,
  observations   integer not null default 0,
  distinct_urls  integer not null default 0,
  distinct_hosts integer not null default 0,
  surfaced       integer not null default 0,
  tier_weighted  numeric not null default 0,
  first_seen_on  date,
  method         text not null,
  computed_at    timestamptz not null default now(),
  constraint trend_weekly_metrics_once unique (week, dimension, dimension_key, method, computed_at)
);

create index if not exists trend_weekly_metrics_series
  on public.trend_weekly_metrics (dimension, dimension_key, week);

comment on table public.trend_weekly_metrics is
  'The plottable series: how much was written, about what, by whom, each week. Snapshotted and append only. A changed method writes a new row beside the old one rather than rewriting the past, so a moving line can always be attributed to the world or to a change in how we counted.';
comment on column public.trend_weekly_metrics.tier_weighted is
  'Observations weighted by publisher tier, so a Reuters piece and a content farm rewrite do not count the same. Kept beside the raw count rather than instead of it.';

-- ── 6. Reading views ───────────────────────────────────────────────────────

-- The current clustering opinion per observation: the newest assignment wins,
-- falling back to the convenience column on the row itself.
create or replace view public.trend_observation_current_story as
select
  o.id as observation_id,
  coalesce(k.story_key, o.story_key) as story_key,
  coalesce(k.clusterer, case when o.story_key is not null then 'writer' end) as clusterer,
  k.assigned_at
from public.trend_observations o
left join lateral (
  select sk.story_key, sk.clusterer, sk.assigned_at
  from public.trend_observation_story_keys sk
  where sk.observation_id = o.id
  order by sk.assigned_at desc, sk.id desc
  limit 1
) k on true;

comment on view public.trend_observation_current_story is
  'Today''s best answer to "which story is this", without destroying yesterday''s. The side table wins over the convenience column when both exist.';

-- The newest metric per series point, so a dashboard reads one row per week
-- without needing to know which methods have existed.
create or replace view public.trend_weekly_metrics_current as
select distinct on (dimension, dimension_key, week)
  week, dimension, dimension_key, observations, distinct_urls, distinct_hosts,
  surfaced, tier_weighted, first_seen_on, method, computed_at
from public.trend_weekly_metrics
order by dimension, dimension_key, week, computed_at desc;

-- What each day's gather did with what it found. The retention question in one
-- view: how much arrived, how much was shown, and where the rest went.
create or replace view public.trend_observation_daily_yield as
select
  observed_on,
  origin,
  count(*)::integer as observations,
  count(*) filter (where surfaced)::integer as surfaced,
  count(distinct source_host)::integer as hosts,
  count(distinct url_hash)::integer as distinct_urls,
  count(*) filter (where published_at is null)::integer as undated,
  jsonb_object_agg(coalesce(drop_reason, 'surfaced'), n) filter (where drop_reason is not null) as dropped_by_reason
from (
  select observed_on, origin, surfaced, source_host, url_hash, published_at, drop_reason,
         count(*) over (partition by observed_on, origin, drop_reason) as n
  from public.trend_observations
) t
group by observed_on, origin;

comment on view public.trend_observation_daily_yield is
  'How much each source produced each day and what became of it. The first honest answer to "is a collector quietly dying", measured on what it fetched rather than on what survived our filters.';

-- ── 7. Access ──────────────────────────────────────────────────────────────
--
-- Service-role only, like the rest of the engine's internals. RLS on with no
-- policy means nothing is directly selectable by an anon or authenticated
-- client; the jobs write through the service role and bypass it.

alter table public.trend_observations enable row level security;
alter table public.trend_observation_story_keys enable row level security;
alter table public.trend_entities enable row level security;
alter table public.trend_observation_entities enable row level security;
alter table public.trend_weekly_metrics enable row level security;

revoke all on public.trend_observations from anon, authenticated;
revoke all on public.trend_observation_story_keys from anon, authenticated;
revoke all on public.trend_entities from anon, authenticated;
revoke all on public.trend_observation_entities from anon, authenticated;
revoke all on public.trend_weekly_metrics from anon, authenticated;

-- Belt and braces on top of the trigger: the writers only ever need insert.
-- A service-role caller bypasses RLS but not a missing grant, so this closes
-- the accidental-upsert path for every role that is not the table owner.
revoke update, delete on public.trend_observations from public;
revoke update, delete on public.trend_observation_story_keys from public;
revoke update, delete on public.trend_observation_entities from public;
revoke delete on public.trend_weekly_metrics from public;

-- ── 8. Seed the entity registry ────────────────────────────────────────────
--
-- Enough to be useful on day one and obviously incomplete on purpose. The
-- extractor proposes; Krish and the model add the rest as they show up. Model
-- rows carry parent_slug so a question about a lab sweeps in its releases.

insert into public.trend_entities (slug, kind, label, aliases, parent_slug) values
  ('openai',      'lab',     'OpenAI',        array['openai','open ai','openai.com'], null),
  ('anthropic',   'lab',     'Anthropic',     array['anthropic','anthropic.com'], null),
  ('google-deepmind','lab',  'Google DeepMind', array['deepmind','google deepmind','deepmind.google','google ai'], null),
  ('meta-ai',     'lab',     'Meta AI',       array['meta ai','fair','meta platforms'], null),
  ('mistral',     'lab',     'Mistral AI',    array['mistral','mistral ai'], null),
  ('xai',         'lab',     'xAI',           array['xai','x.ai'], null),
  ('microsoft',   'company', 'Microsoft',     array['microsoft','msft','azure ai'], null),
  ('nvidia',      'company', 'NVIDIA',        array['nvidia','nvda'], null),
  ('amazon',      'company', 'Amazon',        array['amazon','aws','bedrock'], null),
  ('apple',       'company', 'Apple',         array['apple','apple intelligence'], null),
  ('hugging-face','company', 'Hugging Face',  array['hugging face','huggingface'], null),
  ('cohere',      'company', 'Cohere',        array['cohere'], null),
  ('perplexity',  'company', 'Perplexity',    array['perplexity','perplexity ai'], null),
  ('gpt',         'model',   'GPT family',    array['gpt','gpt-4','gpt-5','gpt5','gpt4'], 'openai'),
  ('claude',      'model',   'Claude family', array['claude'], 'anthropic'),
  ('gemini',      'model',   'Gemini family', array['gemini'], 'google-deepmind'),
  ('llama',       'model',   'Llama family',  array['llama'], 'meta-ai'),
  ('grok',        'model',   'Grok family',   array['grok'], 'xai'),
  ('agents',      'technique','Agents',       array['agent','agents','agentic','multi-agent'], null),
  ('rag',         'technique','Retrieval augmented generation', array['rag','retrieval augmented'], null),
  ('mcp',         'technique','Model Context Protocol', array['mcp','model context protocol'], null),
  ('eu-ai-act',   'institution','EU AI Act',  array['eu ai act','ai act'], null)
on conflict (slug) do nothing;
