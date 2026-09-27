import { useEffect, useState } from 'react'
import { requestJson, failureMessage } from '../lib/apiFetch'
import type { WebInsightsResponse, WebPrefix } from '../lib/webProperties'

/**
 * Single reader of GET /api/growth/web-insights: one honest read per site per
 * day, from web_property_insights on the service role (the table is not
 * readable with the anon key, so this never touches the Supabase client).
 *
 * The useFleetFunnel singleton shape: one fetch for every consumer (the Growth
 * hero and the Site visits panel read the same cache), no poll. The check runs
 * once a day at 13:20 UTC, so a mount-time read is refreshed only when the
 * cache is older than ten minutes. Anything fresher is the same answer.
 *
 * Three states that must not blur into each other:
 *   - empty: the route answered with no `properties` array (`{ ok: true }`,
 *     which is also what every e2e catch-all returns). Nothing has been read
 *     yet. Not an error.
 *   - error: the body was not JSON, or the route refused. The last good value
 *     stays on screen; a failed read is not four empty sites.
 *   - data: always four views, in registry order.
 */

const STALE_MS = 10 * 60_000
const READ_FAILED = 'Could not read the site visits.'

let cache: WebInsightsResponse | null = null
let fetchedAt = 0
let errorCache: string | null = null
let empty = false
let loaded = false
let refreshing = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

function isResponse(json: unknown): json is WebInsightsResponse {
  return !!json && typeof json === 'object' && Array.isArray((json as { properties?: unknown }).properties)
}

async function fetchInsights(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/growth/web-insights', { credentials: 'same-origin', cache: 'no-store' })
      // Read the body once and parse it ourselves: under plain `vite` or a
      // proxy error page the body is HTML or raw TypeScript, and r.json()
      // would put "Unexpected token" on screen.
      const raw = await r.text()
      let json: unknown = null
      try { json = raw ? JSON.parse(raw) : null } catch { json = null }
      if (!r.ok || json == null || typeof json !== 'object' || (json as { ok?: unknown }).ok === false) {
        throw new Error(READ_FAILED)
      }
      if (isResponse(json)) {
        cache = json
        empty = false
      } else {
        cache = null
        empty = true
      }
      fetchedAt = Date.now()
      errorCache = null
    } catch {
      // Keep the last good value: a failed read is not a site with no visits.
      errorCache = READ_FAILED
    } finally {
      loaded = true
      inflight = null
      notify()
    }
  })()
  return inflight
}

export type WebRefreshResult = { result: 'ok' | 'too_soon' | 'failed'; retryAfterS?: number; message?: string }

/**
 * Check now. POSTs `{ action: 'refresh' }`, which runs the whole check (four
 * properties, probes, at most a model call) inside the route's 300 s budget,
 * so the timeout is generous. A 429 is not a failure: it carries how long
 * until the next check is allowed, and the caller says so. That is why this
 * uses requestJson rather than requestOk: requestOk throws on the 429 and the
 * `retry_after_s` in its body is lost with it.
 */
async function refreshInsights(): Promise<WebRefreshResult> {
  refreshing = true
  notify()
  try {
    const { status, ok, json } = await requestJson<Record<string, unknown>>('/api/growth/web-insights', {
      method: 'POST',
      body: { action: 'refresh' },
      timeoutMs: 110_000,
    })
    if (status === 429) {
      const s = Number(json?.retry_after_s)
      return { result: 'too_soon', retryAfterS: Number.isFinite(s) && s > 0 ? s : 600 }
    }
    if (!ok || !json || json.ok === false || !isResponse(json)) {
      // The same sentence requestOk + failureMessage would give: the route's
      // own reason when it named one, the fallback otherwise.
      const detail = typeof json?.error === 'string' ? json.error.trim() : ''
      return { result: 'failed', message: detail ? (/[.!?]$/.test(detail) ? detail : `${detail}.`) : 'Could not check the sites.' }
    }
    cache = json
    empty = false
    errorCache = null
    fetchedAt = Date.now()
    loaded = true
    return { result: 'ok' }
  } catch (e) {
    return { result: 'failed', message: failureMessage(e, 'Could not check the sites.') }
  } finally {
    refreshing = false
    notify()
  }
}

export function useWebInsights(): {
  data: WebInsightsResponse | null
  loaded: boolean
  error: string | null
  empty: boolean
  refreshing: boolean
  refresh: () => Promise<WebRefreshResult>
} {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    const stale = !loaded || Date.now() - fetchedAt > STALE_MS
    if (stale && !inflight) void fetchInsights()
    return () => { listeners.delete(listener) }
  }, [])

  return { data: cache, loaded, error: errorCache, empty, refreshing, refresh: refreshInsights }
}

/**
 * The Growth hero's web branch. Only setup rungs (1 and 2) reach it: while a
 * site is not being counted, every other number on the tab is blind to it and
 * the fix is one sitting. Rulings (rung 4) and growth actions stay on the cards.
 */
export function webHero(data: WebInsightsResponse | null): { headline: string; sub: string; prefix: WebPrefix | 'shared' } | null {
  if (!data) return null
  const shared = data.shared_action
  if (shared && shared.rung <= 2) {
    return { headline: shared.hero_line ?? shared.title, sub: 'Until then a quiet site and a broken one look the same.', prefix: 'shared' }
  }
  for (const p of data.properties) {
    if (p.action && p.action.rung <= 2) {
      return { headline: p.action.hero_line ?? p.action.title, sub: `${p.label} is not being counted yet.`, prefix: p.prefix }
    }
  }
  return null
}
