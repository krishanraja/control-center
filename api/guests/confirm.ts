import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/guests/confirm
//
// Two effects:
//   1. UPDATE guests SET status='confirmed' WHERE id = guest_id
//   2. Fire the Nell Guest Confirmed Cascade webhook (asynchronously creates
//      prep/recording/follow-up tasks, drafts 3 promos into content_ideas,
//      creates a Gmail draft to the guest, and inserts contacted_persons).
//
// Body: { guest_id }
// Response: { ok, cascade_status }

const N8N_CASCADE_URL =
  process.env.N8N_GUEST_CONFIRMED_CASCADE_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/guest-confirmed-cascade'

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = (req.body || {}) as { guest_id?: string }
  const guest_id = body.guest_id
  if (!guest_id) return res.status(400).json({ ok: false, error: 'guest_id required' })

  const { data, error } = await supabase
    .from('guests')
    .update({ status: 'confirmed' })
    .eq('id', guest_id)
    .select('id, name, status, podcast_target')
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })

  await supabase.from('audit_log').insert({
    event_type: 'guest_confirm_requested',
    actor: 'krish',
    target: guest_id,
    details: JSON.stringify({ name: data?.name, podcast_target: data?.podcast_target }),
  })

  let cascade_status: 'fired' | 'failed' = 'fired'
  try {
    const r = await fetch(N8N_CASCADE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGATHA_SECRET ? { 'X-Agatha-Secret': AGATHA_SECRET } : {}),
      },
      body: JSON.stringify({ guest_id }),
    })
    if (!r.ok) cascade_status = 'failed'
  } catch {
    cascade_status = 'failed'
  }

  return res.json({ ok: true, guest: data, cascade_status })
}
