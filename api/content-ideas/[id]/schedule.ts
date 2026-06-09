import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/content-ideas/:id/schedule   body: { date: 'YYYY-MM-DD' | null }
//
// Sets (or clears, when date is null) `scheduled_for` so a draft lands on the
// Content calendar. `scheduled_for` is a `date` column, so we store the plain
// YYYY-MM-DD the caller computed from the clicked cell's local components — no
// timezone coercion. Touches scheduled_for + updated_at only.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = req.query?.id
  const ideaId = Array.isArray(id) ? id[0] : id
  if (!ideaId) return res.status(400).json({ ok: false, error: 'id required' })

  const { date } = (req.body || {}) as { date?: string | null }
  let scheduled_for: string | null = null
  if (date != null) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD or null' })
    }
    scheduled_for = date
  }

  const { data, error } = await supabase
    .from('content_ideas')
    .update({ scheduled_for, updated_at: new Date().toISOString() })
    .eq('id', ideaId)
    .select('id, scheduled_for')
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'idea not found' })
  return res.status(200).json({ ok: true, idea: data })
}
