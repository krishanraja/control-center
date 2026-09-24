import type { VercelResponse } from '@vercel/node'
import { supportsSampling, anthropicKey } from './_content.js'
import { thinkingParam } from './_models.js'
import * as meter from './_meter.js'
import { fetchWithRetry } from './_retry.js'
import { anthropicIsShut, openBreaker, shouldFallBack, streamRescue } from './_providerFallback.js'

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
  /** Optional. Omit it and the key is resolved here, which also reaches the
   *  app_secrets recovery path the routes could not reach for themselves. */
  apiKey?: string
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
  /** Ask for adaptive thinking. Off by default, and explicitly sent as
   *  disabled on models that would otherwise run it: omitting the field on
   *  Sonnet 5 spends the whole max_tokens budget on reasoning and streams no
   *  text at all, which reaches the client as a successful empty answer. */
  think?: boolean
  /** Called with each text delta, so the caller can both relay and accumulate. */
  onText: (chunk: string) => void
  signal?: AbortSignal
  /** Agent stamp for the usage meter. A stream reports its token counts in the
   *  SSE itself (`message_start` carries input, `message_delta` carries output),
   *  so a streamed call is metered exactly like a blocking one. */
  agent?: string
  /** Opt out of the rescue provider, matching callClaude. Nothing uses it yet:
   *  every streaming route is a human waiting on an answer, which is the case
   *  the rescue is FOR. */
  fallback?: boolean
}

/**
 * Call Anthropic with `stream: true` and pull text deltas out of its SSE.
 *
 * Returns the accumulated text so the caller still has the whole answer for the
 * things that need it whole: the audit log, the database write, the `done`
 * payload. Streaming is an addition to those, never a replacement.
 */
export async function streamClaude(opts: StreamClaudeOpts): Promise<string> {
  const mayFallBack = opts.fallback !== false

  /**
   * Stream the same answer from the rescue provider instead.
   *
   * Only ever called while `out` is still empty. Once a delta has gone to the
   * client there is no honest switch: the client would receive the first half
   * of one answer followed by the whole of another, and no amount of metering
   * would make that a correct reply.
   */
  const toRescue = async (why: string): Promise<string> => {
    console.warn(`anthropic_fallback agent=${opts.agent || 'unattributed'} model=${opts.model} surface=stream reason=${why.slice(0, 120)}`)
    let acc = ''
    await streamRescue({
      agent: opts.agent,
      model: opts.model,
      system: opts.system,
      user: opts.messages[opts.messages.length - 1]?.content || '',
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      think: opts.think === true,
    }, (chunk) => { acc += chunk; opts.onText(chunk) })
    return acc
  }

  // The breaker first, before a socket is opened. Ask Marcus and the tab chats
  // are the surfaces a human is sitting in front of, and during the 2026-09-23
  // lockout they were also the only surfaces with no rescue at all: the
  // fallback was wired into callClaude, and this function was not callClaude.
  if (mayFallBack && await anthropicIsShut()) return toRescue('breaker_open')

  const apiKey = opts.apiKey || await anthropicKey()
  if (!apiKey) {
    if (mayFallBack) return toRescue('ANTHROPIC_API_KEY not configured')
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  // Only the opening request is retried. Once a byte has been written to the
  // client there is no honest retry: it would replay a partial answer.
  const r = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      ...thinkingParam(opts.model, opts.think === true),
      system: opts.system,
      messages: opts.messages,
      ...(opts.temperature !== undefined && supportsSampling(opts.model) ? { temperature: opts.temperature } : {}),
      stream: true,
    }),
    signal: opts.signal,
  }, { onRetry: ({ attempt, status, waitMs }) => console.warn(`anthropic_stream_retry attempt=${attempt} status=${status} wait=${waitMs}ms`) })

  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '')
    const msg = `anthropic_${r.status}: ${text.slice(0, 300)}`
    // Nothing has reached the client yet, so switching provider here is honest.
    if (shouldFallBack(new Error(msg))) {
      void openBreaker(msg)
      if (mayFallBack) {
        try {
          return await toRescue(msg)
        } catch (fe: unknown) {
          console.warn(`rescue_failed: ${(fe as Error)?.message?.slice(0, 120)}`)
        }
      }
    }
    throw new Error(msg)
  }

  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let out = ''
  // The whole usage object, accumulated across frames, rather than two numbers
  // plucked from it. Cache figures only appear on message_start.
  let usage: Record<string, unknown> = {}

  try {
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
            message?: { usage?: Record<string, unknown> }
            usage?: Record<string, unknown>
            error?: { message?: string }
          }
          if (evt.type === 'error') throw new Error(evt.error?.message || 'anthropic_stream_error')
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
            out += evt.delta.text
            opts.onText(evt.delta.text)
          }
          // Token counts arrive in their own frames, not with the text. The
          // whole usage object is kept, not two numbers off it: cache_read and
          // cache_creation ride along on message_start and were being dropped
          // here, which is one of the five places cache spend went unmeasured.
          if (evt.type === 'message_start' && evt.message?.usage) {
            usage = { ...usage, ...evt.message.usage }
          }
          if (evt.type === 'message_delta' && evt.usage) {
            // message_delta restates the running output count and nothing else,
            // so merging it wholesale would zero the input and cache figures
            // that only message_start carries.
            if (evt.usage.output_tokens != null) usage.output_tokens = evt.usage.output_tokens
          }
        } catch (e) {
          // A frame we cannot parse is not fatal on its own; a reported error is.
          if (e instanceof Error && e.message.startsWith('anthropic')) throw e
        }
      }
    }
  }

  } catch (e: unknown) {
    // A stream that died before emitting a single character can still be
    // answered by the other provider, and this is the common shape of an
    // overload: the connection opens, the error frame arrives, no text ever
    // does. The `!out` guard is the whole safety argument — once a delta has
    // been written, switching would splice two different answers together.
    //
    // An abort is the client leaving, not a provider failing. Rescuing it would
    // spend money answering nobody.
    const aborted = (e as Error)?.name === 'AbortError' || opts.signal?.aborted
    if (!out && !aborted) {
      const msg = (e as Error)?.message || 'anthropic_stream_error'
      if (shouldFallBack(new Error(msg))) void openBreaker(msg)
      if (mayFallBack) {
        try {
          return await toRescue(msg)
        } catch (fe: unknown) {
          console.warn(`rescue_failed: ${(fe as Error)?.message?.slice(0, 120)}`)
        }
      }
    }
    // Meter what the failed attempt already cost before giving up on it.
    if (Object.keys(usage).length) {
      await meter.anthropicCall({ agent: opts.agent, model: opts.model, usage, failed: true })
    }
    throw e
  }

  await meter.anthropicCall({ agent: opts.agent, model: opts.model, usage })
  return out
}
