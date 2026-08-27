import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { notifyOps } from '../_alert.js'
import { callClaude, robustJson, VOICE_GUARDRAILS } from '../_content.js'
import { mondayOf } from '../_growth.js'

/**
 * /api/growth/council-run - the weekly growth council.
 *
 *   GET (cron)                        - Vercel cron Sundays 17:00 UTC, or
 *                                       Bearer CRON_SECRET. ?dry_run=1 computes
 *                                       the evidence and the write plan without
 *                                       writing or pinging Telegram.
 *   POST { action:'run', dry_run?, week_start? }
 *                                     - manual run / backfill of one week.
 *
 * One row per product per week in growth_council_reviews, keyed on
 * (week_start, product_slug), so a re-run updates rather than duplicates.
 *
 * HONESTY IS THE POINT. Every number in a review is computed here from real
 * rows: attribution.events (through growth_attribution_weekly and the fleet_*
 * views), the customers table, growth_geo_probes and growth_touchpoints. The
 * evidence bundle carries an explicit `unknowns` list and the writing pass is
 * instructed that an unknown must be stated as unknown. Nothing infers traffic
 * we cannot see: a product with no emitter reads "unknown", never "zero".
 *
 * A review Krish has already ruled on is never rewritten. His decision is the
 * end of that week's conversation.
 *
 * After writing, a summary goes to @krish_approvals_bot, the same approvals
 * channel the content factory uses. Missing Telegram config degrades to a
 * skip, it never fails the run.
 */

const PRODUCTS = ['ctrl', 'circle', 'pulse', 'full-time', 'mindmaker'] as const
type ProductSlug = (typeof PRODUCTS)[number]

// customers.product is an enum with its own historical naming.
const CUSTOMER_PRODUCTS: Record<ProductSlug, string[]> = {
  ctrl: ['mm_ctrl'],
  circle: ['fractionl_circle'],
  pulse: ['fractionl_pulse'],
  'full-time': ['full_time'],
  mindmaker: ['mindmaker', 'makeyourmindup', 'mindmaker_live'],
}

// Products that emit into the attribution warehouse do so under an `app` name.
// Resolved against live data at runtime (candidates below) so a newly wired
// emitter is picked up without a code change, and an unwired one reads honestly
// as unknown rather than as zero.
const APP_CANDIDATES: Record<ProductSlug, string[]> = {
  ctrl: ['ctrl'],
  circle: ['circle'],
  pulse: ['pulse'],
  'full-time': ['full-time', 'fulltime', 'full_time'],
  mindmaker: ['mindmaker'],
}

const GEO_WINDOW_DAYS = 30
const WEEKS_OF_HISTORY = 4
const STALE_AFTER_DAYS = 14

type WeeklyRow = { app: string; week_start: string; event: string; events: number; uniques: number; tagged_events: number; amount_cents: number }
type HealthRow = { app: string; last_event_at: string | null; events_24h: number; events_7d: number; purchases_30d: number }
type FunnelRow = { app: string; utm_source: string; utm_campaign: string; agent: string; landed: number; signed_up: number; activated: number; purchased: number; uniques: number }
type RevenueRow = { app: string; utm_source: string; utm_campaign: string; stripe_account: string | null; purchases: number; gross_cents: number; refunded_cents: number; churns: number }

interface Evidence {
  product_slug: ProductSlug
  week_start: string
  unknowns: string[]
  touchpoints: {
    total: number
    by_status: Record<string, number>
    unaddressed_high_value: Array<{ channel: string; watering_hole: string | null; score: number | null }>
    in_progress: string[]
    // The map is where structural knowledge lives (an auth wall, a fixed
    // llms.txt, a rescore off GEO evidence). Without it the council is amnesiac
    // and rediscovers the same blockers every week.
    known_structure: Array<{
      channel: string
      status: string
      score: number | null
      rationale: string | null
      assumption_flag: string | null
      evidence: Record<string, unknown> | null
    }>
  }
  geo: {
    window_days: number
    probes: number
    cited: number
    citation_rate: number | null
    top_cited_competitor_domains: Array<{ domain: string; times: number }>
    questions_never_cited: string[]
  }
  attribution: {
    status: 'live' | 'stale' | 'no_events_ever' | 'no_emitter_wired'
    app: string | null
    last_event_at: string | null
    days_since_last_event: number | null
    this_week: Record<string, number>
    prior_weeks: Array<{ week_start: string; events: Record<string, number> }>
    lifetime: { landed: number; signed_up: number; activated: number; purchased: number } | null
    untagged_share_lifetime: number | null
  }
  revenue: {
    source: 'customers_table'
    paid_now: number
    mrr_usd: number
    churned_total: number
    last_became_paid_at: string | null
    warehouse_purchases_lifetime: number | null
    warehouse_gross_usd: number | null
  }
}

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function domainOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000)
}

/** Collapse the weekly rows for one app+week into an event -> count map. */
function weekEvents(rows: WeeklyRow[], app: string, week: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (r.app !== app || r.week_start !== week) continue
    out[r.event] = (out[r.event] || 0) + num(r.events)
  }
  return out
}

async function buildEvidence(slug: ProductSlug, weekStart: string, ctx: {
  weekly: WeeklyRow[]; health: HealthRow[]; funnel: FunnelRow[]; revenue: RevenueRow[]
  touchpoints: Array<Record<string, any>>; probes: Array<Record<string, any>>; customers: Array<Record<string, any>>
}): Promise<Evidence> {
  const unknowns: string[] = []
  const nowISO = new Date().toISOString()

  // --- touchpoints (what we are actually working) -------------------------
  const tps = ctx.touchpoints.filter(t => t.product_slug === slug)
  const byStatus: Record<string, number> = {}
  for (const t of tps) byStatus[t.coverage_status] = (byStatus[t.coverage_status] || 0) + 1
  const unaddressed = tps
    .filter(t => t.coverage_status === 'unaddressed')
    .sort((a, b) => num(b.cost_efficiency_score) - num(a.cost_efficiency_score))
    .slice(0, 4)
    .map(t => ({ channel: String(t.channel), watering_hole: t.watering_hole ?? null, score: t.cost_efficiency_score ?? null }))

  // Carry the map's own recorded knowledge forward. rationale, assumption_flag
  // and evidence are where a diagnosed structural blocker (an auth wall, a
  // Cloudflare bot block, a sitemap serving 404s) is written down. Reading them
  // is what stops the council rediscovering the same wall every Sunday.
  const knownStructure = tps
    .filter(t => t.coverage_status !== 'retired' && (t.rationale || t.assumption_flag || (t.evidence && Object.keys(t.evidence).length)))
    .sort((a, b) => num(b.cost_efficiency_score) - num(a.cost_efficiency_score))
    .slice(0, 8)
    .map(t => ({
      channel: String(t.channel),
      status: String(t.coverage_status),
      score: t.cost_efficiency_score ?? null,
      rationale: t.rationale ? String(t.rationale).slice(0, 400) : null,
      assumption_flag: t.assumption_flag ? String(t.assumption_flag).slice(0, 200) : null,
      evidence: t.evidence && Object.keys(t.evidence).length ? (t.evidence as Record<string, unknown>) : null,
    }))

  // --- GEO citation truth --------------------------------------------------
  const geoSince = new Date(Date.now() - GEO_WINDOW_DAYS * 86_400_000).toISOString()
  const productProbes = ctx.probes.filter(p => p.product_slug === slug && String(p.run_at) >= geoSince)
  const citedCount = productProbes.filter(p => p.we_cited).length
  const domainTally: Record<string, number> = {}
  for (const p of productProbes) {
    const list = Array.isArray(p.competitors_cited) ? p.competitors_cited : []
    for (const u of list) {
      const d = typeof u === 'string' ? domainOf(u) : null
      if (d) domainTally[d] = (domainTally[d] || 0) + 1
    }
  }
  const topDomains = Object.entries(domainTally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, times]) => ({ domain, times }))
  if (!productProbes.length) unknowns.push(`GEO citation rate is UNKNOWN for ${slug}: no probe has run in the last ${GEO_WINDOW_DAYS} days.`)

  // --- attribution (top of funnel) ----------------------------------------
  const app = APP_CANDIDATES[slug].find(c => ctx.health.some(h => h.app === c)) ?? null
  let status: Evidence['attribution']['status'] = 'no_emitter_wired'
  let lastEventAt: string | null = null
  let daysSince: number | null = null

  if (app) {
    const h = ctx.health.find(x => x.app === app)
    lastEventAt = h?.last_event_at ?? null
    if (lastEventAt) {
      daysSince = daysBetween(lastEventAt, nowISO)
      status = daysSince > STALE_AFTER_DAYS ? 'stale' : 'live'
    } else {
      status = 'no_events_ever'
    }
  }
  if (status === 'no_emitter_wired') {
    unknowns.push(`Traffic for ${slug} is UNKNOWN: nothing emits into the attribution warehouse under any of ${APP_CANDIDATES[slug].join(', ')}. Do not report zero traffic, report no measurement.`)
  } else if (status === 'stale') {
    unknowns.push(`Traffic for ${slug} since ${lastEventAt} is UNKNOWN: the emitter last fired ${daysSince} days ago, so recent weeks are unmeasured rather than empty.`)
  }

  const priorWeeks: Array<{ week_start: string; events: Record<string, number> }> = []
  let thisWeek: Record<string, number> = {}
  if (app) {
    thisWeek = weekEvents(ctx.weekly, app, weekStart)
    for (let i = 1; i < WEEKS_OF_HISTORY; i++) {
      const w = new Date(Date.parse(weekStart) - i * 7 * 86_400_000).toISOString().slice(0, 10)
      priorWeeks.push({ week_start: w, events: weekEvents(ctx.weekly, app, w) })
    }
  }

  const fRows = app ? ctx.funnel.filter(r => r.app === app) : []
  const lifetime = app
    ? {
        landed: fRows.reduce((s, r) => s + num(r.landed), 0),
        signed_up: fRows.reduce((s, r) => s + num(r.signed_up), 0),
        activated: fRows.reduce((s, r) => s + num(r.activated), 0),
        purchased: fRows.reduce((s, r) => s + num(r.purchased), 0),
      }
    : null

  let untaggedShare: number | null = null
  if (app) {
    const appWeekly = ctx.weekly.filter(r => r.app === app)
    const total = appWeekly.reduce((s, r) => s + num(r.events), 0)
    const tagged = appWeekly.reduce((s, r) => s + num(r.tagged_events), 0)
    untaggedShare = total ? Math.round(((total - tagged) / total) * 1000) / 1000 : null
  }

  // --- revenue truth (customers table) ------------------------------------
  const custProducts = CUSTOMER_PRODUCTS[slug]
  const cust = ctx.customers.filter(c => custProducts.includes(String(c.product)))
  const paidLive = cust.filter(c => c.kind === 'paid' && !c.churned_at)
  const churned = cust.filter(c => !!c.churned_at)
  const lastPaid = cust
    .map(c => c.became_paid_at)
    .filter(Boolean)
    .sort()
    .pop() ?? null

  const rRows = app ? ctx.revenue.filter(r => r.app === app) : []

  return {
    product_slug: slug,
    week_start: weekStart,
    unknowns,
    touchpoints: {
      total: tps.length,
      by_status: byStatus,
      unaddressed_high_value: unaddressed,
      in_progress: tps.filter(t => t.coverage_status === 'in_progress').map(t => String(t.channel)),
      known_structure: knownStructure,
    },
    geo: {
      window_days: GEO_WINDOW_DAYS,
      probes: productProbes.length,
      cited: citedCount,
      citation_rate: productProbes.length ? citedCount / productProbes.length : null,
      top_cited_competitor_domains: topDomains,
      questions_never_cited: productProbes.filter(p => !p.we_cited).map(p => String(p.question)).slice(0, 6),
    },
    attribution: {
      status,
      app,
      last_event_at: lastEventAt,
      days_since_last_event: daysSince,
      this_week: thisWeek,
      prior_weeks: priorWeeks,
      lifetime,
      untagged_share_lifetime: untaggedShare,
    },
    revenue: {
      source: 'customers_table',
      paid_now: paidLive.length,
      mrr_usd: Math.round(paidLive.reduce((s, c) => s + num(c.mrr_usd), 0) * 100) / 100,
      churned_total: churned.length,
      last_became_paid_at: lastPaid ? String(lastPaid) : null,
      warehouse_purchases_lifetime: app ? rRows.reduce((s, r) => s + num(r.purchases), 0) : null,
      warehouse_gross_usd: app ? Math.round(rRows.reduce((s, r) => s + num(r.gross_cents), 0)) / 100 : null,
    },
  }
}

/** The deterministic one-line receipt that ships inside every review. */
function measuredLine(e: Evidence): string {
  const a = e.attribution
  const traffic =
    a.status === 'no_emitter_wired' ? 'traffic unknown (no emitter)'
      : a.status === 'no_events_ever' ? 'traffic unknown (emitter wired, zero events ever)'
        : `landed ${num(a.this_week.landed)} this week (${a.status}${a.days_since_last_event != null ? `, last event ${a.days_since_last_event}d ago` : ''})`
  const geo = e.geo.probes
    ? `GEO ${e.geo.cited}/${e.geo.probes} cited`
    : `GEO unknown (0 probes in ${e.geo.window_days}d)`
  return [
    traffic,
    `signups ${a.status === 'no_emitter_wired' ? 'unknown' : num(a.this_week.signed_up)} this week`,
    geo,
    `customers table: paid ${e.revenue.paid_now}, MRR $${e.revenue.mrr_usd}, churned ${e.revenue.churned_total}`,
    `touchpoints ${e.touchpoints.total} (${Object.entries(e.touchpoints.by_status).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`,
  ].join(' | ')
}

/** Deterministic review, used when the writing pass is unavailable. Numbers only, no prose invented.
 *
 *  `degraded` is stored on the row, not just reported in the run outcome. The
 *  outcome is transient and the row is what CouncilFeed renders, so an
 *  Anthropic outage used to reach the screen looking exactly like a real
 *  review that had concluded there was nothing to kill and nothing to double
 *  down on. Those are opposite facts and they rendered identically. */
function fallbackReview(e: Evidence) {
  const findings: Record<string, string> = {
    headline: `Evidence-only review: ${measuredLine(e)}`,
    degraded: 'evidence-only — the writing pass was unavailable, so no kill or double-down calls were made',
    measured: measuredLine(e),
  }
  for (const u of e.unknowns) findings[`unknown_${Object.keys(findings).length}`] = u
  return { findings, kill_list: [] as string[], double_down: [] as string[] }
}

/**
 * Krish's hard rule is no em dashes, and a model that is told that will reach
 * for the ASCII stand-ins instead. So the sweep kills the real characters AND
 * the substitutes: "--", and a hyphen used as a spaced dash. Word-internal
 * hyphens (AI-native, full-time) are left alone.
 */
const CLEAN = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[—―–]/g, ',')
    .replace(/\s*-{2,}\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s*,(\s*,)+/g, ',')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

async function writeReview(e: Evidence): Promise<{ findings: Record<string, string>; kill_list: string[]; double_down: string[] }> {
  const system = [
    "You are the growth council in Krish Raja's Mindmaker OS. You write one blunt, quantitative weekly review per product. Krish reads it and rules on it.",
    'ABSOLUTE RULE: every number you write must appear in the evidence JSON you are given. You may not estimate, extrapolate, round for effect, or infer traffic that is not measured.',
    'ABSOLUTE RULE: the evidence carries an `unknowns` array. Each entry there MUST be reflected in your findings, stated as unknown. Never convert an unknown into a zero. "No emitter wired" is not "no traffic".',
    'Tone: blunt, specific, structural. Name the constraint, not the mood. No hedging, no encouragement, no summary of the summary.',
    'touchpoints.known_structure carries what the map already knows about each channel: the diagnosed blocker, the flagged assumption, what shipped and when. Use it. If a structural blocker is recorded there, name it, because a metric that cannot move until that blocker clears is not a performance problem.',
    VOICE_GUARDRAILS,
    'Respond with ONLY a JSON object:',
    '{"headline": string (<=160 chars, the one sentence that matters this week),',
    ' "findings": { "<short_snake_case_key>": string (<=320 chars) } (3 to 6 entries, each a distinct evidence-backed observation; keys like geo, traffic, signups, revenue, attribution_quality, structural_blocker),',
    ' "kill_list": string[] (0 to 3, things to stop; empty array is a valid and common answer),',
    ' "double_down": string[] (0 to 4, the specific next moves the evidence supports)}',
    'No prose outside the JSON. No em dashes anywhere in any string, and no ASCII stand-ins for one either: never write "--" or a spaced hyphen as a dash. Use a comma, a period, or parentheses.',
  ].join('\n\n')

  const user = [
    `Product: ${e.product_slug}. Week starting ${e.week_start} (Monday).`,
    'Evidence (this is the entire factual basis you have; anything not here is unknown):',
    JSON.stringify(e, null, 1),
    'Write the review.',
  ].join('\n\n')

  // Thinking on, with a budget that covers it.
  //
  // This is the one call in the repo whose whole output is a decision — a
  // kill list and a double-down list that Krish acts on — so the reasoning is
  // the product, not overhead. It runs on a cron with nobody waiting.
  //
  // The budget is raised because adaptive thinking spends max_tokens BEFORE
  // writing: at 1600 with thinking on, the reasoning would consume the ceiling
  // and the review would come back empty, which is exactly how the Friday
  // retro failed the moment it moved to Sonnet 5.
  const raw = await callClaude({ agent: 'growth-council', system, user, maxTokens: 6000, temperature: 0.4, think: true })
  const parsed: any = robustJson(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('council writing returned non-object')

  const findings: Record<string, string> = {}
  const headline = CLEAN(parsed.headline, 240)
  if (headline) findings.headline = headline
  const src = parsed.findings && typeof parsed.findings === 'object' && !Array.isArray(parsed.findings) ? parsed.findings : {}
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    const key = CLEAN(k, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    const val = CLEAN(v, 400)
    if (key && val && key !== 'headline' && key !== 'measured') findings[key] = val
  }
  if (Object.keys(findings).length < 2) throw new Error('council writing produced too few findings')

  // The receipt goes on last, so the surface always carries the raw computed
  // numbers next to the prose that was written from them.
  findings.measured = measuredLine(e)

  const list = (v: unknown, cap: number) =>
    (Array.isArray(v) ? v : []).map(x => CLEAN(x, 320)).filter(Boolean).slice(0, cap)

  return { findings, kill_list: list(parsed.kill_list, 3), double_down: list(parsed.double_down, 4) }
}

async function auditLog(display_message: string, details: unknown) {
  const { error } = await supabase.from('audit_log').insert({
    event_type: 'growth_council',
    actor: 'growth-council-cron',
    target: 'growth_council_reviews',
    display_message,
    details: JSON.stringify(details),
  })
  if (error) console.warn('[growth/council-run] audit_log failed:', error.message)
}

async function runCouncil(dryRun: boolean, weekStartOverride?: string) {
  const weekStart = weekStartOverride && /^\d{4}-\d{2}-\d{2}$/.test(weekStartOverride)
    ? mondayOf(new Date(`${weekStartOverride}T00:00:00Z`))
    : mondayOf(new Date())

  const geoSince = new Date(Date.now() - GEO_WINDOW_DAYS * 86_400_000).toISOString()
  const weeklySince = new Date(Date.parse(weekStart) - WEEKS_OF_HISTORY * 7 * 86_400_000).toISOString().slice(0, 10)

  const [weekly, health, funnel, revenue, touchpoints, probes, customers, existing] = await Promise.all([
    supabase.from('growth_attribution_weekly').select('*').gte('week_start', weeklySince),
    supabase.from('attribution_app_health').select('*'),
    supabase.from('fleet_funnel_by_campaign').select('*'),
    supabase.from('fleet_revenue_by_campaign').select('*'),
    supabase.from('growth_touchpoints').select('*'),
    supabase.from('growth_geo_probes').select('*').gte('run_at', geoSince).limit(500),
    supabase.from('customers').select('product, kind, mrr_usd, churned_at, became_paid_at, attribution_channel').limit(5000),
    supabase.from('growth_council_reviews').select('id, product_slug, krish_decision').eq('week_start', weekStart),
  ])
  for (const r of [weekly, health, funnel, revenue, touchpoints, probes, customers, existing]) {
    if (r.error) throw new Error(r.error.message)
  }

  const ctx = {
    weekly: (weekly.data || []) as WeeklyRow[],
    health: (health.data || []) as HealthRow[],
    funnel: (funnel.data || []) as FunnelRow[],
    revenue: (revenue.data || []) as RevenueRow[],
    touchpoints: (touchpoints.data || []) as Array<Record<string, any>>,
    probes: (probes.data || []) as Array<Record<string, any>>,
    customers: (customers.data || []) as Array<Record<string, any>>,
  }
  const decided = new Set(
    (existing.data || []).filter((r: any) => r.krish_decision).map((r: any) => String(r.product_slug)),
  )

  const outcomes: Array<Record<string, unknown>> = []
  const rows: Record<string, unknown>[] = []

  for (const slug of PRODUCTS) {
    const active = ctx.touchpoints.filter(t => t.product_slug === slug && t.coverage_status !== 'retired')
    if (!active.length) { outcomes.push({ product_slug: slug, outcome: 'no_active_touchpoints' }); continue }
    if (decided.has(slug)) { outcomes.push({ product_slug: slug, outcome: 'skipped_already_decided' }); continue }

    const evidence = await buildEvidence(slug, weekStart, ctx)
    let review: { findings: Record<string, string>; kill_list: string[]; double_down: string[] }
    let writer = 'claude'
    try {
      review = await writeReview(evidence)
    } catch (e: any) {
      review = fallbackReview(evidence)
      writer = `fallback (${String(e?.message || e)})`
    }

    rows.push({
      week_start: weekStart,
      product_slug: slug,
      findings: review.findings,
      kill_list: review.kill_list,
      double_down: review.double_down,
    })
    outcomes.push({
      product_slug: slug,
      outcome: dryRun ? 'would_write' : 'written',
      writer,
      unknowns: evidence.unknowns.length,
      measured: measuredLine(evidence),
      headline: review.findings.headline || null,
    })
  }

  if (dryRun) return { dry_run: true, week_start: weekStart, outcomes, telegram: { sent: false, error: 'dry run' } }

  let written = 0
  if (rows.length) {
    const { error, data } = await supabase
      .from('growth_council_reviews')
      .upsert(rows, { onConflict: 'week_start,product_slug' })
      .select('id')
    if (error) throw new Error(`upsert: ${error.message}`)
    written = (data || []).length
  }

  const lines = outcomes
    .filter(o => o.outcome === 'written')
    .map(o => `- ${o.product_slug}: ${o.headline || o.measured}`)
  const summary = [
    `Growth council, week of ${weekStart}. ${written} review${written === 1 ? '' : 's'} written.`,
    ...lines,
    '',
    'Rule on them: https://controlcenter.krishraja.com (Growth tab, Council feed)',
  ].join('\n')
  const telegram = await notifyOps(summary)

  await auditLog(`Growth council: ${written} reviews written for week of ${weekStart}.`, { week_start: weekStart, outcomes, telegram })

  return { dry_run: false, week_start: weekStart, written, outcomes, telegram }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  try {
    if (req.method === 'GET') {
      const result = await runCouncil(req.query.dry_run === '1', typeof req.query.week_start === 'string' ? req.query.week_start : undefined)
      return res.json({ ok: true, ...result })
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })

    const body = (req.body || {}) as { action?: string; dry_run?: boolean; week_start?: string }
    // Manual POST must prove the same credential the cron path proves. These
    // routes spend real money (Perplexity, Anthropic), and `/api/*` is
    // deliberately ungated by middleware, so an unauthenticated POST was a
    // free way for anyone who guessed the URL to burn credits on demand.
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    if (body.action !== 'run') return res.status(400).json({ ok: false, error: "action must be 'run'" })
    const result = await runCouncil(!!body.dry_run, body.week_start)
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

export const config = { maxDuration: 300 }
