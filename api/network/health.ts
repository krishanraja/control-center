import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { loadPrices, quote, type MeterRow } from '../_apifyCost.js'

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

// Apify prices are OBSERVED, never assumed.
//
// This route used to hardcode $0.003 per profile and call it measured. The
// meter said $0.0090, so every dollar figure the panel showed was understated
// threefold — and the posts actor at $0.0158 was not priced at all. A panel
// whose whole job is to say what the next run costs was the last place that
// should have been guessing, so it now reads meter_daily through the same
// price book the backfill runner uses.
//
// Coresignal stays a constant because it is billed in CREDITS, not dollars, and
// ten per employee_base collect is the published rate rather than an estimate.
// Search is free; only the collect is billed, and only a collect gives a profile.
const CORESIGNAL_CREDITS_PER_PROFILE = 10

const PROFILE_ACTOR = 'dev_fusion/linkedin-profile-scraper'
const POSTS_ACTOR = 'harvestapi/linkedin-profile-posts'

async function meterRows(sinceDay: string): Promise<MeterRow[]> {
  const { data, error } = await supabase
    .from('meter_daily')
    .select('unit_label, usd, runs, day')
    .eq('provider', 'apify')
    .gte('day', sinceDay)
  if (error) throw new Error(error.message)
  return (data || []) as MeterRow[]
}

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
  /** How many have had their posts read, and how many of those are still
   *  saying something. Both, because "nobody is signalling" and "nobody has
   *  been read" look identical on one number and mean opposite things. */
  posts_read: number
  signalling: number
  hot_intent: number
  apify_due: number
  coresignal_due: number
  posts_due: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET, explicitly. guard defaults to POST, and the panel fetches this with a
  // plain GET, so in production every open of Network Health returned 405
  // method_not_allowed and the panel showed its error state. Nothing caught it:
  // the e2e suite mocks this route, so the mock answered where the real one
  // never would. A read-only aggregate is a GET.
  if (guard(req, res, ['GET', 'POST'])) return

  try {
    const { data, error } = await supabase.rpc('network_health')
    if (error) throw new Error(error.message)

    const h = (data || {}) as {
      tiers?: TierRow[]; total?: number; invisible?: number; stale_embedding?: number
      posts_read?: number; signalling?: number; generated_at?: string
    }
    const tiers = h.tiers || []

    const prices = await loadPrices(meterRows)
    const profile = prices.get(PROFILE_ACTOR)
    const posts = prices.get(POSTS_ACTOR)

    // Cost is quoted per tier as well as in total. A single grand total is the
    // number that makes people enrich 10,000 cold records: the decision is
    // always "is this tier worth it", never "is the network worth it".
    //
    // A cost is null, never 0, when the actor has no observed price. Zero reads
    // as free and free is the one thing it is not.
    const priced = tiers.map(t => {
      const q = quote(prices, t.apify_due, [PROFILE_ACTOR])
      const pq = quote(prices, t.posts_due, [POSTS_ACTOR])
      return {
        ...t,
        apify_usd: profile ? Number(q.usdTotal.toFixed(2)) : null,
        posts_usd: posts ? Number(pq.usdTotal.toFixed(2)) : null,
        coresignal_credits: t.coresignal_due * CORESIGNAL_CREDITS_PER_PROFILE,
      }
    })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      generated_at: h.generated_at,
      total: h.total ?? 0,
      invisible: h.invisible ?? 0,
      stale_embedding: h.stale_embedding ?? 0,
      posts_read: h.posts_read ?? 0,
      signalling: h.signalling ?? 0,
      tiers: priced,
      // The rates are reported with their provenance, so a number on the panel
      // can always be traced to the runs it was averaged from.
      rates: {
        apify_usd_per_profile: profile?.usdPerRun ?? null,
        apify_usd_per_posts_read: posts?.usdPerRun ?? null,
        priced_from_runs: (profile?.runs ?? 0) + (posts?.runs ?? 0),
        priced_to: profile?.lastDay ?? posts?.lastDay ?? null,
        coresignal_credits_per_profile: CORESIGNAL_CREDITS_PER_PROFILE,
      },
    })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : 'health_failed' })
  }
}
