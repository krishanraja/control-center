// Shared per-surface config + sweep orchestrator for the triage relevance
// sweep. Two callers:
//   - api/triage/relevance-sweep.ts  (HTTP endpoint; preview-then-apply button)
//   - scripts/triage/relevance-sweep.ts (CLI, for power use)
//
// Keeping this one definition of "what a drop looks like per surface" prevents
// the script and the endpoint from drifting on the terminal payloads, reason
// codes, and guarded statuses.

import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyRelevance, relevanceReasonCode, DEFAULT_MUTED_VERTICALS, type RelevanceItem } from './_relevance.js'

export type TableName = 'content_ideas' | 'leads' | 'guests' | 'visibility_targets' | 'contacts'

const DAY_MS = 86_400_000
function qScore(quality: string | null | undefined): number {
  if (quality === 'green') return 20
  if (quality === 'amber') return 10
  if (quality === 'red') return 0
  return 8
}
function idleDays(row: any): number {
  const ref = row.created_at || row.created || row.updated_at
  if (!ref) return 0
  const ms = Date.now() - new Date(ref).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms / DAY_MS : 0
}
function within(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t < Date.now() + days * DAY_MS
}

export interface SurfaceCfg {
  prefix: string
  kind: 'content' | 'lead' | 'guest' | 'visibility' | 'contact'
  statusCol: string
  eligible: string[]
  selectCols: string
  hasOrigin: boolean
  relevanceDefault: boolean
  dropPayload: () => Record<string, unknown>
  trimReason: string
  agentOf: (r: any) => string | null
  classifyOf: (r: any) => RelevanceItem
  scoreOf: (r: any) => number
  guarded: (r: any) => boolean
  titleOf: (r: any) => string
}

// Per-surface configs. Each surface's terminal payload, eligible status, and
// guarded predicate mirror api/triage/reject.ts and api/_grader.ts so a sweep
// drop is byte-for-byte identical to a manual swipe-left.
export const SURFACES: Record<TableName, SurfaceCfg> = {
  content_ideas: {
    prefix: 'content', kind: 'content', statusCol: 'state', eligible: ['seeded', 'researching'],
    selectCols: 'id, idea, source_snippet, state, origin, confidence, brand_fit_score, quality_score, buried_at, protected_at, created_at',
    hasOrigin: true, relevanceDefault: true, trimReason: 'content_thin',
    dropPayload: () => ({ state: 'dropped' }),
    agentOf: () => 'cleo',
    classifyOf: r => ({ id: r.id, title: r.idea, text: r.source_snippet }),
    scoreOf: r => (r.confidence ?? 0.4) * 35 + (r.brand_fit_score ?? 5) * 4.5 + qScore(r.quality_score) - Math.min(25, idleDays(r) / 2),
    guarded: r => ['drafting', 'review', 'approved'].includes(r.state),
    titleOf: r => String(r.idea || '(untitled)').slice(0, 80),
  },
  leads: {
    prefix: 'lead', kind: 'lead', statusCol: 'status', eligible: ['new', 'ready'],
    selectCols: 'id, full_name, company, title, status, origin, fit_score, quality_score, promoted_task_id, assignee_agent, buried_at, protected_at, created_at',
    hasOrigin: true, relevanceDefault: false, trimReason: 'lead_other',
    dropPayload: () => ({ status: 'closed_lost', quality_score: 'red' }),
    agentOf: r => r.assignee_agent || null,
    classifyOf: r => ({ id: r.id, title: [r.full_name, r.title, r.company].filter(Boolean).join(' · '), text: '' }),
    scoreOf: r => (r.fit_score ?? 5) * 4 + qScore(r.quality_score) * 3 - Math.min(25, idleDays(r) / 2),
    guarded: r => ['contacted', 'conversation'].includes(r.status) || !!r.promoted_task_id,
    titleOf: r => [r.full_name, r.company].filter(Boolean).join(' · ') || '(unnamed)',
  },
  guests: {
    prefix: 'guest', kind: 'guest', statusCol: 'status', eligible: ['scouted', 'enriched'],
    selectCols: 'id, name, status, origin, fit_score, attainability_score, quality_score, buried_at, protected_at, created_at',
    hasOrigin: true, relevanceDefault: false, trimReason: 'guest_low_reach',
    dropPayload: () => ({ status: 'skipped', skipped_at: new Date().toISOString() }),
    agentOf: () => 'nell',
    classifyOf: r => ({ id: r.id, title: r.name, text: '' }),
    scoreOf: r => (r.fit_score ?? 5) * 6 + (r.attainability_score ?? 5) * 2 + qScore(r.quality_score) - Math.min(25, idleDays(r) / 2),
    guarded: r => ['responded', 'scheduled', 'confirmed', 'recorded', 'published'].includes(r.status),
    titleOf: r => String(r.name || '(unnamed)'),
  },
  visibility_targets: {
    prefix: 'visibility', kind: 'visibility', statusCol: 'status', eligible: ['sourced', 'queued'],
    selectCols: 'id, title, status, origin, relevance_score, quality_score, deadline_at, why_relevant, buried_at, protected_at, created_at',
    hasOrigin: true, relevanceDefault: false, trimReason: 'visibility_too_low_tier',
    dropPayload: () => ({ status: 'dropped', rejected_at: new Date().toISOString() }),
    agentOf: () => 'nova',
    classifyOf: r => ({ id: r.id, title: r.title, text: r.why_relevant }),
    scoreOf: r => (r.relevance_score ?? 4) * 8 + qScore(r.quality_score) + (within(r.deadline_at, 14) ? 25 : 0) - Math.min(25, idleDays(r) / 2),
    guarded: r => within(r.deadline_at, 21),
    titleOf: r => String(r.title || '(untitled)'),
  },
  contacts: {
    prefix: 'contact', kind: 'contact', statusCol: 'triage_status', eligible: [],
    selectCols: 'id, full_name, title, company, heat_score, consent_tier, owner_agent, triage_status, created_at',
    hasOrigin: false, relevanceDefault: false, trimReason: 'contact_cold',
    dropPayload: () => ({ triage_status: 'skipped', triaged_at: new Date().toISOString() }),
    agentOf: r => r.owner_agent || null,
    classifyOf: r => ({ id: r.id, title: [r.full_name, r.title, r.company].filter(Boolean).join(' · '), text: '' }),
    scoreOf: r => (r.heat_score ?? 0) - Math.min(25, idleDays(r) / 2),
    guarded: r => r.consent_tier === 'customer',
    titleOf: r => [r.full_name, r.company].filter(Boolean).join(' · ') || '(unnamed)',
  },
}

interface Drop { id: string; reason_code: string; rationale: string; agent: string | null; meta: Record<string, unknown> }

async function loadRows(sb: SupabaseClient, table: TableName, cfg: SurfaceCfg, limit: number): Promise<any[]> {
  if (table === 'contacts') {
    const { data, error } = await sb.from('contacts').select(cfg.selectCols).limit(limit)
    if (error) throw new Error(error.message)
    return (data || []).filter((c: any) =>
      c.triage_status !== 'skipped' &&
      (c.consent_tier === 'warm' || c.consent_tier === 'customer' || (c.heat_score ?? 0) >= 75))
  }
  let q = sb.from(table).select(cfg.selectCols).in(cfg.statusCol, cfg.eligible).limit(limit)
  q = q.is('buried_at', null).is('protected_at', null)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

function droppable(cfg: SurfaceCfg, r: any): boolean {
  if (cfg.guarded(r)) return false
  if (cfg.hasOrigin && r.origin && r.origin !== 'agent') return false
  return true
}

export interface SweepArgs {
  table: TableName
  dry: boolean
  target: number
  limit: number
  relevance: boolean | null
  minConfidence: number
}

export interface SweepSample {
  id: string
  title: string
  reason_code: string
  rationale: string
  sweep: 'relevance' | 'volume_trim'
  verdict?: string
  vertical?: string | null
  confidence?: number
}

export interface SweepReport {
  table: TableName
  loaded: number
  protected: number
  relevance: {
    ran: boolean
    off_vertical: number
    too_technical: number
    by_vertical: Record<string, number>
  }
  trim: number
  total_dropped: number
  remaining: number
  target: number
  sample: SweepSample[]
  committed: boolean
  feedback_inserted: number
}

/** The core sweep logic, shared by the HTTP endpoint and the CLI script.
 *
 *  - Loads active triage rows for the surface (same filters the deck uses).
 *  - Runs the relevance classifier (Haiku) on droppable rows.
 *  - Marks off-vertical / too-technical drops above min confidence.
 *  - Trims the worst-scoring survivors until the deck is at target.
 *  - On commit: writes terminal state + feedback_queue vote=-1 (the same two
 *    writes /api/triage/reject does), routing the drop through Vera's loop.
 *
 *  Idempotent: re-running on a deck that's already at target with no off-vertical
 *  cards left writes nothing. */
export async function runRelevanceSweep(
  sb: SupabaseClient,
  args: SweepArgs,
  anthropicKey: string,
): Promise<SweepReport> {
  const cfg = SURFACES[args.table]
  if (!cfg) throw new Error(`Unknown table: ${args.table}`)

  const rows = await loadRows(sb, args.table, cfg, args.limit)
  const candidates = rows.filter(r => droppable(cfg, r))
  const lockedCount = rows.length - candidates.length

  const dropById = new Map<string, Drop>()
  const byVertical: Record<string, number> = {}
  const doRelevance = args.relevance ?? cfg.relevanceDefault
  let offVertical = 0, tooTechnical = 0, relevanceRan = false

  // ── 1. Relevance pass ──────────────────────────────────────────────────
  if (doRelevance && anthropicKey && candidates.length) {
    relevanceRan = true
    const verdicts = await classifyRelevance(candidates.map(cfg.classifyOf), {
      apiKey: anthropicKey,
      surface: cfg.kind,
      mutedVerticals: DEFAULT_MUTED_VERTICALS,
    })
    const byId = new Map(candidates.map(r => [r.id, r]))
    for (const v of verdicts) {
      if (v.verdict === 'keep' || v.confidence < args.minConfidence) continue
      const r = byId.get(v.id); if (!r) continue
      dropById.set(v.id, {
        id: v.id,
        reason_code: relevanceReasonCode(cfg.prefix, v.verdict),
        rationale: v.rationale,
        agent: cfg.agentOf(r),
        meta: { auto_swept: true, sweep: 'relevance', verdict: v.verdict, vertical: v.vertical, confidence: v.confidence },
      })
      if (v.verdict === 'too_technical') tooTechnical++
      else {
        offVertical++
        if (v.vertical) byVertical[v.vertical] = (byVertical[v.vertical] || 0) + 1
      }
    }
  }

  // ── 2. Trim pass — bring the surface down to target ─────────────────────
  const surviving = candidates.filter(r => !dropById.has(r.id))
  const remainingAfterRelevance = rows.length - dropById.size
  let trimmed = 0
  if (remainingAfterRelevance > args.target) {
    const overflow = remainingAfterRelevance - args.target
    const ranked = surviving.slice().sort((a, b) => cfg.scoreOf(a) - cfg.scoreOf(b))
    for (const r of ranked.slice(0, overflow)) {
      dropById.set(r.id, {
        id: r.id,
        reason_code: cfg.trimReason,
        rationale: `bottom of queue (score ${Math.round(cfg.scoreOf(r))})`,
        agent: cfg.agentOf(r),
        meta: { auto_swept: true, sweep: 'volume_trim', score: Math.round(cfg.scoreOf(r)) },
      })
      trimmed++
    }
  }

  const drops = Array.from(dropById.values())
  const rowById = new Map(rows.map(r => [r.id, r]))
  const sample: SweepSample[] = drops.slice(0, 25).map(d => {
    const r = rowById.get(d.id) || {}
    const meta = d.meta as any
    return {
      id: d.id,
      title: cfg.titleOf(r),
      reason_code: d.reason_code,
      rationale: d.rationale,
      sweep: meta.sweep,
      verdict: meta.verdict,
      vertical: meta.vertical ?? null,
      confidence: meta.confidence,
    }
  })

  const report: SweepReport = {
    table: args.table,
    loaded: rows.length,
    protected: lockedCount,
    relevance: { ran: relevanceRan, off_vertical: offVertical, too_technical: tooTechnical, by_vertical: byVertical },
    trim: trimmed,
    total_dropped: drops.length,
    remaining: rows.length - drops.length,
    target: args.target,
    sample,
    committed: false,
    feedback_inserted: 0,
  }

  if (args.dry || !drops.length) return report

  // ── 3. Commit — replay /api/triage/reject for every drop ────────────────
  const ids = drops.map(d => d.id)
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200)
    const { error } = await sb.from(args.table).update(cfg.dropPayload()).in('id', slice)
    if (error) throw new Error(`state update failed: ${error.message}`)
  }
  const fb = drops.map(d => ({
    source_table: args.table,
    source_id: d.id,
    agent_id: d.agent,
    original_agent: d.agent,
    original_item_id: d.id,
    vote: -1,
    reason_code: d.reason_code,
    reason_text: d.rationale || null,
    meta: d.meta,
    status: 'pending',
  }))
  for (let i = 0; i < fb.length; i += 200) {
    const { error } = await sb.from('feedback_queue').insert(fb.slice(i, i + 200))
    if (error) throw new Error(`feedback insert failed: ${error.message}`)
  }
  report.committed = true
  report.feedback_inserted = fb.length
  return report
}
