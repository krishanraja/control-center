import assert from 'node:assert/strict'
import { test } from 'node:test'

// api/_walkthrough.ts imports _supabase at module load, which throws without
// credentials. Nothing here calls out: every function under test is pure or
// takes its fetch as an argument.
process.env.SUPABASE_URL ||= 'https://ci.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'not-a-real-key-tests-never-call-out'
const {
  firePayload, walkthroughPrompt, routineConfig, parseFireResponse, fireRoutine, mayRetry,
  ROUTINE_FIRE_BASE, STALE_FIRING_MS,
} = await import('../../api/_walkthrough.ts')

const READ = '0f8fad5b-d9cb-469f-a165-70867728950e'
const CFG = { routineId: 'trig_01ABC', token: 'sk-ant-oat01-test' }

test('the payload is the read id and nothing else', () => {
  const p = firePayload(READ)
  assert.deepEqual(Object.keys(p), ['text'])
  assert.equal(p.text, `read_id: ${READ}`)
})

test('anything that is not a read id is refused before a call is made', () => {
  assert.throws(() => firePayload('I want to launch the podcast and email Dean'))
  assert.throws(() => firePayload(`${READ} and also my note`))
  assert.throws(() => firePayload(''))
})

test('the hand-pasted prompt names the skill and the read, and nothing he said', () => {
  const p = walkthroughPrompt(READ)
  assert.match(p, /\.claude\/skills\/walkthrough\/SKILL\.md/)
  assert.match(p, new RegExp(READ))
})

test('a routine is configured only when both names are set and the id has its prefix', () => {
  assert.equal(routineConfig({}), null)
  assert.equal(routineConfig({ CLAUDE_WALKTHROUGH_ROUTINE_ID: 'trig_01ABC' }), null)
  assert.equal(routineConfig({ CLAUDE_WALKTHROUGH_ROUTINE_TOKEN: 'x' }), null)
  assert.equal(routineConfig({ CLAUDE_WALKTHROUGH_ROUTINE_ID: 'session_01', CLAUDE_WALKTHROUGH_ROUTINE_TOKEN: 'x' }), null)
  assert.deepEqual(
    routineConfig({ CLAUDE_WALKTHROUGH_ROUTINE_ID: ' trig_01ABC ', CLAUDE_WALKTHROUGH_ROUTINE_TOKEN: ' tok ' }),
    { routineId: 'trig_01ABC', token: 'tok' },
  )
})

test('a 200 counts only when it names a claude.ai session', () => {
  const good = JSON.stringify({ type: 'routine_fire', claude_code_session_id: 'session_01X', claude_code_session_url: 'https://claude.ai/code/session_01X' })
  assert.deepEqual(parseFireResponse(200, good), { ok: true, sessionId: 'session_01X', sessionUrl: 'https://claude.ai/code/session_01X' })
  assert.equal(parseFireResponse(200, '<html>maintenance</html>').ok, false)
  assert.equal(parseFireResponse(200, JSON.stringify({ type: 'routine_fire' })).ok, false)
  assert.equal(parseFireResponse(200, JSON.stringify({ type: 'routine_fire', claude_code_session_url: 'https://evil.example/x' })).ok, false)
})

test('each refusal says which one it was', () => {
  const code = (status: number) => {
    const r = parseFireResponse(status, '{}')
    return r.ok ? 'ok' : r.error.split(':')[0]
  }
  assert.equal(code(429), 'rate_limited')
  assert.equal(code(401), 'token_rejected')
  assert.equal(code(403), 'token_rejected')
  assert.equal(code(404), 'routine_not_found')
  assert.equal(code(503), 'unavailable')
  assert.equal(code(400), 'refused')
})

test('the fire call carries the token, the version and only the id', async () => {
  let seen: { url: string; headers: Record<string, string>; body: string } | null = null
  const out = await fireRoutine(CFG, READ, async (url, init) => {
    seen = { url, headers: init.headers, body: init.body }
    return { status: 200, text: async () => JSON.stringify({ type: 'routine_fire', claude_code_session_id: 's', claude_code_session_url: 'https://claude.ai/code/s' }) }
  })
  assert.equal(out.ok, true)
  assert.ok(seen)
  const s = seen as unknown as { url: string; headers: Record<string, string>; body: string }
  assert.equal(s.url, `${ROUTINE_FIRE_BASE}/trig_01ABC/fire`)
  assert.equal(s.headers.Authorization, 'Bearer sk-ant-oat01-test')
  assert.equal(s.headers['anthropic-version'], '2023-06-01')
  assert.deepEqual(JSON.parse(s.body), { text: `read_id: ${READ}` })
})

test('a timeout says a session may exist, so nobody fires twice blind', async () => {
  const out = await fireRoutine(CFG, READ, (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  }), 20)
  assert.equal(out.ok, false)
  assert.match((out as { error: string }).error, /^timed_out: a session may have started/)
})

test('a network failure is a failure, never a throw', async () => {
  const out = await fireRoutine(CFG, READ, async () => { throw new Error('ECONNRESET') })
  assert.deepEqual(out, { ok: false, error: 'network: ECONNRESET' })
})

test('the button re-fires only what did not start', () => {
  const now = Date.parse('2026-10-08T10:00:00Z')
  const at = (msAgo: number) => new Date(now - msAgo).toISOString()
  assert.equal(mayRetry({ status: 'started', updated_at: at(10 * 60_000) }, now), false)
  assert.equal(mayRetry({ status: 'failed', updated_at: at(1_000) }, now), true)
  assert.equal(mayRetry({ status: 'not_configured', updated_at: at(1_000) }, now), true)
  assert.equal(mayRetry({ status: 'firing', updated_at: at(5_000) }, now), false)
  assert.equal(mayRetry({ status: 'firing', updated_at: at(STALE_FIRING_MS + 1) }, now), true)
  assert.equal(mayRetry({ status: 'firing', updated_at: null }, now), false)
})
