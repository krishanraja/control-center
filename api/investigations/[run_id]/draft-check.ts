import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { robustJson } from '../../_content.js'
import { gateDraft, type DraftAssertion, type DraftEvidenceRow } from '../../_gates.js'
import { logGates } from '../../_gateLog.js'
import { buildAssertionPrompt } from '../../_ladder.js'
import { newBudget, callMetered, UTILITY_MODEL } from '../../_harness.js'

// POST /api/investigations/:run_id/draft-check   { body: "<draft markdown>" }
//
// G6. Runs after the draft, BEFORE _finalPass.
//
// One batched sonnet call extracts every factual assertion and MAPS it to an
// evidence ref. It does not judge. Verification is then zero model calls,
// because the page text was captured at G5 fetch time precisely so this step is
// free. That storage decision is what makes G6 cost one call instead of 24.
//
// A non-resolving evidence_ref is a FABRICATED CITATION and hard-blocks. So
// does a number absent from the evidence page, a misquote, and a missing
// terminal statement. Because investigation.unverifiedClaim is already 'block' in
// _finalPass, anything that slips here is caught again there: the two gates are
// redundant in the correct direction.

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  const auth = req.headers.authorization || ''
  return Boolean(secret) && auth === `Bearer ${secret}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

  const runId = ((req.query.run_id || '') as string).trim()
  if (!runId) return res.status(400).json({ ok: false, error: 'run_id required' })
  const body = (req.body || {}) as { body?: string }
  const draft = String(body.body || '').trim()
  if (!draft) return res.status(400).json({ ok: false, error: 'body (the draft text) required' })

  try {
    const { data: inv } = await supabase
      .from('investigations')
      .select('id, week, terminal_statement')
      .eq('id', runId).maybeSingle()
    if (!inv) return res.status(404).json({ ok: false, error: 'run not found' })

    const { data: ev } = await supabase
      .from('investigation_evidence')
      .select('ref, url, headline, page_text, citable, load_bearing, source_tier')
      .eq('investigation_id', runId)
      .eq('citable', true)
      .order('ref', { ascending: true })
      .limit(40)

    const rows: DraftEvidenceRow[] = (ev || []).map(r => {
      const e = r as Record<string, unknown>
      return {
        ref: String(e.ref), url: (e.url as string) || null, headline: (e.headline as string) || null,
        pageText: String(e.page_text || ''), citable: Boolean(e.citable),
        loadBearing: Boolean(e.load_bearing), tier: Number(e.source_tier ?? 4),
      }
    })

    const budget = newBudget({ maxModelCalls: 1 })
    const p = buildAssertionPrompt(draft, rows.map(r => ({ ref: r.ref, headline: r.headline || '', url: r.url || '' })))
    const call = await callMetered({ system: p.system, user: p.user, model: UTILITY_MODEL, maxTokens: 1500 }, budget)
    if (call.error) return res.status(502).json({ ok: false, error: call.error })

    const parsed = robustJson(call.text) as { assertions?: DraftAssertion[] } | null
    if (!parsed || !Array.isArray(parsed.assertions)) {
      return res.status(502).json({ ok: false, error: 'model returned an unusable shape' })
    }
    const assertions = parsed.assertions.filter(a => a && typeof a === 'object')

    const result = gateDraft(draft, assertions, rows, (inv as { terminal_statement?: string }).terminal_statement || null)
    await logGates({ runId, week: String((inv as { week: string }).week) }, result.verdicts, {
      modelName: UTILITY_MODEL, inputTokens: call.inputTokens, outputTokens: call.outputTokens,
    })

    return res.json({
      ok: true,
      action: result.action,
      blocked: result.action === 'block',
      assertions_checked: assertions.length,
      fabricated_citations: result.fabricatedCitations,
      unmapped_blocking: result.unmappedBlocking,
      // Pre-seeded for _finalPass's verify[] so an unmapped event arrives as a
      // [VERIFY] flag rather than silently passing.
      verify_seeds: result.verifySeeds,
      verdicts: result.verdicts,
      cost: { model_calls: budget.modelCalls, input_tokens: budget.inputTokens, output_tokens: budget.outputTokens, est_cost_usd: Number(budget.estCostUsd.toFixed(4)) },
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 60 }
