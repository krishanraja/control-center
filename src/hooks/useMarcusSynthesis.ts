import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Single canonical reader of the latest `marcus_synthesis` row — Marcus's
 * weekly cross-domain read (insights, org focus, content recommendation).
 * One row, newest `generated_at` first; the table may be empty on a fresh
 * install, which is a quiet null rather than an error state.
 */
export interface MarcusSynthesis {
  id: string
  week_of: string
  insights: string[]
  cleo_recommendations: string | null
  org_focus: string | null
  generated_at: string | null
}

let cache: MarcusSynthesis | null = null
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

async function fetchLatest(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('marcus_synthesis')
      .select('*')
      .order('generated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (error && error.code !== 'PGRST205' && error.code !== 'PGRST116') {
      console.warn('[useMarcusSynthesis] fetch error', error.message)
    }
    if (data) {
      const raw = data as any
      cache = {
        id: raw.id,
        week_of: raw.week_of,
        // insights is jsonb; a malformed run must not break the card.
        insights: Array.isArray(raw.insights) ? raw.insights.filter((i: unknown) => typeof i === 'string') : [],
        cleo_recommendations: typeof raw.cleo_recommendations === 'string' ? raw.cleo_recommendations : null,
        org_focus: typeof raw.org_focus === 'string' ? raw.org_focus : null,
        generated_at: raw.generated_at ?? null,
      }
    } else {
      cache = null
    }
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

export function useMarcusSynthesis() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!loaded && !inflight) fetchLatest()
    return () => { listeners.delete(listener) }
  }, [])

  return { synthesis: cache, loading: !loaded, refresh: () => fetchLatest() }
}
