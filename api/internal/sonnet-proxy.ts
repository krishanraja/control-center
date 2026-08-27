import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PROXY_ALLOWED_MODELS } from '../_models.js'

// Internal-only Anthropic proxy. n8n workflows that can't share the
// Anthropic credential (workflow-level credential scoping in n8n Cloud)
// POST here instead and the Vercel function forwards to Anthropic with
// the ANTHROPIC_API_KEY env var.
//
// Loose internal-only protection:
//   - Requires X-Internal-Caller header
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
  messages?: unknown
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://controlcenter.krishraja.com')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Caller')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

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

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text)
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_error', detail: (e as Error).message })
  }
}
