import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { loadEvidence, loadPendingPromotions } from '../_autonomy.js'

// GET /api/autonomy/promotions
//
// The promotion proposals waiting on Krish (ADR-030, phase 4), for OS > Org's
// one move. Read on the service role so the surface's label comes with each
// row; the ruling itself goes through /api/suggestions/verdict.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { labels } = await loadEvidence()
    const pending = await loadPendingPromotions(undefined, labels)
    return res.json({ ok: true, pending })
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'read_failed' })
  }
}
