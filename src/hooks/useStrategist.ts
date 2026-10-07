import { useCallback, useEffect, useState } from 'react'
import { requestOk } from '../lib/apiFetch'
import { streamText } from '../lib/streamText'
import { getZone } from '../lib/civilDate'
import type {
  StrategistDoneEvent,
  StrategistErrorCode,
  StrategistErrorEvent,
  StrategistGetResponse,
  StrategistRead,
  StrategistRequest,
  StrategistSection,
  StrategistSectionEvent,
  StrategistStage,
  StrategistStageEvent,
} from '../types/strategist'

// The strategist's client (ADR-026): the latest read by GET, a new read by POST
// over the one streaming client (src/lib/streamText.ts), section by section.
//
// Four rules, each a failure the review found before it shipped:
//
//   1. One run per input at a time. The same note or goal asked for twice while
//      the first is still streaming joins the first (a module-level store keyed
//      by the input), so a double tap is one model call and both views see it.
//   2. A stream that ends without `done` failed. The rescue provider has no
//      deadline of its own, and without this a hung or cut stream would render
//      as a finished read that happens to be short.
//   3. A failed attempt backs off for 24 hours before anything runs on its own
//      again (GET returns last_attempt_at for exactly this). He can still ask.
//   4. A read that came back persisted:false (the table not there yet) never
//      reruns on its own. It showed; running it again would show it again, at
//      the price of another model call, every time a view mounted.

export type RunStatus = 'idle' | 'running' | 'ready' | 'failed'

export interface StrategistRunState {
  status: RunStatus
  /** The server's own stage, from `stage` events. Null before the first. */
  stage: StrategistStage | null
  /** Validated sections, in the order they streamed. */
  sections: StrategistSection[]
  /** The complete read from `done`, with suggestion ids stamped on. */
  read: StrategistRead | null
  readId: string | null
  persisted: boolean | null
  /** A plain sentence for him, never a status code or provider text. */
  error: string | null
  errorCode: StrategistErrorCode | 'stopped_early' | 'failed' | null
  /** When this run started, for the elapsed clock. */
  startedAt: number | null
}

const IDLE: StrategistRunState = {
  status: 'idle', stage: null, sections: [], read: null, readId: null,
  persisted: null, error: null, errorCode: null, startedAt: null,
}

/** The target a read belongs to: a goal id, or this week's notes. */
export type StrategistTarget = string | 'week'

export const BACKOFF_MS = 24 * 60 * 60 * 1000

// ── module-level store: one entry per input ─────────────────────────────────

const runs = new Map<string, StrategistRunState>()
const inflight = new Map<string, Promise<StrategistRunState>>()
const listeners = new Set<() => void>()
/** Targets whose last read in this session came back persisted:false. */
const noAutoRerun = new Set<string>()

function notify() { for (const l of listeners) l() }
function put(key: string, next: StrategistRunState) { runs.set(key, next); notify() }

/** A short stable hash, so a 12,000 character note is not a map key. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * The key a run is stored and joined under. A goal's key is its id, so a
 * second view asking for the same goal joins the read already streaming. A
 * `fresh` read (the ladder just saved or retitled the goal) carries the open
 * it belongs to, so it never joins a read of the old wording that is still
 * streaming, while a double effect of the same open still joins itself.
 */
export function runKey(input: StrategistRequest, fresh?: string | number | null): string {
  if (input.source === 'goal') {
    return fresh != null && fresh !== '' ? `goal:${input.goalId}:fresh:${fresh}` : `goal:${input.goalId}`
  }
  return `note:${input.kind}:${hash(input.body.trim())}`
}

export function targetOf(input: StrategistRequest): StrategistTarget {
  return input.source === 'goal' ? input.goalId : 'week'
}

/**
 * The rule for anything that would run on its own (a sheet opening on a goal
 * with no read, a disclosure opened in the ritual). Never after persisted:false
 * this session; never while the last failed attempt is under a day old.
 */
export function autoRunAllowed(target: StrategistTarget, latest: StrategistGetResponse | null, now = Date.now()): boolean {
  if (noAutoRerun.has(target)) return false
  if (latest?.read) return false
  if (latest && latest.last_status && latest.last_status !== 'complete' && latest.last_attempt_at) {
    const at = new Date(latest.last_attempt_at).getTime()
    if (Number.isFinite(at) && now - at < BACKOFF_MS) return false
  }
  return true
}

/** True when a read came back that could not be kept, so it must not rerun by itself. */
export function readNotKept(target: StrategistTarget): boolean {
  return noAutoRerun.has(target)
}

/**
 * The suggestion ids arrive in one list: objectives, then asks, then next
 * steps. The server stamps them onto the read; this does it again when it did
 * not, and only when the counts agree, so an id can never land on the wrong
 * item.
 */
export function stampIds(read: StrategistRead, ids: string[]): StrategistRead {
  const total = read.objectives.length + read.asks.length + read.next_steps.length
  const stamped = [...read.objectives, ...read.asks, ...read.next_steps].some(s => s.suggestion_id)
  if (stamped || ids.length !== total) return read
  let i = 0
  return {
    ...read,
    objectives: read.objectives.map(o => ({ ...o, suggestion_id: ids[i++] ?? null })),
    asks: read.asks.map(a => ({ ...a, suggestion_id: ids[i++] ?? null })),
    next_steps: read.next_steps.map(n => ({ ...n, suggestion_id: ids[i++] ?? null })),
  }
}

// ── plain sentences ─────────────────────────────────────────────────────────

const STOPPED_EARLY = 'The read stopped before it finished, so nothing was kept from it. What you said is still here. Try again.'
const NO_READ = 'Marcus did not send a read back. What you said is still here. Try again.'
const DROPPED = 'The connection dropped before the read finished. What you said is kept. Try again.'

/** Codes a route may answer with before the stream opens, in words. */
const SAID: Record<string, string> = {
  note_too_long: 'That is over 12,000 characters. Split it in two and send each half.',
  note_required: 'There is nothing to read yet. Say or type how it is going first.',
  body_required: 'There is nothing to read yet. Say or type how it is going first.',
  empty_note: 'There is nothing to read yet. Say or type how it is going first.',
  goal_not_found: 'That goal is not in the canon any more, so there is nothing to read.',
  goal_dropped: 'That goal was dropped, so there is nothing to read.',
  unauthorized: 'This device is not signed in to read that.',
  forbidden: 'This device is not signed in to read that.',
}

/**
 * Turn whatever a failure said into a sentence for him. A route's own
 * sentence (it has spaces) goes through; a bare code is looked up, and an
 * unknown one never reaches the screen as a code.
 */
export function plainFailure(message: string | null | undefined): string {
  const m = (message || '').trim()
  if (!m) return NO_READ
  const code = m.toLowerCase()
  if (SAID[code]) return SAID[code]
  if (/^[a-z0-9_:.-]+$/i.test(m)) return NO_READ
  if (/request failed \(\d+\)/i.test(m) || /failed to fetch/i.test(m)) return NO_READ
  // What a browser says when a stream is cut mid-read: Chrome "network error",
  // Safari "Load failed", Firefox "NetworkError when attempting to fetch
  // resource". Each has a space, so without this it reached him raw.
  if (/^network ?error\b|^load failed$|^the network connection was lost/i.test(m)) return DROPPED
  return m
}

// ── the run ─────────────────────────────────────────────────────────────────

async function start(key: string, input: StrategistRequest): Promise<StrategistRunState> {
  let s: StrategistRunState = { ...IDLE, status: 'running', startedAt: Date.now() }
  put(key, s)
  const seen = new Set<number>()
  let errorEvent: StrategistErrorEvent | null = null
  let done: StrategistDoneEvent | null = null

  try {
    const result = await streamText<Omit<StrategistDoneEvent, 'ok'> & { ok?: boolean; error?: string }>(
      '/api/strategist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, tz: getZone() }),
      },
      {
        onText: () => {},
        // The server pings every 10s while the model thinks, so 90s of total
        // silence means the connection is gone, not that the read is long.
        timeoutMs: 90_000,
        onEvent: (name, data) => {
          if (name === 'stage') {
            const st = (data as StrategistStageEvent | null)?.stage ?? null
            s = { ...s, stage: st }
            put(key, s)
          } else if (name === 'section') {
            const ev = data as StrategistSectionEvent | null
            if (!ev || !ev.section || typeof ev.section.kind !== 'string') return
            const idx = typeof ev.index === 'number' ? ev.index : s.sections.length
            if (seen.has(idx)) return
            seen.add(idx)
            s = { ...s, sections: [...s.sections, ev.section] }
            put(key, s)
          } else if (name === 'done') {
            done = data as StrategistDoneEvent
          } else if (name === 'error') {
            errorEvent = data as StrategistErrorEvent
          }
        },
      },
    )

    // A route that answered in JSON instead of a stream: a refusal before the
    // stream opened reaches here only when its status was 2xx.
    // `done` is assigned inside the callback, which control-flow analysis
    // cannot see, hence the cast.
    const streamedDone = done as StrategistDoneEvent | null
    const d = (streamedDone ?? (result.streamed ? null : result.data)) as
      (Omit<StrategistDoneEvent, 'ok'> & { ok?: boolean; error?: string }) | null
    if (!d || !d.read || d.ok === false) {
      const sentence = d?.error ? plainFailure(d.error) : result.streamed ? STOPPED_EARLY : NO_READ
      s = { ...s, status: 'failed', error: sentence, errorCode: result.streamed ? 'stopped_early' : 'failed' }
      put(key, s)
      return s
    }

    const read = stampIds(d.read, Array.isArray(d.suggestion_ids) ? d.suggestion_ids : [])
    if (d.persisted === false) noAutoRerun.add(targetOf(input))
    s = {
      ...s,
      status: 'ready',
      read,
      readId: d.read_id ?? null,
      persisted: d.persisted !== false,
      error: null,
      errorCode: null,
    }
    put(key, s)
    return s
  } catch (e) {
    const ev = errorEvent as StrategistErrorEvent | null
    // A refusal before the stream opened carries the route's own sentence in
    // its body ({ error, detail }); an in-band error carries it in the event.
    const refused = (e as { body?: { detail?: unknown } } | null)?.body?.detail
    const sentence = ev?.detail
      ? plainFailure(ev.detail)
      : typeof refused === 'string' && refused.trim()
        ? plainFailure(refused)
        : plainFailure(e instanceof Error ? e.message : null)
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    s = {
      ...s,
      status: 'failed',
      error: aborted ? 'The connection went quiet for too long, so the read was dropped. What you said is still here. Try again.' : sentence,
      errorCode: ev?.error ?? 'failed',
    }
    put(key, s)
    return s
  }
}

/** Run a read. Joins one already streaming for the same input (and, for a
 *  fresh goal read, the same open). */
export function runStrategist(input: StrategistRequest, opts: { fresh?: string | number | null } = {}): Promise<StrategistRunState> {
  const key = runKey(input, opts.fresh)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = start(key, input).finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

/** GET the latest complete read for a goal, or for this week's notes. */
export async function latestStrategist(target: StrategistTarget): Promise<StrategistGetResponse> {
  const q = target === 'week' ? 'week=current' : `goalId=${encodeURIComponent(target)}`
  const j = await requestOk<Partial<StrategistGetResponse> & { ok?: boolean; error?: string }>(
    `/api/strategist?${q}&tz=${encodeURIComponent(getZone())}`,
    { timeoutMs: 12_000 },
  )
  // Tolerant of a thin answer: a body with no `read` is "no read yet".
  const read = j.read && typeof j.read === 'object' ? j.read : null
  return {
    ok: true,
    read: read && read.read ? read : null,
    last_attempt_at: typeof j.last_attempt_at === 'string' ? j.last_attempt_at : null,
    last_status: j.last_status ?? null,
  }
}

/**
 * One view's handle on the strategist. `run` starts (or joins) a read and
 * makes it this view's current one; `state` is that run as it streams. Two
 * views running the same input share one model call and one state.
 */
export function useStrategist() {
  const [, setV] = useState(0)
  const [key, setKey] = useState<string | null>(null)

  useEffect(() => {
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])

  const run = useCallback((input: StrategistRequest, opts: { fresh?: string | number | null } = {}) => {
    setKey(runKey(input, opts.fresh))
    return runStrategist(input, opts)
  }, [])

  const latest = useCallback((target: StrategistTarget) => latestStrategist(target), [])

  /** Forget the current run in this view (the store keeps it for others). */
  const reset = useCallback(() => setKey(null), [])

  const state = (key ? runs.get(key) : null) ?? IDLE
  return { state, run, latest, reset }
}
