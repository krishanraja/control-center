import { supabase } from './_supabase.js'

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
  /** Who used it: 7-day metered calls from api_call_log, attached only for
   *  services that are broken or low so the payload stays lean. null means
   *  either not flagged, or flagged with zero metered calls — the UI reads
   *  calls_7d === 0 vs null identically ("not metered by the Control Center"). */
  usage: { calls_7d: number; est_cost_7d: number; top_sources: string[] } | null
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
  needs_review: number
  meter: { usd_mtd: number; calls_mtd: number } | null
  empty: boolean
  as_of: string
}

interface InvoiceRow {
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
}

interface RegistryRow {
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
  last_status: string | null
  balance: number | null
  balance_unit: string | null
  last_checked_at: string | null
}

const monthKey = (d: Date): string => d.toISOString().slice(0, 7)
const net = (r: Pick<InvoiceRow, 'amount_usd' | 'kind'>): number =>
  r.amount_usd == null ? 0 : (r.kind === 'refund' ? -Number(r.amount_usd) : Number(r.amount_usd))

function nextRenewal(r: Pick<InvoiceRow, 'paid_at' | 'period_end' | 'cadence'>): string | null {
  if (r.period_end) return r.period_end
  if (!r.paid_at) return null
  const d = new Date(r.paid_at)
  if (r.cadence === 'annual') d.setFullYear(d.getFullYear() + 1)
  else if (r.cadence === 'monthly') d.setMonth(d.getMonth() + 1)
  else return null
  return d.toISOString().slice(0, 10)
}

async function meterMtd(monthStartIso: string): Promise<{ usd_mtd: number; calls_mtd: number } | null> {
  try {
    const { count } = await supabase.from('api_call_log')
      .select('id', { count: 'exact', head: true }).gte('ts', monthStartIso)
    // Sum only the cost-bearing rows, paged: most metering rows carry 0.
    let usd = 0
    for (let page = 0; page < 3; page++) {
      const { data, error } = await supabase.from('api_call_log')
        .select('est_cost_usd').gte('ts', monthStartIso).gt('est_cost_usd', 0)
        .range(page * 1000, page * 1000 + 999)
      if (error) return null
      for (const r of data || []) usd += Number((r as { est_cost_usd: number }).est_cost_usd) || 0
      if (!data || data.length < 1000) break
    }
    return { usd_mtd: Math.round(usd * 100) / 100, calls_mtd: count || 0 }
  } catch {
    return null
  }
}

export async function loadSpend(): Promise<SpendSummary> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))

  const [{ data: inv }, { data: reg }, { count: reviewCount }, meter] = await Promise.all([
    supabase.from('spend_invoices')
      .select('service_key, vendor_raw, amount, currency, amount_usd, kind, paid_at, period_end, cadence, plan_label, needs_review')
      .gte('paid_at', windowStart.toISOString().slice(0, 10))
      .order('paid_at', { ascending: false })
      .limit(2000),
    supabase.from('service_registry')
      .select('key, display_name, category, criticality, check_kind, env_key_name, top_up_url, dashboard_url, low_threshold, limit_note, last_status, balance, balance_unit, last_checked_at')
      .eq('active', true),
    supabase.from('spend_invoices').select('id', { count: 'exact', head: true }).eq('needs_review', true),
    meterMtd(monthStart.toISOString()),
  ])

  const invoices = (inv || []) as InvoiceRow[]
  const registry = (reg || []) as RegistryRow[]
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
    if (!r.paid_at) continue
    const i = monthIndex.get(r.paid_at.slice(0, 7))
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
    } else if (r.paid_at && r.paid_at.slice(0, 7) === thisMonth) {
      unmatchedAgg.set(r.vendor_raw, (unmatchedAgg.get(r.vendor_raw) || 0) + net(r))
    }
  }

  const services: SpendServiceRow[] = registry.map(s => {
    const rows = byService.get(s.key) || []
    const mtd = rows.filter(r => r.paid_at?.slice(0, 7) === thisMonth).reduce((a, r) => a + net(r), 0)
    const priorRows = rows.filter(r => r.paid_at && r.paid_at.slice(0, 7) !== thisMonth)
    const priorMonths = new Set(priorRows.map(r => r.paid_at!.slice(0, 7)))
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
      const { data: calls } = await supabase.from('api_call_log')
        .select('api_name, source, est_cost_usd')
        .gte('ts', since)
        .in('api_name', flaggedKeys)
        .limit(5000)
      const agg = new Map<string, { calls: number; cost: number; bySource: Map<string, number> }>()
      for (const c of (calls || []) as Array<{ api_name: string; source: string | null; est_cost_usd: number | null }>) {
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
  const lowRows = checked.filter(s => s.balance_low && !BLOCKING.has(String(s.status)))
  const okRows = checked.filter(s => s.status === 'ok' && !s.balance_low)
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
    needs_review: reviewCount || 0,
    meter,
    empty: invoices.length === 0 && checked.length === 0,
    as_of: nowIso,
  }
}
