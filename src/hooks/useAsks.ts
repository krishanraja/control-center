import { useCallback, useEffect, useState } from 'react'
import type { AskState, PilotAskOutcome } from '../types/pilot'
import { getZone } from '../lib/civilDate'

// Reader and writers for the daily ask, deliberately as thin as usePilot: one
// read per mount, no realtime channel, no cache. The ask card is a place to
// act, not a feed to watch.

const API = import.meta.env.VITE_API_URL ?? ''
const withTz = (path: string) => `${API}${path}${path.includes('?') ? '&' : '?'}tz=${encodeURIComponent(getZone())}`
const tzBody = (o: Record<string, unknown>) => JSON.stringify({ ...o, tz: getZone() })

interface AskStateResult {
  state: AskState | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useAskState(): AskStateResult {
  const [state, setState] = useState<AskState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(withTz('/api/pilot/asks'))
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`)
      setState({
        today_ask: json.today_ask ?? null,
        unresolved: json.unresolved ?? null,
        today: json.today,
      })
    } catch {
      // Fail soft, like every pilot read: an unreachable route renders the
      // card's compose state rather than an error the operator must manage.
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { state, loading, refresh }
}

export async function saveAsk(input: {
  ask_text: string
  predicted_no_pct?: number | null
  mark_sent?: boolean
}): Promise<void> {
  const res = await fetch(`${API}/api/pilot/asks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: tzBody({ ...input }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || `Could not save (${res.status})`)
}

export async function resolveAsk(id: string, outcome: PilotAskOutcome): Promise<void> {
  const res = await fetch(`${API}/api/pilot/asks`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, outcome }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || `Could not save (${res.status})`)
}
