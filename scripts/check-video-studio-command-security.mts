import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  guardVideoStudioOperatorMutation,
  guardVideoStudioOperatorRead,
  guardVideoStudioRunner,
  issueVideoStudioCsrfToken,
  verifyVideoStudioRunnerReceipt,
} from '../api/_videoStudioAuth.js'

class MockResponse {
  statusCode = 200
  body: unknown
  headers = new Map<string, string | number | readonly string[]>()

  status(code: number) {
    this.statusCode = code
    return this
  }

  json(value: unknown) {
    this.body = value
    return this
  }

  setHeader(name: string, value: string | number | readonly string[]) {
    this.headers.set(name.toLowerCase(), value)
    return this
  }
}

function request(method: string, headers: Record<string, string> = {}): VercelRequest {
  return { method, headers, query: {}, cookies: {}, body: undefined } as unknown as VercelRequest
}

function response(): { raw: MockResponse; value: VercelResponse } {
  const raw = new MockResponse()
  return { raw, value: raw as unknown as VercelResponse }
}

const envNames = [
  'ACCESS_CODE', 'APP_ORIGIN', 'VIDEO_STUDIO_CSRF_SECRET',
  'VIDEO_STUDIO_RUNNER_TOKEN', 'VIDEO_STUDIO_RUNNER_SIGNING_KEY',
] as const
const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))

try {
  const accessCode = 'synthetic-access-code'
  const accessCookie = createHash('sha256').update(accessCode).digest('hex')
  process.env.ACCESS_CODE = accessCode
  process.env.APP_ORIGIN = 'https://control.example.test'
  process.env.VIDEO_STUDIO_CSRF_SECRET = 'c'.repeat(32)

  {
    const res = response()
    assert.equal(guardVideoStudioOperatorRead(request('GET'), res.value), true)
    assert.equal(res.raw.statusCode, 401)
    assert.equal(res.raw.headers.get('cache-control'), 'no-store')
    assert.equal(res.raw.headers.get('vary'), 'Cookie')
    assert.equal(res.raw.headers.has('access-control-allow-origin'), false)
  }

  const readRequest = request('GET', { cookie: `cc_access=${accessCookie}` })
  {
    const res = response()
    assert.equal(guardVideoStudioOperatorRead(readRequest, res.value), false)
    assert.equal(res.raw.headers.get('cross-origin-resource-policy'), 'same-origin')
  }

  const csrf = issueVideoStudioCsrfToken(readRequest)
  assert.ok(csrf)
  const mutationHeaders = {
    cookie: `cc_access=${accessCookie}`,
    origin: 'https://control.example.test',
    'content-type': 'application/json; charset=utf-8',
    'x-video-studio-csrf': csrf.token,
  }
  {
    const res = response()
    assert.equal(guardVideoStudioOperatorMutation(request('POST', mutationHeaders), res.value), false)
    assert.equal(res.raw.headers.get('vary'), 'Cookie, Origin')
  }
  for (const [name, headers, expectedStatus] of [
    ['origin', { ...mutationHeaders, origin: 'https://evil.example.test' }, 403],
    ['csrf', { ...mutationHeaders, 'x-video-studio-csrf': 'v1.0000000000.invalid' }, 403],
    ['content type', { ...mutationHeaders, 'content-type': 'text/plain' }, 415],
    ['JSON-like content type', { ...mutationHeaders, 'content-type': 'application/jsonp' }, 415],
  ] as const) {
    const res = response()
    assert.equal(guardVideoStudioOperatorMutation(request('POST', headers), res.value), true, name)
    assert.equal(res.raw.statusCode, expectedStatus, name)
  }
  {
    const res = response()
    assert.equal(guardVideoStudioOperatorMutation(request('GET', mutationHeaders), res.value), true)
    assert.equal(res.raw.statusCode, 405)
    assert.equal(res.raw.headers.get('allow'), 'POST')
  }

  process.env.APP_ORIGIN = 'http://control.example.test'
  {
    const res = response()
    assert.equal(guardVideoStudioOperatorRead(readRequest, res.value), true)
    assert.equal(res.raw.statusCode, 503)
  }
  process.env.APP_ORIGIN = 'http://localhost:5173'
  {
    const res = response()
    assert.equal(guardVideoStudioOperatorRead(readRequest, res.value), false)
  }
  process.env.APP_ORIGIN = 'https://control.example.test'

  const runnerHeaders = (token: string) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  })
  process.env.VIDEO_STUDIO_RUNNER_TOKEN = 'short'
  {
    const res = response()
    assert.equal(guardVideoStudioRunner(request('POST', runnerHeaders('short')), res.value), true)
    assert.equal(res.raw.statusCode, 503)
  }
  const runnerToken = 'r'.repeat(32)
  process.env.VIDEO_STUDIO_RUNNER_TOKEN = runnerToken
  {
    const res = response()
    assert.equal(guardVideoStudioRunner(request('POST', runnerHeaders('wrong-token'.repeat(4))), res.value), true)
    assert.equal(res.raw.statusCode, 401)
  }
  {
    const res = response()
    assert.equal(guardVideoStudioRunner(request('POST', runnerHeaders(runnerToken)), res.value), false)
    assert.equal(res.raw.headers.get('vary'), 'Authorization')
    assert.equal(res.raw.headers.has('access-control-allow-origin'), false)
  }
  {
    const res = response()
    assert.equal(guardVideoStudioRunner(request('POST', {
      ...runnerHeaders(runnerToken),
      'content-type': 'application/jsonp',
    }), res.value), true)
    assert.equal(res.raw.statusCode, 415)
  }

  const receiptHash = 'a'.repeat(64)
  process.env.VIDEO_STUDIO_RUNNER_SIGNING_KEY = 'short'
  assert.equal(verifyVideoStudioRunnerReceipt(receiptHash, 'b'.repeat(64)), 'unconfigured')
  const signingKey = 's'.repeat(32)
  process.env.VIDEO_STUDIO_RUNNER_SIGNING_KEY = signingKey
  assert.equal(verifyVideoStudioRunnerReceipt(receiptHash, 'b'.repeat(64)), 'invalid')
  assert.equal(
    verifyVideoStudioRunnerReceipt(receiptHash, createHmac('sha256', signingKey).update(receiptHash).digest('hex')),
    'valid',
  )
} finally {
  for (const name of envNames) {
    const value = previous[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

console.log('video studio command security invariants passed')
