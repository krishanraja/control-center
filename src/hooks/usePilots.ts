import { useCallback, useEffect, useState } from 'react'

// pilot_deals is service-role only (private judgment about named people, the
// same posture as bridge_candidates), so this hook talks to the gated
// /api/pilot-deals routes and never to PostgREST directly.

export type PilotState =
  | 'listed' | 'drafted' | 'sent' | 'replied' | 'call_booked' | 'call_taken'
  | 'pilot_booked' | 'pilot_paid' | 'not_now'

export const PILOT_STATES: PilotState[] = [
  'listed', 'drafted', 'sent', 'replied', 'call_booked', 'call_taken', 'pilot_booked', 'pilot_paid', 'not_now',
]

export const PILOT_STATE_LABEL: Record<PilotState, string> = {
  listed: 'Listed',
  drafted: 'Drafted',
  sent: 'Sent',
  replied: 'Replied',
  call_booked: 'Call booked',
  call_taken: 'Call taken',
  pilot_booked: 'Pilot booked',
  pilot_paid: 'Paid',
  not_now: 'Not now',
}

export interface PilotContact {
  id: string
  full_name: string | null
  first_name: string | null
  email: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
}

/** Who a person is to the door: can they sign, open a door, or do you already
 *  work with them. Written by /api/pilot-deals/seed. */
export type AskKind = 'buyer' | 'intro' | 'collaborator'

export const ASK_LABEL: Record<AskKind, string> = {
  buyer: 'Can sign',
  intro: 'Can introduce',
  collaborator: 'You work together',
}

export interface PilotDealRow {
  id: string
  contact_id: string
  why_face: string
  ask_kind: AskKind | null
  ask_line: string | null
  trigger_signal: string | null
  trigger_source_url: string | null
  trigger_found_at: string | null
  draft_subject: string | null
  draft_body: string | null
  draft_url: string | null
  drafted_at: string | null
  state: PilotState
  listed_at: string
  sent_at: string | null
  replied_at: string | null
  call_booked_at: string | null
  call_taken_at: string | null
  pilot_booked_at: string | null
  pilot_paid_at: string | null
  not_now_at: string | null
  cash_gbp: number | null
  sourced_by: 'krish' | 'os'
  notes: string | null
  /** What the enrichment knew when this person was listed (ADR-022 columns,
   *  carried onto the deal by migration 20260916110000). A null intent_score
   *  means posts were never read; 0 means read and nothing there. Those are
   *  different claims and the row keeps them apart. */
  intent_score: number | null
  intent_stance: string | null
  intent_evidence: string | null
  intent_evidence_url: string | null
  intent_topics: string[] | null
  last_post_at: string | null
  followers: number | null
  is_influencer: boolean | null
  is_creator: boolean | null
  completeness: number | null
  contact: PilotContact | null
}

export interface PilotProposal {
  contact_id: string
  full_name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  why_face: string
  score: number
  ask_kind?: AskKind
  ask_line?: string
  intent_score?: number | null
  intent_stance?: string | null
  intent_evidence?: string | null
  intent_evidence_url?: string | null
  intent_topics?: string[] | null
  last_post_at?: string | null
  followers?: number | null
  is_influencer?: boolean | null
  is_creator?: boolean | null
  completeness?: number | null
}

/** The lane's rows. With no state the route returns listed and drafted
 *  together: the two states with work waiting. */
export function usePilots(state: PilotState | null = null) {
  const [targets, setTargets] = useState<PilotDealRow[]>([])
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  // A read that failed is not an empty list. This used to be a bare catch, so
  // a stale cookie on the phone and a genuinely empty list looked identical.
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(state ? `/api/pilot-deals?state=${encodeURIComponent(state)}` : '/api/pilot-deals')
      const j = await r.json().catch(() => null)
      if (j?.ok) {
        setTargets((j.targets as PilotDealRow[]) || [])
        setStateCounts((j.stateCounts as Record<string, number>) || {})
        setError(null)
      } else {
        setError(r.status === 401 ? 'not_signed_in' : (j?.error as string) || `http_${r.status}`)
      }
    } catch {
      setError('network')
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

  return { targets, stateCounts, loading, error, refetch: load }
}

async function readJson(r: Response): Promise<Record<string, unknown>> {
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error((j?.error as string) || `HTTP ${r.status}`)
  return j as Record<string, unknown>
}

export async function patchPilot(
  id: string,
  body: {
    state?: PilotState
    notes?: string
    why_face?: string
    cash_gbp?: number
    draft_subject?: string
    draft_body?: string
  },
): Promise<PilotDealRow> {
  const r = await fetch(`/api/pilot-deals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await readJson(r)
  return j.target as PilotDealRow
}

/** Trigger then draft. Throws 'google_not_configured' when the server has no
 *  Google service account, so the card can say so in plain words. */
export async function draftPilot(id: string): Promise<PilotDealRow> {
  const r = await fetch(`/api/pilot-deals/${id}/draft`, { method: 'POST' })
  const j = await readJson(r)
  return j.target as PilotDealRow
}

/** Proposals only. Nothing is added until Accept is pressed on one.
 *  `degraded` names any search stage that did not run (for example
 *  'embedding:unavailable' when no embedding key is configured), so an empty
 *  result can say why instead of "nobody fits". */
export async function seedPilots(limit = 5): Promise<{ proposals: PilotProposal[]; degraded: string[]; heldBack: number }> {
  const r = await fetch('/api/pilot-deals/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  })
  const j = await readJson(r)
  return {
    proposals: (j.proposals as PilotProposal[]) || [],
    degraded: Array.isArray(j.degraded) ? (j.degraded as unknown[]).map(String) : [],
    // People the search found but could not identify well enough to judge.
    // They are dropped rather than shown as a bare first name, and the lane
    // says so instead of quietly returning four cards out of five.
    heldBack: typeof j.held_back === 'number' ? j.held_back : 0,
  }
}

export async function addPilotDeal(input: {
  contact_id: string
  why_face: string
  ask_kind?: AskKind
  ask_line?: string
  sourced_by?: 'krish' | 'os'
  /** 'listed' keeps them; 'not_now' is a skip, which is recorded rather than
   *  discarded so the next seed stops proposing them and Vera sees the verdict. */
  state?: 'listed' | 'not_now'
  /** A code from src/lib/servedSurfaces.ts. Omitted falls back to pilot_other. */
  reason_code?: string
  /** The evidence the proposal was judged on, carried onto the deal so the
   *  reason it was listed cannot be rewritten by a later re-enrichment. The
   *  route validates every field rather than trusting the body. */
  intent_score?: number | null
  intent_stance?: string | null
  intent_evidence?: string | null
  intent_evidence_url?: string | null
  intent_topics?: string[] | null
  last_post_at?: string | null
  followers?: number | null
  is_influencer?: boolean | null
  is_creator?: boolean | null
  completeness?: number | null
}): Promise<PilotDealRow> {
  const r = await fetch('/api/pilot-deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const j = await readJson(r)
  return j.target as PilotDealRow
}
