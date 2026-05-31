import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/objectives/:id/nominate-accept
// Promotes a Marcus-nominated objective (source=marcus_nominated, status=proposed)
// to active. The source stays marcus_nominated for provenance; status flips
// to active and activated_at is stamped.

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

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data, error } = await supabase
    .from('goals')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'proposed')
    .select()
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(409).json({ ok: false, error: 'objective not in proposed state' })

  await supabase.from('audit_log').insert({
    event_type: 'objective_nomination_accepted',
    actor: 'krish',
    target: id,
    details: JSON.stringify({ source: data.source, title: data.title }),
  })

  return res.json({ ok: true, objective: data })
}
