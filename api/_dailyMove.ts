// The daily move (ADR-028): the strategist's read that nobody asked for.
//
// Krish, 2026-10-03: the next best action is critical, so it gets the best
// model, a second opinion from another lab, and it is waiting for him when he
// opens Home rather than behind a box he has to write in first. The data said
// why: in the month before, the evening "tomorrow's ONE" was skipped nine times
// out of nine, Today's 3 had never been set, and the strategist had never been
// asked for a read. Every surface asked him to write the move. This one hands
// him a move to react to.
//
// THE RUN, once per operator-civil day, from the hourly cron:
//   1. A pending row is written FIRST. Without it nothing runs and nothing is
//      spent: before migration 20261003120000 there is no row to write, so the
//      cron does nothing at all instead of paying for a read every hour that it
//      could never keep.
//   2. The decider (DAILY_MOVE_MODEL) writes a daily read through the same
//      NDJSON contract and line-by-line checks as every strategist read.
//   3. The challenger (DAILY_MOVE_CHALLENGER_MODEL, another lab) argues the
//      strongest case against the first move and may prefer a runner-up.
//   4. Only when it does, the decider weighs that objection and keeps its move
//      or switches. The card says which, and what the move survived.
//   5. The bank rows, then the read, saved.
//
// WHAT IT NEVER DOES. It never sends anything, never writes daily_focus (a
// move becomes his only when he takes it, through the slot route), and never
// pushes the move to him: the OS is pull-only (architecture section 0b).

import {
  DAILY_MOVE_MODEL, DAILY_MOVE_CHALLENGER_MODEL,
} from './_models.js'
import { callClaude } from './_content.js'
import {
  STRATEGIST_PROMPT_REV, STRATEGIST_PERSONA,
  buildStrategistSystem, buildStrategistUser, buildValidationCtx, createLineSplitter, createReadAccumulator,
  renderGroundingText, suggestionRowsFor, stampSuggestionIds, cleanText, inventedNumbers,
  type ReadVerdict, type ValidationCtx, type StrategistGrounding,
} from './_strategist.js'
import type { StrategistRead, DailyChallenge, NextStepSection } from '../src/types/strategist.js'
import { OPENROUTER_ENDPOINT, openRouterKey, readRescueUsage } from './_providerFallback.js'
import * as meter from './_meter.js'

/** The meter stamp for every call the daily move makes. */
export const DAILY_AGENT = 'daily-move'
/** Operator-local hour from which today's move is written. */
export const DAILY_HOUR = 5
/** A pending row younger than this is another invocation still working. */
export const PENDING_STALE_MS = 10 * 60_000
/** A day whose read failed this many times waits for tomorrow, so a broken
 *  prompt costs three runs, not twenty-four. */
export const MAX_ATTEMPTS = 3

/** Deadlines inside the route's 300 seconds, with room to save. */
export const PROPOSE_MS = 170_000
export const CHALLENGE_MS = 50_000
export const DECIDE_MS = 55_000

/** How the challenger is named on the card. */
export const CHALLENGER_LABEL = 'A second strategist (GPT-6.1 Sol)'

// ── Pure: the clock ─────────────────────────────────────────────────────────

/** The operator-local hour, 0 to 23. */
export function localHour(at: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(at)
  return Number(h) % 24
}

/** Whether today's move is due: from DAILY_HOUR in his zone. */
export function dueNow(at: Date, tz: string, hour = DAILY_HOUR): boolean {
  return localHour(at, tz) >= hour
}

// ── Pure: the proposal ──────────────────────────────────────────────────────

/** A whole model answer through the same splitter and accumulator a streamed
 *  read goes through, so a daily read is checked line by line like any other. */
export function parseDaily(raw: string, ctx: ValidationCtx): ReadVerdict {
  const acc = createReadAccumulator(ctx)
  const splitter = createLineSplitter(line => { acc.line(line) })
  splitter.push(raw)
  splitter.flush()
  return acc.finish()
}

function movesBlock(read: StrategistRead): string {
  return read.next_steps
    .map((m, i) => `${i + 1}. ${m.text}${m.why ? ` Why: ${m.why}` : ''}`)
    .join('\n')
}

// ── Pure: the challenge ─────────────────────────────────────────────────────

export function challengeSystem(): string {
  return [
    'You are a second strategist from a different firm, brought in to stress-test one recommendation before Krish Raja sees it. You did not write it.',
    'Your job: find the strongest reason the first move is the wrong first move for today, using only the facts in GROUNDING.',
    '- Argue against move 1. Be concrete: name the fact in GROUNDING that cuts against it, such as a date, a figure, a goal, a person\'s tier or a draft\'s age.',
    '- If move 2 or move 3 is the better first move today, prefer it and say why. If move 1 survives your best objection, prefer 1.',
    '- Never invent a fact, a figure or a person, and never propose a new move.',
    '- No praise, no hedging, no exclamation marks, no em dashes. Plain English a twelve year old can follow.',
    'Return ONLY a JSON object, no prose and no code fence: {"objection":"the strongest case against move 1, one or two sentences","prefer":1,"why":"one sentence"}',
  ].join('\n')
}

export function challengeUser(groundingText: string, read: StrategistRead): string {
  return `${groundingText}\n\nTHE MOVES, best first:\n${movesBlock(read)}\n\nReturn the JSON now.`
}

export interface Challenge { objection: string; prefer: number; why: string }

/** The challenger's answer, or null when it is not one. A figure it cites must
 *  be in his numbers, the same rule every strategist line passes. */
export function parseChallenge(raw: string, moves: number, sourceText: string): Challenge | null {
  const j = jsonObject(raw)
  if (!j) return null
  const objection = cleanText(j.objection)
  const why = cleanText(j.why)
  const prefer = Number(j.prefer)
  if (!objection || !Number.isInteger(prefer) || prefer < 1 || prefer > moves) return null
  if (inventedNumbers(`${objection}\n${why}`, sourceText).length) return null
  return { objection, prefer, why }
}

// ── Pure: the decision ──────────────────────────────────────────────────────

export function decideSystem(): string {
  return [
    'You chose the moves below for Krish Raja this morning. A second strategist from another firm argued against your first move and prefers another.',
    'Decide which is the first move today. Switch only if the objection rests on a fact in GROUNDING that you weighed wrongly; otherwise keep your first move.',
    'Return ONLY a JSON object, no prose and no code fence. To keep move 1 first: {"choice":"keep","why":"one sentence that names nobody"}. To put their preferred move first: {"choice":"switch","why":"one sentence that names nobody"}.',
  ].join('\n')
}

export function decideUser(groundingText: string, read: StrategistRead, c: Challenge): string {
  return [
    groundingText,
    '',
    `THE MOVES, best first:\n${movesBlock(read)}`,
    '',
    `THE OBJECTION to move 1: ${c.objection}`,
    `THEY PREFER move ${c.prefer}. Their reason: ${c.why || 'none given'}`,
    '',
    `Keep move 1 first, or switch to move ${c.prefer}. Return the JSON now.`,
  ].join('\n')
}

/**
 * The decider's answer: keep move 1, or switch to the move the challenger
 * preferred. Nothing else. A word, not a number: on 2026-10-03 the first
 * schema asked for {"keep": 1} and the dry run's decider answered {"keep": 0},
 * meaning "switch", which a number cannot say without being read as a rank.
 */
export function parseDecision(raw: string, prefer: number, sourceText: string): { keep: number; why: string } | null {
  const j = jsonObject(raw)
  if (!j) return null
  const choice = typeof j.choice === 'string' ? j.choice.trim().toLowerCase() : ''
  if (choice !== 'keep' && choice !== 'switch') return null
  const keep = choice === 'keep' ? 1 : prefer
  const why = cleanText(j.why)
  if (why && inventedNumbers(why, sourceText).length) return { keep, why: '' }
  return { keep, why }
}

/** The read with the kept move first. The others keep their order. */
export function reorderMoves(read: StrategistRead, keep: number): StrategistRead {
  if (keep <= 1 || keep > read.next_steps.length) return read
  const moves = [...read.next_steps]
  const [chosen] = moves.splice(keep - 1, 1)
  return { ...read, next_steps: [chosen, ...moves] }
}

/** The challenge as the card shows it, from what actually happened. */
export function challengeRecord(c: Challenge | null, decision: { keep: number; why: string } | null, decided: boolean): DailyChallenge {
  if (!c) return { verdict: 'unchallenged', objection: null, by: null, why: 'The second opinion did not arrive, so this move was not challenged today.' }
  if (c.prefer === 1) return { verdict: 'kept', objection: c.objection, by: CHALLENGER_LABEL, why: c.why || null }
  if (!decided || !decision) {
    return { verdict: 'kept', objection: c.objection, by: CHALLENGER_LABEL, why: 'The objection could not be weighed again in time, so the first move stands.' }
  }
  return {
    verdict: decision.keep === 1 ? 'kept' : 'switched',
    objection: c.objection,
    by: CHALLENGER_LABEL,
    why: decision.why || null,
  }
}

function jsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    const v = JSON.parse(text.slice(a, b + 1)) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
  } catch {
    return null
  }
}

// ── Effectful: the models ───────────────────────────────────────────────────

/** The decider. Fable thinks whatever it is told (thinkingParam omits the
 *  field), so max_tokens covers the thinking and the read. Returns the model
 *  that actually wrote the answer: a refusal is served by the API's fallback
 *  model, and the read is stamped with that one, not the one asked for. */
async function decide(system: string, user: string, effort: 'high' | 'medium', maxTokens: number, timeoutMs: number): Promise<{ text: string; model: string }> {
  let served: string = DAILY_MOVE_MODEL
  const text = await callClaude({
    agent: 'daily-move',
    model: DAILY_MOVE_MODEL,
    effort,
    refusalFallback: true,
    think: true,
    maxTokens,
    timeoutMs,
    system,
    user,
    onUsage: u => { served = u.model },
  })
  return { text, model: served }
}

/** Whether an answer came from the fallback rather than the decider. */
export function servedByFallback(model: string): boolean {
  return !model.startsWith(DAILY_MOVE_MODEL)
}

/** The challenger, through OpenRouter, to hosts that keep nothing it is sent:
 *  the grounding names warm contacts and quotes his numbers. */
async function challenge(system: string, user: string, timeoutMs: number): Promise<string> {
  const key = await openRouterKey()
  if (!key) throw new Error('challenger_unavailable:no_openrouter_key')
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DAILY_MOVE_CHALLENGER_MODEL,
        max_tokens: 6000,
        // Reasoning is mandatory on this model; high, because it is one call
        // a day and its whole job is to think harder about one decision.
        reasoning: { effort: 'high' },
        usage: { include: true },
        provider: { data_collection: 'deny' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: ctrl.signal,
    })
    const j = await r.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown; error?: { message?: string } }
    await meter.rescueCall({ agent: DAILY_AGENT, model: DAILY_MOVE_CHALLENGER_MODEL, ...readRescueUsage(j.usage), failed: !r.ok })
    if (!r.ok) throw new Error(`challenger_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
    return j?.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(tid)
  }
}

export interface DailyDeps {
  decide: typeof decide
  challenge: typeof challenge
}

const LIVE: DailyDeps = { decide, challenge }

// ── Effectful: the run ──────────────────────────────────────────────────────

export type DailyStatus =
  | 'not_yet' | 'exists' | 'running' | 'gave_up' | 'not_persisted'
  | 'grounding_failed' | 'incomplete' | 'complete'

export interface DailyResult {
  status: DailyStatus
  read_id?: string | null
  /** Named reasons, never provider text. */
  reasons?: string[]
  /** The read, in a dry run only. */
  read?: StrategistRead
  timings?: Record<string, number>
}

interface DailyRow { id: string; status: string; last_attempt_at: string | null; created_at: string; producer: Record<string, unknown> | null }

/**
 * Write today's move if it is due and not already written.
 *
 * `force` skips the hour (a manual run from the app). `dryRun` reads
 * everything and calls the models, and writes nothing at all: no row, no bank,
 * no audit. `deps` replaces the model calls, for tests and for a dry run with
 * a stand-in model.
 */
export async function writeDailyMove(opts: {
  now?: Date
  force?: boolean
  dryRun?: boolean
  deps?: Partial<DailyDeps>
} = {}): Promise<DailyResult> {
  const deps: DailyDeps = { ...LIVE, ...opts.deps }
  const { getOperatorTz, ymdIn, weekOfIn } = await import('./_timezone.js')
  const { supabase } = await import('./_supabase.js')
  const now = opts.now ?? new Date()
  const tz = await getOperatorTz()
  const today = ymdIn(now, tz)
  const weekStart = weekOfIn(now, tz)
  if (!opts.force && !dueNow(now, tz)) return { status: 'not_yet' }

  const producer: Record<string, unknown> = {
    agent: DAILY_AGENT,
    persona: STRATEGIST_PERSONA,
    model: DAILY_MOVE_MODEL,
    challenger: DAILY_MOVE_CHALLENGER_MODEL,
    prompt_rev: STRATEGIST_PROMPT_REV,
    shape: 'daily',
  }

  // 1. The row first, or nothing at all.
  let readId: string | null = null
  if (!opts.dryRun) {
    const { data: existing, error: readErr } = await supabase.from('strategist_reads')
      .select('id, status, last_attempt_at, created_at, producer')
      .eq('source', 'daily').eq('read_date', today)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (readErr) return { status: 'not_persisted', reasons: ['daily_row_unreadable'] }
    const row = existing as DailyRow | null
    if (row?.status === 'complete') return { status: 'exists', read_id: row.id }
    const lastTouch = new Date(row?.last_attempt_at || row?.created_at || 0).getTime()
    if (row?.status === 'pending' && now.getTime() - lastTouch < PENDING_STALE_MS) return { status: 'running', read_id: row.id }
    const attempts = Number(row?.producer?.attempts || 0)
    if (row && attempts >= MAX_ATTEMPTS) return { status: 'gave_up', read_id: row.id }
    producer.attempts = attempts + 1
    if (row) {
      // Compare and set: the retry belongs to whichever invocation moves
      // last_attempt_at first. Two that found the same stale row would
      // otherwise both pay for a read and both write bank rows for it.
      const { data: took, error } = await supabase.from('strategist_reads')
        .update({ status: 'pending', handoff_reason: null, producer, last_attempt_at: now.toISOString() })
        .eq('id', row.id).eq('last_attempt_at', row.last_attempt_at)
        .select('id')
      if (error) return { status: 'not_persisted', reasons: ['daily_row_not_updated'] }
      if (!took?.length) return { status: 'running', read_id: row.id }
      readId = row.id
    } else {
      const { data, error } = await supabase.from('strategist_reads').insert({
        source: 'daily', read_date: today, week_start: weekStart, status: 'pending', producer,
      }).select('id').single()
      // A unique violation is another invocation that got here first.
      if (error) return { status: /duplicate|unique/i.test(error.message || '') ? 'running' : 'not_persisted', reasons: ['daily_row_not_written'] }
      readId = String((data as { id: unknown }).id)
    }
  }

  const timings: Record<string, number> = {}
  const fail = async (status: DailyStatus, reasons: string[]): Promise<DailyResult> => {
    if (readId) {
      await supabase.from('strategist_reads').update({
        status: 'incomplete', handoff_reason: 'strategist_read_incomplete', producer: { ...producer, reasons, timings },
      }).eq('id', readId)
      await audit(readId, 'incomplete')
    }
    return { status, read_id: readId, reasons, timings }
  }

  // 2. The grounding.
  let grounding: StrategistGrounding
  try {
    const { loadStrategistGrounding } = await import('./_strategistGrounding.js')
    grounding = (await loadStrategistGrounding({ source: 'daily' }, tz, { today, weekStart, excludeReadId: readId })).grounding
  } catch (e) {
    console.warn(`daily_move_grounding_failed: ${(e as Error)?.message?.slice(0, 200)}`)
    return fail('grounding_failed', ['grounding_failed'])
  }

  // 3. The proposal.
  const system = buildStrategistSystem({ source: 'daily' })
  const user = buildStrategistUser(grounding)
  const groundingText = renderGroundingText(grounding)
  const ctx = buildValidationCtx({ shape: 'daily', system, grounding, groundingText })
  let verdict: ReadVerdict
  const t0 = Date.now()
  try {
    const proposed = await deps.decide(system, user, 'high', 16_000, PROPOSE_MS)
    producer.model = proposed.model
    if (servedByFallback(proposed.model)) producer.fallback_served = true
    verdict = parseDaily(proposed.text, ctx)
  } catch (e) {
    console.warn(`daily_move_propose_failed: ${(e as Error)?.message?.slice(0, 200)}`)
    timings.propose_ms = Date.now() - t0
    return fail('incomplete', [/refusal/.test(String((e as Error)?.message)) ? 'refused' : 'anthropic_failed'])
  }
  timings.propose_ms = Date.now() - t0
  if (verdict.complete === false) return fail('incomplete', verdict.reasons)
  let read: StrategistRead = verdict.read

  // 4. The challenge, and the decision only when there is one to take.
  let c: Challenge | null = null
  let decision: { keep: number; why: string } | null = null
  let decided = false
  if (read.next_steps.length > 0) {
    const t1 = Date.now()
    try {
      c = parseChallenge(await deps.challenge(challengeSystem(), challengeUser(groundingText, read), CHALLENGE_MS), read.next_steps.length, ctx.sourceText)
    } catch (e) {
      console.warn(`daily_move_challenge_failed: ${(e as Error)?.message?.slice(0, 160)}`)
    }
    timings.challenge_ms = Date.now() - t1
    if (c && c.prefer !== 1) {
      const t2 = Date.now()
      try {
        const weighed = await deps.decide(decideSystem(), decideUser(groundingText, read, c), 'medium', 8_000, DECIDE_MS)
        producer.decide_model = weighed.model
        decision = parseDecision(weighed.text, c.prefer, ctx.sourceText)
        decided = decision !== null
      } catch (e) {
        console.warn(`daily_move_decide_failed: ${(e as Error)?.message?.slice(0, 160)}`)
      }
      timings.decide_ms = Date.now() - t2
      if (decision) read = reorderMoves(read, decision.keep)
    }
  }
  read = { ...read, challenge: challengeRecord(c, decision, decided) }

  if (opts.dryRun) return { status: 'complete', read, timings }

  // 5. The bank, then the read.
  const notes = [...verdict.notes]
  const { recordSuggestions } = await import('./_suggestions.js')
  const { withoutContacts } = await import('./_strategistGrounding.js')
  const bank = await recordSuggestions(suggestionRowsFor(read, readId as string, { model: String(producer.model), shape: 'daily', reader: DAILY_AGENT }))
  if (bank.ok === true) read = stampSuggestionIds(read, bank.ids)
  else notes.push(`bank_not_written:${bank.reason}`)
  const stored = withoutContacts(stripWire(read))
  const { error } = await supabase.from('strategist_reads').update({
    status: 'complete', sections: stored, headline: stored.headline.text, handoff_reason: null,
    producer: { ...producer, notes, timings },
  }).eq('id', readId as string)
  if (error) return { status: 'not_persisted', read_id: readId, reasons: ['daily_read_not_saved'], timings }
  await audit(readId, 'complete')
  return { status: 'complete', read_id: readId, timings }
}

/** Never store what is attached for the wire: a person's details and a draft
 *  link are read fresh each time the move is shown. */
export function stripWire(read: StrategistRead): StrategistRead {
  return {
    ...read,
    next_steps: read.next_steps.map((m: NextStepSection) => {
      const { person: _p, draft_url: _d, ...rest } = m
      return rest
    }),
  }
}

/** The event and the read id, nothing the read says. */
async function audit(readId: string | null, status: 'complete' | 'incomplete'): Promise<void> {
  try {
    const { supabase } = await import('./_supabase.js')
    await supabase.from('audit_log').insert({
      id: `daily-move-${readId ?? `unsaved-${Date.now()}`}-${status}-${Date.now().toString(36)}`,
      event_type: `strategist_read_${status}`,
      actor: 'marcus',
      target: readId,
      details: 'daily',
    })
  } catch { /* an audit line never fails a read */ }
}
