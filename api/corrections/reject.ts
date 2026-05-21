import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// PR 3 of os-rebuild: reject a pending Vera correction.
//
// POST /api/corrections/reject
//   body: { correction_id: string }
//
// Sets approval_state='rejected'. Feedback rows stay 'pending' so a different
// pattern can emerge later.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { correction_id } = (req.body || {}) as { correction_id?: string }
  if (!correction_id) return res.status(400).json({ ok: false, error: 'correction_id required' })

  const { data: correction, error: fetchErr } = await supabase
    .from('corrections')
    .select('id, approval_state')
    .eq('id', correction_id)
    .single()
  if (fetchErr || !correction) return res.status(404).json({ ok: false, error: fetchErr?.message || 'correction not found' })
  if (correction.approval_state !== 'pending') {
    return res.status(409).json({ ok: false, error: `correction already ${correction.approval_state}` })
  }

  const { error: corrErr } = await supabase
    .from('corrections')
    .update({ approval_state: 'rejected' })
    .eq('id', correction_id)
  if (corrErr) return res.status(500).json({ ok: false, error: corrErr.message })

  return res.json({ ok: true, correction_id })
}
