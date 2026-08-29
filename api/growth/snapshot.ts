import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

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
 *   app_paid_subs, app_mrr_usd, guests_confirmed_30d, visibility_accepted_30d.
 *
 * A failed or unparseable external fetch writes NOTHING for that key (never a
 * fake zero). Per-key outcomes land in system_config.growth_snapshot_status and
 * an audit_log row; the scoreboard reads staleness off metric_date age, so a
 * dead feed surfaces as a stale marker without any extra plumbing.
 */

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

async function upsertMetric(metric_key: string, value: number, source: string, meta: Record<string, unknown>) {
  const metric_date = new Date().toISOString().slice(0, 10)
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
  const [mm, tech] = await Promise.all([substackCount(SUBSTACKS[0].pub), substackCount(SUBSTACKS[1].pub)])
  perKey[SUBSTACKS[0].key] = mm
  perKey[SUBSTACKS[1].key] = tech
  perKey[MAVEN_KEY] = await mavenCount()

  const written: string[] = []
  const skipped: string[] = []
  if (!dryRun) {
    for (const [key, r] of Object.entries(perKey)) {
      if (r.ok && typeof r.value === 'number') {
        const err = await upsertMetric(key, r.value, 'snapshot', { method: r.method })
        if (err) { r.ok = false; r.error = `upsert: ${err}`; skipped.push(key) }
        else written.push(key)
      } else {
        skipped.push(key)
      }
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
  return { per_key: perKey, written, skipped, dry_run: dryRun }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      const secret = process.env.CRON_SECRET || ''
      const auth = req.headers.authorization || ''
      // NOTE: x-vercel-cron is NOT stripped by Vercel on inbound external
      // requests (verified 2026-08-05: a spoofed header returned 200 and ran
      // the job), so it is not proof of anything. Vercel sends
      // `Authorization: Bearer $CRON_SECRET` on cron invocations whenever
      // CRON_SECRET is set, which it is. Bearer-only matches the proven
      // pattern in api/feed/ingest.ts.
      if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ ok: false, error: 'unauthorized' })
      }
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
