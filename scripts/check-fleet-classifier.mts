// Guards the two pure functions the fleet observer classifies on.
//
// api/health/fleet-reconcile.ts is the only health signal in the OS that is not
// self-reported by the thing being measured, so what it says is what anyone
// acting on a fleet failure will believe. Both of its judgements are ordering
// sensitive and both got the order wrong the first time:
//
//   1. n8n wraps almost every non-2xx in "Forbidden - perhaps check your
//      credentials?" and puts the real cause in error.description. Testing
//      credential before quota read Zara's blown plan limit and the
//      Orchestrator's Drive rate limit as broken keys, which sends someone
//      rotating a perfectly good credential instead of topping up a plan.
//   2. A scheduled workflow that ran zero times in the window is dead, not
//      idle. That is precisely the case no self-reported heartbeat can produce,
//      and it is the reason this observer exists at all.
//
// The changelog claimed these were caught by unit tests. They were not: no test
// existed. This is that test, so the claim is now true rather than deleted.
//
//   npx tsx scripts/check-fleet-classifier.mts

// The module imports api/_supabase.js, which throws at import time when the
// service-role env vars are absent. These are never used: nothing here touches
// the network, and both functions under test are pure.
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key-not-used'

const { classifyFailure, classifyStatus } = await import('../api/health/fleet-reconcile.ts')

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

function eq(actual: unknown, expected: unknown, what: string) {
  if (actual !== expected) bad(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/* ---------- classifyFailure ---------- */

// Real strings observed in the 2026-08-19 audit, message and description joined
// the way the route joins them.
eq(classifyFailure('Forbidden - perhaps check your credentials? | Monthly usage hard limit exceeded', 'NodeApiError 403'),
   'quota', 'Zara plan limit must not read as a credential fault')
eq(classifyFailure('Forbidden - perhaps check your credentials? | Quota exceeded for quota metric Queries', 'NodeApiError 403'),
   'quota', 'Drive queries-per-minute must not read as a credential fault')

// A genuine credential fault still classifies as one.
eq(classifyFailure('No API key found in request', 'NodeApiError 401'),
   'credential', 'missing api key is a credential fault')
eq(classifyFailure('Credentials not found', 'NodeOperationError'),
   'credential', 'deleted credential is a credential fault')
eq(classifyFailure("Node does not exist for type 'gmailOAuth2'", ''),
   'credential', 'unbound credential type is a credential fault')

eq(classifyFailure('connect ECONNREFUSED 10.0.0.1:443', ''), 'network', 'refused connection is network')
eq(classifyFailure('socket hang up', ''), 'network', 'hang up is network')

eq(classifyFailure("Cannot read properties of undefined (reading 'json')", 'TypeError'),
   'logic', 'undefined read is a logic fault')
eq(classifyFailure('Could not get parameter jsCode', 'ExpressionError'),
   'logic', 'expression error is a logic fault')

eq(classifyFailure('', ''), 'unknown', 'no evidence classifies as unknown, never as healthy')

/* ---------- classifyStatus ---------- */

// The case the whole observer exists for: switched on, on a schedule, and it
// has not run at all. Self-reported heartbeats cannot express this.
eq(classifyStatus({ active: true, isScheduled: true, runs: 0, errors: 0, lastSuccessAt: null }),
   'dead', 'scheduled and never ran is dead, not idle')

// Not scheduled and never ran is genuinely just idle: nothing was due.
eq(classifyStatus({ active: true, isScheduled: false, runs: 0, errors: 0, lastSuccessAt: null }),
   'idle', 'webhook-only workflow with no runs is idle')

// Switched off is idle whatever the history says.
eq(classifyStatus({ active: false, isScheduled: true, runs: 0, errors: 0, lastSuccessAt: null }),
   'idle', 'inactive workflow is idle')

eq(classifyStatus({ active: true, isScheduled: true, runs: 94, errors: 94, lastSuccessAt: null }),
   'dead', 'HARO at 94/94 is dead')
eq(classifyStatus({ active: true, isScheduled: true, runs: 10, errors: 6, lastSuccessAt: '2026-08-01' }),
   'failing', '60% error rate is failing')
eq(classifyStatus({ active: true, isScheduled: true, runs: 100, errors: 38, lastSuccessAt: '2026-08-01' }),
   'degraded', "Zara's 38% must surface as degraded, not healthy")
eq(classifyStatus({ active: true, isScheduled: true, runs: 100, errors: 0, lastSuccessAt: '2026-08-24' }),
   'healthy', 'clean run history is healthy')

// Erroring rarely but never once succeeding is not healthy: there is no
// evidence the workflow can complete at all.
eq(classifyStatus({ active: true, isScheduled: true, runs: 100, errors: 5, lastSuccessAt: null }),
   'failing', 'no success ever recorded is failing however low the rate')

if (fail) {
  console.log(`\n${fail} check(s) failed.`)
  process.exit(1)
}
console.log('fleet classifier: all checks passed')
