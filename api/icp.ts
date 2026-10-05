import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { preamble } from './_content.js'
import { guard } from './_auth.js'
import { PORTFOLIO, UNRANKED_GROWTH, TIER_LABEL } from '../src/lib/portfolio.js'
import { ICP_CONSUMERS, ICP_FIELDS, ICP_LIST_FIELDS, blankIcp, ventureKey, type ProductIcp } from '../src/lib/icp.js'

/**
 * /api/icp: the one ICP definition surface.
 *
 *   GET    every product on the ladder with its ICP, defined or not, plus what
 *          each undefined one is blocking. Never a partial list: a product with
 *          no row comes back as a blank, undefined ICP, so the UI cannot show
 *          an empty table and imply there is nothing to fill in.
 *   PATCH  { venture, patch: { ...fields } }: one product ICP, upserted.
 *
 * `product_icp` is service-role only (buyer titles are internal commercial
 * material and the anon key reaches the browser), so every read and write of
 * it goes through here. `defined` is generated in Postgres and is never
 * accepted from the client: this route reads it back after every write, so the
 * answer the UI shows is the database's, not this route's.
 *
 * The product list is src/lib/portfolio.ts, the one ranking. Circle and
 * Mindmake come from UNRANKED_GROWTH, so a dormant product keeps its ICP
 * instead of losing it the day it was unranked.
 */

interface Row { venture: string; label: string; tier: number | null; tierLabel: string | null; what: string | null; icp: ProductIcp }

/** Every product that can have an ICP, ranked first. Mirrors portfolio.ts exactly. */
function ladder(): Array<{ venture: string; label: string; tier: number | null; what: string | null }> {
  return [
    ...PORTFOLIO.map(p => ({ venture: p.venture, label: p.label, tier: p.tier as number, what: p.what })),
    ...UNRANKED_GROWTH.map(p => ({
      venture: p.venture,
      label: p.venture === 'mindmake' ? 'Mindmake' : p.venture === 'fractionl_circle' ? 'Circle' : p.venture,
      tier: null,
      what: p.venture === 'mindmake'
        ? 'The practice, and the Substack publication beside it.'
        : 'Thesis validation for fractional executives. Dormant, kept so its history survives.',
    })),
  ]
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

/** A list field: trimmed, de-duplicated, order kept, empties dropped. */
function list(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const x of v) {
    const t = clean(x)
    if (t && !out.some(y => y.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && guard(req, res, ['PATCH'])) return
  if (preamble(req, res, 'GET, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('product_icp').select('*')
    if (error) return res.status(500).json({ ok: false, error: error.message })
    const byVenture = new Map<string, ProductIcp>()
    for (const r of (data || []) as ProductIcp[]) byVenture.set(r.venture, r)

    const products: Row[] = ladder().map(p => ({
      venture: p.venture,
      label: p.label,
      tier: p.tier,
      tierLabel: p.tier ? TIER_LABEL[p.tier as 1 | 2 | 3] : null,
      what: p.what,
      icp: byVenture.get(p.venture) ?? blankIcp(p.venture),
    }))

    const undefinedVentures = products.filter(p => !p.icp.defined).map(p => p.label)
    return res.json({
      ok: true,
      products,
      consumers: ICP_CONSUMERS,
      // Said once, at the top, so the gap is a number rather than a thing to
      // count by eye.
      summary: {
        defined: products.length - undefinedVentures.length,
        total: products.length,
        undefined_products: undefinedVentures,
      },
      server_time: new Date().toISOString(),
    })
  }

  if (req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as { venture?: string; patch?: Record<string, unknown> }
  const venture = clean(body.venture)
  if (!venture) return res.status(400).json({ ok: false, error: 'venture is required' })
  if (!ladder().some(p => p.venture === venture)) {
    return res.status(400).json({ ok: false, error: `${venture} is not a product on the ladder (src/lib/portfolio.ts)` })
  }

  const patch: Record<string, unknown> = {}
  for (const f of ICP_FIELDS) {
    if (!(f in (body.patch || {}))) continue
    const raw = (body.patch as Record<string, unknown>)[f]
    if ((ICP_LIST_FIELDS as readonly string[]).includes(f)) {
      const l = list(raw)
      if (l === null) return res.status(400).json({ ok: false, error: `${f} must be a list of words` })
      patch[f] = l
    } else {
      patch[f] = clean(raw)
    }
  }
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nothing to change' })

  patch.venture = venture
  patch.updated_by = 'krish'

  const { error } = await supabase.from('product_icp').upsert(patch, { onConflict: 'venture' })
  if (error) return res.status(500).json({ ok: false, error: error.message })

  // Read back rather than echo. `defined` is generated, so the only honest
  // answer to "is this ICP live now?" is the row Postgres actually holds.
  const { data: after, error: readErr } = await supabase
    .from('product_icp').select('*').eq('venture', venture).maybeSingle()
  if (readErr) return res.status(500).json({ ok: false, error: readErr.message })

  const icp = (after as ProductIcp | null) ?? blankIcp(venture)
  await supabase.from('audit_log').insert({
    actor: 'krish',
    event_type: 'krish_set_icp',
    details: `ICP for ${venture}: ${icp.defined ? `${icp.buyer_titles.length} buyer titles, prospecting unblocked` : 'still not defined, prospecting stays blocked'}`,
    changes: { venture, fields: Object.keys(patch).filter(k => k !== 'venture' && k !== 'updated_by'), defined: icp.defined },
  }).then(() => undefined, () => undefined)

  return res.json({ ok: true, venture, icp, unblocked: icp.defined })
}

export { ventureKey }
