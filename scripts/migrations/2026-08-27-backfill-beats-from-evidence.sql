-- Backfill beats from the evidence already gathered.
--
-- Applied 2026-08-27. Without it the arc model is a correct but empty schema,
-- and the two-beat rule has nothing to bite on.
--
-- origin_key is the PUBLISHER, not the story. That is the whole point: the
-- unique index on (shift_id, occurred_on, origin_key) collapses five outlets
-- carrying one wire into a single beat, and that collapse IS the independence
-- rule. Result on live data: 383 evidence rows became 365 beats, so 18 were
-- syndication of something already counted.
--
-- source_tier is left NULL deliberately. These rows predate the source registry,
-- and inventing a tier would feed arc_maturity a number nobody measured.

insert into public.shift_beats (shift_id, occurred_on, what_changed, origin_key, evidence_id, source_tier)
select e.shift_id,
       e.occurred_on,
       e.headline,
       coalesce(nullif(e.source, ''), substring(e.url from '^https?://([^/]+)'), e.headline),
       e.id,
       null
from public.shift_evidence e
where e.shift_id is not null
  and e.occurred_on is not null
  and coalesce(e.headline, '') <> ''
on conflict do nothing;
