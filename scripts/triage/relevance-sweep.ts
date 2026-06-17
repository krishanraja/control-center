#!/usr/bin/env -S npx tsx
// Triage relevance sweep — clears off-vertical / too-technical cards and trims
// every triage surface down to a target size, routing each drop through the
// SAME -1 feedback path a manual swipe uses so Vera learns the pattern.
//
// Usage:
//   npx tsx scripts/triage/relevance-sweep.ts --table content_ideas [--dry] [--commit]
//                                              [--target 30] [--limit 5000]
//                                              [--relevance] [--no-relevance]
//                                              [--min-confidence 0.7]
//
// What it does (per the 2026-06-17 policy):
//   1. Loads the active triage rows for the surface (the same statuses the deck
//      shows), agent-origin only — Krish's hand-captured cards are never touched.
//   2. RELEVANCE pass (content_ideas by default; other surfaces with --relevance):
//      classifies each card via Claude Haiku (api/_relevance.ts) and drops the
//      ones that are off-vertical (finance/tax/law/crypto/healthcare/climate/
//      real-estate/geopolitics on their own terms, no AI angle) or too-technical
//      (AWS/infra/devops with no strategic angle), at >= min confidence.
//   3. TRIM pass: if the surface is still over --target, drops the lowest-scoring
//      remaining cards (grader math: brand-fit / fit / relevance / heat) until
//      it's at the target. Guarded rows (in-progress, near-deadline, customers)
//      are never dropped.
//   4. Each drop sets the surface's terminal state (identical to /api/triage/reject)
//      AND writes a feedback_queue vote=-1 with a reason_code, so Vera's weekly
//      aggregation clusters the pattern and proposes a brief edit for the agent.
//
// Default is --dry: prints what WOULD happen, writes nothing. Re-run with
// --commit to apply. Dedup is handled separately by scripts/dedup/backfill.ts;
// run that first so the sweep doesn't waste classifier calls on duplicates.

import { createClient } from '@supabase/supabase-js'
import { classifyRelevance, relevanceReasonCode, DEFAULT_MUTED_VERTICALS, type RelevanceItem } from '../../api/_relevance'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPA_URL, SUPA_KEY)

type TableName = 'content_ideas' | 'leads' | 'guests' | 'visibility_targets' | 'contacts'

interface Args {
  table: TableName
  dry: boolean
  target: number
  limit: number
  relevance: boolean | null   // null = use the surface default
  minConfidence: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  let table: TableName = 'content_ideas'
  let dry = true
  let target = 30
  let limit = 5000
  let relevance: boolean | null = null
  let minConfidence = 0.7
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--table' && a[i + 1]) table = a[++i] as TableName
    else if (a[i] === '--dry') dry = true
    else if (a[i] === '--commit') dry = false
    else if (a[i] === '--target' && a[i + 1]) target = parseInt(a[++i], 10) || 30
    else if (a[i] === '--limit' && a[i + 1]) limit = parseInt(a[++i], 10) || 5000
    else if (a[i] === '--relevance') relevance = true
    else if (a[i] === '--no-relevance') relevance = false
    else if (a[i] === '--min-confidence' && a[i + 1]) minConfidence = parseFloat(a[++i]) || 0.7
  }
  return { table, dry, target, limit, relevance, minConfidence }
}

// ── grader math (mirrors api/_grader.ts; inlined so this script has no
// _supabase.js import chain) ────────────────────────────────────────────────
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

interface SurfaceCfg {
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

const SURFACES: Record<TableName, SurfaceCfg> = {
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

async function loadRows(table: TableName, cfg: SurfaceCfg, limit: number): Promise<any[]> {
  if (table === 'contacts') {
    // Warm queue: consent warm/customer OR heat >= 75, not already skipped.
    const { data, error } = await sb.from('contacts').select(cfg.selectCols).limit(limit)
    if (error) { console.error(error.message); process.exit(1) }
    return (data || []).filter((c: any) =>
      c.triage_status !== 'skipped' &&
      (c.consent_tier === 'warm' || c.consent_tier === 'customer' || (c.heat_score ?? 0) >= 75))
  }
  let q = sb.from(table).select(cfg.selectCols).in(cfg.statusCol, cfg.eligible).limit(limit)
  // Mirror the deck filters: never surface buried / protected rows.
  q = q.is('buried_at', null).is('protected_at', null)
  const { data, error } = await q
  if (error) { console.error(error.message); process.exit(1) }
  return data || []
}

/** A row is droppable if it isn't guarded and (where the column exists) is
 *  agent-origin — Krish's own captures are off-limits to the auto sweep. */
function droppable(cfg: SurfaceCfg, r: any): boolean {
  if (cfg.guarded(r)) return false
  if (cfg.hasOrigin && r.origin && r.origin !== 'agent') return false
  return true
}

async function run() {
  const args = parseArgs()
  const cfg = SURFACES[args.table]
  if (!cfg) { console.error(`Unknown table: ${args.table}`); process.exit(1) }
  console.log(`\n— Relevance sweep: ${args.table} ${args.dry ? '(dry run)' : '(COMMIT)'} · target ${args.target} —`)

  const rows = await loadRows(args.table, cfg, args.limit)
  console.log(`Loaded ${rows.length} active triage rows.`)
  const candidates = rows.filter(r => droppable(cfg, r))
  const lockedCount = rows.length - candidates.length
  if (lockedCount) console.log(`(${lockedCount} are in-progress / Krish-authored / customers — protected, never auto-dropped.)`)

  const dropById = new Map<string, Drop>()
  const doRelevance = args.relevance ?? cfg.relevanceDefault

  // ── 1. Relevance pass ──────────────────────────────────────────────────
  let offVertical = 0, tooTechnical = 0
  if (doRelevance) {
    if (!ANTHROPIC_KEY) {
      console.log('ANTHROPIC_API_KEY not set — skipping relevance pass.')
    } else {
      console.log(`Classifying ${candidates.length} cards for relevance (Haiku)…`)
      const verdicts = await classifyRelevance(candidates.map(cfg.classifyOf), {
        apiKey: ANTHROPIC_KEY,
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
        if (v.verdict === 'too_technical') tooTechnical++; else offVertical++
      }
    }
  }

  // ── 2. Trim pass — bring the surface down to --target ───────────────────
  const surviving = candidates.filter(r => !dropById.has(r.id))
  // Everything that will remain in the deck after relevance: survivors +
  // protected rows (guarded / Krish-authored still show in triage).
  const remainingAfterRelevance = rows.length - dropById.size
  let trimmed = 0
  if (remainingAfterRelevance > args.target) {
    const overflow = remainingAfterRelevance - args.target
    const ranked = surviving.slice().sort((a, b) => cfg.scoreOf(a) - cfg.scoreOf(b)) // worst first
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

  // ── 3. Report ──────────────────────────────────────────────────────────
  const drops = Array.from(dropById.values())
  const finalRemaining = rows.length - drops.length
  console.log(`\nRelevance: ${offVertical} off-vertical, ${tooTechnical} too-technical.`)
  console.log(`Trim: ${trimmed} lowest-scoring cards.`)
  console.log(`Total to drop: ${drops.length}.  Deck after sweep: ${finalRemaining} (target ${args.target}).`)
  if (finalRemaining > args.target && lockedCount > 0) {
    console.log(`Note: still above target because ${lockedCount} protected rows can't be auto-dropped.`)
  }
  console.log('')
  for (const d of drops.slice(0, 25)) {
    const r = rows.find(x => x.id === d.id)
    console.log(`  drop [${d.reason_code}] ${cfg.titleOf(r)}  — ${d.rationale}`)
  }
  if (drops.length > 25) console.log(`  …and ${drops.length - 25} more.`)

  if (args.dry) { console.log(`\nDry run. Re-run with --commit to apply.\n`); return }
  if (!drops.length) { console.log(`\nNothing to drop. Done.\n`); return }

  // ── 4. Commit — replicate /api/triage/reject for every dropped row ──────
  const ids = drops.map(d => d.id)
  // Terminal state (uniform per surface).
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200)
    const { error } = await sb.from(args.table).update(cfg.dropPayload()).in('id', slice)
    if (error) { console.error(`state update failed: ${error.message}`); process.exit(1) }
  }
  // feedback_queue vote=-1 (Vera learning loop).
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
    if (error) { console.error(`feedback insert failed: ${error.message}`); process.exit(1) }
  }
  console.log(`\nDropped ${drops.length} rows and wrote ${fb.length} feedback votes. Vera will cluster these on its next run. Done.\n`)
}

run().catch(e => { console.error(e); process.exit(1) })
