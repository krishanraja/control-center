-- Inspiration Sweep: Drive lane hardening (2026-08-19).
--
-- Audit finding. The sweep has two input lanes. The Gmail lane was hardened on
-- 2026-07-27 (message ledger, canonical sources, recurrence-not-duplicates) and
-- is healthy: 36 messages listed / 3 new / 5 seeds on the 2026-08-19 run. The
-- Drive lane never got the same treatment and has produced ZERO seeds in its
-- entire life: 0 of 103 `inspiration_sweep` rows carry a drive.google.com or
-- docs.google.com source_url.
--
-- It was not possible to notice, because the Drive lane is unobservable:
--   * `Heartbeat Done` / `Audit Log Done` record gmail_listed / gmail_new /
--     gmail_overflow and nothing at all about Drive. `Build Extraction Prompt`
--     computes docs_count / images_count / pdfs_count and throws them away.
--   * There is a `Gmail Zero?` -> `Alert Zero Emails` branch. There is no
--     Drive equivalent, so an empty or broken folder read looks like a quiet day.
--   * `completeness_contracts` had no row for D4W5TF1sP9lE828c at all, so tier-1
--     self-healing never checked the workflow, and "zero rows is a valid output"
--     meant tier-2 stayed quiet too.
--   * The Drive lane has no ledger, so the same file is re-read on every run for
--     the whole 14-day lookback window. Cheap for text. Not cheap for the phone
--     screenshots that now land in the folder: three of them are 3.5 MB, which is
--     4.7 MB of base64 re-sent to Sonnet daily for fourteen consecutive days.
--
-- This migration gives the Drive lane the same three things the Gmail lane got:
--   1. `inspiration_drive_files` - a ledger keyed on (file id, modifiedTime), so
--      a file is read once, and an EDITED file is read again.
--   2. `register_inspiration_drive_files` - called only after a file has actually
--      reached the extractor, so a mid-run failure retries instead of going quiet.
--   3. `inspiration_lane_health` - one view that answers "is each lane alive",
--      so the next audit is a single query instead of an afternoon.
--
-- Plus the two data-loss fixes the screenshot path needs:
--   * `upsert_inspiration_seed` persists `poster_handle` and `drive_file_id`.
--     The extraction prompt has always asked the model for poster_handle; the
--     RPC silently dropped it, so screenshot attribution was lossy by design.
--   * A completeness contract for the sweep, so tier 1 covers it.

-- ---------------------------------------------------------------------------
-- 1. Drive file ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inspiration_drive_files (
  -- file id + modifiedTime. Re-uploading or editing a file mints a new key and
  -- the file legitimately re-enters the sweep; an untouched file never does.
  file_key      text PRIMARY KEY,
  file_id       text NOT NULL,
  name          text,
  mime_type     text,
  size_bytes    bigint,
  modified_at   timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  run_ref       text,
  -- Set by the sweep once the file actually reached the extractor. A row with
  -- claimed-but-never-processed is the signature of a mid-run failure.
  processed_at  timestamptz,
  skip_reason   text
);

CREATE INDEX IF NOT EXISTS inspiration_drive_files_first_seen_idx
  ON public.inspiration_drive_files (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS inspiration_drive_files_file_id_idx
  ON public.inspiration_drive_files (file_id);

ALTER TABLE public.inspiration_drive_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read inspiration_drive_files" ON public.inspiration_drive_files;
CREATE POLICY "anon read inspiration_drive_files" ON public.inspiration_drive_files
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "service write inspiration_drive_files" ON public.inspiration_drive_files;
CREATE POLICY "service write inspiration_drive_files" ON public.inspiration_drive_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Register RPC (post-extraction, so failures retry)
-- ---------------------------------------------------------------------------

-- Registers the Drive files that actually reached the extractor, and reports how
-- many were genuinely new. Called AFTER the fetch+aggregate succeeds, never
-- before: a file that was listed but never made it into the prompt stays
-- unregistered and is retried on the next run, rather than being marked read.
-- Files deferred over the byte budget are likewise left unregistered on purpose.
CREATE OR REPLACE FUNCTION public.register_inspiration_drive_files(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run_ref text := NULLIF(p->>'run_ref','');
  v_registered int;
  v_offered int;
BEGIN
  SELECT count(*) INTO v_offered
  FROM jsonb_array_elements(COALESCE(p->'files','[]'::jsonb));

  WITH incoming AS (
    SELECT
      COALESCE(NULLIF(f->>'id',''),'') || ':' || COALESCE(NULLIF(f->>'modified',''),'') AS file_key,
      f->>'id'                               AS file_id,
      f->>'name'                             AS name,
      f->>'mime_type'                        AS mime_type,
      NULLIF(f->>'size_bytes','')::bigint    AS size_bytes,
      NULLIF(f->>'modified','')::timestamptz AS modified_at,
      NULLIF(f->>'skip_reason','')           AS skip_reason
    FROM jsonb_array_elements(COALESCE(p->'files','[]'::jsonb)) f
    WHERE NULLIF(f->>'id','') IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.inspiration_drive_files
      (file_key, file_id, name, mime_type, size_bytes, modified_at, run_ref,
       processed_at, skip_reason)
    SELECT file_key, file_id, name, mime_type, size_bytes, modified_at, v_run_ref,
           now(), skip_reason
    FROM incoming
    ON CONFLICT (file_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_registered FROM ins;

  RETURN jsonb_build_object(
    'registered', v_registered,
    'offered',    v_offered,
    'already_seen', v_offered - v_registered
  );
END $$;

-- Match the two sibling sweep RPCs (register_inspiration_messages,
-- upsert_inspiration_seed), which are service_role only. Left anon-executable,
-- any holder of the publishable key could poison the ledger: inserting a
-- file_key marks that file read, so the sweep would skip real material forever.
-- The n8n supabaseApi credential is service_role, which is why the Gmail lane's
-- Register Messages node already writes through the same restriction.
REVOKE EXECUTE ON FUNCTION public.register_inspiration_drive_files(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_inspiration_drive_files(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_inspiration_drive_files(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.register_inspiration_drive_files(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Seed upsert: stop dropping screenshot attribution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_inspiration_seed(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_class text := COALESCE(NULLIF(p->>'temporal_class',''), 'developing');
  v_days int;
  v_score int := COALESCE(NULLIF(p->>'brand_fit_score','')::int, 6);
  v_state text; v_horizon text; v_expires timestamptz;
  v_day date := COALESCE(NULLIF(p->>'day','')::date, current_date);
  v_url text := NULLIF(p->>'source_url','');
BEGIN
  IF v_url IS NULL THEN
    RETURN jsonb_build_object('action','skipped','reason','no source_url');
  END IF;
  IF v_class NOT IN ('ephemeral','developing','durable') THEN v_class := 'developing'; END IF;
  v_days := COALESCE(NULLIF(p->>'expires_in_days','')::int,
                     CASE v_class WHEN 'ephemeral' THEN 10 WHEN 'developing' THEN 30 ELSE NULL END);
  IF v_days IS NOT NULL THEN v_days := GREATEST(3, LEAST(v_days, 90)); END IF;

  SELECT id INTO v_id FROM public.content_ideas
  WHERE source_type = 'inspiration_sweep' AND source_url = v_url
    AND buried_at IS NULL AND parent_idea_id IS NULL
  ORDER BY created_at LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.content_ideas SET
      meta = jsonb_set(COALESCE(meta,'{}'::jsonb), '{recurrences}',
               COALESCE(meta->'recurrences','[]'::jsonb) || jsonb_build_object(
                 'day', to_char(v_day,'YYYY-MM-DD'),
                 'label', p->>'source_label',
                 'newsletter_key', p->>'newsletter_key'))
             || jsonb_strip_nulls(jsonb_build_object(
                 'contrarian', p->'contrarian',
                 'adjacent_stories', p->'adjacent_stories')),
      source_captured_at = now(),
      expires_at = CASE WHEN expires_at IS NOT NULL
                        THEN GREATEST(expires_at, now() + interval '7 days')
                        ELSE expires_at END
    WHERE id = v_id;
    RETURN jsonb_build_object('action','recurrence','id',v_id);
  END IF;

  v_state   := CASE WHEN v_score >= 9 THEN 'researching' ELSE 'seeded' END;
  v_horizon := CASE WHEN v_class = 'durable' THEN 'evergreen' ELSE 'news' END;
  v_expires := CASE WHEN v_state = 'seeded' AND v_days IS NOT NULL
                    THEN now() + make_interval(days => v_days) ELSE NULL END;

  INSERT INTO public.content_ideas
    (idea, thesis, distribution, confidence, quality_score, brand_fit_score,
     source_type, source_ref, source_url, source_snippet, source_captured_at,
     state, assigned_to, pillar_id, horizon, expires_at, meta)
  VALUES (
    p->>'idea', p->>'thesis',
    COALESCE(p->'distribution', '["linkedin"]'::jsonb),
    COALESCE(NULLIF(p->>'confidence','')::numeric, 0.8),
    COALESCE(NULLIF(p->>'quality_score',''), 'amber'),
    v_score,
    'inspiration_sweep',
    COALESCE(NULLIF(p->>'source_ref',''), 'inspiration-sweep-' || to_char(current_date,'YYYY-MM-DD')),
    v_url, p->>'source_excerpt', now(),
    v_state, 'cleo', p->>'pillar_id', v_horizon, v_expires,
    jsonb_strip_nulls(jsonb_build_object(
      'contrarian',       p->'contrarian',
      'adjacent_stories', p->'adjacent_stories',
      'evidence_present', p->'evidence_present',
      'source_label',     p->>'source_label',
      'newsletter_key',   p->>'newsletter_key',
      'temporal_class',   v_class,
      'image_source',     p->'image_source',
      'poster_name',      p->'poster_name',
      -- new: screenshot seeds keep the handle and the originating Drive file,
      -- so a LinkedIn-sourced take can credit the poster and be traced back.
      'poster_handle',    p->'poster_handle',
      'drive_file_id',    p->'drive_file_id')))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('action','recurrence_race','id',NULL);
  END IF;
  RETURN jsonb_build_object('action','inserted','id',v_id);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Tier-1 coverage for the sweep
-- ---------------------------------------------------------------------------

INSERT INTO public.completeness_contracts
  (workflow_id, workflow_name, target_table, required_fields, min_rows_per_run, description, active)
VALUES (
  'D4W5TF1sP9lE828c',
  'Cleo | Mindmaker OS | Inspiration Sweep',
  'content_ideas',
  ARRAY['idea','thesis','pillar_id','source_url','brand_fit_score'],
  0,
  'Zero seeds is a legitimate output (the pillar bar is high), so min_rows_per_run stays 0. '
  || 'What is NOT legitimate is zero INPUT: no Gmail messages listed, or new Drive files claimed '
  || 'that never reached the extractor. The workflow raises those as tier-2 silent_failures itself; '
  || 'this contract exists so the sweep is registered with tier 1 at all.',
  true
)
ON CONFLICT (workflow_id, target_table) DO UPDATE
  SET workflow_name    = EXCLUDED.workflow_name,
      target_table     = EXCLUDED.target_table,
      required_fields  = EXCLUDED.required_fields,
      min_rows_per_run = EXCLUDED.min_rows_per_run,
      description      = EXCLUDED.description,
      active           = true;

-- ---------------------------------------------------------------------------
-- 5. Config the workflow now actually reads
-- ---------------------------------------------------------------------------

-- cleo_inspiration_drive_lookback_days and cleo_inspiration_max_docs_per_run
-- already existed but were dead: the lookback and page size were hardcoded in
-- the n8n nodes, so tuning them here did nothing. The workflow reads them now.
INSERT INTO public.system_config (key, value) VALUES
  -- Total raw bytes of Drive images + PDFs allowed into one extraction request.
  -- Base64 inflates ~1.37x, so this keeps the Anthropic body near 6MB. Files over
  -- budget are deferred to the next run, not dropped.
  ('cleo_inspiration_max_image_bytes', '4500000'),
  -- Hard cap on image blocks per request, independent of the byte budget.
  ('cleo_inspiration_max_images_per_run', '6')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. One query that answers "is fresh inspiration still arriving"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.inspiration_lane_health AS
WITH lanes AS (
  SELECT 'gmail_newsletters'::text AS lane,
         max(first_seen_at)                                                  AS last_input_at,
         count(*) FILTER (WHERE first_seen_at > now() - interval '7 days')   AS inputs_7d
  FROM public.inspiration_messages
  UNION ALL
  SELECT 'drive_inspiration_folder',
         max(first_seen_at),
         count(*) FILTER (WHERE first_seen_at > now() - interval '7 days')
  FROM public.inspiration_drive_files
),
seeds AS (
  SELECT 'gmail_newsletters'::text AS lane,
         max(created_at)                                                     AS last_seed_at,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')      AS seeds_7d
  FROM public.content_ideas
  WHERE source_type = 'inspiration_sweep'
    AND COALESCE(meta->>'image_source','') = ''
    AND COALESCE(source_url,'') NOT ILIKE '%drive.google.com%'
    AND COALESCE(source_url,'') NOT ILIKE '%docs.google.com%'
  UNION ALL
  SELECT 'drive_inspiration_folder',
         max(created_at),
         count(*) FILTER (WHERE created_at > now() - interval '7 days')
  FROM public.content_ideas
  WHERE source_type = 'inspiration_sweep'
    AND (COALESCE(meta->>'image_source','') <> ''
         OR COALESCE(source_url,'') ILIKE '%drive.google.com%'
         OR COALESCE(source_url,'') ILIKE '%docs.google.com%')
)
SELECT l.lane,
       l.last_input_at,
       l.inputs_7d,
       s.last_seed_at,
       s.seeds_7d,
       -- A lane is only 'ok' if material arrived AND something came out of it.
       -- 'input_starved' means nothing to read, which is Krish's call, not a bug.
       -- 'not_converting' means the sweep read material and produced nothing for
       -- a week: that is the shape the Drive lane was in, silently, for two months.
       CASE
         WHEN l.inputs_7d = 0                     THEN 'input_starved'
         WHEN COALESCE(s.seeds_7d,0) = 0          THEN 'not_converting'
         ELSE 'ok'
       END AS status
FROM lanes l
LEFT JOIN seeds s USING (lane);

GRANT SELECT ON public.inspiration_lane_health TO anon, authenticated, service_role;

COMMENT ON VIEW public.inspiration_lane_health IS
  'Per-lane liveness for the Cleo Inspiration Sweep (D4W5TF1sP9lE828c). One row per input lane: what arrived, what converted, and whether the lane is starved of input or failing to convert it.';
