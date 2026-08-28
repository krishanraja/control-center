import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Single canonical reader of `zara_signals` — Zara's raw market feed, distinct
 * from Marcus's curated `home_intelligence.external_signals` digest.
 *
 * The type lived on NextIntelDesktopHero while desktop was the only consumer;
 * with one Intel tree serving both shells it lives here. Reads go through the
 * anon client (RLS: SELECT only). Status writes do NOT happen here: anon
 * UPDATEs on this table are silent no-ops under the July RLS, so the real
 * `actioned` write rides the /api/bets promote server-side — `markActioned`
 * below only keeps this session's list honest while that lands.
 */
export interface ZaraSignal {
  id: string
  signal_type: string | null
  venture: string | null
  company_name: string | null
  description: string | null
  source_url: string | null
  signal_score: number | null
  status: string | null
  surfaced_at: string | null
  summary: string | null
}

let cache: ZaraSignal[] = []
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('zara_signals')
      .select('*')
      .order('surfaced_at', { ascending: false })
      .limit(30)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useZaraSignals] fetch error', error.message)
    }
    cache = (data as ZaraSignal[]) || []
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

export function useZaraSignals() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!loaded && !inflight) fetchAll()
    return () => { listeners.delete(listener) }
  }, [])

  const markActioned = (id: string) => {
    cache = cache.map(s => (s.id === id ? { ...s, status: 'actioned' } : s))
    notify()
  }

  // Same optimistic-only contract as markActioned: the durable 'declined' write
  // rides POST /api/triage/reject server-side (anon UPDATEs on this table are
  // silent no-ops under RLS), and this keeps the session's list honest until
  // the next fetch reflects it.
  const markDeclined = (id: string) => {
    cache = cache.map(s => (s.id === id ? { ...s, status: 'declined' } : s))
    notify()
  }

  return {
    signals: cache,
    loading: !loaded,
    refresh: () => fetchAll(),
    markActioned,
    markDeclined,
  }
}
