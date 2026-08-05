import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'

// /api/growth/probes: GEO probe results (did an answer engine cite us).
//
//   GET  probes, newest run first, plus the one number that matters: the
//        citation rate, overall and per product. The rate is computed from the
//        rows, never stored, so it cannot drift from the evidence.
//
// Probe rows are written by the GEO probe workflow on the service role key.
// Nothing on this surface is editable by hand, so there is no write path here.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, OPTIONS')) return

  const { data, error } = await supabase
    .from('growth_geo_probes')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(500)
  if (error) return res.status(500).json({ ok: false, error: error.message })

  const rows = data || []
  const byProduct: Record<string, { probes: number; cited: number }> = {}
  for (const r of rows) {
    const k = String((r as { product_slug?: string }).product_slug || 'unknown')
    if (!byProduct[k]) byProduct[k] = { probes: 0, cited: 0 }
    byProduct[k].probes += 1
    if ((r as { we_cited?: boolean }).we_cited) byProduct[k].cited += 1
  }
  const cited = rows.filter(r => (r as { we_cited?: boolean }).we_cited).length

  return res.json({
    ok: true,
    count: rows.length,
    citation_rate: rows.length ? cited / rows.length : null,
    cited,
    by_product: byProduct,
    probes: rows,
  })
}
