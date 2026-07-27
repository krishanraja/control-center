-- Inspiration Sweep hardening (2026-07-27).
--
-- The sweep (n8n D4W5TF1sP9lE828c) re-read the same Gmail messages every run
-- (newer_than:7d, no state) and re-inserted the same stories 4-6x across
-- consecutive days. This migration gives it memory, provenance, and temporal
-- awareness:
--
--   1. `inspiration_messages`  - ledger of every Gmail message ever processed,
--      so a message is read exactly once and coverage is auditable.
--   2. `newsletter_sources`    - sender registry keyed by from_email, giving
--      every seed a stable newsletter_key + canonical label (the shift gate's
--      source-diversity floor depends on labels not fragmenting).
--   3. `record`/`upsert` RPCs  - all judgement in SQL, the workflow stays thin.
--      A re-seen story becomes a RECURRENCE (meta.recurrences append + research
--      refresh + expiry extension) instead of a duplicate row. Recurrence is
--      the news-vs-trend signal the shift gate measures, so it is preserved
--      as data instead of as duplicate rows.
--   4. Temporal class          - seeds carry meta.temporal_class
--      (ephemeral | developing | durable) mapped onto the existing
--      horizon/expires_at fates: ephemeral news expires and is purged unless
--      it recurs or graduates; durable shifts are evergreen.
--   5. Backfill                - existing duplicate rows folded into their
--      keeper's meta.recurrences and buried; lane-sourcing drafts that were
--      mislabeled as inspiration_sweep get their own source_type.
--
-- Transform children (parent_idea_id IS NOT NULL) inherit source_type AND
-- source_url from their parent, so every uniqueness guard here excludes them.

-- ---------------------------------------------------------------------------
-- 1. source_type vocabulary: split lane-sourcing drafts out of inspiration_sweep
-- ---------------------------------------------------------------------------

ALTER TABLE public.content_ideas DROP CONSTRAINT IF EXISTS content_ideas_source_type_check;
ALTER TABLE public.content_ideas ADD CONSTRAINT content_ideas_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'signal_inbox','cleo_chat','agatha_chat','openclaw_workspace',
    'zara_signal','manual','inspiration_sweep','synthesis_hypothesis',
    'customer_voice','crm_opportunity','synthesis','pool_headline',
    'lane_sourcing'
  ]));

-- Cleo | Content Lane Sourcing wrote its drafts as inspiration_sweep, which
-- let researched drafts masquerade as newsletter evidence in the shift corpus.
UPDATE public.content_ideas
SET source_type = 'lane_sourcing'
WHERE source_type = 'inspiration_sweep'
  AND meta->>'generated_by' = 'lane_sourcing';

-- ---------------------------------------------------------------------------
-- 2. Fold existing duplicate sweep rows into their keeper, then bury them.
--    Keeper preference: linked to a shift > most advanced state > earliest.
-- ---------------------------------------------------------------------------

WITH dups AS (
  SELECT id, source_url, created_at, meta,
         ROW_NUMBER() OVER (
           PARTITION BY source_url
           ORDER BY (shift_id IS NOT NULL) DESC,
                    CASE state WHEN 'review' THEN 4 WHEN 'drafting' THEN 3
                               WHEN 'researching' THEN 2 ELSE 1 END DESC,
                    created_at ASC
         ) AS rn
  FROM public.content_ideas
  WHERE source_type = 'inspiration_sweep'
    AND source_url IS NOT NULL
    AND buried_at IS NULL
    AND parent_idea_id IS NULL
),
folded AS (
  SELECT source_url,
         jsonb_agg(jsonb_build_object(
           'day', to_char(created_at, 'YYYY-MM-DD'),
           'label', meta->>'source_label'
         ) ORDER BY created_at) AS recs
  FROM dups WHERE rn > 1
  GROUP BY source_url
)
UPDATE public.content_ideas ci
SET meta = jsonb_set(COALESCE(ci.meta, '{}'::jsonb), '{recurrences}',
             COALESCE(ci.meta->'recurrences', '[]'::jsonb) || f.recs)
FROM dups d
JOIN folded f USING (source_url)
WHERE d.rn = 1 AND ci.id = d.id;

WITH dups AS (
  SELECT id, source_url,
         ROW_NUMBER() OVER (
           PARTITION BY source_url
           ORDER BY (shift_id IS NOT NULL) DESC,
                    CASE state WHEN 'review' THEN 4 WHEN 'drafting' THEN 3
                               WHEN 'researching' THEN 2 ELSE 1 END DESC,
                    created_at ASC
         ) AS rn
  FROM public.content_ideas
  WHERE source_type = 'inspiration_sweep'
    AND source_url IS NOT NULL
    AND buried_at IS NULL
    AND parent_idea_id IS NULL
)
UPDATE public.content_ideas ci
SET buried_at = now(),
    buried_reason = 'inspiration dedupe 2026-07-27: duplicate capture, recurrence folded into keeper'
FROM dups d
WHERE ci.id = d.id AND d.rn > 1;

-- One live parent seed per story URL, enforced at the database.
CREATE UNIQUE INDEX IF NOT EXISTS content_ideas_inspiration_url_live_uq
  ON public.content_ideas (source_url)
  WHERE source_type = 'inspiration_sweep'
    AND buried_at IS NULL
    AND source_url IS NOT NULL
    AND parent_idea_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Message ledger + sender registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inspiration_messages (
  gmail_message_id text PRIMARY KEY,
  thread_id        text,
  from_email       text,
  newsletter_key   text,
  subject          text,
  received_at      timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  run_ref          text
);

CREATE TABLE IF NOT EXISTS public.newsletter_sources (
  from_email     text PRIMARY KEY,
  newsletter_key text NOT NULL,
  display_name   text NOT NULL,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  emails_seen    integer NOT NULL DEFAULT 1,
  active         boolean NOT NULL DEFAULT true
);

-- Seed the senders already evidenced in content_ideas.meta.source_label so
-- canonical names are right from run one; unknown senders self-register.
INSERT INTO public.newsletter_sources (from_email, newsletter_key, display_name) VALUES
  ('newsletter@thedeepview.co',   'the_deep_view',        'The Deep View'),
  ('news@daily.therundown.ai',    'the_rundown_ai',       'The Rundown AI'),
  ('evolvingai@mail.beehiiv.com', 'evolving_ai_insights', 'Evolving AI Insights'),
  ('a16z@substack.com',           'a16z',                 'a16z'),
  ('emergingai@substack.com',     'opinion_ai',           'Opinion AI')
ON CONFLICT (from_email) DO NOTHING;

ALTER TABLE public.inspiration_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_sources  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read inspiration_messages" ON public.inspiration_messages;
CREATE POLICY "anon read inspiration_messages" ON public.inspiration_messages
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "service write inspiration_messages" ON public.inspiration_messages;
CREATE POLICY "service write inspiration_messages" ON public.inspiration_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read newsletter_sources" ON public.newsletter_sources;
CREATE POLICY "anon read newsletter_sources" ON public.newsletter_sources
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "service write newsletter_sources" ON public.newsletter_sources;
CREATE POLICY "service write newsletter_sources" ON public.newsletter_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. RPCs: all sweep write judgement lives here, the workflow stays thin
-- ---------------------------------------------------------------------------

-- Registers a batch of newly-read Gmail messages: upserts the sender registry,
-- inserts ledger rows, returns { from_email: {key, label} } for canonical
-- labelling in the extraction prompt.
CREATE OR REPLACE FUNCTION public.register_inspiration_messages(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m jsonb; v_from text; v_key text; v_name text; out_map jsonb := '{}'::jsonb;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p->'messages', '[]'::jsonb)) LOOP
    v_from := lower(COALESCE(NULLIF(m->>'from_email',''), 'unknown'));
    INSERT INTO public.newsletter_sources (from_email, newsletter_key, display_name)
    VALUES (
      v_from,
      trim(BOTH '_' FROM regexp_replace(
        lower(COALESCE(NULLIF(m->>'display_name',''), split_part(v_from,'@',2))),
        '[^a-z0-9]+', '_', 'g')),
      COALESCE(NULLIF(m->>'display_name',''), v_from)
    )
    ON CONFLICT (from_email) DO UPDATE
      SET last_seen_at = now(),
          emails_seen  = public.newsletter_sources.emails_seen + 1
    RETURNING newsletter_key, display_name INTO v_key, v_name;

    INSERT INTO public.inspiration_messages
      (gmail_message_id, thread_id, from_email, newsletter_key, subject, received_at, run_ref)
    VALUES
      (m->>'id', m->>'thread_id', v_from, v_key, m->>'subject',
       NULLIF(m->>'date_iso','')::timestamptz, p->>'run_ref')
    ON CONFLICT (gmail_message_id) DO NOTHING;

    out_map := out_map || jsonb_build_object(v_from, jsonb_build_object('key', v_key, 'label', v_name));
  END LOOP;
  RETURN out_map;
END $$;

-- Inserts a new seed, or converts a re-seen story into a recurrence event:
-- meta.recurrences append, research refresh, expiry extension (a story that
-- keeps recurring is trend-shaped and must not be purged as stale news).
-- Temporal fates: ephemeral/developing -> horizon 'news' with expires_at set
-- while still 'seeded'; durable -> 'evergreen', never expires.
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
      'poster_name',      p->'poster_name')))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('action','recurrence_race','id',NULL);
  END IF;
  RETURN jsonb_build_object('action','inserted','id',v_id);
END $$;

REVOKE ALL ON FUNCTION public.register_inspiration_messages(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_inspiration_seed(jsonb)       FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_inspiration_messages(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_inspiration_seed(jsonb)       TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Per-newsletter yield: which subscriptions actually produce publishable
--    work. Read back into the extraction prompt as the source track record,
--    and by Krish to decide which newsletters earn their place in the label.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.newsletter_source_yield AS
SELECT
  COALESCE(ci.meta->>'newsletter_key', 'unlabelled') AS newsletter_key,
  COUNT(*)                                            AS seeds,
  COUNT(*) FILTER (WHERE ci.state IN ('drafting','review','approved')
                      OR ci.published_at IS NOT NULL) AS advanced,
  COUNT(*) FILTER (WHERE ci.buried_at IS NOT NULL)    AS buried,
  COALESCE(SUM(jsonb_array_length(ci.meta->'recurrences'))
           FILTER (WHERE jsonb_typeof(ci.meta->'recurrences') = 'array'), 0) AS recurrences,
  MAX(ci.created_at)                                  AS last_seed_at
FROM public.content_ideas ci
WHERE ci.source_type = 'inspiration_sweep' AND ci.parent_idea_id IS NULL
GROUP BY 1;

GRANT SELECT ON public.newsletter_source_yield TO anon, service_role;
