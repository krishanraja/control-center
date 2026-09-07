/**
 * The one way an operator-facing write or read reaches /api on a slow link.
 *
 * A bare fetch has three failure modes that all look the same from the chair:
 * the phone is offline, the request is hanging on a bad connection, or the
 * server said no. Each ends with a disabled button and a spinner that never
 * stops, which reads as "broken" and gets reloaded, losing whatever was typed.
 *
 * So every call through here:
 *   - refuses at once when the device says it is offline, with a sentence
 *     that says so, instead of hanging until the OS gives up;
 *   - carries a timeout, so a hung request becomes an error the surface can
 *     show and the operator can retry, rather than a wait with no end;
 *   - returns the status and the parsed body together and does NOT throw on a
 *     non-2xx, because some routes speak in status codes (the goal gate's 422
 *     carries the verdict the form needs to show). Only the transport throws.
 *
 * Every thrown error is an ApiError with a message that can go straight on
 * screen: plain English, no status codes, no "Failed to fetch".
 */

const API = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  kind: 'offline' | 'timeout' | 'network' | 'server'
  status: number | null
  constructor(kind: ApiError['kind'], message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function isOffline(): boolean {
  try { return typeof navigator !== 'undefined' && navigator.onLine === false } catch { return false }
}

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Past this, the request is abandoned and an ApiError('timeout') is thrown. */
  timeoutMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

export interface JsonResult<T> {
  status: number
  ok: boolean
  json: T | null
}

function seconds(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${s} second${s === 1 ? '' : 's'}`
}

/**
 * Fetch JSON from an /api path. Resolves with the status and body for any HTTP
 * answer; throws an ApiError only when no answer came (offline, timeout, or a
 * dropped connection).
 */
export async function requestJson<T = Record<string, unknown>>(path: string, opts: RequestOpts = {}): Promise<JsonResult<T>> {
  const { method = 'GET', body, timeoutMs = 15_000, signal, headers } = opts
  if (isOffline()) {
    throw new ApiError('offline', 'You are offline. This will not save until the connection is back.')
  }
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = window.setTimeout(() => ctrl.abort('timeout'), timeoutMs)
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => null)) as T | null
    return { status: res.status, ok: res.ok, json }
  } catch (e) {
    if (isOffline()) {
      throw new ApiError('offline', 'The connection dropped. This will not save until it is back.')
    }
    if (ctrl.signal.aborted && signal?.aborted) throw e
    if (ctrl.signal.aborted) {
      throw new ApiError('timeout', `No answer after ${seconds(timeoutMs)}. Check the connection and try again.`)
    }
    throw new ApiError('network', 'Could not reach the server. Check the connection and try again.')
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * The common shape: a route that answers `{ ok, error? }`. Returns the body on
 * success; throws an ApiError with the route's own sentence on failure.
 */
export async function requestOk<T extends { ok?: boolean; error?: string } = { ok: boolean; error?: string }>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const { status, ok, json } = await requestJson<T>(path, opts)
  if (!ok || !json || json.ok === false) {
    const detail = json?.error
    throw new ApiError('server', detail ? humanise(detail) : `The server could not do that (${status}).`, status)
  }
  return json
}

/** A route's error string, made fit for a sentence on screen. */
function humanise(s: string): string {
  const t = s.trim().replace(/^"|"$/g, '')
  if (!t) return 'That did not save.'
  return /[.!?]$/.test(t) ? t : `${t}.`
}

/** The message to show for any thrown value from these helpers. */
export function failureMessage(e: unknown, fallback = 'That did not save. Try again.'): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error && e.message && e.message !== 'Failed to fetch') return e.message
  return fallback
}
