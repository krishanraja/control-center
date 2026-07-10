import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/customers/:id/outreach — stamp needs_outreach_at (service role).
//
// The mobile "Mark for outreach" action used to write `customers` with the
// anon client, which RLS silently no-ops (0 rows matched, no error): the
// button flashed success while nothing persisted. Wave-2 review fix.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = ((req.query.id || '') as string).trim()
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const clear = Boolean((req.body || {}).clear)
  const { error, data } = await supabase
    .from('customers')
    .update({ needs_outreach_at: clear ? null : new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data?.length) return res.status(404).json({ ok: false, error: 'customer not found' })
  return res.json({ ok: true, cleared: clear })
}
