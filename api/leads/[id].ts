import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// PATCH /api/leads/:id — update lead status / next step / why-relevant.
// Used by the Leads tab when Krish marks a lead contacted, drops it,
// or edits the next step inline.

const ALLOWED_STATUS = new Set([
  'new',
  'enriching',
  'ready',
  'contacted',
  'conversation',
  'closed_won',
  'closed_lost',
  'superseded',
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

  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUS.has(body.status)) {
      return res.status(400).json({ error: `invalid status: ${body.status}` })
    }
    updates.status = body.status
  }
  if (typeof body.next_step === 'string') updates.next_step = body.next_step
  if (typeof body.why_relevant === 'string') updates.why_relevant = body.why_relevant
  if (typeof body.assignee_agent === 'string') updates.assignee_agent = body.assignee_agent
  if (typeof body.fit_score === 'number') updates.fit_score = body.fit_score
  if (typeof body.superseded_by === 'string') updates.superseded_by = body.superseded_by

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no updatable fields supplied' })
  }

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, lead: data })
}
