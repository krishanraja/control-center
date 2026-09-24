import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { PROXY_ALLOWED_MODELS } from '../_models.js'
import * as meter from '../_meter.js'
import { fetchWithRetry, RETRY_STATUS } from '../_retry.js'
import {
  anthropicIsShut, openBreaker, shouldFallBack, askRescueMessages,
  asAnthropicResponse, flattenContent, understudyFor, RESCUE_PROVIDER,
} from '../_providerFallback.js'

// Internal-only Anthropic proxy. n8n workflows that can't share the
// Anthropic credential (workflow-level credential scoping in n8n Cloud)
// POST here instead and the Vercel function forwards to Anthropic with
// the ANTHROPIC_API_KEY env var.
//
// Fail-closed machine authentication:
//   - Requires Authorization: Bearer $N8N_PROXY_SECRET
//   - Requires X-Internal-Caller as the metering/audit identity
//   - Requires body.model to be a known Anthropic model
//   - Caps max_tokens
//
// Not exposed in UI navigation; do NOT use from the browser.

// Deliberately wider than the model constants: a checked-in workflow keeps
// sending its old ID until that workflow is redeployed, so a proxy that only
// accepted the current tier would 400 the fleet in the window between the
// Vercel deploy and the n8n one. Old IDs come out of PROXY_ALLOWED_MODELS once
// no live workflow sends them.
const ALLOWED_MODELS = new Set<string>([...PROXY_ALLOWED_MODELS, 'claude-opus-4-7'])
const MAX_TOKENS_CEILING = 8000

interface AnthropicBody {
  model?: string
  max_tokens?: number
  system?: string
  temperature?: number
  messages?: unknown
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://controlcenter.krishraja.com')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Internal-Caller')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (guardBearerExport(req, res, 'N8N_PROXY_SECRET', ['POST'])) return

  const caller = (req.headers['x-internal-caller'] || '').toString()
  if (!caller || caller.length < 4) {
    return res.status(403).json({ ok: false, error: 'X-Internal-Caller header required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ ok: false, error: 'missing_anthropic_key' })

  const body = (req.body || {}) as AnthropicBody
  if (!body.model || !ALLOWED_MODELS.has(body.model)) {
    return res.status(400).json({ ok: false, error: 'unknown_model' })
  }
  if (typeof body.max_tokens !== 'number' || body.max_tokens < 1) {
    return res.status(400).json({ ok: false, error: 'max_tokens required' })
  }
  if (body.max_tokens > MAX_TOKENS_CEILING) {
    body.max_tokens = MAX_TOKENS_CEILING
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'messages required' })
  }

  /**
   * Answer through the rescue provider and hand n8n Anthropic's own shape back.
   *
   * This is the single highest-leverage place in the repo to put a fallback.
   * Forty-five Anthropic nodes across the checked-in mirrors call the provider
   * directly, and eleven of them grew a hand-written Gemini branch: a body
   * builder that had to find the prompt, a second HTTP node, and a parse node
   * that had to read Google's response shape instead of Anthropic's. Nine of
   * the eleven were broken from the day they were written, and nothing said so
   * because `neverError: true` renders a 404 as a green node.
   *
   * A workflow that goes through here needs none of that. It sends one request,
   * gets Anthropic's shape back whoever answered, and its existing parse node
   * keeps working. The fallback becomes a property of the transport rather than
   * eleven copies of a pattern that has to be maintained by hand.
   */
  const toRescue = async (why: string) => {
    console.warn(`sonnet_proxy_rescue caller=${caller} model=${body.model} reason=${why.slice(0, 120)}`)
    const turns = (body.messages as Array<{ role?: string; content?: unknown }>)
      .filter(m => m?.role === 'user' || m?.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: flattenContent(m.content) }))
      .filter(m => m.content)
    if (!turns.length) throw new Error('rescue_no_usable_turns')
    const text = await askRescueMessages(
      typeof body.system === 'string' ? body.system : '',
      turns,
      {
        agent: caller,
        model: body.model as string,
        maxTokens: body.max_tokens,
        temperature: body.temperature,
      },
    )
    // Tokens are metered inside askRescueMessages against the OpenRouter
    // provider with the biller's own cost. The counts echoed back to n8n are
    // zeros rather than a re-derived guess: the workflow's own telemetry nodes
    // multiply them by a hardcoded Anthropic rate, and feeding those a real
    // token count for a call the meter has ALREADY priced would double-count
    // the same spend in two places under two different numbers.
    return asAnthropicResponse(text, understudyFor(body.model as string), { inputTokens: 0, outputTokens: 0 })
  }

  // A known outage costs nothing here either. The two workflows on the proxy
  // today run on a schedule, so without this each tick pays a doomed round trip.
  if (await anthropicIsShut()) {
    try {
      const payload = await toRescue('breaker_open')
      res.setHeader('X-Rescued-By', RESCUE_PROVIDER)
      return res.status(200).json(payload)
    } catch (e) {
      console.warn(`sonnet_proxy_rescue_failed: ${(e as Error)?.message?.slice(0, 120)}`)
      return res.status(503).json({ ok: false, error: 'anthropic_unavailable_and_rescue_failed', detail: (e as Error).message })
    }
  }

  try {
    // An overload forwarded verbatim becomes an n8n node failure, and the
    // workflow behind it then falls back to a second provider for something
    // that would have answered on the next attempt. Absorb it here, once.
    const r = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }, {
      onRetry: ({ attempt, status, waitMs }) =>
        console.warn(`sonnet_proxy_retry caller=${caller} model=${body.model} attempt=${attempt} status=${status} wait=${waitMs}ms`),
    })
    const text = await r.text()
    // The X-Internal-Caller the proxy already demands is the agent stamp: this
    // is the one route by which n8n Anthropic spend becomes attributable at
    // all, so it meters here rather than nowhere.
    try {
      const j = JSON.parse(text) as { usage?: unknown }
      await meter.anthropicCall({ agent: caller, model: body.model, usage: j?.usage, failed: !r.ok })
      if (!r.ok && RETRY_STATUS.has(r.status)) {
        console.warn(`sonnet_proxy_exhausted caller=${caller} model=${body.model} status=${r.status}`)
      }
    } catch { /* an unparseable body is Anthropic's problem, not the meter's */ }

    if (!r.ok) {
      const msg = `anthropic_${r.status}:${text.slice(0, 160)}`
      if (shouldFallBack(new Error(msg))) {
        void openBreaker(msg)
        try {
          const payload = await toRescue(msg)
          res.setHeader('X-Rescued-By', RESCUE_PROVIDER)
          return res.status(200).json(payload)
        } catch (fe) {
          // Fall through to the verbatim upstream status. The caller's own
          // error branch is better than an invented one, and the Anthropic
          // failure is the cause rather than this consequence.
          console.warn(`sonnet_proxy_rescue_failed: ${(fe as Error)?.message?.slice(0, 120)}`)
        }
      }
    }
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text)
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_error', detail: (e as Error).message })
  }
}
