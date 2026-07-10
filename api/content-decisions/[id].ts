import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble, pathId } from '../_content.js'

// PATCH /api/content-decisions/:id   body: { action: 'done'|'dismiss', note? }
//
// Generic resolver for the weekly queue (spec §5). Shift rulings go through
// /api/shifts/:id (which resolves its own card); this endpoint handles the
// rest. A graduation resolved with 'done' stamps the idea into the Library
// (library_at + horizon=evergreen) so the purge can never touch it (fate 3).

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'PATCH, OPTIONS')) return
  if (req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'PATCH only' })
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { action?: string; note?: string }
  if (!b.action || !['done', 'dismiss'].includes(b.action)) {
    return res.status(400).json({ ok: false, error: 'action must be done or dismiss' })
  }

  const { data: decision, error } = await supabase.from('content_decisions').select('*').eq('id', id).single()
  if (error || !decision) return res.status(404).json({ ok: false, error: 'decision not found' })
  if (decision.status !== 'pending') return res.status(409).json({ ok: false, error: `already ${decision.status}` })

  const nowIso = new Date().toISOString()
  const resolution = { action: b.action, at: nowIso, note: b.note || null }

  if (decision.kind === 'graduation' && b.action === 'done' && decision.ref) {
    await supabase.from('content_ideas')
      .update({ library_at: nowIso, horizon: 'evergreen', expires_at: null })
      .eq('id', decision.ref)
  }

  const { error: upErr } = await supabase.from('content_decisions')
    .update({ status: b.action === 'done' ? 'done' : 'dismissed', resolved_at: nowIso, resolution })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  return res.json({ ok: true, kind: decision.kind, action: b.action })
}
