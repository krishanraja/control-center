import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { preamble, pathId, callClaude, loadVoiceBlock, robustJson } from '../../_content.js'
import { embed, vectorLiteral } from '../../_embeddings.js'
import { JUDGE_MODEL } from '../../_models.js'

// GET /api/content-decisions/:id/likely-reasons
//
// "Why would Krish probably bin this?", answered before he has to think about
// it. The weekly queue's chip list was static and identically ordered every
// time, and his history says that was the real problem: content_thin 143 uses,
// then content_other 48. Forty-eight times the list did not hold what he meant.
//
// Two tiers, in the order Krish asked for:
//   1. HISTORY. Embed this card, find the nearest items he has actually
//      rejected before, and return the reason codes he used on them, weighted
//      by similarity. Evidence, not a guess.
//   2. MODEL. When the history has nothing close enough (a genuinely new
//      subject, or too few rejects to be evidence), Haiku names the likeliest
//      objections against his voice block.
// Neither is load-bearing: the caller always has the full static set, so an
// empty answer costs nothing but a missing shortcut.

// Predictions are advisory chips, so a stale one is cheap and a slow one is
// expensive. Cache briefly at the edge; the deck prefetches per card anyway.
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600'

const SIM_THRESHOLD = 0.70
const NEIGHBOURS = 12
const MAX_PREDICTED = 3

/** Codes the model is allowed to return. Anything else is dropped rather than
 *  invented into the taxonomy: /api/feedback clusters on exact codes. */
const PREDICTABLE = [
  'content_wrong_topic', 'content_wrong_angle', 'content_already_covered',
  'content_old_news', 'content_too_generic', 'content_not_my_voice',
  'content_bad_timing', 'content_thin', 'content_too_technical',
  'content_off_vertical', 'content_too_negative', 'content_too_promotional',
]

function cardText(decision: Record<string, any>): { title: string; body: string } {
  const p = (decision.payload || {}) as Record<string, any>
  const title = String(p.title || p.anchor_headline || '').trim()
  const body = [p.summary, p.thesis, p.why, p.meaning]
    .filter(v => typeof v === 'string' && v.trim())
    .join('\n')
    .slice(0, 1200)
  return { title, body }
}

/** Tier 1: what he actually rejected on the cards most like this one. */
async function fromHistory(title: string, body: string) {
  if (!process.env.OPENAI_API_KEY) return null
  const vec = await embed({ title: title || null, body: body || null })
  if (!vec) return null

  const { data, error } = await supabase.rpc('reject_reason_neighbors', {
    p_vector: vectorLiteral(vec),
    p_threshold: SIM_THRESHOLD,
    p_limit: NEIGHBOURS,
  })
  // The RPC ships in a migration. Until it is applied the call errors, and
  // that must degrade to the model tier rather than 500 a chip bar.
  if (error || !Array.isArray(data) || !data.length) return null

  // Weight by similarity, not raw count, so one very close match outranks a
  // handful of loosely related ones.
  const score = new Map<string, { weight: number; n: number; best: number; sample: string }>()
  for (const row of data as Array<{ reason_code: string; similarity: number; sample: string }>) {
    if (!row?.reason_code || typeof row.similarity !== 'number') continue
    const cur = score.get(row.reason_code) || { weight: 0, n: 0, best: 0, sample: '' }
    cur.weight += row.similarity
    cur.n += 1
    if (row.similarity > cur.best) { cur.best = row.similarity; cur.sample = row.sample || '' }
    score.set(row.reason_code, cur)
  }
  if (!score.size) return null

  const reasons = [...score.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, MAX_PREDICTED)
    .map(([code, s]) => ({
      code,
      confidence: s.best >= 0.82 ? 'high' : s.best >= 0.75 ? 'medium' : 'low',
      because: `You binned ${s.n} similar item${s.n === 1 ? '' : 's'} for this`,
    }))

  return { source: 'history' as const, reasons }
}

/** Tier 2: no close precedent, so reason about this card against his voice. */
async function fromModel(title: string, body: string) {
  if (!title && !body) return null
  let voice = ''
  try { voice = await loadVoiceBlock() } catch { /* optional grounding */ }

  const system = [
    'You predict why Krish would REJECT a piece of proposed content. You are not judging quality, you are guessing his taste.',
    voice ? `KRISH'S VOICE AND STANDARDS:\n${voice}` : '',
    `Choose at most 2 codes from this exact list: ${PREDICTABLE.join(', ')}.`,
    'Only include a code you would genuinely bet on. Returning an empty list is correct when nothing stands out, and is better than a weak guess.',
    'Reply ONLY with JSON: {"reasons":[{"code":"...","because":"<max 8 words, second person, no em dashes>"}]}',
  ].filter(Boolean).join('\n\n')

  const raw = await callClaude({
    model: JUDGE_MODEL,
    maxTokens: 300,
    temperature: 0,
    system,
    user: JSON.stringify({ title, body }),
  })
  const parsed = robustJson(raw)
  const list = Array.isArray(parsed?.reasons) ? parsed.reasons : []
  const reasons = list
    .filter((r: any) => r && PREDICTABLE.includes(r.code))
    .slice(0, 2)
    .map((r: any) => ({
      code: String(r.code),
      confidence: 'low' as const,
      because: String(r.because || '').slice(0, 60) || 'Likely objection',
    }))

  return reasons.length ? { source: 'model' as const, reasons } : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, OPTIONS')) return
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' })
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data: decision, error } = await supabase
    .from('content_decisions').select('id, kind, payload').eq('id', id).single()
  if (error || !decision) return res.status(404).json({ ok: false, error: 'decision not found' })

  const { title, body } = cardText(decision as Record<string, any>)

  // A prediction is a shortcut, never a gate. Any failure returns an empty
  // list and the bar shows its full static set, which is the old behaviour.
  let out: { source: 'history' | 'model'; reasons: unknown[] } | null = null
  try {
    out = await fromHistory(title, body)
    if (!out) out = await fromModel(title, body)
  } catch {
    out = null
  }

  res.setHeader('Cache-Control', CACHE)
  return res.json({ ok: true, source: out?.source || 'none', reasons: out?.reasons || [] })
}
