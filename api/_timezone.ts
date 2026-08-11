import { supabase } from './_supabase.js'

/**
 * The operator's civil day, server side.
 *
 * The zone lives in system_config under `operator_timezone` and is the same
 * value the browser holds in localStorage and the SQL views read through
 * public.operator_tz(). One setting, three consumers, so a check-in written by
 * the client, a ships row ingested from n8n, and the pilot_daily rollup all
 * agree on what day it is.
 *
 * Cached per process, in the same shape as the OpenAI key resolution in
 * api/_embeddings.ts. A serverless instance lives minutes, so a zone change
 * propagates on the next cold start at worst, and the routes that matter accept
 * an explicit override anyway.
 */

export const DEFAULT_TZ = 'America/New_York'

let cached: string | undefined
let cachedAt = 0
const TTL_MS = 60_000

/**
 * Any zone this runtime's Intl accepts.
 *
 * This was a three-city allow-list, matched to a three-city picker in the UI.
 * The operator travels, so the list was wrong the first time he landed anywhere
 * else: the browser would send its real zone, the server would reject it as
 * "unsupported", and the day boundary silently stayed on whichever of the three
 * was last stored. Intl is the authority on what is a zone; a hand-kept list
 * beside it is just a list that goes stale.
 *
 * The value still reaches SQL through public.operator_tz(), which passes it to
 * AT TIME ZONE, so an accepted string has to be one Postgres also knows.
 * Postgres carries the full IANA database, which is the same source Intl reads.
 */
export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  // Cheap structural guard first: AT TIME ZONE takes an identifier, and this
  // value is interpolated into date maths on both sides of the wire.
  if (!/^[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z0-9+_-]+){0,2}$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * The zone for THIS request.
 *
 * A caller that knows its own zone wins outright. The browser holds the
 * operator's choice and sends it, so switching zones takes effect on the very
 * next request instead of waiting out a per-instance cache, and two lambda
 * instances can never serve two different days to the same session.
 *
 * The stored setting stays the fallback for callers with no opinion: n8n
 * webhooks, cron, and anything server-only.
 */
export async function resolveTz(req: { query?: unknown; body?: unknown }): Promise<string> {
  const q = (req.query as Record<string, unknown> | undefined)?.tz
  if (isValidTz(q)) return q
  const b = (req.body as Record<string, unknown> | undefined)?.tz
  if (isValidTz(b)) return b
  return getOperatorTz()
}

export async function getOperatorTz(): Promise<string> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached
  try {
    const { data } = await supabase
      .from('system_config').select('value').eq('key', 'operator_timezone').maybeSingle()
    const v = (data as { value?: unknown } | null)?.value
    cached = isValidTz(v) ? v : DEFAULT_TZ
  } catch {
    cached = DEFAULT_TZ
  }
  cachedAt = Date.now()
  return cached
}

export async function setOperatorTz(tz: string): Promise<void> {
  if (!isValidTz(tz)) throw new Error('Unsupported timezone')
  const { error } = await supabase
    .from('system_config')
    .upsert({ key: 'operator_timezone', value: tz, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  cached = tz
  cachedAt = Date.now()
}

// ── Civil date maths, mirroring src/lib/civilDate.ts ─────────────────────────

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(at)
  const num = (t: string) => Number(f.find(p => p.type === t)?.value || '0')
  return {
    y: num('year'), m: num('month'), d: num('day'),
    h: num('hour') % 24, mi: num('minute'), s: num('second'),
    weekday: f.find(p => p.type === 'weekday')?.value || '',
  }
}

export function ymdIn(at: Date, tz: string): string {
  const p = parts(at, tz)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function offsetAt(at: Date, tz: string): number {
  const p = parts(at, tz)
  return at.getTime() - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
}

/**
 * Two passes, because one is wrong twice a year. See the matching note in
 * src/lib/civilDate.ts: on a DST transition day the offset at noon is not the
 * offset at midnight, and a single pass puts the day boundary an hour out.
 */
export function dayStartUtcIn(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const midnight = Date.UTC(y, m - 1, d, 0, 0, 0)
  const first = midnight + offsetAt(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)), tz)
  return new Date(midnight + offsetAt(new Date(first), tz))
}

export function dayEndUtcIn(ymd: string, tz: string): Date {
  return dayStartUtcIn(shiftYmd(ymd, 1), tz)
}

const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Monday of the civil week containing `at`, as YYYY-MM-DD. */
export function weekOfIn(at: Date, tz: string): string {
  const p = parts(at, tz)
  return shiftYmd(ymdIn(at, tz), -(DOW[p.weekday] ?? 0))
}
