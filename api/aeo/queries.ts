import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'

// PATCH /api/aeo/queries  { id, status: 'watch' | 'drop' }
//
// Krish's one write to the scored query corpus: keep watching a query, or
// drop it. 'recommend' is the engine's call and cannot be set here; a
// dropped query is carried to next week's context so the engine stops
// proposing it. Same unauthenticated operator posture as api/growth/*.

export const config = { maxDuration: 15 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'PATCH, OPTIONS')) return
  const b = (req.body || {}) as Record<string, unknown>
  const id = typeof b.id === 'string' ? b.id : ''
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'id required' })
  if (b.status !== 'watch' && b.status !== 'drop') return res.status(400).json({ ok: false, error: 'status must be watch or drop' })
  const { data, error } = await supabase.from('growth_aeo_queries').update({ status: b.status }).eq('id', id).select('*').maybeSingle()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'query not found' })
  return res.json({ ok: true, query: data })
}
