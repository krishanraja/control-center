import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { requestJson, requestOk } from '../lib/apiFetch'
import type { AeoCommandRow, AeoDigestRow, AeoQueryRow, AeoSubjectRow } from '../lib/aeo'

/**
 * Data layer for the AEO research read on the Growth tab's Signals section.
 *
 * Reads go straight to Supabase on the anon key (house RLS is anon SELECT on
 * growth_aeo_subjects, growth_aeo_digests and growth_aeo_queries). Every
 * write goes through /api/aeo/* on the service role. One realtime channel
 * keeps the three tables live while the engine's packet is landing; the
 * probes themselves ride in useGrowth's channel, which already carries
 * growth_geo_probes. The Run-now ledger is service-only, so it is polled
 * through /api/aeo/run every minute while the section is open.
 */

const DIGEST_LIMIT = 80
const QUERY_LIMIT = 800
const COMMAND_POLL_MS = 60_000

async function aeoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || (body as { ok?: boolean })?.ok === false) {
    throw new Error((body as { error?: string })?.error || `http_${r.status}`)
  }
  return body as T
}

export interface RunNowResult { queued: boolean; dispatched?: boolean; dispatch_error?: string; command?: AeoCommandRow }

export function useAeo() {
  const [subjects, setSubjects] = useState<AeoSubjectRow[]>([])
  const [digests, setDigests] = useState<AeoDigestRow[]>([])
  const [queries, setQueries] = useState<AeoQueryRow[]>([])
  const [commands, setCommands] = useState<AeoCommandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const [subQ, digQ, qQ] = await Promise.all([
      supabase.from('growth_aeo_subjects').select('*').order('kind').order('name'),
      supabase.from('growth_aeo_digests').select('*').order('week_start', { ascending: false }).limit(DIGEST_LIMIT),
      supabase.from('growth_aeo_queries').select('*').order('week_start', { ascending: false }).order('demand_score', { ascending: false }).limit(QUERY_LIMIT),
    ])
    if (!alive.current) return
    const firstErr = [subQ, digQ, qQ].map(q => q.error).find(Boolean)
    setError(firstErr ? firstErr.message : null)
    setSubjects((subQ.data as AeoSubjectRow[]) || [])
    setDigests((digQ.data as AeoDigestRow[]) || [])
    setQueries((qQ.data as AeoQueryRow[]) || [])
    setLoading(false)
  }, [])

  const refreshCommands = useCallback(async () => {
    try {
      const { ok, json } = await requestJson<{ ok: boolean; commands: AeoCommandRow[] }>('/api/aeo/run', { timeoutMs: 8_000 })
      if (alive.current && ok && json?.commands) setCommands(json.commands)
    } catch {
      // The ledger is a caption, never a reason the section fails to render.
    }
  }, [])

  useEffect(() => {
    alive.current = true
    refresh()
    refreshCommands()
    const ch = supabase
      .channel('aeo-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_aeo_subjects' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_aeo_digests' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_aeo_queries' }, refresh)
      .subscribe()
    const t = window.setInterval(refreshCommands, COMMAND_POLL_MS)
    return () => {
      alive.current = false
      window.clearInterval(t)
      supabase.removeChannel(ch)
    }
  }, [refresh, refreshCommands])

  // ── Subjects ──────────────────────────────────────────────────────────────
  const addSubject = useCallback(async (body: Record<string, unknown>) => {
    const r = await aeoApi<{ subject: AeoSubjectRow }>('/api/aeo/subjects', { method: 'POST', body: JSON.stringify(body) })
    setSubjects(prev => [...prev, r.subject])
    return r.subject
  }, [])

  const patchSubject = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setSubjects(prev => prev.map(s => (s.id === id ? { ...s, ...patch } as AeoSubjectRow : s)))
    const r = await aeoApi<{ subject: AeoSubjectRow }>('/api/aeo/subjects', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) })
    setSubjects(prev => prev.map(s => (s.id === id ? r.subject : s)))
    return r.subject
  }, [])

  // ── Digest and queries ────────────────────────────────────────────────────
  const dismissRecommendation = useCallback(async (digestId: string, n: number, dismissed: boolean) => {
    const stamp = dismissed ? new Date().toISOString() : null
    setDigests(prev => prev.map(d => d.id !== digestId ? d : {
      ...d,
      recommendations: Array.isArray(d.recommendations)
        ? (d.recommendations as Array<Record<string, unknown>>).map(r => (r.n === n ? { ...r, dismissed_at: stamp } : r))
        : d.recommendations,
    }))
    const r = await aeoApi<{ digest: AeoDigestRow }>('/api/aeo/digest', { method: 'PATCH', body: JSON.stringify({ id: digestId, n, dismissed }) })
    setDigests(prev => prev.map(d => (d.id === digestId ? r.digest : d)))
  }, [])

  const setQueryStatus = useCallback(async (id: string, status: 'watch' | 'drop') => {
    setQueries(prev => prev.map(q => (q.id === id ? { ...q, status } : q)))
    const r = await aeoApi<{ query: AeoQueryRow }>('/api/aeo/queries', { method: 'PATCH', body: JSON.stringify({ id, status }) })
    setQueries(prev => prev.map(q => (q.id === id ? r.query : q)))
  }, [])

  // ── Run now ───────────────────────────────────────────────────────────────
  const runNow = useCallback(async (subjectId: string | null): Promise<RunNowResult> => {
    const r = await requestOk<{ ok: boolean } & RunNowResult>('/api/aeo/run', {
      method: 'POST', body: { subject_id: subjectId }, timeoutMs: 15_000,
    })
    refreshCommands()
    return r
  }, [refreshCommands])

  return {
    subjects, digests, queries, commands, loading, error, refresh,
    addSubject, patchSubject, dismissRecommendation, setQueryStatus, runNow, refreshCommands,
  }
}

export type AeoData = ReturnType<typeof useAeo>
