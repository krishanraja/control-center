import { useEffect, useState } from 'react'

// Predicted reject reasons for one decision card. See
// api/content-decisions/[id]/likely-reasons.ts for how they are derived.
//
// A prediction is a shortcut, never a gate: this hook never blocks, never
// throws, and an empty result simply means the reason bar shows its full
// static set, which is exactly the behaviour without it.

export interface LikelyReason {
  code: string
  because?: string
  confidence?: 'low' | 'medium' | 'high'
}

export interface Likely {
  source: 'history' | 'model' | 'none'
  reasons: LikelyReason[]
}

const EMPTY: Likely = { source: 'none', reasons: [] }

// Predictions are stable per card and the deck revisits cards while browsing,
// so a session cache keeps swiping back and forth free.
const cache = new Map<string, Likely>()

/** Pass null to skip (nothing to predict for, or the bar is closed). */
export function useLikelyReasons(decisionId: string | null): Likely {
  const [likely, setLikely] = useState<Likely>(() =>
    decisionId ? cache.get(decisionId) || EMPTY : EMPTY)

  useEffect(() => {
    if (!decisionId) { setLikely(EMPTY); return }
    const hit = cache.get(decisionId)
    if (hit) { setLikely(hit); return }

    let alive = true
    setLikely(EMPTY)
    fetch(`/api/content-decisions/${decisionId}/likely-reasons`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!alive || !j?.ok) return
        const next: Likely = {
          source: j.source || 'none',
          reasons: Array.isArray(j.reasons) ? j.reasons : [],
        }
        cache.set(decisionId, next)
        setLikely(next)
      })
      .catch(() => { /* the static set is the fallback */ })

    return () => { alive = false }
  }, [decisionId])

  return likely
}
