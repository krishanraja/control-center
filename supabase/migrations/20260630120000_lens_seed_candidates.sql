-- lens_seed_candidates: the cache the "judgment economy" content radar writes to.
--
-- api/discover-lens-radar.ts (cron/manual) hunts the open web for topics / POVs /
-- headlines in the lens direction, gates them with the deterministic lensFitScore,
-- and upserts the survivors here. The seed rail reads them fast via the lensRadar
-- source in api/_seedSources.ts and offers them as candidates Krish one-clicks.
--
-- This table holds CANDIDATES only; nothing here is a content_idea until Krish
-- promotes it. Idempotent + additive.

CREATE TABLE IF NOT EXISTS public.lens_seed_candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lens_id      text NOT NULL DEFAULT 'judgment-economy',
  text         text NOT NULL,                 -- the candidate POV / headline line
  sub          text,                          -- provenance chip, e.g. "voice · Dan Pratl"
  source_type  text NOT NULL DEFAULT 'lens_radar',
  source_url   text,
  author       text,                          -- the voice/author, when known (also a guest hint)
  origin       text NOT NULL DEFAULT 'theme', -- 'theme' | 'voice'
  fit_score    numeric NOT NULL DEFAULT 0,    -- lensFitScore, 0..1
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  fingerprint  text,                          -- normalized title, the dedup/upsert key
  status       text NOT NULL DEFAULT 'new'    -- new | seeded | dismissed
    CHECK (status IN ('new','seeded','dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per distinct headline; makes the radar's upsert idempotent across runs.
CREATE UNIQUE INDEX IF NOT EXISTS lens_seed_candidates_fp_uidx
  ON public.lens_seed_candidates (fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS lens_seed_candidates_occurred_idx
  ON public.lens_seed_candidates (occurred_at DESC);

CREATE INDEX IF NOT EXISTS lens_seed_candidates_status_idx
  ON public.lens_seed_candidates (status);

-- Service-role only: the rail reads through the service-role API route, exactly
-- like the other seed sources. No public/anon access.
ALTER TABLE public.lens_seed_candidates ENABLE ROW LEVEL SECURITY;
