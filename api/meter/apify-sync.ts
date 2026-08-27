import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { dayKey, replaceDays, type MeterRow } from '../_meter.js'
import { checkMoneyLines, type MoneyAlertResult } from '../_moneyAlerts.js'

// Apify, per actor, in dollars.
//
// Apify's monthly-usage endpoint gives one number for the whole account, which
// is the number that was already on the invoice and never the number that
// answers "what is spending my money". The per-run list does answer it: every
// run carries its own usageTotalUsd, the actor that ran, and where the run was
// started from. Rolled up by actor x day x origin, that is the ranked list of
// what the OS actually spends money on.
//
//   GET (CRON_SECRET) — hourly   ·   POST — manual re-sync
//   ?days=N  how far back to recompute (default 3, max 31)
//
// Idempotent by construction: a whole day is recomputed from Apify's own run
// records and written over whatever was there. Re-running, or overlapping
// windows, cannot double-count.
//
// What this does NOT claim: which n8n workflow or which agent triggered a run.
// Apify's API carries no user-supplied run label — meta.origin is the finest
// attribution it exposes, so that is what is recorded, whatever it says. The
// first live sync returned API, MCP and WEB; the value is passed through
// rather than mapped onto a fixed list, because a new origin appearing is
// information and an UNKNOWN bucket would destroy it. Guessing the caller from
// timing would produce a number that looks like an answer and isn't.

const APIFY_BASE = 'https://api.apify.com/v2'
const PAGE = 1000
const MAX_PAGES = 10
/** Actor-name lookups are one HTTP call each; the cache makes them rare. */
const MAX_NAME_LOOKUPS = 40

interface ApifyRun {
  id?: string
  actId?: string
  actorTaskId?: string | null
  status?: string
  startedAt?: string
  finishedAt?: string | null
  usageTotalUsd?: number | null
  usage?: Record<string, number | null> | null
  meta?: { origin?: string | null } | null
}

async function apify<T>(token: string, path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(`${APIFY_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await r.text().catch(() => '')
    if (!r.ok) return { data: null, error: `apify_${r.status}: ${body.replace(/\s+/g, ' ').slice(0, 180)}` }
    const j = JSON.parse(body) as { data?: T }
    return { data: (j?.data ?? null) as T | null, error: null }
  } catch (e) {
    return { data: null, error: String((e as Error)?.message || e).slice(0, 180) }
  }
}

/**
 * actId -> "username/actor-name".
 *
 * Seeded from labels the meter already resolved, so a steady-state sync spends
 * no extra calls at all; only an actor seen for the first time costs a lookup,
 * and the number of those is capped so a burst of new actors cannot stall the
 * run. An unresolved id is stored as itself rather than as a blank.
 */
async function resolveNames(token: string, actIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const { data: known } = await supabase
    .from('meter_daily')
    .select('unit_key, unit_label')
    .eq('provider', 'apify')
    .eq('unit_kind', 'actor')
    .not('unit_label', 'is', null)
    .limit(2000)
  for (const r of (known || []) as Array<{ unit_key: string; unit_label: string }>) {
    if (r.unit_label && r.unit_label !== r.unit_key) names.set(r.unit_key, r.unit_label)
  }

  let looked = 0
  for (const id of actIds) {
    if (names.has(id) || looked >= MAX_NAME_LOOKUPS) continue
    looked++
    const { data } = await apify<{ username?: string; name?: string }>(token, `/acts/${encodeURIComponent(id)}`)
    if (data?.name) names.set(id, data.username ? `${data.username}/${data.name}` : data.name)
  }
  return names
}

/** actor_slug -> task_category, from the curated registry the agents pick from. */
async function actorCategories(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const { data } = await supabase
      .from('apify_actor_registry')
      .select('actor_slug, task_category')
      .limit(500)
    for (const r of (data || []) as Array<{ actor_slug: string; task_category: string }>) {
      if (r.actor_slug) out.set(r.actor_slug.toLowerCase(), r.task_category)
    }
  } catch { /* an unregistered actor keeps a null category, which is the truth */ }
  return out
}

export interface ApifySyncResult {
  days: number
  runs_read: number
  actors: number
  usd_in_window: number
  rows_written: number
  cycle: { start: string | null; end: string | null; usd: number | null; included_usd: number | null } | null
  /** Actors that ran but are not in apify_actor_registry — spend nobody chose. */
  unregistered: string[]
  truncated: boolean
  /** Money lines evaluated after the sync, while the cycle numbers are fresh. */
  alerts: MoneyAlertResult | null
  errors: string[]
}

export async function syncApify(days: number): Promise<ApifySyncResult> {
  const token = process.env.APIFY_TOKEN
  const errors: string[] = []
  if (!token) {
    return {
      days, runs_read: 0, actors: 0, usd_in_window: 0, rows_written: 0,
      cycle: null, unregistered: [], truncated: false, alerts: null,
      errors: ['APIFY_TOKEN not configured'],
    }
  }

  // Whole UTC days, so a recomputed day is genuinely the whole day.
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
  since.setUTCHours(0, 0, 0, 0)
  const startedAfter = since.toISOString()

  // Ascending, so offset paging is stable while new runs land mid-sync.
  const runs: ApifyRun[] = []
  let truncated = false
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await apify<{ items?: ApifyRun[] }>(
      token,
      `/actor-runs?startedAfter=${encodeURIComponent(startedAfter)}&limit=${PAGE}&offset=${page * PAGE}&desc=0`,
    )
    if (error) { errors.push(error); break }
    const items = data?.items || []
    runs.push(...items)
    if (items.length < PAGE) break
    if (page === MAX_PAGES - 1) truncated = true
  }

  const actIds = [...new Set(runs.map(r => r.actId).filter((x): x is string => !!x))]
  const [names, categories] = await Promise.all([resolveNames(token, actIds), actorCategories()])

  // actor x day x origin.
  const cells = new Map<string, MeterRow>()
  let usdInWindow = 0
  for (const run of runs) {
    const actId = run.actId
    if (!actId || !run.startedAt) continue
    const day = dayKey(run.startedAt)
    if (!day || day < dayKey(since)) continue
    const origin = (run.meta?.origin || 'UNKNOWN').toUpperCase()
    const label = names.get(actId) || actId
    const usd = Number(run.usageTotalUsd) || 0
    usdInWindow += usd

    const id = `${actId}|${day}|${origin}`
    let cell = cells.get(id)
    if (!cell) {
      cell = {
        provider: 'apify', unit_kind: 'actor', unit_key: actId, day, bucket: origin,
        unit_label: label, category: categories.get(label.toLowerCase()) ?? null,
        // unit_name stays NULL until a run actually reports compute units. The
        // first live sync proved why: /v2/actor-runs returns the SHORTENED run
        // object — usageTotalUsd but no `usage` breakdown — so claiming
        // 'compute-units' here stored a measured-looking 0 for every actor.
        // Reading the full run per id would cost 30+ extra calls a sync for a
        // secondary metric we already have the dollars for. Dollars are the
        // answer; an unreported unit says nothing rather than zero.
        usd: 0, runs: 0, failed: 0, units: 0, unit_name: null,
      }
      cells.set(id, cell)
    }
    cell.usd += usd
    cell.runs += 1
    if (run.status && run.status !== 'SUCCEEDED') cell.failed += 1
    const cu = Number(run.usage?.ACTOR_COMPUTE_UNITS)
    if (Number.isFinite(cu) && cu > 0) {
      cell.units += cu
      cell.unit_name = 'compute-units'
    }
  }

  const rows = [...cells.values()].map(r => ({ ...r, usd: Math.round(r.usd * 1e6) / 1e6 }))
  const written = await replaceDays(rows)
  if (written.error) errors.push(`meter_write: ${written.error}`)

  const unregistered = [...new Set(
    rows.filter(r => r.category === null && r.usd > 0).map(r => r.unit_label || r.unit_key),
  )].sort()

  const cycle = await syncCycle(token, errors)

  // Alerting runs HERE, right after the cycle numbers are refreshed, rather
  // than on the read path: /api/spend is polled by every open tab, and an
  // alert that fires from a render is an alert that fires as often as someone
  // looks at it.
  let alerts: MoneyAlertResult | null = null
  try {
    alerts = await checkMoneyLines('apify-sync')
    errors.push(...alerts.errors)
  } catch (e) {
    errors.push(`alerts: ${String((e as Error)?.message || e).slice(0, 140)}`)
  }

  return {
    days,
    runs_read: runs.length,
    actors: actIds.length,
    usd_in_window: Math.round(usdInWindow * 100) / 100,
    rows_written: written.written,
    cycle,
    unregistered,
    truncated,
    alerts,
    errors,
  }
}

/**
 * The billing cycle as Apify itself defines it, onto service_registry.
 *
 * A calendar month would be wrong: the plan renews mid-month, and the prepaid
 * $29 resets with the cycle, not with the 1st. The vendor reports the window,
 * so the vendor's window is what gets stored.
 *
 * This deliberately does NOT write `balance`. The connections sweep owns that
 * column and now computes prepaid headroom itself; two writers of one number is
 * how a column comes to mean two things.
 */
async function syncCycle(token: string, errors: string[]): Promise<ApifySyncResult['cycle']> {
  const { data, error } = await apify<{
    usageCycle?: { startAt?: string; endAt?: string }
    totalUsageCreditsUsdAfterVolumeDiscount?: number
    totalUsageCreditsUsdBeforeVolumeDiscount?: number
  }>(token, '/users/me/usage/monthly')
  if (error || !data) {
    if (error) errors.push(error)
    return null
  }

  // After the volume discount is what Apify actually bills.
  const usd = Number(
    data.totalUsageCreditsUsdAfterVolumeDiscount ?? data.totalUsageCreditsUsdBeforeVolumeDiscount ?? NaN,
  )
  const start = data.usageCycle?.startAt ? dayKey(data.usageCycle.startAt) : null
  const end = data.usageCycle?.endAt ? dayKey(data.usageCycle.endAt) : null

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (Number.isFinite(usd)) patch.cycle_usd = Math.round(usd * 100) / 100
  if (start) patch.cycle_start = start
  if (end) patch.cycle_end = end

  let included: number | null = null
  try {
    const { data: reg } = await supabase
      .from('service_registry').select('included_usd').eq('key', 'apify').maybeSingle()
    included = (reg as { included_usd: number | null } | null)?.included_usd ?? null
    await supabase.from('service_registry').update(patch).eq('key', 'apify')
  } catch (e) {
    errors.push(`cycle_write: ${String((e as Error)?.message || e).slice(0, 120)}`)
  }

  return { start, end, usd: Number.isFinite(usd) ? Math.round(usd * 100) / 100 : null, included_usd: included }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const raw = Number(req.query.days ?? (req.body as { days?: number } | undefined)?.days ?? 3)
  const days = Math.min(31, Math.max(1, Number.isFinite(raw) ? Math.trunc(raw) : 3))
  try {
    const result = await syncApify(days)
    return res.status(200).json({ ok: result.errors.length === 0, ...result })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e).slice(0, 300) })
  }
}
