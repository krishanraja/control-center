import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { dayKey, replaceDays, type MeterRow } from '../_meter.js'

// n8n, per workflow, in executions.
//
// n8n Cloud bills by EXECUTION, not by dollar, and its API reports no price at
// all. So this records executions and leaves usd at 0 rather than inventing a
// per-execution rate and presenting the product of two guesses as a cost. The
// console reads unit_name to say what the number counts, so an n8n row ranks
// on volume beside an Apify row that ranks on money without either pretending
// to be the other.
//
//   GET (CRON_SECRET) — hourly   ·   POST — manual re-sync
//   ?days=N  how far back to recompute (default 3, max 31)
//
// The window is short on purpose: n8n Cloud prunes execution history, so asking
// for thirty days mostly returns whatever survived the prune and would make a
// quiet retention policy look like a quiet workflow.
//
// Idempotent like the Apify sync: whole days are recomputed and written over.

const PAGE = 250
const MAX_PAGES = 20

interface N8nExecution {
  id?: number | string
  workflowId?: string | number
  mode?: string
  status?: string
  finished?: boolean
  startedAt?: string
  stoppedAt?: string | null
}

function base(): string {
  return (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')
}

async function n8n<T>(key: string, path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(`${base()}/api/v1${path}`, {
      headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await r.text().catch(() => '')
    if (!r.ok) return { data: null, error: `n8n_${r.status}: ${body.replace(/\s+/g, ' ').slice(0, 180)}` }
    return { data: JSON.parse(body) as T, error: null }
  } catch (e) {
    return { data: null, error: String((e as Error)?.message || e).slice(0, 180) }
  }
}

/** workflowId -> name. One paged read; an unnamed id is stored as itself. */
async function workflowNames(key: string, errors: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  let cursor: string | null = null
  for (let page = 0; page < 8; page++) {
    const q: string = `/workflows?limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const { data, error } = await n8n<{ data?: Array<{ id?: string | number; name?: string }>; nextCursor?: string | null }>(key, q)
    if (error) { errors.push(error); break }
    for (const w of data?.data || []) {
      if (w.id != null && w.name) names.set(String(w.id), w.name)
    }
    cursor = data?.nextCursor || null
    if (!cursor) break
  }
  return names
}

export interface N8nSyncResult {
  days: number
  executions_read: number
  workflows: number
  failures: number
  rows_written: number
  truncated: boolean
  /** Oldest execution the API still holds, so a short window reads as retention
   *  rather than as silence. */
  oldest_seen: string | null
  errors: string[]
}

export async function syncN8n(days: number): Promise<N8nSyncResult> {
  const key = process.env.N8N_API_KEY
  const errors: string[] = []
  if (!key) {
    return {
      days, executions_read: 0, workflows: 0, failures: 0, rows_written: 0,
      truncated: false, oldest_seen: null, errors: ['N8N_API_KEY not configured'],
    }
  }

  const since = new Date(Date.now() - (days - 1) * 86_400_000)
  since.setUTCHours(0, 0, 0, 0)
  const sinceDay = dayKey(since)

  // The public executions API has no date filter, so this pages newest-first
  // and stops at the window edge rather than reading the whole history.
  const executions: N8nExecution[] = []
  let cursor: string | null = null
  let truncated = false
  let oldest: string | null = null
  let reachedEdge = false

  for (let page = 0; page < MAX_PAGES && !reachedEdge; page++) {
    const q: string = `/executions?limit=${PAGE}&includeData=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const { data, error } = await n8n<{ data?: N8nExecution[]; nextCursor?: string | null }>(key, q)
    if (error) { errors.push(error); break }
    const items = data?.data || []
    for (const e of items) {
      const day = e.startedAt ? dayKey(e.startedAt) : ''
      if (!day) continue
      if (!oldest || day < oldest) oldest = day
      if (day < sinceDay) { reachedEdge = true; continue }
      executions.push(e)
    }
    cursor = data?.nextCursor || null
    if (!cursor) break
    if (page === MAX_PAGES - 1 && !reachedEdge) truncated = true
  }

  const names = await workflowNames(key, errors)

  // workflow x day x mode.
  const cells = new Map<string, MeterRow>()
  let failures = 0
  for (const e of executions) {
    const wf = e.workflowId == null ? '' : String(e.workflowId)
    if (!wf || !e.startedAt) continue
    const day = dayKey(e.startedAt)
    const mode = (e.mode || 'unknown').toLowerCase()
    // n8n reports both `status` and the older `finished` flag; a run is a
    // failure if either says so.
    const failed = e.status === 'error' || e.status === 'crashed' || e.finished === false
    if (failed) failures++

    const id = `${wf}|${day}|${mode}`
    let cell = cells.get(id)
    if (!cell) {
      cell = {
        provider: 'n8n', unit_kind: 'workflow', unit_key: wf, day, bucket: mode,
        unit_label: names.get(wf) || wf, category: null,
        // Dollars stay at zero deliberately: n8n prices executions, not usage,
        // and the OS does not know the per-execution rate.
        usd: 0, runs: 0, failed: 0, units: 0, unit_name: 'executions',
      }
      cells.set(id, cell)
    }
    cell.runs += 1
    cell.units += 1
    if (failed) cell.failed += 1
  }

  const rows = [...cells.values()]
  const written = await replaceDays(rows)
  if (written.error) errors.push(`meter_write: ${written.error}`)

  return {
    days,
    executions_read: executions.length,
    workflows: new Set(rows.map(r => r.unit_key)).size,
    failures,
    rows_written: written.written,
    truncated,
    oldest_seen: oldest,
    errors,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const raw = Number(req.query.days ?? (req.body as { days?: number } | undefined)?.days ?? 3)
  const days = Math.min(31, Math.max(1, Number.isFinite(raw) ? Math.trunc(raw) : 3))
  try {
    const result = await syncN8n(days)
    return res.status(200).json({ ok: result.errors.length === 0, ...result })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e).slice(0, 300) })
  }
}
