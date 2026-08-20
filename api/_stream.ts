import type { VercelResponse } from '@vercel/node'
import { supportsSampling } from './_content.js'

/**
 * Server-sent events for the model calls a human sits and waits on.
 *
 * The problem this solves is not a slow API, it is a silent one. These routes
 * take 20 to 60 seconds and returned nothing at all until they were finished,
 * so the best possible client could only ever draw a nicer way of waiting. The
 * first sentence usually exists two seconds in; withholding it until the last
 * sentence is written is the whole wait.
 *
 * Deliberately small. Three event names, no framework:
 *
 *   delta  { text }   a chunk of the answer, append it
 *   done   { ...any } the final payload the non-streaming route used to return
 *   error  { error }  a failure AFTER headers are already out
 *
 * That last one is why `error` is an event rather than a status code. Once the
 * first byte is written the status is 200 forever, so a mid-stream failure has
 * to be reported in-band or it reads to the client as a successful empty
 * answer. A green transport carrying nothing is still a failure.
 */

export function openStream(res: VercelResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    // Belt and braces for any proxy that buffers by default.
    'X-Accel-Buffering': 'no',
  })
  // Flush the headers immediately so the client's reader resolves now rather
  // than when the first token happens to arrive.
  res.write(': open\n\n')
}

export function send(res: VercelResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function fail(res: VercelResponse, error: string, detail?: string): void {
  send(res, 'error', { error, detail })
  res.end()
}

export interface StreamClaudeOpts {
  apiKey: string
  model: string
  maxTokens: number
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Sampling temperature. Omit to let the caller inherit the provider default.
   *
   *  This was missing, and its absence was invisible: the non-streaming helpers
   *  in _content.ts default to 0.5 / 0.6, and every route that uses them tunes
   *  the value deliberately (0 for classifiers, 0.3 for graders, 0.5-0.6 for
   *  drafting). The streaming path silently ran at the provider default instead,
   *  so /content-ideas/:id/revise — the most-used rewrite surface in the
   *  composer — was the one generative call in the content engine with no
   *  temperature control at all. */
  temperature?: number
  /** Called with each text delta, so the caller can both relay and accumulate. */
  onText: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * Call Anthropic with `stream: true` and pull text deltas out of its SSE.
 *
 * Returns the accumulated text so the caller still has the whole answer for the
 * things that need it whole: the audit log, the database write, the `done`
 * payload. Streaming is an addition to those, never a replacement.
 */
export async function streamClaude(opts: StreamClaudeOpts): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      ...(opts.temperature !== undefined && supportsSampling(opts.model) ? { temperature: opts.temperature } : {}),
      stream: true,
    }),
    signal: opts.signal,
  })

  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '')
    throw new Error(`anthropic_${r.status}: ${text.slice(0, 300)}`)
  }

  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let out = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line. Anything after the last blank
    // line is a partial frame and has to stay in the buffer: a token boundary
    // that lands mid-JSON is the normal case, not an edge case.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          const evt = JSON.parse(raw) as {
            type?: string
            delta?: { type?: string; text?: string }
            error?: { message?: string }
          }
          if (evt.type === 'error') throw new Error(evt.error?.message || 'anthropic_stream_error')
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
            out += evt.delta.text
            opts.onText(evt.delta.text)
          }
        } catch (e) {
          // A frame we cannot parse is not fatal on its own; a reported error is.
          if (e instanceof Error && e.message.startsWith('anthropic')) throw e
        }
      }
    }
  }

  return out
}
