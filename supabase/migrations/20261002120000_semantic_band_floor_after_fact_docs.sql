-- The semantic band's floor moves from 0.30 to 0.37. The ceiling stays 0.62.
--
-- network_search rescales cosine onto [floor, ceiling] before it becomes
-- s_semantic. Both numbers were measured on the OLD retrieval text, which was
-- mostly the model's judgment of a person. 20260927160000 rebuilt that text
-- from facts and every row was re-embedded, so the band was re-measured on
-- 2026-10-02 with real query vectors against the full table:
--
--   real questions     top matches reach ~0.62, the network median sits ~0.28
--   nonsense           "purple monkey dishwasher" peaks at 0.364, on records
--                      that hold only a name (no title, no company): a bare
--                      name sits close to everything in embedding space
--
-- With the floor at 0.30 that nonsense query scored query_relevance 0.137,
-- above the 0.10 WEAK_RELEVANCE line in api/_networkSearch.ts, so the UI
-- presented name-only rows as matches instead of saying nothing matched. At
-- 0.37 it scores 0.036 and is flagged. Real questions kept their order and
-- their top relevance stayed above 0.67 (founders + AI agents, retail media,
-- senior data leaders at banks), so nothing real tips into "weak".
--
-- public.cosine_probe() samples 2,500 rows, so its max under-reads the true
-- ceiling. Measure the ceiling through network_search's own candidates.
--
-- Applied as a text substitution on the live definition so this migration
-- cannot silently revert anything else in the function; it refuses if the
-- expression it is replacing is not there.

SELECT '[1,2,3]'::vector IS NOT NULL AS pgvector_loaded;
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.network_search(text,text,text,jsonb,text[],text,text[],text[],integer,integer,integer)'::regprocedure);
  IF position('- 0.30) / 0.32)' in d) = 0 THEN
    RAISE EXCEPTION 'semantic band expression not found; refusing to guess';
  END IF;
  d := replace(d, '- 0.30) / 0.32)', '- 0.37) / 0.25)');
  EXECUTE d;
END
$mig$;
