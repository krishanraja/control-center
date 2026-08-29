import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

/**
 * GET /api/fleet-funnel
 *
 * Fleet attribution read surface for the six builder apps (Circle, Pulse, CTRL,
 * Gutted, Merciless, OnAlert). Reads the OS warehouse views (service-role only)
 * and returns acquisition + revenue + emit-health rolled up per app, plus the
 * top campaigns by attributed purchases. Powers the Fleet Funnel panel on the
 * Intel tab. See docs/MINDMAKE_OS_ARCHITECTURE.md section 11.4.
 */

// The app list comes from venture_registry, not a literal. The literal here
// still named gutted, merciless and onalert, all retired from the control plane
// 2026-07-06, so the panel kept a column for three dead products.
//
// `app_key` is the binding: venture_registry.slug uses lane slugs (mm_ctrl,
// fractionl_pulse) while attribution.events.app uses short keys (ctrl, pulse),
// and nothing joined them. Falls back to the live three if the column is not
// populated yet, so this degrades to a correct subset rather than to nothing.
const FALLBACK_APPS = ['circle', 'pulse', 'ctrl']

async function activeApps(): Promise<string[]> {
  const { data } = await supabase
    .from('venture_registry')
    .select('app_key')
    .eq('active', true)
    .not('app_key', 'is', null)
  const keys = (data || [])
    .map(r => String((r as { app_key?: unknown }).app_key || '').trim())
    .filter(Boolean)
  return keys.length ? [...new Set(keys)] : FALLBACK_APPS
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const [APPS, funnel, revenue, health] = await Promise.all([
      activeApps(),
      supabase.from('fleet_funnel_by_campaign').select('*'),
      supabase.from('fleet_revenue_by_campaign').select('*'),
      supabase.from('attribution_app_health').select('*'),
    ])
    if (funnel.error) throw funnel.error
    if (revenue.error) throw revenue.error
    if (health.error) throw health.error

    const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)

    const byApp = APPS.map((app) => {
      const f = (funnel.data || []).filter((r: any) => r.app === app)
      const rev = (revenue.data || []).filter((r: any) => r.app === app)
      const h = (health.data || []).find((r: any) => r.app === app) || {}
      return {
        app,
        landed: sum(f, 'landed'),
        signed_up: sum(f, 'signed_up'),
        activated: sum(f, 'activated'),
        purchased: sum(f, 'purchased'),
        gross_cents: sum(rev, 'gross_cents'),
        refunded_cents: sum(rev, 'refunded_cents'),
        churns: sum(rev, 'churns'),
        last_event_at: h.last_event_at ?? null,
        events_24h: Number(h.events_24h) || 0,
        events_7d: Number(h.events_7d) || 0,
        // 7-day funnel window (warehouse migration 0003) for the BI console's
        // funnel tile; the campaign funnel view stays all-time.
        landed_7d: Number(h.landed_7d) || 0,
        purchased_7d: Number(h.purchased_7d) || 0,
      }
    })

    const campaigns = (funnel.data || [])
      .map((r: any) => ({
        app: r.app,
        utm_source: r.utm_source,
        utm_campaign: r.utm_campaign,
        agent: r.agent,
        landed: Number(r.landed) || 0,
        purchased: Number(r.purchased) || 0,
      }))
      .sort((a: any, b: any) => b.purchased - a.purchased || b.landed - a.landed)
      .slice(0, 20)

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ ok: true, generated_at: new Date().toISOString(), byApp, campaigns })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'fleet-funnel failed' })
  }
}
