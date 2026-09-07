import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

// The run ledger for the Content Engine's crons.
//
// Every scheduled content job wraps its handler in withContentRun(). The
// wrapper records one content_engine_runs row per invocation: ok, skipped
// (the handler answered with a `skipped` reason), or failed (a non-2xx, an
// `ok: false` body, or a throw). Unauthorised and wrong-method calls are not
// runs and are not recorded. The Content tab reads the ledger and says, in
// the obligation strip, when a job has not succeeded inside its schedule.
//
// A cron that cannot record itself must still run: ledger writes are
// best-effort and never change the handler's response.

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown

export type ContentRunStatus = 'ok' | 'skipped' | 'failed'

export interface ContentRunRecord {
  job: string
  trigger: 'cron' | 'manual' | 'watch'
  status: ContentRunStatus
  reason: string | null
  counts: Record<string, number>
  started_at: string
  finished_at: string
}

const JOB_PATTERN = /^[a-z][a-z0-9_]{1,63}$/

/** Pull the numeric fields off a response body so the ledger carries counts,
 *  never payloads. Nested objects are skipped; the row stays small. */
export function countsFrom(body: unknown): Record<string, number> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && key !== 'schema_version') out[key] = value
  }
  return out
}

/** Decide what a finished handler amounted to. Exported so it can be tested
 *  without a request. */
export function classifyRun(statusCode: number, body: unknown, threw: Error | null): { status: ContentRunStatus; reason: string | null } {
  if (threw) return { status: 'failed', reason: threw.message.slice(0, 600) }
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  if (statusCode >= 400 || record.ok === false) {
    const reason = typeof record.error === 'string' ? record.error : typeof record.skipped === 'string' ? record.skipped : `http_${statusCode}`
    return { status: 'failed', reason: reason.slice(0, 600) }
  }
  if (typeof record.skipped === 'string') return { status: 'skipped', reason: record.skipped.slice(0, 600) }
  if (record.skipped === true) return { status: 'skipped', reason: typeof record.reason === 'string' ? record.reason.slice(0, 600) : null }
  return { status: 'ok', reason: null }
}

export async function recordContentRun(row: ContentRunRecord): Promise<void> {
  try {
    await supabase.from('content_engine_runs').insert(row)
  } catch {
    // Best effort by design: the ledger must never be the reason a cron fails.
  }
}

export function withContentRun(job: string, handler: Handler): Handler {
  if (!JOB_PATTERN.test(job)) throw new Error(`content run job name is invalid: ${job}`)
  return async (req, res) => {
    const startedAt = new Date()
    let payload: unknown = null
    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => { payload = body; return originalJson(body) }) as VercelResponse['json']
    let threw: Error | null = null
    try {
      await handler(req, res)
    } catch (error) {
      threw = error instanceof Error ? error : new Error(String(error))
    }
    const statusCode = res.statusCode
    // Not a run: the caller was refused before the job did anything.
    if (!threw && (statusCode === 401 || statusCode === 403 || statusCode === 405 || statusCode === 204)) {
      return
    }
    const { status, reason } = classifyRun(threw ? 500 : statusCode, payload, threw)
    await recordContentRun({
      job,
      trigger: req.headers['x-vercel-cron'] ? 'cron' : 'manual',
      status,
      reason,
      counts: countsFrom(payload),
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
    })
    if (threw) throw threw
  }
}
