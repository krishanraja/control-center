import { supabase } from './_supabase.js'

/**
 * Shared deterministic grader used by the backburner sweep
 * (api/triage/sweep) and the calibration endpoint (api/triage/calibrate).
 * One feature mapping feeds scoring, calibration profiles, and the
 * learning pass, so a weight fitted from calibration means exactly what
 * the sweep multiplies against.
 */

export type Table = 'tasks' | 'guests' | 'leads' | 'visibility_targets' | 'content_ideas'
export const TABLES: Table[] = ['tasks', 'guests', 'leads', 'visibility_targets', 'content_ideas']

export const DOMAIN_OF: Record<Table, string> = {
  tasks: 'task',
  guests: 'guest',
  leads: 'lead',
  visibility_targets: 'visibility',
  content_ideas: 'content',
}

export const TABLE_OF_DOMAIN: Record<string, Table> = Object.fromEntries(
  Object.entries(DOMAIN_OF).map(([t, d]) => [d, t as Table]),
) as Record<string, Table>

// Coefficients are multiplied with the (defaulted) raw feature to produce
// score points on a 0-100 scale. idle is a fixed penalty, not learned.
export const DEFAULT_WEIGHTS: Record<Table, Record<string, number>> = {
  tasks: { lever: 10, priority_high: 15, due_soon: 30 },
  guests: { fit: 6, attainability: 2, quality: 1 },
  leads: { quality: 3, fit: 4 },
  visibility_targets: { relevance: 8, quality: 1, deadline_soon: 25 },
  content_ideas: { confidence: 35, brand_fit: 4.5, quality: 1 },
}

// bury_below is a floor; when a table has >= adaptive_min_eligible items the
// effective cutoff rises to the adaptive_percentile of that table's eligible
// scores, so the sweep always trims the genuinely-worst tail of a big queue
// (verified against prod data 2026-06-12: scores cluster 40-90, a fixed 35
// would bury almost nothing while the queues sit at 200+). max_per_sweep
// bounds the nightly blast radius.
export const DEFAULT_THRESHOLDS = {
  bury_below: 35,
  min_idle_days: 10,
  adaptive_percentile: 0.25,
  adaptive_min_eligible: 50,
  max_per_sweep: 50,
}

const DAY_MS = 24 * 60 * 60 * 1000

export function q(quality: string | null | undefined): number {
  if (quality === 'green') return 20
  if (quality === 'amber') return 10
  if (quality === 'red') return 0
  return 8
}

// Queue age, anchored on creation. Deliberately NOT updated_at: enrichment
// sweeps and autoscore passes bump updated_at constantly (prod max
// "idle-by-updated_at" was 9.7d while items had sat unactioned for months),
// so agent touches must not reset the clock. Krish touches are covered by
// the guards (krish_notes, status moves, protected_at).
export function idleDays(row: any): number {
  const ref = row.created_at || row.created || row.updated_at
  if (!ref) return 0
  const ms = Date.now() - new Date(ref).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms / DAY_MS : 0
}

export function within(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t < Date.now() + days * DAY_MS
}

// Raw features per row, in the same shape the weights multiply against.
export function features(table: Table, row: any): Record<string, number> {
  switch (table) {
    case 'tasks':
      return {
        lever: row.lever_score ?? 4,
        priority_high: row.priority === 'high' ? 1 : 0,
        due_soon: within(row.due_date, 7) ? 1 : 0,
      }
    case 'guests':
      return { fit: row.fit_score ?? 5, attainability: row.attainability_score ?? 5, quality: q(row.quality_score) }
    case 'leads':
      return { quality: q(row.quality_score), fit: row.fit_score ?? 5 }
    case 'visibility_targets':
      return {
        relevance: row.relevance_score ?? 4,
        quality: q(row.quality_score),
        deadline_soon: within(row.deadline_at, 14) ? 1 : 0,
      }
    case 'content_ideas':
      return { confidence: row.confidence ?? 0.4, brand_fit: row.brand_fit_score ?? 5, quality: q(row.quality_score) }
  }
}

export function idlePenalty(table: Table, idle: number): number {
  if (table === 'tasks') return Math.min(30, idle)
  return Math.min(25, idle / 2)
}

export function score(table: Table, row: any, weights: Record<string, number>): number {
  const f = features(table, row)
  let s = 0
  for (const k of Object.keys(f)) s += (weights[k] ?? DEFAULT_WEIGHTS[table][k] ?? 0) * f[k]
  return s - idlePenalty(table, idleDays(row))
}

// Rows the sweep must never bury regardless of score: progress has been made
// or there is real urgency.
export function guarded(table: Table, row: any): boolean {
  switch (table) {
    case 'tasks':
      return row.status === 'in_progress' || within(row.due_date, 14) || !!row.krish_notes
    case 'guests':
      return ['responded', 'scheduled', 'confirmed', 'recorded', 'published'].includes(row.status)
    case 'leads':
      return ['contacted', 'conversation'].includes(row.status) || !!row.promoted_task_id
    case 'visibility_targets':
      return within(row.deadline_at, 21)
    case 'content_ideas':
      return ['drafting', 'review', 'approved'].includes(row.state)
  }
}

// Only statuses that actually surface in queues are sweep-eligible.
export const ELIGIBLE_STATUS: Record<Table, { col: string; values: string[] }> = {
  tasks: { col: 'status', values: ['waiting', 'new', 'blocked', 'active'] },
  guests: { col: 'status', values: ['scouted', 'enriched', 'researched', 'pitched'] },
  leads: { col: 'status', values: ['new', 'ready'] },
  visibility_targets: { col: 'status', values: ['sourced', 'queued'] },
  content_ideas: { col: 'state', values: ['seeded', 'researching'] },
}

export const SELECT_COLS: Record<Table, string> = {
  tasks: 'id, title, status, priority, due_date, lever_score, krish_notes, updated_at, created',
  guests: 'id, name, status, fit_score, attainability_score, quality_score, updated_at, created_at',
  leads: 'id, full_name, company, status, fit_score, quality_score, promoted_task_id, updated_at, created_at',
  visibility_targets: 'id, title, status, relevance_score, quality_score, deadline_at, updated_at, created_at',
  content_ideas: 'id, idea, state, confidence, brand_fit_score, quality_score, updated_at, created_at',
}

export function titleOf(table: Table, row: any): string {
  if (table === 'tasks') return row.title || '(untitled)'
  if (table === 'guests') return row.name || '(unnamed)'
  if (table === 'leads') return [row.full_name, row.company].filter(Boolean).join(' · ') || '(unnamed)'
  if (table === 'visibility_targets') return row.title || '(untitled)'
  return row.idea ? String(row.idea).slice(0, 80) : '(untitled)'
}

export function reasonOf(table: Table, row: any, s: number): string {
  const age = Math.round(idleDays(row))
  const bits: string[] = []
  const f = features(table, row)
  if ('fit' in f) bits.push(`fit ${f.fit}/10`)
  if ('lever' in f) bits.push(`lever ${f.lever}/10`)
  if ('relevance' in f) bits.push(`relevance ${f.relevance}/10`)
  if ('confidence' in f) bits.push(`confidence ${Math.round(f.confidence * 100)}%`)
  if ('brand_fit' in f) bits.push(`brand fit ${f.brand_fit}/10`)
  if (row.quality_score) bits.push(`${row.quality_score} quality`)
  bits.push(`in queue ${age}d`)
  return `${bits.join(', ')} (score ${Math.round(s)}, bottom of its queue)`
}

function parseVal(v: unknown): any {
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
  return v
}

export async function loadConfig(keys: string[]): Promise<Record<string, any>> {
  const { data } = await supabase.from('system_config').select('key,value').in('key', keys)
  const out: Record<string, any> = {}
  for (const r of data || []) out[(r as any).key] = parseVal((r as any).value)
  return out
}

export async function saveConfig(key: string, value: unknown) {
  await supabase.from('system_config').upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() })
}

export async function loadWeights(): Promise<{ weights: Record<Table, Record<string, number>>; thresholds: typeof DEFAULT_THRESHOLDS }> {
  const keys = TABLES.map(t => `grader_weights_${DOMAIN_OF[t]}`).concat(['grader_thresholds'])
  const cfg = await loadConfig(keys)
  const weights = {} as Record<Table, Record<string, number>>
  for (const t of TABLES) {
    const stored = cfg[`grader_weights_${DOMAIN_OF[t]}`]
    weights[t] = stored && typeof stored === 'object' ? { ...DEFAULT_WEIGHTS[t], ...stored } : { ...DEFAULT_WEIGHTS[t] }
  }
  const th = cfg['grader_thresholds']
  const thresholds = th && typeof th === 'object' ? { ...DEFAULT_THRESHOLDS, ...th } : { ...DEFAULT_THRESHOLDS }
  return { weights, thresholds }
}

export async function fetchEligible(table: Table, limit = 2000): Promise<any[]> {
  const st = ELIGIBLE_STATUS[table]
  const { data, error } = await supabase
    .from(table)
    .select(SELECT_COLS[table])
    .eq('origin', 'agent')
    .is('buried_at', null)
    .is('protected_at', null)
    .in(st.col, st.values)
    .limit(limit)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data || []
}
