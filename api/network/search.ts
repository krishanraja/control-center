import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { runNetworkSearch } from '../_networkSearch.js'

// POST /api/network/search
//   { question, venture?, roles?, tiers?, countries?, filter_mode?, min_confidence?, limit?, rerank? }
//
// Ask the network anything. Returns ranked people with a score breakdown and a
// per-person reason, plus `restated` so the interpretation is confirmable
// before the results are read.
//
// It does not return an empty list for a reasonable question. When the query
// signal is noise, `weak: true` says so and the best-connected people are
// returned anyway.

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const body = (req.body || {}) as Record<string, unknown>
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  // An empty question is a client bug, not a search. Recommend mode is the
  // endpoint for "show me people with no question".
  if (!question) return res.status(400).json({ ok: false, error: 'question_required' })

  try {
    const out = await runNetworkSearch({
      question,
      venture: typeof body.venture === 'string' ? body.venture : null,
      roles: Array.isArray(body.roles) ? body.roles.map(String) : null,
      tiers: Array.isArray(body.tiers) ? body.tiers.map(String) : null,
      // Geography. The RPC canonicalises, so ISO-2 codes, country names and
      // city names all work; the cap and the length slice are here for the same
      // reason every other list is capped, which is that this is a public-shaped
      // body reaching a database call.
      countries: Array.isArray(body.countries)
        ? body.countries.map(String).map(x => x.slice(0, 60)).filter(Boolean).slice(0, 20)
        : null,
      // Defaults to 'hard', which is what roles/tiers have always meant here.
      // Only an explicit 'soft' relaxes them into weighted constraints.
      filterMode: body.filter_mode === 'soft' ? 'soft' : 'hard',
      minConfidence: typeof body.min_confidence === 'string' ? body.min_confidence : null,
      limit: typeof body.limit === 'number' ? body.limit : 20,
      // OPT-IN, not opt-out. This read `body.rerank !== false`, so an omitted
      // flag became true and the explanation pass stayed on the critical path
      // even after the executor's default was changed. That single coercion is
      // why the endpoint still measured 22s: `tail` (everything after the RPC)
      // was 18s of it.
      rerank: body.rerank === true,
    })
    return res.status(200).json(out)
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'search_failed' })
  }
}
