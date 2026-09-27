import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { gaFailure, ga4Identity, runGa4Batch, ga4AdminGet } from '../../api/_google.js'

// The GA client's failure shape is what lets the site check tell "the API is
// off" from "this email has no grant" from "the network blipped". Each of those
// has a different fix for Krish, so each must come back as a different reason.
// No fetch stubs and no key material: every case here is decided before a
// request would leave.

const WHO = 'reader@cc-analytics.iam.gserviceaccount.com (GA4_SERVICE_ACCOUNT_*)'
const GA_ENV = ['GA4_SERVICE_ACCOUNT_EMAIL', 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY']

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const saved = Object.fromEntries(GA_ENV.map(k => [k, process.env[k]]))
  for (const k of GA_ENV) delete process.env[k]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v
  try { return await fn() } finally {
    for (const k of GA_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  }
}

test('SERVICE_DISABLED gives its reason and the activation page', () => {
  // The shape Google returns when the Admin API is off in the SA project.
  const body = {
    error: {
      code: 403,
      message: 'Google Analytics Admin API has not been used in project 123 before or it is disabled.',
      status: 'PERMISSION_DENIED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', domain: 'googleapis.com',
          metadata: { service: 'analyticsadmin.googleapis.com', activationUrl: 'https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=123' } },
        { '@type': 'type.googleapis.com/google.rpc.Help', links: [] },
      ],
    },
  }
  const f = gaFailure(403, body, WHO)
  assert.equal(f.status, 403)
  assert.equal(f.reason, 'SERVICE_DISABLED')
  assert.equal(f.activationUrl, 'https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=123')
  assert.equal(f.error, `GA4 403 as ${WHO}: ${body.error.message}`)
})

test('a plain 403 gives PERMISSION_DENIED and no activation page', () => {
  const f = gaFailure(403, { error: { code: 403, message: 'User does not have sufficient permissions for this property.', status: 'PERMISSION_DENIED' } }, WHO)
  assert.equal(f.reason, 'PERMISSION_DENIED')
  assert.equal(f.activationUrl, null)
  assert.match(f.error, /^GA4 403 as .+: User does not have sufficient permissions/)
})

test('an empty or unparsed body gives an empty reason, not a guess', () => {
  for (const body of [{}, null, undefined, 'Bad Gateway', { error: {} }]) {
    const f = gaFailure(502, body, WHO)
    assert.equal(f.reason, '')
    assert.equal(f.activationUrl, null)
    assert.equal(f.error, `GA4 502 as ${WHO}: request failed`)
  }
})

test('runGa4Batch refuses more than five requests before asking Google', async () => {
  const six = Array.from({ length: 6 }, () => ({ metrics: [{ name: 'sessions' }] }))
  await assert.rejects(() => runGa4Batch('556143202', six), /runGa4Batch: at most 5 requests/)
})

test('an unset identity fails as CREDENTIALS with status 0, for batch and admin alike', async () => {
  await withEnv({}, async () => {
    const b = await runGa4Batch('556143202', [{ metrics: [{ name: 'sessions' }] }])
    assert.ok('error' in b)
    assert.equal(b.status, 0)
    assert.equal(b.reason, 'CREDENTIALS')
    assert.equal(b.activationUrl, null)
    assert.match(b.error, /EMAIL is unset/)
    const a = await ga4AdminGet('accountSummaries?pageSize=200')
    assert.ok('error' in a)
    assert.equal(a.reason, 'CREDENTIALS')
  })
})

test('ga4Identity names the email and project, never the key', async () => {
  const key = randomBytes(24).toString('hex')
  const id = await withEnv({ GA4_SERVICE_ACCOUNT_EMAIL: 'reader@cc-analytics.iam.gserviceaccount.com', GA4_SERVICE_ACCOUNT_PRIVATE_KEY: key }, () => ga4Identity())
  assert.deepEqual(id, { email: 'reader@cc-analytics.iam.gserviceaccount.com', project: 'cc-analytics', source: 'GA4_SERVICE_ACCOUNT_*' })
  assert.ok(!JSON.stringify(id).includes(key))
  const none = await withEnv({}, () => ga4Identity())
  assert.deepEqual(none, { email: null, project: null, source: 'GOOGLE_SERVICE_ACCOUNT_*' })
  const notSa = await withEnv({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'krish@themindmaker.ai' }, () => ga4Identity())
  assert.equal(notSa.project, null)
})
