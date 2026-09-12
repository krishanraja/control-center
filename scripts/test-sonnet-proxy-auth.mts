#!/usr/bin/env tsx
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../api/internal/sonnet-proxy.js'

interface Result { status: number; body: unknown }

function response(): { res: VercelResponse; result: Result } {
  const result: Result = { status: 200, body: null }
  const res = {
    setHeader: () => res,
    status: (status: number) => { result.status = status; return res },
    json: (body: unknown) => { result.body = body; return res },
    send: (body: unknown) => { result.body = body; return res },
    end: () => res,
  } as unknown as VercelResponse
  return { res, result }
}

async function run(req: Partial<VercelRequest>, secret?: string): Promise<Result> {
  if (secret) process.env.N8N_PROXY_SECRET = secret
  else delete process.env.N8N_PROXY_SECRET
  delete process.env.ANTHROPIC_API_KEY
  const { res, result } = response()
  await handler({ headers: {}, body: {}, ...req } as VercelRequest, res)
  return result
}

function expect(label: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

const secret = 'test-only-high-entropy-n8n-proxy-secret'
expect('missing server secret fails closed', (await run({ method: 'POST', headers: { authorization: `Bearer ${secret}` } })).status, 401)
expect('missing bearer', (await run({ method: 'POST' }, secret)).status, 401)
expect('wrong bearer', (await run({ method: 'POST', headers: { authorization: 'Bearer wrong' } }, secret)).status, 401)
expect('caller stamp still required', (await run({ method: 'POST', headers: { authorization: `Bearer ${secret}` } }, secret)).status, 403)
expect('valid auth reaches provider configuration', (await run({
  method: 'POST',
  headers: { authorization: `Bearer ${secret}`, 'x-internal-caller': 'auth-test' },
  body: { model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] },
}, secret)).status, 503)
expect('wrong method', (await run({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, secret)).status, 405)
expect('preflight', (await run({ method: 'OPTIONS' }, secret)).status, 200)

delete process.env.N8N_PROXY_SECRET
console.log('PASS  sonnet proxy fails closed and accepts only the dedicated bearer path')
