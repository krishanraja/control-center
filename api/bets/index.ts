import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

const ALLOWED_KIND = new Set(['content','outreach','product','pricing','partnership','other'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.status(200).json({ bets: data || [] })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const hypothesis        = typeof body.hypothesis === 'string'        ? body.hypothesis.trim()        : ''
  const success_criterion = typeof body.success_criterion === 'string' ? body.success_criterion.trim() : ''
  const kind              = typeof body.kind === 'string' && ALLOWED_KIND.has(body.kind) ? body.kind : 'other'
  const time_box_days     = Number.isFinite(Number(body.time_box_days)) ? Number(body.time_box_days) : 14
  const agent_owner       = typeof body.agent_owner === 'string' ? body.agent_owner : null
  const est_mrr           = Number.isFinite(Number(body.est_mrr_impact_usd)) ? Number(body.est_mrr_impact_usd) : null
  const replaces_bet_id   = typeof body.replaces_bet_id === 'string' ? body.replaces_bet_id : null

  if (!hypothesis || !success_criterion) {
    res.status(400).json({ error: 'hypothesis and success_criterion required' })
    return
  }

  const { data, error } = await supabase
    .from('bets')
    .insert({
      hypothesis, success_criterion, kind, time_box_days,
      agent_owner, est_mrr_impact_usd: est_mrr, replaces_bet_id,
      status: 'live',
    })
    .select('*')
    .single()
  if (error || !data) {
    res.status(500).json({ error: error?.message || 'insert_failed' })
    return
  }

  // If this bet replaces another live bet, pause the replaced bet.
  if (replaces_bet_id) {
    await supabase
      .from('bets')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', replaces_bet_id)
      .eq('status', 'live')
  }

  res.status(200).json({ bet: data })
}
