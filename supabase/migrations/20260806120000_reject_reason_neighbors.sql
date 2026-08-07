-- Predicted reject reasons for the Content Engine v2 weekly queue.
--
-- Krish's reject history is lopsided in a way that says the static chip list
-- was the problem: content_thin 143 uses, then content_other 48. Forty-eight
-- times the list did not contain what he meant. Leading with the reasons he
-- actually used on the cards most like this one is the fix.
--
-- The obvious implementation does not work, and it is worth saying why.
-- Joining feedback_queue back to content_ideas to get the rejected item's
-- embedding returns ZERO rows against live data: the Monday purge hard-deletes
-- news-horizon ideas, so every historical reject points at a row that no
-- longer exists. The reason codes outlived the things they described.
--
-- So the signal stops being a pointer and becomes a copy. Each reject carries
-- its own embedding, written at reject time, and survives the purge that
-- removes the original. The history tier therefore starts empty and fills as
-- Krish uses it, with the model tier carrying predictions until it does.

ALTER TABLE public.feedback_queue
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

COMMENT ON COLUMN public.feedback_queue.embedding IS
  'Embedding of the rejected item''s text, captured at reject time so the taste signal survives the purge of the item itself.';

-- No vector index yet, deliberately. At a few hundred rows a sequential scan
-- is faster than an index probe, and an ivfflat/hnsw index built on a nearly
-- empty table produces bad recall. Add one when this passes a few thousand.

-- ── reject_reason_neighbors RPC ─────────────────────────────────────────────
-- The k nearest previously-rejected items for a query vector, with the reason
-- code each was rejected for. pgvector's operators are not exposed through the
-- auto-API, which is why this is an RPC (same reason as dedup_nearest).
-- No dynamic SQL: the vector is the only caller input and it is cast, never
-- interpolated.
CREATE OR REPLACE FUNCTION public.reject_reason_neighbors(
  p_vector    text,
  p_threshold float8 DEFAULT 0.70,
  p_limit     int    DEFAULT 12
) RETURNS TABLE (reason_code text, similarity float8, sample text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.reason_code,
         1 - (f.embedding <=> p_vector::vector) AS similarity,
         left(coalesce(f.meta->>'title', ''), 120) AS sample
  FROM public.feedback_queue f
  WHERE f.vote = -1
    AND f.reason_code IS NOT NULL
    -- '..._other' is the absence of a reason, so it can never be a prediction.
    AND f.reason_code NOT LIKE '%\_other'
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> p_vector::vector) >= p_threshold
  ORDER BY f.embedding <=> p_vector::vector
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.reject_reason_neighbors(text, float8, int) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_reason_neighbors(text, float8, int) TO service_role;

COMMENT ON FUNCTION public.reject_reason_neighbors IS
  'k nearest previously-rejected items for a query vector, with the reason code each was rejected for. Powers the predicted reason chips on the weekly decision queue.';
