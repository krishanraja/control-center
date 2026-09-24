import { RESCUE_JUDGE_MODEL, RESCUE_GENERATION_MODEL, JUDGE_MODEL } from './_models.js'
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
 * explanations dark for all of them. None of the three was a model failure;
 * all three were BILLING failures on one account, which is why the answer is a
 * second billing relationship rather than a second model.
 *
 * Krish's ruling, 2026-09-23: fall back quickly and automatically, without
 * breaking the bank. Each of those words is a design constraint and they pull
 * against each other, so this is what each one bought:
 *
 * QUICKLY — the breaker. Anthropic hands us the reset time in the error text,
 *   so the first failure records it and every later call skips Anthropic
 *   entirely until it passes. Without this, a week-long outage means a week of
 *   every request paying a doomed round trip before doing anything useful. It
 *   lives in system_config rather than in a module variable because each lambda
 *   is its own process and a per-process breaker re-learns the outage on every
 *   cold start.
 *
 * AUTOMATICALLY — the fallback sits inside callClaude, callClaudeMessages and
 *   streamClaude, so every existing call site inherits it without being
 *   touched, and the ones that must NOT inherit it opt out by name (below).
 *
 * WITHOUT BREAKING THE BANK — two limits, and they are the real ones:
 *   1. Bulk paths opt out. enrich-person alone ran 3,284 calls in a day on
 *      2026-09-15. Interactive surfaces are worth paying to keep alive; a
 *      backfill can wait for the reset. This is the single biggest saving here
 *      and it is a list, not a guess.
 *   2. A daily ceiling on rescue calls, counted from the meter.
 *
 * A third limit used to exist — a demotion to the cheap OpenAI tier — and it
 * is gone as of 2026-09-24. It was there on the assumption that a like-for-like
 * rescue was unaffordable. Probing OpenRouter on the live credential showed
 * that is not true: inference is Anthropic list price with no per-token markup,
 * and prompt caching survives the hop at the exact multipliers _prices.ts
 * models (5m write 1.25x, 1h write 2.0x, read 0.1x, measured). A demotion would
 * now buy nothing but a quality cliff on the surfaces Krish reads during an
 * outage, so the understudy is the same model. See _models.ts RESCUE_*.
 *
 * Cost is no longer inferred. OpenRouter returns `usage.cost` per call and the
 * meter records that number, which is why the rescue models deliberately have
 * no row in _prices.ts: the biller's own figure beats a derived one, and this
 * repo's rule is that a guessed rate produces a plausible wrong number nobody
 * questions.
 */

/** system_config keys. Values are plain, so they are editable by hand. */
const BREAKER_KEY = 'anthropic_unavailable_until'
/** The current key. */
const CAP_KEY = 'rescue_fallback_daily_call_cap'
/**
 * The key this setting had while the rescue was OpenAI.
 *
 * Read as a fallback rather than dropped, because renaming a live config key
 * silently reverts the deployed cap to the default and nothing says so. The new
 * key wins where both exist; delete the old row once it is set.
 */
const LEGACY_CAP_KEY = 'openai_fallback_daily_call_cap'

/** Rescue calls per UTC day before this stops rescuing anything.
 *  Deliberately low enough to notice and high enough to cover a working day of
 *  interactive use: the planner and the explain pass are roughly two calls per
 *  search. */
const DEFAULT_DAILY_CAP = 400

/** How long an outage with no parseable reset time is assumed to last.
 *  Short, because the cost of being wrong in this direction is one failed call
 *  per surface per quarter hour, and the cost in the other direction is staying
 *  dark after the provider has recovered. */
const BLIND_BREAKER_MS = 15 * 60_000

/** The provider the meter records rescue spend under. */
export const RESCUE_PROVIDER = 'openrouter' as const

const RESCUE_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

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

/**
 * Which OpenRouter model stands in for an Anthropic one.
 *
 * Like-for-like since 2026-09-24. The mapping is by TIER, not by exact id, so a
 * dated snapshot (claude-haiku-4-5-20251001) still finds its understudy.
 */
export function understudyFor(anthropicModel: string): string {
  return anthropicModel.startsWith(JUDGE_MODEL)
    ? (process.env.RESCUE_JUDGE_MODEL || RESCUE_JUDGE_MODEL)
    : (process.env.RESCUE_GENERATION_MODEL || RESCUE_GENERATION_MODEL)
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
  let sawCurrentCapKey = false
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('system_config').select('key,value').in('key', [BREAKER_KEY, CAP_KEY, LEGACY_CAP_KEY])
    for (const r of data || []) {
      const row = r as { key: string; value: unknown }
      if (row.key === BREAKER_KEY) {
        const t = new Date(String(row.value ?? '').replace(/^"|"$/g, '')).getTime()
        if (!Number.isNaN(t)) until = t
      }
      if (row.key === CAP_KEY || row.key === LEGACY_CAP_KEY) {
        // The current key wins wherever it is set, so a lingering legacy row
        // cannot quietly override a deliberate new one.
        if (row.key === LEGACY_CAP_KEY && sawCurrentCapKey) continue
        const n = Number(String(row.value ?? '').replace(/^"|"$/g, ''))
        if (Number.isFinite(n) && n >= 0) {
          cap = n
          if (row.key === CAP_KEY) sawCurrentCapKey = true
        }
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

/** Today's rescue calls against the ceiling, from the meter. */
async function withinDailyCap(cap: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  const now = Date.now()
  if (capCache && capCache.day === day && now - capCache.readAt < CACHE_MS) return capCache.used < cap
  let used = 0
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('meter_daily').select('runs').eq('provider', RESCUE_PROVIDER).eq('day', day)
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
  /**
   * Ask for strict JSON.
   *
   * Kept in the signature and deliberately NOT sent for an Anthropic slug:
   * probed on 2026-09-24, `response_format: {type:'json_object'}` is accepted
   * and then ignored there — the reply came back as a fenced markdown block.
   * Every JSON-returning caller in this repo already tolerates prose via
   * robustJson, so sending a parameter that does nothing would only suggest a
   * guarantee that is not there.
   */
  json?: boolean
  /** Adaptive thinking. Off unless asked for, matching the primary path. */
  think?: boolean
}

/** Turns a multi-turn history into the rescue provider's message array. */
export interface RescueTurn { role: 'user' | 'assistant'; content: string }

let cachedRescueKey: string | null | undefined
async function getRescueKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  if (cachedRescueKey !== undefined) return cachedRescueKey
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('app_secrets').select('value').eq('key', 'openrouter_api_key').maybeSingle()
    cachedRescueKey = data && typeof (data as { value?: unknown }).value === 'string'
      ? (data as { value: string }).value
      : null
  } catch {
    cachedRescueKey = null
  }
  return cachedRescueKey
}

/**
 * The request body, shared by the buffered and streaming paths so they cannot
 * drift apart on the parameters that matter.
 *
 * `usage.include` is what makes the meter honest: the reply then carries
 * `usage.cost` in real dollars and the meter records that rather than deriving
 * a number from a price table that has no row for these slugs.
 *
 * `reasoning` is always explicit. The two paths disagree by default — the
 * direct Anthropic API runs adaptive thinking on Sonnet 5 when `thinking` is
 * omitted, while OpenRouter measured `reasoning_tokens: 0` for the same
 * omission — and a rescue whose thinking policy depends on which provider
 * answered is a rescue that behaves differently from the thing it replaces.
 */
function rescueBody(model: string, messages: RescueTurn[], system: string, opts: {
  maxTokens?: number; temperature?: number; think?: boolean; stream?: boolean
}): Record<string, unknown> {
  return {
    model,
    max_tokens: opts.maxTokens ?? 4000,
    reasoning: opts.think ? { effort: 'medium' } : { enabled: false },
    usage: { include: true },
    ...(opts.stream ? { stream: true } : {}),
    ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
  }
}

/** Read the OpenRouter usage object into the shape the meter wants. */
export function readRescueUsage(usage: unknown): {
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; usd: number
} {
  const u = (usage || {}) as Record<string, unknown>
  const n = (v: unknown) => Number(v) || 0
  const d = (u.prompt_tokens_details || {}) as Record<string, unknown>
  return {
    // OpenRouter reports prompt_tokens INCLUSIVE of cached tokens, so the
    // uncached remainder is what belongs in `input` — otherwise a cached prefix
    // is counted twice and the meter over-reports volume on the cheapest calls.
    inputTokens: Math.max(0, n(u.prompt_tokens) - n(d.cached_tokens) - n(d.cache_write_tokens)),
    outputTokens: n(u.completion_tokens),
    cacheReadTokens: n(d.cached_tokens),
    cacheWriteTokens: n(d.cache_write_tokens),
    usd: n(u.cost),
  }
}

async function guardRescue(): Promise<string> {
  const { cap } = await config()
  if (!(await withinDailyCap(cap))) throw new Error(`rescue_daily_cap_reached_${cap}`)
  const key = await getRescueKey()
  if (!key) throw new Error('rescue_unavailable: no OPENROUTER_API_KEY')
  return key
}

/**
 * Answer through OpenRouter instead. Throws if it cannot, so the caller's own
 * degrade path still runs: a fallback that swallows its failure would turn a
 * named outage into an unexplained empty answer, which is the failure mode this
 * repo has spent the month removing.
 */
export async function askRescue(opts: FallbackOpts): Promise<string> {
  const key = await guardRescue()
  const model = understudyFor(opts.model)
  const ctrl = new AbortController()
  const tid = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null
  try {
    const r = await fetch(RESCUE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(rescueBody(model, [{ role: 'user', content: opts.user }], opts.system, opts)),
      signal: opts.timeoutMs ? ctrl.signal : undefined,
    })
    const j = await r.json().catch(() => ({})) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: unknown
      error?: { message?: string }
    }
    if (!r.ok) throw new Error(`rescue_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
    await meter.rescueCall({ agent: opts.agent, model, ...readRescueUsage(j?.usage) })
    const text = j?.choices?.[0]?.message?.content
    if (!text) throw new Error('rescue_empty_response')
    return text
  } finally {
    if (tid) clearTimeout(tid)
  }
}

/** Multi-turn rescue, for the writing-assistant chat. */
export async function askRescueMessages(
  system: string,
  messages: RescueTurn[],
  opts: { agent?: string | null; model: string; maxTokens?: number; temperature?: number; think?: boolean },
): Promise<string> {
  const key = await guardRescue()
  const model = understudyFor(opts.model)
  const r = await fetch(RESCUE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(rescueBody(model, messages, system, opts)),
  })
  const j = await r.json().catch(() => ({})) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: unknown
    error?: { message?: string }
  }
  if (!r.ok) throw new Error(`rescue_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
  await meter.rescueCall({ agent: opts.agent, model, ...readRescueUsage(j?.usage) })
  const text = j?.choices?.[0]?.message?.content
  if (!text) throw new Error('rescue_empty_response')
  return text
}

/**
 * Streaming rescue, for Ask Marcus and the tab chats.
 *
 * These were the two surfaces with NO rescue at all: 24 callClaude sites
 * inherited the fallback and streamClaude inherited nothing, so the most
 * human-facing surfaces in the OS went dark for all three outages while the
 * background jobs kept answering.
 *
 * `onText` receives the same plain text deltas the Anthropic path emits, so the
 * caller's SSE plumbing does not need to know which provider answered.
 */
export async function streamRescue(
  opts: FallbackOpts & { messages?: RescueTurn[] },
  onText: (chunk: string) => void,
): Promise<{ usd: number }> {
  const key = await guardRescue()
  const model = understudyFor(opts.model)
  const turns = opts.messages?.length ? opts.messages : [{ role: 'user' as const, content: opts.user }]
  const r = await fetch(RESCUE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(rescueBody(model, turns, opts.system, { ...opts, stream: true })),
  })
  if (!r.ok || !r.body) {
    const body = await r.text().catch(() => '')
    throw new Error(`rescue_${r.status}:${body.slice(0, 120)}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: unknown = null
  // The usage frame arrives LAST, after finish_reason, so the meter write has
  // to wait for the stream to end rather than firing on the first chunk.
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      let frame: any
      try { frame = JSON.parse(payload) } catch { continue }
      const delta = frame?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) onText(delta)
      if (frame?.usage) usage = frame.usage
    }
  }
  const u = readRescueUsage(usage)
  await meter.rescueCall({ agent: opts.agent, model, ...u })
  return { usd: u.usd }
}

/**
 * A rescue answer, dressed as an Anthropic Messages response.
 *
 * This is what lets the n8n fleet inherit the rescue without touching a single
 * workflow. Every checked-in parse node reads Anthropic's native shape —
 * `content[0].text` — and the Gemini branches only existed because Google
 * answers in a different one: `candidates[0].content.parts[0].text`. Nine of
 * eleven of those branches were broken for months precisely because the shape
 * adapter was written per workflow, by hand, eleven times.
 *
 * Translating once, here, deletes that entire class of bug. A workflow cannot
 * have a broken fallback parser if it never learns that a fallback happened.
 *
 * `stop_reason` is 'end_turn' rather than something honest like 'rescued'
 * because a downstream node switching on it would take a branch nobody tested.
 * The rescue announces itself in `_rescued_by`, which is additive and which no
 * existing node reads.
 */
export function asAnthropicResponse(
  text: string,
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): Record<string, unknown> {
  return {
    id: `msg_rescue_${Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
    _rescued_by: RESCUE_PROVIDER,
  }
}

/**
 * Anthropic message content -> plain text.
 *
 * The proxy forwards whatever a workflow sent, and a workflow may send either a
 * bare string or an array of content blocks. Flattening to text is lossy for an
 * image block, and deliberately so: the rescue path is text only, and a
 * workflow sending images is better served by the outage than by an answer that
 * silently ignored half its input. Those say so, rather than going quiet.
 */
export function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const b = block as { type?: string; text?: string }
    if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    else if (b?.type === 'image') parts.push('[image omitted: the rescue provider is text only]')
  }
  return parts.join('\n\n')
}
