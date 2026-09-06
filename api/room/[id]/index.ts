import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { supabase } from '../../_supabase.js'
import { recordShip } from '../../_ships.js'
import { canMove, isState, stampFor, TARGET_SELECT, type RoomState, type RoomTarget } from '../../_room.js'

// PATCH /api/room/:id  { state?, notes?, why_face?, cash_gbp?, draft_subject?, draft_body? }
//
// Moves a target along the ladder, or edits the words on it. A state change
// must be one the ladder allows (api/_room.ts NEXT), stamps <state>_at, and
// room_paid needs the invoice value. Marking a target sent records a ship on
// the 'approach' channel, which is what the scorecard counts; if that write
// fails the request fails and the state does not move.
//
// Nothing here sends anything. "Sent" is Krish telling the OS what he did.

export const config = { maxDuration: 30 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  return v.length > max ? null : v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['PATCH'])) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'invalid_id' })

  const body = (req.body || {}) as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if ('notes' in body) {
    const v = text(body.notes, 2000)
    if (v === null) return res.status(400).json({ ok: false, error: 'notes must be a string under 2000 characters' })
    updates.notes = v.trim() || null
  }
  if ('why_face' in body) {
    const v = text(body.why_face, 600)
    if (v === null || !v.trim()) return res.status(400).json({ ok: false, error: 'why_face must be a string under 600 characters' })
    updates.why_face = v.trim()
  }
  if ('draft_subject' in body) {
    const v = text(body.draft_subject, 300)
    if (v === null) return res.status(400).json({ ok: false, error: 'draft_subject must be a string under 300 characters' })
    updates.draft_subject = v.trim() || null
  }
  if ('draft_body' in body) {
    const v = text(body.draft_body, 8000)
    if (v === null) return res.status(400).json({ ok: false, error: 'draft_body must be a string under 8000 characters' })
    updates.draft_body = v
  }
  if ('cash_gbp' in body) {
    const n = Number(body.cash_gbp)
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'cash_gbp must be a number of pounds, zero or more' })
    updates.cash_gbp = n
  }

  const rawState = 'state' in body ? body.state : undefined
  if (rawState !== undefined && !isState(rawState)) {
    return res.status(400).json({ ok: false, error: `invalid state: ${String(rawState)}` })
  }
  const nextState: RoomState | undefined = isState(rawState) ? rawState : undefined

  if (Object.keys(updates).length === 0 && !nextState) {
    return res.status(400).json({ ok: false, error: 'no updatable fields supplied' })
  }

  try {
    const { data: current, error: readErr } = await supabase
      .from('room_targets')
      .select('id, state, cash_gbp, contact:contacts(full_name)')
      .eq('id', id)
      .maybeSingle()
    if (readErr) throw new Error(readErr.message)
    if (!current) return res.status(404).json({ ok: false, error: 'target not found' })

    if (nextState) {
      const from = current.state as Parameters<typeof canMove>[0]
      if (!canMove(from, nextState)) {
        return res.status(409).json({ ok: false, error: `cannot move from ${from} to ${nextState}` })
      }
      if (nextState === 'room_paid') {
        const cash = 'cash_gbp' in updates ? Number(updates.cash_gbp) : Number(current.cash_gbp)
        if (!Number.isFinite(cash) || cash <= 0) {
          return res.status(400).json({ ok: false, error: 'cash_gbp is required to mark a room paid' })
        }
      }
      if (nextState === 'sent') {
        // The ship first. If the count cannot be written the state does not
        // move, so a sent approach can never be invisible to the scorecard.
        const contact = current.contact as unknown as { full_name?: string | null } | null
        const name = (contact?.full_name || '').trim() || 'a Room target'
        const ship = await recordShip({
          channel: 'approach',
          description: `Approach to ${name}`,
          dedup_key: `room:${id}`,
        })
        if (!ship.ok) {
          return res.status(502).json({ ok: false, error: `ship_write_failed: ${ship.error || 'unknown'}` })
        }
      }
      updates.state = nextState
      updates[stampFor(nextState)] = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('room_targets')
      .update(updates)
      .eq('id', id)
      .select(TARGET_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return res.status(200).json({ ok: true, target: data as unknown as RoomTarget })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'update_failed' })
  }
}
