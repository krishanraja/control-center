import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'
import { PRODUCT_SLUGS, CREATIVE_STAGES, text, bodyId, mondayOf } from '../_growth.js'

// /api/growth/creative: the Higgsfield creative board (brief to posted).
//
//   GET    every card, newest batch first.
//   POST   add a card. batch_week defaults to the Monday that owns today, so
//          the weekly 3 to 5 script cap can actually be counted.
//   PATCH  stage transitions (drag or the arrow buttons) and the fields Krish
//          fills while producing: script, shot notes, asset_url, posted_url.
//
// Browser RLS is anon SELECT only, so every write lands here on the service
// role key.

const EDITABLE = [
  'title', 'brief', 'script', 'shot_notes', 'magic_sentence',
  'target_account', 'asset_url', 'posted_url', 'touchpoint_id', 'batch_week',
] as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, POST, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('growth_creative_queue')
      .select('*')
      .order('batch_week', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, count: (data || []).length, cards: data || [] })
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Record<string, unknown>
    const product = text(b.product_slug)
    const title = text(b.title)
    if (!product || !PRODUCT_SLUGS.has(product)) return res.status(400).json({ ok: false, error: 'product_slug invalid' })
    if (!title) return res.status(400).json({ ok: false, error: 'title is required' })
    const stage = text(b.stage) || 'brief'
    if (!CREATIVE_STAGES.has(stage)) return res.status(400).json({ ok: false, error: 'stage invalid' })

    const { data, error } = await supabase
      .from('growth_creative_queue')
      .insert({
        product_slug: product,
        title,
        stage,
        touchpoint_id: text(b.touchpoint_id),
        brief: text(b.brief),
        script: text(b.script),
        shot_notes: text(b.shot_notes),
        magic_sentence: text(b.magic_sentence),
        target_account: text(b.target_account),
        batch_week: text(b.batch_week) || mondayOf(new Date()),
        created_by: text(b.created_by) || 'krish',
      })
      .select('*')
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, card: data })
  }

  // PATCH
  const id = bodyId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  const b = (req.body || {}) as Record<string, unknown>

  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    patch[k] = text(b[k])
  }
  if (patch.title === null) return res.status(400).json({ ok: false, error: 'title cannot be blank' })
  if ('stage' in b) {
    const stage = text(b.stage)
    if (!stage || !CREATIVE_STAGES.has(stage)) return res.status(400).json({ ok: false, error: 'stage invalid' })
    patch.stage = stage
  }
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nothing to update' })
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('growth_creative_queue').update(patch).eq('id', id).select('*').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'card not found' })
  return res.json({ ok: true, card: data })
}
