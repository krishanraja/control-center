import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/objectives/:id/milestones
// body: { title, description?, sequence?, est_deep_work_hours? }
// Inserts one Krish-authored milestone for the given objective.
// source=krish_authored, status=accepted, accepted_at=now().
//
// For Marcus-proposed sequences, use /api/objectives/propose-milestones
// instead (which fires the n8n workflow).

interface CreateBody {
  title?: string
  description?: string | null
  sequence?: number
  est_deep_work_hours?: number | null
  concept_id?: string | null
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const goalId = typeof req.query.id === 'string' ? req.query.id : ''
  if (!goalId) return res.status(400).json({ ok: false, error: 'objective id required' })

  const body = (req.body || {}) as CreateBody
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return res.status(400).json({ ok: false, error: 'title required' })
  }

  let sequence = typeof body.sequence === 'number' && body.sequence > 0 ? body.sequence : null
  if (sequence === null) {
    const { data: existing } = await supabase
      .from('milestones')
      .select('sequence')
      .eq('goal_id', goalId)
      .order('sequence', { ascending: false })
      .limit(1)
    const top = Array.isArray(existing) && existing.length > 0 ? Number(existing[0].sequence || 0) : 0
    sequence = top + 1
  }

  const now = new Date().toISOString()
  const row = {
    goal_id: goalId,
    title: body.title.trim().slice(0, 200),
    description: (body.description || '').trim().slice(0, 2000) || null,
    sequence,
    status: 'accepted',
    source: 'krish_authored',
    est_deep_work_hours: typeof body.est_deep_work_hours === 'number' ? body.est_deep_work_hours : null,
    accepted_at: now,
    proposed_at: now,
    concept_id: body.concept_id || null,
  }

  const { data, error } = await supabase
    .from('milestones')
    .insert(row)
    .select()
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, milestone: data })
}
