import { recordSuggestions, recordVerdict, describeDbError, type BankDb, type VerdictInput, type RecordVerdictResult } from './_suggestions.js'

/**
 * Promotion on evidence (ADR-030, phase 4 of the data-to-action audit).
 *
 * The ladder (migration 20260919100000) has promote_after and
 * demote_below_rate, and nothing ran them: every surface sat at propose. The
 * mechanism the migration described is the one here: the machine PROPOSES a
 * rung change on the `autonomy_promotion` surface, Krish rules on it in OS >
 * Org, and the verdict applies it. Nothing here moves a rung on its own.
 *
 * The rungs it may propose are propose and assist. There is no code path in
 * this file that writes the word autonomous (tests/api/autonomyReview.test.ts
 * asserts it for every input): nothing that touches a wall (send, post,
 * spend, delete, permission) is ever autonomous, and `max_rung` on the ladder
 * (default assist, raised only by a migration) is the ceiling a verdict may
 * move a surface to.
 */

export type Rung = 'propose' | 'assist' | 'autonomous'
/** Where a proposal may go. Never the third rung. */
export type ProposableRung = 'propose' | 'assist'

export const RUNG_RANK: Record<Rung, number> = { propose: 1, assist: 2, autonomous: 3 }
export const PROMOTION_SURFACE = 'autonomy_promotion'
export const REVIEW_AGENT = 'autonomy-review'

export function isRung(v: unknown): v is Rung {
  return v === 'propose' || v === 'assist' || v === 'autonomous'
}

/** A verdict may move a surface up to and including its ceiling. */
export function withinCeiling(to: Rung, maxRung: Rung | null | undefined): boolean {
  return RUNG_RANK[to] <= RUNG_RANK[maxRung ?? 'assist']
}

/** One row of the autonomy_evidence view, with the ladder's ceiling beside it. */
export interface EvidenceRow {
  surface: string
  rung: string
  max_rung?: string | null
  promote_after: number
  demote_below_rate: number | string
  verdicts_ruled: number
  clean_accepts: number
  clean_rate: number | string | null
  last_verdict_at?: string | null
}

export interface LadderMove {
  surface: string
  from: ProposableRung
  to: ProposableRung
  /** The evidence sentence, written for Krish. */
  reason: string
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? NaN)
  return Number.isFinite(n) ? n : 0
}

const words = (surface: string, labels: Record<string, string>): string =>
  (labels[surface] ?? surface.replace(/_/g, ' ')).trim()

/**
 * What the evidence says should move, and nothing else. Pure.
 *
 * Up, propose to assist: at least promote_after clean accepts at or above
 * demote_below_rate, within the ceiling. Down, assist to propose: at least
 * promote_after ruled verdicts and a clean rate below the line. A surface
 * with a proposal still waiting on him is left alone, and the promotion
 * surface never proposes its own promotion.
 */
export function proposeLadderMoves(
  evidence: EvidenceRow[],
  pending: ReadonlySet<string>,
  labels: Record<string, string> = {},
): LadderMove[] {
  const out: LadderMove[] = []
  for (const e of evidence) {
    if (e.surface === PROMOTION_SURFACE || pending.has(e.surface)) continue
    if (!isRung(e.rung) || e.rung === 'autonomous') continue
    const ruled = num(e.verdicts_ruled)
    const clean = num(e.clean_accepts)
    const rate = e.clean_rate == null ? null : num(e.clean_rate)
    const need = Math.max(5, num(e.promote_after) || 20)
    const line = num(e.demote_below_rate) || 0.6
    const label = words(e.surface, labels)
    const since = e.last_verdict_at ? ` up to ${String(e.last_verdict_at).slice(0, 10)}` : ''
    const max = isRung(e.max_rung) ? e.max_rung : 'assist'

    if (e.rung === 'propose' && clean >= need && rate !== null && rate >= line && withinCeiling('assist', max)) {
      out.push({
        surface: e.surface, from: 'propose', to: 'assist',
        reason: `${clean} of ${ruled} ruled ${label} taken as proposed${since}, at or above ${Math.round(line * 100)}%. Assist means the work arrives prepared; nothing leaves the building.`,
      })
    } else if (e.rung === 'assist' && ruled >= need && rate !== null && rate < line) {
      out.push({
        surface: e.surface, from: 'assist', to: 'propose',
        reason: `${clean} of ${ruled} ruled ${label} taken as proposed${since}, below the ${Math.round(line * 100)}% it was promoted on. Back to proposing until the evidence turns.`,
      })
    }
  }
  return out
}

// ── The database half ────────────────────────────────────────────────────────

async function defaultDb(): Promise<BankDb> {
  const { supabase } = await import('./_supabase.js')
  return supabase as unknown as BankDb
}

/** The evidence view, with each surface's ceiling and label. */
export async function loadEvidence(db?: BankDb): Promise<{ evidence: EvidenceRow[]; labels: Record<string, string> }> {
  const client = db ?? await defaultDb()
  const [ev, ladder, surfaces] = await Promise.all([
    client.from('autonomy_evidence').select('*'),
    client.from('autonomy_ladder').select('surface, max_rung'),
    client.from('suggestion_surfaces').select('slug, label'),
  ])
  if (ev.error) throw new Error(describeDbError(ev.error))
  const ceilings = new Map<string, string | null>()
  for (const r of ((ladder.data || []) as Array<{ surface: string; max_rung: string | null }>)) ceilings.set(r.surface, r.max_rung)
  const labels: Record<string, string> = {}
  for (const r of ((surfaces.data || []) as Array<{ slug: string; label: string }>)) labels[r.slug] = r.label
  const evidence = ((ev.data || []) as EvidenceRow[]).map(e => ({ ...e, max_rung: ceilings.get(e.surface) ?? e.max_rung ?? null }))
  return { evidence, labels }
}

export interface PendingPromotion {
  id: string
  surface: string
  label: string
  from: ProposableRung
  to: ProposableRung
  reason: string
  created_at: string
}

/** Promotion proposals with no verdict yet, newest first. */
export async function loadPendingPromotions(db?: BankDb, labels: Record<string, string> = {}): Promise<PendingPromotion[]> {
  const client = db ?? await defaultDb()
  const { data, error } = await client.from('suggestions')
    .select('id, subject_id, proposed, reason, created_at')
    .eq('surface', PROMOTION_SURFACE)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(describeDbError(error))
  const rows = (data || []) as Array<{ id: string; subject_id: string; proposed: unknown; reason: string; created_at: string }>
  if (!rows.length) return []
  const { data: verdicts } = await client.from('suggestion_verdicts').select('suggestion_id').in('suggestion_id', rows.map(r => r.id))
  const answered = new Set(((verdicts || []) as Array<{ suggestion_id: string }>).map(v => v.suggestion_id))
  const out: PendingPromotion[] = []
  for (const r of rows) {
    if (answered.has(r.id)) continue
    const p = (r.proposed && typeof r.proposed === 'object' ? r.proposed : {}) as { surface?: unknown; from?: unknown; to?: unknown }
    const from = p.from, to = p.to
    if ((from !== 'propose' && from !== 'assist') || (to !== 'propose' && to !== 'assist')) continue
    out.push({ id: r.id, surface: r.subject_id, label: words(r.subject_id, labels), from, to, reason: r.reason, created_at: r.created_at })
  }
  return out
}

/** Write one proposal per move, as suggestions on the promotion surface. */
export async function writeLadderProposals(moves: LadderMove[], db?: BankDb): Promise<{ ok: true; ids: string[] } | { ok: false; reason: string }> {
  return recordSuggestions(moves.map(m => ({
    surface: PROMOTION_SURFACE,
    subject_table: 'autonomy_ladder',
    subject_id: m.surface,
    proposed: { surface: m.surface, from: m.from, to: m.to },
    reason: m.reason,
    producer: { agent: REVIEW_AGENT },
    autonomy_rung: 'propose',
  })), db)
}

export type PromotionRuling =
  | { kind: 'not_promotion' }
  | { kind: 'promotion'; result: RecordVerdictResult; applied: boolean }

/**
 * Rule on a promotion proposal. Accepted moves the ladder, never past the
 * surface's ceiling, and the refusal comes BEFORE the verdict is written so
 * the bank never holds an accept that did not apply. Rejected is recorded and
 * the ladder stays. Anything that is not a promotion is left to the caller.
 */
export async function rulePromotion(v: VerdictInput, db?: BankDb): Promise<PromotionRuling> {
  const client = db ?? await defaultDb()
  const { data: s, error } = await client.from('suggestions').select('id, surface, subject_id, proposed, reason').eq('id', v.suggestion_id).maybeSingle()
  if (error) return { kind: 'promotion', result: { ok: false, status: 500, reason: describeDbError(error) }, applied: false }
  const row = s as { surface?: string; subject_id?: string; proposed?: unknown; reason?: string } | null
  if (!row || row.surface !== PROMOTION_SURFACE) return { kind: 'not_promotion' }

  const p = (row.proposed && typeof row.proposed === 'object' ? row.proposed : {}) as { to?: unknown; from?: unknown }
  const to = p.to
  if (to !== 'propose' && to !== 'assist') {
    return { kind: 'promotion', result: { ok: false, status: 400, reason: 'promotion_malformed' }, applied: false }
  }

  if (v.verdict === 'accepted') {
    const { data: l } = await client.from('autonomy_ladder').select('surface, rung, max_rung').eq('surface', row.subject_id).maybeSingle()
    const ladder = l as { rung?: string; max_rung?: string | null } | null
    if (!ladder) return { kind: 'promotion', result: { ok: false, status: 404, reason: 'ladder_row_not_found' }, applied: false }
    if (!withinCeiling(to, isRung(ladder.max_rung) ? ladder.max_rung : 'assist')) {
      return { kind: 'promotion', result: { ok: false, status: 403, reason: `above_max_rung:${ladder.max_rung ?? 'assist'}` }, applied: false }
    }
    const result = await recordVerdict(v, [PROMOTION_SURFACE], client)
    if (!result.ok) return { kind: 'promotion', result, applied: false }
    const { error: uErr } = await client.from('autonomy_ladder').update({
      rung: to,
      last_change_at: new Date().toISOString(),
      last_change_reason: (row.reason || '').slice(0, 500),
      changed_by: v.actor ?? 'krish',
      updated_at: new Date().toISOString(),
    }).eq('surface', row.subject_id)
    if (uErr) return { kind: 'promotion', result: { ok: false, status: 500, reason: `verdict_written_ladder_not_moved: ${describeDbError(uErr)}` }, applied: false }
    return { kind: 'promotion', result, applied: true }
  }

  const result = await recordVerdict(v, [PROMOTION_SURFACE], client)
  return { kind: 'promotion', result, applied: false }
}
