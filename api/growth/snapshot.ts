import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { runGa4Report } from '../_google.js'

/**
 * /api/growth/snapshot — daily growth-metrics snapshot for the Home scoreboard.
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
 *   substack_makeyourmindup_total, and per GA4 property (prefix site_ for
 *   mindmake.co, mymu_ for the makeyourmindup Substack):
 *   <prefix>_sessions_1d, _users_1d, _pageviews_1d, _key_events_1d.
 *
 * GA4 keys are YESTERDAY's complete day and are written against that date, not
 * today's. Top source/medium and landing pages for the same day land in
 * web_analytics_daily. A property whose env id is unset is skipped by name.
 *
 * A failed or unparseable external fetch writes NOTHING for that key (never a
 * fake zero). Per-key outcomes land in system_config.growth_snapshot_status and
 * an audit_log row; the scoreboard reads staleness off metric_date age, so a
 * dead feed surfaces as a stale marker without any extra plumbing.
 */

const SUBSTACKS: Array<{ key: string; pub: string }> = [
  { key: 'substack_publication_total', pub: 'mindmakerlive' },
  { key: 'substack_tech0nomic_total', pub: 'tech0nomic' },
  { key: 'substack_makeyourmindup_total', pub: 'makeyourmindup' },
]

// GA4 properties, by numeric property id (GA Admin → Property details), not the
// G- measurement id. The service account must be a Viewer on each.
const GA4_PROPERTIES: Array<{ prefix: string; env: string; label: string }> = [
  { prefix: 'site', env: 'GA4_PROPERTY_MINDMAKE_SITE', label: 'mindmake.co' },
  { prefix: 'mymu', env: 'GA4_PROPERTY_MAKEYOURMINDUP', label: 'makeyourmindup' },
]
const GA4_METRICS: Array<{ name: string; suffix: string }> = [
  { name: 'sessions', suffix: 'sessions_1d' },
  { name: 'activeUsers', suffix: 'users_1d' },
  { name: 'screenPageViews', suffix: 'pageviews_1d' },
  { name: 'keyEvents', suffix: 'key_events_1d' },
]
const GA4_BREAKDOWNS: Array<{ dim: string; dim_type: string }> = [
  { dim: 'sessionSourceMedium', dim_type: 'source_medium' },
  { dim: 'landingPagePlusQueryString', dim_type: 'landing_page' },
]
const GA4_TOP_N = 25
const MAVEN_KEY = 'maven_students'
const MAVEN_URL = 'https://maven.com/mindmaker'

const MANUAL_KEYS = new Set([
  'substack_publication_total', 'substack_tech0nomic_total', 'substack_makeyourmindup_total', 'maven_students',
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

type Ga4Breakdown = { property: string; metric_date: string; dim_type: string; dim_value: string; sessions: number; users: number; key_events: number }

function yesterdayUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

// One property: headline totals for yesterday plus the top source/medium and
// landing pages. A report that succeeds with no rows is a real zero (no
// traffic); a report that fails writes nothing and carries its reason.
async function ga4Property(p: { prefix: string; env: string; label: string }, date: string): Promise<{ perKey: Record<string, KeyResult>; rows: Ga4Breakdown[] }> {
  const perKey: Record<string, KeyResult> = {}
  const propertyId = (process.env[p.env] || '').trim()
  const fail = (error: string) => {
    for (const m of GA4_METRICS) perKey[`${p.prefix}_${m.suffix}`] = { ok: false, error }
    return { perKey, rows: [] as Ga4Breakdown[] }
  }
  if (!propertyId) return fail(`${p.env} unset`)

  const dateRanges = [{ startDate: date, endDate: date }]
  const totals = await runGa4Report(propertyId, { dateRanges, metrics: GA4_METRICS.map(m => ({ name: m.name })) })
  if ('error' in totals) return fail(totals.error)
  const values = totals.report?.rows?.[0]?.metricValues || []
  GA4_METRICS.forEach((m, i) => {
    const v = Number(values[i]?.value ?? 0)
    perKey[`${p.prefix}_${m.suffix}`] = Number.isFinite(v)
      ? { ok: true, value: v, method: 'ga4' }
      : { ok: false, error: `unparseable ${m.name}` }
  })

  const rows: Ga4Breakdown[] = []
  for (const b of GA4_BREAKDOWNS) {
    const r = await runGa4Report(propertyId, {
      dateRanges,
      dimensions: [{ name: b.dim }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'keyEvents' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: GA4_TOP_N,
    })
    if ('error' in r) { console.warn(`[growth/snapshot] ${p.label} ${b.dim_type}:`, r.error); continue }
    for (const row of r.report?.rows || []) {
      const mv = row.metricValues || []
      rows.push({
        property: p.prefix,
        metric_date: date,
        dim_type: b.dim_type,
        dim_value: String(row.dimensionValues?.[0]?.value ?? '(not set)'),
        sessions: Number(mv[0]?.value) || 0,
        users: Number(mv[1]?.value) || 0,
        key_events: Number(mv[2]?.value) || 0,
      })
    }
  }
  return { perKey, rows }
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

  const gaDate = yesterdayUtc()
  const ga = await Promise.all(GA4_PROPERTIES.map(p => ga4Property(p, gaDate)))
  const gaKeys = new Set<string>()
  const gaRows: Ga4Breakdown[] = []
  for (const g of ga) {
    for (const [k, r] of Object.entries(g.perKey)) { perKey[k] = r; gaKeys.add(k) }
    gaRows.push(...g.rows)
  }

  const written: string[] = []
  const skipped: string[] = []
  if (!dryRun) {
    for (const [key, r] of Object.entries(perKey)) {
      if (r.ok && typeof r.value === 'number') {
        const err = gaKeys.has(key)
          ? await upsertMetric(key, r.value, 'ga4', { method: r.method }, gaDate)
          : await upsertMetric(key, r.value, 'snapshot', { method: r.method })
        if (err) { r.ok = false; r.error = `upsert: ${err}`; skipped.push(key) }
        else written.push(key)
      } else {
        skipped.push(key)
      }
    }
    if (gaRows.length) {
      const { error: waErr } = await supabase
        .from('web_analytics_daily')
        .upsert(gaRows.map(r => ({ ...r, captured_at: new Date().toISOString() })), { onConflict: 'property,metric_date,dim_type,dim_value' })
      if (waErr) console.warn('[growth/snapshot] web_analytics_daily failed:', waErr.message)
    }
    await supabase.from('system_config').upsert({
      key: 'growth_snapshot_status',
      value: JSON.stringify({ ran_at: new Date().toISOString(), per_key: perKey }),
      updated_at: new Date().toISOString(),
    })
    const { error: logErr } = await supabase.from('audit_log').insert({
      event_type: 'growth_snapshot',
      actor: 'growth-snapshot-cron',
      target: 'growth_metrics',
      display_message: `Growth snapshot: ${written.length} written, ${skipped.length} skipped`,
      details: JSON.stringify({ written, skipped, per_key: perKey }),
    })
    if (logErr) console.warn('[growth/snapshot] audit_log failed:', logErr.message)
  }
  return { per_key: perKey, written, skipped, ga4_date: gaDate, ga4_breakdown_rows: gaRows.length, dry_run: dryRun }
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
