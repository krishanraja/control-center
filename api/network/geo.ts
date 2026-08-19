import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// GET /api/network/geo
//   -> { ok, countries: [{ code, name, featured, n }], unknown, total, known }
//
// Which countries the network actually contains, and how many people are in
// each. Two jobs:
//
//   1. Build the geography filter from the data instead of from a hardcoded
//      list, so a chip is never offered for a country nobody is in.
//   2. Report `unknown` — the people with no resolved location at all.
//
// The second one is the important one. Geography is known for roughly 43% of
// the corpus and for only 5% of tier 1, the people who have actually replied.
// A filter UI that showed only the countries it found would quietly imply the
// rest of the network does not exist, and "no results in the UK" would read as
// "you know nobody in Britain" when it means "we never recorded where these
// 6,000 people are". Returning the unknown count is what lets the surface say
// the true thing.

export const config = { maxDuration: 15 }

interface Facet { code: string | null; name: string; featured: boolean; n: number }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return

  try {
    const { data, error } = await supabase.rpc('network_geo_facets')
    if (error) throw new Error(error.message)

    const rows = (data || []) as Facet[]
    // The NULL-code row is the unknown bucket, not a country. Split it out here
    // rather than making every caller remember that.
    const countries = rows
      .filter(r => r.code)
      .map(r => ({ code: String(r.code), name: r.name, featured: Boolean(r.featured), n: Number(r.n) }))
    const unknown = Number(rows.find(r => !r.code)?.n || 0)
    const known = countries.reduce((sum, c) => sum + c.n, 0)

    return res.status(200).json({ ok: true, countries, unknown, known, total: known + unknown })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'geo_facets_failed' })
  }
}
