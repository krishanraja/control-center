import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// GET /api/investigations/:run_id/trace
//
// The audit read. Every gate decision for a run, with the value each check
// OBSERVED, so "why did this pass" is answerable months later.
//
// Deliberately unauthenticated for GET. Every table it reads already carries
// `anon SELECT` under the house RLS policy, so a token here would be theatre,
// not a control. It spends nothing and writes nothing.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' })

  const runId = ((req.query.run_id || '') as string).trim()
  if (!runId) return res.status(400).json({ ok: false, error: 'run_id required' })

  try {
    const [inv, gates, claims, evidence, harnesses] = await Promise.all([
      supabase.from('investigations').select('*').eq('id', runId).maybeSingle(),
      supabase.from('investigation_gate_log').select('*').eq('run_id', runId).order('created_at', { ascending: true }),
      supabase.from('investigation_claims').select('*').eq('investigation_id', runId).order('rung', { ascending: true }),
      supabase.from('investigation_evidence')
        .select('ref, url, domain, headline, source_tier, published_on, citable, quarantine_reason, load_bearing, origin_key, numeric_fingerprint')
        .eq('investigation_id', runId).order('ref', { ascending: true }),
      supabase.from('investigation_harness_results').select('*').eq('investigation_id', runId).order('created_at', { ascending: true }),
    ])

    if (!inv.data) return res.status(404).json({ ok: false, error: 'run not found' })

    const rows = gates.data || []
    const byGate: Record<string, { pass: number; flag: number; downgrade: number; block: number }> = {}
    for (const r of rows) {
      const g = (r as { gate: string; action: string })
      byGate[g.gate] = byGate[g.gate] || { pass: 0, flag: 0, downgrade: 0, block: 0 }
      const bucket = byGate[g.gate] as Record<string, number>
      bucket[g.action] = (bucket[g.action] || 0) + 1
    }

    // Absence is failure: a gate with no row did not run, whatever the
    // investigation row claims about itself.
    const expected = ['G1_anchor', 'G2_grounding', 'G3_interest', 'G4_ladder', 'G5_harness']
    const missing = expected.filter(g => !byGate[g])

    return res.json({
      ok: true,
      investigation: inv.data,
      summary: { gate_rows: rows.length, by_gate: byGate, missing_gates: missing, audit_complete: missing.length === 0 },
      gate_log: rows,
      claims: claims.data || [],
      // page_text is deliberately omitted: it is stored so G6 needs no second
      // fetch, not so a trace response carries a megabyte of publisher HTML.
      evidence: evidence.data || [],
      harnesses: harnesses.data || [],
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 60 }
