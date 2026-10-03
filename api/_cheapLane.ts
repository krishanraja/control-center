// The cheap lane (ADR-028): bulk work that leaves Anthropic, measured before it
// moves and watched after.
//
// Krish, 2026-10-03, approving the move: take the bulk machine work off the
// Anthropic API, keep Claude for everything he reads or decides from, and move
// a job only when the cheaper model agrees with Claude on what matters. This is
// the mechanism that makes "only when" true without anyone remembering to
// check.
//
// THE LIFE OF AN AGENT ON THE LANE
//
//   shadow   Claude still writes the answer that is kept. Every candidate in
//            CHEAP_LANE_CANDIDATES answers the same evidence beside it, Claude
//            answers a second time as the noise ceiling, and one audit_log row
//            records who parsed and who agreed on each field. Booleans only:
//            no names, no evidence, nothing about the person.
//   on       Once every candidate has MIN_SAMPLES rows, decideLane() picks the
//            best passing candidate as primary and the next passing one from
//            a different provider as its fallback. The agent is served by them
//            from then on; a small sample keeps running against Claude so a
//            drift is seen rather than inherited.
//   off      No candidate passed, or Krish switched it off. Claude serves, as
//            before, and the state says why.
//
// The state lives in system_config under `cheap_lane:<agent>`, as JSON, so it
// is readable and settable by hand: {"mode":"off"} is the kill switch.
//
// WHAT IT NEVER DOES. It never falls back to Claude Sonnet or Opus for these
// agents (CFG-COST-001: a premium stand-in on a background job is the shape of
// the $1,800 Gemini bill). It never meters under the rescue's bucket, so a
// backfill in shadow cannot spend the ceiling that keeps the interactive
// surfaces rescued. It never sends data to an OpenRouter host that keeps it.

import {
  CHEAP_LANE_CANDIDATES, CHEAP_LANE_AGENTS,
  type CheapLaneAgent, type CheapLaneCandidate,
} from './_models.js'
import { OPENROUTER_ENDPOINT, LANE_BUCKET_PREFIX, openRouterKey, readRescueUsage } from './_providerFallback.js'
import * as meter from './_meter.js'

export type LaneMode = 'shadow' | 'on' | 'off'

export interface LaneState {
  mode: LaneMode
  primary: CheapLaneCandidate | null
  fallback: CheapLaneCandidate | null
  /** When the mode last changed. Shadow and drift rows older than this belong
   *  to a decision already taken, and are not counted again. */
  since: string | null
  /** One plain sentence: why the lane is in this mode. */
  reason: string | null
  /** Claude's agreement with itself when the lane went on. Drift rows carry no
   *  second Claude answer, so they are judged against the ceiling the
   *  promotion was judged against rather than a stricter bar it never met. */
  ceiling?: { overall: number | null; fields: Record<string, number> } | null
}

/** Rows each candidate needs before anything is decided. Krish's number. */
export const MIN_SAMPLES = 50
/** The bar: this share of the ranking fields agree with Claude. Krish's number. */
export const AGREEMENT_FLOOR = 0.9
/** ...or no further than this below Claude agreeing with itself. */
export const SELF_SLACK = 0.05
/** And no single field more than this below Claude's own agreement on it, so
 *  a candidate cannot buy a pass on four easy fields with a shift on the one
 *  that changes who he is shown. */
export const FIELD_SLACK = 0.1
/** The share of served calls checked against Claude once a lane is on. */
export const DRIFT_RATE = 0.02

const STATE_PREFIX = 'cheap_lane:'
const CACHE_MS = 60_000

function stateKey(agent: CheapLaneAgent): string {
  return `${STATE_PREFIX}${agent}`
}

export function isLaneAgent(agent: string): agent is CheapLaneAgent {
  return (CHEAP_LANE_AGENTS as readonly string[]).includes(agent)
}

function isCandidate(v: unknown): v is CheapLaneCandidate {
  return typeof v === 'string' && (CHEAP_LANE_CANDIDATES as readonly string[]).includes(v)
}

/** A stored state, or the default for an agent nobody has decided yet: shadow. */
export function parseLaneState(raw: unknown): LaneState {
  const fallback: LaneState = { mode: 'shadow', primary: null, fallback: null, since: null, reason: null }
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  let v: Record<string, unknown>
  try { v = JSON.parse(raw) as Record<string, unknown> } catch { return fallback }
  if (!v || typeof v !== 'object') return fallback
  const mode: LaneMode = v.mode === 'on' || v.mode === 'off' || v.mode === 'shadow' ? v.mode : 'shadow'
  const primary = isCandidate(v.primary) ? v.primary : null
  // "on" with nothing to serve is not on. Read it as shadow rather than send a
  // request with no model, and let the next decision write a real state.
  if (mode === 'on' && !primary) return { ...fallback, reason: 'on_without_primary' }
  const c = v.ceiling && typeof v.ceiling === 'object' ? v.ceiling as Record<string, unknown> : null
  const fields = c && c.fields && typeof c.fields === 'object' ? c.fields as Record<string, unknown> : null
  return {
    mode,
    primary,
    fallback: isCandidate(v.fallback) && v.fallback !== primary ? v.fallback : null,
    since: typeof v.since === 'string' ? v.since : null,
    reason: typeof v.reason === 'string' ? v.reason : null,
    ceiling: c
      ? {
          overall: typeof c.overall === 'number' ? c.overall : null,
          fields: Object.fromEntries(Object.entries(fields || {}).filter(([, n]) => typeof n === 'number')) as Record<string, number>,
        }
      : null,
  }
}

const stateCache = new Map<CheapLaneAgent, { state: LaneState; readAt: number }>()

/** The agent's lane state, cached a minute per process. An unreadable config
 *  reads as shadow, which is the state that costs least when it is wrong:
 *  Claude still serves, and the candidates only cost their shadow calls. */
export async function laneState(agent: CheapLaneAgent): Promise<LaneState> {
  const hit = stateCache.get(agent)
  if (hit && Date.now() - hit.readAt < CACHE_MS) return hit.state
  let state = parseLaneState(null)
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('system_config').select('value').eq('key', stateKey(agent)).maybeSingle()
    state = parseLaneState((data as { value?: unknown } | null)?.value ?? null)
  } catch { /* unreadable config is shadow, see above */ }
  stateCache.set(agent, { state, readAt: Date.now() })
  return state
}

/** Write a decision, record it where Krish looks, and update this process. */
export async function setLaneState(agent: CheapLaneAgent, state: LaneState, record: string): Promise<void> {
  stateCache.set(agent, { state, readAt: Date.now() })
  try {
    const { supabase } = await import('./_supabase.js')
    await supabase.from('system_config').upsert(
      { key: stateKey(agent), value: JSON.stringify(state), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    // Pull-only (architecture section 0b): recorded where he reads, never pushed.
    const { notifyOps } = await import('./_alert.js')
    await notifyOps(record)
  } catch (e) {
    console.warn(`cheap_lane_state_not_written agent=${agent}: ${(e as Error)?.message?.slice(0, 160)}`)
  }
}

// ── The call ─────────────────────────────────────────────────────────────────

/**
 * How each candidate is asked not to think. Read from OpenRouter's own model
 * catalogue on 2026-10-03, not assumed: GPT-6 Luna takes effort "none" (and
 * agreed best with Claude at it in the smoke test); DeepSeek V4 Flash and
 * Haiku 4.5 are switched off with enabled:false. A bulk JSON call budgeted for
 * its answer must not spend that budget thinking, which is the trap that
 * emptied Sonnet 5 calls on 2026-09-12.
 */
export function laneReasoning(model: CheapLaneCandidate): Record<string, unknown> {
  return model === 'openai/gpt-6-luna' ? { effort: 'none' } : { enabled: false }
}

/** The request body. Pure, so the policy in it is testable without a network. */
export function laneBody(opts: {
  model: CheapLaneCandidate
  fallback?: CheapLaneCandidate | null
  system: string
  user: string
  maxTokens: number
}): Record<string, unknown> {
  return {
    model: opts.model,
    // OpenRouter's own model fallback: the second model is tried when the
    // first errors (down, rate limited, moderated). Not on a bad answer; that
    // is the caller's retry, below.
    ...(opts.fallback ? { models: [opts.model, opts.fallback] } : {}),
    max_tokens: opts.maxTokens,
    reasoning: laneReasoning(opts.model),
    usage: { include: true },
    // Only hosts that do not keep what they are sent. Enrichment carries
    // personal data about real people, and a host that trains on it is a cost
    // no price saving pays for.
    provider: { data_collection: 'deny' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  }
}

export interface LaneAnswer {
  text: string
  /** The model OpenRouter says served it, which differs from the one asked
   *  for when its own fallback stepped in. */
  model: string
  usd: number
  ms: number
}

/** One call through the lane. Throws a short named error; never returns ''. */
export async function callLaneModel(opts: {
  agent: CheapLaneAgent
  model: CheapLaneCandidate
  fallback?: CheapLaneCandidate | null
  system: string
  user: string
  maxTokens: number
  timeoutMs?: number
}): Promise<LaneAnswer> {
  const key = await openRouterKey()
  if (!key) throw new Error('lane_unavailable:no_openrouter_key')
  const started = Date.now()
  const ctrl = new AbortController()
  const tid = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null
  try {
    const r = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(laneBody(opts)),
      signal: opts.timeoutMs ? ctrl.signal : undefined,
    })
    const j = await r.json().catch(() => ({})) as {
      model?: string
      choices?: Array<{ message?: { content?: string } }>
      usage?: unknown
      error?: { message?: string }
    }
    const served = typeof j.model === 'string' && j.model ? j.model : opts.model
    const usage = readRescueUsage(j.usage)
    await meter.rescueCall({ agent: opts.agent, model: `${LANE_BUCKET_PREFIX}${served}`, ...usage, failed: !r.ok })
    if (!r.ok) throw new Error(`lane_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
    const text = j?.choices?.[0]?.message?.content || ''
    if (!text) throw new Error('lane_empty_response')
    return { text, model: served, usd: usage.usd, ms: Date.now() - started }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error(`lane_timeout_${opts.timeoutMs}ms`)
    throw e
  } finally {
    if (tid) clearTimeout(tid)
  }
}

/**
 * Serve a call on a lane that is on: the primary (with the fallback behind it
 * for provider errors), and the fallback alone when the primary's answer will
 * not parse. Throws when neither gives a usable answer, so the caller's own
 * degrade path runs, exactly as it does when Claude fails.
 */
export async function serveLane<T>(opts: {
  agent: CheapLaneAgent
  state: LaneState
  system: string
  user: string
  maxTokens: number
  timeoutMs?: number
  parse: (raw: string) => T | null
}): Promise<{ value: T; answer: LaneAnswer }> {
  if (opts.state.mode !== 'on' || !opts.state.primary) throw new Error('lane_not_on')
  const first = await callLaneModel({
    agent: opts.agent, model: opts.state.primary, fallback: opts.state.fallback,
    system: opts.system, user: opts.user, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs,
  })
  const v1 = opts.parse(first.text)
  if (v1 !== null) return { value: v1, answer: first }
  if (!opts.state.fallback) throw new Error('lane_unparseable')
  const second = await callLaneModel({
    agent: opts.agent, model: opts.state.fallback,
    system: opts.system, user: opts.user, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs,
  })
  const v2 = opts.parse(second.text)
  if (v2 !== null) return { value: v2, answer: second }
  throw new Error('lane_unparseable')
}

// ── Shadow and drift: the evidence ───────────────────────────────────────────

/** One field-by-field comparison. True where the two answers agree. */
export type Agreement = Record<string, boolean>

/** What one shadow or drift row records. Booleans and short codes only. */
export interface LaneRow {
  v: 1
  agent: CheapLaneAgent
  /** Claude against a second Claude answer on the same evidence, the ceiling. */
  claude_self: Agreement | null
  candidates: Partial<Record<CheapLaneCandidate, {
    ok: boolean
    /** Why it failed: a short code, never provider text. */
    error?: string
    agree?: Agreement
    usd?: number
    ms?: number
  }>>
}

/** A provider error, cut to a code that can be counted and carries no secret. */
export function errorCode(e: unknown): string {
  const msg = String((e as Error)?.message || e || 'error')
  const m = /^lane_(\d{3}|[a-z_]+)/.exec(msg)
  if (m) return `lane_${m[1].replace(/_+$/, '')}`
  return /timeout/i.test(msg) ? 'timeout' : 'error'
}

/**
 * Errors that say the ACCOUNT cannot be served (no key, refused key, no
 * credit), as opposed to a model that answered badly or a host that was down.
 */
const ACCOUNT_ERRORS = /^lane_(unavailable|401|402|403)$/

/**
 * Whether a row is evidence about the models at all. A row in which every
 * candidate failed on an account error says the key or the balance is wrong,
 * not that the models are, and counting it would reject a lane for a
 * configuration slip on deploy day. Those rows are not recorded.
 */
export function isModelEvidence(row: LaneRow): boolean {
  const results = Object.values(row.candidates).filter(Boolean)
  if (!results.length) return false
  return !results.every(r => r && !r.ok && ACCOUNT_ERRORS.test(r.error || ''))
}

/**
 * How long shadow measurement rests on this instance after a row in which
 * OpenRouter refused every candidate. Such a row is not recorded, so without a
 * rest a dead key or an empty balance would have every enrichment pay for
 * Claude's second answer and three refused calls, indefinitely, while the lane
 * learned nothing. Resting bounds that to one wasted comparison per warm
 * instance per window, and needs no one to switch it back on: the next window
 * tries again by itself.
 */
export const ACCOUNT_PAUSE_MS = 15 * 60_000
const pausedUntil = new Map<string, number>()

/** Whether shadow comparisons are resting for this agent on this instance. */
export function shadowPaused(agent: string, now = Date.now()): boolean {
  return (pausedUntil.get(agent) ?? 0) > now
}

/** Record one row. Never fails the call it describes. */
export async function recordLaneRow(kind: 'shadow' | 'drift', row: LaneRow, now = Date.now()): Promise<void> {
  if (!isModelEvidence(row)) {
    if (kind === 'shadow') pausedUntil.set(row.agent, now + ACCOUNT_PAUSE_MS)
    console.warn(`cheap_lane_row_skipped agent=${row.agent} kind=${kind}: every candidate failed on an account error; shadow rests ${ACCOUNT_PAUSE_MS / 60_000} min on this instance`)
    return
  }
  try {
    const { supabase } = await import('./_supabase.js')
    await supabase.from('audit_log').insert({
      event_type: `cheap_lane_${kind}`,
      actor: 'cheap-lane',
      target: row.agent,
      changes: row,
    })
  } catch { /* evidence is best effort; the call it describes already happened */ }
}

/** The rows a decision is taken from: this agent, this kind, since the last change. */
export async function loadLaneRows(agent: CheapLaneAgent, kind: 'shadow' | 'drift', since: string | null, limit: number): Promise<LaneRow[]> {
  try {
    const { supabase } = await import('./_supabase.js')
    let q = supabase.from('audit_log').select('changes, created_at')
      .eq('event_type', `cheap_lane_${kind}`).eq('target', agent)
      .order('created_at', { ascending: false }).limit(limit)
    if (since) q = q.gt('created_at', since)
    const { data } = await q
    return ((data || []) as Array<{ changes: unknown }>)
      .map(r => r.changes as LaneRow)
      .filter(r => r && r.v === 1 && r.candidates && typeof r.candidates === 'object')
  } catch {
    return []
  }
}

// ── The decision ─────────────────────────────────────────────────────────────

export interface CandidateStats {
  candidate: CheapLaneCandidate
  n: number
  parsed: number
  /** Share of rows with a usable answer. Errors and timeouts count against it:
   *  a candidate that cannot answer is no cheaper than one that answers badly. */
  parse_rate: number
  /** Mean agreement over every field, on the rows that parsed. */
  overall: number
  fields: Record<string, number>
  usd_per_call: number
  pass: boolean
  /** Why it did not pass, in a short code, when it did not. */
  why: string | null
}

export type LaneDecision =
  | { decision: 'wait'; needed: number; stats: CandidateStats[]; claude_self: { n: number; overall: number | null; fields: Record<string, number> } }
  | { decision: 'promote'; primary: CheapLaneCandidate; fallback: CheapLaneCandidate | null; stats: CandidateStats[]; claude_self: { n: number; overall: number | null; fields: Record<string, number> } }
  | { decision: 'reject'; stats: CandidateStats[]; claude_self: { n: number; overall: number | null; fields: Record<string, number> } }

function rate(xs: boolean[]): number {
  return xs.length ? xs.filter(Boolean).length / xs.length : 0
}

function providerOf(c: CheapLaneCandidate): string {
  return c.split('/')[0]
}

/**
 * Pure: the rows in, the decision out.
 *
 * A candidate passes when it has MIN_SAMPLES rows, every one of them parsed,
 * and its agreement with Claude clears AGREEMENT_FLOOR or sits within
 * SELF_SLACK of Claude agreeing with itself, with no field more than
 * FIELD_SLACK below Claude's own agreement on that field. The primary is the
 * passing candidate that agrees best (cost breaks a tie); the fallback is the
 * next best passing candidate from a different provider, or none.
 */
export function decideLane(rows: LaneRow[], fields: readonly string[], opts: {
  minSamples?: number
  /** Claude's agreement with itself from an earlier decision, used when these
   *  rows carry none of their own (drift rows). */
  ceiling?: { overall: number | null; fields: Record<string, number> } | null
} = {}): LaneDecision {
  const minSamples = opts.minSamples ?? MIN_SAMPLES
  const selfRows = rows.map(r => r.claude_self).filter((a): a is Agreement => !!a)
  const borrowed = !selfRows.length && opts.ceiling ? opts.ceiling : null
  const selfFields: Record<string, number> = {}
  for (const f of fields) selfFields[f] = borrowed ? (borrowed.fields[f] ?? 1) : rate(selfRows.map(a => a[f] === true))
  const selfOverall = borrowed
    ? borrowed.overall
    : selfRows.length ? fields.reduce((s, f) => s + selfFields[f], 0) / fields.length : null
  const claude_self = { n: selfRows.length, overall: selfOverall, fields: selfFields }

  const stats: CandidateStats[] = CHEAP_LANE_CANDIDATES.map(candidate => {
    const seen = rows.map(r => r.candidates[candidate]).filter((x): x is NonNullable<typeof x> => !!x)
    const ok = seen.filter(x => x.ok && x.agree)
    const perField: Record<string, number> = {}
    for (const f of fields) perField[f] = rate(ok.map(x => x.agree?.[f] === true))
    const overall = ok.length ? fields.reduce((s, f) => s + perField[f], 0) / fields.length : 0
    const usd = seen.reduce((s, x) => s + (Number(x.usd) || 0), 0)
    const s: CandidateStats = {
      candidate, n: seen.length, parsed: ok.length,
      parse_rate: seen.length ? ok.length / seen.length : 0,
      overall, fields: perField,
      usd_per_call: seen.length ? usd / seen.length : 0,
      pass: false, why: null,
    }
    if (s.n < minSamples) { s.why = 'too_few_samples'; return s }
    if (s.parsed < s.n) { s.why = 'not_every_reply_parsed'; return s }
    const bar = selfOverall === null ? AGREEMENT_FLOOR : Math.min(AGREEMENT_FLOOR, selfOverall - SELF_SLACK)
    if (overall < bar) { s.why = 'agreement_below_bar'; return s }
    if (selfOverall !== null) {
      const weak = fields.find(f => perField[f] < selfFields[f] - FIELD_SLACK)
      if (weak) { s.why = `field_below_claude:${weak}`; return s }
    }
    s.pass = true
    return s
  })

  const short = stats.filter(s => s.n < minSamples)
  if (short.length) {
    return { decision: 'wait', needed: Math.max(...short.map(s => minSamples - s.n)), stats, claude_self }
  }
  const passing = stats.filter(s => s.pass)
    .sort((a, b) => (b.overall - a.overall) || (a.usd_per_call - b.usd_per_call))
  if (!passing.length) return { decision: 'reject', stats, claude_self }
  const primary = passing[0].candidate
  const fallback = passing.slice(1).find(s => providerOf(s.candidate) !== providerOf(primary))?.candidate ?? null
  return { decision: 'promote', primary, fallback, stats, claude_self }
}

/** One sentence for the record: what was decided, and on what. */
export function decisionSentence(agent: CheapLaneAgent, d: LaneDecision): string {
  const pct = (x: number | null) => (x === null ? 'unmeasured' : `${Math.round(x * 100)}%`)
  const line = (s: CandidateStats) => `${s.candidate} ${s.parsed}/${s.n} parsed, ${pct(s.overall)} agreement${s.why ? ` (${s.why})` : ''}`
  const self = `Claude against itself: ${pct(d.claude_self.overall)} over ${d.claude_self.n}`
  if (d.decision === 'promote') {
    return `Cheap lane: ${agent} moves to ${d.primary}${d.fallback ? `, ${d.fallback} behind it` : ', no fallback'}. ${self}. ${d.stats.map(line).join('; ')}.`
  }
  if (d.decision === 'reject') {
    return `Cheap lane: ${agent} stays on Claude, no candidate cleared the bar. ${self}. ${d.stats.map(line).join('; ')}.`
  }
  return `Cheap lane: ${agent} still measuring, ${d.needed} more rows needed.`
}

/**
 * After a shadow row: take the decision once there is enough to take it.
 * Cheap to call on every row while shadowing, because shadowing ends at the
 * first decision.
 */
export async function maybeDecide(agent: CheapLaneAgent, fields: readonly string[]): Promise<void> {
  const state = await laneState(agent)
  if (state.mode !== 'shadow') return
  const rows = await loadLaneRows(agent, 'shadow', state.since, MIN_SAMPLES * 4)
  const d = decideLane(rows, fields)
  if (d.decision === 'wait') return
  const now = new Date().toISOString()
  const sentence = decisionSentence(agent, d)
  if (d.decision === 'promote') {
    const ceiling = { overall: d.claude_self.overall, fields: d.claude_self.fields }
    await setLaneState(agent, { mode: 'on', primary: d.primary, fallback: d.fallback, since: now, reason: sentence, ceiling }, sentence)
  } else {
    await setLaneState(agent, { mode: 'off', primary: null, fallback: null, since: now, reason: sentence }, sentence)
  }
}

/**
 * After a drift row: a lane that has stopped agreeing goes back to shadow,
 * where Claude serves again and the candidates are re-measured from scratch.
 * A drift is judged on the same bar as the promotion, over the last
 * MIN_SAMPLES drift rows since the lane went on.
 */
export async function maybeDemote(agent: CheapLaneAgent, fields: readonly string[]): Promise<void> {
  const state = await laneState(agent)
  if (state.mode !== 'on' || !state.primary) return
  const rows = await loadLaneRows(agent, 'drift', state.since, MIN_SAMPLES)
  if (rows.length < MIN_SAMPLES) return
  const servedBy = state.primary
  const scoped = rows.map(r => ({ ...r, candidates: { [servedBy]: r.candidates[servedBy] } }) as LaneRow)
  const d = decideLane(scoped, fields, { minSamples: 0, ceiling: state.ceiling ?? null })
  const s = d.stats.find(x => x.candidate === servedBy)
  if (s && s.pass) return
  const now = new Date().toISOString()
  const sentence = `Cheap lane: ${agent} drifted on ${servedBy} (${s ? `${Math.round(s.overall * 100)}% agreement, ${s.why}` : 'no rows'}). Claude serves again while the candidates are re-measured.`
  await setLaneState(agent, { mode: 'shadow', primary: null, fallback: null, since: now, reason: sentence }, sentence)
}
