import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadSpend } from '../_spend.js'

// GET /api/spend
//
// spend_invoices and service_registry are service-role only, so the browser
// cannot read them directly. This is the read path, the money-out twin of
// GET /api/revenue: one computed summary, no env var names, no secrets.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' })
  try {
    return res.json({ ok: true, ...(await loadSpend()) })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'spend read failed' })
  }
}
