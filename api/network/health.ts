import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// GET /api/network/health -> { ok, total, invisible, stale_embedding, tiers[], cost }
//
// The readout that answers "is this network in good shape, and what would the
// next dollar buy". It exists because every enrichment decision so far has been
// made by me running ad-hoc SQL and reporting a number, which means Krish could
// not check the state of his own data without asking.
//
// The aggregation is one RPC (public.network_health) so the numbers are read at
// a single instant and cannot disagree with each other.

export const config = { maxDuration: 30 }

// Prices, kept HERE rather than in the database, because they are commercial
// facts that change without a migration.
//
// Apify: measured at ~$0.003 per LinkedIn profile on the pay-as-you-go actor.
// Coresignal: 10 credits per employee_base collect. Search is free; only the
// collect is billed, and only a collect gives us the profile.
const APIFY_USD_PER_PROFILE = 0.003
const CORESIGNAL_CREDITS_PER_PROFILE = 10

interface TierRow {
  tier: string
  people: number
  linkedin: number
  email: number
  invisible: number
  avg_completeness: number
  weak: number
  strong: number
  stale_embedding: number
  apify_due: number
  coresignal_due: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  try {
    const { data, error } = await supabase.rpc('network_health')
    if (error) throw new Error(error.message)

    const h = (data || {}) as { tiers?: TierRow[]; total?: number; invisible?: number; stale_embedding?: number; generated_at?: string }
    const tiers = h.tiers || []

    // Cost is quoted per tier as well as in total. A single grand total is the
    // number that makes people enrich 10,000 cold records: the decision is
    // always "is this tier worth it", never "is the network worth it".
    const priced = tiers.map(t => ({
      ...t,
      apify_usd: Number((t.apify_due * APIFY_USD_PER_PROFILE).toFixed(2)),
      coresignal_credits: t.coresignal_due * CORESIGNAL_CREDITS_PER_PROFILE,
    }))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      generated_at: h.generated_at,
      total: h.total ?? 0,
      invisible: h.invisible ?? 0,
      stale_embedding: h.stale_embedding ?? 0,
      tiers: priced,
      rates: {
        apify_usd_per_profile: APIFY_USD_PER_PROFILE,
        coresignal_credits_per_profile: CORESIGNAL_CREDITS_PER_PROFILE,
      },
    })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : 'health_failed' })
  }
}
