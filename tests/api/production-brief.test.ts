import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildProductionBrief,
  contentRevisionHash,
  createProductionApproval,
  normalizeProductionFormat,
  readProductionApproval,
} from '../../api/_productionBrief.ts'
import {
  hashLeaseToken,
  leaseTokenMatches,
  productionBriefCanBeClaimed,
  readProductionBriefEnvelope,
} from '../../api/video-studio/_productionBriefQueue.ts'

// Behaviour, not structure. The check-content-production-bridge guard asserts
// that certain lines exist in the routes; these assert what the pure halves of
// the bridge actually do with a row, an approval and a lease.

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  idea: 'When AI cuts implementation labour, who gets the saving?',
  thesis: 'The labour saving changes price, margin or scope only when the commercial mechanism lets it through.',
  body: 'Longer autonomous runs can mean fewer interventions and less delivery labour. Buyers still pay for risk and accountability, so the saving may never reach the invoice.',
  lane: 'publication',
  lane_slot: 'money_of_ai',
  source_url: 'https://example.com/evidence',
  meta: {
    editorial_route: {
      candidate: {
        audience_problem: 'Enterprise leaders need to know who captures the saving.',
        honest_payoff: 'A way to inspect whether AI changes price, margin or scope.',
        visual_proof: 'Show the task trace beside the commercial before and after.',
        source_urls: ['https://example.com/evidence'],
        hard_blocks: [],
        status: 'eligible',
      },
    },
  },
}

const approvedAt = '2026-09-07T12:00:00.000Z'

test('the revision hash ignores whitespace and timestamps but not the argument', () => {
  const base = contentRevisionHash(row)
  assert.equal(contentRevisionHash({ ...row, body: `  ${row.body}\n` }), base)
  assert.notEqual(contentRevisionHash({ ...row, body: row.body + ' Except when it does.' }), base)
  assert.notEqual(contentRevisionHash({ ...row, lane_slot: 'built_with_ai' }), base)
})

test('an approval round-trips and a tampered one is rejected', () => {
  const approval = createProductionApproval(row, approvedAt)
  assert.deepEqual(readProductionApproval(approval), approval)
  assert.equal(readProductionApproval({ ...approval, approved_by: 'Cleo' }), null)
  assert.equal(readProductionApproval({ ...approval, content_revision_hash: 'nope' }), null)
  assert.equal(readProductionApproval({ ...approval, approved_at: 'yesterday' }), null)
})

test('a brief binds to the approved revision and refuses a drifted one', () => {
  const approval = createProductionApproval(row, approvedAt)
  const brief = buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'solo', editorialFormat: 'money_trace' })
  assert.equal(brief.series, 'money_of_ai')
  assert.equal(brief.editorial_format, 'money_trace')
  assert.equal(brief.content_revision_hash, approval.content_revision_hash)
  assert.equal(brief.editorial_approval.approval_revision_hash, approval.content_revision_hash)
  assert.equal(brief.claims[0].verification, 'human_required')
  assert.throws(
    () => buildProductionBrief({ row: { ...row, body: row.body + ' New sentence.' }, approval, productionKinds: ['video'], sourceMode: 'solo', editorialFormat: 'money_trace' }),
    /approved_revision_changed/,
  )
  assert.throws(
    () => buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'written', editorialFormat: 'money_trace' }),
    /video_source_mode_required/,
  )
  assert.throws(
    () => buildProductionBrief({ row: { ...row, lane_slot: 'signal_noise' }, approval: createProductionApproval({ ...row, lane_slot: 'signal_noise' }, approvedAt), productionKinds: ['carousel'], sourceMode: 'written', editorialFormat: 'money_trace' }),
    /canonical_series_required/,
  )
})

test('formats stay inside their canonical series and retired input normalises to The Artifact', () => {
  assert.equal(normalizeProductionFormat('The Teardown', 'money_of_ai'), 'artifact')
  assert.equal(normalizeProductionFormat('third_why', 'money_of_ai'), null)
  assert.equal(normalizeProductionFormat('The Third Why', 'built_with_ai'), 'third_why')
})

test('the brief id is deterministic for the same identity and changes with the kinds', () => {
  const approval = createProductionApproval(row, approvedAt)
  const a = buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'solo', editorialFormat: 'money_trace' })
  const b = buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'solo', editorialFormat: 'money_trace' })
  const c = buildProductionBrief({ row, approval, productionKinds: ['video', 'carousel'], sourceMode: 'solo', editorialFormat: 'money_trace' })
  assert.equal(a.brief_id, b.brief_id)
  assert.notEqual(a.brief_id, c.brief_id)
})

test('a stored envelope fails closed when its hash or lease is malformed', () => {
  const approval = createProductionApproval(row, approvedAt)
  const brief = buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'solo', editorialFormat: 'money_trace' })
  const envelope = { brief, status: 'ready_for_studio', requested_by: 'Krish', created_at: approvedAt }
  const read = readProductionBriefEnvelope(envelope)
  assert.ok(read)
  assert.equal(read.status, 'ready_for_studio')
  assert.equal(readProductionBriefEnvelope({ ...envelope, brief_hash: 'a'.repeat(64) }), null)
  assert.equal(readProductionBriefEnvelope({ ...envelope, brief: { ...brief, editorial_format: 'third_why' } }), null)
  const { editorial_format: _legacyFormat, ...legacyBrief } = brief
  assert.ok(readProductionBriefEnvelope({ ...envelope, brief: legacyBrief }))
  assert.equal(readProductionBriefEnvelope({ ...envelope, requested_by: 'Cleo' }), null)
  assert.equal(readProductionBriefEnvelope({ ...envelope, lease: { runner_id_hash: 'short' } }), null)
})

test('a lease can be reclaimed only after it expires', () => {
  const approval = createProductionApproval(row, approvedAt)
  const brief = buildProductionBrief({ row, approval, productionKinds: ['video'], sourceMode: 'solo', editorialFormat: 'money_trace' })
  const lease = {
    runner_id_hash: 'b'.repeat(64),
    token_hash: hashLeaseToken('secret-token'),
    software_commit: 'unknown',
    claimed_at: '2026-09-07T12:00:00.000Z',
    expires_at: '2026-09-07T12:30:00.000Z',
  }
  const leased = readProductionBriefEnvelope({ brief, status: 'leased', requested_by: 'Krish', created_at: approvedAt, lease })
  assert.ok(leased)
  assert.equal(productionBriefCanBeClaimed(leased, new Date('2026-09-07T12:10:00.000Z')), false)
  assert.equal(productionBriefCanBeClaimed(leased, new Date('2026-09-07T12:31:00.000Z')), true)
  assert.equal(leaseTokenMatches(lease.token_hash, 'secret-token'), true)
  assert.equal(leaseTokenMatches(lease.token_hash, 'other-token'), false)
})
