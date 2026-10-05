import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { runGa4Batch } from '../_google.js'
import { ymdIn, shiftYmd, isValidTz } from '../_timezone.js'
import { WEB_PROPERTIES, ga4PropertyId, webMetricKeys, type WebProperty, type WebPrefix, type HealthVerdict } from '../../src/lib/webProperties.js'
import {
  snapshotRequests, parseDaily, parseDatedBreakdown, reportMeta, planRestate, classifyGaError, shortGaError, RESTATE_DAYS,
} from '../_webInsightsCore.js'

/**
 * /api/growth/snapshot — daily growth-metrics snapshot for the Growth scoreboard.
 *
 *   GET (cron)                          — Vercel cron daily 05:30 UTC, or
 *                                         Bearer CRON_SECRET. ?dry_run=1 computes
 *                                         without writing.
 *   POST { action:'run', dry_run? }     — manual run.
 *   POST { action:'log', entries:[{metric_key, value}] }
 *                                       — manual-entry fallback ("log counts"),
 *                                         writes source:'manual' for today.
 *
 * Keys written (one row per metric_key per day, upsert on conflict):
 *   substack_publication_total, substack_tech0nomic_total, maven_students,
 *   app_paid_subs, app_mrr_usd, guests_confirmed_30d, visibility_accepted_30d,
 *   and per GA4 property in src/lib/webProperties.ts (four: site_ for
 *   mindmake.co, mymu_ for the makeyourmindup newsletter on
 *   home.makeyourmindup.ai, fulltime_ for fulltime.fm, legibility_ for
 *   legibility.io): <prefix>_sessions_1d, _users_1d, _pageviews_1d,
 *   _key_events_1d.
 *
 * GA4 keys are written against their own day, not today's. Each run restates
 * the last 3 complete days in the PROPERTY's timezone, because Google keeps
 * revising a day for up to 48 hours; a changed value is recorded as a
 * correction. An empty or missing day is written as 0 only when the property
 * is proven to receive data (this read has a nonzero day, or the last site
 * check said ok or quiet). Otherwise the day is held, nothing is written, and
 * any zero this snapshot stored for it earlier is removed. Top source/medium
 * and landing pages land in web_analytics_daily for the written days only.
 *
 * A failed or unparseable external fetch writes NOTHING for that key (never a
 * fake zero). Per-key outcomes and a per-site `ga` block land in
 * system_config.growth_snapshot_status and an audit_log row, with every Google
 * error shortened so no service-account email is written; the scoreboard reads
 * staleness off metric_date age, so a dead feed surfaces as a stale marker
 * without any extra plumbing.
 */

export const config = { maxDuration: 120 }

// `pub` is Substack's own subdomain for a publication, the name its API knows
// it by. Substack keeps it after a custom domain, so 'mindmakerlive' still
// names the publication whose address is home.makeyourmindup.ai since
// 2026-10-05.
const SUBSTACKS: Array<{ key: string; pub: string }> = [
  { key: 'substack_publication_total', pub: 'mindmakerlive' },
  { key: 'substack_tech0nomic_total', pub: 'tech0nomic' },
]

const MAVEN_KEY = 'maven_students'
const MAVEN_URL = 'https://maven.com/mindmaker'

const MANUAL_KEYS = new Set([
  'substack_publication_total', 'substack_tech0nomic_total', 'maven_students',
])

type KeyResult = { ok: boolean; value?: number; error?: string; method?: string }

// Server-side port of the recordHygiene test-row predicate (the client hook
// filters the same way, so scoreboard and MrrTicker agree).
const TEST_PATTERNS = [
  /^\s*test[-_ ]/i, /^\s*test\d/i, /\btest-\d{6,}\b/i, /^\s*demo[-_ ]/i,
  /@(test|example|demo)\.(com|org|net)$/i, /\bplaceholder\b/i, /\blorem ipsum\b/i,
]
const KNOWN_TEST = new Set(['laurenkthermos', 'laurenkthermos@gmail.com'])
function isTestRow(row: Record<string, unknown>): boolean {
  for (const key of ['full_name', 'name', 'email'] as const) {
    const raw = row[key]
    if (typeof raw !== 'string' || !raw.trim()) continue
    if (KNOWN_TEST.has(raw.toLowerCase().trim())) return true
    if (TEST_PATTERNS.some(re => re.test(raw))) return true
  }
  return false
}

/** Parse "12,345", "12K+", "1.2m" style counts into a number. */
function parseCount(raw: string): number | null {
  const m = raw.trim().match(/^([\d.,]+)\s*([kKmM])?\+?$/)
  if (!m) return null
  const base = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  const suffix = (m[2] || '').toLowerCase()
  const mult = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1
  return Math.round(base * mult)
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ControlCenter/1.0; +https://controlcenter.krishraja.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

// Scrape-or-nothing. Live inspection (2026-07-29) showed Substack does NOT
// expose exact counts for these publications (freeSubscriberCount: null, only
// an order-of-magnitude string) and Maven shows no public student count. A web
// -research fallback was tried and produced a confidently wrong number, so it
// was removed: a wrong baseline poisons the scoreboard AND the stall detector.
// The exact-truth paths are the Substack CSV import (the export IS the full
// subscriber list; the import writes source:'reconcile' rows) and the manual
// log-counts widget. The scrapes stay so the feed self-heals if the pages ever
// start exposing counts (e.g. the author enables the public counter).

async function substackCount(pub: string): Promise<KeyResult> {
  try {
    const html = await fetchText(`https://${pub}.substack.com/about`)
    // Visible "N subscribers" marketing line (only present when the author
    // displays it) or the page JSON's freeSubscriberCount when non-null.
    const m = html.match(/([\d.,]+\s*[kKmM]?)\+?\s*(?:free\s+)?subscribers/i)
    let value = m ? parseCount(m[1].replace(/\s+/g, '')) : null
    if (value == null) {
      const j = html.match(/"freeSubscriberCount\\?":\\?"?(\d+)/)
      if (j) value = Number(j[1])
    }
    if (value != null && value > 0) return { ok: true, value, method: 'scrape' }
    return { ok: false, error: 'count not public on page (use CSV import or log counts)' }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

async function mavenCount(): Promise<KeyResult> {
  try {
    const html = await fetchText(MAVEN_URL)
    const m = html.match(/([\d.,]+\s*[kKmM]?)\+?\s*students?/i)
    const value = m ? parseCount(m[1].replace(/\s+/g, '')) : null
    if (value != null && value > 0) return { ok: true, value, method: 'scrape' }
    return { ok: false, error: 'count not public on page (use log counts)' }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

async function ownDbMetrics(): Promise<Record<string, KeyResult>> {
  const out: Record<string, KeyResult> = {}
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const { data: paid, error: custErr } = await supabase
    .from('customers')
    .select('email, full_name, mrr_usd, kind, churned_at')
    .eq('kind', 'paid')
    .is('churned_at', null)
    .limit(2000)
  if (custErr) {
    out.app_paid_subs = { ok: false, error: custErr.message }
    out.app_mrr_usd = { ok: false, error: custErr.message }
  } else {
    const live = (paid || []).filter(r => !isTestRow(r))
    out.app_paid_subs = { ok: true, value: live.length, method: 'db' }
    out.app_mrr_usd = {
      ok: true,
      value: Math.round(live.reduce((s, r) => s + (Number(r.mrr_usd) || 0), 0) * 100) / 100,
      method: 'db',
    }
  }

  const { count: guestCount, error: guestErr } = await supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .gte('updated_at', since30)
  out.guests_confirmed_30d = guestErr
    ? { ok: false, error: guestErr.message }
    : { ok: true, value: guestCount || 0, method: 'db' }

  const { count: visCount, error: visErr } = await supabase
    .from('visibility_targets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .gte('updated_at', since30)
  out.visibility_accepted_30d = visErr
    ? { ok: false, error: visErr.message }
    : { ok: true, value: visCount || 0, method: 'db' }

  return out
}

type Breakdown = ReturnType<typeof parseDatedBreakdown>[number]
type Latest = { health: HealthVerdict; property_id: string | null; id_source: string | null }

interface GaStatus {
  id_source: 'env' | 'default' | 'discovered' | 'none'
  tz: string | null
  empty_reason: string | null
  row_count: number | null
  thresholded: boolean
  host_filter: 'on' | 'off'
  writes: number
  holds: Array<{ metric_date: string; reason: string }>
  deletes: number
  corrections: Array<{ metric_key: string; metric_date: string; from: number; to: number }>
  breakdowns: { source_medium: string; landing_page: string }
}

interface GaResult {
  p: WebProperty
  perKey: Record<string, KeyResult>
  status: GaStatus
  expectedDates: string[]
  writes: ReturnType<typeof planRestate>['writes']
  deletes: ReturnType<typeof planRestate>['deletes']
  rows: Breakdown[]
}

// The newest site check per property: its verdict gates the zero rule, and a
// property id it discovered wins over the env/default one. The table may not
// exist yet (migration not applied): any error reads as "never checked", which
// holds unproven zeros rather than writing them.
async function latestInsights(): Promise<Record<string, Latest>> {
  try {
    const { data, error } = await supabase
      .from('web_property_insights')
      .select('property, health, property_id, id_source, run_at')
      .order('run_at', { ascending: false })
      .limit(20)
    if (error || !Array.isArray(data)) return {}
    const out: Record<string, Latest> = {}
    for (const r of data as Array<Record<string, unknown>>) {
      const k = String(r.property ?? '')
      if (!k || out[k]) continue
      out[k] = {
        health: r.health as HealthVerdict,
        property_id: typeof r.property_id === 'string' && r.property_id ? r.property_id : null,
        id_source: typeof r.id_source === 'string' ? r.id_source : null,
      }
    }
    return out
  } catch {
    return {}
  }
}

// One property: the last RESTATE_DAYS days of headline flows plus the top
// source/medium and landing pages, in one batch. planRestate decides what is
// written, held or removed; a failed read writes nothing and carries its reason.
async function gaProperty(p: WebProperty, latest: Latest | undefined, now: Date): Promise<GaResult> {
  const keys = webMetricKeys(p)
  const perKey: Record<string, KeyResult> = {}
  const resolved = latest?.id_source === 'discovered' && latest.property_id
    ? { id: latest.property_id, from: 'discovered' as const }
    : ga4PropertyId(p, process.env)
  const status: GaStatus = {
    id_source: resolved.from, tz: null, empty_reason: null, row_count: null, thresholded: false, host_filter: 'on',
    writes: 0, holds: [], deletes: 0, corrections: [], breakdowns: { source_medium: 'held', landing_page: 'held' },
  }
  const result: GaResult = { p, perKey, status, expectedDates: [], writes: [], deletes: [], rows: [] }
  const fail = (error: string) => {
    for (const k of keys) perKey[k] = { ok: false, error }
    return result
  }
  if (resolved.from === 'none') return fail(`${p.env} unset and no default`)

  let batch = await runGa4Batch(resolved.id, snapshotRequests(p, { hostFilter: true }))
  if ('error' in batch && classifyGaError(batch) === 'invalid_argument') {
    // hostName with session metrics is not proven on every property; read
    // unfiltered rather than not at all, and say so.
    status.host_filter = 'off'
    batch = await runGa4Batch(resolved.id, snapshotRequests(p, { hostFilter: false }))
  }
  if ('error' in batch) return fail(shortGaError(batch.error))
  const [daily, sources, landings] = batch.reports || []
  if (!daily) return fail('GA4 returned no report')

  const meta = reportMeta(daily)
  const tz = meta.timeZone && isValidTz(meta.timeZone) ? meta.timeZone : 'UTC'
  Object.assign(status, { tz, empty_reason: meta.emptyReason, row_count: meta.rowCount, thresholded: meta.subjectToThresholding })
  const today = ymdIn(now, tz)
  const expectedDates = Array.from({ length: RESTATE_DAYS }, (_, i) => shiftYmd(today, i - RESTATE_DAYS))
  result.expectedDates = expectedDates

  const { data: storedRows, error: storedErr } = await supabase
    .from('growth_metrics')
    .select('metric_key, metric_date, value, source')
    .in('metric_key', keys)
    .in('metric_date', expectedDates)
  // Without the stored rows neither a correction nor a stale ga4 zero can be
  // seen, so the plan would be half a plan. Write nothing this run.
  if (storedErr) return fail(`read stored: ${storedErr.message}`)
  const stored = (storedRows || []).map(r => ({
    metric_key: String(r.metric_key), metric_date: String(r.metric_date), value: Number(r.value), source: String(r.source),
  }))

  const plan = planRestate({ prefix: p.prefix, expectedDates, rows: parseDaily(daily), lastHealth: latest?.health ?? null, stored })
  result.writes = plan.writes
  result.deletes = plan.deletes
  Object.assign(status, { writes: plan.writes.length, holds: plan.holds, deletes: plan.deletes.length, corrections: plan.corrections })

  const last = expectedDates[expectedDates.length - 1]
  const heldLast = plan.holds.find(h => h.metric_date === last)
  for (const k of keys) {
    const w = plan.writes.find(x => x.metric_key === k && x.metric_date === last)
    perKey[k] = w
      ? { ok: true, value: w.value, method: 'ga4' }
      : { ok: false, error: `held: ${heldLast?.reason ?? 'no reading for the latest day'}` }
  }

  const written = new Set(plan.writes.map(w => w.metric_date))
  const keep = (rows: Breakdown[]) => rows.filter(r => written.has(r.metric_date))
  const outcome = (rows: Breakdown[]) => !written.size ? 'held' : rows.length ? `ok ${rows.length} rows` : 'empty'
  const sm = keep(parseDatedBreakdown(sources, p.prefix, 'source_medium'))
  const lp = keep(parseDatedBreakdown(landings, p.prefix, 'landing_page'))
  status.breakdowns = { source_medium: outcome(sm), landing_page: outcome(lp) }
  result.rows = [...sm, ...lp]
  return result
}

async function upsertMetric(metric_key: string, value: number, source: string, meta: Record<string, unknown>, date?: string) {
  const metric_date = date || new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('growth_metrics')
    .upsert(
      { metric_key, metric_date, value, source, meta, captured_at: new Date().toISOString() },
      { onConflict: 'metric_key,metric_date' },
    )
  return error?.message || null
}

async function runSnapshot(dryRun: boolean) {
  const perKey: Record<string, KeyResult> = await ownDbMetrics()
  const counts = await Promise.all(SUBSTACKS.map(s => substackCount(s.pub)))
  SUBSTACKS.forEach((s, i) => { perKey[s.key] = counts[i] })
  perKey[MAVEN_KEY] = await mavenCount()

  const now = new Date()
  const latest = await latestInsights()
  const ga = await Promise.all(WEB_PROPERTIES.map(p => gaProperty(p, latest[p.prefix], now)))
  const gaKeys = new Set<string>()
  const gaRows: Breakdown[] = []
  const gaStatus = {} as Record<WebPrefix, GaStatus>
  const ga4Dates = {} as Record<WebPrefix, string[]>
  for (const g of ga) {
    for (const [k, r] of Object.entries(g.perKey)) { perKey[k] = r; gaKeys.add(k) }
    gaRows.push(...g.rows)
    gaStatus[g.p.prefix] = g.status
    ga4Dates[g.p.prefix] = g.expectedDates
  }

  const written: string[] = []
  const skipped: string[] = []
  const waRows: Breakdown[] = []
  if (!dryRun) {
    for (const [key, r] of Object.entries(perKey)) {
      if (gaKeys.has(key)) continue
      if (r.ok && typeof r.value === 'number') {
        const err = await upsertMetric(key, r.value, 'snapshot', { method: r.method })
        if (err) { r.ok = false; r.error = `upsert: ${err}`; skipped.push(key) }
        else written.push(key)
      } else {
        skipped.push(key)
      }
    }
    for (const g of ga) {
      const tz = g.status.tz
      const capturedAt = new Date().toISOString()
      let upsertErr: string | null = null
      if (g.writes.length) {
        const { error } = await supabase
          .from('growth_metrics')
          .upsert(g.writes.map(w => ({
            metric_key: w.metric_key, metric_date: w.metric_date, value: w.value, source: 'ga4',
            meta: { method: 'ga4', restated: true, provisional: w.provisional, tz }, captured_at: capturedAt,
          })), { onConflict: 'metric_key,metric_date' })
        upsertErr = error?.message || null
        if (upsertErr) { g.status.writes = 0; g.status.corrections = [] }
      }
      // Breakdowns only for days whose headline flows actually landed.
      if (!upsertErr) waRows.push(...g.rows)
      // Only a zero this snapshot wrote itself: the source and value guards sit
      // in the query, so a manual or reconcile row can never be removed here.
      let deleted = 0
      for (const d of g.deletes) {
        const { error } = await supabase
          .from('growth_metrics')
          .delete()
          .eq('metric_key', d.metric_key)
          .eq('metric_date', d.metric_date)
          .eq('source', 'ga4')
          .eq('value', 0)
        if (error) console.warn(`[growth/snapshot] ${g.p.label} delete ${d.metric_key} ${d.metric_date}:`, error.message)
        else deleted++
      }
      g.status.deletes = deleted
      for (const key of webMetricKeys(g.p)) {
        const r = perKey[key]
        if (upsertErr && r.ok) { r.ok = false; r.error = `upsert: ${upsertErr}`; delete r.value }
        if (r.ok) written.push(key)
        else skipped.push(key)
      }
    }
    if (waRows.length) {
      const { error: waErr } = await supabase
        .from('web_analytics_daily')
        .upsert(waRows.map(r => ({ ...r, captured_at: new Date().toISOString() })), { onConflict: 'property,metric_date,dim_type,dim_value' })
      if (waErr) console.warn('[growth/snapshot] web_analytics_daily failed:', waErr.message)
    }
    await supabase.from('system_config').upsert({
      key: 'growth_snapshot_status',
      value: JSON.stringify({ ran_at: new Date().toISOString(), per_key: perKey, ga: gaStatus }),
      updated_at: new Date().toISOString(),
    })
    const { error: logErr } = await supabase.from('audit_log').insert({
      event_type: 'growth_snapshot',
      actor: 'growth-snapshot-cron',
      target: 'growth_metrics',
      display_message: `Growth snapshot: ${written.length} written, ${skipped.length} skipped`,
      details: JSON.stringify({ written, skipped, per_key: perKey, ga: gaStatus }),
    })
    if (logErr) console.warn('[growth/snapshot] audit_log failed:', logErr.message)
  }
  return { per_key: perKey, written, skipped, ga4_dates: ga4Dates, ga: gaStatus, ga4_breakdown_rows: gaRows.length, dry_run: dryRun }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  try {
    if (req.method === 'GET') {
      const result = await runSnapshot(req.query.dry_run === '1')
      return res.json({ ok: true, ...result })
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })

    const body = (req.body || {}) as { action?: string; dry_run?: boolean; entries?: Array<{ metric_key?: string; value?: unknown }> }
    if (body.action === 'run') {
      // The cron-equivalent run must prove the same credential the GET path does.
      // The 'log' branch below is deliberately NOT guarded: it is driven by the
      // Scoreboard UI from the browser, which holds no CRON_SECRET, and it is
      // already constrained to the MANUAL_KEYS allowlist with numeric validation.
      const secret = process.env.CRON_SECRET || ''
      const auth = req.headers.authorization || ''
      if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ ok: false, error: 'unauthorized' })
      }
      const result = await runSnapshot(!!body.dry_run)
      return res.json({ ok: true, ...result })
    }
    if (body.action === 'log') {
      const entries = Array.isArray(body.entries) ? body.entries : []
      const written: string[] = []
      const rejected: Array<{ metric_key?: string; error: string }> = []
      for (const e of entries) {
        const value = Number(e.value)
        if (!e.metric_key || !MANUAL_KEYS.has(e.metric_key)) {
          rejected.push({ metric_key: e.metric_key, error: 'unknown metric_key' }); continue
        }
        if (!Number.isFinite(value) || value < 0) {
          rejected.push({ metric_key: e.metric_key, error: 'value must be a non-negative number' }); continue
        }
        const err = await upsertMetric(e.metric_key, value, 'manual', { logged_via: 'scoreboard' })
        if (err) rejected.push({ metric_key: e.metric_key, error: err })
        else written.push(e.metric_key)
      }
      return res.json({ ok: rejected.length === 0, written, rejected })
    }
    return res.status(400).json({ ok: false, error: "action must be 'run' or 'log'" })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
