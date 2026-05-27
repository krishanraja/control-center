import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/tasks-inbox/archive
//   body: { id, reason? }
// Marks the inbox row archived. reason defaults to 'krish_dismissed'
// since that is the only path that calls this from the UI.

interface Body {
  id?: string
  reason?: 'krish_dismissed' | 'completed' | 'classifier_failed' | 'auto_decay_14d'
}

const ALLOWED = new Set(['krish_dismissed','completed','classifier_failed','auto_decay_14d'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  const id = (body.id || '').trim()
  const reason = body.reason || 'krish_dismissed'
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  if (!ALLOWED.has(reason)) return res.status(400).json({ ok: false, error: 'invalid reason' })

  const { error } = await supabase
    .from('tasks_inbox')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      archive_reason: reason,
    })
    .eq('id', id)
  if (error) return res.status(500).json({ ok: false, error: error.message })

  return res.json({ ok: true, id })
}
