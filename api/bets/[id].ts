import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

const ALLOWED_STATUS = new Set(['live', 'won', 'lost', 'paused'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) { res.status(400).json({ error: 'id required' }); return }

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUS.has(body.status)) {
      res.status(400).json({ error: `invalid status: ${body.status}` })
      return
    }
    updates.status = body.status
    if (body.status === 'won' || body.status === 'lost') {
      updates.decided_at = body.decided_at ?? new Date().toISOString()
      if (typeof body.learning !== 'string' || !body.learning.trim()) {
        res.status(400).json({ error: 'learning required on won/lost' })
        return
      }
    }
  }
  if (typeof body.learning === 'string') updates.learning = body.learning
  if (Number.isFinite(Number(body.actual_mrr_impact_usd))) {
    updates.actual_mrr_impact_usd = Number(body.actual_mrr_impact_usd)
  }
  if (Number.isFinite(Number(body.time_box_days))) {
    updates.time_box_days = Number(body.time_box_days)
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'no_fields_to_update' })
    return
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('bets')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    res.status(500).json({ error: error?.message || 'update_failed' })
    return
  }
  res.status(200).json({ bet: data })
}
