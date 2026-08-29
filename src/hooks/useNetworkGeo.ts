import { useCallback, useEffect, useState } from 'react'

// Which countries the network actually contains, from /api/network/geo.
//
// Fetched rather than hardcoded for two reasons. A chip for a country nobody is
// in is a dead end, and the counts are the honest part of this feature: geo is
// resolved for roughly 43% of the corpus, so the filter has to be able to say
// how many people it cannot place. A list without counts would imply the filter
// sees everyone.

export interface GeoFacet {
  code: string
  name: string
  /** GB, AU and US: Krish's three markets, per docs/ICP.md. Rendered inline;
   *  everything else lives behind the overflow. */
  featured: boolean
  n: number
}

export interface GeoState {
  countries: GeoFacet[]
  /** People with no resolved location at all. The number the UI must not hide. */
  unknown: number
  known: number
  total: number
  loading: boolean
  error: string | null
}

const EMPTY: GeoState = { countries: [], unknown: 0, known: 0, total: 0, loading: true, error: null }

// Module-level, not per-mount. The facet list changes when the corpus is
// re-imported, which is not something a tab switch needs to re-check, and the
// Network tab mounts on every navigation back to it.
let cache: Omit<GeoState, 'loading' | 'error'> | null = null
let inflight: Promise<void> | null = null

export function useNetworkGeo() {
  const [state, setState] = useState<GeoState>(() =>
    cache ? { ...cache, loading: false, error: null } : EMPTY)

  const load = useCallback(async () => {
    if (cache) { setState({ ...cache, loading: false, error: null }); return }
    if (!inflight) {
      inflight = (async () => {
        const r = await fetch('/api/network/geo')
        const j = await r.json().catch(() => ({})) as Record<string, unknown>
        if (!r.ok || j.ok === false) throw new Error(String(j.error || `geo failed (${r.status})`))
        cache = {
          countries: (j.countries as GeoFacet[]) || [],
          unknown: Number(j.unknown || 0),
          known: Number(j.known || 0),
          total: Number(j.total || 0),
        }
      })().finally(() => { inflight = null })
    }
    try {
      await inflight
      setState({ ...(cache as Omit<GeoState, 'loading' | 'error'>), loading: false, error: null })
    } catch (e: unknown) {
      // A failed facet fetch must not take the filter bar down with it. The
      // three featured countries are still offered from a static fallback, just
      // without counts, because "UK" being one tap away matters more than the
      // number next to it.
      setState({ ...EMPTY, loading: false, error: (e as Error)?.message || 'Could not load countries' })
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return state
}

/** Shown when the facet fetch fails. Codes only, no counts, because inventing a
 *  count would be worse than showing none. */
export const FALLBACK_FEATURED: GeoFacet[] = [
  { code: 'GB', name: 'United Kingdom', featured: true, n: 0 },
  { code: 'AU', name: 'Australia', featured: true, n: 0 },
  { code: 'US', name: 'United States', featured: true, n: 0 },
]

/** Short labels for the filter bar, where "United Kingdom" does not fit next to
 *  three other chips on a 390px screen. */
export const GEO_SHORT: Record<string, string> = {
  GB: 'UK', AU: 'AU', US: 'USA', NZ: 'NZ', IE: 'IE', CA: 'CA', SG: 'SG', AE: 'UAE', IN: 'IN',
}

export function geoLabel(code: string, name?: string): string {
  return GEO_SHORT[code] || name || code
}
