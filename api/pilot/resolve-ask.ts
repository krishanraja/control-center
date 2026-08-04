import type { VercelRequest, VercelResponse } from '@vercel/node'
import { callClaude, preamble, robustJson } from '../_content.js'
import { fetchServerCandidates, FRESH_DAYS, type ServerCandidate } from '../_publishCandidates.js'

/**
 * POST /api/pilot/resolve-ask
 *
 * The strategic judgment red mode was missing: given the operator's typed
 * publish intent, decide whether anything outstanding in the queue GENUINELY
 * matches it, or say honestly that nothing does so the client can offer to
 * build it. The ask-marcus pattern: a deterministic fetch grounds one LLM
 * call, and the model only judges, it never invents. Haiku tier per MT-003,
 * this is classification, not drafting.
 *
 * Body:     { ask: string }
 * Response: { ok, verdict: 'match' | 'no_match', candidate?, reason }
 *
 * The reason sentence is shown to Krish on the card, so it must name why in
 * plain words. Any candidate index outside the fetched list is treated as
 * no_match, which keeps a hallucinated pick from ever reaching the screen.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return

  const ask = String(req.body?.ask || '').trim().slice(0, 500)
  if (!ask) return res.status(400).json({ ok: false, error: 'ask is required' })

  const candidates = await fetchServerCandidates(8)
  if (!candidates.length) {
    return res.json({
      ok: true,
      verdict: 'no_match',
      reason: 'The queue holds nothing publishable right now.',
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const list = candidates.map((c, i) => {
    const age = c.updatedAt
      ? Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 86400000)
      : null
    return [
      `${i + 1}. "${c.idea}"`,
      c.thesis ? `   thesis: ${c.thesis}` : null,
      `   lane: ${c.lane || 'unassigned'} | state: ${c.state} | quality: ${c.quality || 'unscored'} | last touched: ${age === null ? 'unknown' : `${age}d ago`}`,
    ].filter(Boolean).join('\n')
  }).join('\n')

  const system = [
    'You judge whether a content queue holds a genuine match for an operator\'s publish intent.',
    'You are strict. A genuine match serves the intent as written: if the ask wants something timely, a stale piece is not a match; if the ask names a topic, an unrelated piece is not a match.',
    `A piece last touched within ${FRESH_DAYS} days counts as fresh.`,
    'You never invent candidates. You only pick from the numbered list or declare none.',
    'Return ONLY a JSON object: { "match_index": <1-based number or null>, "reason": "<one plain sentence, shown to the operator, naming why this matches or why nothing does>" }',
    'The reason must be concrete: name the piece or the gap, never a generic apology. No em dashes.',
  ].join('\n')

  const user = `Today is ${today}.\n\nThe operator's intent, verbatim:\n"${ask}"\n\nThe queue's best candidates:\n${list}\n\nDoes anything genuinely match?`

  let verdictRaw: string
  try {
    verdictRaw = await callClaude({
      system,
      user,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 300,
      temperature: 0.2,
    })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  const parsed = robustJson(verdictRaw)
  const idx = parsed && Number.isInteger(parsed.match_index) ? parsed.match_index : null
  const reason = parsed && typeof parsed.reason === 'string' && parsed.reason.trim()
    ? parsed.reason.trim().slice(0, 300)
    : null

  const matched: ServerCandidate | null =
    idx !== null && idx >= 1 && idx <= candidates.length ? candidates[idx - 1] : null

  if (matched) {
    return res.json({
      ok: true,
      verdict: 'match',
      candidate: matched,
      reason: reason || `"${matched.idea}" is the closest fit in the queue.`,
    })
  }

  return res.json({
    ok: true,
    verdict: 'no_match',
    reason: reason || 'Nothing in the queue genuinely serves that ask.',
  })
}

export const config = { maxDuration: 60 }
