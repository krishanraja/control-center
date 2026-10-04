// The site-visits check with the network taken out: every threshold, Google
// Analytics request body, parser, health verdict, finding, ladder rung,
// detector, insight line, LLM rule and view mapping for the four sites in
// src/lib/webProperties.ts.
//
// Pure on purpose. It imports only the registry and api/_mission.ts, never
// _supabase, _timezone, _content or _google, so the tests load it without
// secrets and the snapshot, the daily check and the council can share one set
// of rules. Dates always come in as arguments; nothing here reads the clock.
//
// The one rule everything below serves: an unknown is never a zero. A property
// that has not been proven to receive data gets a verdict that says why before
// any number is shown, a day Google has not confirmed is held rather than
// written as 0, and a fact that could not be read never fires a detector.

import {
  WEB_PROPERTIES, WEB_METRIC_SUFFIXES, webProperty, HEALTH_LINE, DONE_HINT,
  type WebProperty, type WebPrefix, type WebJob, type HealthVerdict, type HealthFlag,
  type DetectorKind, type DetectorSpec, type Finding, type KrishAction, type WebFixed,
  type WebClosed, type WebTotals, type WebWindow, type WebRow, type WebPropertyView,
} from '../src/lib/webProperties.js'
import { isJob, jobLabel } from './_mission.js'

// ---------- constants ----------
export const RESTATE_DAYS = 3
export const PROVISIONAL_HOURS = 48
export const QUIET_MAX_SESSIONS_7D = 5            // cur.sessions < 5 => quiet
export const TREND_MIN_SESSIONS = 20              // BOTH windows, before any percent is printed
export const TREND_MIN_PCT = 0.25
export const SHARE_MIN_SESSIONS = 10
export const UNDERCOUNT_MIN_POSTHOG_PV = 10, UNDERCOUNT_RATIO = 0.5
export const FOREIGN_HOST_MIN_HITS = 3, FOREIGN_HOST_SHARE = 0.05
export const SEARCH_TRACTION_MIN = 3              // Organic Search sessions to one landing page in 28 days
export const DEAD_LANDING_MAX_PROBES = 10
export const SITEMAP_STALE_DAYS = 60
export const PUBLICATION_DORMANT_DAYS = 14
export const GROWTH_ACTION_TTL_DAYS = 14
export const LLM_REFRESH_MIN_DAYS = 3             // evidence changed AND action this old => re-ask
export const LLM_RETRY_HOURS = 20
export const REFRESH_MIN_INTERVAL_MS = 10 * 60_000
export const FIXED_WINDOW_DAYS = 7
export const AI_SOURCES = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']
export const PILOT_STATE_RANK: Record<string, number> = { not_now: -1, listed: 0, drafted: 1, sent: 2, replied: 3, call_booked: 4, call_taken: 5, pilot_booked: 6, pilot_paid: 7 }

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const GA_HOME = 'https://analytics.google.com/analytics/web/'
const WAITING_ON_SHARED = 'Waiting on the step at the top.'

// ---------- small helpers ----------
function t(iso: string | null | undefined): number {
  if (!iso) return NaN
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso)
}
/** '2026-09-27' or an ISO instant -> '27 September' (UTC, no year: every date here is recent). */
function day(iso: string | null | undefined): string {
  const ms = t(iso)
  if (!Number.isFinite(ms)) return String(iso ?? '')
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
function addDays(iso: string, n: number): string {
  return new Date(t(iso) + n * DAY_MS).toISOString()
}
function daysBetween(from: string | null | undefined, to: string): number {
  const a = t(from), b = t(to)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / DAY_MS) : 0
}
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}
function noStop(s: string): string {
  return s.replace(/[.\s]+$/, '')
}
/** At most `max` chars, ending on a whole sentence, else a whole word. Never a word cut in half. */
export function cutAtSentence(s: string, max: number): string {
  const text = String(s ?? '').trim()
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
  if (stop > 0) return head.slice(0, stop + 1)
  if (/[.?!]$/.test(head) && (text[max] === ' ' || text[max] === undefined)) return head
  const space = head.lastIndexOf(' ')
  return `${(space > 0 ? head.slice(0, space) : head.slice(0, max - 1)).replace(/[,;:\s]+$/, '')}.`
}
function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// ---------- errors ----------
export type GaErrorKind = 'credentials' | 'service_disabled' | 'permission_denied' | 'not_found' | 'invalid_argument' | 'quota' | 'network' | 'other'

/** reason CREDENTIALS -> credentials; reason SERVICE_DISABLED or /has not been used in project|is disabled/i -> service_disabled;
 *  403 -> permission_denied; 404 -> not_found; 400 -> invalid_argument; 429 -> quota; status 0 -> network; else other */
export function classifyGaError(e: { status: number; reason: string; error: string }): GaErrorKind {
  const reason = String(e?.reason ?? '')
  const error = String(e?.error ?? '')
  if (reason === 'CREDENTIALS') return 'credentials'
  if (reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(error)) return 'service_disabled'
  if (e?.status === 403) return 'permission_denied'
  if (e?.status === 404) return 'not_found'
  if (e?.status === 400) return 'invalid_argument'
  if (e?.status === 429) return 'quota'
  if (!e?.status) return 'network'
  return 'other'
}

/** Strips ' as <email> (<source>)' so nothing written to an anon-readable table names the SA. Max 160 chars. */
export function shortGaError(error: string): string {
  return String(error ?? '')
    .replace(/ as [^\s:]+@[^\s:]+(?: \([^)]*\))?/g, '')
    .replace(/ for [^\s:]+@[^\s:]+(?: \([^)]*\))?/g, '')
    .replace(/"?[\w.+-]+@[\w-]+(?:\.[\w-]+)+"?/g, 'the service account')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

/**
 * Krish's hard rule is no em dashes, and a model that is told that will reach
 * for the ASCII stand-ins instead. So the sweep kills the real characters AND
 * the substitutes: "--", and a hyphen used as a spaced dash. Word-internal
 * hyphens (AI-native, full-time) are left alone.
 *
 * Moved here from api/growth/council-run.ts (its CLEAN) so there is one
 * cleaner. The dash class is written as escapes so this file holds no em dash.
 */
export function cleanCopy(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(/[\u2014\u2015\u2013]/g, ',')
    .replace(/\s*-{2,}\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s*,(\s*,)+/g, ',')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// ---------- GA request bodies (Data API v1beta) ----------
const dims = (...names: string[]) => names.map(name => ({ name }))
const mets = (...names: string[]) => names.map(name => ({ name }))
const BY_SESSIONS = [{ metric: { metricName: 'sessions' }, desc: true }]
const LAST_7 = [{ startDate: '7daysAgo', endDate: 'yesterday' }]
const LAST_28 = [{ startDate: '27daysAgo', endDate: 'yesterday' }]

export function hostFilter(p: WebProperty): Record<string, unknown> {
  return { filter: { fieldName: 'hostName', inListFilter: { values: [p.host, ...p.hostAliases] } } }
}

function filtered(p: WebProperty, on: boolean, body: Record<string, unknown>): Record<string, unknown> {
  return on ? { ...body, dimensionFilter: hostFilter(p) } : body
}

/** Snapshot: ONE batch of 3, all dateRanges [{startDate:'3daysAgo',endDate:'yesterday'}], each with dimensionFilter hostFilter(p) when opts.hostFilter:
 *  0 dims [date], metrics sessions, activeUsers, screenPageViews, keyEvents, keepEmptyRows true
 *  1 dims [date, sessionSourceMedium], metrics sessions, activeUsers, keyEvents, orderBys sessions desc, limit 150
 *  2 dims [date, landingPage], same metrics, orderBys sessions desc, limit 150 */
export function snapshotRequests(p: WebProperty, opts: { hostFilter: boolean }): Record<string, unknown>[] {
  const dateRanges = [{ startDate: `${RESTATE_DAYS}daysAgo`, endDate: 'yesterday' }]
  return [
    filtered(p, opts.hostFilter, {
      dateRanges, dimensions: dims('date'),
      metrics: mets('sessions', 'activeUsers', 'screenPageViews', 'keyEvents'), keepEmptyRows: true,
    }),
    filtered(p, opts.hostFilter, {
      dateRanges, dimensions: dims('date', 'sessionSourceMedium'),
      metrics: mets('sessions', 'activeUsers', 'keyEvents'), orderBys: BY_SESSIONS, limit: 150,
    }),
    filtered(p, opts.hostFilter, {
      dateRanges, dimensions: dims('date', 'landingPage'),
      metrics: mets('sessions', 'activeUsers', 'keyEvents'), orderBys: BY_SESSIONS, limit: 150,
    }),
  ]
}

/** Insight batch A (5): totals (cur/prev, with quota), 28-day series, 7-day pages, 7-day sources, 28-day pages by channel. */
export function insightBatchA(p: WebProperty, opts: { hostFilter: boolean }): Record<string, unknown>[] {
  const on = opts.hostFilter
  return [
    filtered(p, on, {
      dateRanges: [
        { startDate: '7daysAgo', endDate: 'yesterday', name: 'cur' },
        { startDate: '14daysAgo', endDate: '8daysAgo', name: 'prev' },
      ],
      metrics: mets('sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'keyEvents', 'eventCount'),
      returnPropertyQuota: true,
    }),
    filtered(p, on, {
      dateRanges: LAST_28, dimensions: dims('date'), metrics: mets('sessions'), keepEmptyRows: true,
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }], limit: 40,
    }),
    filtered(p, on, { dateRanges: LAST_7, dimensions: dims('landingPage'), metrics: mets('sessions'), orderBys: BY_SESSIONS, limit: 25 }),
    filtered(p, on, {
      dateRanges: LAST_7, dimensions: dims('sessionDefaultChannelGroup', 'sessionSourceMedium'),
      metrics: mets('sessions'), orderBys: BY_SESSIONS, limit: 25,
    }),
    filtered(p, on, {
      dateRanges: LAST_28, dimensions: dims('landingPage', 'sessionDefaultChannelGroup'),
      metrics: mets('sessions'), orderBys: BY_SESSIONS, limit: 100,
    }),
  ]
}

/** Insight batch B (3): hosts and lifetime are NEVER filtered (they exist to see what the filter hides); events is. */
export function insightBatchB(p: WebProperty, opts: { hostFilter: boolean }): Record<string, unknown>[] {
  return [
    {
      dateRanges: LAST_28, dimensions: dims('hostName'), metrics: mets('screenPageViews', 'eventCount'),
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 10,
    },
    { dateRanges: [{ startDate: '2015-08-14', endDate: 'today' }], metrics: mets('eventCount') },
    filtered(p, opts.hostFilter, { dateRanges: LAST_28, dimensions: dims('eventName', 'isKeyEvent'), metrics: mets('eventCount'), limit: 50 }),
  ]
}

// ---------- parsers ----------
export interface ReportMeta { timeZone: string | null; emptyReason: string | null; subjectToThresholding: boolean; rowCount: number; tokensConsumed: number | null; tokensRemaining: number | null }

function rowsOf(report: any): any[] {
  return Array.isArray(report?.rows) ? report.rows : []
}
function dimOf(row: any, i: number): string {
  return String(row?.dimensionValues?.[i]?.value ?? '')
}
function metOf(row: any, i: number): number {
  const n = Number(row?.metricValues?.[i]?.value)
  return Number.isFinite(n) ? n : 0
}
function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function reportMeta(report: any): ReportMeta {
  const md = isObj(report?.metadata) ? report.metadata : {}
  const quota = report?.propertyQuota?.tokensPerDay
  const rc = numOrNull(report?.rowCount)
  return {
    timeZone: typeof md.timeZone === 'string' && md.timeZone ? md.timeZone : null,
    emptyReason: typeof md.emptyReason === 'string' && md.emptyReason ? md.emptyReason : null,
    subjectToThresholding: md.subjectToThresholding === true,
    rowCount: rc ?? rowsOf(report).length,
    tokensConsumed: numOrNull(quota?.consumed),
    tokensRemaining: numOrNull(quota?.remaining),
  }
}

/** '20260926' -> '2026-09-26'. Anything else comes back unchanged. */
export function gaDate(yyyymmdd: string): string {
  const s = String(yyyymmdd ?? '')
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s
}

export type DailyRow = { date: string; sessions: number; users: number; pageviews: number; keyEvents: number }

/** Snapshot request 0. Only the rows Google returned: a missing date stays missing, never 0. */
export function parseDaily(report: any): DailyRow[] {
  return rowsOf(report)
    .map(row => ({ date: gaDate(dimOf(row, 0)), sessions: metOf(row, 0), users: metOf(row, 1), pageviews: metOf(row, 2), keyEvents: metOf(row, 3) }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function parseDatedBreakdown(report: any, prefix: WebPrefix, dimType: 'source_medium' | 'landing_page'):
  Array<{ property: string; metric_date: string; dim_type: string; dim_value: string; sessions: number; users: number; key_events: number }> {
  return rowsOf(report)
    .map(row => ({
      property: prefix, metric_date: gaDate(dimOf(row, 0)), dim_type: dimType, dim_value: dimOf(row, 1),
      sessions: metOf(row, 0), users: metOf(row, 1), key_events: metOf(row, 2),
    }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.metric_date) && r.dim_value !== '')
}

function zeroWindow(): WebWindow {
  return { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, pageviews: 0, keyEvents: 0, eventCount: 0 }
}

/** Rows keyed by the automatic dateRange dimension 'cur'/'prev'. A missing range with rowCount > 0 for the other is all zeros; both missing => all zeros (the CALLER gates on health). */
export function parseTotals(report: any): WebTotals {
  const out: WebTotals = { cur: zeroWindow(), prev: zeroWindow() }
  const headers: any[] = Array.isArray(report?.dimensionHeaders) ? report.dimensionHeaders : []
  const at = headers.findIndex(h => h?.name === 'dateRange')
  for (const row of rowsOf(report)) {
    const n = Array.isArray(row?.dimensionValues) ? row.dimensionValues.length : 0
    const key = dimOf(row, at >= 0 ? at : Math.max(0, n - 1))
    const slot = key === 'cur' || key === 'date_range_0' ? 'cur' : key === 'prev' || key === 'date_range_1' ? 'prev' : null
    if (!slot) continue
    out[slot] = {
      sessions: metOf(row, 0), users: metOf(row, 1), newUsers: metOf(row, 2), engagedSessions: metOf(row, 3),
      pageviews: metOf(row, 4), keyEvents: metOf(row, 5), eventCount: metOf(row, 6),
    }
  }
  return out
}

/** One entry per expected date, oldest first; a date Google did not return is null (unmeasured), never 0. */
export function parseSeries(report: any, expected: string[]): Array<{ date: string; sessions: number | null }> {
  const byDate = new Map<string, number>()
  for (const row of rowsOf(report)) {
    const d = gaDate(dimOf(row, 0))
    byDate.set(d, (byDate.get(d) ?? 0) + metOf(row, 0))
  }
  return expected.map(date => ({ date, sessions: byDate.has(date) ? (byDate.get(date) as number) : null }))
}

function sumRows(pairs: Array<[string, number]>): WebRow[] {
  const acc = new Map<string, number>()
  for (const [name, n] of pairs) {
    if (!name) continue
    acc.set(name, (acc.get(name) ?? 0) + n)
  }
  return [...acc.entries()].map(([name, sessions]) => ({ name, sessions })).sort((a, b) => b.sessions - a.sessions)
}

/** Rows named by dimension `dimIndex`, sessions summed per name (channels repeat across source rows), most first. */
export function parseRows(report: any, dimIndex: number): WebRow[] {
  return sumRows(rowsOf(report).map(row => [dimOf(row, dimIndex), metOf(row, 0)] as [string, number]))
}

/** Batch A request 4: sessions per landing page over 28 days, and the Organic Search share of them. */
export function parsePages28(report: any): { pages: WebRow[]; organic: WebRow[] } {
  const rows = rowsOf(report)
  return {
    pages: sumRows(rows.map(row => [dimOf(row, 0), metOf(row, 0)] as [string, number])),
    organic: sumRows(rows.filter(row => dimOf(row, 1) === 'Organic Search').map(row => [dimOf(row, 0), metOf(row, 0)] as [string, number])),
  }
}

export function parseHosts(report: any): Array<{ host: string; pageviews: number; events: number }> {
  return rowsOf(report).map(row => ({ host: dimOf(row, 0), pageviews: metOf(row, 0), events: metOf(row, 1) })).filter(h => h.host)
}

export function lifetimeEventCount(report: any): number {
  return rowsOf(report).reduce((n, row) => n + metOf(row, 0), 0)
}

export function parseEvents(report: any): Array<{ name: string; count: number; isKey: boolean }> {
  return rowsOf(report)
    .map(row => ({ name: dimOf(row, 0), count: metOf(row, 0), isKey: dimOf(row, 1) === 'true' }))
    .filter(e => e.name)
}

function sourceOf(sourceMedium: string): string {
  return String(sourceMedium ?? '').split(' / ')[0].trim().toLowerCase()
}

/** sessionSourceMedium rows whose source is one of AI_SOURCES (or a subdomain of one). */
export function aiRows(sources: WebRow[]): WebRow[] {
  return (sources ?? []).filter(r => {
    const s = sourceOf(r.name)
    return AI_SOURCES.some(a => s === a || s.endsWith(`.${a}`))
  })
}

/** '(direct) / (none)' -> 'a typed address or a bookmark'; 'google / organic' -> 'Google search'; 'bing / organic' -> 'Bing search';
 *  '<x> / referral' -> 'links on <x>'; '<x> / email' -> 'email'; else '<source> (<medium>)'. Used after 'came from'. */
export function sourcePhrase(sourceMedium: string): string {
  const raw = String(sourceMedium ?? '').trim()
  const cut = raw.indexOf(' / ')
  const source = cut >= 0 ? raw.slice(0, cut).trim() : raw
  const medium = cut >= 0 ? raw.slice(cut + 3).trim() : ''
  const s = source.toLowerCase(), m = medium.toLowerCase()
  if (s === '(direct)' && (m === '(none)' || m === '(not set)' || !m)) return 'a typed address or a bookmark'
  if (s === 'google' && m === 'organic') return 'Google search'
  if (s === 'bing' && m === 'organic') return 'Bing search'
  if (m === 'referral') return `links on ${source}`
  if (m === 'email') return 'email'
  return medium ? `${source} (${medium})` : source
}

// ---------- Admin API ----------
export type AdminState = 'ok' | 'disabled' | 'denied' | 'error' | 'skipped'
export interface AdminFacts { state: AdminState; visible: boolean | null; accountId: string | null; timeZone: string | null
  streams: Array<{ measurementId: string; defaultUri: string | null }> | null; keyEvents: string[] | null; activationUrl: string | null }

/** 403 with reason SERVICE_DISABLED or message /has not been used in project|is disabled/ => 'disabled' (+activationUrl); other 403 => 'denied'; else 'error'. */
export function adminStateFromError(f: { status: number; reason: string; error: string; activationUrl: string | null }): { state: AdminState; activationUrl: string | null } {
  if (f?.status === 403) {
    if (f.reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(String(f.error ?? ''))) {
      return { state: 'disabled', activationUrl: f.activationUrl ?? null }
    }
    return { state: 'denied', activationUrl: null }
  }
  return { state: 'error', activationUrl: null }
}

/** accountSummaries -> every property the identity can see; 'properties/123' -> '123', 'accounts/9' -> '9'. */
export function propertiesInSummaries(json: any): Array<{ propertyId: string; accountId: string; displayName: string }> {
  const out: Array<{ propertyId: string; accountId: string; displayName: string }> = []
  for (const acct of Array.isArray(json?.accountSummaries) ? json.accountSummaries : []) {
    const accountId = String(acct?.account ?? '').replace(/^accounts\//, '')
    for (const ps of Array.isArray(acct?.propertySummaries) ? acct.propertySummaries : []) {
      const propertyId = String(ps?.property ?? '').replace(/^properties\//, '')
      if (propertyId) out.push({ propertyId, accountId, displayName: String(ps?.displayName ?? '') })
    }
  }
  return out
}

/** Web streams only (webStreamData.measurementId / defaultUri). An answer with no streams is [], a non-answer is null. */
export function streamsFromList(json: any): AdminFacts['streams'] {
  if (!isObj(json)) return null
  const list: any[] = Array.isArray(json.dataStreams) ? json.dataStreams : []
  return list
    .filter(s => isObj(s?.webStreamData) && typeof s.webStreamData.measurementId === 'string')
    .map(s => ({ measurementId: s.webStreamData.measurementId, defaultUri: typeof s.webStreamData.defaultUri === 'string' ? s.webStreamData.defaultUri : null }))
}

/** null when streams are unknown: an unread Admin API proves nothing either way. */
export function streamMatches(streams: AdminFacts['streams'], mid: string): boolean | null {
  if (!Array.isArray(streams)) return null
  return streams.some(s => s.measurementId === mid)
}

// ---------- page probe ----------
export interface ProbeFacts {
  fetched: boolean; status: number | null; hasTag: boolean | null; consentGated: boolean; consentDefaultDenied: boolean; title: string | null
  notFound: { status: number | null; hasTag: boolean | null; title: string | null } | null
  sitemapNewest: string | null
  deadPages: Array<{ path: string; status: number }>
}

const CONSENT_DEFAULT_DENIED = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"][^)]*analytics_storage['"]?\s*:\s*['"]denied/
const STATIC_GTAG = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*googletagmanager\.com\/gtag\/js[^"']*["'][^>]*>/i

/** hasTag: html.includes(mid). consentDefaultDenied: a gtag('consent','default',{analytics_storage:'denied'}) call.
 *  consentGated: consentDefaultDenied AND no static gtag.js script tag (the loader waits for Allow). title: first <title>. */
export function readProbe(html: string, mid: string): { hasTag: boolean; consentGated: boolean; consentDefaultDenied: boolean; title: string | null } {
  const s = String(html ?? '')
  const consentDefaultDenied = CONSENT_DEFAULT_DENIED.test(s)
  const m = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = m ? m[1].replace(/\s+/g, ' ').trim() || null : null
  return { hasTag: !!mid && s.includes(mid), consentGated: consentDefaultDenied && !STATIC_GTAG.test(s), consentDefaultDenied, title }
}

/** The newest parseable <lastmod> in a sitemap, as written there; null when none parses. */
/**
 * Whether a GA landing page is safe to probe and to quote. The G- id on every
 * page is public, so anyone can send hits with any path on the real host; such
 * a path must not be fetched, copied into Maya's anon-readable touchpoint row,
 * or put on a card unless it looks like an ordinary URL path.
 */
export const LANDING_PATH_MAX = 200
export function isPlainLandingPath(path: string): boolean {
  return typeof path === 'string' && path.length <= LANDING_PATH_MAX && !path.startsWith('//')
    && /^\/[A-Za-z0-9\-._~%/]*$/.test(path)
}

export function newestLastmod(sitemapXml: string): string | null {
  let best: string | null = null
  let bestT = -Infinity
  const re = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(String(sitemapXml ?? ''))) !== null) {
    const ms = t(m[1])
    if (Number.isFinite(ms) && ms > bestT) { bestT = ms; best = m[1] }
  }
  return best
}

// ---------- Plausible (type only; the fetch lives in api/_plausible.ts) ----------
export interface PlausibleRead { ok: boolean; status: number | null; error: string | null
  visits7d: number; visitsPrev7d: number | null; visitors7d: number; pageviews7d: number
  topSource: string | null; topPage: string | null; goals: Array<{ name: string; events: number }> | null }

// ---------- one property's read ----------
export interface PropertyRead {
  p: WebProperty; now: string                                    // ISO
  propertyId: string | null; idSource: 'env' | 'default' | 'discovered' | 'none'
  tz: string | null; asOf: string
  /** Where tz came from. Only 'admin' or 'report' is a zone Google stated; 'previous' and 'default' are carried or guessed. */
  tzSource?: 'admin' | 'report' | 'previous' | 'default'
  /** activationUrl: Google's own enable link when the Data API answered SERVICE_DISABLED. */
  dataRead: { ok: boolean; status: number | null; kind: GaErrorKind | null; error: string | null; activationUrl?: string | null }
  hostFilter: 'on' | 'off'
  meta: ReportMeta | null
  totals: WebTotals | null; series: Array<{ date: string; sessions: number | null }> | null
  top: { sources: WebRow[]; pages: WebRow[]; ai: WebRow[]; channels: WebRow[] }
  pages28: WebRow[]; organic28: WebRow[]
  hosts: Array<{ host: string; pageviews: number; events: number }>
  lifetime: number | null
  events: Array<{ name: string; count: number; isKey: boolean }> | null
  admin: AdminFacts; probe: ProbeFacts
  posthog: { pageviews7d: number; users7d: number; date: string } | null
  plausible: PlausibleRead | null
  /** detail: the previous verdict's own Health.detail (stored as meta.health_detail), carried with it on a failed read. */
  previous: { health: HealthVerdict; property_tz: string | null; as_of: string; run_at: string; action: KrishAction | null
    llm: { evidence_hash: string; attempted_at: string; writer: string } | null; detail?: string | null } | null
  discoveredFrom: string | null                                  // the env/default id replaced by discovery, if any
}
export interface Health { health: HealthVerdict; flags: HealthFlag[]; detail: string }

const FLAG_ORDER: HealthFlag[] = ['consent_gated', 'thresholded', 'admin_unverified', 'undercounting', 'host_filter_off', 'read_failed']
const BAD_HEALTH: HealthVerdict[] = ['no_access', 'api_disabled', 'wrong_stream', 'tag_missing', 'never_received']
const MEASURED_HEALTH: HealthVerdict[] = ['ok', 'quiet', 'provisional']

function inFirstDays(p: WebProperty, now: string): boolean {
  return t(now) < t(p.tagLiveAt) + PROVISIONAL_HOURS * HOUR_MS
}

/**
 * The verdict, first match wins (spec 4.1):
 *   1 no id, bad key, 403 or 404 -> no_access      2 Data API off -> api_disabled ('data')
 *   3 any other failed read -> the previous verdict (or provisional) + read_failed, with the
 *     previous verdict's own detail: the error kind of today's blip is not why that verdict was reached
 *   4 the page lacks its tag -> tag_missing         5 Admin API proves the stream is wrong -> wrong_stream
 *   6 Google has never recorded an event: provisional in the first 48 h, then never_received
 *     (consent-gated by design, or plainly) unless the Admin API is off, which makes it api_disabled ('admin')
 *   6b the lifetime count could not be read (batch B failed), no session this week, and no earlier
 *     ok or quiet: nothing proves the site has ever been counted, so this is carried like rule 3
 *     rather than called quiet. An unknown lifetime is never a zero.
 *   7 first 48 h -> provisional   8 under 5 sessions this week -> quiet   9 ok
 */
export function classifyHealth(r: PropertyRead): Health {
  const p = r.p
  const kind = r.dataRead.kind
  const first = inFirstDays(p, r.now)
  const flags = new Set<HealthFlag>()
  let health: HealthVerdict
  let detail = ''
  if (r.idSource === 'none' || kind === 'credentials' || kind === 'permission_denied' || kind === 'not_found') {
    health = 'no_access'
    detail = r.idSource === 'none' ? 'none' : (kind as string)
  } else if (kind === 'service_disabled') {
    health = 'api_disabled'
    detail = 'data'
  } else if (r.dataRead.ok === false) {
    health = r.previous?.health ?? 'provisional'
    flags.add('read_failed')
    detail = r.previous?.detail ?? ''
  } else if (r.probe.fetched && r.probe.status === 200 && r.probe.hasTag === false) {
    health = 'tag_missing'
  } else if (r.admin.state === 'ok' && streamMatches(r.admin.streams, p.measurementId) === false && r.idSource !== 'discovered') {
    health = 'wrong_stream'
    detail = r.admin.streams?.find(s => s.defaultUri)?.defaultUri ?? ''
  } else if (r.lifetime === 0) {
    if (first) health = 'provisional'
    else if (p.consentByDesign) { health = 'never_received'; flags.add('consent_gated') }
    else if (r.admin.state === 'disabled') { health = 'api_disabled'; detail = 'admin' }
    else health = 'never_received'
  } else if (r.lifetime == null && !first && (r.totals?.cur.sessions ?? 0) === 0
      && !(r.previous && (r.previous.health === 'ok' || r.previous.health === 'quiet'))) {
    health = r.previous?.health ?? 'provisional'
    flags.add('read_failed')
    detail = r.previous?.detail ?? ''
  } else if (first) {
    health = 'provisional'
  } else if ((r.totals?.cur.sessions ?? 0) < QUIET_MAX_SESSIONS_7D) {
    health = 'quiet'
  } else {
    health = 'ok'
  }

  if (p.consentByDesign || r.probe.consentGated) flags.add('consent_gated')
  if (r.meta?.subjectToThresholding) flags.add('thresholded')
  if (r.admin.state !== 'ok' && !(health === 'api_disabled' && detail === 'admin')) flags.add('admin_unverified')
  if (isUndercounting(r)) flags.add('undercounting')
  if (r.hostFilter === 'off') flags.add('host_filter_off')
  return { health, flags: FLAG_ORDER.filter(f => flags.has(f)), detail }
}

function isUndercounting(r: PropertyRead): boolean {
  const pv = r.posthog?.pageviews7d
  return r.dataRead.ok && !!r.totals && typeof pv === 'number' && pv >= UNDERCOUNT_MIN_POSTHOG_PV && r.totals.cur.pageviews < UNDERCOUNT_RATIO * pv
}

/** totals and series reach the view (and the model) only for ok|quiet|provisional on a read that succeeded. */
function measured(r: PropertyRead, h: Health): boolean {
  return r.dataRead.ok && !h.flags.includes('read_failed') && MEASURED_HEALTH.includes(h.health)
}

// ---------- snapshot restate plan (D2) ----------
const SUFFIX_FIELD: Record<string, keyof Omit<DailyRow, 'date'>> = {
  sessions_1d: 'sessions', users_1d: 'users', pageviews_1d: 'pageviews', key_events_1d: 'keyEvents',
}

/**
 * What the snapshot writes for the last RESTATE_DAYS property-tz days. A day
 * with data is written (and restated if Google revised it). An empty or missing
 * day is written as 0 only when the property is proven to receive data: this
 * read has a nonzero day, or the last check said ok or quiet. Otherwise the day
 * is held, and a zero the snapshot itself stored for it earlier is removed; a
 * manual row is never touched.
 */
export function planRestate(args: {
  prefix: WebPrefix
  expectedDates: string[]
  rows: DailyRow[]
  lastHealth: HealthVerdict | null
  stored: Array<{ metric_key: string; metric_date: string; value: number; source: string }>
}): {
  writes: Array<{ metric_key: string; metric_date: string; value: number; provisional: boolean }>
  holds: Array<{ metric_date: string; reason: string }>
  deletes: Array<{ metric_key: string; metric_date: string }>
  corrections: Array<{ metric_key: string; metric_date: string; from: number; to: number }>
} {
  const { prefix, expectedDates, rows, lastHealth, stored } = args
  const byDate = new Map(rows.map(r => [r.date, r]))
  const hasData = (d: DailyRow | undefined) => !!d && (d.sessions > 0 || d.users > 0 || d.pageviews > 0 || d.keyEvents > 0)
  const proven = rows.some(hasData) || lastHealth === 'ok' || lastHealth === 'quiet'
  const storedBy = new Map(stored.map(s => [`${s.metric_key}|${s.metric_date}`, s]))
  const writes: Array<{ metric_key: string; metric_date: string; value: number; provisional: boolean }> = []
  const holds: Array<{ metric_date: string; reason: string }> = []
  const deletes: Array<{ metric_key: string; metric_date: string }> = []
  const corrections: Array<{ metric_key: string; metric_date: string; from: number; to: number }> = []
  expectedDates.forEach((date, i) => {
    const row = byDate.get(date)
    if (!hasData(row) && !proven) {
      holds.push({
        metric_date: date,
        reason: lastHealth ? `nothing recorded, and the last check read ${lastHealth}` : 'nothing recorded, and the site has not been checked yet',
      })
      for (const suffix of WEB_METRIC_SUFFIXES) {
        const key = `${prefix}_${suffix}`
        const s = storedBy.get(`${key}|${date}`)
        if (s && s.source === 'ga4' && Number(s.value) === 0) deletes.push({ metric_key: key, metric_date: date })
      }
      return
    }
    const provisional = i >= expectedDates.length - 2
    for (const suffix of WEB_METRIC_SUFFIXES) {
      const key = `${prefix}_${suffix}`
      const value = row ? row[SUFFIX_FIELD[suffix]] : 0
      writes.push({ metric_key: key, metric_date: date, value, provisional })
      const s = storedBy.get(`${key}|${date}`)
      if (s && Number(s.value) !== value) corrections.push({ metric_key: key, metric_date: date, from: Number(s.value), to: value })
    }
  })
  return { writes, holds, deletes, corrections }
}

// ---------- OS facts, detector facts ----------
export interface OsFacts {
  saEmail: string | null; saProject: string | null; adminActivationUrl: string | null
  pilot: { drafted: number; oldestDraftedAt: string | null; maxRank: number }
  substackLastPost: string | null                                 // null = unknown (fetch failed), never 'no post'
  rssItems: number | null
  reviewIdeas: string[]                                           // unburied content_ideas in 'review', max 3
  substackCountPresent: boolean
  ventureActive: Record<string, boolean | null>
  plausibleKeySet: boolean
  /** The newest snapshot's GA plan per property. The run passes it only when that snapshot is newer than the previous insight row. */
  snapshotGa: Partial<Record<WebPrefix, { writes: number; holds: string[]; deletes: number;
    corrections: Array<{ metric_key: string; metric_date: string; from: number; to: number }> }>> | null
}
export interface DetectorFacts {
  now: string
  gaReadOk: Partial<Record<WebPrefix, boolean>>
  adminOk: boolean
  streamMatch: Partial<Record<WebPrefix, boolean | null>>
  tagPresent: Partial<Record<WebPrefix, boolean | null>>
  lifetimeHits: Partial<Record<WebPrefix, boolean | null>>
  plausibleOk: boolean; plausibleGoals: boolean
  consentDefaultDenied: Partial<Record<WebPrefix, boolean | null>>
  canonRuled: Partial<Record<WebPrefix, boolean>>                 // registry canon !== 'ruling_owed' OR (legibility) ventureActive === true
  keyEventsConfigured: Partial<Record<WebPrefix, boolean | null>>
  substackCountPresent: boolean
  substackLastPost: string | null; rssItems: number | null; pilotMaxRank: number
  /** Completed daily_focus slot texts, normalised. The caller passes only completions after the action's
   *  issued_at (doneTextsSince): detectorFired compares the title alone. */
  todayDoneTexts: string[]
  openFindingIds: Partial<Record<WebPrefix, string[]>>
}

/** trim, lowercase, collapse spaces, slice 240: how a slot text and an action title are compared. */
export function normaliseSlotText(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 240)
}

/**
 * The todayDoneTexts one action may be closed by: slots completed strictly
 * after it was issued, normalised. today_slot_done compares titles only, so
 * without this a slot ticked off on Monday would close Tuesday's reissue of the
 * same title, and every day after it for as long as Monday stays in the list.
 * An action with no issued_at (or an unparseable one) gets nothing.
 */
export function doneTextsSince(done: Array<{ text: string; at: string | null }>, issuedAt: string | null | undefined): string[] {
  const since = t(issuedAt)
  if (!Number.isFinite(since)) return []
  return (Array.isArray(done) ? done : [])
    .filter(d => d && typeof d.text === 'string' && t(d.at) > since)
    .map(d => normaliseSlotText(d.text))
}

/** An unknown fact (null/undefined) NEVER fires. Shared actions fire only when every member fires. Section 5.3 has each rule. */
export function detectorFired(a: KrishAction, f: DetectorFacts): boolean {
  if (!a || !f) return false
  const members: WebPrefix[] = a.prefix === 'shared' ? (a.members ?? []) : [a.prefix]
  if (!members.length) return false
  const all = (fact: Partial<Record<WebPrefix, boolean | null>> | undefined) => members.every(m => fact?.[m] === true)
  const baseline = a.detector?.baseline
  switch (a.detector?.kind) {
    case 'ga_read_ok': return all(f.gaReadOk)
    case 'admin_api_ok': return f.adminOk === true
    case 'stream_match': return all(f.streamMatch)
    case 'tag_present': return all(f.tagPresent)
    case 'lifetime_hits': return all(f.lifetimeHits)
    case 'plausible_ok': return f.plausibleOk === true || members.every(m => webProperty(m)?.plausible === 'declined')
    case 'plausible_goals': return f.plausibleGoals === true
    case 'canon_ruled': return all(f.canonRuled)
    case 'metric_present': return f.substackCountPresent === true
    case 'key_events_configured': return all(f.keyEventsConfigured)
    case 'consent_default_denied': return all(f.consentDefaultDenied)
    case 'substack_new_post': {
      if (typeof baseline !== 'string' || typeof f.substackLastPost !== 'string') return false
      const now = t(f.substackLastPost), was = t(baseline)
      return Number.isFinite(now) && Number.isFinite(was) ? now > was : f.substackLastPost > baseline
    }
    case 'rss_items_up':
      return typeof baseline === 'number' && typeof f.rssItems === 'number' && f.rssItems > baseline
    case 'pilot_state_advanced':
      return typeof baseline === 'number' && typeof f.pilotMaxRank === 'number' && f.pilotMaxRank > baseline
    case 'today_slot_done':
      return Array.isArray(f.todayDoneTexts) && f.todayDoneTexts.includes(normaliseSlotText(a.title))
    case 'condition_cleared': {
      const findingId = a.id.split(':').slice(1).join(':')
      return members.every(m => Array.isArray(f.openFindingIds?.[m]) && !(f.openFindingIds[m] as string[]).includes(findingId))
    }
    default: return false
  }
}

// ---------- findings ----------
function finding(p: WebProperty, id: string, cls: Finding['cls'], line: string, job: WebJob, kind: DetectorKind,
  evidence: Record<string, unknown>, extra: Partial<Finding> = {}): Finding {
  return { id, prefix: p.prefix, cls, line, job, detector: { kind }, evidence, ...extra }
}

function posthogPv(r: PropertyRead): number {
  return r.posthog && r.posthog.pageviews7d > 0 ? r.posthog.pageviews7d : 0
}

function noAccessDetail(r: PropertyRead, h: Health): string {
  if (h.detail === 'none') return 'No property id is set.'
  // A carried verdict: today's error is a network, quota or other blip, so it
  // is not the reason and is never quoted as one.
  const carried = h.flags.includes('read_failed')
  if (h.detail === 'credentials') {
    return carried
      ? 'The service account key was not usable at the last check that got an answer.'
      : `The service account key is not usable: ${noStop(shortGaError(r.dataRead.error ?? 'unknown problem'))}.`
  }
  return 'Google refused the read.'
}

function foundUri(r: PropertyRead, h: Health): string {
  return h.health === 'wrong_stream' ? h.detail : (r.admin.streams?.find(s => s.defaultUri)?.defaultUri ?? '')
}

// The ladder lines (spec 4.2), shared by buildFindings and insightLine so the card never says it two ways.
function ladderLine(id: string, r: PropertyRead, h: Health): string {
  const p = r.p
  switch (id) {
    case 'no_access': return `Control Center cannot read ${p.label}. ${noAccessDetail(r, h)}`
    case 'data_api_off': return "The Google Analytics Data API is off in the service account's Google project."
    case 'admin_api_needed': return `${p.label} has recorded nothing, and with the Admin API off Control Center cannot tell a wrong property from a quiet site.`
    case 'wrong_stream': {
      const uri = foundUri(r, h)
      return `The property Control Center reads for ${p.label} has no web stream with ${p.measurementId}.${uri ? ` Its stream points at ${uri}.` : ' It has no web stream at all.'}`
    }
    case 'tag_missing': return `${p.host} is live but does not load its tag ${p.measurementId}, so visits are not being counted.`
    case 'never_received': {
      const pv = posthogPv(r)
      return `${p.label} has its tag and the right property, but Google Analytics has never recorded a visit${pv ? `, while PostHog counted ${pv} page views this week` : ''}.`
    }
    case 'plausible_key': return `Google Analytics on ${p.label} counts only visitors who press Allow, so it cannot show real traffic or what visitors do.`
    case 'canon_ruling': return p.canon.status === 'ruling_owed' ? `${p.canon.conflict} Until you decide, no growth action can name a job.` : ''
    default: return ''
  }
}

function canonRulingOwed(p: WebProperty, os: OsFacts): boolean {
  return p.canon.status === 'ruling_owed' && !(p.prefix === 'legibility' && os.ventureActive?.legibility === true)
}

/**
 * The canon_ruled detector fact for one site: true once no ruling is owed.
 * The ONE rule behind both the rung-4 finding and the fact that closes it, so
 * they cannot disagree. `p` is the site as the run reads it, i.e. after
 * withCanonRuling: an answer stored from the dashboard makes the canon stop
 * being 'ruling_owed', which raises no finding and fires the detector.
 */
export function canonRuledFor(p: WebProperty, os: Pick<OsFacts, 'ventureActive'>): boolean {
  return !canonRulingOwed(p, os as OsFacts)
}

/**
 * Everything the check found on one property, in catalog order (spec 4):
 * krish findings with a rung first (the ladder takes the lowest), then krish
 * findings for later (no rung, never on the ladder), then Maya's, then what the
 * OS already did on its own. Ties on a rung break by this order.
 */
export function buildFindings(r: PropertyRead, h: Health, os: OsFacts): Finding[] {
  const p = r.p
  const out: Finding[] = []
  const evidenceRead = { kind: r.dataRead.kind, status: r.dataRead.status, error: r.dataRead.error ? shortGaError(r.dataRead.error) : null }
  const rung = (id: string, n: 1 | 2 | 3 | 4, kind: DetectorKind, evidence: Record<string, unknown>) =>
    out.push(finding(p, id, 'krish', ladderLine(id, r, h), 'keep_honest', kind, evidence, { rung: n }))

  // ---- krish, on the ladder (4.2)
  // evidence.kind is the verdict's own kind (h.detail), not today's error: on a
  // carried verdict today's kind is the blip, and mergeShared groups the
  // account-level grant on it.
  if (h.health === 'no_access') {
    rung('no_access', 1, 'ga_read_ok', {
      ...evidenceRead, kind: h.detail && h.detail !== 'none' ? h.detail : evidenceRead.kind,
      id_source: r.idSource, detail: h.detail, carried: h.flags.includes('read_failed'),
    })
  }
  if (h.health === 'api_disabled' && h.detail === 'data') rung('data_api_off', 1, 'ga_read_ok', evidenceRead)
  if (h.health === 'api_disabled' && h.detail === 'admin') rung('admin_api_needed', 2, 'admin_api_ok', { lifetime: r.lifetime, admin: r.admin.state })
  if (h.health === 'wrong_stream') rung('wrong_stream', 2, 'stream_match', { streams: r.admin.streams, mid: p.measurementId })
  if (h.health === 'tag_missing') rung('tag_missing', 2, 'tag_present', { status: r.probe.status, mid: p.measurementId })
  if (h.health === 'never_received' && !p.consentByDesign) rung('never_received', 2, 'lifetime_hits', { lifetime: r.lifetime, posthog_pv_7d: r.posthog?.pageviews7d ?? null })
  if (p.plausibleSiteId && p.plausible !== 'declined' && (!os.plausibleKeySet || r.plausible?.ok === false)) {
    rung('plausible_key', 3, 'plausible_ok', { key_set: os.plausibleKeySet, status: r.plausible?.status ?? null })
  }
  if (canonRulingOwed(p, os)) rung('canon_ruling', 4, 'canon_ruled', { canon: p.canon.status })

  // ---- krish, later (4.5)
  const later = (id: string, line: string, job: WebJob, kind: DetectorKind, evidence: Record<string, unknown>) =>
    out.push(finding(p, id, 'krish', line, job, kind, evidence))
  if (p.repo) {
    const fixes: string[] = []
    const nf = r.probe.notFound
    if (nf && r.probe.hasTag === true && nf.hasTag === false) fixes.push('the not-found page has no tag')
    if (nf && nf.title && r.probe.title && nf.title === r.probe.title) fixes.push("the not-found page has the home page's title")
    if (r.probe.sitemapNewest && daysBetween(r.probe.sitemapNewest, r.now) >= SITEMAP_STALE_DAYS) {
      fixes.push(`the sitemap was last updated ${day(r.probe.sitemapNewest)}`)
    }
    if (fixes.length) {
      later('site_fixes', `${plural(fixes.length, 'small fix', 'small fixes')} for ${p.host} ${fixes.length === 1 ? 'is' : 'are'} ready to draft: ${listJoin(fixes)}. Say yes in chat and one PR on ${p.repo} carries them.`,
        'keep_honest', 'condition_cleared', { fixes, sitemap_newest: r.probe.sitemapNewest })
    }
  }
  if (!p.consentByDesign && p.canon.status !== 'retired' && r.probe.hasTag === true && !r.probe.consentDefaultDenied) {
    later('consent_missing', `${p.host} loads Google Analytics before asking visitors. UK rules want consent first.`, 'keep_honest', 'consent_default_denied', {})
  }
  const noKeyInAdmin = Array.isArray(r.admin.keyEvents) && r.admin.keyEvents.length === 0
  const noKeyInEvents = Array.isArray(r.events) && r.events.length > 0 && !r.events.some(e => e.isKey)
  if ((noKeyInAdmin || noKeyInEvents) && (p.posthogProduct || p.plausibleSiteId)) {
    later('no_key_events', `Google Analytics counts no sign-ups on ${p.label}: they go to ${p.posthogProduct ? 'PostHog' : 'Plausible'} only.`,
      'keep_honest', 'key_events_configured', { admin_key_events: r.admin.keyEvents })
  }
  if (p.prefix === 'mymu' && !os.substackCountPresent) {
    later('substack_count_missing', 'The subscriber count reads no data because Substack hides it. Export the subscriber list as CSV once and import it on People, Network, under Add people from a file.',
      'keep_honest', 'metric_present', {})
  }
  if (r.plausible?.ok && Array.isArray(r.plausible.goals) && r.plausible.goals.length === 0) {
    later('plausible_goals_missing', 'Plausible receives door clicks and scoping requests but has no goals set, so it cannot count them. Add both as goals in Plausible.',
      'fill_pilots', 'plausible_goals', {})
  }

  // ---- agent: Maya, through growth_touchpoints.evidence.web (4.4). The run
  // downgrades 'touchpoint' to 'unrouted' when the map has no Maya row.
  const routed: Finding['routed'] = p.canon.status === 'live' && p.touchpointSlug ? 'touchpoint' : 'unrouted'
  const agent = (id: string, line: string, job: WebJob, evidence: Record<string, unknown>) =>
    out.push(finding(p, id, 'agent', line, job, 'condition_cleared', evidence, { owner: 'maya', routed }))
  const dead = r.probe.deadPages.filter(d => isPlainLandingPath(d.path))
  if (dead.length) {
    const paths = dead.map(d => d.path)
    agent('dead_landing', `${plural(paths.length, 'page', 'pages')} people land on return${paths.length === 1 ? 's' : ''} not found: ${paths.join(', ')}.`, 'keep_honest', { pages: dead })
  }
  if (p.jobs.length) {
    const top = r.organic28.find(row => row.sessions >= SEARCH_TRACTION_MIN)
    if (top) {
      agent('search_traction', `${top.name} got ${top.sessions} visits from Google search in 4 weeks. Check how it ranks and whether its title matches the search.`,
        p.jobs[0], { path: top.name, sessions: top.sessions })
    }
    if (r.top.ai.length) {
      const n = r.top.ai.reduce((s, row) => s + row.sessions, 0)
      agent('ai_referral', `${plural(n, 'visit', 'visits')} came from ${aiEngines(r.top.ai)} this week. The page they cite is worth keeping current.`,
        p.jobs[0], { rows: r.top.ai })
    }
  }

  // ---- auto: done on its own (4.3). action_closed, action_expired and told_maya are written by the run.
  const auto = (id: string, line: string, evidence: Record<string, unknown>) =>
    out.push(finding(p, id, 'auto', line, 'keep_honest', 'condition_cleared', evidence))
  const snap = os.snapshotGa?.[p.prefix]
  if (snap?.corrections?.length) {
    const days = new Set(snap.corrections.map(c => c.metric_date)).size
    auto('restated', `Corrected ${plural(days, 'earlier day', 'earlier days')} for ${p.label} once Google finished counting.`, { corrections: snap.corrections })
  }
  if (snap?.holds?.length) auto('zero_held', `Held back ${plural(snap.holds.length, 'empty day', 'empty days')} for ${p.label} instead of writing them as zero.`, { holds: snap.holds })
  if (snap && snap.deletes > 0) auto('zero_removed', `Removed ${plural(snap.deletes, 'zero reading', 'zero readings')} for ${p.label} that Google had not confirmed.`, { deletes: snap.deletes })
  if (r.idSource === 'discovered' && r.discoveredFrom) {
    auto('property_discovered', r.discoveredFrom === 'none'
      ? `Found the property that owns ${p.measurementId} and read that one, since no id was set.`
      : `Found the property that owns ${p.measurementId} and read that one instead of ${r.discoveredFrom}.`, { from: r.discoveredFrom })
  }
  const foreign = foreignHosts(r)
  if (foreign.length) {
    const n = foreign.reduce((s, x) => s + x.pageviews, 0)
    auto('hosts_excluded', `Left out ${plural(n, 'page view', 'page views')} from ${listJoin(foreign.map(x => x.host))}, which are not ${p.label}.`, { hosts: foreign })
  }
  // Only a zone Google stated (Admin API or the report). A carried or fallback
  // 'UTC' on a read that failed was not learned from anything.
  const tzStated = r.tzSource === 'admin' || r.tzSource === 'report'
  if (r.tz && tzStated && (!r.previous || r.previous.property_tz !== r.tz)) auto('timezone_learned', `Learned that ${p.label} counts days in ${r.tz}.`, { tz: r.tz })
  if (r.previous && BAD_HEALTH.includes(r.previous.health) && MEASURED_HEALTH.includes(h.health) && !h.flags.includes('read_failed')) {
    auto('recovered', `${p.label} is readable again.`, { was: r.previous.health })
  }
  if (h.flags.includes('undercounting') && r.totals && r.posthog) {
    auto('undercounting', `Google Analytics saw ${r.totals.cur.pageviews} page views to PostHog's ${r.posthog.pageviews7d} this week, so this card reads PostHog for traffic.`,
      { ga: r.totals.cur.pageviews, posthog: r.posthog.pageviews7d })
  }
  return out
}

function aiEngines(rows: WebRow[]): string {
  return listJoin([...new Set(rows.map(row => sourceOf(row.name)))])
}

/** Hosts outside host/aliases that the hostName filter left out: at least 3 hits and 5% of all host events. Only when the filter was on. */
function foreignHosts(r: PropertyRead): Array<{ host: string; pageviews: number; events: number }> {
  if (r.hostFilter !== 'on') return []
  const own = new Set([r.p.host, ...r.p.hostAliases].map(h => h.toLowerCase()))
  const total = r.hosts.reduce((s, h) => s + h.events, 0)
  if (total <= 0) return []
  return r.hosts.filter(h => {
    const host = h.host.toLowerCase()
    return host !== '(not set)' && !own.has(host)
      && h.pageviews + h.events >= FOREIGN_HOST_MIN_HITS
      && h.events / total >= FOREIGN_HOST_SHARE
  })
}

// ---------- actions (spec 5.2) ----------
type ActionText = Pick<KrishAction, 'title' | 'why' | 'first_step' | 'minutes' | 'link' | 'hero_line'>

function baseAction(id: string, prefix: WebPrefix | 'shared', rung: KrishAction['rung'], job: WebJob, detector: DetectorSpec,
  text: ActionText, now: string, members: WebPrefix[] = []): KrishAction {
  const kind: KrishAction['kind'] = rung <= 2 ? 'setup' : rung === 3 ? 'data' : rung === 4 ? 'ruling' : 'growth'
  return {
    id, prefix, rung, kind, title: text.title, why: text.why, first_step: text.first_step, job, minutes: text.minutes,
    link: text.link, detector, issued_at: now, expires_at: null, members, hero_line: text.hero_line, alternate: null, writer: 'ladder',
  }
}

function projectPhrase(os: OsFacts): string {
  return os.saProject ? `project ${os.saProject}` : "the service account's project"
}
function checkProject(os: OsFacts): string {
  return os.saProject ? `check the project is ${os.saProject}` : "pick the service account's project"
}
function saWho(os: OsFacts): string {
  return os.saEmail ?? "Control Center's service account"
}

function gaGrantAction(members: WebPrefix[], os: OsFacts, now: string): KrishAction {
  const labels = members.map(m => webProperty(m)?.label ?? m)
  return baseAction('shared:ga_grant', 'shared', 1, 'keep_honest', { kind: 'ga_read_ok' }, {
    title: 'Give Control Center read access to your whole Google Analytics account',
    why: `${listJoin(labels)} refuse to be read. One grant on the account covers all four sites and any you add later.`,
    first_step: `In Google Analytics open Admin, then Account access management, press the plus, add ${saWho(os)} as Viewer, and save.`,
    minutes: 3, link: { label: 'Open Google Analytics', href: GA_HOME },
    hero_line: 'Let Control Center read your Google Analytics',
  }, now, members)
}

function adminApiAction(id: string, prefix: WebPrefix | 'shared', members: WebPrefix[], os: OsFacts, now: string): KrishAction {
  const labels = members.map(m => webProperty(m)?.label ?? m)
  const href = os.adminActivationUrl
    ?? `https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com${os.saProject ? `?project=${os.saProject}` : ''}`
  return baseAction(id, prefix, 2, 'keep_honest', { kind: 'admin_api_ok' }, {
    title: "Turn on the Google Analytics Admin API for Control Center's Google project",
    why: `${listJoin(labels)} ${labels.length === 1 ? 'has' : 'have'} recorded nothing, and without this API Control Center cannot tell a wrong property id from a quiet site.`,
    first_step: `Open the link, ${checkProject(os)}, and press Enable. Nothing else changes.`,
    minutes: 2, link: { label: 'Open Google Cloud', href },
    hero_line: 'Turn on one Google setting so the sites can be checked',
  }, now, prefix === 'shared' ? members : [])
}

/** The Krish action for one ladder finding (rungs 1 to 4), in the exact words of spec 5.2. */
export function actionForFinding(f: Finding, r: PropertyRead, h: Health, os: OsFacts, now: string): KrishAction {
  const p = r.p
  const id = `${p.prefix}:${f.id}`
  const rung = (f.rung ?? 4) as 1 | 2 | 3 | 4
  const make = (text: ActionText) => baseAction(id, p.prefix, rung, f.job, { ...f.detector }, text, now)
  switch (f.id) {
    case 'no_access': {
      if (r.idSource === 'none' || h.detail === 'none') {
        const title = `Tell Control Center which property is ${p.label}`
        return make({
          title, why: `${p.env} is not set in Vercel and the site has no id in the code.`,
          first_step: 'Send me the numeric id from Google Analytics, Admin, Property details, and I will put it in the code.',
          minutes: 2, link: null, hero_line: title,
        })
      }
      if (h.detail === 'credentials') {
        return make({
          title: 'Fix the Google Analytics key in Vercel',
          why: h.flags.includes('read_failed')
            ? 'The service account key was not usable at the last check that got an answer.'
            : cleanCopy(shortGaError(r.dataRead.error ?? 'The service account key is not usable.'), 240),
          first_step: "In Vercel, control-center, Settings, Environment Variables, paste the service account's private_key into GA4_SERVICE_ACCOUNT_PRIVATE_KEY for Production, then redeploy.",
          minutes: 5, link: null, hero_line: 'Fix the Google Analytics key',
        })
      }
      // On a carried verdict today's error is a blip, not Google refusing, so
      // the why names the check that did get the refusal instead.
      const refusedWhy = h.flags.includes('read_failed')
        ? `Google refused the read of property ${r.propertyId ?? 'unknown'}${r.previous ? ` on ${day(r.previous.as_of)}` : ''}. The check since then failed before Google answered, so that still stands.`
        : `Google refused the read of property ${r.propertyId ?? 'unknown'}: ${noStop(shortGaError(r.dataRead.error ?? 'no reason given'))}.`
      return make({
        title: `Give Control Center read access to ${p.label}`,
        why: cutAtSentence(refusedWhy, 240),
        first_step: `In Google Analytics open Admin, then Account access management, and add ${saWho(os)} as Viewer. Doing it on the account, not the property, covers all four sites.`,
        minutes: 3, link: { label: 'Open Google Analytics', href: GA_HOME }, hero_line: `Let Control Center read ${p.label}`,
      })
    }
    case 'data_api_off':
      return make({
        title: 'Turn on the Google Analytics Data API',
        why: `Every read of ${p.label} is refused because the Data API is off in ${projectPhrase(os)}.`,
        first_step: `Open the link, ${checkProject(os)}, and press Enable.`,
        minutes: 2,
        link: {
          label: 'Open Google Cloud',
          href: r.dataRead.activationUrl
            || `https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com${os.saProject ? `?project=${os.saProject}` : ''}`,
        },
        hero_line: 'Turn on the Google Analytics Data API',
      })
    case 'admin_api_needed':
      return adminApiAction(id, p.prefix, [p.prefix], os, now)
    case 'wrong_stream': {
      const uri = foundUri(r, h)
      const title = `Check which property is ${p.label}`
      return make({
        title,
        why: uri
          ? `The property Control Center reads has a web stream for ${uri}, not ${p.host}, and none of the properties it can see carries ${p.measurementId}.`
          : `The property Control Center reads has no web stream at all, and none of the properties it can see carries ${p.measurementId}.`,
        first_step: `In Google Analytics open the property for ${p.label}, go to Data streams, and check its measurement id is ${p.measurementId}. If it is a different property, send me its id.`,
        minutes: 5, link: { label: 'Open Google Analytics', href: GA_HOME }, hero_line: title,
      })
    }
    case 'tag_missing': {
      const title = `Put the Google tag back on ${p.host}`
      return make({
        title, why: `The page stopped loading ${p.measurementId}, so nothing is being counted.`,
        first_step: p.repo
          ? `Say yes in chat and I will open a PR on ${p.repo} that restores it.`
          : `Open the site's settings and check the Google Analytics id is still ${p.measurementId}.`,
        minutes: 2, link: null, hero_line: title,
      })
    }
    case 'never_received': {
      const pv = posthogPv(r)
      return make({
        title: `Check Google Analytics is not filtering out every visit to ${p.label}`,
        why: `The tag is on the page${pv ? ` and PostHog counted ${pv} page views this week` : ''}, but Google has never recorded one since ${day(p.tagLiveAt)}.`,
        first_step: 'In Google Analytics open Admin, Data collection and modification, Data filters, and set any Active filter to Testing.',
        minutes: 5, link: { label: 'Open Google Analytics', href: GA_HOME }, hero_line: `Find out why ${p.label} records nothing`,
      })
    }
    case 'plausible_key': {
      const saw = measured(r, h) && r.totals ? `. Google saw ${r.totals.cur.sessions} sessions this week` : ''
      return make({
        title: `Give Control Center your Plausible key for ${p.label}`,
        why: `Google counts only visitors who press Allow, which stays as you set it. Plausible counts every visit and holds door clicks and scoping requests${saw}.`,
        first_step: 'In Plausible open Settings, API keys, and create a Stats API key. In Vercel add it to control-center as PLAUSIBLE_API_KEY for Production, then redeploy. Or reply "GA is enough" and I will stop asking.',
        minutes: 5, link: { label: 'Open Plausible', href: 'https://plausible.io/settings/api-keys' }, hero_line: null,
      })
    }
    case 'canon_ruling': {
      const conflict = p.canon.status === 'ruling_owed' ? p.canon.conflict : ''
      const options = p.canon.status === 'ruling_owed' ? p.canon.options : []
      if (p.prefix === 'fulltime') {
        return make({
          title: `Decide what ${p.label} is for`,
          why: `${conflict} Until you pick, no growth action can name a job.`,
          first_step: 'Reply in chat with one word: proof (it feeds demand for the pilot), measure (keep reading visits, no actions) or park (take the tag off). Merging the PR that follows closes this.',
          minutes: 2, link: null, hero_line: null,
        })
      }
      if (p.prefix === 'legibility') {
        return make({
          title: `Decide whether ${p.label} is live`,
          why: `${conflict} The dashboard calls it retired until you say otherwise.`,
          first_step: 'Reply in chat with live and the job it serves, measure, or retire. Merging the PR that follows closes this.',
          minutes: 2, link: null, hero_line: null,
        })
      }
      return make({
        title: `Decide what ${p.label} is for`,
        why: `${conflict} Until you pick, no growth action can name a job.`,
        first_step: `Reply in chat with one word: ${listJoin(options).replace(/ and ([^ ]+)$/, ' or $1')}. Merging the PR that follows closes this.`,
        minutes: 2, link: null, hero_line: null,
      })
    }
    default:
      // Every rung-bearing id has its own words above. This is only for one
      // added later without them: a fixed short title, never a line cut mid-word.
      return make({
        title: `Look at this on ${p.label}`, why: cutAtSentence(f.line, 240),
        first_step: 'Reply in chat and I will take it from there.', minutes: 5, link: null, hero_line: null,
      })
  }
}

// ---------- insight and health lines ----------
function mostCame(cur: number, top: WebRow | undefined): string {
  if (!top) return ''
  return top.sessions * 2 > cur ? ` Most came from ${sourcePhrase(top.name)}.` : ` The largest share came from ${sourcePhrase(top.name)}.`
}

/** One line per card (spec 4.6), first match wins, never a percentage below the gate and never "0 visits" on an unproven read. */
export function insightLine(r: PropertyRead, h: Health): string {
  const p = r.p
  // A failed read comes first: the verdict it carries is the previous one, and
  // this read's error says nothing about why that verdict was reached.
  if (h.flags.includes('read_failed')) {
    // Batch A can succeed while batch B fails: then the error is the unread
    // all-time count, which is what leaves the verdict unproven.
    const why = r.dataRead.ok
      ? "Google's all-time count could not be read"
      : shortGaError(r.dataRead.error ?? r.dataRead.kind ?? 'no reason given')
    return r.previous
      ? `The last read failed (${noStop(why)}). The verdict above is from ${day(r.previous.as_of)}.`
      : `The last read failed (${noStop(why)}). There is no earlier read to fall back on.`
  }
  if (BAD_HEALTH.includes(h.health)) {
    const pv = posthogPv(r)
    const suffix = pv ? ` PostHog counted ${pv} page views this week, so the site has visitors Google cannot show yet.` : ''
    if (h.health === 'never_received' && p.consentByDesign) {
      return `Google Analytics has recorded nothing from ${p.label} since the tag went live on ${day(p.tagLiveAt)}. It only counts visitors who press Allow, so this is not a visit count.${suffix}`
    }
    const id = h.health === 'api_disabled' ? (h.detail === 'admin' ? 'admin_api_needed' : 'data_api_off') : h.health
    // never_received already names the PostHog count in its own line.
    return ladderLine(id, r, h) + (h.health === 'never_received' ? '' : suffix)
  }
  const ai = r.top.ai.length ? ` ${r.top.ai.reduce((s, row) => s + row.sessions, 0)} came from AI answers (${aiEngines(r.top.ai)}).` : ''
  const totals = measured(r, h) ? r.totals : null
  if (h.health === 'provisional') {
    if (totals && totals.cur.sessions > 0) return `Counting started ${day(p.tagLiveAt)}. ${plural(totals.cur.sessions, 'visit', 'visits')} so far.${ai}`
    return `Counting started ${day(p.tagLiveAt)}. The first full day is ${day(addDays(p.tagLiveAt, 1))}.`
  }
  if (!totals) return HEALTH_LINE[h.health]
  const cur = totals.cur.sessions, prev = totals.prev.sessions
  const top = r.top.sources[0]
  if (r.plausible?.ok) {
    return `Plausible counted ${plural(r.plausible.visits7d, 'visit', 'visits')} this week. Google saw ${cur}, the visitors who pressed Allow.${ai}`
  }
  if (h.flags.includes('undercounting') && r.posthog) {
    return `PostHog counted ${r.posthog.pageviews7d} page views this week and Google saw ${totals.cur.pageviews}, so read PostHog for traffic here.${ai}`
  }
  if (cur >= TREND_MIN_SESSIONS && prev >= TREND_MIN_SESSIONS) {
    const change = (cur - prev) / prev
    if (Math.abs(change) >= TREND_MIN_PCT) {
      if (change <= -0.45 && change >= -0.55) return `Visits halved on last week, ${cur} against ${prev}.${mostCame(cur, top)}${ai}`
      const pct = Math.round((Math.abs(change) * 100) / 5) * 5
      return `Visits ${change > 0 ? 'up' : 'down'} ${pct}% on last week, ${cur} against ${prev}.${mostCame(cur, top)}${ai}`
    }
    return `${cur} visits this week, about the same as last week.${mostCame(cur, top)}${ai}`
  }
  if (cur >= TREND_MIN_SESSIONS) return `${cur} visits this week, against ${prev} the week before.${mostCame(cur, top)}${ai}`
  if (cur >= 1) {
    const from = top ? `, ${top.sessions} of them from ${sourcePhrase(top.name)}` : ''
    return `${plural(cur, 'visit', 'visits')} this week${from}. Too few to call a trend.${ai}`
  }
  return `No visits this week.${ai}`
}

/** HEALTH_LINE plus the specific reason, where there is one. */
export function healthLine(r: PropertyRead, h: Health): string {
  const base = HEALTH_LINE[h.health]
  const p = r.p
  let extra = ''
  if (h.health === 'no_access') extra = noAccessDetail(r, h)
  else if (h.health === 'api_disabled') extra = h.detail === 'admin' ? 'The Admin API is off.' : 'The Data API is off.'
  else if (h.health === 'wrong_stream') extra = foundUri(r, h) ? `Its stream points at ${foundUri(r, h)}.` : 'It has no web stream at all.'
  else if (h.health === 'tag_missing') extra = `${p.host} does not load ${p.measurementId}.`
  else if (h.health === 'provisional' && !h.flags.includes('read_failed')) extra = `Tag live since ${day(p.tagLiveAt)}.`
  return extra ? `${base} ${extra}` : base
}

// ---------- ladder ----------
export interface LadderResult { action: KrishAction | null; closed: WebClosed[]; needsLlm: boolean; waitLine: string | null }

function isExpired(a: KrishAction, now: string): boolean {
  return a.rung === 5 && !!a.expires_at && t(a.expires_at) <= t(now)
}

/**
 * One Krish action per property (spec 5.1). Close the previous action first,
 * then take the lowest open rung, keeping issued_at while the id is unchanged.
 * With nothing on rungs 1 to 4, a live site with jobs reaches rung 5: the
 * previous growth action is reused while open, and needsLlm says when the
 * caller should ask the model (or fall back) for a fresh one.
 */
export function ladder(args: { r: PropertyRead; h: Health; findings: Finding[]; facts: DetectorFacts; os: OsFacts; evidenceHash: string; now: string }): LadderResult {
  const { r, h, findings, facts, os, evidenceHash, now } = args
  const p = r.p
  const closed: WebClosed[] = []
  const prevAny = r.previous?.action ?? null
  const prev = prevAny && prevAny.prefix !== 'shared' ? prevAny : null
  let open: KrishAction | null = prev
  if (prev) {
    if (detectorFired(prev, facts)) {
      closed.push({ title: prev.title, detector: prev.detector.kind, how: 'done', closed_at: now })
      open = null
    } else if (isExpired(prev, now)) {
      closed.push({ title: prev.title, detector: prev.detector.kind, how: 'expired', closed_at: now })
      open = null
    }
  }

  let pick: Finding | null = null
  for (const f of findings) {
    if (f.cls !== 'krish' || f.rung == null) continue
    if (f.id === 'never_received' && p.consentByDesign) continue
    if (!pick || f.rung < (pick.rung as number)) pick = f
  }
  const readFailed = h.flags.includes('read_failed')
  if (pick) {
    const action = actionForFinding(pick, r, h, os, now)
    // A failed read carries the previous verdict, so the step it owes is the
    // one already on the card, word for word: rebuilt from today's blip its why
    // would quote an error that is not the reason.
    if (readFailed && open && open.id === action.id) return { action: open, closed, needsLlm: false, waitLine: null }
    if (open && open.id === action.id) {
      action.issued_at = open.issued_at
      action.detector = { ...action.detector, baseline: open.detector?.baseline ?? action.detector.baseline }
    }
    return { action, closed, needsLlm: false, waitLine: null }
  }

  const wait = (line: string): LadderResult => ({ action: null, closed, needsLlm: false, waitLine: line })
  if (p.canon.status === 'measure_only') return wait('Measure only, by your ruling.')
  if (p.canon.status === 'retired') return wait('Retired by your ruling. Only visits are read.')
  if (h.health === 'provisional' && !readFailed) {
    return wait(`Nothing to do yet. The first full day of data lands on ${day(addDays(p.tagLiveAt, PROVISIONAL_HOURS / 24))}.`)
  }
  if (readFailed) {
    // An open growth action does not depend on today's GA read: keep it, with
    // its issued_at and 14 days, rather than dropping it for a day and asking
    // for a fresh one tomorrow.
    if (open && open.rung === 5) return { action: open, closed, needsLlm: false, waitLine: null }
    return wait('Nothing to do until the next check reads it.')
  }
  if (!(h.health === 'ok' || h.health === 'quiet') || p.canon.status !== 'live' || !p.jobs.length) {
    return wait(`Nothing only you can do on ${p.label} this week.`)
  }

  // Rung 5.
  if (open && open.rung === 5) {
    const llm = r.previous?.llm ?? null
    const ageDays = (t(now) - t(open.issued_at)) / DAY_MS
    const attemptedMs = llm?.attempted_at ? t(now) - t(llm.attempted_at) : Infinity
    let needsLlm = (!!llm && evidenceHash !== llm.evidence_hash && ageDays >= LLM_REFRESH_MIN_DAYS)
      || (open.writer === 'fallback' && attemptedMs > LLM_RETRY_HOURS * HOUR_MS)
    if (attemptedMs <= LLM_RETRY_HOURS * HOUR_MS) needsLlm = false
    return { action: open, closed, needsLlm, waitLine: null }
  }
  // No open growth action, or it closed or expired this run: ask for a fresh one.
  return { action: null, closed, needsLlm: true, waitLine: null }
}

/**
 * Account-level fixes shown once, not once per site (spec 5.1 step 5).
 * Two or more properties refused with a 403 become shared:ga_grant; any
 * property that needs the Admin API joins shared:admin_api. Only one shows,
 * ga_grant first; every member waits on it. A previous shared action closes
 * when every one of its members' detectors fires.
 */
export function mergeShared(items: Array<{ prefix: WebPrefix; action: KrishAction | null; findings: Finding[] }>, prevShared: KrishAction | null,
  os: OsFacts, facts: DetectorFacts, now: string):
  { shared: KrishAction | null; sharedClosed: WebClosed[]; perProperty: Record<WebPrefix, KrishAction | null>; waitLines: Partial<Record<WebPrefix, string>> } {
  const perProperty = Object.fromEntries(WEB_PROPERTIES.map(p => [p.prefix, null])) as Record<WebPrefix, KrishAction | null>
  for (const it of items) perProperty[it.prefix] = it.action
  const waitLines: Partial<Record<WebPrefix, string>> = {}
  const sharedClosed: WebClosed[] = []

  let prevOpen: KrishAction | null = prevShared && prevShared.prefix === 'shared' ? prevShared : null
  if (prevOpen && detectorFired(prevOpen, facts)) {
    sharedClosed.push({ title: prevOpen.title, detector: prevOpen.detector.kind, how: 'done', closed_at: now })
    prevOpen = null
  }

  const grantMembers = items
    .filter(it => it.action?.id === `${it.prefix}:no_access`
      && it.findings.some(f => f.id === 'no_access' && f.evidence?.kind === 'permission_denied'))
    .map(it => it.prefix)
  const adminMembers = items.filter(it => it.findings.some(f => f.id === 'admin_api_needed')).map(it => it.prefix)

  let shared: KrishAction | null = null
  let members: WebPrefix[] = []
  if (grantMembers.length >= 2) {
    shared = gaGrantAction(grantMembers, os, now)
    members = [...grantMembers, ...adminMembers.filter(m => !grantMembers.includes(m))]
  } else if (adminMembers.length >= 1) {
    shared = adminApiAction('shared:admin_api', 'shared', adminMembers, os, now)
    members = adminMembers
  }
  if (shared && prevOpen && prevOpen.id === shared.id) shared.issued_at = prevOpen.issued_at
  for (const m of members) {
    perProperty[m] = null
    waitLines[m] = WAITING_ON_SHARED
  }
  return { shared, sharedClosed, perProperty, waitLines }
}

// ---------- rung 5 (LLM) ----------
export function allowedDetectors(p: WebProperty): DetectorKind[] {
  switch (p.prefix) {
    case 'site': return ['pilot_state_advanced', 'plausible_goals', 'today_slot_done']
    case 'mymu': return ['substack_new_post', 'today_slot_done']
    case 'fulltime': return ['rss_items_up', 'today_slot_done']
    case 'legibility': return ['key_events_configured', 'today_slot_done']
    default: return ['today_slot_done']
  }
}

export function webActionRules(p: WebProperty, allowed: DetectorKind[]): string {
  const jobs = p.jobs.map(j => `${jobLabel(j)} (${j})`).join(', ')
  const lines = [
    `YOU ARE CHOOSING ONE ACTION FOR KRISH ON ${p.label}. What results mean here: ${p.goal} The jobs this site serves: ${jobs}. Every proposal names one of these jobs and no other.`,
    'ONLY-KRISH RULE: a send, a publish, a decision, a recording, a login, a permission, a payment setting. Never propose what an agent or the OS can do (drafting, research, analysis, tracking, reporting, code).',
    'It must fit in one sitting: 120 minutes or less of his time.',
    'ABSOLUTE RULE: every number or date you write appears in EVIDENCE. Anything not in EVIDENCE is unknown. At these volumes single digits are not a trend.',
    `Pick done_signal from this list only: ${allowed.map(k => `${k} (${DONE_HINT[k]})`).join('; ')}`,
  ]
  if (p.prefix === 'site') lines.push(`Never propose changing the cookie consent on ${p.label}. It was Krish's decision.`)
  if (p.neverPublishName) lines.push('Anything public must not name Full Time or fulltime.fm.')
  lines.push(
    'Order the proposals by how much each would move results, most first. The first proposal that is not the wildcard becomes the action.',
    'Plain English a 12 year old can follow. No em dashes, no "--", no spaced hyphen as a dash, no ellipses.',
  )
  return lines.join('\n')
}

export const WEB_ACTION_SCHEMA = [
  'Return JSON only: {"candidates":[{"title": string (<=90 chars, starts with a verb), "why": string (<=240 chars, cites a number or date from EVIDENCE), "first_step": string (<=240 chars), "job": one of the jobs above, "minutes": integer 1-120, "done_signal": one of the listed done signals, "play": boolean}]}',
  'Exactly 3 candidates, exactly one with "play": true.',
].join('\n')

// The evidence the model sees. Unknown sources are absent keys, never 0; no
// service-account email and no property ids.
function llmEvidence(r: PropertyRead, h: Health, findings: Finding[], os: OsFacts): Record<string, unknown> {
  const e: Record<string, unknown> = { site: r.p.label, purpose: r.p.goal, health: h.health, flags: h.flags }
  if (measured(r, h) && r.totals) e.visits = { cur: r.totals.cur, prev: r.totals.prev }
  if (measured(r, h) && r.series) e.series_7d = r.series.slice(-7)
  if (r.dataRead.ok) {
    e.top_sources = r.top.sources.slice(0, 5)
    e.top_pages = r.top.pages.slice(0, 5)
    e.ai_visits = r.top.ai
  }
  if (r.posthog) e.posthog = { pageviews_7d: r.posthog.pageviews7d, users_7d: r.posthog.users7d, date: r.posthog.date }
  if (r.plausible?.ok) {
    const pl: Record<string, unknown> = { visits_7d: r.plausible.visits7d, visitors_7d: r.plausible.visitors7d, pageviews_7d: r.plausible.pageviews7d }
    if (r.plausible.visitsPrev7d != null) pl.visits_prev_7d = r.plausible.visitsPrev7d
    if (r.plausible.topSource) pl.top_source = r.plausible.topSource
    if (r.plausible.topPage) pl.top_page = r.plausible.topPage
    if (r.plausible.goals) pl.goals = r.plausible.goals
    e.plausible = pl
  }
  const o: Record<string, unknown> = {}
  if (os.pilot) {
    const pd: Record<string, unknown> = { drafted: os.pilot.drafted }
    if (os.pilot.oldestDraftedAt) pd.oldest_drafted_at = os.pilot.oldestDraftedAt
    o.pilot_deals = pd
  }
  if (os.substackLastPost) o.last_substack_post = os.substackLastPost
  if (typeof os.rssItems === 'number') o.rss_items = os.rssItems
  if (os.reviewIdeas?.length) o.review_ideas = os.reviewIdeas.slice(0, 3)
  e.os = o
  e.findings = findings.filter(f => f.cls === 'krish').map(f => ({ id: f.id, line: f.line }))
  return e
}

function scrubEmails(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'an email address')
}

/**
 * 'EVIDENCE:' + JSON the model reasons over; no SA email, no ids. `closed` is
 * this run's ladder closes, so a previous action its detector just closed reads
 * as done rather than as still open.
 */
export function webActionUser(r: PropertyRead, h: Health, findings: Finding[], os: OsFacts, closed: WebClosed[] = []): string {
  const e = llmEvidence(r, h, findings, os)
  const prev = r.previous?.action && r.previous.action.prefix !== 'shared' ? r.previous.action : null
  let tail = ''
  if (prev) {
    const daysOpen = Math.max(0, daysBetween(prev.issued_at, r.now))
    const done = closed.some(c => c.how === 'done' && c.title === prev.title)
    const expired = !done && isExpired(prev, r.now)
    e.previous_action = { title: prev.title, issued_at: prev.issued_at, days_open: daysOpen, outcome: done ? 'done' : expired ? 'expired' : null }
    if (expired) tail = `\n\nPREVIOUS ACTION NOT ACTED ON IN ${daysOpen} DAYS: propose something smaller or different.`
  } else {
    e.previous_action = null
  }
  return scrubEmails(`EVIDENCE:\n${JSON.stringify(e)}${tail}`)
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : stableJson(x))).join(',')}]`
  if (isObj(v)) {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** djb2 hex over stable JSON (sorted keys) of the LLM evidence. The previous action is left out: its age changes daily. */
export function evidenceHash(r: PropertyRead, h: Health, os: OsFacts): string {
  const s = stableJson(llmEvidence(r, h, buildFindings(r, h, os), os))
  let hash = 5381
  for (let i = 0; i < s.length; i++) hash = (((hash << 5) + hash) + s.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

/** The detector baseline for a rung-5 action, read at the moment it is chosen. */
function baselineFor(kind: DetectorKind, os: Pick<OsFacts, 'pilot' | 'substackLastPost' | 'rssItems'> | undefined): string | number | null {
  if (!os) return null
  if (kind === 'substack_new_post') return os.substackLastPost ?? null
  if (kind === 'rss_items_up') return typeof os.rssItems === 'number' ? os.rssItems : null
  if (kind === 'pilot_state_advanced') return typeof os.pilot?.maxRank === 'number' ? os.pilot.maxRank : null
  return null
}

function growthAction(p: WebProperty, now: string, writer: 'claude' | 'fallback', text: Omit<ActionText, 'hero_line'> & { job: WebJob; detector: DetectorSpec }): KrishAction {
  const a = baseAction(`${p.prefix}:growth:${now.slice(0, 10)}`, p.prefix, 5, text.job, text.detector, { ...text, hero_line: null }, now)
  a.expires_at = addDays(now, GROWTH_ACTION_TTL_DAYS)
  a.writer = writer
  return a
}

/**
 * Validate the model's candidates (spec 6). The first valid non-wildcard is the
 * action; the first valid wildcard ("play") is the alternate; later plays are
 * demoted to ordinary candidates. `os`, when given, fills the detector
 * baseline at the moment of selection (post date, feed count, pilot rank).
 */
export function pickAction(raw: unknown, p: WebProperty, now: string, os?: Pick<OsFacts, 'pilot' | 'substackLastPost' | 'rssItems'>):
  { action: KrishAction | null; alternate: KrishAction['alternate']; candidates: unknown[]; rejected: Array<{ title: string; reason: string }> } {
  const list: unknown[] = isObj(raw) && Array.isArray(raw.candidates) ? raw.candidates : Array.isArray(raw) ? raw : []
  const candidates = list.slice(0, 3)
  const allowed = allowedDetectors(p)
  const rejected: Array<{ title: string; reason: string }> = []
  let action: KrishAction | null = null
  let alternate: KrishAction['alternate'] = null
  let playTaken = false
  for (const c of candidates) {
    const o: Record<string, any> = isObj(c) ? c : {}
    const title = cleanCopy(o.title, 90)
    const why = cleanCopy(o.why, 240)
    const first_step = cleanCopy(o.first_step, 240)
    let reason = ''
    if (title.length < 12) reason = 'title under 12 characters'
    else if (!isJob(o.job) || !p.jobs.includes(o.job as WebJob)) reason = `job ${String(o.job)} is not one this site serves`
    else if (!allowed.includes(o.done_signal)) reason = `done signal ${String(o.done_signal)} is not allowed`
    else if (!(Number.isInteger(o.minutes) && o.minutes >= 1 && o.minutes <= 120)) reason = `minutes ${String(o.minutes)} is not 1 to 120`
    if (reason) { rejected.push({ title, reason }); continue }
    let play = o.play === true
    if (play && playTaken) play = false
    if (play) {
      playTaken = true
      alternate = { title, why, job: o.job as WebJob }
      continue
    }
    if (!action) {
      const kind = o.done_signal as DetectorKind
      action = growthAction(p, now, 'claude', {
        title, why, first_step, minutes: o.minutes, link: null, job: o.job as WebJob,
        detector: { kind, baseline: baselineFor(kind, os) },
      })
    }
  }
  if (action) action.alternate = alternate
  return { action, alternate, candidates, rejected }
}

/** The deterministic rung-5 action per site (spec 5.2), used when the model is off, fails or proposes nothing valid. */
export function fallbackGrowthAction(p: WebProperty, r: PropertyRead, os: OsFacts, now: string): KrishAction | null {
  if (p.canon.status !== 'live' || !p.jobs.length) return null
  switch (p.prefix) {
    case 'site': {
      const job: WebJob = p.jobs.includes('fill_pilots') ? 'fill_pilots' : p.jobs[0]
      const advisory = { label: 'Open Advisory', href: '#/people?lane=pilots' }
      if (os.pilot.drafted > 0 && os.pilot.oldestDraftedAt) {
        const n = Math.max(0, daysBetween(os.pilot.oldestDraftedAt, now))
        return growthAction(p, now, 'fallback', {
          title: `Send the pilot approach drafted on ${day(os.pilot.oldestDraftedAt)}`,
          why: os.pilot.drafted === 1
            ? `${p.label} is there to book pilots, and the one drafted approach has sat unsent for ${plural(n, 'day', 'days')}. Visits cannot book a call; you can.`
            : `${p.label} is there to book pilots, and ${os.pilot.drafted} drafted approaches sit unsent, the oldest for ${plural(n, 'day', 'days')}. Visits cannot book a call; you can.`,
          first_step: 'Open People, Advisory, read the draft, and send it from your own inbox.',
          minutes: 15, link: advisory, job, detector: { kind: 'pilot_state_advanced', baseline: os.pilot.maxRank },
        })
      }
      return growthAction(p, now, 'fallback', {
        title: 'Name one leader who fits the face and ask for the approach to be drafted',
        why: `${p.label} is there to book pilots, and no drafted approach is waiting to be sent.`,
        first_step: 'Write one name and company on today\'s list, then ask in chat for the approach to be drafted.',
        minutes: 10, link: advisory, job, detector: { kind: 'today_slot_done' },
      })
    }
    case 'mymu': {
      if (!os.substackLastPost) return null
      const n = Math.max(0, daysBetween(os.substackLastPost, now))
      const idea = os.reviewIdeas?.[0]
      const lead = n >= PUBLICATION_DORMANT_DAYS
        ? `The last public post was ${day(os.substackLastPost)}, ${plural(n, 'day', 'days')} ago, so there is nothing new for anyone to find.`
        : `The last public post was ${day(os.substackLastPost)}, ${plural(n, 'day', 'days')} ago, and the goal is one every week.`
      const withIdea = idea ? `${lead} One idea is waiting in review: "${idea}".` : lead
      return growthAction(p, now, 'fallback', {
        title: 'Publish one makeyourmindup post this week',
        why: withIdea.length <= 240 ? withIdea : lead,
        first_step: idea ? 'Open Content, take that idea to a draft, and publish it on Substack.' : 'Open Content, take one idea to a draft, and publish it on Substack.',
        minutes: 90, link: { label: 'Open Content', href: '#/content' },
        job: p.jobs.includes('feed_demand') ? 'feed_demand' : p.jobs[0],
        detector: { kind: 'substack_new_post', baseline: os.substackLastPost },
      })
    }
    case 'fulltime': {
      if (typeof os.rssItems !== 'number') return null
      return growthAction(p, now, 'fallback', {
        title: 'Run the listening test on the latest edition and say go or no go',
        why: os.rssItems === 0
          ? 'The feed has 0 episodes, so directories have nothing to list.'
          : `The feed has ${plural(os.rssItems, 'episode', 'episodes')}, and the next one goes out only when you say go.`,
        first_step: 'Listen to the latest edition from start to end, then reply go or no go in chat.',
        minutes: 30, link: null, job: p.jobs.includes('feed_demand') ? 'feed_demand' : p.jobs[0],
        detector: { kind: 'rss_items_up', baseline: os.rssItems },
      })
    }
    case 'legibility':
      return growthAction(p, now, 'fallback', {
        title: `Check Stripe card payments are on for ${p.label}`,
        why: 'Its own outstanding list had charges off in July, and the paid plans cannot take money until they are on.',
        first_step: `Open Stripe for ${p.label}, go to Settings, Payments, and check card payments show as active.`,
        minutes: 10, link: null, job: p.jobs[0], detector: { kind: 'today_slot_done' },
      })
    default:
      return null
  }
}

// ---------- storage row <-> view ----------
export interface WebInsightRow {
  id?: string; property: string; as_of: string; run_at: string; trigger: 'cron' | 'refresh' | 'run'
  property_id: string | null; id_source: 'env' | 'default' | 'discovered' | 'none' | null; property_tz: string | null
  health: HealthVerdict; health_flags: HealthFlag[]; health_detail: string | null
  checks: Record<string, unknown>; totals: WebTotals | null; series: WebPropertyView['series']; top: Record<string, unknown>
  crosscheck: Record<string, unknown>; insight: string; findings: Finding[]; fixed: WebFixed[]; action: KrishAction | null
  closed: WebClosed[]; llm: Record<string, unknown> | null; meta: Record<string, unknown>
}

/** The crosscheck column in view shape, for the run to store. toView also reads PropertyRead-shaped values. */
export function crosscheckOf(r: PropertyRead): WebPropertyView['crosscheck'] {
  return {
    posthog: r.posthog ? { pageviews_7d: r.posthog.pageviews7d, users_7d: r.posthog.users7d, date: r.posthog.date } : null,
    plausible: r.plausible?.ok ? { visits_7d: r.plausible.visits7d, visits_prev_7d: r.plausible.visitsPrev7d, goals: r.plausible.goals } : null,
  }
}

function rowsList(v: unknown): WebRow[] {
  return Array.isArray(v)
    ? v.filter(x => isObj(x) && typeof x.name === 'string').map(x => ({ name: String(x.name), sessions: Number(x.sessions) || 0 }))
    : []
}

function viewCrosscheck(c: Record<string, unknown> | null | undefined): WebPropertyView['crosscheck'] {
  const ph: any = c?.posthog
  const pl: any = c?.plausible
  const pv = ph ? numOrNull(ph.pageviews_7d ?? ph.pageviews7d) : null
  const pVisits = pl && pl.ok !== false ? numOrNull(pl.visits_7d ?? pl.visits7d) : null
  return {
    posthog: ph && pv != null ? { pageviews_7d: pv, users_7d: numOrNull(ph.users_7d ?? ph.users7d) ?? 0, date: String(ph.date ?? '') } : null,
    plausible: pVisits != null
      ? { visits_7d: pVisits, visits_prev_7d: numOrNull(pl.visits_prev_7d ?? pl.visitsPrev7d), goals: Array.isArray(pl.goals) ? pl.goals : null }
      : null,
  }
}

/**
 * One card. `newest` is the property's latest row; `window` is its rows from
 * the last FIXED_WINDOW_DAYS, whose fixed and closed lists are unioned so a fix
 * made on Monday still shows on Wednesday. Totals and series appear only when
 * the read succeeded and the verdict is ok, quiet or provisional.
 *
 * The row stores what the ladder decided; two view fields have no column of
 * their own and are read from the row when present: health_detail holding a
 * full healthLine() (otherwise HEALTH_LINE alone), and meta.wait_line
 * (otherwise derived from the canon and the verdict).
 */
export function toView(p: WebProperty, newest: WebInsightRow | null, window: WebInsightRow[], answeredAt: string | null = null): WebPropertyView {
  const emptyTop = { sources: [], pages: [], ai: [], channels: [] }
  if (!newest) {
    return {
      prefix: p.prefix, label: p.label, venture: p.venture, goal: p.goal, canon: p.canon.status,
      as_of: null, run_at: null, health: null, flags: [], health_line: 'Not checked yet.', property_tz: null, id_source: null,
      totals: null, series: null, top: emptyTop, crosscheck: { posthog: null, plausible: null },
      insight: 'Not read yet. The first check runs at 13:20 UTC, or now if you press Check now.',
      fixed: [], closed: [], action: null, wait_line: null, later: [], drafted: [],
    }
  }
  const health = newest.health
  const flags = Array.isArray(newest.health_flags) ? newest.health_flags : []
  const dataRead: any = isObj(newest.checks) ? newest.checks.dataRead : null
  const readOk = !flags.includes('read_failed') && dataRead?.ok !== false
  const showNumbers = readOk && MEASURED_HEALTH.includes(health)
  const base = HEALTH_LINE[health] ?? ''
  const health_line = typeof newest.health_detail === 'string' && newest.health_detail.startsWith(base) ? newest.health_detail : base

  const rows = [newest, ...(window ?? []).filter(w => w && w !== newest && w.property === newest.property)]
  const fixedById = new Map<string, WebFixed>()
  const closedByKey = new Map<string, WebClosed>()
  for (const row of rows) {
    for (const f of Array.isArray(row.fixed) ? row.fixed : []) {
      const had = fixedById.get(f.id)
      if (!had || t(f.at) > t(had.at)) fixedById.set(f.id, f)
    }
    for (const c of Array.isArray(row.closed) ? row.closed : []) closedByKey.set(`${c.title}|${c.closed_at}`, c)
  }
  const stored = newest.action ?? null
  // A ruling answered since this row was written (p already carries it, via
  // withCanonRuling) closes its rung-4 action on the card now, not at the next
  // 13:20 check. The next run closes it in the row the same way, through the
  // canon_ruled detector, so the two never disagree for longer than a day.
  const answered = !!stored && stored.prefix !== 'shared' && stored.detector?.kind === 'canon_ruled' && p.canon.status !== 'ruling_owed'
  if (answered && answeredAt) {
    closedByKey.set(`${stored!.title}|${answeredAt}`, { title: stored!.title, detector: 'canon_ruled', how: 'done', closed_at: answeredAt })
  }
  const fixed = [...fixedById.values()].sort((a, b) => t(b.at) - t(a.at)).slice(0, 5)
  const closed = [...closedByKey.values()].sort((a, b) => t(b.closed_at) - t(a.closed_at))

  const action = stored && stored.prefix !== 'shared' && !answered ? stored : null
  let wait_line: string | null = null
  if (stored && stored.prefix === 'shared') wait_line = WAITING_ON_SHARED
  else if (!action) {
    // The stored wait line was written for the canon before the answer.
    const metaWait = !answered && isObj(newest.meta) ? newest.meta.wait_line : null
    if (typeof metaWait === 'string' && metaWait) wait_line = metaWait
    else if (p.canon.status === 'measure_only') wait_line = 'Measure only, by your ruling.'
    else if (p.canon.status === 'retired') wait_line = 'Retired by your ruling. Only visits are read.'
    else if (answered) wait_line = `Answered. The next check picks what to do next on ${p.label}.`
    else if (flags.includes('read_failed')) wait_line = 'Nothing to do until the next check reads it.'
    else if (health === 'provisional') wait_line = `Nothing to do yet. The first full day of data lands on ${day(addDays(p.tagLiveAt, PROVISIONAL_HOURS / 24))}.`
    else if (health === 'ok' || health === 'quiet') wait_line = `Nothing only you can do on ${p.label} this week.`
  }

  const findings = Array.isArray(newest.findings) ? newest.findings : []
  const top: any = isObj(newest.top) ? newest.top : {}
  return {
    prefix: p.prefix, label: p.label, venture: p.venture, goal: p.goal, canon: p.canon.status,
    as_of: newest.as_of ?? null, run_at: newest.run_at ?? null, health, flags, health_line,
    property_tz: newest.property_tz ?? null, id_source: newest.id_source ?? null,
    totals: showNumbers ? newest.totals ?? null : null,
    series: showNumbers ? newest.series ?? null : null,
    top: { sources: rowsList(top.sources), pages: rowsList(top.pages), ai: rowsList(top.ai), channels: rowsList(top.channels) },
    crosscheck: viewCrosscheck(newest.crosscheck),
    insight: newest.insight,
    fixed, closed, action, wait_line,
    later: findings.filter(f => f.cls === 'krish' && f.rung == null).map(f => ({ id: f.id, line: f.line, job: f.job })),
    drafted: findings.filter(f => f.cls === 'agent').map(f => ({ id: f.id, line: f.line, job: f.job, routed: f.routed ?? 'unrouted' })),
  }
}

/** The next 13:20:00Z strictly after `now` (the daily cron, vercel.json '20 13 * * *'). */
export function nextRunAt(now: string): string {
  const n = t(now)
  const d = new Date(n)
  let at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 20, 0)
  if (at <= n) at += DAY_MS
  return new Date(at).toISOString().replace('.000Z', 'Z')
}
