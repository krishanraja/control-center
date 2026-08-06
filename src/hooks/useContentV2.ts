import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ContentDecisionRow, ShiftEvidenceRow, ShiftRow, WeeklyBriefRow } from '../lib/contentV2'

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
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const [briefQ, decQ, shiftQ] = await Promise.all([
      supabase.from('weekly_briefs').select('*')
        .in('status', ['ready', 'in_review', 'approved', 'pushed', 'sent'])
        .order('week', { ascending: false }).limit(1),
      supabase.from('content_decisions').select('*')
        .eq('status', 'pending').order('created_at', { ascending: true }).limit(30),
      supabase.from('shifts').select('*').order('momentum', { ascending: false }).limit(100),
    ])
    if (!alive.current) return
    setBrief(((briefQ.data || [])[0] as WeeklyBriefRow) || null)
    setDecisions((decQ.data as ContentDecisionRow[]) || [])
    setShifts((shiftQ.data as ShiftRow[]) || [])
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

  return { brief, decisions, shifts, loading, refresh, resolveDecision, rejectDecision, ruleShift }
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
