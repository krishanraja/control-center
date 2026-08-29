import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ArcCardRow, ContentDecisionRow, ShiftEvidenceRow, ShiftRow, WeeklyBriefRow } from '../lib/contentV2'
import { earliestQueueWeek } from '../lib/contentV2'

// Data layer for the four-room Content tab. Reads go straight to Supabase
// (anon SELECT per house RLS); every write goes through /api/* (service role).
// One realtime channel per table keeps the rooms live.

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body?.ok === false) throw new Error(body?.error || `http_${r.status}`)
  return body as T
}

export function useContentV2() {
  const [brief, setBrief] = useState<WeeklyBriefRow | null>(null)
  const [decisions, setDecisions] = useState<ContentDecisionRow[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [arcCards, setArcCards] = useState<ArcCardRow[]>([])
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    // Both reads are bounded by the same week window. Without it the queue
    // showed the thirty oldest pending cards ever written and the brief hero
    // showed the newest brief that was never archived - which, because the
    // purge only archived 'pushed'/'sent' and nothing had ever been pushed,
    // meant a brief from any past week could sit here indefinitely.
    const since = earliestQueueWeek()
    const [briefQ, decQ, shiftQ, cardQ] = await Promise.all([
      supabase.from('weekly_briefs').select('*')
        .in('status', ['ready', 'in_review', 'approved', 'pushed', 'sent'])
        .gte('week', since)
        .order('week', { ascending: false }).limit(1),
      // Newest first, so if a week ever overruns the cap again (2026-W31 wrote
      // 40 cards against the spec's 5-10) the truncation drops the oldest
      // rather than hiding everything recent behind them.
      supabase.from('content_decisions').select('*')
        .eq('status', 'pending')
        .gte('week', since)
        .order('created_at', { ascending: false }).limit(60),
      // Merged arcs are kept rather than deleted so a merge is reversible
      // (api/shifts/[id].ts), so every list reader must exclude them or a
      // folded arc reappears beside the one it was folded into.
      supabase.from('shifts').select('*')
        .is('superseded_by', null)
        .order('momentum', { ascending: false }).limit(100),
      // The surfaced week, newest first. Blocked and unsurfaced rows come too:
      // the reason a card did NOT make it is the thing the old queue could
      // never answer, and it is what turns "nothing this week" from a silent
      // failure into a statement.
      supabase.from('arc_cards').select('*')
        .gte('week', since)
        .order('surfaced', { ascending: false })
        .order('score', { ascending: false })
        .limit(120),
    ])
    if (!alive.current) return
    setBrief(((briefQ.data || [])[0] as WeeklyBriefRow) || null)
    setDecisions((decQ.data as ContentDecisionRow[]) || [])
    setShifts((shiftQ.data as ShiftRow[]) || [])
    setArcCards((cardQ.data as ArcCardRow[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    alive.current = true
    refresh()
    const ch = supabase
      .channel('content-v2-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_briefs' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_decisions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arc_cards' }, refresh)
      .subscribe()
    return () => {
      alive.current = false
      supabase.removeChannel(ch)
    }
  }, [refresh])

  const resolveDecision = useCallback(async (id: string, action: 'done' | 'dismiss', note?: string) => {
    await api(`/api/content-decisions/${id}`, { method: 'PATCH', body: JSON.stringify({ action, note }) })
    refresh()
  }, [refresh])

  // Bin a card AND say why. Distinct from resolveDecision(id, 'dismiss'), which
  // is a silent "not now": this one writes the −1 that Vera clusters by reason
  // code, so refusing the same kind of story three weeks running actually
  // changes what gets assembled instead of just clearing the queue.
  const rejectDecision = useCallback(async (id: string, reasonCode?: string, reasonText?: string) => {
    await api(`/api/content-decisions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reject', reason_code: reasonCode, reason_text: reasonText }),
    })
    refresh()
  }, [refresh])

  const ruleShift = useCallback(async (id: string, action: string, extra?: Record<string, unknown>) => {
    await api(`/api/shifts/${id}`, { method: 'PATCH', body: JSON.stringify({ action, ...extra }) })
    refresh()
  }, [refresh])

  return { brief, decisions, shifts, arcCards, loading, refresh, resolveDecision, rejectDecision, ruleShift }
}

export function useShiftEvidence(shiftId: string | null) {
  const [evidence, setEvidence] = useState<ShiftEvidenceRow[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!shiftId) { setEvidence([]); return }
    let alive = true
    setLoading(true)
    supabase.from('shift_evidence').select('*')
      .eq('shift_id', shiftId).order('occurred_on', { ascending: false }).limit(400)
      .then(({ data }) => {
        if (!alive) return
        setEvidence((data as ShiftEvidenceRow[]) || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [shiftId])
  return { evidence, loading }
}

export const contentV2Api = api
