import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'
import { PRODUCT_SLUGS, TOUCHPOINT_CHANNELS, COVERAGE_STATUSES, text, score, bodyId } from '../_growth.js'

// /api/growth/touchpoints: the ICP touchpoint map, the spine of the Growth tab.
//
//   GET    every touchpoint, grouped client-side by product.
//   POST   add a touchpoint.
//   PATCH  inline edits (coverage_status, cost_efficiency_score, watering hole,
//          owner, rationale, the assumption flag itself), plus
//          action:'answer_assumption', which files Krish's answer into
//          evidence.resolved_assumptions and clears the open question.
//
// Retiring a touchpoint is coverage_status='retired'. Nothing is ever deleted,
// so the map keeps its history.
//
// House RLS is anon SELECT / service_role ALL, so the browser cannot write.
// Every mutation lands here, on the service role key.

const EDITABLE = ['icp_trigger', 'channel', 'watering_hole', 'coverage_status', 'owner_agent', 'rationale', 'assumption_flag'] as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, POST, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('growth_touchpoints')
      .select('*')
      .order('product_slug', { ascending: true })
      .order('cost_efficiency_score', { ascending: false, nullsFirst: false })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, count: (data || []).length, touchpoints: data || [] })
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Record<string, unknown>
    const product = text(b.product_slug)
    const trigger = text(b.icp_trigger)
    const channel = text(b.channel)
    if (!product || !PRODUCT_SLUGS.has(product)) return res.status(400).json({ ok: false, error: 'product_slug invalid' })
    if (!channel || !TOUCHPOINT_CHANNELS.has(channel)) return res.status(400).json({ ok: false, error: 'channel invalid' })
    if (!trigger) return res.status(400).json({ ok: false, error: 'icp_trigger is required' })
    const coverage = text(b.coverage_status) || 'unaddressed'
    if (!COVERAGE_STATUSES.has(coverage)) return res.status(400).json({ ok: false, error: 'coverage_status invalid' })
    const s = score(b.cost_efficiency_score)
    if (!s.ok) return res.status(400).json({ ok: false, error: 'cost_efficiency_score must be 1-10' })

    const { data, error } = await supabase
      .from('growth_touchpoints')
      .insert({
        product_slug: product,
        icp_trigger: trigger,
        channel,
        watering_hole: text(b.watering_hole),
        cost_efficiency_score: s.value,
        coverage_status: coverage,
        owner_agent: text(b.owner_agent),
        rationale: text(b.rationale),
        assumption_flag: text(b.assumption_flag),
      })
      .select('*')
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, touchpoint: data })
  }

  // PATCH
  const id = bodyId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  const b = (req.body || {}) as Record<string, unknown>

  if (b.action === 'answer_assumption') {
    const answer = text(b.answer)
    if (!answer) return res.status(400).json({ ok: false, error: 'answer is required' })
    const { data: row, error: readErr } = await supabase
      .from('growth_touchpoints').select('assumption_flag,evidence').eq('id', id).single()
    if (readErr || !row) return res.status(404).json({ ok: false, error: 'touchpoint not found' })
    const evidence = (row.evidence && typeof row.evidence === 'object' ? row.evidence : {}) as Record<string, unknown>
    const prior = Array.isArray(evidence.resolved_assumptions) ? evidence.resolved_assumptions : []
    const { data, error } = await supabase
      .from('growth_touchpoints')
      .update({
        assumption_flag: null,
        evidence: {
          ...evidence,
          resolved_assumptions: [...prior, { question: row.assumption_flag, answer, at: new Date().toISOString() }],
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, touchpoint: data })
  }

  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    patch[k] = text(b[k])
  }
  if (patch.channel != null && !TOUCHPOINT_CHANNELS.has(String(patch.channel))) {
    return res.status(400).json({ ok: false, error: 'channel invalid' })
  }
  if (patch.coverage_status != null && !COVERAGE_STATUSES.has(String(patch.coverage_status))) {
    return res.status(400).json({ ok: false, error: 'coverage_status invalid' })
  }
  if (patch.icp_trigger === null) return res.status(400).json({ ok: false, error: 'icp_trigger cannot be blank' })
  if ('cost_efficiency_score' in b) {
    const s = score(b.cost_efficiency_score)
    if (!s.ok) return res.status(400).json({ ok: false, error: 'cost_efficiency_score must be 1-10' })
    patch.cost_efficiency_score = s.value
  }
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nothing to update' })
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('growth_touchpoints').update(patch).eq('id', id).select('*').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'touchpoint not found' })
  return res.json({ ok: true, touchpoint: data })
}
