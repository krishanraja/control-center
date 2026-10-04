import { useEffect, useMemo, useState } from 'react'
import { canonicalVentureSlug } from '../lib/ventureOptions'
import { newestCheck, type SeoRankResponse, type SeoRankRow } from '../lib/growthWire'

/**
 * Single reader of GET /api/growth/seo-rank: where the products rank on
 * Google, from maya_striking_distance on the service role. The table has RLS
 * on and no policy, so the anon client reads zero rows; this hook never
 * touches the Supabase client.
 *
 * The useWebInsights shape: one fetch shared by every consumer (the Growth
 * signals and the per-lane panels read the same cache), no poll. The rank
 * check runs weekly, so a mount-time read is repeated only when the cache is
 * older than ten minutes.
 *
 * `product` filters on the client, in any slug spelling (ctrl or mm_ctrl), so
 * two panels with different filters share one request.
 *
 * Three states that must not blur: loading (nothing read yet), error (the read
 * failed; the last good rows stay), and an honest empty list (the check has
 * written nothing).
 */

const STALE_MS = 10 * 60_000
const READ_FAILED = 'Could not read the Google rank check.'

let cache: SeoRankResponse | null = null
let fetchedAt = 0
let errorCache: string | null = null
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

function isResponse(json: unknown): json is SeoRankResponse {
  return !!json && typeof json === 'object' && Array.isArray((json as { rows?: unknown }).rows)
}

async function fetchRank(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/growth/seo-rank', { credentials: 'same-origin', cache: 'no-store' })
      // Parsed by hand: under plain `vite` the body is raw TypeScript, and
      // r.json() would put "Unexpected token" on screen.
      const raw = await r.text()
      let json: unknown = null
      try { json = raw ? JSON.parse(raw) : null } catch { json = null }
      if (!r.ok || json == null || typeof json !== 'object' || (json as { ok?: unknown }).ok === false) throw new Error(READ_FAILED)
      // `{ ok: true }` with no rows (every e2e catch-all) is an empty check, not an error.
      cache = isResponse(json) ? json : { ok: true, checked_at: null, count: 0, rows: [] }
      fetchedAt = Date.now()
      errorCache = null
    } catch {
      errorCache = READ_FAILED
    } finally {
      loaded = true
      inflight = null
      notify()
    }
  })()
  return inflight
}

export function useSeoRank(product?: string | null): {
  rows: SeoRankRow[]
  checkedAt: string | null
  loaded: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    const stale = !loaded || Date.now() - fetchedAt > STALE_MS
    if (stale && !inflight) void fetchRank()
    return () => { listeners.delete(listener) }
  }, [])

  const all = cache?.rows
  const want = canonicalVentureSlug(product)
  const rows = useMemo(() => (all ?? []).filter(r => !want || r.product === want), [all, want])
  return { rows, checkedAt: newestCheck(rows), loaded, error: errorCache, refresh: fetchRank }
}
