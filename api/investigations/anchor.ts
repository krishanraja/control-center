import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadCandidates, priorAnchorHeadlines, selectAnchor } from '../_investigation.js'
import { rankAnchors } from '../_anchor.js'
import { newBudget, type HarnessContext } from '../_harness.js'
import { rootDomain } from '../_gates.js'

// GET/POST /api/investigations/anchor
//
// Anchor selection as its own endpoint, so the pick is inspectable without
// paying for a ladder. Returns the full ranking: what passed the free
// deterministic pre-gates, what scored where and why, and what the vendor rule
// did to the top candidates.
//
// `?spend=1` (or {spend:true}) lets G1 consult the model on an unknown entity
// and run the provenance harness on a vendor-sourced anchor. Default is FREE:
// deterministic only, zero calls.
//
// Auth on both verbs, matching api/growth/geo-probe.ts.

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  const auth = req.headers.authorization || ''
  return Boolean(secret) && auth === `Bearer ${secret}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'GET or POST only' })
  }
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

  try {
    const body = (req.body || {}) as { spend?: boolean }
    const spend = req.query.spend === '1' || body.spend === true
    const today = new Date().toISOString().slice(0, 10)

    const all = await loadCandidates()
    const prior = await priorAnchorHeadlines()
    const ranked = rankAnchors(all, { today, priorAnchorHeadlines: prior })

    const budget = newBudget()
    const hctx: HarnessContext = { budget }
    const decision = await selectAnchor(ranked, budget, hctx, { dryRun: !spend })

    return res.json({
      ok: true,
      pool: {
        loaded: all.length,
        passed_pre_gate: ranked.filter(r => r.rank || r.overCap).length,
        ranked: ranked.filter(r => r.rank).length,
        over_cap: ranked.filter(r => r.overCap).length,
      },
      chosen: decision.chosen
        ? {
            id: decision.chosen.candidate.id,
            headline: decision.chosen.candidate.headline,
            url: decision.chosen.candidate.url,
            domain: rootDomain(decision.chosen.candidate.url),
            score: decision.chosen.score?.total,
            parts: decision.chosen.score?.parts,
            observed: decision.chosen.score?.observed,
            thesis_mode: decision.thesisMode,
            rung0_question: decision.rung0Question,
            origin: decision.origin,
            denominator: decision.denominator,
            entity: decision.entity,
          }
        : null,
      attempts: decision.attempts,
      gate_verdicts: decision.verdicts,
      ranking: ranked
        .filter(r => r.rank)
        .sort((a, b) => (a.rank as number) - (b.rank as number))
        .slice(0, 15)
        .map(r => ({
          rank: r.rank, id: r.candidate.id, headline: r.candidate.headline,
          domain: rootDomain(r.candidate.url), score: r.score?.total,
          parts: r.score?.parts, observed: r.score?.observed,
        })),
      rejected: ranked
        .filter(r => !r.rank && !r.overCap)
        .map(r => ({ id: r.candidate.id, headline: r.candidate.headline.slice(0, 110), failed: r.preGate.failedIds })),
      over_cap: ranked
        .filter(r => r.overCap)
        .map(r => ({ id: r.candidate.id, headline: r.candidate.headline.slice(0, 110), score: r.score?.total })),
      degraded: decision.degraded,
      spend: { model_calls: budget.modelCalls, search_calls: budget.searchCalls, est_cost_usd: Number(budget.estCostUsd.toFixed(4)) },
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 60 }
