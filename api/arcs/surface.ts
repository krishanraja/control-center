import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson } from '../_content.js'
import { isoWeekLabel } from '../_weeks.js'
import { buildComposePrompt, buildRepairPrompt, parseComposed, type ComposableArc, type ComposedCard } from '../_compose.js'
import { scoreArc, surface, surfacingReason, VISIBLE_SLOTS, RESERVED_FOR_UNTHEMED,
  MIN_INDEPENDENT_BEATS, type Arc } from '../_arcScore.js'
import { lintCard } from '../_cardLint.js'
import type { Lens, Channel } from '../_lenses.js'

// The step between "the detector found arcs" and "Krish sees seven cards".
//
// It did not exist. api/_cardLint.ts could judge a card, api/_arcScore.ts could
// score one and pick seven, and nothing built one, so the Content tab was still
// served entirely by the old content_decisions path while the whole rewrite sat
// beside it unused.
//
// Order matters and is the opposite of the obvious one. Cheap structural blocks
// run FIRST, before any model call, because composing a card for an arc that
// cannot surface costs a request and produces nothing. Only survivors get
// composed, then linted, then scored, then surfaced.
//
// Every candidate is written to arc_cards including the ones that lose, with
// the reason. A week where nothing surfaces must be distinguishable from a week
// where the job did not run, and "why is this not in my queue" must have an
// answer. The previous engine had neither, which is how it produced 54
// proposals and zero explanations.
//
//   GET (CRON_SECRET) — after detect on Friday   ·   POST — manual

/** Compositions per run. Each is one model call, and the cap exists so a large
 *  backlog cannot blow maxDuration. Anything dropped is REPORTED, never silent:
 *  a truncated run that looks complete is how a queue goes quietly wrong. */
const MAX_COMPOSE = 20

/** Repair passes per card. Two, not one: the failures are usually banned words
 *  in the claim, and a single pass tends to swap one for another. Measured on a
 *  live run, where a repair removed "token" and introduced "agentic". Each pass
 *  must strictly reduce the failure count, so this converges or stops. */
const MAX_REPAIRS = 2

interface Row {
  id: string; title: string; summary: string | null; implication: string | null
  lens: Lens | null; lane: Channel | null; theme_id: string | null
  plausible_new_theme: boolean | null; arc_state: string | null
}

export async function runSurface(opts: { week?: string; max?: number } = {}) {
  const week = opts.week || isoWeekLabel()
  const max = opts.max ?? MAX_COMPOSE

  const { data: arcRows, error } = await supabase
    .from('shifts')
    .select('id, title, summary, implication, lens, lane, theme_id, plausible_new_theme, arc_state')
    .is('superseded_by', null)
    .not('lens', 'is', null)
    .neq('status', 'retired')
    .limit(200)
  if (error) throw new Error(error.message)
  const arcs = (arcRows || []) as Row[]
  if (!arcs.length) return { week, candidates: 0, skipped: 'no classified arcs. Run the classifier first' }

  // ── beats, and the independence count the scorer actually reads ──────────
  const { data: beatRows } = await supabase
    .from('shift_beats')
    .select('shift_id, occurred_on, what_changed, origin_key, source_tier')
    .in('shift_id', arcs.map(a => a.id))
    .order('occurred_on', { ascending: false })
    .limit(4000)
  const beatsBy = new Map<string, Array<{ occurred_on: string; what_changed: string; origin_key: string | null; source_tier: string | null }>>()
  for (const b of beatRows || []) {
    const l = beatsBy.get(b.shift_id) || []
    l.push(b as any)
    beatsBy.set(b.shift_id, l)
  }
  // Same definition as arc_independent_beats(): distinct origin, not story count.
  const independence = (id: string) => {
    const l = beatsBy.get(id) || []
    return {
      independent: new Set(l.map(b => b.origin_key || b.what_changed)).size,
      primary: l.filter(b => b.source_tier === 'primary').length,
    }
  }

  // ── cheap blocks first, before spending a model call ─────────────────────
  const eligible: Row[] = []
  const preBlocked: Array<{ row: Row; blocks: string[] }> = []
  for (const a of arcs) {
    const { independent } = independence(a.id)
    const blocks: string[] = []
    if (independent < MIN_INDEPENDENT_BEATS) {
      blocks.push(`${independent} independent beat${independent === 1 ? '' : 's'}, needs ${MIN_INDEPENDENT_BEATS}. A single event is evidence for an arc, not an arc`)
    }
    if (!a.lens) blocks.push('no lens')
    if (!a.lane) blocks.push('no channel')
    if (!a.theme_id && !a.plausible_new_theme) {
      blocks.push('no tracked folder and no plausible new one')
    }
    if (blocks.length) preBlocked.push({ row: a, blocks })
    else eligible.push(a)
  }

  // Most evidence first, so the cap drops the thinnest arcs rather than a
  // random slice of them.
  eligible.sort((x, y) => independence(y.id).independent - independence(x.id).independent)
  const toCompose = eligible.slice(0, max)
  const deferred = eligible.slice(max)

  // ── folder questions, as context for the composer only ───────────────────
  const themeIds = [...new Set(toCompose.map(a => a.theme_id).filter(Boolean))] as string[]
  const questions = new Map<string, string>()
  if (themeIds.length) {
    const { data } = await supabase.from('content_themes').select('id, question').in('id', themeIds)
    for (const t of data || []) questions.set(t.id, t.question)
  }

  // ── compose, lint, score ─────────────────────────────────────────────────
  type Scored = { row: Row; card: any; score: number; components: unknown; blocked: boolean; blocks: string[] }
  const scored: Scored[] = []
  const skipped: Array<{ row: Row; reason: string }> = []
  let repairAttempted = 0, repairSucceeded = 0

  for (const a of toCompose) {
    const beats = (beatsBy.get(a.id) || []).map(b => ({
      occurred_on: b.occurred_on, what_changed: b.what_changed, source: b.origin_key,
    }))
    const payload: ComposableArc = {
      id: a.id, title: a.title, summary: a.summary, implication: a.implication,
      lens: a.lens as Lens, channel: a.lane,
      theme_question: a.theme_id ? questions.get(a.theme_id) ?? null : null,
      beats,
    }
    const { system, user } = buildComposePrompt(payload)
    let composed: ReturnType<typeof parseComposed> = null
    try {
      const raw = await callClaude({ agent: 'arcs-compose', model: 'claude-sonnet-4-6', maxTokens: 1200, temperature: 0.3, system, user, timeoutMs: 45_000 })
      composed = parseComposed(robustJson(raw))
    } catch (e: any) {
      skipped.push({ row: a, reason: `composer failed: ${String(e?.message || e).slice(0, 200)}` })
      continue
    }
    if (!composed) {
      // Observed once in eight: a response came back unparseable and the same
      // arc composed cleanly on a retry. One retry, then give up and say so.
      try {
        const retry = await callClaude({ agent: 'arcs-compose', model: 'claude-sonnet-4-6', maxTokens: 1600, temperature: 0.3, system, user, timeoutMs: 45_000 })
        composed = parseComposed(robustJson(retry))
      } catch { /* fall through to the skip below */ }
    }
    if (!composed) { skipped.push({ row: a, reason: 'composer returned nothing usable, twice' }); continue }
    if ('skip' in composed) { skipped.push({ row: a, reason: `composer declined: ${composed.skip}` }); continue }

    // One bounded repair attempt. Measured on the first live run: 14 composed,
    // 13 rejected by lint, mostly for banned words in the claim and sentence
    // counts. Both are mechanical and both are fixable without touching the
    // evidence, so showing the model its own failures is worth one extra call.
    // The lint still decides: a card that fails again is blocked, not waved
    // through, and repairs are counted so a rising rate is visible.
    let failures = lintCard(composed)
    const hadFailures = failures.length > 0
    if (hadFailures) repairAttempted++
    for (let attempt = 0; attempt < MAX_REPAIRS && failures.length; attempt++) {
      try {
        const rp = buildRepairPrompt(composed as ComposedCard, failures)
        const raw2 = await callClaude({ agent: 'arcs-repair', model: 'claude-sonnet-4-6', maxTokens: 1400, temperature: 0.1, system: rp.system, user: rp.user, timeoutMs: 45_000 })
        const fixed = parseComposed(robustJson(raw2))
        if (!fixed || 'skip' in fixed) break
        const after = lintCard(fixed as ComposedCard)
        // Only accept a strict improvement, so a repair can never make a card
        // worse than the one it replaced.
        if (after.length >= failures.length) break
        composed = fixed
        failures = after
      } catch { break }
    }
    if (hadFailures && failures.length === 0) repairSucceeded++

    const { independent, primary } = independence(a.id)
    const arc: Arc = {
      id: a.id, headline: composed.headline,
      lens: a.lens as Lens, channel: a.lane, theme_id: a.theme_id,
      plausible_new_theme: Boolean(a.plausible_new_theme),
      independent_beats: independent, primary_beats: primary,
      card: composed,
    }
    const s = scoreArc(arc)
    scored.push({ row: a, card: composed, score: s.total, components: s.components, blocked: s.blocked, blocks: s.blocks })
  }

  // ── surface: seven slots, two reserved, empty stays empty ────────────────
  const passing = scored.filter(s => !s.blocked)
  const picked = surface(passing.map(s => ({ id: s.row.id, theme_id: s.row.theme_id, score: s.score })))
  const surfacedIds = new Set([...picked.themed, ...picked.unthemed].map(p => p.id))
  const reservedIds = new Set(picked.unthemed.map(p => p.id))

  // ── write everything, winners and losers alike ───────────────────────────
  const rows: any[] = []
  for (const s of scored) {
    const on = surfacedIds.has(s.row.id)
    rows.push({
      shift_id: s.row.id, week,
      headline: s.card.headline, what_changed: s.card.what_changed, why_now: s.card.why_now,
      the_opening: s.card.the_opening, where_this_goes: s.card.where_this_goes,
      reader_decision: s.card.reader_decision, format: s.card.format,
      score: s.blocked ? 0 : s.score, components: s.components,
      blocked: s.blocked, blocks: s.blocks,
      surfaced: on, reserved_slot: reservedIds.has(s.row.id),
      surface_reason: s.blocked
        ? s.blocks.join('; ')
        : on
          ? surfacingReason(s.row.arc_state || 'building', Boolean(s.row.theme_id))
          : `scored ${s.score.toFixed(2)}, below the cut for this week`,
    })
  }
  for (const p of preBlocked) {
    rows.push({
      shift_id: p.row.id, week, blocked: true, blocks: p.blocks, score: 0,
      surfaced: false, surface_reason: p.blocks.join('; '),
    })
  }
  for (const sk of skipped) {
    rows.push({
      shift_id: sk.row.id, week, blocked: true, blocks: [sk.reason], score: 0,
      surfaced: false, surface_reason: sk.reason,
    })
  }
  if (rows.length) {
    const { error: wErr } = await supabase.from('arc_cards')
      .upsert(rows, { onConflict: 'shift_id,week' })
    if (wErr) throw new Error(`arc_cards write failed: ${wErr.message}`)
  }

  return {
    week,
    candidates: arcs.length,
    pre_blocked: preBlocked.length,
    composed: scored.length,
    skipped: skipped.length,
    lint_blocked: scored.filter(s => s.blocked).length,
    repair_attempted: repairAttempted,
    repair_succeeded: repairSucceeded,
    surfaced: surfacedIds.size,
    themed: picked.themed.length,
    unthemed: picked.unthemed.length,
    empty_reserved: picked.emptyReserved,
    slots: VISIBLE_SLOTS,
    reserved: RESERVED_FOR_UNTHEMED,
    // Never silent: a cap that hides work looks identical to having none.
    ...(deferred.length ? { deferred: deferred.length, note: `${deferred.length} eligible arc(s) not composed this run because of the ${max} cap` } : {}),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return
  try {
    const max = Number((req.query?.max as string) || '') || undefined
    return res.json({ ok: true, ...(await runSurface({ max })) })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

export const config = { maxDuration: 300 }
