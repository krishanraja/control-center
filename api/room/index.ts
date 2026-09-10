import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { isState, TARGET_SELECT, type RoomTarget } from '../_room.js'
import { attachRejectSignal } from '../_rejectSignal.js'
// The one vocabulary (scripts/check-served-surfaces.mts keeps this list and
// src/lib/servedSurfaces.ts in step). Never declare a private reason list.
import { REASON_OPTIONS } from '../feedback.js'

// GET  /api/room?state=<state>   the targets in one state, with their contact
//                                fields, plus counts over every state. With no
//                                state it returns listed and drafted together:
//                                the two states with work waiting.
// POST /api/room                 { contact_id, why_face, sourced_by?, state?,
//                                reason_code? } adds a target. `state` is
//                                'listed' (kept) or 'not_now' (skipped); 409
//                                when the person is already on the list.
//                                People not yet in contacts go through the
//                                Network add-person flow first.
//
// A skip writes a row too, and that is the point. It used to filter a local
// array and write nothing, so `/api/room/seed` (which excludes only rows that
// exist) proposed the same five people on every call, forever, and no verdict
// Krish made about the Room ever reached Vera. A 'not_now' row both suppresses
// the person from the next seed and carries a coded feedback_queue vote so the
// correction loop can learn the pattern.
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
  // Carried straight from the proposal so the card can be read back to the
  // judgment that produced it, rather than re-inferred at render time.
  const askKind = body.ask_kind === 'intro' || body.ask_kind === 'collaborator' || body.ask_kind === 'buyer'
    ? body.ask_kind
    : null
  const askLine = typeof body.ask_line === 'string' && body.ask_line.trim()
    ? body.ask_line.trim().slice(0, 240)
    : null
  // Only the two entry states. Every other rung is reached through PATCH, which
  // enforces the ladder in api/_room.ts.
  const state = body.state === 'not_now' ? 'not_now' : 'listed'
  const skipped = state === 'not_now'
  const reasonCode = typeof body.reason_code === 'string' && REASON_OPTIONS.has(body.reason_code)
    ? body.reason_code
    : 'room_other'
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
      .insert({
        contact_id: contactId,
        why_face: whyFace,
        sourced_by: sourcedBy,
        state,
        ...(askKind ? { ask_kind: askKind } : {}),
        ...(askLine ? { ask_line: askLine } : {}),
        ...(skipped ? { not_now_at: new Date().toISOString() } : {}),
      })
      .select(TARGET_SELECT)
      .single()
    if (error) {
      // Two adds racing on the unique contact_id: the second one is a 409.
      if (/duplicate|unique/i.test(error.message)) {
        return res.status(409).json({ ok: false, error: 'already_listed' })
      }
      throw new Error(error.message)
    }
    // The verdict, recorded. Best-effort and deliberately after the row is
    // committed: enriching a skip must never be able to fail the skip.
    if (skipped) {
      const row = data as unknown as { id: string }
      const { data: fb } = await supabase.from('feedback_queue').insert({
        source_table: 'room_targets',
        source_id: row.id,
        agent_id: 'os',
        original_agent: 'os',
        original_item_id: row.id,
        vote: -1,
        reason_code: reasonCode,
        status: 'pending',
      }).select('id').single()
      // why_face is the only text the row carries about the person, and it is
      // what a future reject-neighbour search has to match on.
      await attachRejectSignal((fb as { id?: string } | null)?.id, whyFace, whyFace)
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
