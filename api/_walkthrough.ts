import { supabase } from './_supabase.js'
import { describeDbError } from './_suggestions.js'

/**
 * A note starts a walkthrough.
 *
 * Krish, 2026-10-08: "Whenever I give a long ramble into control centre about
 * what I want to get done, it's probably best that it triggers something in
 * this session ... and then have you draft it from the Claude subscription (as
 * opposed to from the API control centre). Can you make that work, bulletproof,
 * robust, and antifragile?"
 *
 * When a note read completes, this fires a Claude Code routine. The routine
 * starts a session on his Claude subscription that runs
 * .claude/skills/walkthrough/SKILL.md against the read: one step at a time,
 * options for each, drafting with him, and the honest outcome of every step
 * written to walkthrough_steps.
 *
 * WHAT CROSSES THE WIRE IS THE READ ID AND NOTHING ELSE. The session reads the
 * note and the read from Supabase itself. scripts/check-walkthrough-handoff.mts
 * fails CI if the payload ever grows a field.
 *
 * WHY THE ROW COMES FIRST. The fire endpoint has no idempotency key and every
 * call starts a new session, so a retry, a double tap or two tabs would each
 * start one. walkthrough_runs.read_id is unique: the row is claimed before the
 * HTTP call, and whoever loses the claim gets the existing row back.
 *
 * WHEN IT FAILS. Nothing about a read depends on this. A missing routine, a
 * revoked token, a rate limit or an outage leaves a row that says why, and the
 * read shows "Start walkthrough" (one tap retries) plus the prompt to paste
 * into claude.ai/code by hand. The handoff degrades to a copy, never to nothing.
 *
 * The routine trigger is a research preview and the endpoint is marked
 * experimental (docs checked 2026-10-08). The fallback prompt is what keeps
 * this working if its shape changes.
 */

export const ROUTINE_FIRE_BASE = 'https://api.anthropic.com/v1/claude_code/routines'
export const ROUTINE_BETA = 'experimental-cc-routine-2026-04-01'
export const FIRE_TIMEOUT_MS = 10_000
/** A claim older than this with no answer is treated as lost, and may be retried. */
export const STALE_FIRING_MS = 120_000
export const WALKTHROUGH_SKILL_PATH = '.claude/skills/walkthrough/SKILL.md'

export type WalkthroughStatus = 'firing' | 'started' | 'failed' | 'not_configured'
export type FiredBy = 'auto' | 'button'

export interface WalkthroughRun {
  read_id: string
  status: WalkthroughStatus
  fired_by: FiredBy
  attempts: number
  session_url: string | null
  error: string | null
  updated_at: string | null
}

export interface WalkthroughView {
  read_id: string
  run: WalkthroughRun | null
  /** What to paste into a new claude.ai/code session on this repository when the button cannot start one. */
  prompt: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isReadId(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** The whole payload. One line, one id. Nothing he said. */
export function firePayload(readId: string): { text: string } {
  if (!isReadId(readId)) throw new Error('walkthrough_bad_read_id')
  return { text: `read_id: ${readId.toLowerCase()}` }
}

/** The prompt for a hand-started session, the same instruction the routine carries. */
export function walkthroughPrompt(readId: string): string {
  return [
    `Run the walkthrough in ${WALKTHROUGH_SKILL_PATH} for strategist read ${readId}.`,
    'Read the note and the read from Supabase, check what is already done, then take me through each step one at a time with options.',
  ].join(' ')
}

export interface RoutineConfig { routineId: string; token: string }

/** Both names, or nothing. A half-configured routine is reported, never guessed at. */
export function routineConfig(env: Record<string, string | undefined> = process.env): RoutineConfig | null {
  const routineId = (env.CLAUDE_WALKTHROUGH_ROUTINE_ID || '').trim()
  const token = (env.CLAUDE_WALKTHROUGH_ROUTINE_TOKEN || '').trim()
  if (!routineId || !token) return null
  if (!/^trig_[A-Za-z0-9]+$/.test(routineId)) return null
  return { routineId, token }
}

export type FireOutcome =
  | { ok: true; sessionId: string | null; sessionUrl: string }
  | { ok: false; error: string }

/**
 * Trust the body, not the status. A 200 that is not a routine_fire with a
 * claude.ai session link did not start anything we can point him at.
 */
export function parseFireResponse(status: number, body: string): FireOutcome {
  if (status === 429) return { ok: false, error: 'rate_limited: the routine allows 30 fires an hour' }
  if (status === 401 || status === 403) return { ok: false, error: 'token_rejected: generate a new routine token' }
  if (status === 404) return { ok: false, error: 'routine_not_found: check CLAUDE_WALKTHROUGH_ROUTINE_ID' }
  if (status >= 500) return { ok: false, error: `unavailable: routine endpoint answered ${status}` }
  if (status !== 200) return { ok: false, error: `refused: routine endpoint answered ${status}` }
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(body) as Record<string, unknown> } catch { return { ok: false, error: 'unreadable: the 200 was not JSON' } }
  const url = typeof parsed.claude_code_session_url === 'string' ? parsed.claude_code_session_url : ''
  if (parsed.type !== 'routine_fire' || !/^https:\/\/claude\.ai\/code\//.test(url)) {
    return { ok: false, error: 'unreadable: the 200 named no session' }
  }
  const sessionId = typeof parsed.claude_code_session_id === 'string' ? parsed.claude_code_session_id : null
  return { ok: true, sessionId, sessionUrl: url }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>

/** One HTTP call, bounded. A timeout may still have started a session, and the error says so. */
export async function fireRoutine(cfg: RoutineConfig, readId: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = FIRE_TIMEOUT_MS): Promise<FireOutcome> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetchImpl(`${ROUTINE_FIRE_BASE}/${cfg.routineId}/fire`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': ROUTINE_BETA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firePayload(readId)),
      signal: ac.signal,
    })
    return parseFireResponse(r.status, await r.text())
  } catch (e) {
    if (ac.signal.aborted) return { ok: false, error: 'timed_out: a session may have started anyway, check claude.ai/code before retrying' }
    return { ok: false, error: `network: ${((e as Error)?.message || String(e)).slice(0, 120)}` }
  } finally {
    clearTimeout(timer)
  }
}

/** Whether a row may be fired again by the button. A started run is opened, never re-fired. */
export function mayRetry(run: Pick<WalkthroughRun, 'status' | 'updated_at'>, now = Date.now()): boolean {
  if (run.status === 'failed' || run.status === 'not_configured') return true
  if (run.status === 'firing') {
    const at = run.updated_at ? Date.parse(run.updated_at) : NaN
    return Number.isFinite(at) && now - at > STALE_FIRING_MS
  }
  return false
}

const RUN_COLUMNS = 'read_id, status, fired_by, attempts, session_url, error, updated_at'

export async function loadRun(readId: string): Promise<WalkthroughRun | null> {
  const { data, error } = await supabase.from('walkthrough_runs').select(RUN_COLUMNS).eq('read_id', readId).maybeSingle()
  if (error) throw new Error(describeDbError(error))
  return (data as WalkthroughRun | null) ?? null
}

async function settle(readId: string, outcome: FireOutcome | { ok: false; error: string; notConfigured: true }): Promise<WalkthroughRun | null> {
  const patch = outcome.ok === true
    ? { status: 'started', session_url: outcome.sessionUrl, session_id: outcome.sessionId, error: null }
    : { status: 'notConfigured' in outcome ? 'not_configured' : 'failed', error: outcome.error.slice(0, 300) }
  const { data, error } = await supabase.from('walkthrough_runs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('read_id', readId)
    .select(RUN_COLUMNS)
    .maybeSingle()
  if (error) console.warn(`walkthrough_not_settled: ${describeDbError(error)}`)
  await audit(readId, outcome.ok ? 'walkthrough_started' : 'walkthrough_fire_failed')
  return (data as WalkthroughRun | null) ?? null
}

/**
 * Claim the read, then fire. Never throws: the read it hangs off is already
 * saved and must not be failed by this.
 *
 * auto    claims by insert. Losing the claim means someone already fired.
 * button  opens a started run, retries a failed or stale one through a
 *         conditional update (so two taps cannot both win), and claims a read
 *         that was never fired (a note read before this shipped).
 */
export async function startWalkthrough(readId: string, firedBy: FiredBy, deps: { fetchImpl?: FetchLike; env?: Record<string, string | undefined> } = {}): Promise<WalkthroughRun | null> {
  try {
    if (!isReadId(readId)) return null
    const cfg = routineConfig(deps.env)

    let claimed = false
    const { error: insertError } = await supabase.from('walkthrough_runs').insert({ read_id: readId, status: 'firing', fired_by: firedBy })
    if (!insertError) claimed = true
    else if (insertError.code !== '23505') {
      console.warn(`walkthrough_not_claimed: ${describeDbError(insertError)}`)
      return null
    }

    if (!claimed) {
      const existing = await loadRun(readId)
      if (!existing || firedBy === 'auto' || !mayRetry(existing)) return existing
      const staleBefore = new Date(Date.now() - STALE_FIRING_MS).toISOString()
      const { data } = await supabase.from('walkthrough_runs')
        .update({ status: 'firing', fired_by: 'button', attempts: existing.attempts + 1, error: null, updated_at: new Date().toISOString() })
        .eq('read_id', readId)
        .or(`status.in.(failed,not_configured),and(status.eq.firing,updated_at.lt.${staleBefore})`)
        .select('read_id')
      if (!data || data.length === 0) return await loadRun(readId)
    }

    if (!cfg) return await settle(readId, { ok: false, notConfigured: true, error: 'not_configured: set CLAUDE_WALKTHROUGH_ROUTINE_ID and CLAUDE_WALKTHROUGH_ROUTINE_TOKEN in Vercel' })
    return await settle(readId, await fireRoutine(cfg, readId, deps.fetchImpl))
  } catch (e) {
    console.warn(`walkthrough_unexpected: ${(e as Error)?.message || String(e)}`)
    return null
  }
}

/** The event and the read id. Never the note, never the token. */
async function audit(readId: string, eventType: string): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      id: `${eventType}-${readId}-${Date.now()}`,
      event_type: eventType,
      actor: 'control_center',
      target: readId,
    })
  } catch {
    // An audit line never fails a walkthrough.
  }
}
