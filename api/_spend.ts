import { supabase } from './_supabase.js'
import { readUnits, meterSince, daysAgoKey, type MeterProvider } from './_meter.js'
import { readPaged } from './_paged.js'
import { prepareLedger, effectiveDay, netUsd, reviewItems, splitPersonal, personalSummary, type ReviewItem, type PersonalSummary } from './_spendLedger.js'

// The one computed answer behind GET /api/spend: how much money is going out,
// and which connections need a hand. Mirrors _revenue.ts — the tables are
// service-role only, so this is the browser's only read path. The payload
// carries no env var names and no secrets.

const BLOCKING = new Set(['auth_failed', 'exhausted', 'rate_limited'])

export interface SpendServiceRow {
  key: string
  name: string
  category: string
  criticality: string
  month_usd: number
  avg_usd: number
  cadence: string
  plan_label: string | null
  last_paid_at: string | null
  next_renewal_on: string | null
  status: string | null
  balance: number | null
  balance_unit: string | null
  balance_low: boolean
  last_checked_at: string | null
  top_up_url: string | null
  dashboard_url: string | null
  /** Plan ceiling + known consumers, plain English (service_registry.limit_note). */
  limit_note: string | null
  /** Usage the plan price covers. Non-null means this service reports a plan
   *  cycle, so its money state is told by `cycles` and NOT by `connections.low`
   *  — one fact, one place. */
  included_usd: number | null
  /** Who used it: 7-day metered calls from api_call_log, attached only for
   *  services that are broken or low so the payload stays lean. null means
   *  either not flagged, or flagged with zero metered calls — the UI reads
   *  calls_7d === 0 vs null identically ("not metered by the Control Center"). */
  usage: { calls_7d: number; est_cost_7d: number; top_sources: string[] } | null
}

/** One thing that spent money, from the usage meter. Actors, workflows and
 *  agents share this shape so the console can rank them against each other. */
export interface SpendUnit {
  provider: MeterProvider
  kind: string
  key: string
  label: string
  /** Apify task_category from the curated registry; null = actor nobody chose. */
  category: string | null
  usd: number
  usd_7d: number
  runs: number
  failed: number
  units: number
  /** What `units` counts — 'compute-units' | 'executions' | 'tokens'. */
  unit_name: string | null
  /** Origins, modes or models, biggest first. */
  buckets: Array<{ bucket: string; usd: number; runs: number }>
}

/**
 * A plan's prepaid allowance and where this cycle sits inside it.
 *
 * The state the tracker could not previously see: Apify's plan includes $29 of
 * usage and the overage is invoiced later — or charged early once the extra
 * passes $50. Reporting headroom to the vendor's hard cap instead reported a
 * comfortable green while that line was being crossed.
 */
export type CycleState = 'within' | 'over_prepaid' | 'near_trigger' | 'charging_early' | 'unknown'

export interface SpendCycle {
  key: string
  name: string
  included_usd: number | null
  overage_trigger_usd: number | null
  cycle_usd: number | null
  cycle_start: string | null
  cycle_end: string | null
  state: CycleState
  /** Spend past the included amount. 0 while still inside it. */
  over_usd: number
  /** What is left of the included amount. Negative once past it. */
  headroom_usd: number | null
  top_up_url: string | null
}

export interface SpendSummary {
  month_usd: number
  avg_3mo_usd: number
  delta_pct: number | null
  ballooning: boolean
  months: Array<{ month: string; total_usd: number }>
  services: SpendServiceRow[]
  unmatched: Array<{ vendor: string; month_usd: number }>
  connections: {
    ok: number
    low: number
    broken: number
    critical_broken: number
    unchecked: number
    broken_names: string[]
    low_names: string[]
  }
  renewals_due: Array<{ key: string; name: string; amount: number | null; currency: string | null; on: string }>
  /** How many receipts in the window need a look. */
  needs_review: number
  /** Of those, how many no total includes, because no amount could be read. */
  needs_review_unread: number
  /**
   * Every receipt in the window that needs a look, newest first: the ones the
   * reader could not price (not in any total) and the ones counted with a
   * caveat (no payment date, or the reader was unsure). The copy promises they
   * are listed, so they are.
   */
  review: ReviewItem[]
  /** This month's personal charges (PERSONAL_SPEND), kept out of every figure above and named here. */
  personal: PersonalSummary
  /** This month on the usage meter (meter_daily). */
  meter: { usd_mtd: number; calls_mtd: number } | null
  /** Who spent it, from the usage meter. null when the meter has never run. */
  spenders: {
    since: string
    metered_usd: number
    units: SpendUnit[]
    /** Providers the meter covers but has no rows for in this window — a
     *  collector that has not run reads differently from one that found
     *  nothing, and the console must be able to tell them apart. */
    silent: MeterProvider[]
  } | null
  /** Prepaid allowances and where each cycle sits inside them. */
  cycles: SpendCycle[]
  empty: boolean
  as_of: string
}

interface InvoiceRow {
  gmail_message_id: string
  service_key: string | null
  vendor_raw: string
  amount: number | null
  currency: string | null
  amount_usd: number | null
  kind: string
  paid_at: string | null
  period_end: string | null
  cadence: string
  plan_label: string | null
  needs_review: boolean
  review_note: string | null
  raw_subject: string | null
  raw_from: string | null
  created_at: string | null
}

export interface RegistryRow {
  key: string
  display_name: string
  category: string
  criticality: string
  check_kind: string
  env_key_name: string | null
  top_up_url: string | null
  dashboard_url: string | null
  low_threshold: number | null
  limit_note: string | null
  /** Read only to match receipts at read time; never sent to the browser. */
  vendor_match: string[] | null
  included_usd: number | null
  overage_trigger_usd: number | null
  cycle_usd: number | null
  cycle_start: string | null
  cycle_end: string | null
  last_status: string | null
  balance: number | null
  balance_unit: string | null
  last_checked_at: string | null
}

const monthKey = (d: Date): string => d.toISOString().slice(0, 7)
const net = netUsd
/** The month a row counts in: payment date, else the day it was read. */
const monthOf = (r: InvoiceRow): string | null => effectiveDay(r)?.slice(0, 7) ?? null

function nextRenewal(r: Pick<InvoiceRow, 'paid_at' | 'period_end' | 'cadence'>): string | null {
  if (r.period_end) return r.period_end
  if (!r.paid_at) return null
  const d = new Date(r.paid_at)
  if (r.cadence === 'annual') d.setFullYear(d.getFullYear() + 1)
  else if (r.cadence === 'monthly') d.setMonth(d.getMonth() + 1)
  else return null
  return d.toISOString().slice(0, 10)
}

/**
 * This month on the usage meter, from meter_daily: the same instrument "Where
 * it went" ranks by. It used to read api_call_log, which logs Apify and OpenAI
 * calls at $0, and so reported "$0 across 6,100 calls" for a month the meter
 * had $55 for.
 */
async function meterMtd(monthStartDay: string): Promise<{ usd_mtd: number; calls_mtd: number } | null> {
  try {
    const { usd, calls, error } = await meterSince(monthStartDay)
    if (error) return null
    return { usd_mtd: usd, calls_mtd: calls }
  } catch {
    return null
  }
}

const INVOICE_COLUMNS = 'gmail_message_id, service_key, vendor_raw, amount, currency, amount_usd, kind, paid_at, period_end, cadence, plan_label, needs_review, review_note, raw_subject, raw_from, created_at'

const METERED: MeterProvider[] = ['apify', 'n8n', 'anthropic']

/**
 * Who spent it, over a 30-day window with a 7-day inner window.
 *
 * Capped at the top spenders because the whole point is a ranked answer, not a
 * ledger dump — the console shows what to turn off first, and the raw rows stay
 * in meter_daily for anything that needs them. A provider with no rows at all
 * is reported by name in `silent`: "the collector has not run" and "nothing ran"
 * are different sentences and must not render as the same one.
 */
async function loadSpenders(): Promise<SpendSummary['spenders']> {
  const since = daysAgoKey(29)
  const { units, total_usd, error } = await readUnits({
    sinceDay: since,
    recentSinceDay: daysAgoKey(6),
  })
  if (error) return null
  const seen = new Set(units.map(u => u.provider))
  return {
    since,
    metered_usd: Math.round(total_usd * 100) / 100,
    units: units.slice(0, 12).map(u => ({
      provider: u.provider,
      kind: u.unit_kind,
      key: u.unit_key,
      label: u.label,
      category: u.category,
      usd: Math.round(u.usd * 100) / 100,
      usd_7d: Math.round(u.usd_recent * 100) / 100,
      runs: u.runs,
      failed: u.failed,
      units: u.units,
      unit_name: u.unit_name,
      buckets: u.buckets.slice(0, 4).map(b => ({ ...b, usd: Math.round(b.usd * 100) / 100 })),
    })),
    silent: METERED.filter(p => !seen.has(p)),
  }
}

/** Prepaid state per service that records an included allowance. */
export function cyclesFrom(registry: RegistryRow[]): SpendCycle[] {
  return registry
    .filter(s => s.included_usd != null)
    .map(s => {
      const included = Number(s.included_usd)
      const trigger = s.overage_trigger_usd == null ? null : Number(s.overage_trigger_usd)
      // cycle_usd is the vendor's own cycle total; balance is the sweep's
      // fresher headroom to the same included amount. Prefer the vendor's
      // number, fall back to reconstructing it from the headroom.
      const used = s.cycle_usd != null ? Number(s.cycle_usd)
        : (s.balance != null && s.balance_unit === 'usd') ? included - Number(s.balance)
        : null
      const over = used == null ? 0 : Math.max(0, Math.round((used - included) * 100) / 100)
      const state: CycleState =
        used == null ? 'unknown'
        : over <= 0 ? 'within'
        : trigger != null && over >= trigger ? 'charging_early'
        : trigger != null && over >= trigger * 0.8 ? 'near_trigger'
        : 'over_prepaid'
      return {
        key: s.key,
        name: s.display_name,
        included_usd: included,
        overage_trigger_usd: trigger,
        cycle_usd: used == null ? null : Math.round(used * 100) / 100,
        cycle_start: s.cycle_start,
        cycle_end: s.cycle_end,
        state,
        over_usd: over,
        headroom_usd: used == null ? null : Math.round((included - used) * 100) / 100,
        top_up_url: s.top_up_url,
      }
    })
    // Worst first: the thing already costing extra outranks the thing that is fine.
    .sort((a, b) => b.over_usd - a.over_usd || a.name.localeCompare(b.name))
}

export async function loadSpend(): Promise<SpendSummary> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))

  const windowDay = windowStart.toISOString().slice(0, 10)
  const [{ rows: inv, error: invError }, { data: reg }, meter, spenders] = await Promise.all([
    // A row with no payment date used to fall out of this read entirely
    // (`paid_at >= window` is never true for NULL), which is how $332.55 of
    // parsed September receipts and every unread receipt vanished. They now
    // come in on the day they were read.
    readPaged<InvoiceRow>((from, to) => supabase.from('spend_invoices')
      .select(INVOICE_COLUMNS)
      .or(`paid_at.gte.${windowDay},and(paid_at.is.null,created_at.gte.${windowDay})`)
      .order('created_at', { ascending: false })
      .order('gmail_message_id')
      .range(from, to), { max: 20_000 }),
    supabase.from('service_registry')
      .select('key, display_name, category, criticality, check_kind, env_key_name, top_up_url, dashboard_url, low_threshold, limit_note, vendor_match, included_usd, overage_trigger_usd, cycle_usd, cycle_start, cycle_end, last_status, balance, balance_unit, last_checked_at')
      .eq('active', true),
    meterMtd(monthStart.toISOString().slice(0, 10)),
    loadSpenders(),
  ])

  // A failed ledger read is not a $0 ledger. Throw, so GET /api/spend answers
  // 500 and the tab keeps its last good summary (useSpend) instead of showing
  // every month at nothing.
  if (invError) throw new Error(`spend_invoices read failed: ${invError}`)
  const registry = (reg || []) as RegistryRow[]
  // Match at read time too (Stripe-sent Brave and ElevenLabs receipts were
  // written before the matcher knew them), then one row per real receipt.
  // Newest first by the day each row counts on, which `latest` below relies on.
  // Personal charges (ruling, Krish 2026-10-04) leave the ledger here, before
  // any total, average, service row or review item is built from it.
  const { business, personal } = splitPersonal(prepareLedger(inv, registry))
  const invoices = business
    .sort((a, b) => (effectiveDay(b) || '').localeCompare(effectiveDay(a) || ''))
  const nowIso = new Date().toISOString()
  const thisMonth = monthKey(monthStart)

  // Six calendar months, oldest first, current last.
  const months: Array<{ month: string; total_usd: number }> = []
  for (let i = 5; i >= 0; i--) {
    const m = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)))
    months.push({ month: m, total_usd: 0 })
  }
  const monthIndex = new Map(months.map((m, i) => [m.month, i]))
  for (const r of invoices) {
    const m = monthOf(r)
    const i = m ? monthIndex.get(m) : undefined
    if (i != null) months[i].total_usd += net(r)
  }
  for (const m of months) m.total_usd = Math.round(m.total_usd * 100) / 100

  const month_usd = months[5].total_usd
  const prior = months.slice(2, 5).filter(m => m.total_usd !== 0)
  const avg_3mo_usd = prior.length ? Math.round((prior.reduce((a, m) => a + m.total_usd, 0) / prior.length) * 100) / 100 : 0
  const delta_pct = avg_3mo_usd > 0 ? Math.round(((month_usd - avg_3mo_usd) / avg_3mo_usd) * 100) : null
  const ballooning = prior.length >= 2 && month_usd > avg_3mo_usd * 1.25 && month_usd - avg_3mo_usd > 100

  // Per-service aggregates.
  const byService = new Map<string, InvoiceRow[]>()
  const unmatchedAgg = new Map<string, number>()
  for (const r of invoices) {
    if (r.service_key) {
      const list = byService.get(r.service_key) || []
      list.push(r)
      byService.set(r.service_key, list)
    } else if (monthOf(r) === thisMonth && r.amount_usd != null) {
      unmatchedAgg.set(r.vendor_raw, (unmatchedAgg.get(r.vendor_raw) || 0) + net(r))
    }
  }

  const services: SpendServiceRow[] = registry.map(s => {
    const rows = byService.get(s.key) || []
    const mtd = rows.filter(r => monthOf(r) === thisMonth).reduce((a, r) => a + net(r), 0)
    // Only rows with a known amount make a month: an unread receipt is listed
    // for review, not averaged in as a $0 month.
    const priorRows = rows.filter(r => r.amount_usd != null && monthOf(r) != null && monthOf(r) !== thisMonth)
    const priorMonths = new Set(priorRows.map(r => monthOf(r)!))
    const priorTotal = priorRows.reduce((a, r) => a + net(r), 0)
    const latest = rows.find(r => r.paid_at) || null
    const balance_low = s.balance != null && s.low_threshold != null && Number(s.balance) < Number(s.low_threshold)
    return {
      key: s.key,
      name: s.display_name,
      category: s.category,
      criticality: s.criticality,
      month_usd: Math.round(mtd * 100) / 100,
      avg_usd: priorMonths.size ? Math.round((priorTotal / priorMonths.size) * 100) / 100 : 0,
      cadence: latest?.cadence || 'unknown',
      plan_label: latest?.plan_label ?? null,
      last_paid_at: latest?.paid_at ?? null,
      next_renewal_on: latest ? nextRenewal(latest) : null,
      status: s.last_status,
      balance: s.balance != null ? Number(s.balance) : null,
      balance_unit: s.balance_unit,
      balance_low,
      last_checked_at: s.last_checked_at,
      top_up_url: s.top_up_url,
      dashboard_url: s.dashboard_url,
      limit_note: s.limit_note,
      included_usd: s.included_usd == null ? null : Number(s.included_usd),
      usage: null,
    }
  }).sort((a, b) => b.month_usd - a.month_usd || (b.avg_usd - a.avg_usd))

  // Who used it: for services that need a hand (broken or low), attach the
  // 7-day metered picture from api_call_log grouped by source. Only 8 services
  // have ever been metered, so zero rows is the common, honest answer — the
  // UI renders that as "not metered by the Control Center", never as "unused".
  const flaggedKeys = services
    .filter(s => (s.status && BLOCKING.has(s.status)) || s.balance_low)
    .map(s => s.key)
  if (flaggedKeys.length) {
    try {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
      // Paged: a week of Apify alone is over 3,000 rows (3,185 on 2026-10-04)
      // and PostgREST stops at 1,000 per request, whatever limit() says.
      const { rows: calls } = await readPaged<{ api_name: string; source: string | null; est_cost_usd: number | null }>(
        (from, to) => supabase.from('api_call_log')
          .select('id, api_name, source, est_cost_usd')
          .gte('ts', since)
          .in('api_name', flaggedKeys)
          .order('id', { ascending: false })
          .range(from, to),
        { max: 50_000 },
      )
      const agg = new Map<string, { calls: number; cost: number; bySource: Map<string, number> }>()
      for (const c of calls) {
        const a = agg.get(c.api_name) || { calls: 0, cost: 0, bySource: new Map<string, number>() }
        a.calls++
        a.cost += Number(c.est_cost_usd) || 0
        const src = c.source || 'unknown'
        a.bySource.set(src, (a.bySource.get(src) || 0) + 1)
        agg.set(c.api_name, a)
      }
      for (const s of services) {
        const a = agg.get(s.key)
        if (!a || !flaggedKeys.includes(s.key)) continue
        s.usage = {
          calls_7d: a.calls,
          est_cost_7d: Math.round(a.cost * 100) / 100,
          top_sources: [...a.bySource.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([src]) => src),
        }
      }
    } catch { /* attribution is additive; a failed read never sinks the summary */ }
  }

  const checked = services.filter(s => s.status !== null && s.status !== 'not_checked')
  const brokenRows = checked.filter(s => BLOCKING.has(String(s.status)))
  // A prepaid plan's headroom is money, not credits. Apify past its $29
  // included is not "running low" — it is accruing overage, which `cycles`
  // says precisely and "Apify is low: -14.4 usd left" says wrongly. Services
  // that report a cycle are told there and only there.
  const lowRows = checked.filter(s =>
    s.balance_low && s.included_usd == null && !BLOCKING.has(String(s.status)))
  const okRows = checked.filter(s => s.status === 'ok' && (!s.balance_low || s.included_usd != null))
  const connections = {
    ok: okRows.length,
    low: lowRows.length,
    broken: brokenRows.length,
    critical_broken: brokenRows.filter(s => s.criticality === 'critical').length,
    unchecked: services.length - checked.length,
    broken_names: brokenRows.map(s => s.name),
    low_names: lowRows.map(s => s.name),
  }

  // Annual renewals inside 30 days, newest charge per service/vendor.
  const renewals_due: SpendSummary['renewals_due'] = []
  const seenRenewal = new Set<string>()
  for (const r of invoices) {
    if (r.cadence !== 'annual' || r.kind !== 'charge' || !r.paid_at) continue
    const id = r.service_key || r.vendor_raw
    if (seenRenewal.has(id)) continue
    seenRenewal.add(id)
    const on = nextRenewal(r)
    if (!on) continue
    const days = (Date.parse(on) - Date.now()) / 86_400_000
    if (days < 0 || days > 30) continue
    const svc = r.service_key ? registry.find(s => s.key === r.service_key) : null
    renewals_due.push({ key: id, name: svc?.display_name || r.vendor_raw, amount: r.amount, currency: r.currency, on })
  }
  renewals_due.sort((a, b) => a.on.localeCompare(b.on))

  // The receipts that need a look, by name. Capped so a parser outage that
  // flags hundreds cannot bloat the payload; the count stays exact.
  const nameOf = new Map(registry.map(s => [s.key, s.display_name]))
  const reviewAll = reviewItems(invoices, k => nameOf.get(k) ?? null)

  return {
    month_usd,
    avg_3mo_usd,
    delta_pct,
    ballooning,
    months,
    services,
    unmatched: [...unmatchedAgg.entries()]
      .map(([vendor, usd]) => ({ vendor, month_usd: Math.round(usd * 100) / 100 }))
      .sort((a, b) => b.month_usd - a.month_usd),
    connections,
    renewals_due,
    needs_review: reviewAll.length,
    needs_review_unread: reviewAll.filter(r => !r.counted).length,
    review: reviewAll.slice(0, 200),
    personal: personalSummary(personal.filter(r => monthOf(r) === thisMonth)),
    meter,
    spenders,
    cycles: cyclesFrom(registry),
    empty: invoices.length === 0 && checked.length === 0,
    as_of: nowIso,
  }
}
