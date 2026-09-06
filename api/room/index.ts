import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { isState, TARGET_SELECT, type RoomTarget } from '../_room.js'

// GET  /api/room?state=<state>   the targets in one state, with their contact
//                                fields, plus counts over every state. With no
//                                state it returns listed and drafted together:
//                                the two states with work waiting.
// POST /api/room                 { contact_id, why_face, sourced_by? } adds a
//                                listed target. 409 when the person is already
//                                on the list. People not yet in contacts go
//                                through the Network add-person flow first.
//
// room_targets carries private judgment about named people and has no anon
// policy, so this route sits behind the same cookie gate as /api/network/*
// and /api/bridges (api/_auth.ts).

export const config = { maxDuration: 30 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function stateCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.from('room_targets').select('state')
  const counts: Record<string, number> = {}
  for (const r of data || []) {
    const s = (r as { state?: string }).state || 'listed'
    counts[s] = (counts[s] || 0) + 1
  }
  return counts
}

async function list(req: VercelRequest, res: VercelResponse) {
  const q = req.query.state
  const state = typeof q === 'string' && isState(q) ? q : null
  try {
    let query = supabase.from('room_targets').select(TARGET_SELECT)
    query = state ? query.eq('state', state) : query.in('state', ['listed', 'drafted'])
    const { data, error } = await query
      .order('trigger_found_at', { ascending: false, nullsFirst: false })
      .order('listed_at', { ascending: true })
      .limit(100)
    if (error) throw new Error(error.message)
    const targets = (data || []) as unknown as RoomTarget[]
    return res.status(200).json({ ok: true, targets, stateCounts: await stateCounts() })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'room_failed' })
  }
}

async function add(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>
  const contactId = typeof body.contact_id === 'string' ? body.contact_id : ''
  const whyFace = typeof body.why_face === 'string' ? body.why_face.trim() : ''
  const sourcedBy = body.sourced_by === 'os' ? 'os' : 'krish'
  if (!UUID.test(contactId)) return res.status(400).json({ ok: false, error: 'contact_id must be a uuid' })
  if (!whyFace || whyFace.length > 600) {
    return res.status(400).json({ ok: false, error: 'why_face is required, under 600 characters' })
  }

  try {
    const { data: contact, error: cErr } = await supabase
      .from('contacts').select('id').eq('id', contactId).maybeSingle()
    if (cErr) throw new Error(cErr.message)
    if (!contact) return res.status(404).json({ ok: false, error: 'contact not found' })

    const { data: existing } = await supabase
      .from('room_targets').select('id, state').eq('contact_id', contactId).maybeSingle()
    if (existing) {
      return res.status(409).json({ ok: false, error: 'already_listed', target_id: existing.id, state: existing.state })
    }

    const { data, error } = await supabase
      .from('room_targets')
      .insert({ contact_id: contactId, why_face: whyFace, sourced_by: sourcedBy, state: 'listed' })
      .select(TARGET_SELECT)
      .single()
    if (error) {
      // Two adds racing on the unique contact_id: the second one is a 409.
      if (/duplicate|unique/i.test(error.message)) {
        return res.status(409).json({ ok: false, error: 'already_listed' })
      }
      throw new Error(error.message)
    }
    return res.status(201).json({ ok: true, target: data as unknown as RoomTarget })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'room_add_failed' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET', 'POST'])) return
  if (req.method === 'POST') return add(req, res)
  return list(req, res)
}
