import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guard } from '../_auth.js'
import { canonicalVentureSlug } from '../../src/lib/ventureOptions.js'
import { normaliseSeoRows, newestCheck, type SeoRankResponse } from '../../src/lib/growthWire.js'

// /api/growth/seo-rank: where the products rank on Google, from Maya's weekly
// rank check (maya_striking_distance: Serper positions plus DataForSEO volume).
//
//   GET [?product=<slug>]  the newest check per keyword, normalised. `product`
//                          takes any spelling (ctrl or mm_ctrl) and filters on
//                          the registry slug.
//
// Why a route at all: maya_striking_distance has RLS on and no policy, so the
// anon key in the browser reads zero rows (measured 2026-10-04: anon count 0
// against 74 rows). The panel used to read it on the anon client and always
// said there were no results. This reads it on the service role behind the
// same cookie gate as the site-visits read, and never writes.

const SCAN_CAP = 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return
  try {
    const { data, error } = await supabase
      .from('maya_striking_distance')
      .select('id, product, query, current_position, previous_position, search_volume, priority, impressions, clicks, found_at, last_checked_at')
      .order('last_checked_at', { ascending: false, nullsFirst: false })
      .limit(SCAN_CAP)
    if (error) return res.status(500).json({ ok: false, error: error.message })

    const want = typeof req.query.product === 'string' ? canonicalVentureSlug(req.query.product) : null
    const all = normaliseSeoRows(data ?? [], s => canonicalVentureSlug(s))
    const rows = want ? all.filter(r => r.product === want) : all
    const body: SeoRankResponse = { ok: true, checked_at: newestCheck(rows), count: rows.length, rows }
    return res.json(body)
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
