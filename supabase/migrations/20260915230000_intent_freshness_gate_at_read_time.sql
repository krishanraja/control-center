-- Intent has to be live at READ time, not merely at classification time.
--
-- intent_score is a snapshot: api/_intent.ts applies its recency cliff once,
-- when the posts are read, and writes an integer. Nothing decays it afterwards
-- — not the RPC, not the API, and rescore-intent is a manual, dry-by-default
-- route with no cron behind it. So a row classified "stuck on AI" in September
-- would still carry 72 next June, the ranker would still lift it, and the chip
-- would still tell Krish it is a reason to call today. The comment on that chip
-- claimed this was impossible; it was not.
--
-- The gate is applied HERE rather than in each component, so the ranker, the
-- row, the sheet and any future surface cannot disagree about what "live"
-- means. One definition, one place.
--
-- A gate rather than a second decay curve, deliberately: the stored score
-- already has recency baked in, and multiplying by a fresh recency weight would
-- charge the same post for its age twice. What this removes is the claim that a
-- signal whose evidence has since aged out is still current.
CREATE OR REPLACE FUNCTION public.intent_live_score(
  p_score smallint,
  p_last_post timestamptz
) RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_score IS NULL OR p_last_post IS NULL THEN NULL
    WHEN p_last_post >= now() - interval '90 days' THEN p_score
    ELSE 0::smallint
  END;
$$;

COMMENT ON FUNCTION public.intent_live_score IS
  'intent_score, zeroed once its evidence is older than the 90-day cliff in api/_intent.ts. The single definition of "live" shared by the ranker and every UI surface.';

GRANT EXECUTE ON FUNCTION public.intent_live_score TO service_role;

-- network_search reads the score in three places; all three go through the gate.
-- Applied as a patch on the live definition rather than a fifth full
-- redefinition of a four-hundred-line function, with every anchor checked
-- before it writes.
DO $mig$
DECLARE
  d text;
BEGIN
  d := pg_get_functiondef(
    'public.network_search(text, text, text, jsonb, text[], text, text[], text[], int, int, int)'::regprocedure);

  IF position('intent_live_score' IN d) > 0 THEN
    RAISE NOTICE 'already gated; nothing to do';
    RETURN;
  END IF;

  IF position($a$+ (0.15 * (coalesce(ci.intent_score, 0)::numeric / 100))$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'actionability anchor not found';
  END IF;
  d := replace(d,
    $a$+ (0.15 * (coalesce(ci.intent_score, 0)::numeric / 100))$a$,
    $a$+ (0.15 * (coalesce(public.intent_live_score(ci.intent_score, ci.last_post_at), 0)::numeric / 100))$a$);

  IF position($b$WHEN coalesce(ci.intent_score, 0) > 0 AND ci.intent_stance = ANY(vals) THEN 1$b$ IN d) = 0 THEN
    RAISE EXCEPTION 'constraint anchor not found';
  END IF;
  d := replace(d,
    $b$WHEN coalesce(ci.intent_score, 0) > 0 AND ci.intent_stance = ANY(vals) THEN 1$b$,
    $b$WHEN coalesce(public.intent_live_score(ci.intent_score, ci.last_post_at), 0) > 0 AND ci.intent_stance = ANY(vals) THEN 1$b$);

  IF position($c$    ci.intent_score, ci.intent_stance, ci.intent_evidence, ci.intent_evidence_url,$c$ IN d) = 0 THEN
    RAISE EXCEPTION 'projection anchor not found';
  END IF;
  d := replace(d,
    $c$    ci.intent_score, ci.intent_stance, ci.intent_evidence, ci.intent_evidence_url,$c$,
    $c$    public.intent_live_score(ci.intent_score, ci.last_post_at) AS intent_score,
    ci.intent_stance, ci.intent_evidence, ci.intent_evidence_url,$c$);

  EXECUTE d;
END
$mig$;
