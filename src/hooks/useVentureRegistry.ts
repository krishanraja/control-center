import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface VentureRow {
  slug: string
  display_name: string
  kind: string
  icp_description: string
  scoring_criteria: Record<string, unknown> | null
  active: boolean
  sort_order: number
  // Acquisition autonomy ladder (select('*') already returns these; typed so
  // the Growth surfaces can consume them). L1 = every send approved,
  // L2 = 1-in-10 sampled, L3 = exception only.
  autonomy_level?: 'L1' | 'L2' | 'L3'
  autonomy_history?: Array<Record<string, unknown>> | null
  // Per-lane voice + marketing strategy: every copy-producing path (sequences,
  // nurture personalization, replies, win-backs) must conform to this.
  voice_profile?: {
    sender?: string
    mailbox?: string
    voice?: string
    icp?: string
    strategy?: string
    channels?: string[]
    never_say?: string[]
  } | null
}

let cache: VentureRow[] = []
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function loadOnce(): Promise<void> {
  if (loaded) return
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('venture_registry')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error && error.code !== 'PGRST205') {
      console.warn('[useVentureRegistry] fetch error', error.message)
    }
    cache = (data as VentureRow[]) || []
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

export function useVentureRegistry() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!loaded) loadOnce()
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return { ventures: cache, loading: !loaded }
}
