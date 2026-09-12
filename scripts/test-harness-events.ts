import { parseHarnessEvent } from '../api/harness/_event.js'
import { persistHarnessEvent, type EventStoreReply } from '../api/harness/_store.js'

const base = {
  event_id: 'codex:session:01J0000000000000',
  schema_version: 1,
  occurred_at: '2026-09-12T10:00:00.000Z',
  surface: 'codex',
  kind: 'failure',
  summary: 'A verified build returned success without writing the expected output.',
  evidence_ref: 'session:01J0000000000000#turn-18',
  related_skill_or_rule: 'krish-build.green-checkmark',
  outcome: 'failed',
  severity: 'high',
  confidence: 'high',
}

let passed = 0
let failed = 0
function test(name: string, condition: boolean) {
  if (condition) passed += 1
  else failed += 1
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`)
}

const first = parseHarnessEvent(base)
const second = parseHarnessEvent({ ...base })
test('accepts the minimal versioned envelope', first.ok)
test('normalization and payload hash are deterministic', first.ok && second.ok && first.event.payload_sha256 === second.event.payload_sha256)

const secret = parseHarnessEvent({ ...base, summary: 'The API key = sk-123456789012345678901234 should never persist.' })
test('rejects a likely secret before persistence', 'error' in secret && secret.error === 'sensitive_content_rejected')

const localPath = parseHarnessEvent({ ...base, evidence_ref: 'C:\\Users\\person\\session.json' })
test('rejects absolute personal-machine paths', 'error' in localPath && localPath.error === 'sensitive_content_rejected')

const email = parseHarnessEvent({ ...base, summary: 'The failed task exposed a named customer at person@example.com.' })
test('rejects email-shaped personal data', 'error' in email && email.error === 'sensitive_content_rejected')

const transcript = parseHarnessEvent({ ...base, transcript: 'raw conversation' })
test('rejects non-contract fields such as transcripts', 'error' in transcript && transcript.error.startsWith('unknown_fields:'))

const future = parseHarnessEvent({ ...base, occurred_at: '2099-01-01T00:00:00Z' })
test('rejects implausible future timestamps', 'error' in future && future.error === 'occurred_at_in_future')

const long = parseHarnessEvent({ ...base, summary: 'x'.repeat(801) })
test('enforces the summary budget', 'error' in long && long.error === 'invalid_summary_length')

const badKind = parseHarnessEvent({ ...base, kind: 'rewrite_the_canon' })
test('rejects authority-expanding event kinds', 'error' in badKind && badKind.error === 'invalid_kind')

const oversized = parseHarnessEvent({ ...base, summary: 'A'.repeat(700), evidence_ref: 'B'.repeat(300), related_skill_or_rule: 'C'.repeat(160), padding: 'D'.repeat(4000) })
test('rejects oversized request bodies before persistence', 'error' in oversized && oversized.error === 'body_too_large')

function clientWith(insertResult: EventStoreReply, readResult: EventStoreReply = { data: null, errorCode: 'not_found' }) {
  return {
    async insert() { return insertResult },
    async findByEventId() { return readResult },
  }
}

if (!first.ok) throw new Error('fixture must parse')
const created = await persistHarnessEvent(clientWith({ data: { inbox_id: 1, event_id: first.event.event_id, payload_sha256: first.event.payload_sha256 }, errorCode: null }), first.event)
test('returns a durable receipt for a new insert', created.status === 201 && created.body.duplicate === false)

const missingReceipt = await persistHarnessEvent(clientWith({ data: null, errorCode: null }), first.event)
test('does not treat an empty write response as success', missingReceipt.status === 500 && missingReceipt.body.error === 'receipt_readback_failed')

const duplicateRow = { inbox_id: 1, event_id: first.event.event_id, payload_sha256: first.event.payload_sha256 }
const duplicate = await persistHarnessEvent(clientWith({ data: null, errorCode: '23505' }, { data: duplicateRow, errorCode: null }), first.event)
test('same id and payload returns the original receipt', duplicate.status === 200 && duplicate.body.duplicate === true)

const conflict = await persistHarnessEvent(clientWith({ data: null, errorCode: '23505' }, { data: { ...duplicateRow, payload_sha256: 'f'.repeat(64) }, errorCode: null }), first.event)
test('same id with a different payload is a conflict', conflict.status === 409 && conflict.body.error === 'event_id_conflict')

console.log(`\n${failed === 0 ? 'HARNESS EVENT CONTRACT OK' : 'HARNESS EVENT CONTRACT FAILURES'}: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
