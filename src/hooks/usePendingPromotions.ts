import { useCallback, useEffect, useState } from 'react'
import { requestOk } from '../lib/apiFetch'

// The rung changes the weekly autonomy review proposed and Krish has not
// ruled on (ADR-030, phase 4). Read through the API; the ruling goes through
// /api/suggestions/verdict, which moves the ladder within the surface's
// max_rung and never to autonomous.

export interface PendingPromotion {
  id: string
  surface: string
  label: string
  from: 'propose' | 'assist'
  to: 'propose' | 'assist'
  reason: string
  created_at: string
}

export function usePendingPromotions(enabled = true) {
  const [pending, setPending] = useState<PendingPromotion[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const j = await requestOk<{ ok: boolean; pending?: PendingPromotion[] }>('/api/autonomy/promotions', { timeoutMs: 12_000 })
      setPending(Array.isArray(j.pending) ? j.pending : [])
    } catch {
      setPending([])
    }
  }, [])

  useEffect(() => { if (enabled) void load() }, [enabled, load])

  /** Approve or reject one proposal. Resolves true when the verdict was written. */
  const rule = useCallback(async (p: PendingPromotion, verdict: 'accepted' | 'rejected'): Promise<boolean> => {
    setBusy(p.id)
    try {
      await requestOk('/api/suggestions/verdict', {
        method: 'POST',
        body: { suggestion_id: p.id, verdict, ...(verdict === 'rejected' ? { note: 'Not yet. Keep proposing it.' } : {}) },
        timeoutMs: 12_000,
      })
      setPending(prev => prev.filter(x => x.id !== p.id))
      return true
    } catch {
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  return { pending, busy, rule, refresh: load }
}
