import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/concepts/:id/close
// Thin wrapper over the close_concept(p_concept_id, p_reason, p_decided_by) RPC
// (see MINDMAKE_OS_ARCHITECTURE §4.8 / §4.10). Records a durable
// concept_decisions row and cascades terminal status across every tagged row
// (tasks → superseded, leads → closed_lost), emitting status_change_log +
// audit_log entries. Idempotent: re-closing a concept is safe.
//
// Body: { reason?: string, decided_by?: string }
// Response: { ok, concept_id, tasks_closed, leads_closed, decided_at }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const idParam = req.query?.id
  const conceptId = Array.isArray(idParam) ? idParam[0] : idParam
  if (!conceptId) return res.status(400).json({ ok: false, error: 'concept id is required' })

  const body = (req.body || {}) as { reason?: string; decided_by?: string }
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : 'Closed from Control Center'
  const decidedBy = typeof body.decided_by === 'string' && body.decided_by.trim()
    ? body.decided_by.trim()
    : 'krish'

  const { data, error } = await supabase.rpc('close_concept', {
    p_concept_id: conceptId,
    p_reason: reason,
    p_decided_by: decidedBy,
  })

  if (error) return res.status(500).json({ ok: false, error: error.message })

  // close_concept returns its own jsonb { ok, concept_id, tasks_closed, ... }.
  return res.status(200).json(data ?? { ok: true, concept_id: conceptId })
}
