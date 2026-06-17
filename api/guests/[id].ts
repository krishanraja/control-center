import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { promoteGuestToContact } from '../_guest-to-contact.js'

// PATCH /api/guests/:id : update status, notes, scoring fields.

const ALLOWED_STATUS = new Set([
  'scouted',
  'enriched',
  'pitched',
  'responded',
  'scheduled',
  'confirmed',
  'recorded',
  'published',
  'dropped',
])

const ALLOWED_TARGET = new Set(['signal_noise', 'builder_economy', 'either'])

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
  if (typeof body.podcast_target === 'string') {
    if (!ALLOWED_TARGET.has(body.podcast_target)) {
      return res.status(400).json({ error: `invalid podcast_target: ${body.podcast_target}` })
    }
    updates.podcast_target = body.podcast_target
  }
  if (typeof body.notes === 'string') updates.notes = body.notes
  if (typeof body.fit_score === 'number') updates.fit_score = body.fit_score
  if (typeof body.attainability_score === 'number') updates.attainability_score = body.attainability_score
  if (typeof body.scheduled_at === 'string') updates.scheduled_at = body.scheduled_at
  if (typeof body.recorded_at === 'string') updates.recorded_at = body.recorded_at
  if (typeof body.published_at === 'string') updates.published_at = body.published_at

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no updatable fields supplied' })
  }

  const { data, error } = await supabase
    .from('guests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })

  // Once recorded/published, the guest is a relationship, not an opportunity —
  // promote it into the Network. Idempotent and best-effort: a promotion hiccup
  // never fails the status update.
  let promotion: Awaited<ReturnType<typeof promoteGuestToContact>> | undefined
  if (updates.status === 'recorded' || updates.status === 'published') {
    try { promotion = await promoteGuestToContact(id) } catch (e: any) { promotion = { ok: false, error: String(e?.message || e) } }
  }

  return res.json({ ok: true, guest: data, promotion })
}
