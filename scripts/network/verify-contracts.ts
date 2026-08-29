#!/usr/bin/env -S npx tsx
// Contract tests for the two pieces of /api/network/* that can be checked
// without a database or an API key: the access gate, and the sanitiser that
// stands between a language model's output and a database call.
//
// Both are security-shaped, which is why they get real assertions rather than a
// reading. Run:
//   SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x npx tsx scripts/network/verify-contracts.ts
// (the env vars are only needed because api/_supabase.ts throws at import time;
// nothing here connects to anything.)

import { createHash } from 'node:crypto'
import { hasAccess } from '../../api/_auth'
import { sanitizePlan } from '../../api/_networkQuery'

let pass = 0, fail = 0
const t = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}`) }
}
const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as never

console.log('── _auth.hasAccess ──')
process.env.ACCESS_CODE = 'hunter2'
const good = createHash('sha256').update('hunter2').digest('hex')
t('no cookie -> denied',                hasAccess(req()) === false)
t('wrong cookie -> denied',             hasAccess(req('cc_access=deadbeef')) === false)
t('correct cookie -> allowed',          hasAccess(req(`cc_access=${good}`)) === true)
t('correct among other cookies -> allowed', hasAccess(req(`foo=1; cc_access=${good}; bar=2`)) === true)
t('cookie minted from a different code -> denied',
  hasAccess(req(`cc_access=${createHash('sha256').update('hunter3').digest('hex')}`)) === false)
t('prefix of a valid token -> denied',  hasAccess(req(`cc_access=${good.slice(0, 30)}`)) === false)
t('valid token plus junk -> denied',    hasAccess(req(`cc_access=${good}x`)) === false)
delete process.env.ACCESS_CODE
// Deliberate, and it matches middleware.ts: a dropped env var must not lock
// Krish out of his own dashboard.
t('ACCESS_CODE unset -> fails OPEN, as middleware.ts does', hasAccess(req()) === true)

console.log('── _networkQuery.sanitizePlan ──')
const p1 = sanitizePlan({
  restated: 'CMOs at banks',
  semantic_query: 'a chief marketing officer at a regulated bank',
  keywords: 'chief marketing bank',
  venture: 'mindmake',
  constraints: [
    { field: 'title', values: ['chief marketing'], weight: 1 },
    { field: 'seniority', values: ['founder_cxo'], weight: 0.8 },
  ],
}, 'raw')
t('a valid plan survives intact', p1.constraints.length === 2 && p1.venture === 'mindmake')

const p2 = sanitizePlan({
  constraints: [
    { field: 'email', values: ['x@y.com'], weight: 1 },       // not allow-listed
    { field: 'password', values: ['hunter2'], weight: 1 },    // not allow-listed
    { field: 'country', values: ['Australia'], weight: 99 },  // weight out of range
    { field: 'roles', values: [], weight: 1 },                // no values
  ],
  venture: 'not_a_venture',
}, 'raw fallback')
t('fields outside the allow-list are dropped', p2.constraints.every(c => !['email', 'password'].includes(c.field)))
t('only the one valid constraint survives', p2.constraints.length === 1 && p2.constraints[0].field === 'country')
t('weight clamped to <= 1', p2.constraints[0].weight === 1)
t('unknown venture nulled', p2.venture === null)
t('missing semantic_query falls back to the question', p2.semantic_query === 'raw fallback')

const p3 = sanitizePlan(null, 'the question')
t('a null plan degrades to the raw question', p3.semantic_query === 'the question' && p3.constraints.length === 0)

const p4 = sanitizePlan({ constraints: Array.from({ length: 40 }, () => ({ field: 'country', values: ['X'], weight: 1 })) }, 'q')
t('constraint list capped at 8', p4.constraints.length === 8)

const p5 = sanitizePlan({ restated: 'x'.repeat(5000), semantic_query: 'y'.repeat(9000) }, 'q')
t('strings are length-capped', p5.restated.length <= 300 && p5.semantic_query.length <= 1200)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
