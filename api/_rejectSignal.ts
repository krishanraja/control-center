import { supabase } from './_supabase.js'
import { embed, vectorLiteral } from './_embeddings.js'

// A reject is only worth as much as what survives of it.
//
// Historically a feedback_queue row was a pointer: reason code plus a
// source_id. That loses to the Monday purge, which hard-deletes news-horizon
// content_ideas. Checked against live data, ZERO of 320 coded rejects still
// resolve to a row that exists, so the reason codes outlived every item they
// described and nothing can be learned from them by similarity.
//
// This writes the signal as a COPY instead: the rejected item's own text and
// its embedding, stored on the feedback row itself. It survives the purge, and
// it is what api/content-decisions/[id]/likely-reasons.ts searches to predict
// why Krish would bin the next thing that looks like it.
//
// Strictly best-effort, and deliberately AFTER the feedback row is committed.
// The ruling is already made by the time this runs; enriching it must never be
// able to fail the thing it is enriching, and a missing column (migration not
// yet applied) must degrade to "no prediction data" rather than a broken bin.

export async function attachRejectSignal(
  feedbackId: string | null | undefined,
  title: string | null | undefined,
  text?: string | null,
): Promise<boolean> {
  if (!feedbackId) return false
  const t = (title || '').trim()
  const b = (text || '').trim()
  if (!t && !b) return false

  try {
    const patch: Record<string, unknown> = {}

    // The text is worth keeping even when embedding is unavailable: it makes
    // the row readable, and it can be embedded in a later backfill.
    const { data: row } = await supabase
      .from('feedback_queue').select('meta').eq('id', feedbackId).single()
    const meta = (row?.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<string, unknown>
    patch.meta = { ...meta, title: t.slice(0, 300), text: b.slice(0, 1200) }

    if (process.env.OPENAI_API_KEY) {
      const vec = await embed({ title: t || null, body: b || null })
      if (vec) patch.embedding = vectorLiteral(vec)
    }

    const { error } = await supabase.from('feedback_queue').update(patch).eq('id', feedbackId)
    if (!error) return true

    // Most likely cause: the embedding column does not exist yet. Retry with
    // the text alone so the reject still leaves something behind.
    if (patch.embedding) {
      const { error: retryErr } = await supabase
        .from('feedback_queue').update({ meta: patch.meta }).eq('id', feedbackId)
      return !retryErr
    }
    return false
  } catch {
    return false
  }
}
