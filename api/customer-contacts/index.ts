import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

const ALLOWED_REASON  = new Set(['welcome','check_in','expansion','save','exit_interview','other'])
const ALLOWED_CHANNEL = new Set(['email','call','video','message','in_person'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }

  const body = (req.body ?? {}) as Record<string, unknown>
  const customer_id = typeof body.customer_id === 'string' ? body.customer_id : ''
  const summary     = typeof body.summary === 'string' ? body.summary.trim() : ''
  if (!customer_id) { res.status(400).json({ error: 'customer_id required' }); return }
  if (!summary)     { res.status(400).json({ error: 'summary required' });     return }

  const reason  = typeof body.reason  === 'string' && ALLOWED_REASON.has(body.reason)   ? body.reason  : 'other'
  const channel = typeof body.channel === 'string' && ALLOWED_CHANNEL.has(body.channel) ? body.channel : null
  const agent   = typeof body.agent   === 'string' ? body.agent : 'krish'
  const next_step = typeof body.next_step === 'string' ? body.next_step : null

  const { data, error } = await supabase
    .from('customer_contacts')
    .insert({
      customer_id, summary, reason, channel, agent, next_step,
      contacted_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) { res.status(500).json({ error: error?.message || 'insert_failed' }); return }
  res.status(200).json({ contact: data })
}
