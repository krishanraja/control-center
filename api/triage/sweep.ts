import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  TABLES, DOMAIN_OF, DEFAULT_WEIGHTS, SELECT_COLS, type Table,
  features, score, guarded, idleDays, titleOf, reasonOf,
  loadWeights, saveConfig, fetchEligible,
} from '../_grader.js'

/**
 * Backburner sweep + grader weight learning.
 *
 * GET  — cron entry (Authorization: Bearer ${CRON_SECRET}). Runs the live
 *        sweep, then the capped learning pass.
 * POST — UI calls:
 *        { action: 'sweep', dry_run?: true }
 *        { action: 'restore', source_table, source_id }
 *        { action: 'learn', dry_run?: true }
 *
 * The sweep buries low-score idle agent-generated rows: sets buried_at +
 * a human-readable buried_reason. decisions_waiting and the tab lists
 * exclude buried rows; each tab shows them in a collapsed Backburner
 * section with Restore. Restore sets protected_at so the row is never
 * re-buried. origin='user' rows are never touched. Scoring is fully
 * deterministic — no LLM (see api/_grader.ts).
 *
 * The learning pass nudges weights from real approve/reject actions
 * (feedback_queue) by at most LEARN_STEP_CAP per cycle and never applies an
 * update that would newly bury an item Krish kept; larger shifts are staged
 * in grader_weights_proposed_<domain> for explicit approval.
 */

const LEARN_STEP_CAP = 0.1 // max ±10% per coefficient per cycle
const DAY_MS = 24 * 60 * 60 * 1000

interface BuryCandidate { id: string; title: string; score: number; reason: string }

async function runSweep(dryRun: boolean) {
  const { weights, thresholds } = await loadWeights()
  const result: Record<string, { eligible: number; buried: BuryCandidate[] }> = {}

  for (const table of TABLES) {
    const rows = await fetchEligible(table)
    const scored = rows
      .filter(row => !guarded(table, row))
      .map(row => ({ row, s: score(table, row, weights[table]), age: idleDays(row) }))

    // Adaptive cutoff: on big queues the fixed floor barely fires (scores
    // cluster well above it), so the effective bar rises to the bottom
    // quartile of this table's eligible scores. Bounded by max_per_sweep.
    let cutoff = thresholds.bury_below
    if (scored.length >= thresholds.adaptive_min_eligible) {
      const sorted = scored.map(x => x.s).sort((a, b) => a - b)
      cutoff = Math.max(cutoff, sorted[Math.floor(sorted.length * thresholds.adaptive_percentile)])
    }

    const toBury: BuryCandidate[] = scored
      .filter(x => x.age >= thresholds.min_idle_days && x.s < cutoff)
      .sort((a, b) => a.s - b.s)
      .slice(0, thresholds.max_per_sweep)
      .map(x => ({ id: String(x.row.id), title: titleOf(table, x.row), score: Math.round(x.s), reason: reasonOf(table, x.row, x.s) }))

    if (!dryRun && toBury.length > 0) {
      const now = new Date().toISOString()
      for (let i = 0; i < toBury.length; i += 20) {
        await Promise.all(toBury.slice(i, i + 20).map(c =>
          supabase.from(table).update({ buried_at: now, buried_reason: c.reason }).eq('id', c.id)
        ))
      }
    }
    result[table] = { eligible: rows.length, buried: toBury }
  }

  if (!dryRun) {
    const counts = Object.fromEntries(Object.entries(result).map(([t, r]) => [t, r.buried.length]))
    await supabase.from('audit_log').insert({
      event_type: 'backburner_sweep',
      actor: 'grader',
      target: 'triage',
      details: JSON.stringify({ buried: counts, thresholds }),
    })
  }
  return result
}

// States a content idea may be promoted into when restoring from the backburner.
const CONTENT_STATES = new Set(['seeded', 'researching', 'drafting', 'review', 'approved', 'published', 'dropped'])

// Manual "Retain" — set a row aside without dropping it. Mirrors the nightly
// sweep's bury, but user-driven (a stamped buried_reason distinguishes it).
async function bury(table: string, id: string, reason?: string) {
  if (!TABLES.includes(table as Table)) throw new Error('invalid source_table')
  const { error } = await supabase
    .from(table)
    .update({ buried_at: new Date().toISOString(), buried_reason: reason || 'Retained for later' })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await supabase.from('audit_log').insert({
    event_type: 'backburner_manual_bury',
    actor: 'krish',
    target: id,
    details: JSON.stringify({ source_table: table, reason: reason || 'Retained for later' }),
  })
}

async function restore(table: string, id: string, toState?: string) {
  if (!TABLES.includes(table as Table)) throw new Error('invalid source_table')
  const updates: Record<string, unknown> = {
    buried_at: null,
    buried_reason: null,
    protected_at: new Date().toISOString(),
  }
  // Optional atomic promote (content_ideas only): un-bury straight into a new
  // pipeline state, e.g. retained → researching, instead of back to the pile.
  if (toState) {
    if (table !== 'content_ideas' || !CONTENT_STATES.has(toState)) throw new Error('invalid to_state')
    updates.state = toState
  }
  const { error } = await supabase.from(table).update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  await supabase.from('audit_log').insert({
    event_type: 'backburner_restore',
    actor: 'krish',
    target: id,
    details: JSON.stringify({ source_table: table, to_state: toState ?? null }),
  })
}

async function runLearn(dryRun: boolean) {
  const { weights, thresholds } = await loadWeights()
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const since30d = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const out: Record<string, any> = {}

  for (const table of TABLES) {
    const { data: fb } = await supabase
      .from('feedback_queue')
      .select('source_id, vote, created_at')
      .eq('source_table', table)
      .in('vote', [1, -1])
      .gte('created_at', since7d)
    if (!fb || fb.length < 4) { out[table] = { skipped: 'not enough recent feedback' }; continue }

    const ids = Array.from(new Set(fb.map(r => String(r.source_id))))
    const { data: rows } = await supabase.from(table).select(SELECT_COLS[table]).in('id', ids)
    const byId = new Map((rows || []).map(r => [String((r as any).id), r]))

    const kept: any[] = []
    const rejected: any[] = []
    for (const r of fb) {
      const row = byId.get(String(r.source_id))
      if (!row) continue
      ;(r.vote === 1 ? kept : rejected).push(row)
    }
    if (kept.length === 0 || rejected.length === 0) { out[table] = { skipped: 'need both kept and rejected examples' }; continue }

    // Standardized mean difference per feature → proposed multiplicative nudge.
    const attrs = Object.keys(DEFAULT_WEIGHTS[table])
    const mean = (rs: any[], k: string) => rs.reduce((a, r) => a + features(table, r)[k], 0) / rs.length
    const scale = (k: string) => Math.max(1e-6, ...kept.concat(rejected).map(r => Math.abs(features(table, r)[k])))
    const proposedFull: Record<string, number> = {}
    const proposedCapped: Record<string, number> = {}
    let exceedsCap = false
    for (const k of attrs) {
      const diff = (mean(kept, k) - mean(rejected, k)) / scale(k)
      const nudge = diff * 0.2
      if (Math.abs(nudge) > LEARN_STEP_CAP) exceedsCap = true
      proposedFull[k] = weights[table][k] * (1 + nudge)
      proposedCapped[k] = weights[table][k] * (1 + Math.max(-LEARN_STEP_CAP, Math.min(LEARN_STEP_CAP, nudge)))
    }

    // Guard: the capped update must not newly bury anything Krish kept (30d).
    const { data: fbKept30 } = await supabase
      .from('feedback_queue')
      .select('source_id')
      .eq('source_table', table)
      .eq('vote', 1)
      .gte('created_at', since30d)
    const keptIds = Array.from(new Set((fbKept30 || []).map(r => String(r.source_id))))
    let guardViolated = false
    if (keptIds.length > 0) {
      const { data: keptRows } = await supabase.from(table).select(SELECT_COLS[table]).in('id', keptIds)
      for (const row of keptRows || []) {
        const cur = score(table, row, weights[table])
        const next = score(table, row, proposedCapped)
        if (cur >= thresholds.bury_below && next < thresholds.bury_below) { guardViolated = true; break }
      }
    }

    const domain = DOMAIN_OF[table]
    if (!dryRun) {
      if (!guardViolated) await saveConfig(`grader_weights_${domain}`, proposedCapped)
      if (guardViolated || exceedsCap) {
        await saveConfig(`grader_weights_proposed_${domain}`, {
          weights: proposedFull,
          reason: guardViolated ? 'guard: would newly bury a kept item' : 'exceeds per-cycle step cap',
          proposed_at: new Date().toISOString(),
        })
      }
    }
    out[table] = {
      kept: kept.length,
      rejected: rejected.length,
      applied: !guardViolated,
      staged: guardViolated || exceedsCap,
      weights: proposedCapped,
    }
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
    try {
      const sweep = await runSweep(false)
      const learn = await runLearn(false)
      const buried = Object.fromEntries(Object.entries(sweep).map(([t, r]) => [t, r.buried.length]))
      return res.json({ ok: true, buried, learn })
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })

  const body = (req.body || {}) as { action?: string; dry_run?: boolean; source_table?: string; source_id?: string; reason?: string; to_state?: string }
  try {
    if (body.action === 'sweep') {
      const result = await runSweep(!!body.dry_run)
      return res.json({ ok: true, dry_run: !!body.dry_run, result })
    }
    if (body.action === 'bury') {
      if (!body.source_table || !body.source_id) return res.status(400).json({ ok: false, error: 'source_table and source_id required' })
      await bury(body.source_table, body.source_id, body.reason)
      return res.json({ ok: true, buried: true })
    }
    if (body.action === 'restore') {
      if (!body.source_table || !body.source_id) return res.status(400).json({ ok: false, error: 'source_table and source_id required' })
      await restore(body.source_table, body.source_id, body.to_state)
      return res.json({ ok: true, restored: true })
    }
    if (body.action === 'learn') {
      const result = await runLearn(!!body.dry_run)
      return res.json({ ok: true, dry_run: !!body.dry_run, result })
    }
    return res.status(400).json({ ok: false, error: 'invalid action' })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
