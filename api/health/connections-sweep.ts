import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { notifyOps, logApiCall, recordUsageState } from '../_alert.js'
import { PROVIDERS, resolveKey, runCheck, pool } from '../_connections.js'
import { isBlocking, type ProviderOutcome, type ProviderStatus } from '../_quota.js'

// External observer for every keyed service the OS depends on.
//
// The fleet-reconcile pattern, pointed at vendors instead of n8n: each active
// service_registry row with a check gets the cheapest request that proves its
// key can still be served (plus a balance read where the vendor exposes one).
// Results land on service_registry itself; blocking states are mirrored onto
// api_usage_state so the hourly VPS alerter keeps its one place to look; and
// CRITICAL services are mirrored into system_health, where the existing
// audit_critical_infra() -> tier-4 silent_failures -> CriticalAlertBanner
// chain (and the Systems tab) already listens. Non-critical breakage stays on
// the Intel surface — the banner is for things that stop the OS.
//
//   GET (CRON_SECRET) — every 6h   ·   POST — manual ("Check now" in the app)

interface RegistryRow {
  key: string
  display_name: string
  criticality: 'critical' | 'standard' | 'low'
  env_key_name: string | null
  check_kind: 'balance' | 'ping' | 'none'
  top_up_url: string | null
  dashboard_url: string | null
  low_threshold: number | null
  active: boolean
  last_status: ProviderStatus | 'not_checked' | null
  /** Usage the plan price already covers; balance is headroom to THIS, not to
   *  the vendor's hard cap, wherever it is set. */
  included_usd: number | null
}

const BLOCKING = new Set<string>(['auth_failed', 'exhausted', 'rate_limited'])

function asOutcome(api: string, status: ProviderStatus, httpStatus: number | null, detail: string | null): ProviderOutcome {
  return { api, status, httpStatus: httpStatus ?? undefined, detail: detail ?? undefined }
}

async function sweep() {
  const { data, error } = await supabase
    .from('service_registry')
    .select('key, display_name, criticality, env_key_name, check_kind, top_up_url, dashboard_url, low_threshold, active, last_status, included_usd')
    .eq('active', true)
  if (error) throw new Error(`service_registry read failed: ${error.message}`)
  const rows = (data || []) as RegistryRow[]
  const checkable = rows.filter(r => r.check_kind !== 'none')

  const nowIso = new Date().toISOString()
  const results = await pool(checkable, 6, async (row) => {
    const apiKey = await resolveKey(row.env_key_name)
    if (!apiKey) {
      return { row, status: 'skipped_no_key' as ProviderStatus, httpStatus: null, detail: null, balance: null, balanceUnit: null }
    }
    if (!PROVIDERS[row.key]) {
      return { row, status: 'error' as ProviderStatus, httpStatus: null, detail: 'no check implemented for this service', balance: null, balanceUnit: null }
    }
    const r = await runCheck(row.key, apiKey, row.check_kind as 'balance' | 'ping', { includedUsd: row.included_usd })
    const est = PROVIDERS[row.key].estCostUsd
    if (est && r.httpStatus && r.httpStatus < 500) {
      await logApiCall({ api: row.key, endpoint: 'connections-sweep', estCostUsd: est, source: 'connections-sweep' })
    }
    return { row, ...r }
  })

  const transitionsBroke: string[] = []
  const transitionsHealed: string[] = []

  for (const r of results) {
    // 1. The sweep's own truth: state columns on the registry row.
    await supabase.from('service_registry').update({
      last_status: r.status,
      last_http_status: r.httpStatus,
      last_error: r.detail,
      last_checked_at: nowIso,
      balance: r.balance,
      balance_unit: r.balanceUnit,
      updated_at: nowIso,
    }).eq('key', r.row.key)

    // 2. Mirror onto the ledger the VPS alerter reads (update-only).
    if (r.status !== 'skipped_no_key') {
      await recordUsageState(r.row.key, {
        status: r.status,
        error: r.detail,
        balanceUsd: r.balanceUnit === 'usd' ? r.balance : null,
      })
    }

    // 3. Critical services ride the existing banner chain via system_health.
    if (r.row.criticality === 'critical') {
      const prev = r.row.last_status
      const brokeNow = BLOCKING.has(r.status)
        // A one-off network error is not an outage; two consecutive are.
        || (r.status === 'error' && prev === 'error')
      const lowNow = r.balance != null && r.row.low_threshold != null && r.balance < r.row.low_threshold
      const status = brokeNow ? 'failing' : (lowNow || r.status === 'skipped_no_key' || r.status === 'error') ? 'degraded' : 'healthy'
      const message = brokeNow
        ? `${r.row.display_name}: ${r.status}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ''}${r.detail ? ` — ${r.detail.slice(0, 160)}` : ''}`
        : lowNow
          ? `${r.row.display_name}: low balance (${r.balance} ${r.balanceUnit || ''} left)`
          : r.status === 'skipped_no_key'
            ? `${r.row.display_name}: no key configured`
            : `${r.row.display_name}: key serving normally`
      await supabase.from('system_health').upsert({
        id: `sys-api-${r.row.key}`,
        component: `api-${r.row.key}`,
        status,
        message,
        last_check: nowIso,
        details: {
          category: 'connections',
          name: r.row.display_name,
          credits: r.balance,
          unit: r.balanceUnit,
          url: r.row.top_up_url || r.row.dashboard_url,
        },
      }, { onConflict: 'component' })

      const wasBlocking = prev !== null && BLOCKING.has(prev)
      if (brokeNow && !wasBlocking && r.status !== 'error') {
        transitionsBroke.push(`${r.row.display_name}: ${r.status}${r.detail ? ` — ${r.detail.slice(0, 120)}` : ''}${r.row.top_up_url ? `\n   Fix: ${r.row.top_up_url}` : ''}`)
      } else if (!brokeNow && wasBlocking && r.status === 'ok') {
        transitionsHealed.push(r.row.display_name)
      }
    }
  }

  // One message per run, transitions only, so a re-run never re-alerts.
  if (transitionsBroke.length || transitionsHealed.length) {
    const lines: string[] = []
    if (transitionsBroke.length) lines.push('🔌 API connection broken', '', ...transitionsBroke)
    if (transitionsHealed.length) lines.push(transitionsBroke.length ? '' : '', `✅ Recovered: ${transitionsHealed.join(', ')}`)
    await notifyOps(lines.join('\n').trim())
  }

  const counts = results.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m }, {})
  const broken = results.filter(r => isBlocking(asOutcome(r.row.key, r.status, r.httpStatus, r.detail)))
  const low = results.filter(r => r.balance != null && r.row.low_threshold != null && r.balance < r.row.low_threshold)

  await supabase.from('audit_log').insert({
    event_type: 'connections_swept',
    actor: 'connections-sweep',
    target: 'service_registry',
    display_message: `Swept ${results.length} connections — ${broken.length} broken, ${low.length} low`,
    details: JSON.stringify({
      checked: results.length,
      unchecked: rows.length - checkable.length,
      by_status: counts,
      broken: broken.map(r => ({ key: r.row.key, status: r.status, http: r.httpStatus })),
      low: low.map(r => ({ key: r.row.key, balance: r.balance, unit: r.balanceUnit, threshold: r.row.low_threshold })),
      alerted: transitionsBroke.length,
      recovered: transitionsHealed.length,
    }),
  }).then(() => undefined, () => undefined)

  return {
    checked: results.length,
    unchecked: rows.length - checkable.length,
    by_status: counts,
    broken: broken.map(r => ({ key: r.row.key, status: r.status, http: r.httpStatus, detail: r.detail })),
    low: low.map(r => ({ key: r.row.key, balance: r.balance, unit: r.balanceUnit })),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Say so loudly rather than reporting green connections nobody checked.
    return res.status(503).json({ ok: false, error: 'Supabase service credentials not configured; connections are UNKNOWN, not healthy' })
  }

  try {
    const result = await sweep()
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
