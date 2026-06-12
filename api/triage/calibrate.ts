import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  TABLE_OF_DOMAIN, DOMAIN_OF, DEFAULT_WEIGHTS,
  features, titleOf, fetchEligible, saveConfig, loadConfig,
} from '../_grader.js'

/**
 * Grader calibration on REAL rows (best-worst / MaxDiff).
 *
 * POST { action: 'items', domain, count? }
 *   → up to `count` random agent-generated rows for the domain, each with
 *     its title, summary fields, and the exact feature profile the sweep
 *     scores against (computed server-side so calibration and sweep can
 *     never drift apart).
 *
 * POST { action: 'record', domain, shown_profiles, best_id, worst_id, reason? }
 *   → appends one calibration response.
 *
 * POST { action: 'fit', domain }
 *   → best-worst counting over ALL recorded responses for the domain →
 *     normalized multiplicative adjustment of the default weights →
 *     writes grader_weights_<domain> to system_config. Re-runnable.
 */

const DOMAINS = Object.keys(TABLE_OF_DOMAIN)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = (req.body || {}) as {
    action?: string; domain?: string; count?: number
    shown_profiles?: Array<{ item_id: string; profile: Record<string, number> }>
    best_id?: string; worst_id?: string; reason?: string
  }
  const domain = body.domain || ''
  if (!DOMAINS.includes(domain)) return res.status(400).json({ ok: false, error: 'invalid domain' })
  const table = TABLE_OF_DOMAIN[domain]

  try {
    if (body.action === 'items') {
      const count = Math.min(Math.max(body.count || 40, 4), 200)
      const rows = await fetchEligible(table, 500)
      // Shuffle so repeat sessions see different cards.
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[rows[i], rows[j]] = [rows[j], rows[i]]
      }
      const items = rows.slice(0, count).map(row => ({
        id: String(row.id),
        title: titleOf(table, row),
        summary: summarize(table, row),
        profile: features(table, row),
      }))
      return res.json({ ok: true, items })
    }

    if (body.action === 'record') {
      if (!body.shown_profiles?.length || !body.best_id || !body.worst_id) {
        return res.status(400).json({ ok: false, error: 'shown_profiles, best_id, worst_id required' })
      }
      const { error } = await supabase.from('calibration_responses').insert({
        domain,
        shown_profiles: body.shown_profiles,
        best_id: body.best_id,
        worst_id: body.worst_id,
        reason: body.reason || null,
      })
      if (error) return res.status(500).json({ ok: false, error: error.message })
      return res.json({ ok: true, recorded: true })
    }

    if (body.action === 'fit') {
      const { data: responses, error } = await supabase
        .from('calibration_responses')
        .select('shown_profiles, best_id, worst_id')
        .eq('domain', domain)
      if (error) return res.status(500).json({ ok: false, error: error.message })
      if (!responses || responses.length < 3) {
        return res.status(400).json({ ok: false, error: 'need at least 3 recorded screens before fitting' })
      }

      // Best-worst counting: each attribute accumulates +value from the best
      // pick and -value from the worst pick, normalized per-attribute by the
      // largest magnitude seen, then mapped to a bounded multiplicative
      // adjustment (±50%) of the default coefficients.
      const attrs = Object.keys(DEFAULT_WEIGHTS[table])
      const acc: Record<string, number> = Object.fromEntries(attrs.map(a => [a, 0]))
      const maxAbs: Record<string, number> = Object.fromEntries(attrs.map(a => [a, 1e-6]))
      let used = 0
      for (const r of responses) {
        const shown = (r.shown_profiles || []) as Array<{ item_id: string; profile: Record<string, number> }>
        const best = shown.find(s => s.item_id === r.best_id)?.profile
        const worst = shown.find(s => s.item_id === r.worst_id)?.profile
        if (!best || !worst) continue
        used++
        for (const a of attrs) {
          for (const s of shown) maxAbs[a] = Math.max(maxAbs[a], Math.abs(s.profile[a] ?? 0))
          acc[a] += (best[a] ?? 0) - (worst[a] ?? 0)
        }
      }
      if (used === 0) return res.status(400).json({ ok: false, error: 'no usable responses' })

      const weights: Record<string, number> = {}
      for (const a of attrs) {
        const signal = Math.max(-0.5, Math.min(0.5, acc[a] / (used * maxAbs[a])))
        weights[a] = Number((DEFAULT_WEIGHTS[table][a] * (1 + signal)).toFixed(3))
      }
      await saveConfig(`grader_weights_${DOMAIN_OF[table]}`, weights)
      await supabase.from('audit_log').insert({
        event_type: 'grader_calibrated',
        actor: 'krish',
        target: domain,
        details: JSON.stringify({ responses: used, weights }),
      })
      return res.json({ ok: true, fitted: true, responses: used, weights })
    }

    if (body.action === 'status') {
      const cfg = await loadConfig([`grader_weights_${domain}`])
      const { count } = await supabase
        .from('calibration_responses')
        .select('id', { count: 'exact', head: true })
        .eq('domain', domain)
      return res.json({ ok: true, calibrated: !!cfg[`grader_weights_${domain}`], responses: count || 0 })
    }

    return res.status(400).json({ ok: false, error: 'invalid action' })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

function summarize(table: string, row: any): string {
  const bits: string[] = []
  if (row.quality_score) bits.push(`${row.quality_score} quality`)
  if (row.fit_score != null) bits.push(`fit ${row.fit_score}/10`)
  if (row.relevance_score != null) bits.push(`relevance ${row.relevance_score}/10`)
  if (row.confidence != null) bits.push(`confidence ${Math.round(row.confidence * 100)}%`)
  if (row.brand_fit_score != null) bits.push(`brand fit ${row.brand_fit_score}/10`)
  if (row.lever_score != null) bits.push(`lever ${row.lever_score}/10`)
  if (row.status || row.state) bits.push(String(row.status || row.state))
  return bits.join(' · ')
}
