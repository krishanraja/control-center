import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadRevenue } from '../_revenue.js'

// GET /api/revenue
//
// revenue_events and revenue_subscriptions are service-role only, so the
// browser cannot read them directly. This is the read path, matching how
// fleet_revenue_by_campaign is already exposed via api/fleet-funnel.ts.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' })
  try {
    return res.json({ ok: true, ...(await loadRevenue()) })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'revenue read failed' })
  }
}
