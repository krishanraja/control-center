// The site-visits check with the network put back in: Supabase, Google
// Analytics, the page probes, Plausible and the one model call. Every rule it
// applies lives in api/_webInsightsCore.ts; this file only gathers facts, hands
// them to the core, and writes what the core decided.
//
// What it writes, and nothing else: one web_property_insights row per site per
// day, the evidence.web key on Maya's seo (else geo) touchpoint, one
// workflow_runs heartbeat and one audit_log row. No tasks rows (each one fires
// the n8n orchestrator), no system_config, and nothing outside this database:
// every Google, Plausible and site call is a read. The run READS one
// system_config key per site (an answered ruling); the only thing that writes
// one is answerCanonRuling, from Krish's own answer, never the check.
//
// The rule it carries from the core: an unknown is never a zero. A fetch that
// fails gives null, and a null never fires a detector or prints a number.

import { supabase } from './_supabase.js'
import { ga4Identity, runGa4Batch, ga4AdminGet, type GaFailure } from './_google.js'
import { callClaude, robustJson, VOICE_GUARDRAILS, hasAnthropicKey } from './_content.js'
import { SYNTHESIS_MODEL } from './_models.js'
import { goalsSpine } from './_goals.js'
import { proposalPlay } from './_humor.js'
import { ymdIn, shiftYmd } from './_timezone.js'
import { plausibleFacts } from './_plausible.js'
import {
  WEB_PROPERTIES, WEB_JOBS, ga4PropertyId, webProperty,
  canonRulingKey, canonChoices, canonFromChoice, choiceNeedsJob, isWebJob, parseCanonRuling, withCanonRuling,
  type WebProperty, type WebPrefix, type KrishAction, type WebFixed, type WebClosed, type Finding,
  type WebRunSummary, type WebInsightsResponse, type CanonRuling,
} from '../src/lib/webProperties.js'
import {
  insightBatchA, insightBatchB, classifyGaError, shortGaError, reportMeta, parseTotals, parseSeries, parseRows,
  parsePages28, parseHosts, lifetimeEventCount, parseEvents, aiRows, adminStateFromError, propertiesInSummaries,
  streamsFromList, streamMatches, readProbe, newestLastmod, classifyHealth, buildFindings, insightLine, healthLine,
  ladder, mergeShared, doneTextsSince, isPlainLandingPath, allowedDetectors, webActionRules, WEB_ACTION_SCHEMA, webActionUser, canonRuledFor,
  evidenceHash, pickAction, fallbackGrowthAction, toView, nextRunAt, crosscheckOf,
  DEAD_LANDING_MAX_PROBES, PILOT_STATE_RANK, REFRESH_MIN_INTERVAL_MS, FIXED_WINDOW_DAYS, RESTATE_DAYS,
  type AdminFacts, type AdminState, type ProbeFacts, type PropertyRead, type OsFacts, type DetectorFacts,
  type Health, type WebInsightRow, type ReportMeta, type PlausibleRead,
} from './_webInsightsCore.js'

const WORKFLOW_ID = 'growth-web-insights'
const WORKFLOW_NAME = 'Site visits check'
// The same identity snapshot.ts sends, so a site's logs show one reader.
const UA = 'Mozilla/5.0 (compatible; ControlCenter/1.0; +https://controlcenter.krishraja.com)'
const FETCH_TIMEOUT_MS = 8_000
const MAX_BODY_BYTES = 1_000_000
const DISCOVERY_MAX = 10
const DAY_MS = 86_400_000
const PREVIOUS_DAYS = 8
const RUNNING_STALE_MS = 5 * 60_000
// workflow_runs is writable with the anon key, so a row dated in the future is
// forged or clock-skewed and never trusted; anything past this is ignored.
const CLOCK_SKEW_MS = 60_000
// The snapshot writes this actor; the audit row carries its GA plan.
const SNAPSHOT_ACTOR = 'growth-snapshot-cron'

type Trigger = 'cron' | 'refresh' | 'run'
type LlmOutcome = WebRunSummary['properties'][number]['llm']

// ---------- small helpers ----------
function tableMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === 'PGRST205' || err.code === '42P01' || /could not find the table|does not exist/i.test(String(err.message ?? ''))
}

function isFailure(v: unknown): v is GaFailure {
  return !!v && typeof v === 'object' && 'error' in v && 'status' in v
}

function safeYmd(at: Date, tz: string): { ymd: string; tz: string } {
  try { return { ymd: ymdIn(at, tz), tz } } catch { return { ymd: ymdIn(at, 'UTC'), tz: 'UTC' } }
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** The body, read up to MAX_BODY_BYTES and then dropped: a probe only ever needs the head of a page. */
async function readCapped(r: Response): Promise<string> {
  if (!r.body) return ''
  const reader = r.body.getReader()
  const chunks: Uint8Array[] = []
  let n = 0
  while (n < MAX_BODY_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    n += value.byteLength
  }
  if (n >= MAX_BODY_BYTES) await reader.cancel().catch(() => undefined)
  return Buffer.concat(chunks).toString('utf8', 0, Math.min(n, MAX_BODY_BYTES))
}

/** GET with the 8 s timeout and the 1 MB cap. null = the fetch itself failed (unknown), never an empty page. */
async function fetchCapped(url: string, accept = 'text/html,application/xhtml+xml'): Promise<{ status: number; text: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return { status: r.status, text: await readCapped(r) }
  } catch {
    return null
  }
}

/**
 * GET for the status alone; the body is cancelled unread. Redirects are not
 * followed: a 3xx is not a dead page, and a same-host open redirect must not
 * turn a landing path somebody made up into a fetch of somewhere else.
 */
async function fetchStatus(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    await r.body?.cancel().catch(() => undefined)
    return r.status
  } catch {
    return null
  }
}

// ---------- OS facts ----------
type PreviousRow = WebInsightRow & { id?: string }
interface Gathered {
  os: OsFacts
  pilotKnown: boolean
  substackCountKnown: boolean
  /** Completed slots with when they were ticked off: a title alone cannot say whether it was done after an action was issued. */
  todayDone: Array<{ text: string; at: string | null }>
  posthog: Partial<Record<string, { pageviews7d: number; users7d: number; date: string }>>
  snapshot: { at: string; ga: Record<string, any> } | null
  previousRows: PreviousRow[]
  previousMissing: boolean
  errors: string[]
}

async function gatherOs(now: Date, ident: { email: string | null; project: string | null }, adminActivationUrl: string | null): Promise<Gathered> {
  const errors: string[] = []
  const note = (what: string, err: { message?: string } | null | undefined) => { if (err) errors.push(`${what}: ${String(err.message ?? err).slice(0, 160)}`) }
  const since14 = new Date(now.getTime() - 14 * DAY_MS).toISOString().slice(0, 10)
  const since8 = new Date(now.getTime() - PREVIOUS_DAYS * DAY_MS).toISOString()
  const mymu = WEB_PROPERTIES.find(p => p.substackArchiveUrl)
  const rssProp = WEB_PROPERTIES.find(p => p.rssUrl)

  const [ventures, pilots, focus, ideas, substackCount, posthog, snapshot, previous, archive, rss] = await Promise.all([
    supabase.from('venture_registry').select('slug, active').in('slug', ['mindmake', 'publication', 'full_time', 'legibility']),
    supabase.from('pilot_deals').select('state, drafted_at, updated_at'),
    supabase.from('daily_focus')
      .select('focus_date, target_1_text, target_1_completed_at, target_2_text, target_2_completed_at, target_3_text, target_3_completed_at')
      .gte('focus_date', since14),
    supabase.from('content_ideas').select('idea').eq('state', 'review').is('buried_at', null).limit(3),
    supabase.from('growth_metrics').select('metric_key').eq('metric_key', 'substack_publication_total').limit(1),
    supabase.from('product_metrics').select('product, metric_date, active_users, pageviews')
      .in('product', ['full_time', 'legibility']).eq('window_days', 7).order('metric_date', { ascending: false }).limit(10),
    // audit_log accepts anon inserts, so the actor filter and the caps below are
    // a stopgap: they keep a forged row from inventing more than a snapshot can.
    supabase.from('audit_log').select('created_at, details').eq('event_type', 'growth_snapshot').eq('actor', SNAPSHOT_ACTOR)
      .order('created_at', { ascending: false }).limit(1),
    supabase.from('web_property_insights').select('*').gte('run_at', since8).order('run_at', { ascending: false }).limit(60),
    mymu?.substackArchiveUrl ? fetchCapped(mymu.substackArchiveUrl, 'application/json') : Promise.resolve(null),
    rssProp?.rssUrl ? fetchCapped(rssProp.rssUrl, 'application/rss+xml,application/xml,text/xml') : Promise.resolve(null),
  ])

  // venture_registry: a failed read leaves every venture unknown (null), which never un-rules a canon.
  note('venture_registry', ventures.error)
  const ventureActive: Record<string, boolean | null> = { mindmake: null, publication: null, full_time: null, legibility: null }
  for (const v of (ventures.error ? [] : ventures.data ?? []) as Array<{ slug: string; active: boolean }>) ventureActive[v.slug] = v.active === true

  // pilot_deals: counted only when the read worked. Unknown is null, and the
  // site's pilot fallback is not offered on an unknown count.
  note('pilot_deals', pilots.error)
  const pilotKnown = !pilots.error
  let pilot: OsFacts['pilot'] | null = null
  if (pilotKnown) {
    const rows = (pilots.data ?? []) as Array<{ state: string; drafted_at: string | null }>
    const drafted = rows.filter(r => r.state === 'drafted')
    const oldest = drafted.map(r => r.drafted_at).filter((d): d is string => !!d).sort()[0] ?? null
    const maxRank = rows.reduce((m, r) => Math.max(m, PILOT_STATE_RANK[r.state] ?? -1), -1)
    pilot = { drafted: drafted.length, oldestDraftedAt: oldest, maxRank }
  }

  note('daily_focus', focus.error)
  const todayDone: Gathered['todayDone'] = []
  for (const row of (focus.error ? [] : focus.data ?? []) as Array<Record<string, string | null>>) {
    for (const n of [1, 2, 3]) {
      const text = row[`target_${n}_text`]
      const at = row[`target_${n}_completed_at`]
      if (text && at) todayDone.push({ text, at })
    }
  }

  note('content_ideas', ideas.error)
  const reviewIdeas = ((ideas.error ? [] : ideas.data ?? []) as Array<{ idea: string }>).map(r => String(r.idea ?? '').trim()).filter(Boolean).slice(0, 3)

  note('growth_metrics', substackCount.error)
  const substackCountKnown = !substackCount.error
  const substackCountPresent = substackCountKnown && (substackCount.data ?? []).length > 0

  note('product_metrics', posthog.error)
  const posthogBy: Gathered['posthog'] = {}
  for (const row of (posthog.error ? [] : posthog.data ?? []) as Array<{ product: string; metric_date: string; active_users: number | null; pageviews: number | null }>) {
    if (posthogBy[row.product] || row.pageviews == null) continue
    posthogBy[row.product] = { pageviews7d: Number(row.pageviews) || 0, users7d: Number(row.active_users) || 0, date: String(row.metric_date) }
  }

  note('audit_log growth_snapshot', snapshot.error)
  let snap: Gathered['snapshot'] = null
  const snapRow = (snapshot.error ? null : snapshot.data?.[0]) as { created_at: string; details: string | null } | undefined
  if (snapRow?.details) {
    try {
      const d = JSON.parse(snapRow.details)
      if (d && typeof d.ga === 'object' && d.ga) snap = { at: snapRow.created_at, ga: d.ga }
    } catch { /* an unparseable detail is no snapshot, never an empty one */ }
  }

  const previousMissing = tableMissing(previous.error)
  if (previous.error && !previousMissing) note('web_property_insights', previous.error)
  const previousRows = (previous.error ? [] : previous.data ?? []) as PreviousRow[]

  let substackLastPost: string | null = null
  if (archive && archive.status === 200) {
    try {
      const j = JSON.parse(archive.text)
      const d = Array.isArray(j) ? j[0]?.post_date : null
      substackLastPost = typeof d === 'string' && d ? d : null
    } catch { /* unknown */ }
  }
  const rssItems = rss && rss.status === 200 ? (rss.text.match(/<item[\s>]/g) ?? []).length : null

  const os: OsFacts = {
    saEmail: ident.email, saProject: ident.project, adminActivationUrl,
    // A failed pilot read is null, never "no pilots". The core's evidence builder
    // skips a null pilot, and the site fallback is withheld below.
    pilot: pilot as OsFacts['pilot'],
    substackLastPost, rssItems, reviewIdeas,
    // An unread count raises nothing: the finding would claim a gap nobody saw.
    substackCountPresent: substackCountKnown ? substackCountPresent : true,
    ventureActive,
    plausibleKeySet: Boolean(process.env.PLAUSIBLE_API_KEY),
    snapshotGa: null,
  }
  return { os, pilotKnown, substackCountKnown, todayDone, posthog: posthogBy, snapshot: snap, previousRows, previousMissing, errors }
}

/** The snapshot's plan for one site, in OsFacts shape, only when that snapshot ran after this site's previous check. */
function snapshotFor(p: WebProperty, snap: Gathered['snapshot'], previous: PreviousRow | null): OsFacts['snapshotGa'] {
  const g = snap?.ga?.[p.prefix]
  if (!g || typeof g !== 'object') return null
  if (previous && Date.parse(snap!.at) <= Date.parse(previous.run_at)) return null
  // Capped at what one snapshot can do to one site (RESTATE_DAYS days, four keys each).
  const maxKeys = RESTATE_DAYS * 4
  const holds = Array.isArray(g.holds) ? g.holds.map((h: any) => String(h?.metric_date ?? h)).filter(Boolean).slice(0, RESTATE_DAYS) : []
  return {
    [p.prefix]: {
      writes: Math.min(Number(g.writes) || 0, maxKeys),
      holds,
      deletes: Math.min(Number(g.deletes) || 0, maxKeys),
      corrections: Array.isArray(g.corrections) ? g.corrections.slice(0, maxKeys) : [],
    },
  }
}

// ---------- Admin API ----------
interface AdminCtx { state: AdminState; activationUrl: string | null; visible: Array<{ propertyId: string; accountId: string }> }

async function adminFactsFor(id: string | null, ctx: AdminCtx): Promise<AdminFacts> {
  const base: AdminFacts = { state: ctx.state, visible: null, accountId: null, timeZone: null, streams: null, keyEvents: null, activationUrl: ctx.activationUrl }
  if (ctx.state !== 'ok' || !id) return base
  base.visible = ctx.visible.some(v => v.propertyId === id)
  base.accountId = ctx.visible.find(v => v.propertyId === id)?.accountId ?? null
  const [prop, streams, keys] = await Promise.all([
    ga4AdminGet(`properties/${encodeURIComponent(id)}`),
    ga4AdminGet(`properties/${encodeURIComponent(id)}/dataStreams`),
    ga4AdminGet(`properties/${encodeURIComponent(id)}/keyEvents`),
  ])
  if (!isFailure(prop)) {
    base.timeZone = typeof prop.json?.timeZone === 'string' && prop.json.timeZone ? prop.json.timeZone : null
    if (!base.accountId && typeof prop.json?.parent === 'string') base.accountId = prop.json.parent.replace(/^accounts\//, '') || null
  }
  if (!isFailure(streams)) base.streams = streamsFromList(streams.json)
  if (!isFailure(keys)) {
    const list: any[] = Array.isArray(keys.json?.keyEvents) ? keys.json.keyEvents : []
    base.keyEvents = list.map(k => String(k?.eventName ?? '')).filter(Boolean)
  }
  return base
}

/** The property, among the ones the service account can see, whose web stream carries this site's G- id. */
async function discoverProperty(p: WebProperty, skip: string | null, ctx: AdminCtx): Promise<string | null> {
  const candidates = ctx.visible.map(v => v.propertyId).filter(id => id !== skip).slice(0, DISCOVERY_MAX)
  const found = await Promise.all(candidates.map(async id => {
    const r = await ga4AdminGet(`properties/${encodeURIComponent(id)}/dataStreams`)
    return !isFailure(r) && streamMatches(streamsFromList(r.json), p.measurementId) === true ? id : null
  }))
  return found.find(Boolean) ?? null
}

// ---------- one property ----------
interface PropertyOutcome {
  p: WebProperty
  r: PropertyRead
  h: Health
  findings: Finding[]
  hash: string
  os: OsFacts
  batchB: 'ok' | string
}

async function readPage(p: WebProperty): Promise<Omit<ProbeFacts, 'deadPages'>> {
  const [home, notFound, sitemap] = await Promise.all([
    fetchCapped(p.probeUrl),
    fetchCapped(`https://${p.host}/cc-not-found-check`),
    p.sitemapUrl ? fetchCapped(p.sitemapUrl, 'application/xml,text/xml') : Promise.resolve(null),
  ])
  const page = home && home.status === 200 ? readProbe(home.text, p.measurementId) : null
  const nf = notFound ? readProbe(notFound.text, p.measurementId) : null
  return {
    fetched: !!home,
    status: home?.status ?? null,
    hasTag: page ? page.hasTag : null,
    consentGated: page?.consentGated ?? false,
    consentDefaultDenied: page?.consentDefaultDenied ?? false,
    title: page?.title ?? null,
    notFound: notFound ? { status: notFound.status, hasTag: nf ? nf.hasTag : null, title: nf?.title ?? null } : null,
    sitemapNewest: sitemap && sitemap.status === 200 ? newestLastmod(sitemap.text) : null,
  }
}

async function deadLandings(p: WebProperty, pages28: Array<{ name: string; sessions: number }>): Promise<ProbeFacts['deadPages']> {
  // Landing paths come from GA, and anyone can send GA hits with any path, so
  // only plain URL paths are probed (isPlainLandingPath).
  const paths = pages28
    .filter(row => row.sessions >= 1 && isPlainLandingPath(row.name))
    .map(row => row.name)
    .slice(0, DEAD_LANDING_MAX_PROBES)
  const statuses = await Promise.all(paths.map(path => fetchStatus(`https://${p.host}${path}`)))
  return paths.map((path, i) => ({ path, status: statuses[i] })).filter((d): d is { path: string; status: number } => d.status === 404 || d.status === 410)
}

async function readOne(p: WebProperty, now: Date, admin: AdminCtx, g: Gathered): Promise<PropertyOutcome> {
  const nowIso = now.toISOString()
  const prevRow = g.previousRows.find(row => row.property === p.prefix) ?? null
  const pagePromise = readPage(p)

  // 1. Id: an id an earlier check proved by discovery first, whatever the
  // Admin API says today, as the snapshot does; then env, then the code
  // default. Starting from the wrong id every day would rediscover the same
  // property and report it as a new fix each time.
  const pick = ga4PropertyId(p, process.env)
  let id: string | null = pick.from === 'none' ? null : pick.id
  let idSource: PropertyRead['idSource'] = pick.from
  let discoveredFrom: string | null = null
  const prevDiscovered = prevRow?.id_source === 'discovered' && prevRow.property_id ? prevRow.property_id : null
  if (prevDiscovered) {
    id = prevDiscovered
    idSource = 'discovered'
  }

  // 2. Admin reads, and 3. discovery when the id is missing or its stream is
  // wrong (a kept discovered id included), at most once per run.
  let adminFacts = await adminFactsFor(id, admin)
  let discoveryTried = false
  const discover = async () => {
    if (discoveryTried) return false
    discoveryTried = true
    const found = await discoverProperty(p, id, admin)
    if (!found) return false
    // Finding again the property an earlier check already found is not news.
    discoveredFrom = found === prevDiscovered ? null : (id ?? 'none')
    id = found
    idSource = 'discovered'
    adminFacts = await adminFactsFor(id, admin)
    return true
  }
  if (admin.state === 'ok' && (!id || streamMatches(adminFacts.streams, p.measurementId) === false)) await discover()

  // 4. Batch A, with the hostName filter, once more without it on a 400.
  let hostFilter: 'on' | 'off' = 'on'
  const runA = async () => {
    if (!id) return null
    let a = await runGa4Batch(id, insightBatchA(p, { hostFilter: hostFilter === 'on' }))
    if (isFailure(a) && classifyGaError(a) === 'invalid_argument' && hostFilter === 'on') {
      hostFilter = 'off'
      a = await runGa4Batch(id, insightBatchA(p, { hostFilter: false }))
    }
    return a
  }
  let a = await runA()
  if (isFailure(a) && admin.state === 'ok') {
    const kind = classifyGaError(a)
    if ((kind === 'permission_denied' || kind === 'not_found') && await discover()) {
      hostFilter = 'on'
      a = await runA()
    }
  }

  // 5. Batch B with the same filter setting. Its failure leaves lifetime, hosts and events unknown.
  const b = id && a && !isFailure(a) ? await runGa4Batch(id, insightBatchB(p, { hostFilter: hostFilter === 'on' })) : null
  const bOk = !!b && !isFailure(b)

  // 6. Parse.
  let dataRead: PropertyRead['dataRead']
  let meta: ReportMeta | null = null
  if (!id) dataRead = { ok: false, status: null, kind: null, error: `${p.env} unset and no default` }
  else if (!a || isFailure(a)) {
    const f = (a ?? { error: 'no read', status: 0, reason: 'NETWORK', activationUrl: null }) as GaFailure
    dataRead = { ok: false, status: f.status, kind: classifyGaError(f), error: shortGaError(f.error), activationUrl: f.activationUrl ?? null }
  } else {
    dataRead = { ok: true, status: 200, kind: null, error: null }
    meta = reportMeta(a.reports[0])
  }
  const reports = a && !isFailure(a) ? a.reports : []
  const tzPick: { zone: string; from: NonNullable<PropertyRead['tzSource']> } = adminFacts.timeZone
    ? { zone: adminFacts.timeZone, from: 'admin' }
    : meta?.timeZone ? { zone: meta.timeZone, from: 'report' }
    : prevRow?.property_tz ? { zone: prevRow.property_tz, from: 'previous' }
    : { zone: 'UTC', from: 'default' }
  const { ymd: today, tz } = safeYmd(now, tzPick.zone)
  // An unusable zone falls back to UTC, which is then a guess like any default.
  const tzSource: NonNullable<PropertyRead['tzSource']> = tz === tzPick.zone ? tzPick.from : 'default'
  const asOf = shiftYmd(today, -1)
  const expected = Array.from({ length: 28 }, (_, i) => shiftYmd(asOf, i - 27))
  const pages28 = dataRead.ok ? parsePages28(reports[4]) : { pages: [], organic: [] }
  const sources = dataRead.ok ? parseRows(reports[3], 1) : []

  // 7. Probe (the page, a not-found page, the sitemap, then the landings that 404).
  const page = await pagePromise
  const probe: ProbeFacts = { ...page, deadPages: await deadLandings(p, pages28.pages) }

  // 8. Cross-checks.
  const posthog = p.posthogProduct ? g.posthog[p.posthogProduct] ?? null : null
  let plausible: PlausibleRead | null = null
  if (p.plausibleSiteId && g.os.plausibleKeySet) {
    plausible = await plausibleFacts(p.plausibleSiteId, {
      cur: [shiftYmd(asOf, -6), asOf],
      prev: [shiftYmd(asOf, -13), shiftYmd(asOf, -7)],
    })
  }

  // 9. Assemble.
  const r: PropertyRead = {
    p, now: nowIso, propertyId: id, idSource, tz, tzSource, asOf, dataRead, hostFilter, meta,
    totals: dataRead.ok ? parseTotals(reports[0]) : null,
    series: dataRead.ok ? parseSeries(reports[1], expected) : null,
    top: dataRead.ok
      ? { sources: sources.slice(0, 10), pages: parseRows(reports[2], 0).slice(0, 10), ai: aiRows(sources), channels: parseRows(reports[3], 0).slice(0, 10) }
      : { sources: [], pages: [], ai: [], channels: [] },
    pages28: pages28.pages, organic28: pages28.organic,
    hosts: bOk ? parseHosts((b as { reports: any[] }).reports[0]) : [],
    lifetime: bOk ? lifetimeEventCount((b as { reports: any[] }).reports[1]) : null,
    events: bOk ? parseEvents((b as { reports: any[] }).reports[2]) : null,
    admin: adminFacts, probe, posthog, plausible,
    previous: prevRow ? {
      health: prevRow.health, property_tz: prevRow.property_tz, as_of: prevRow.as_of, run_at: prevRow.run_at, action: prevRow.action ?? null,
      detail: prevRow.meta && typeof prevRow.meta.health_detail === 'string' ? prevRow.meta.health_detail : null,
      llm: prevRow.llm && typeof prevRow.llm.evidence_hash === 'string'
        ? { evidence_hash: String(prevRow.llm.evidence_hash), attempted_at: String(prevRow.llm.attempted_at ?? ''), writer: String(prevRow.llm.writer ?? '') }
        : null,
    } : null,
    discoveredFrom,
  }

  // 10. Verdict, findings and the evidence hash, over this site's own view of the snapshot.
  const os: OsFacts = { ...g.os, snapshotGa: snapshotFor(p, g.snapshot, prevRow) }
  const h = classifyHealth(r)
  const findings = buildFindings(r, h, os)
  const batchB = !b ? 'skipped' : isFailure(b) ? shortGaError(b.error) : 'ok'
  return { p, r, h, findings, hash: evidenceHash(r, h, os), os, batchB }
}

/**
 * One site whose read threw instead of returning. Every I/O helper already
 * swallows its own errors, so this is for the unexpected (a Google payload a
 * parser was not written for, a future edit): that site carries its previous
 * verdict with read_failed, like any failed read, and the other three are
 * written as normal.
 */
function failedOutcome(p: WebProperty, now: Date, admin: AdminCtx, g: Gathered, e: unknown): PropertyOutcome {
  const nowIso = now.toISOString()
  const prevRow = g.previousRows.find(row => row.property === p.prefix) ?? null
  const pick = ga4PropertyId(p, process.env)
  const zone = prevRow?.property_tz ?? 'UTC'
  const { ymd: today, tz } = safeYmd(now, zone)
  const r: PropertyRead = {
    p, now: nowIso,
    propertyId: prevRow?.id_source === 'discovered' && prevRow.property_id ? prevRow.property_id : pick.from === 'none' ? null : pick.id,
    idSource: prevRow?.id_source === 'discovered' && prevRow.property_id ? 'discovered' : pick.from,
    tz, tzSource: prevRow?.property_tz && tz === zone ? 'previous' : 'default', asOf: shiftYmd(today, -1),
    dataRead: { ok: false, status: null, kind: 'other', error: `the check failed: ${String((e as any)?.message || e).slice(0, 120)}` },
    hostFilter: 'on', meta: null, totals: null, series: null,
    top: { sources: [], pages: [], ai: [], channels: [] }, pages28: [], organic28: [], hosts: [], lifetime: null, events: null,
    admin: { state: admin.state, visible: null, accountId: null, timeZone: null, streams: null, keyEvents: null, activationUrl: admin.activationUrl },
    probe: { fetched: false, status: null, hasTag: null, consentGated: false, consentDefaultDenied: false, title: null, notFound: null, sitemapNewest: null, deadPages: [] },
    posthog: null, plausible: null,
    previous: prevRow ? {
      health: prevRow.health, property_tz: prevRow.property_tz, as_of: prevRow.as_of, run_at: prevRow.run_at, action: prevRow.action ?? null,
      llm: prevRow.llm && typeof prevRow.llm.evidence_hash === 'string'
        ? { evidence_hash: String(prevRow.llm.evidence_hash), attempted_at: String(prevRow.llm.attempted_at ?? ''), writer: String(prevRow.llm.writer ?? '') }
        : null,
      detail: prevRow.meta && typeof prevRow.meta.health_detail === 'string' ? prevRow.meta.health_detail : null,
    } : null,
    discoveredFrom: null,
  }
  const os: OsFacts = { ...g.os, snapshotGa: null }
  const h = classifyHealth(r)
  const findings = buildFindings(r, h, os)
  return { p, r, h, findings, hash: evidenceHash(r, h, os), os, batchB: 'skipped' }
}

function detectorFacts(nowIso: string, outs: PropertyOutcome[], g: Gathered, adminOk: boolean): DetectorFacts {
  const f: DetectorFacts = {
    now: nowIso, gaReadOk: {}, adminOk, streamMatch: {}, tagPresent: {}, lifetimeHits: {},
    plausibleOk: false, plausibleGoals: false, consentDefaultDenied: {}, canonRuled: {}, keyEventsConfigured: {},
    substackCountPresent: g.substackCountKnown && g.os.substackCountPresent,
    substackLastPost: g.os.substackLastPost, rssItems: g.os.rssItems,
    // NaN never compares greater than a baseline, so an unread pilot table fires nothing.
    pilotMaxRank: g.pilotKnown && g.os.pilot ? g.os.pilot.maxRank : NaN,
    // Filled per property in the ladder call (doneTextsSince): a completion
    // counts only after the action it would close was issued.
    todayDoneTexts: [], openFindingIds: {},
  }
  for (const { p, r, findings } of outs) {
    const pre = p.prefix
    const pageRead = r.probe.fetched && r.probe.status === 200
    f.gaReadOk[pre] = r.dataRead.ok
    f.streamMatch[pre] = r.idSource === 'discovered' ? true : streamMatches(r.admin.streams, p.measurementId)
    f.tagPresent[pre] = pageRead ? r.probe.hasTag : null
    f.lifetimeHits[pre] = r.lifetime == null ? null : r.lifetime > 0
    f.consentDefaultDenied[pre] = pageRead ? r.probe.consentDefaultDenied : null
    f.canonRuled[pre] = canonRuledFor(p, g.os)
    f.keyEventsConfigured[pre] = Array.isArray(r.admin.keyEvents) ? r.admin.keyEvents.length > 0
      : Array.isArray(r.events) ? r.events.some(e => e.isKey) : null
    f.openFindingIds[pre] = findings.filter(x => x.cls !== 'auto').map(x => x.id)
    if (p.plausibleSiteId && r.plausible?.ok) {
      f.plausibleOk = true
      f.plausibleGoals = Array.isArray(r.plausible.goals) && r.plausible.goals.length > 0
    }
  }
  return f
}

// ---------- rung 5 ----------
async function modelAction(o: PropertyOutcome, trigger: Trigger, nowIso: string, closed: WebClosed[]):
  Promise<{ picked: ReturnType<typeof pickAction> | null; failed: string | null }> {
  const { p, r, h, findings, os } = o
  try {
    const { prompt: goalsBlock } = await goalsSpine(`choosing the one thing only Krish can do this week to get more results from ${p.label}`)
    const system = [goalsBlock, webActionRules(p, allowedDetectors(p)), VOICE_GUARDRAILS, proposalPlay(3), WEB_ACTION_SCHEMA].join('\n\n')
    const user = webActionUser(r, h, findings, os, closed)
    const raw = await callClaude({
      agent: 'growth-web-insight', model: SYNTHESIS_MODEL, system, user,
      maxTokens: 2000, temperature: 0.5, think: false, json: true,
      fallback: trigger === 'refresh', ...(trigger === 'refresh' ? { timeoutMs: 45_000 } : {}),
    })
    return { picked: pickAction(robustJson(raw), p, nowIso, os), failed: null }
  } catch (e: any) {
    return { picked: null, failed: String(e?.message || e).slice(0, 200) }
  }
}

// ---------- the run ----------
export async function runWebInsights(trigger: Trigger, opts?: { dryRun?: boolean }): Promise<WebRunSummary> {
  const dryRun = !!opts?.dryRun
  const started = new Date()
  const nowIso = started.toISOString()
  const errors: string[] = []

  // 1. Heartbeat. agent_id 'os', never an agent slug: trg_agents_last_run would
  // stamp that agent's last_run and fake her liveness.
  let runId: number | null = null
  if (!dryRun) {
    const { data, error } = await supabase.from('workflow_runs').insert({
      workflow_id: WORKFLOW_ID, workflow_name: WORKFLOW_NAME, agent_id: 'os', run_at: nowIso, status: 'running', metadata: { trigger },
    }).select('id').single()
    if (error) errors.push(`workflow_runs: ${error.message}`)
    runId = (data as { id: number } | null)?.id ?? null
  }

  try {
    return await runBody(trigger, dryRun, started, errors, runId)
  } catch (e: any) {
    // Nothing is left 'running' with no outcome: the heartbeat says what threw.
    if (runId != null) {
      const message = shortGaError(String(e?.message || e)).slice(0, 500)
      const { error } = await supabase.from('workflow_runs').update({
        status: 'error', duration_ms: Date.now() - started.getTime(), outcome: 'The check stopped before it finished', error_message: message,
      }).eq('id', runId)
      if (error) console.warn('[web-insights] workflow_runs update failed:', error.message)
    }
    throw e
  }
}

async function runBody(trigger: Trigger, dryRun: boolean, started: Date, errors: string[], runId: number | null): Promise<WebRunSummary> {
  const nowIso = started.toISOString()

  // 2. Identity, and one accountSummaries read that says whether the Admin API answers.
  const ident = ga4Identity()
  const summaries = await ga4AdminGet('accountSummaries?pageSize=200')
  const admin: AdminCtx = isFailure(summaries)
    ? { ...adminStateFromError(summaries), visible: [] }
    : { state: 'ok', activationUrl: null, visible: propertiesInSummaries(summaries.json) }

  // 3. OS facts, each read tolerant.
  const g = await gatherOs(started, ident, admin.activationUrl)
  errors.push(...g.errors)

  // 3b. Rulings answered from the dashboard, applied before any site is read,
  // so the site is checked as if the registry already said it (see
  // withCanonRuling). A failed read applies none: an unknown never closes an action.
  const rulings = await readCanonRulings(errors)
  const sites = WEB_PROPERTIES.map(p => withCanonRuling(p, rulings[p.prefix]))

  // 4. The four sites in parallel.
  // One site that throws must not take the other three down with it.
  const outs = await Promise.all(sites.map(p => readOne(p, started, admin, g).catch(e => {
    errors.push(`${p.prefix}: the check threw: ${String((e as any)?.message || e).slice(0, 160)}`)
    return failedOutcome(p, started, admin, g, e)
  })))

  // 5 and 6. Detectors, the ladder, then the account-level merge.
  const facts = detectorFacts(nowIso, outs, g, admin.state === 'ok')
  const ladders = outs.map(o => {
    const prevAction = o.r.previous?.action ?? null
    const own: DetectorFacts = { ...facts, todayDoneTexts: doneTextsSince(g.todayDone, prevAction?.issued_at) }
    return ladder({ r: o.r, h: o.h, findings: o.findings, facts: own, os: o.os, evidenceHash: o.hash, now: nowIso })
  })
  const newestPrev = WEB_PROPERTIES.map(p => g.previousRows.find(row => row.property === p.prefix) ?? null)
  const prevShared = newestPrev.map(row => row?.action).find(a => a && a.prefix === 'shared') ?? null
  const merged = mergeShared(
    outs.map((o, i) => ({ prefix: o.p.prefix, action: ladders[i].action, findings: o.findings })),
    prevShared, g.os, facts, nowIso,
  )

  // 7. Rung 5, only where the ladder asks for it. Dry runs never call the model.
  const mayCall = !dryRun && await hasAnthropicKey()
  const rung5 = await Promise.all(outs.map(async (o, i) => {
    const lr = ladders[i]
    const prevLlm = newestPrev[i]?.llm ?? null
    let action: KrishAction | null = merged.perProperty[o.p.prefix]
    let waitLine: string | null = merged.waitLines[o.p.prefix] ?? lr.waitLine
    if (!lr.needsLlm || merged.waitLines[o.p.prefix]) {
      const reused = !!action && action.rung === 5
      return { action, waitLine, llm: reused ? prevLlm : null, outcome: (reused ? 'reused' : 'skipped') as LlmOutcome }
    }
    const res = mayCall ? await modelAction(o, trigger, nowIso, lr.closed) : { picked: null, failed: null }
    let outcome: LlmOutcome = res.failed ? 'failed' : mayCall ? 'called' : 'fallback'
    let picked = res.picked?.action ?? null
    if (picked && action && action.id === picked.id) picked.issued_at = action.issued_at
    if (!picked) {
      if (!res.failed) outcome = 'fallback'
      // A growth action still open is kept rather than swapped for a fallback:
      // the swap would restart its 14 days and its "owed since" every retry.
      if (!action || action.rung !== 5) {
        const fb = o.p.prefix === 'site' && !g.pilotKnown ? null : fallbackGrowthAction(o.p, o.r, o.os, nowIso)
        picked = fb
      }
    }
    if (picked) { action = picked; waitLine = null } else if (!action) waitLine = `Nothing only you can do on ${o.p.label} this week.`
    const llm = {
      writer: action?.writer ?? (res.failed ? 'failed' : 'none'), model: SYNTHESIS_MODEL, evidence_hash: o.hash,
      candidates: res.picked?.candidates ?? [], rejected: res.picked?.rejected ?? [], alternate: res.picked?.alternate ?? null,
      attempted_at: nowIso, ...(res.failed ? { error: res.failed } : {}),
    }
    return { action, waitLine, llm, outcome }
  }))

  // 9 (read). Maya's rows, so each agent finding knows whether it can be routed.
  const routes = await Promise.all(outs.map(async o => {
    const p = o.p
    if (p.canon.status !== 'live' || !p.touchpointSlug) return null
    const { data, error } = await supabase.from('growth_touchpoints')
      .select('id, channel, evidence')
      .eq('product_slug', p.touchpointSlug).eq('owner_agent', 'maya').in('channel', ['seo', 'geo']).neq('coverage_status', 'retired')
    if (error) { errors.push(`growth_touchpoints ${p.prefix}: ${error.message}`); return null }
    const rows = (data ?? []) as Array<{ id: string; channel: string; evidence: Record<string, any> | null }>
    return rows.find(row => row.channel === 'seo') ?? rows.find(row => row.channel === 'geo') ?? null
  }))

  const rowsOut: WebInsightRow[] = []
  const summaryProps: WebRunSummary['properties'] = []
  const sharedMembers = merged.shared?.members ?? []
  let written = 0
  let writeFailed = false

  for (let i = 0; i < outs.length; i++) {
    const o = outs[i]
    const { p, r, h } = o
    const lr = ladders[i]
    const res5 = rung5[i]
    const route = routes[i]
    let findings = o.findings.map(f => (f.cls === 'agent' && (!route || f.routed !== 'touchpoint') ? { ...f, routed: 'unrouted' as const } : f))
    let notRouted = false
    const agentNotes = findings.filter(f => f.cls === 'agent' && f.routed === 'touchpoint').map(f => ({ id: f.id, line: f.line }))

    // 9 (write). Read-modify-write of evidence.web alone; every other key on Maya's row is left as it was.
    let touchpointsWritten = 0
    const toldMaya: WebFixed[] = []
    if (route) {
      const evidence = route.evidence && typeof route.evidence === 'object' ? route.evidence : {}
      const prevWeb = evidence.web && typeof evidence.web === 'object' ? evidence.web : null
      const prevNotes: Array<{ id: string; line: string }> = Array.isArray(prevWeb?.notes) ? prevWeb.notes : []
      const nowIds = new Set(agentNotes.map(n => n.id))
      const web = {
        as_of: r.asOf, domain: p.host, notes: agentNotes,
        resolved: prevNotes.filter(n => n && !nowIds.has(n.id)).map(n => ({ id: n.id, resolved_at: nowIso })),
      }
      const changed = stable({ ...web, as_of: null }) !== stable(prevWeb ? { ...prevWeb, as_of: null } : null) || prevWeb?.as_of !== r.asOf
      if (changed && (agentNotes.length || prevNotes.length)) {
        let wrote = dryRun
        if (!dryRun) {
          const { error } = await supabase.from('growth_touchpoints').update({ evidence: { ...evidence, web } }).eq('id', route.id)
          if (error) errors.push(`growth_touchpoints ${p.prefix}: ${error.message}`)
          else { touchpointsWritten = 1; wrote = true }
        }
        if (wrote) {
          const known = new Set(prevNotes.map(n => n?.id))
          for (const n of agentNotes) if (!known.has(n.id)) toldMaya.push({ id: `told_maya:${n.id}`, line: `Told Maya on the map: ${n.line}`, at: nowIso })
        } else {
          // The note never reached Maya's row, so the card must not say it did.
          notRouted = true
        }
      }
    }
    if (notRouted) findings = findings.map(f => (f.cls === 'agent' ? { ...f, routed: 'unrouted' as const } : f))

    // 8. Fixed on its own: this run's auto findings, the closes, and what went to Maya.
    const isMember = sharedMembers.includes(p.prefix)
    const action: KrishAction | null = isMember ? merged.shared : res5.action
    const closed: WebClosed[] = [...lr.closed]
    const prevSharedMembers = prevShared?.members ?? []
    if (prevSharedMembers.includes(p.prefix)) closed.push(...merged.sharedClosed)
    const fixed: WebFixed[] = [
      ...findings.filter(f => f.cls === 'auto').map(f => ({ id: f.id, line: f.line, at: nowIso })),
      ...closed.map(c => c.how === 'done'
        ? { id: `action_closed:${c.title}`, line: `Done: ${c.title}.`, at: nowIso }
        : {
            id: `action_expired:${c.title}`,
            line: action?.rung === 5 && action.title !== c.title
              ? `Retired an unacted action after 14 days and chose a fresh one: ${action.title}.`
              : `Retired an unacted action after 14 days: ${c.title}.`,
            at: nowIso,
          }),
      ...toldMaya,
    ]

    // Merge with a row already written for this site today (a refresh after the cron).
    const sameDay = g.previousRows.find(row => row.property === p.prefix && row.as_of === r.asOf) ?? null
    const fixedById = new Map<string, WebFixed>()
    for (const f of [...(Array.isArray(sameDay?.fixed) ? sameDay!.fixed : []), ...fixed]) if (!fixedById.has(f.id)) fixedById.set(f.id, f)
    const closedByKey = new Map<string, WebClosed>()
    for (const c of [...(Array.isArray(sameDay?.closed) ? sameDay!.closed : []), ...closed]) closedByKey.set(`${c.title}|${c.closed_at}`, c)

    const measured = r.dataRead.ok && !h.flags.includes('read_failed') && (h.health === 'ok' || h.health === 'quiet' || h.health === 'provisional')
    const row: WebInsightRow = {
      property: p.prefix, as_of: r.asOf, run_at: nowIso, trigger,
      // A zone that was only the UTC fallback is not stored as the site's zone.
      property_id: r.propertyId, id_source: r.idSource, property_tz: r.tzSource === 'default' ? null : r.tz,
      health: h.health, health_flags: h.flags, health_detail: healthLine(r, h),
      checks: {
        dataRead: r.dataRead,
        admin: { state: r.admin.state, visible: r.admin.visible, accountId: r.admin.accountId, timeZone: r.admin.timeZone, streams: r.admin.streams, keyEvents: r.admin.keyEvents },
        probe: r.probe, lifetime: r.lifetime, host_filter: r.hostFilter, batch_b: o.batchB,
        discovered_from: r.discoveredFrom, events: r.events,
        quota: { consumed: r.meta?.tokensConsumed ?? null, remaining: r.meta?.tokensRemaining ?? null },
      },
      totals: measured ? r.totals : null,
      series: measured ? r.series : null,
      top: { ...r.top, hosts: r.hosts },
      crosscheck: crosscheckOf(r),
      insight: insightLine(r, h),
      findings,
      fixed: [...fixedById.values()],
      action,
      closed: [...closedByKey.values()],
      llm: isMember ? null : (res5.llm as Record<string, unknown> | null),
      meta: { report: r.meta, wait_line: action ? null : res5.waitLine, health_detail: h.detail },
    }
    rowsOut.push(row)
    summaryProps.push({
      prefix: p.prefix, health: h.health, flags: h.flags, rung: action?.rung ?? null, action_id: action?.id ?? null,
      llm: isMember ? 'skipped' : res5.outcome, findings: findings.length, fixed: fixed.length, touchpoints_written: touchpointsWritten,
      quota: { consumed: r.meta?.tokensConsumed ?? null, remaining: r.meta?.tokensRemaining ?? null },
    })
  }

  // 10. Write.
  if (!dryRun) {
    const { data, error } = await supabase.from('web_property_insights').upsert(rowsOut, { onConflict: 'property,as_of' }).select('id')
    if (error) { writeFailed = true; errors.push(`web_property_insights: ${tableMissing(error) ? 'table missing, the migration is not applied yet' : error.message}`) }
    else written = (data ?? []).length
  }

  const allFailed = outs.every(o => !o.r.dataRead.ok)
  for (const o of outs) if (!o.r.dataRead.ok && o.r.dataRead.error) errors.push(`${o.p.prefix}: ${shortGaError(o.r.dataRead.error)}`)
  const owed = new Set(summaryProps.map(s => s.action_id).filter(Boolean)).size
  const summary: WebRunSummary = {
    trigger, dry_run: dryRun, started_at: nowIso, duration_ms: Date.now() - started.getTime(),
    admin_api: admin.state, properties: summaryProps, errors: errors.map(e => shortGaError(e)),
  }
  const outcome = `${outs.filter(o => o.r.dataRead.ok).length} of ${outs.length} sites read, ${owed} action${owed === 1 ? '' : 's'} owed`

  if (!dryRun) {
    if (runId != null) {
      const { error } = await supabase.from('workflow_runs').update({
        status: allFailed || writeFailed ? 'error' : 'success', duration_ms: summary.duration_ms, outcome, outcome_count: written,
        metadata: summary, ...(allFailed || writeFailed ? { error_message: summary.errors.slice(0, 4).join('; ').slice(0, 500) } : {}),
      }).eq('id', runId)
      if (error) console.warn('[web-insights] workflow_runs update failed:', error.message)
    }
    const { error: logErr } = await supabase.from('audit_log').insert({
      event_type: 'web_insights', actor: WORKFLOW_ID, target: 'web_property_insights',
      display_message: `Site visits check (${trigger}): ${outcome}`,
      details: JSON.stringify(summary),
    })
    if (logErr) console.warn('[web-insights] audit_log failed:', logErr.message)
  }
  return summary
}

// ---------- reads ----------
/**
 * null = a refresh may run now. DB-based on purpose: an in-memory limiter does
 * not hold across serverless instances.
 *
 * Two gates. The ten-minute interval reads the newest web_property_insights
 * run_at, which only the service role can write. A check still in flight has
 * written no row yet, so that gate reads a 'running' workflow_runs heartbeat
 * from the last five minutes; workflow_runs takes anon writes, so a row dated
 * in the future is ignored and no answer is ever more than ten minutes away.
 */
export async function refreshAllowedAt(now: Date = new Date()): Promise<string | null> {
  const nowMs = now.getTime()
  const ceiling = new Date(nowMs + CLOCK_SKEW_MS).toISOString()
  const [done, running] = await Promise.all([
    supabase.from('web_property_insights').select('run_at').lte('run_at', ceiling).order('run_at', { ascending: false }).limit(1),
    supabase.from('workflow_runs').select('run_at').eq('workflow_id', WORKFLOW_ID).eq('status', 'running')
      .gte('run_at', new Date(nowMs - RUNNING_STALE_MS).toISOString()).lte('run_at', ceiling)
      .order('run_at', { ascending: false }).limit(1),
  ])
  const newest = (res: { data: unknown; error: unknown }) => {
    const row = !res.error && Array.isArray(res.data) ? res.data[0] as { run_at?: string | null } | undefined : undefined
    const at = Date.parse(String(row?.run_at ?? ''))
    return Number.isFinite(at) && at <= nowMs + CLOCK_SKEW_MS ? at : null
  }
  // Before the migration there is no insights table to read, so the interval
  // falls back to the newest heartbeat of any status (same future-date guard).
  const lastDone = !done.error ? newest(done) : newest(await supabase.from('workflow_runs').select('run_at')
    .eq('workflow_id', WORKFLOW_ID).lte('run_at', ceiling).order('run_at', { ascending: false }).limit(1))
  const inFlight = newest(running)
  const blockedFrom = [
    lastDone != null && nowMs - lastDone < REFRESH_MIN_INTERVAL_MS ? lastDone : null,
    inFlight != null && nowMs - inFlight < RUNNING_STALE_MS ? inFlight : null,
  ].filter((x): x is number => x != null)
  if (!blockedFrom.length) return null
  const until = Math.min(Math.max(...blockedFrom) + REFRESH_MIN_INTERVAL_MS, nowMs + REFRESH_MIN_INTERVAL_MS)
  return new Date(until).toISOString()
}

// ---------- rulings answered from the dashboard ----------

/** Every site's stored answer that it still accepts (see parseCanonRuling). A failed read is no answers, with the error noted. */
export async function readCanonRulings(errors?: string[]): Promise<Partial<Record<WebPrefix, CanonRuling>>> {
  const out: Partial<Record<WebPrefix, CanonRuling>> = {}
  try {
    const { data, error } = await supabase.from('system_config').select('key, value')
      .in('key', WEB_PROPERTIES.map(p => canonRulingKey(p.prefix)))
    if (error) { errors?.push(`system_config rulings: ${error.message.slice(0, 160)}`); return out }
    for (const p of WEB_PROPERTIES) {
      const row = (data ?? []).find((r: { key: string }) => r.key === canonRulingKey(p.prefix)) as { value: string | null } | undefined
      const ruling = row ? parseCanonRuling(p, row.value) : null
      if (ruling) out[p.prefix] = ruling
    }
  } catch (e: any) {
    errors?.push(`system_config rulings: ${String(e?.message || e).slice(0, 160)}`)
  }
  return out
}

export type AnswerResult =
  | { ok: true; ruling: CanonRuling }
  | { ok: false; status: 400 | 409 | 500; error: string }

/**
 * Store Krish's answer to one site's open ruling (POST /api/growth/web-insights
 * { action: 'answer', property, choice, job? }). One system_config key per
 * site, overwritten if he changes his mind before a PR writes it into the
 * registry. It is the only write here; the next check reads it, and the card
 * closes the action at once through toView.
 */
export async function answerCanonRuling(property: unknown, choice: unknown, job: unknown, now = new Date()): Promise<AnswerResult> {
  const p = typeof property === 'string' ? webProperty(property) : undefined
  if (!p) return { ok: false, status: 400, error: 'property must be one of ' + WEB_PROPERTIES.map(x => x.prefix).join(', ') }
  const options = canonChoices(p)
  if (!options.length) return { ok: false, status: 409, error: `${p.label} has no open ruling to answer` }
  const c = typeof choice === 'string' ? choice.trim().toLowerCase() : ''
  if (!options.includes(c)) return { ok: false, status: 400, error: `choice must be one of ${options.join(', ')}` }
  const j = isWebJob(job) ? job : null
  if (choiceNeedsJob(c) && !j) return { ok: false, status: 400, error: `${c} needs the job it serves: one of ${WEB_JOBS.join(', ')}` }
  const ruling: CanonRuling = { choice: c, job: choiceNeedsJob(c) ? j : null, at: now.toISOString() }
  if (!canonFromChoice(p, ruling.choice, ruling.job)) return { ok: false, status: 400, error: 'that answer is not one this site accepts' }
  const { error } = await supabase.from('system_config')
    .upsert({ key: canonRulingKey(p.prefix), value: JSON.stringify(ruling), updated_at: ruling.at }, { onConflict: 'key' })
  if (error) return { ok: false, status: 500, error: error.message }
  return { ok: true, ruling }
}

export async function readWebInsights(): Promise<WebInsightsResponse> {
  const now = new Date()
  const nowIso = now.toISOString()
  const since = new Date(now.getTime() - FIXED_WINDOW_DAYS * DAY_MS - DAY_MS).toISOString()
  const [rows, lastRun, canRefreshAt, rulings] = await Promise.all([
    supabase.from('web_property_insights').select('*').gte('run_at', since).order('run_at', { ascending: false }).limit(80),
    // A heartbeat dated in the future is forged or skewed (workflow_runs takes anon writes) and is never "the last run".
    supabase.from('workflow_runs').select('run_at, status, metadata').eq('workflow_id', WORKFLOW_ID)
      .lte('run_at', new Date(now.getTime() + CLOCK_SKEW_MS).toISOString()).order('run_at', { ascending: false }).limit(1),
    refreshAllowedAt(now),
    readCanonRulings(),
  ])
  // Each card is built from the site as the next check will read it.
  const sites = WEB_PROPERTIES.map(p => withCanonRuling(p, rulings[p.prefix]))
  const lr = (lastRun.error ? null : lastRun.data?.[0]) as { run_at: string; status: string | null; metadata: any } | null | undefined
  const trig = lr?.metadata?.trigger
  const base = {
    ok: true as const,
    generated_at: nowIso,
    last_run: lr ? { run_at: lr.run_at, trigger: (trig === 'refresh' || trig === 'run' ? trig : 'cron') as Trigger, status: String(lr.status ?? '') } : null,
    next_run_at: nextRunAt(nowIso),
    can_refresh_at: canRefreshAt,
  }
  if (rows.error) {
    if (tableMissing(rows.error)) {
      return { ...base, setup: 'table_missing', shared_action: null, properties: sites.map(p => toView(p, null, [])) }
    }
    throw new Error(`web_property_insights: ${rows.error.message}`)
  }
  const all = (rows.data ?? []) as WebInsightRow[]
  const windowStart = now.getTime() - FIXED_WINDOW_DAYS * DAY_MS
  const properties = sites.map(p => {
    const mine = all.filter(row => row.property === p.prefix)
    return toView(p, mine[0] ?? null, mine.filter(row => Date.parse(row.run_at) >= windowStart), rulings[p.prefix]?.at ?? null)
  })
  const newest = WEB_PROPERTIES.map(p => all.find(row => row.property === p.prefix) ?? null)
  const shared_action = newest.map(row => row?.action ?? null).find((a): a is KrishAction => !!a && a.prefix === 'shared') ?? null
  return { ...base, shared_action, properties }
}
