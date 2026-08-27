import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Single canonical reader of the latest `marcus_synthesis` row — Marcus's
 * weekly cross-domain read (insights, org focus, content recommendation).
 * One row, newest `generated_at` first; the table may be empty on a fresh
 * install, which is a quiet null rather than an error state.
 */
/**
 * One cross-domain insight, and what to do about it.
 *
 * The synthesis prompt has always said "Insights must be specific and
 * actionable. Summaries are a failure", and the schema did not back it: every
 * sibling field carried an action (external_signals has recommended_action,
 * customer_voice has recommended_response, metrics has interpretation) while
 * the three headline insights were bare strings. So they rendered as a
 * bulleted read with no verb in it.
 *
 * `action` is optional because rows written before the schema change hold
 * plain strings, and a historical insight is still worth showing. */
export interface MarcusInsight {
  insight: string
  action?: string
}

export interface MarcusSynthesis {
  id: string
  week_of: string
  insights: MarcusInsight[]
  cleo_recommendations: string | null
  org_focus: string | null
  generated_at: string | null
}

let cache: MarcusSynthesis | null = null
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

/** Normalise both stored shapes into MarcusInsight. Exported for the spec. */
export function readInsights(raw: unknown[]): MarcusInsight[] {
  const out: MarcusInsight[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ insight: item.trim() })
      continue
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const text = typeof o.insight === 'string' ? o.insight.trim() : ''
      if (!text) continue
      const action = typeof o.action === 'string' && o.action.trim() ? o.action.trim() : undefined
      out.push({ insight: text, action })
    }
  }
  return out
}

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
        // insights is jsonb, and holds two shapes: plain strings from before
        // the action field existed, objects after. Both render; a malformed
        // run must not break the card.
        insights: Array.isArray(raw.insights) ? readInsights(raw.insights) : [],
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
