-- 2026-06-02 — Engagement-ledger spine: extend concept_id closure identity to
-- guests + visibility_targets (previously only on leads / contacts / tasks).
-- Idempotent; safe to re-run.

-- concept_id on guests + visibility_targets
alter table public.guests             add column if not exists concept_id text;
alter table public.visibility_targets add column if not exists concept_id text;

create index if not exists guests_concept_id_idx              on public.guests(concept_id);
create index if not exists visibility_targets_concept_id_idx  on public.visibility_targets(concept_id);

-- Backfill deterministic concept slugs from the human-readable name/title.
update public.guests
   set concept_id = 'concept:guest:' || compute_concept_slug(name)
 where concept_id is null and name is not null;

update public.visibility_targets
   set concept_id = 'concept:vis:' || compute_concept_slug(title)
 where concept_id is null and title is not null;

-- Idempotent-upsert key for generators that write visibility podcasts/events
-- (e.g. Nova Podchaser -> Visibility). Non-partial so PostgREST on_conflict works.
create unique index if not exists visibility_targets_concept_uniq
  on public.visibility_targets(concept_id);

-- NOTE (data, applied live 2026-06-02, not DDL): the Signal & Noise
-- "already-interviewed" memory was seeded into public.guests as status
-- 'published'/'recorded' (30 rows from Podchaser episode history of show
-- 6164314 + 44 rows from the POSSIBLE 2026 schedule sheet). The Guest Scout
-- (n8n 8DlMfyTYsbnQGYR2) dedups against this set (was querying the dropped
-- nell_candidates table). Kept here as provenance; re-run is via those tools.
