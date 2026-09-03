import { useCallback, useEffect, useState } from 'react'

// Bridge tables are service-role-only (private judgment about named people),
// so this hook talks to the gated /api/bridges routes, never PostgREST
// directly. Same access posture as the network person sheet.

export type BridgeState = 'proposed' | 'reached_out' | 'snoozed' | 'not_a_path'

export type BridgeTier = 'current_employee' | 'newsletter_move' | 'ex_employee' | 'headhunter' | 'peer_transition'

export interface BridgeContact {
  contact_key: string
  full_name: string
  current_title: string | null
  current_company: string | null
  strength_score: number
  linkedin_url?: string | null
  strength_evidence?: Record<string, unknown> | null
}

export interface BridgeRole {
  job_id: string
  company: string
  title: string
  url: string | null
  score: number | null
}

export interface BridgeRow {
  bridge_id: string
  job_id: string
  contact_key: string | null
  path_tier: BridgeTier
  path_evidence: string
  proximity: string
  bridge_score: number
  draft_ask: string
  state: BridgeState
  surfaced_at: string
  contact: BridgeContact | null
  role: BridgeRole | null
}

export function useBridges() {
  const [bridges, setBridges] = useState<BridgeRow[]>([])
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/bridges')
      const j = await r.json()
      if (j?.ok) {
        setBridges((j.bridges as BridgeRow[]) || [])
        setStateCounts((j.stateCounts as Record<string, number>) || {})
      }
    } catch {
      // the lane renders its quiet empty state; the next poll retries
    }
    setLoading(false)
  }, [])

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

  return { bridges, stateCounts, loading, refetch: load }
}

export async function patchBridge(
  id: string,
  body: { state?: BridgeState; draft_ask?: string },
): Promise<void> {
  const r = await fetch(`/api/bridges/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`)
}
