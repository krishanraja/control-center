-- Content ideas: give every news-horizon row an expiry.
--
-- The Content tab was ~85% permanent backlog. 274 of 323 content_ideas had
-- expires_at = NULL, and api/purge/run.ts only deletes rows where expires_at is
-- both NOT NULL and in the past, so the Monday purge could never touch them.
-- Only api/feed/ingest.ts was setting an expiry; the Inspiration Sweep started
-- setting one on 2026-07-27 and never backfilled what came before.
--
-- NULL is meaningful for evergreen rows: api/content-decisions/[id].ts sets
-- { horizon: 'evergreen', expires_at: null } when a row is kept to the Library,
-- and that means "never expires". So this backfill is scoped to horizon='news'
-- and deliberately leaves evergreen rows alone.
--
-- The boundary mirrors purgeBoundary() in api/_weeks.ts: the Monday 14:00 UTC
-- that ends the week the row was created in. Rows created months ago therefore
-- land in the past and drain on the next purge run, which is the intent.

update content_ideas
set expires_at = date_trunc('week', created_at) + interval '7 days' + interval '14 hours'
where expires_at is null
  and horizon = 'news';

-- Applied 2026-08-12: 270 rows updated, 4 evergreen rows left NULL,
-- 275 rows became purgeable on the next Monday 14:00 UTC run.

-- Eleven code paths insert into content_ideas and none reliably set an expiry.
-- Patching eleven call sites is a rule the twelfth will break, so the invariant
-- goes in Postgres. An explicit `expires_at: null` still overrides the default,
-- which is what keeps the evergreen path working.
alter table content_ideas
  alter column expires_at
  set default (date_trunc('week', now()) + interval '7 days' + interval '14 hours');
