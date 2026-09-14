/**
 * One retry policy for model calls, because an overload is weather.
 *
 * Anthropic returns 529 when it is overloaded and 429 when the account is
 * rate-limited. Both are transient and both used to be terminal here: every
 * call site was a bare fetch, so a single 529 failed the route, the enrichment,
 * or the whole n8n run behind the proxy. Nothing anywhere in this repo retried
 * a model call except api/_whisper.ts, which is OpenAI.
 *
 * What is deliberately NOT here: a fallback to another provider. A surface a
 * human reads should fail loudly rather than quietly answer from a model nobody
 * chose. Cross-provider fallback lives in the n8n workflows, where the output
 * is stamped `_llm_provider` and `_degraded` so the degradation is visible.
 */

/** Transient upstream statuses. A 4xx that is not 408/409/429 is a bad request:
 *  retrying sends the identical body for the identical answer. */
export const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529])

export interface RetryOpts {
  /** Total attempts including the first. Default 3. */
  tries?: number
  /** Base backoff in ms; doubles per attempt. Default 500. */
  baseDelayMs?: number
  /** Called once per retry, for logging. */
  onRetry?: (info: { attempt: number; status: number | null; waitMs: number }) => void
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * `fetch`, retried on transient upstream failures and transport errors.
 *
 * Honours `Retry-After` when the upstream sends one, capped so a long header
 * cannot eat a serverless function's whole budget. An AbortError is the
 * caller's deadline, never something to retry through.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOpts = {},
): Promise<Response> {
  const tries = Math.max(1, opts.tries ?? 3)
  const base = opts.baseDelayMs ?? 500
  let lastError: unknown = null

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(url, init)
      if (r.ok || !RETRY_STATUS.has(r.status) || attempt === tries) return r
      const header = Number(r.headers.get('retry-after'))
      const waitMs = Number.isFinite(header) && header > 0
        ? Math.min(header * 1000, 5000)
        : base * 2 ** (attempt - 1)
      opts.onRetry?.({ attempt, status: r.status, waitMs })
      // The body has to be drained or the connection is held for nothing.
      await r.text().catch(() => '')
      await sleep(waitMs)
    } catch (e) {
      // The caller's own deadline. Retrying past it defeats the deadline.
      if ((e as Error)?.name === 'AbortError') throw e
      lastError = e
      if (attempt === tries) break
      const waitMs = base * 2 ** (attempt - 1)
      opts.onRetry?.({ attempt, status: null, waitMs })
      await sleep(waitMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('upstream_unreachable')
}
