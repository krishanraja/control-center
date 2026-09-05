import { useCallback, useEffect, useState } from 'react'

// room_targets is service-role only (private judgment about named people, the
// same posture as bridge_candidates), so this hook talks to the gated
// /api/room routes and never to PostgREST directly.

export type RoomState =
  | 'listed' | 'drafted' | 'sent' | 'replied' | 'call_booked' | 'call_taken'
  | 'room_booked' | 'room_paid' | 'not_now'

export const ROOM_STATES: RoomState[] = [
  'listed', 'drafted', 'sent', 'replied', 'call_booked', 'call_taken', 'room_booked', 'room_paid', 'not_now',
]

export const ROOM_STATE_LABEL: Record<RoomState, string> = {
  listed: 'Listed',
  drafted: 'Drafted',
  sent: 'Sent',
  replied: 'Replied',
  call_booked: 'Call booked',
  call_taken: 'Call taken',
  room_booked: 'Room booked',
  room_paid: 'Paid',
  not_now: 'Not now',
}

export interface RoomContact {
  id: string
  full_name: string | null
  first_name: string | null
  email: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
}

export interface RoomRow {
  id: string
  contact_id: string
  why_face: string
  trigger_signal: string | null
  trigger_source_url: string | null
  trigger_found_at: string | null
  draft_subject: string | null
  draft_body: string | null
  draft_url: string | null
  drafted_at: string | null
  state: RoomState
  listed_at: string
  sent_at: string | null
  replied_at: string | null
  call_booked_at: string | null
  call_taken_at: string | null
  room_booked_at: string | null
  room_paid_at: string | null
  not_now_at: string | null
  cash_gbp: number | null
  sourced_by: 'krish' | 'os'
  notes: string | null
  contact: RoomContact | null
}

export interface RoomProposal {
  contact_id: string
  full_name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  why_face: string
  score: number
}

/** The lane's rows. With no state the route returns listed and drafted
 *  together: the two states with work waiting. */
export function useRoom(state: RoomState | null = null) {
  const [targets, setTargets] = useState<RoomRow[]>([])
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(state ? `/api/room?state=${encodeURIComponent(state)}` : '/api/room')
      const j = await r.json()
      if (j?.ok) {
        setTargets((j.targets as RoomRow[]) || [])
        setStateCounts((j.stateCounts as Record<string, number>) || {})
      }
    } catch {
      // the lane renders its quiet empty state; the next poll retries
    }
    setLoading(false)
  }, [state])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (!cancelled) await load()
    }
    tick()
    const iv = setInterval(tick, 60_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [load])

  return { targets, stateCounts, loading, refetch: load }
}

async function readJson(r: Response): Promise<Record<string, unknown>> {
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error((j?.error as string) || `HTTP ${r.status}`)
  return j as Record<string, unknown>
}

export async function patchRoom(
  id: string,
  body: {
    state?: RoomState
    notes?: string
    why_face?: string
    cash_gbp?: number
    draft_subject?: string
    draft_body?: string
  },
): Promise<RoomRow> {
  const r = await fetch(`/api/room/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await readJson(r)
  return j.target as RoomRow
}

/** Trigger then draft. Throws 'google_not_configured' when the server has no
 *  Google service account, so the card can say so in plain words. */
export async function draftRoom(id: string): Promise<RoomRow> {
  const r = await fetch(`/api/room/${id}/draft`, { method: 'POST' })
  const j = await readJson(r)
  return j.target as RoomRow
}

/** Proposals only. Nothing is added until Accept is pressed on one. */
export async function seedRoom(limit = 5): Promise<RoomProposal[]> {
  const r = await fetch('/api/room/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  })
  const j = await readJson(r)
  return (j.proposals as RoomProposal[]) || []
}

export async function addRoomTarget(input: {
  contact_id: string
  why_face: string
  sourced_by?: 'krish' | 'os'
}): Promise<RoomRow> {
  const r = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const j = await readJson(r)
  return j.target as RoomRow
}
