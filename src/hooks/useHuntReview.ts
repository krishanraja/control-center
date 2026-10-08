import { useCallback, useEffect, useState } from 'react'
import type { HunterAction } from '../lib/hunterActions'

// What hunter is waiting on Krish for (roles to rule on, applications to open)
// and the one way to answer it: a press queued through /api/hunter/act, which
// hunter applies within minutes and records. Nothing here writes the sheet.

export interface RuleRole {
  job_id: string
  company: string
  title: string
  url: string | null
  score: number | null
  location: string | null
  comp: string | null
  why_it_fits: string | null
  presented_at: string | null
  fit: number | null
}

export interface OpenApplication {
  state: string
  sent_at: string | null
  opened_at: string | null
  open_url: string | null
}

export interface PendingPress {
  kind: string
  payload: Record<string, unknown>
  requested_at: string
}

export function useHuntReview() {
  const [toRule, setToRule] = useState<RuleRole[]>([])
  const [approvals, setApprovals] = useState<Record<string, OpenApplication>>({})
  const [pending, setPending] = useState<Record<string, PendingPress>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/hunter/review')
      const j = await r.json()
      if (j?.ok) {
        setToRule((j.toRule as RuleRole[]) || [])
        setApprovals((j.approvals as Record<string, OpenApplication>) || {})
        setPending((j.pending as Record<string, PendingPress>) || {})
      }
    } catch {
      // the section keeps what it had; the next poll retries
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => { void load() }, 60_000)
    return () => window.clearInterval(t)
  }, [load])

  /** Queue one press. Resolves to an error line, or null once it is queued. */
  const act = useCallback(async (a: Omit<HunterAction, 'payload'> & { payload?: unknown }): Promise<string | null> => {
    try {
      const r = await fetch('/api/hunter/act', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: {}, ...a }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.ok) return (j?.error as string) || `the press was not saved (${r.status})`
      setPending(p => ({ ...p, [a.job_id]: { kind: a.kind, payload: (a.payload as Record<string, unknown>) || {}, requested_at: new Date().toISOString() } }))
      return null
    } catch {
      return 'the press was not saved; check your connection and press again'
    }
  }, [])

  return { toRule, approvals, pending, loading, act, refetch: load }
}
