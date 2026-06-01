import type { VercelRequest, VercelResponse } from '@vercel/node'

// POST /api/objectives/propose-milestones
// body: { goal_id, mode?: 'propose' | 'recalibrate', krish_context?: string }
// Proxies to the Phase 3 n8n workflow webhook. Awaits the response so the
// UI's spinner clears when Marcus's proposals have landed.
//
//   mode='propose'      (default) draft a milestone sequence if none exist.
//   mode='recalibrate'  the objective's shape changed (Krish reworded/re-leveled
//                        it, often by voice) -- supersede stale proposed
//                        milestones and regenerate from the new shape.
//   krish_context       free-text Krish input (e.g. the transcript of his
//                        narration) so Marcus proposes WITH his steer instead of
//                        from goal_id alone. Closes the "goal_id only" gap.

const N8N_WEBHOOK = 'https://krishraja10101.app.n8n.cloud/webhook/propose-milestones'

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as { goal_id?: string; mode?: string; krish_context?: string }
  if (!body.goal_id || typeof body.goal_id !== 'string') {
    return res.status(400).json({ ok: false, error: 'goal_id required' })
  }
  const mode = body.mode === 'recalibrate' ? 'recalibrate' : 'propose'
  const krish_context = typeof body.krish_context === 'string'
    ? body.krish_context.trim().slice(0, 4000) || null
    : null

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort('proposer_timeout'), 120_000)
  try {
    const r = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_id: body.goal_id, mode, krish_context }),
      signal: ctrl.signal,
    })
    const payload = await r.json().catch(() => ({}))
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `proposer ${r.status}`, payload })
    }
    return res.json(payload)
  } catch (e) {
    return res.status(504).json({ ok: false, error: (e as Error).message || 'proposer_error' })
  } finally {
    clearTimeout(tid)
  }
}
