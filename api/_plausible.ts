import type { PlausibleRead } from './_webInsightsCore.js'

// Plausible Stats API v2, read only, for mindmake.co.
//
// Google Analytics on mindmake.co counts only visitors who press Allow, by
// Krish's design (mindmake r31). Plausible is cookieless, so it counts every
// visit and it holds the site's own events (door clicks, scoping requests). The
// site check reads it next to Google so the card can say both numbers and what
// each one means.
//
// Shape checked against https://plausible.io/docs/stats-api on 2026-09-27:
// POST https://plausible.io/api/v2/query with `Authorization: Bearer <key>` and
// a JSON body { site_id, metrics, date_range, dimensions?, order_by?,
// pagination? }. date_range takes an explicit ["YYYY-MM-DD","YYYY-MM-DD"] pair;
// order_by is a list of [metric, 'desc'] tuples; pagination is { limit, offset }.
// The answer is { results: [{ dimensions: string[], metrics: number[] }], meta,
// query }, metrics in the order asked. The Stats API is a Business plan
// feature; on any other plan query 1 fails and the card asks for the key again.
//
// The key is read at call time and is never logged, returned or put in an error.

const ENDPOINT = 'https://plausible.io/api/v2/query'
const TIMEOUT_MS = 10_000

type Row = { dimensions: string[]; metrics: number[] }

/** Pure: the v2 `results` array, each row's dimensions as strings and metrics as numbers (a non-number is 0). */
export function parsePlausibleResults(json: any): Row[] {
  const rows: any[] = Array.isArray(json?.results) ? json.results : []
  return rows.map(r => ({
    dimensions: Array.isArray(r?.dimensions) ? r.dimensions.map((d: unknown) => String(d ?? '')) : [],
    metrics: Array.isArray(r?.metrics) ? r.metrics.map((m: unknown) => { const n = Number(m); return Number.isFinite(n) ? n : 0 }) : [],
  }))
}

/** Plausible's own error text when it gives one, with anything key-shaped taken out. Max 160 chars. */
function errorText(status: number, json: any): string {
  const said = typeof json?.error === 'string' ? json.error : ''
  return `Plausible ${status}${said ? `: ${said}` : ''}`.replace(/Bearer\s+\S+/gi, 'Bearer [key]').slice(0, 160)
}

/**
 * The week's Plausible facts for one site, or null when no key is set.
 *   1 visitors, visits, pageviews over cur     (a failure here is the whole answer: ok false)
 *   2 visits over prev
 *   3 top visit:source over cur                4 top visit:entry_page over cur
 *   5 events by event:goal over cur            ([] means no goals are set)
 * A failure on 2 to 5 leaves that field null rather than 0: unknown is never zero.
 */
export async function plausibleFacts(siteId: string, range: { cur: [string, string]; prev: [string, string] },
  opts?: { fetchImpl?: typeof fetch; key?: string }): Promise<PlausibleRead | null> {
  const key = (opts?.key ?? process.env.PLAUSIBLE_API_KEY ?? '').trim()
  if (!key) return null
  const doFetch = opts?.fetchImpl ?? fetch

  const query = async (body: Record<string, unknown>): Promise<{ ok: true; rows: Row[] } | { ok: false; status: number; error: string }> => {
    try {
      const r = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ site_id: siteId, ...body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const json: any = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, status: r.status, error: errorText(r.status, json) }
      return { ok: true, rows: parsePlausibleResults(json) }
    } catch (e: any) {
      const msg = String(e?.name === 'TimeoutError' ? 'timed out' : e?.message || e)
      return { ok: false, status: 0, error: `Plausible: ${msg}`.replace(/Bearer\s+\S+/gi, 'Bearer [key]').slice(0, 160) }
    }
  }

  const head = await query({ metrics: ['visitors', 'visits', 'pageviews'], date_range: range.cur })
  if ('error' in head) {
    return { ok: false, status: head.status, error: head.error, visits7d: 0, visitsPrev7d: null, visitors7d: 0, pageviews7d: 0,
      topSource: null, topPage: null, goals: null }
  }
  const top = (dimension: string) => query({
    metrics: ['visits'], dimensions: [dimension], order_by: [['visits', 'desc']], pagination: { limit: 1 }, date_range: range.cur,
  })
  const [prev, source, page, goals] = await Promise.all([
    query({ metrics: ['visits'], date_range: range.prev }),
    top('visit:source'),
    top('visit:entry_page'),
    query({ metrics: ['events'], dimensions: ['event:goal'], date_range: range.cur }),
  ])
  const m = head.rows[0]?.metrics ?? []
  const firstDim = (q: typeof source) => ('rows' in q ? q.rows[0]?.dimensions[0] || null : null)
  return {
    ok: true, status: 200, error: null,
    visitors7d: m[0] ?? 0, visits7d: m[1] ?? 0, pageviews7d: m[2] ?? 0,
    visitsPrev7d: 'rows' in prev ? (prev.rows[0]?.metrics[0] ?? 0) : null,
    topSource: firstDim(source),
    topPage: firstDim(page),
    goals: 'rows' in goals
      ? goals.rows.filter(r => r.dimensions[0]).map(r => ({ name: r.dimensions[0], events: r.metrics[0] ?? 0 }))
      : null,
  }
}
