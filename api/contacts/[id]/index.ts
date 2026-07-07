import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// PATCH /api/contacts/:id — light edits from the Network detail sheet.
// Primary use: reassign a contact's venture (e.g. a recorded Signal & Noise
// guest who's actually a better fit for another venture).

const KNOWN_VENTURES = new Set([
  'mindmaker', 'meliora', 'adfixus', 'signal_noise', 'builder_economy', 'fractionl_pulse', 'investor',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ error: 'id is required' })

  const body = (req.body || {}) as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if ('primary_venture' in body) {
    const v = body.primary_venture
    if (v === null) updates.primary_venture = null
    else if (typeof v === 'string' && KNOWN_VENTURES.has(v)) updates.primary_venture = v
    else return res.status(400).json({ error: `invalid primary_venture: ${String(v)}` })
  }
  if (typeof body.notes === 'string') updates.notes = body.notes

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no updatable fields supplied' })
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, contact: data })
}
