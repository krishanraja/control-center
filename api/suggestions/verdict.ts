import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { validateVerdict, recordVerdict, STRATEGIST_SURFACES, type VerdictInput } from '../_suggestions.js'

/**
 * POST /api/suggestions/verdict
 *
 * Krish's response to one thing the strategist proposed, written to the
 * learning bank (suggestion_verdicts). Taking an item unchanged is accepted,
 * taking it after an edit is tweaked, "Not this" is rejected with a reason.
 * The gap between what was proposed and what he did is what teaches.
 *
 * Body: { suggestion_id, verdict, final?, delta?, reason_code?, note? }
 *
 * Rules on the strategist's surfaces only (STRATEGIST_SURFACES). The content
 * engine's suggestions are the engine's to judge, from its own repository, so
 * a verdict on one of those is refused with 403 rather than written here.
 *
 * The actor is not taken from the body: the server says who ruled. The round
 * and seconds_to_verdict are computed server-side from the suggestion itself.
 *
 * Best effort from the client's side: every action on the strategist sheet
 * does its real work first (a goal through the gate, today's ask, a slot) and
 * posts its verdict after. A verdict that fails never undoes that work.
 *
 * Guarded: middleware.ts does not gate /api/*, and the bank's strategist rows
 * name warm contacts.
 */

/** A verdict's final value is his edited wording, not a document. */
const FINAL_MAX_CHARS = 20_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const v: VerdictInput = {
    suggestion_id: typeof b.suggestion_id === 'string' ? b.suggestion_id.trim() : '',
    verdict: typeof b.verdict === 'string' ? b.verdict : '',
    final: b.final ?? null,
    delta: (b.delta ?? null) as VerdictInput['delta'],
    reason_code: typeof b.reason_code === 'string' && b.reason_code.trim() ? b.reason_code.trim() : null,
    note: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null,
  }

  const problem = validateVerdict(v)
  if (problem) return res.status(400).json({ ok: false, error: problem })
  if (v.final != null && JSON.stringify(v.final).length > FINAL_MAX_CHARS) {
    return res.status(400).json({ ok: false, error: 'final_too_large' })
  }

  const r = await recordVerdict(v, STRATEGIST_SURFACES)
  if (r.ok === false) return res.status(r.status).json({ ok: false, error: r.reason })
  return res.status(201).json({ ok: true, id: r.id, round: r.round })
}
