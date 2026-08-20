/**
 * Read a server-sent text stream, and fall back cleanly when there isn't one.
 *
 * The fallback is the point. Three routes stream; thirty do not, and converting
 * them is a separate decision for each. So this checks the response's own
 * content type rather than trusting the caller: a route that streams is
 * consumed as a stream, and a route that answers with JSON is consumed as JSON
 * and delivered as a single delta. The call site writes one code path either
 * way, and a route can be converted or reverted on the server without the UI
 * changing at all.
 */

export interface StreamOpts<T> {
  /** Called with each chunk of text as it lands. */
  onText: (chunk: string) => void
  /** Milliseconds of TOTAL silence permitted before giving up. */
  timeoutMs?: number
  signal?: AbortSignal
  /** Pull the text out of a non-streaming JSON body. */
  jsonText?: (body: T) => string
}

export interface StreamResult<T> {
  /** Everything that arrived, joined. */
  text: string
  /** The `done` payload, or the whole JSON body when the route did not stream. */
  data: T | null
  /** True when the response actually arrived incrementally. */
  streamed: boolean
}

export async function streamText<T = Record<string, unknown>>(
  url: string,
  init: RequestInit,
  opts: StreamOpts<T>,
): Promise<StreamResult<T>> {
  const { onText, timeoutMs = 90_000, jsonText } = opts

  // One controller for both the caller's abort and our own timeout, so a
  // cancelled stream actually closes the socket rather than being abandoned
  // while the server keeps generating into it.
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onAbort)
  // Re-armed on every chunk: the ceiling is silence, not total duration, so a
  // long answer that is still arriving is never cut off for being long.
  let timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  const bump = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: 'text/event-stream, application/json', ...(init.headers || {}) },
      signal: ctrl.signal,
    })

    const isStream = (res.headers.get('content-type') || '').includes('text/event-stream')

    if (!isStream || !res.body) {
      const body = await res.json().catch(() => null) as T | null
      if (!res.ok) {
        const err = (body as { error?: string } | null)?.error
        throw new Error(err || `Request failed (${res.status})`)
      }
      const text = body && jsonText ? jsonText(body) : ''
      if (text) onText(text)
      return { text, data: body, streamed: false }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let data: T | null = null

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bump()
      buffer += decoder.decode(value, { stream: true })

      // Keep the trailing partial frame: a chunk boundary lands mid-JSON often
      // enough that treating it as an edge case means dropping tokens.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        let event = 'message'
        let payload = ''
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) payload += line.slice(5).trim()
        }
        if (!payload) continue
        let parsed: unknown
        try { parsed = JSON.parse(payload) } catch { continue }

        if (event === 'delta') {
          const chunk = (parsed as { text?: string }).text || ''
          if (chunk) { text += chunk; onText(chunk) }
        } else if (event === 'done') {
          data = parsed as T
        } else if (event === 'error') {
          // A failure after the headers are out arrives here, not as a status.
          // Without this branch a mid-stream failure reads as a successful
          // empty answer, which is the worst of the three outcomes.
          const e = parsed as { error?: string; detail?: string }
          throw new Error(e.detail || e.error || 'Stream failed')
        }
      }
    }

    return { text, data, streamed: true }
  } finally {
    window.clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
