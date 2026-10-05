import type { Page, Route } from '@playwright/test'
import { ICP_CONSUMERS } from '../../src/lib/icp'
import { PORTFOLIO, TIER_LABEL, UNRANKED_GROWTH } from '../../src/lib/portfolio'

/**
 * Growth > Buyers, shaped exactly as live Supabase holds it on 2026-10-05:
 * Mindmake's ICP seeded from canon, and every other product on the ladder with
 * no row at all.
 *
 * That asymmetry is the fixture's whole job. A mock where everything is filled
 * in proves the form renders; it proves nothing about the state the surface
 * exists for, which is five products that cannot be prospected and have to say
 * so. The response is built from the same `src/lib/portfolio.ts` the route
 * reads, so a product added to the ladder appears here too rather than quietly
 * going untested.
 */

const DEFINED_VENTURE = 'mindmake'

const MINDMAKE_TITLES = [
  'Founder', 'Co-Founder', 'Chief Executive Officer', 'Managing Director',
  'Managing Partner', 'Principal', 'Chief Commercial Officer',
  'Chief Strategy Officer', 'Chief Operating Officer', 'General Manager',
]

function row(venture: string, label: string, tier: number | null, what: string | null) {
  const defined = venture === DEFINED_VENTURE
  return {
    venture,
    label,
    tier,
    tierLabel: tier ? TIER_LABEL[tier as 1 | 2 | 3] : null,
    what,
    icp: {
      venture,
      buyer_titles: defined ? MINDMAKE_TITLES : [],
      seniorities: defined ? ['owner', 'founder', 'c_suite', 'partner', 'vp'] : [],
      geos: defined ? ['United States', 'United Kingdom', 'Australia'] : [],
      who: defined
        ? 'A founder, principal or senior commercial leader who can move a decision and the result behind it. They own the outcome, not a recommendation about it.'
        : null,
      who_not: defined
        ? 'Anyone who has to take the idea to somebody else before anything changes.'
        : null,
      company_shape: defined ? 'Owner-led or partner-led businesses where one person carries the commercial number.' : null,
      buying_trigger: defined ? 'A decision they already own has stalled, and the cost of it staying stalled is now visible to them.' : null,
      notes: null,
      defined,
      updated_at: defined ? new Date(Date.now() - 3 * 3_600_000).toISOString() : null,
      updated_by: defined ? 'seed:canon' : null,
    },
  }
}

export function icpPayload() {
  const products = [
    ...PORTFOLIO.map(p => row(p.venture, p.label, p.tier, p.what)),
    ...UNRANKED_GROWTH.map(p => row(
      p.venture,
      p.venture === 'mindmake' ? 'Mindmake' : 'Circle',
      null,
      p.venture === 'mindmake' ? 'The practice, and the Substack publication beside it.' : 'Dormant, kept so its history survives.',
    )),
  ]
  const undefinedProducts = products.filter(p => !p.icp.defined).map(p => p.label)
  return {
    ok: true,
    products,
    consumers: ICP_CONSUMERS,
    summary: {
      defined: products.length - undefinedProducts.length,
      total: products.length,
      undefined_products: undefinedProducts,
    },
    server_time: new Date().toISOString(),
  }
}

/**
 * Register AFTER any catch-all (Playwright checks handlers in reverse
 * registration order). `onSave` sees the PATCH body, so a spec can prove the
 * save carried the titles Krish typed.
 */
export async function mockIcp(page: Page, opts: { onSave?: (body: any) => void } = {}) {
  let state = icpPayload()
  await page.route('**/api/icp', async (r: Route) => {
    if (r.request().method() === 'PATCH') {
      const body = r.request().postDataJSON()
      opts.onSave?.(body)
      // Answer the way the route does: read back what the write produced, with
      // `defined` recomputed the way the generated column computes it.
      const p = state.products.find(x => x.venture === body.venture)
      if (p) {
        Object.assign(p.icp, body.patch)
        p.icp.defined = (p.icp.buyer_titles?.length ?? 0) > 0 && !!p.icp.who && p.icp.who.trim().length > 0
        p.icp.updated_at = new Date().toISOString()
      }
      const undefinedProducts = state.products.filter(x => !x.icp.defined).map(x => x.label)
      state.summary = { defined: state.products.length - undefinedProducts.length, total: state.products.length, undefined_products: undefinedProducts }
      return r.fulfill({ json: { ok: true, venture: body.venture, icp: p?.icp, unblocked: !!p?.icp.defined } })
    }
    return r.fulfill({ json: state })
  })
}
