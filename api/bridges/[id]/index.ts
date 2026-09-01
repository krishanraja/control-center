import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { supabase } from '../../_supabase.js'

export const config = { maxDuration: 30 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_FIELDS = new Set(['state', 'draft_ask'])
const ALLOWED_STATE = new Set(['proposed', 'reached_out', 'snoozed', 'not_a_path'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['PATCH'])) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!UUID.test(id)) {
    return res.status(400).json({ ok: false, error: 'invalid_id' })
  }

  const body = (req.body || {}) as Record<string, unknown>
  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue
    if (k === 'state') {
      if (typeof v !== 'string' || !ALLOWED_STATE.has(v)) {
        return res.status(400).json({ ok: false, error: `invalid state: ${String(v)}` })
      }
      updates.state = v
      updates.state_changed_at = new Date().toISOString()
    }
    if (k === 'draft_ask') {
      if (typeof v !== 'string' || v.length > 2000) {
        return res.status(400).json({ ok: false, error: 'draft_ask must be a string under 2000 chars' })
      }
      updates.draft_ask = v
    }
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: 'no updatable fields supplied' })
  }

  try {
    const { data, error } = await supabase
      .from('bridge_candidates')
      .update(updates)
      .eq('bridge_id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, bridge: data })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'update_failed' })
  }
}
