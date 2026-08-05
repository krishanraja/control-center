import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'
import { text, bodyId } from '../_growth.js'

// /api/growth/council: the weekly growth council reviews.
//
//   GET    reviews, newest week first.
//   PATCH  record Krish's ruling into krish_decision and stamp decided_at.
//          Clearing the decision (empty string) also clears decided_at, so the
//          "decided" badge can never outlive the decision text.
//
// Reviews themselves are written by the council workflow with the service role.
// This route only carries the human ruling.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('growth_council_reviews')
      .select('*')
      .order('week_start', { ascending: false })
      .order('product_slug', { ascending: true })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, count: (data || []).length, reviews: data || [] })
  }

  // PATCH
  const id = bodyId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  const b = (req.body || {}) as Record<string, unknown>
  if (!('krish_decision' in b)) return res.status(400).json({ ok: false, error: 'krish_decision required' })
  const decision = text(b.krish_decision)

  const { data, error } = await supabase
    .from('growth_council_reviews')
    .update({ krish_decision: decision, decided_at: decision ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'review not found' })
  return res.json({ ok: true, review: data })
}
