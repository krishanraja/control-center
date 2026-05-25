import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// GET /api/visibility-targets/:id  — fetch a single target (any column).
// PATCH /api/visibility-targets/:id — update notes / next_actions / status fields.

const ALLOWED_STATUS = new Set(['proposed', 'applied', 'accepted', 'rejected', 'dropped'])
const ALLOWED_FIELDS = new Set([
  'status', 'angle', 'risk_notes', 'strategic_value', 'next_actions',
  'source_url', 'applied_at', 'rejected_at',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('visibility_targets')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return res.status(404).json({ ok: false, error: error.message })
    return res.json({ ok: true, target: data })
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(k)) continue
      if (k === 'status' && typeof v === 'string' && !ALLOWED_STATUS.has(v)) {
        return res.status(400).json({ ok: false, error: `invalid status: ${v}` })
      }
      updates[k] = v
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'no updatable fields supplied' })
    }
    const { data, error } = await supabase
      .from('visibility_targets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, target: data })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
