import { OPENAI_JUDGE_MODEL, OPENAI_GENERATION_MODEL, JUDGE_MODEL } from './_models.js'
import * as meter from './_meter.js'

/**
 * Keeping the model-dependent surfaces alive when Anthropic says no.
 *
 * Third outage of one shape in one month: a dead key on 2026-09-15, a spend cap
 * on 2026-09-20, and on 2026-09-23 the org's own usage limit —
 *
 *   anthropic_400: You have reached your specified API usage limits.
 *   You will regain access on 2026-10-01 at 00:00 UTC.
 *
 * Eight days, with the query planner, the reranker and the per-person
 * explanations dark for all of them. The Gemini layer in n8n exists for exactly
 * this and the Vercel functions had no equivalent.
 *
 * Krish's ruling, 2026-09-23: fall back to OpenAI quickly and automatically,
 * without breaking the bank. Each of those three words is a design constraint
 * and they pull against each other, so this is what each one bought:
 *
 * QUICKLY — the breaker. Anthropic hands us the reset time in the error text,
 *   so the first failure records it and every later call skips Anthropic
 *   entirely until it passes. Without this, a week-long outage means a week of
 *   every request paying a doomed round trip before doing anything useful. It
 *   lives in system_config rather than in a module variable because each lambda
 *   is its own process and a per-process breaker re-learns the outage on every
 *   cold start.
 *
 * AUTOMATICALLY — the fallback sits inside callClaude, so every existing call
 *   site inherits it without being touched, and the ones that must NOT inherit
 *   it opt out by name (below).
 *
 * WITHOUT BREAKING THE BANK — three separate limits, because one is a hope:
 *   1. The cheap tier only. A judge call falls back to the nano model and
 *      everything else to mini. Never a like-for-like swap to a premium model:
 *      the point is to keep the lights on, not to reproduce Sonnet.
 *   2. Bulk paths opt out. enrich-person alone ran 3,284 calls in a day on
 *      2026-09-15. Interactive surfaces are worth paying to keep alive; a
 *      backfill can wait for the reset. This is the single biggest saving here
 *      and it is a list, not a guess.
 *   3. A daily ceiling on fallback calls, counted from the meter.
 *
 * The ceiling is counted in CALLS, not dollars, and that is deliberate. Pricing
 * it in dollars would mean putting a rate for the OpenAI models into
 * _prices.ts, and this repo's rule on that is explicit: an unknown model prices
 * at zero and says so, because "a guessed rate produces a plausible wrong
 * number that nobody questions". I do not have verified rates for these model
 * ids, so a dollar ceiling computed from them would be exactly that wrong
 * number, guarding a budget it was not really measuring. A call ceiling against
 * a bounded max_tokens is a real limit that needs no rate to be true. When the
 * rates are confirmed, add them to _prices.ts and the meter starts costing this
 * traffic with no change here.
 */

/** system_config keys. Values are plain, so they are editable by hand. */
const BREAKER_KEY = 'anthropic_unavailable_until'
const CAP_KEY = 'openai_fallback_daily_call_cap'

/** Fallback calls per UTC day before this stops rescuing anything.
 *  Deliberately low enough to notice and high enough to cover a working day of
 *  interactive use: the planner and the explain pass are roughly two calls per
 *  search. */
const DEFAULT_DAILY_CAP = 400

/** How long an outage with no parseable reset time is assumed to last.
 *  Short, because the cost of being wrong in this direction is one failed call
 *  per surface per quarter hour, and the cost in the other direction is staying
 *  dark after the provider has recovered. */
const BLIND_BREAKER_MS = 15 * 60_000

/**
 * Failures that mean "Anthropic will not serve this request, and trying again
 * in a second will not change that".
 *
 * Deliberately NOT timeouts. A slow upstream has already spent the caller's
 * latency budget, and following it with a second provider turns a slow answer
 * into a very slow one; the caller's own degrade path is better at that point.
 */
const FALLBACK_WORTHY = /anthropic_(400|401|403|429|529)|usage limits|credit balance|not configured|missing_anthropic_key/i

/** Errors that additionally say Anthropic is down for everyone, for a while —
 *  worth opening the breaker for, as opposed to one malformed request. */
const OUTAGE_SHAPED = /usage limits|credit balance|rate limit|anthropic_(401|403|429|529)|not configured|missing_anthropic_key/i

/**
 * "You will regain access on 2026-10-01 at 00:00 UTC" -> a Date.
 *
 * Reading the provider's own stated reset beats any interval we would invent:
 * this outage is eight days long and a 15 minute assumption would have retried
 * it about 770 times for nothing.
 */
export function parseResetAt(message: string, now = new Date()): Date | null {
  const m = /regain access on (\d{4}-\d{2}-\d{2})(?:\s+at\s+(\d{2}:\d{2}))?/i.exec(message || '')
  if (!m) return null
  const when = new Date(`${m[1]}T${m[2] || '00:00'}:00Z`)
  if (Number.isNaN(when.getTime()) || when <= now) return null
  return when
}

/** Which OpenAI model stands in for an Anthropic one. Cheap tier only. */
export function understudyFor(anthropicModel: string): string {
  return anthropicModel.startsWith(JUDGE_MODEL)
    ? (process.env.OPENAI_JUDGE_MODEL || OPENAI_JUDGE_MODEL)
    : (process.env.OPENAI_GENERATION_MODEL || OPENAI_GENERATION_MODEL)
}

/** Whether a thrown error is worth answering with the other provider. */
export function shouldFallBack(err: unknown): boolean {
  const msg = (err as Error)?.message || ''
  return FALLBACK_WORTHY.test(msg)
}

// ── The breaker ────────────────────────────────────────────────────────────
//
// Cached per process for a minute. The point of the breaker is to remove a
// doomed API call from every request; replacing it with a database read on
// every request would give most of that back.

let breakerCache: { until: number; readAt: number } | undefined
let capCache: { cap: number; used: number; day: string; readAt: number } | undefined
const CACHE_MS = 60_000

async function config(): Promise<{ until: number; cap: number }> {
  const now = Date.now()
  if (breakerCache && now - breakerCache.readAt < CACHE_MS && capCache && now - capCache.readAt < CACHE_MS) {
    return { until: breakerCache.until, cap: capCache.cap }
  }
  let until = 0
  let cap = DEFAULT_DAILY_CAP
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('system_config').select('key,value').in('key', [BREAKER_KEY, CAP_KEY])
    for (const r of data || []) {
      const row = r as { key: string; value: unknown }
      if (row.key === BREAKER_KEY) {
        const t = new Date(String(row.value ?? '').replace(/^"|"$/g, '')).getTime()
        if (!Number.isNaN(t)) until = t
      }
      if (row.key === CAP_KEY) {
        const n = Number(String(row.value ?? '').replace(/^"|"$/g, ''))
        if (Number.isFinite(n) && n >= 0) cap = n
      }
    }
  } catch {
    // A config read that fails must not decide policy. Unknown means "Anthropic
    // is fine", which is the state that costs nothing when it is wrong: the
    // call is attempted, fails, and re-opens the breaker.
  }
  breakerCache = { until, readAt: now }
  capCache = { ...(capCache || { used: 0, day: '' }), cap, readAt: now }
  return { until, cap }
}

/** True when Anthropic has told us it will refuse until a known time. */
export async function anthropicIsShut(): Promise<boolean> {
  const { until } = await config()
  return until > Date.now()
}

/** Record an outage, with the provider's own reset time where it gave one. */
export async function openBreaker(message: string): Promise<void> {
  if (!OUTAGE_SHAPED.test(message || '')) return
  const until = parseResetAt(message) || new Date(Date.now() + BLIND_BREAKER_MS)
  breakerCache = { until: until.getTime(), readAt: Date.now() }
  try {
    const { supabase } = await import('./_supabase.js')
    await supabase.from('system_config').upsert(
      { key: BREAKER_KEY, value: until.toISOString() },
      { onConflict: 'key' },
    )
    console.warn(`anthropic_breaker_open until=${until.toISOString()} reason=${message.slice(0, 120)}`)
  } catch (e) {
    // Best effort, and said out loud rather than swallowed: a breaker that
    // failed to persist still works for this process and quietly stops working
    // for the next one, which is the kind of half-failure this repo keeps
    // finding the hard way.
    console.warn(`anthropic_breaker_write_failed: ${(e as Error)?.message?.slice(0, 120)}`)
  }
}

/** Clear it, for when a call succeeds before the stated reset. */
export async function closeBreaker(): Promise<void> {
  breakerCache = { until: 0, readAt: Date.now() }
  try {
    const { supabase } = await import('./_supabase.js')
    await supabase.from('system_config').upsert({ key: BREAKER_KEY, value: '' }, { onConflict: 'key' })
  } catch { /* the cache already reflects it; the next process re-learns */ }
}

/** Today's fallback calls against the ceiling, from the meter. */
async function withinDailyCap(cap: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  const now = Date.now()
  if (capCache && capCache.day === day && now - capCache.readAt < CACHE_MS) return capCache.used < cap
  let used = 0
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('meter_daily').select('runs').eq('provider', 'openai').eq('day', day)
    used = (data || []).reduce((a, r) => a + Number((r as { runs?: number }).runs || 0), 0)
  } catch {
    // Unknown usage counts as none. The cap is a backstop against a runaway
    // loop, not an accounting control, and refusing to rescue anything because
    // the meter is unreadable would make an outage worse for no saving.
  }
  capCache = { cap, used, day, readAt: now }
  return used < cap
}

export interface FallbackOpts {
  agent?: string | null
  /** The Anthropic model this is standing in for. Picks the tier. */
  model: string
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  /** Ask OpenAI for strict JSON. Every JSON-returning caller in this repo
   *  already tolerates prose via robustJson, so this is a quality lever, not a
   *  correctness one. */
  json?: boolean
}

let cachedOpenAIKey: string | null | undefined
async function getOpenAIKey(): Promise<string | null> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  if (cachedOpenAIKey !== undefined) return cachedOpenAIKey
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('app_secrets').select('value').eq('key', 'openai_api_key').maybeSingle()
    cachedOpenAIKey = data && typeof (data as { value?: unknown }).value === 'string'
      ? (data as { value: string }).value
      : null
  } catch {
    cachedOpenAIKey = null
  }
  return cachedOpenAIKey
}

/**
 * Answer with OpenAI instead. Throws if it cannot, so the caller's own degrade
 * path still runs: a fallback that swallows its failure would turn a named
 * outage into an unexplained empty answer, which is the failure mode this repo
 * has spent the month removing.
 */
export async function askOpenAI(opts: FallbackOpts): Promise<string> {
  const { cap } = await config()
  if (!(await withinDailyCap(cap))) throw new Error(`openai_fallback_daily_cap_reached_${cap}`)
  const key = await getOpenAIKey()
  if (!key) throw new Error('openai_fallback_unavailable: no OPENAI_API_KEY')

  const model = understudyFor(opts.model)
  const ctrl = new AbortController()
  const tid = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
        max_completion_tokens: opts.maxTokens ?? 4000,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
      signal: opts.timeoutMs ? ctrl.signal : undefined,
    })
    const j = await r.json().catch(() => ({})) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      error?: { message?: string }
    }
    if (!r.ok) throw new Error(`openai_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
    // Metered like any other spend. An unmetered provider reads as free, which
    // is the exact bug the n8n layer had when the dashboard showed $0.00 beside
    // a real bill. These model ids have no row in _prices.ts, so this lands as
    // `unpriced-model` with real token counts and no dollars: visibly a gap,
    // which is what it is until the rates are confirmed.
    await meter.openaiCall({
      agent: opts.agent, model,
      inputTokens: j?.usage?.prompt_tokens || 0,
      outputTokens: j?.usage?.completion_tokens || 0,
    })
    const text = j?.choices?.[0]?.message?.content
    if (!text) throw new Error('openai_empty_response')
    return text
  } finally {
    if (tid) clearTimeout(tid)
  }
}
