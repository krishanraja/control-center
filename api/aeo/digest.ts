import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'

// PATCH /api/aeo/digest  { id, n, dismissed: boolean }
//
// The one write the Growth tab makes to a digest: marking a recommendation
// dismissed (or undoing it). Everything else on the row is the engine's.
// Same unauthenticated operator posture as api/growth/council.ts.

export const config = { maxDuration: 15 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'PATCH, OPTIONS')) return
  const b = (req.body || {}) as Record<string, unknown>
  const id = typeof b.id === 'string' ? b.id : ''
  const n = Number(b.n)
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'id required' })
  if (!Number.isInteger(n) || n < 1 || n > 5) return res.status(400).json({ ok: false, error: 'n must be 1 to 5' })
  const dismissed = b.dismissed === true

  const read = await supabase.from('growth_aeo_digests').select('id, recommendations').eq('id', id).maybeSingle()
  if (read.error) return res.status(500).json({ ok: false, error: read.error.message })
  if (!read.data) return res.status(404).json({ ok: false, error: 'digest not found' })
  const recs = Array.isArray(read.data.recommendations) ? (read.data.recommendations as Array<Record<string, unknown>>) : []
  let found = false
  const next = recs.map(r => {
    if (r.n !== n) return r
    found = true
    return { ...r, dismissed_at: dismissed ? new Date().toISOString() : null }
  })
  if (!found) return res.status(404).json({ ok: false, error: 'no recommendation with that n' })

  const { data, error } = await supabase.from('growth_aeo_digests')
    .update({ recommendations: next, updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, digest: data })
}
