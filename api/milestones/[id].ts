import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// PATCH  /api/milestones/:id   accept / tweak / complete / reorder
//   body: { action: 'accept' | 'tweak' | 'complete' | 'reorder',
//           title?, description?, sequence?, est_deep_work_hours? }
//   accept   -> status=accepted, accepted_at=now, source preserved
//   tweak    -> patch title/description (and optional fields), source=krish_tweaked
//   complete -> status=done, completed_at=now
//   reorder  -> sequence=N (no source change)
//
// DELETE /api/milestones/:id   reject (drop)
//   body: { reason_text? }
//   Sets status=dropped + writes feedback_queue row with
//   reason_code=marcus_milestone_override (the milestone altitude).

interface PatchBody {
  action?: 'accept' | 'tweak' | 'complete' | 'reorder'
  title?: string
  description?: string | null
  sequence?: number
  est_deep_work_hours?: number | null
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as PatchBody
    const action = body.action
    if (!action || !['accept', 'tweak', 'complete', 'reorder'].includes(action)) {
      return res.status(400).json({ ok: false, error: "action must be 'accept' | 'tweak' | 'complete' | 'reorder'" })
    }
    const patch: Record<string, unknown> = {}
    const now = new Date().toISOString()
    if (action === 'accept') {
      patch.status = 'accepted'
      patch.accepted_at = now
    } else if (action === 'complete') {
      patch.status = 'done'
      patch.completed_at = now
    } else if (action === 'tweak') {
      if (typeof body.title === 'string' && body.title.trim()) {
        patch.title = body.title.trim().slice(0, 200)
      }
      if (typeof body.description === 'string') {
        patch.description = body.description.trim().slice(0, 2000) || null
      }
      if (typeof body.est_deep_work_hours === 'number') {
        patch.est_deep_work_hours = body.est_deep_work_hours
      }
      if (typeof body.sequence === 'number' && body.sequence > 0) {
        patch.sequence = body.sequence
      }
      patch.source = 'krish_tweaked'
    } else if (action === 'reorder') {
      if (typeof body.sequence !== 'number' || body.sequence < 1) {
        return res.status(400).json({ ok: false, error: 'sequence must be a positive integer' })
      }
      patch.sequence = body.sequence
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'no fields to patch' })
    }

    const { data, error } = await supabase
      .from('milestones')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, milestone: data })
  }

  if (req.method === 'DELETE') {
    const body = (req.body || {}) as { reason_text?: string | null }
    const reasonText = (body.reason_text || '').trim().slice(0, 2000) || null

    const { data, error } = await supabase
      .from('milestones')
      .update({ status: 'dropped' })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    if (!data) return res.status(404).json({ ok: false, error: 'milestone not found' })

    await supabase.from('feedback_queue').insert({
      source_table: 'milestones',
      source_id: id,
      agent_id: 'marcus',
      original_agent: 'marcus',
      original_item_id: id,
      vote: -1,
      reason_code: 'marcus_milestone_override',
      reason_text: reasonText,
      meta: {
        goal_id: data.goal_id,
        title: data.title,
        sequence: data.sequence,
        source: data.source,
        captured_at: new Date().toISOString(),
      },
      status: 'pending',
    })

    return res.json({ ok: true, milestone: data })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
