import { useCallback, useEffect, useState } from 'react'
import type { LogShipInput, PilotMode, PilotState, ShipSummary } from '../types/pilot'

// Single reader of pilot state. Deliberately thin: no realtime channel, no
// shared cache across mounts. The gate reads once on load and the widget reads
// once per mount, because a live-updating ship count would turn the ledger into
// the ambient dashboard the whole layer exists to avoid.

const API = import.meta.env.VITE_API_URL ?? ''

interface PilotStateResult {
  state: PilotState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function usePilotState(): PilotStateResult {
  const [state, setState] = useState<PilotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/pilot/checkin`)
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`)
      setState({
        morning: json.morning,
        last_evening: json.last_evening,
        evening_done_today: json.evening_done_today,
        today: json.today,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the pilot layer')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { state, loading, error, refresh }
}

/** energy <= 2 or anxiety >= 4 routes to red. Everything else is green. */
export function computeMode(energy: number, anxiety: number): PilotMode {
  return energy <= 2 || anxiety >= 4 ? 'red' : 'green'
}

/** The one-line reason shown beside the computed mode, so the routing is legible. */
export function modeReason(energy: number, anxiety: number): string {
  if (energy <= 2 && anxiety >= 4) return `Energy ${energy}, anxiety ${anxiety}. Both point the same way.`
  if (energy <= 2) return `Energy ${energy}. Low enough that choosing is the hard part.`
  if (anxiety >= 4) return `Anxiety ${anxiety}. High enough that a list would become a loop.`
  return `Energy ${energy}, anxiety ${anxiety}. Nothing is in the way.`
}

export async function saveMorning(input: {
  energy: number
  anxiety: number
  one_word: string
  mode: PilotMode
}): Promise<void> {
  const res = await fetch(`${API}/api/pilot/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'morning', ...input }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || `Could not save (${res.status})`)
}

export async function saveEvening(input: {
  shipped_today?: string
  tomorrow_one: string
  tomorrow_one_url?: string
}): Promise<void> {
  const res = await fetch(`${API}/api/pilot/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'evening', ...input }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || `Could not save (${res.status})`)
}

/** Records the red mode escape hatch on today's morning row. */
export async function logOverride(): Promise<void> {
  await fetch(`${API}/api/pilot/checkin`, { method: 'PATCH' }).catch(() => {})
}

export async function logShip(input: LogShipInput): Promise<void> {
  const res = await fetch(`${API}/api/pilot/ships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'manual', ...input }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || `Could not log (${res.status})`)
}

interface ShipSummaryResult {
  summary: ShipSummary | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useShipSummary(): ShipSummaryResult {
  const [summary, setSummary] = useState<ShipSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/pilot/ships`)
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Request failed')
      setSummary({
        this_week: json.this_week,
        days_since_last: json.days_since_last,
        last_ten: json.last_ten || [],
        return_rate: json.return_rate,
      })
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { summary, loading, refresh }
}
