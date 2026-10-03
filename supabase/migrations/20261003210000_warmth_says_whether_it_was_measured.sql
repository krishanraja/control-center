-- Warmth now says whether it was measured or guessed, and a guess cannot
-- outrank a real relationship.
--
-- The 2026-10-03 mail and calendar sync gave 1,712 contacts a warmth computed
-- from evidence: who writes back, how recently, how often, how many meetings.
-- The other 8,943 kept the warmth an LLM import assigned them in
-- `scripts/network/import-intelligence.ts`, which never saw a mailbox.
--
-- Ranked against each other they are not comparable, and the guesses won:
-- 495 unmeasured contacts carried warmth >= 50 against 85 measured ones, and
-- warmth is 0.30 of the relationship term in network_search. Adam Goodman sat
-- at 100 with no mail, no meeting and no evidence of any kind, above people
-- Krish writes to every week. That is the ranking complaint this workstream
-- started from, still alive in a column nobody had re-read.
--
-- Deleting the guesses would be worse than keeping them. A contact with no
-- mail is often a real relationship held somewhere the sync cannot see:
-- LinkedIn, a phone, a room. So the guess is kept whole in warmth_claimed,
-- labelled in warmth_source, and the warmth that gets ranked is capped at 50
-- while it is unmeasured: enough to stay ahead of a cold contact, never
-- enough to claim a closeness nothing supports.
--
-- The cap lives in the DATA, not in network_search, and that is deliberate.
-- Patching the function is the natural way to express it and it cannot be
-- done from here: network_search carries `SET "hnsw.ef_search" TO '120'`, and
-- recreating it needs a role allowed to set that parameter, which neither the
-- migration role nor the service role is. Capping the stored value needs no
-- such right and gives every reader the same answer, at the cost of one
-- invariant to hold: anything that writes an unmeasured warmth must cap it
-- too. `scripts/network/import-intelligence.ts` is the only such writer and
-- does.
--
-- refresh_relationship_rollup() is patched by replacing exact fragments of
-- the live definition rather than restated here. An earlier draft of this
-- migration rewrote it from memory and differed from the live one in four
-- ways: it joined on lower(c.email) instead of c.email_normalized, dropped
-- the channel filters that keep a calendar row out of the mail counts,
-- measured recency from the wrong column, and rounded differently. Each would
-- have silently changed every warmth in the table. The patch refuses if its
-- fragments have moved.

ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS warmth_source text;

ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS warmth_claimed smallint;

COMMENT ON COLUMN public.contact_intelligence.warmth_source IS
  'measured = computed by refresh_relationship_rollup() from mail and calendar evidence; inferred = assigned at import with no evidence. NULL means never scored.';

COMMENT ON COLUMN public.contact_intelligence.warmth_claimed IS
  'The warmth an import asserted with no evidence, kept whole. contact_intelligence.warmth carries the same number capped at 50 while warmth_source is inferred, so a guess cannot outrank a measured relationship.';

-- Label what the sync has already measured, joining exactly as the rollup does.
UPDATE public.contact_intelligence ci SET warmth_source = 'measured'
FROM public.contacts c
WHERE c.id = ci.contact_id
  AND ci.warmth_source IS DISTINCT FROM 'measured'
  AND EXISTS (SELECT 1 FROM public.correspondent_stats cs WHERE cs.email_normalized = c.email_normalized);

UPDATE public.contact_intelligence
SET warmth_source = 'inferred'
WHERE warmth_source IS NULL AND warmth IS NOT NULL;

-- Keep the claim, rank the capped number.
UPDATE public.contact_intelligence
SET warmth_claimed = warmth, warmth = least(warmth, 50)
WHERE warmth_source = 'inferred' AND warmth IS NOT NULL AND warmth_claimed IS NULL;

-- The rollup owns the label from here: anything it scores is measured, and a
-- measured warmth is written whole.
DO $do$
DECLARE
  def text := pg_get_functiondef('public.refresh_relationship_rollup()'::regprocedure);
  old_set text := 'warmth = sc.warmth';
  new_set text := 'warmth = sc.warmth,' || chr(10) || '      warmth_source = ''measured''';
  old_when text := 'AND (ci.warmth IS DISTINCT FROM sc.warmth';
  new_when text := 'AND (ci.warmth IS DISTINCT FROM sc.warmth OR ci.warmth_source IS DISTINCT FROM ''measured''';
BEGIN
  IF position('warmth_source' IN def) > 0 THEN
    RETURN;  -- already patched
  END IF;
  IF position(old_set IN def) = 0 OR position(old_when IN def) = 0 THEN
    RAISE EXCEPTION 'refresh_relationship_rollup() no longer contains the fragments this migration rewrites; read the live function and update this migration';
  END IF;
  EXECUTE replace(replace(def, old_set, new_set), old_when, new_when);
END
$do$;
