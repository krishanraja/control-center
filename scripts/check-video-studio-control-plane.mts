import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import {
  parseBrowserCommandBody,
  parseRecoverFailedCommandBody,
  parseReviewDecisionBody,
  parseReviewPayload,
} from '../api/video-studio/_contracts.js'
import {
  parseRunnerClaimRequest,
  parseRunnerCompleteRequest,
  parseRunnerHeartbeatRequest,
  parseRunnerPreviewRetentionRequest,
  parseRunnerPreviewUploadRequest,
  parseRunnerProjectRequest,
  normalizeDatabaseTimestamp,
  projectClaimedCommand,
  runnerCommandHashInputV1,
} from '../api/video-studio/_runnerContracts.js'
import {
  BUILT_WITH_AI_WORDMARK_SRC,
  MINDMAKE_WORDMARK_SRC,
  MONEY_OF_AI_WORDMARK_SRC,
} from '../src/assets/videoBrandAssets.js'

process.env.SUPABASE_URL ||= 'https://video-studio-test.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-service-role-key-for-static-contract-test'
const {
  activeJobProjection,
  reviewDetailProjection,
  reviewListProjection,
  stablePayloadHash,
  validRecoveryReviewClone,
} = await import('../api/video-studio/_data.js')
const { normalizedStorageMd5Etag } = await import('../api/video-studio/_previewStorage.js')
const { videoStudioReviewIsWellFormed } = await import('../src/lib/videoStudio.js')
const { videoStudioReviewFixture } = await import('../e2e/fixtures/video-studio.js')

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)
const SHA_D = 'd'.repeat(64)
const SHA_E = 'e'.repeat(64)
const COMMAND_ID = '11111111-1111-4111-8111-111111111111'
const BRIDGE_COMMAND_ID = '33333333-3333-4333-8333-333333333333'
const IDEMPOTENCY_ID = '22222222-2222-4222-8222-222222222222'
const REVIEW_ID = '44444444-4444-4444-8444-444444444444'
const NOW = '2026-09-04T10:00:00.000Z'
const MD5_A = '1'.repeat(32)
const MD5_B = '2'.repeat(32)

const officialAssetHashes = new Map([
  [MINDMAKE_WORDMARK_SRC, '57fd2cdef929de2035baf5b0405a152878b26f7eba39b17b1d4c03f2470b9737'],
  [MONEY_OF_AI_WORDMARK_SRC, '1cdd6d7710c9970a1e86c8793b33acf6b3f63c81304aeb6efe84d392467322a6'],
  [BUILT_WITH_AI_WORDMARK_SRC, '271ab965dc51714be8c13c8a6bb8c7b2b60f4bf22caf51dda5a2928e295fd29f'],
])
for (const [dataUri, expectedHash] of officialAssetHashes) {
  const separator = dataUri.indexOf(',')
  assert.ok(separator > 0 && dataUri.slice(0, separator).endsWith(';base64'), 'brand asset must be embedded losslessly')
  assert.equal(
    createHash('sha256').update(dataUri.slice(separator + 1), 'base64').digest('hex'),
    expectedHash,
    'embedded brand asset must remain byte-for-byte identical to the official Mindmake source',
  )
}

const clientRecoverySource = structuredClone(videoStudioReviewFixture) as Record<string, any>
clientRecoverySource.status = 'approved'
clientRecoverySource.editorial_state = 'approved'
clientRecoverySource.decision_command = {
  id: IDEMPOTENCY_ID,
  kind: 'magic_edit_activate',
  status: 'failed',
  safe_code: 'attempts_exhausted',
  parent_revision_hash: clientRecoverySource.parent_revision_hash,
  parent_artifact_hash: clientRecoverySource.parent_artifact_hash,
  created_at: NOW,
  completed_at: NOW,
}
clientRecoverySource.recovery = {
  available: false,
  of_command_id: null,
  current_generation: 0,
  max_generation: 3,
  recovery_review_id: REVIEW_ID,
  recovered_review_id: null,
  binding_command: {
    id: BRIDGE_COMMAND_ID,
    kind: 'review_recovery_record',
    status: 'queued',
    safe_code: null,
    parent_revision_hash: clientRecoverySource.parent_revision_hash,
    parent_artifact_hash: clientRecoverySource.parent_artifact_hash,
    source_review_id: clientRecoverySource.id,
    result_review_id: null,
    created_at: NOW,
    completed_at: null,
  },
}
assert.ok(videoStudioReviewIsWellFormed(clientRecoverySource), 'queued recovery carries an exact reserved child')
const missingReservedRecovery = structuredClone(clientRecoverySource)
delete missingReservedRecovery.recovery.recovery_review_id
assert.equal(videoStudioReviewIsWellFormed(missingReservedRecovery), false, 'queued recovery without reserved child fails closed')

const invalidRootGeneration = structuredClone(videoStudioReviewFixture) as Record<string, any>
invalidRootGeneration.recovery.of_command_id = COMMAND_ID
assert.equal(videoStudioReviewIsWellFormed(invalidRootGeneration), false, 'generation zero cannot name a parent command')

const unsafeAttentionRecovery = structuredClone(clientRecoverySource)
unsafeAttentionRecovery.recovery = {
  ...unsafeAttentionRecovery.recovery,
  available: true,
  recovery_review_id: null,
  binding_command: null,
}
unsafeAttentionRecovery.decision_command.status = 'attention'
unsafeAttentionRecovery.decision_command.safe_code = 'lease_expired'
assert.equal(videoStudioReviewIsWellFormed(unsafeAttentionRecovery), false, 'unsafe attention code cannot expose recovery')
unsafeAttentionRecovery.decision_command.safe_code = 'command_expired'
assert.ok(videoStudioReviewIsWellFormed(unsafeAttentionRecovery), 'backend-safe attention code can expose recovery')

const passedGates = {
  truth: { status: 'passed' },
  rights: { status: 'passed' },
  confidentiality: { status: 'passed' },
  transcript_fidelity: { status: 'passed' },
  naming: { status: 'passed' },
}
const pendingGates = {
  truth: { status: 'pending' },
  rights: { status: 'passed' },
  confidentiality: { status: 'passed' },
  transcript_fidelity: { status: 'passed' },
  naming: { status: 'passed' },
}
const reviewPayload = {
  direction: 'Move the proof into the first beat.',
  change_title: 'Proof first',
  change_summary: 'The evidence appears before the setup.',
  range_label: 'Opening beat',
  changes: ['Earlier evidence'],
  blocking_gates: passedGates,
  target: { kind: 'overlay', ref: 'proof-overlay-1' },
  semantic_target_map_hash: SHA_C,
}
assert.ok(parseReviewPayload(reviewPayload))
assert.equal(parseReviewPayload({ ...reviewPayload, raw_transcript: 'forbidden' }), null)
assert.equal(parseReviewPayload({ ...reviewPayload, change_summary: 'Open C:\\Users\\Krish\\secret.mp4' }), null)
assert.equal(parseReviewPayload({ ...reviewPayload, change_summary: 'api_key=abcdefghijklmnop' }), null)
assert.ok(parseReviewPayload({ ...reviewPayload, change_summary: 'The API key decision made the story clearer.' }))
assert.equal(parseReviewPayload({ ...reviewPayload, target: { kind: 'moment', start_ms: 10, end_ms: 20 } }), null)

const browserPrepare = {
  schema_version: 1,
  idempotency_key: IDEMPOTENCY_ID,
  source_review_id: REVIEW_ID,
  platform: 'youtube_shorts',
  submitted_at: NOW,
  parent_revision_hash: SHA_A,
  parent_artifact_hash: SHA_B,
  kind: 'magic_edit_prepare',
  intent: {
    instruction: 'Move this approved proof earlier.',
    target: { kind: 'overlay', ref: 'proof-overlay-1' },
    semantic_target_map_hash: SHA_C,
  },
}
assert.ok(parseBrowserCommandBody(browserPrepare))
assert.equal(parseBrowserCommandBody({ ...browserPrepare, raw_transcript: 'forbidden' }), null)
assert.equal(parseBrowserCommandBody({ ...browserPrepare, source_review_id: undefined }), null)
assert.equal(parseBrowserCommandBody({ ...browserPrepare, intent: { ...browserPrepare.intent, local_path: 'forbidden' } }), null)
assert.equal(parseBrowserCommandBody({
  ...browserPrepare,
  intent: { ...browserPrepare.intent, target: { kind: 'moment', start_ms: 10, ref: 'extra' } },
}), null)

const browserReturn = {
  schema_version: 1,
  idempotency_key: IDEMPOTENCY_ID,
  platform: 'linkedin',
  submitted_at: NOW,
  parent_revision_hash: SHA_D,
  parent_artifact_hash: SHA_E,
  kind: 'magic_edit_return_to_parent',
  intent: { target_parent_revision_hash: SHA_A, target_parent_artifact_hash: SHA_B },
}
assert.ok(parseBrowserCommandBody(browserReturn))
assert.equal(parseBrowserCommandBody({
  ...browserReturn,
  intent: { ...browserReturn.intent, secret: 'forbidden' },
}), null)

const decision = {
  schema_version: 1,
  idempotency_key: IDEMPOTENCY_ID,
  submitted_at: NOW,
  parent_revision_hash: SHA_A,
  parent_artifact_hash: SHA_B,
  revision_hash: SHA_D,
  artifact_hash: SHA_E,
  decision: 'use_candidate',
  feedback: 'Use this version.',
}
assert.ok(parseReviewDecisionBody(decision))
assert.equal(parseReviewDecisionBody({ ...decision, token: 'forbidden' }), null)
assert.equal(parseReviewDecisionBody({ ...decision, feedback: '   ' }), null)
assert.equal(parseReviewDecisionBody({ ...decision, feedback: 'file:///Users/krish/raw.mov' }), null)
assert.equal(parseReviewDecisionBody({
  ...decision,
  learning_confirmation: { action: 'confirm', raw_notes: 'forbidden' },
}), null)

const recoveryRequest = {
  schema_version: 1,
  idempotency_key: IDEMPOTENCY_ID,
  submitted_at: NOW,
  job_id: 'job-video-fixture',
  platform: 'youtube_shorts',
  parent_revision_hash: SHA_A,
  parent_artifact_hash: SHA_B,
}
assert.ok(parseRecoverFailedCommandBody(recoveryRequest))
assert.equal(parseRecoverFailedCommandBody({ ...recoveryRequest, raw_transcript: 'forbidden' }), null)

const fixtureText = await readFile(
  new URL('../tests/fixtures/control-plane/runner-command-prepare-v1.json', import.meta.url),
  'utf8',
)
const fixture = JSON.parse(fixtureText)
const expectedCommandHash = (
  await readFile(new URL('../tests/fixtures/control-plane/runner-command-prepare-v1.sha256', import.meta.url), 'utf8')
).trim()
assert.equal(stablePayloadHash(fixture.payload), fixture.payload_hash)
assert.equal(
  stablePayloadHash(runnerCommandHashInputV1(fixture)),
  expectedCommandHash,
)
assert.equal(fixture.command_hash, expectedCommandHash)
assert.deepEqual(
  projectClaimedCommand({ ...fixture, lease_expires_at: '2026-09-04T10:02:00.000Z' }),
  fixture,
)
assert.equal(
  normalizeDatabaseTimestamp('2026-09-04 10:02:00.123456+00'),
  '2026-09-04T10:02:00.123Z',
)
assert.equal(
  normalizeDatabaseTimestamp('2026-09-04T11:02:00.123456+01:00'),
  '2026-09-04T10:02:00.123Z',
)
assert.equal(normalizeDatabaseTimestamp('2026-09-04T10:02:00'), null)
assert.deepEqual(
  projectClaimedCommand({
    ...fixture,
    issued_at: '2026-09-04 10:00:00+00',
    expires_at: '2026-09-04T13:00:00+01:00',
    lease_expires_at: '2026-09-04T10:02:00+00:00',
  }),
  fixture,
)
assert.equal(projectClaimedCommand({
  ...fixture,
  lease_expires_at: '2026-09-04T10:02:00.000Z',
  raw_transcript: 'forbidden',
}), null)

const recoveryFixtureText = await readFile(
  new URL('../tests/fixtures/control-plane/runner-command-review-recovery-v1.json', import.meta.url),
  'utf8',
)
const recoveryFixture = JSON.parse(recoveryFixtureText)
const expectedRecoveryCommandHash = (
  await readFile(
    new URL('../tests/fixtures/control-plane/runner-command-review-recovery-v1.sha256', import.meta.url),
    'utf8',
  )
).trim()
assert.equal(stablePayloadHash(recoveryFixture.payload), recoveryFixture.payload_hash)
assert.equal(
  stablePayloadHash(runnerCommandHashInputV1(recoveryFixture)),
  expectedRecoveryCommandHash,
)
assert.equal(recoveryFixture.command_hash, expectedRecoveryCommandHash)
assert.deepEqual(
  projectClaimedCommand({ ...recoveryFixture, lease_expires_at: '2026-09-04T10:02:00.000Z' }),
  recoveryFixture,
)

const decisionRecordPayload = {
  schema_version: 1,
  decision_id: IDEMPOTENCY_ID,
  job_id: 'job-video-fixture',
  platform: 'youtube_shorts',
  review_id: REVIEW_ID,
  gate: 'final',
  candidate_hash: null,
  semantic_target_map_hash: SHA_C,
  expected_parent_revision_hash: SHA_A,
  expected_parent_artifact_hash: SHA_B,
  review_revision_hash: SHA_D,
  review_artifact_hash: SHA_E,
  decision: 'use_candidate',
  feedback: null,
  override_reason: null,
  learning_confirmation: null,
  decided_by: 'Krish',
  occurred_at: NOW,
}
const decisionRecordEnvelope = {
  schema_version: 1,
  command_id: COMMAND_ID,
  command_kind: 'review_decision_record',
  job_id: 'job-video-fixture',
  platform: 'youtube_shorts',
  candidate_hash: null,
  expected_parent_revision_hash: SHA_A,
  expected_parent_artifact_hash: SHA_B,
  semantic_target_map_hash: SHA_C,
  idempotency_key: IDEMPOTENCY_ID,
  payload_hash: SHA_D,
  command_hash: SHA_E,
  issued_at: NOW,
  expires_at: '2026-10-04T10:00:00.000Z',
  lease_expires_at: '2026-09-04T10:02:00.000Z',
  payload: decisionRecordPayload,
}
assert.ok(projectClaimedCommand(decisionRecordEnvelope))
assert.equal(projectClaimedCommand({
  ...decisionRecordEnvelope,
  payload: { ...decisionRecordPayload, raw_transcript: 'forbidden' },
}), null)
assert.equal(projectClaimedCommand({
  ...decisionRecordEnvelope,
  candidate_hash: SHA_D,
  payload: { ...decisionRecordPayload, candidate_hash: SHA_D },
}), null, 'candidate use_candidate decisions must be represented by activation only')

const activationPayload = {
  schema_version: 1,
  activation_id: IDEMPOTENCY_ID,
  job_id: 'job-video-fixture',
  platform: 'youtube_shorts',
  candidate_hash: SHA_D,
  expected_parent_revision_hash: SHA_A,
  expected_parent_artifact_hash: SHA_B,
  prepared_treatment_artifact_hash: SHA_E,
  decision: 'activate',
  approved_by: 'Krish',
  confirmation_ref: `control-center-confirmation:treatment:${SHA_E}:review:${REVIEW_ID}:decision:${IDEMPOTENCY_ID}`,
  occurred_at: NOW,
}
const activationEnvelope = {
  ...decisionRecordEnvelope,
  command_kind: 'magic_edit_activate',
  candidate_hash: SHA_D,
  semantic_target_map_hash: SHA_C,
  payload: activationPayload,
}
assert.ok(projectClaimedCommand(activationEnvelope))
assert.equal(projectClaimedCommand({ ...activationEnvelope, semantic_target_map_hash: null }), null)

const recoveryRecordPayload = {
  schema_version: 1,
  recovery_id: IDEMPOTENCY_ID,
  job_id: 'job-video-fixture',
  platform: 'youtube_shorts',
  source_review_id: REVIEW_ID,
  recovery_review_id: IDEMPOTENCY_ID,
  source_command_id: COMMAND_ID,
  source_command_hash: SHA_E,
  source_terminal_reason: 'runner_failed_receipt',
  recovery_root_command_id: COMMAND_ID,
  recovery_generation: 1,
  gate: 'treatment',
  expected_parent_revision_hash: SHA_A,
  expected_parent_artifact_hash: SHA_B,
  review_revision_hash: SHA_D,
  review_artifact_hash: SHA_E,
  candidate_hash: SHA_D,
  semantic_target_map_hash: SHA_C,
  recovered_by: 'Krish',
  occurred_at: NOW,
}
const recoveryRecordEnvelope = {
  ...decisionRecordEnvelope,
  command_id: BRIDGE_COMMAND_ID,
  command_kind: 'review_recovery_record',
  candidate_hash: SHA_D,
  payload_hash: stablePayloadHash(recoveryRecordPayload),
  payload: recoveryRecordPayload,
}
assert.ok(projectClaimedCommand(recoveryRecordEnvelope))
assert.equal(projectClaimedCommand({
  ...recoveryRecordEnvelope,
  payload: { ...recoveryRecordPayload, source_terminal_reason: 'unknown' },
}), null)
assert.equal(projectClaimedCommand({
  ...recoveryRecordEnvelope,
  payload: { ...recoveryRecordPayload, recovery_root_command_id: BRIDGE_COMMAND_ID },
}), null, 'generation-one recovery must bind its failed command as the chain root')

assert.ok(parseRunnerClaimRequest({
  schema_version: 1,
  runner_id: 'runner-one',
  software_commit: 'unknown',
  command_schema_versions: [1],
  lease_seconds: 120,
}))
assert.equal(parseRunnerClaimRequest({
  schema_version: 1,
  runner_id: 'runner-one',
  software_commit: 'unknown',
  command_schema_versions: [1],
  raw_log: 'forbidden',
}), null)

const heartbeat = {
  schema_version: 1,
  runner_id: 'runner-one',
  software_commit: 'unknown',
  command_schema_versions: [1],
  status: 'idle',
  drive_state: 'ready',
  pending_receipts: 0,
  occurred_at: new Date().toISOString(),
}
assert.ok(parseRunnerHeartbeatRequest(heartbeat))
assert.equal(parseRunnerHeartbeatRequest({ ...heartbeat, queue_depth: 0 }), null)
assert.ok(parseRunnerHeartbeatRequest({
  ...heartbeat,
  status: 'working',
  active_command_id: COMMAND_ID,
  lease_token: 'lease-token-that-is-long-enough',
}))

const uploadRequest = {
  schema_version: 1,
  runner_id: 'runner-one',
  command_id: COMMAND_ID,
  command_hash: fixture.command_hash,
  lease_token: 'lease-token-that-is-long-enough',
  side: 'before',
  sha256: SHA_D,
  md5: MD5_A,
  content_type: 'video/mp4',
  byte_size: 1_024,
}
assert.ok(parseRunnerPreviewUploadRequest(uploadRequest))
assert.equal(parseRunnerPreviewUploadRequest({ ...uploadRequest, local_path: 'forbidden' }), null)
assert.equal(parseRunnerPreviewUploadRequest({ ...uploadRequest, byte_size: 25 * 1024 * 1024 + 1 }), null)
assert.equal(parseRunnerPreviewUploadRequest({ ...uploadRequest, md5: 'not-md5' }), null)
assert.ok(parseRunnerPreviewRetentionRequest({ schema_version: 1, runner_id: 'runner-one', limit: 100 }))
assert.equal(parseRunnerPreviewRetentionRequest({
  schema_version: 1, runner_id: 'runner-one', limit: 101,
}), null)
assert.equal(parseRunnerPreviewRetentionRequest({
  schema_version: 1, runner_id: 'runner-one', limit: 10, object_key: 'forbidden',
}), null)
assert.equal(normalizedStorageMd5Etag(`"${MD5_A}"`), MD5_A)
assert.equal(normalizedStorageMd5Etag(MD5_A.toUpperCase()), MD5_A)
assert.equal(normalizedStorageMd5Etag(`W/"${MD5_A}"`), null)
assert.equal(normalizedStorageMd5Etag(null), null)

const successfulRefs = {
  review_id: REVIEW_ID,
  candidate_hash: SHA_D,
  safe_title: 'Proof first',
  safe_summary: 'Compare the exact before and after proxies.',
  review_payload: reviewPayload,
  before_preview_object_key: `commands/${COMMAND_ID}/previews/before/${SHA_A}.mp4`,
  before_preview_hash: SHA_A,
  before_preview_md5: MD5_A,
  before_preview_byte_size: 1_024,
  after_preview_object_key: `commands/${COMMAND_ID}/previews/after/${SHA_B}.mp4`,
  after_preview_hash: SHA_B,
  after_preview_md5: MD5_B,
  after_preview_byte_size: 2_048,
  comparison_alignment: 'exact',
  comparison_start_ms: 0,
  comparison_end_ms: 5_000,
}
const receiptBase = {
  schema_version: 1,
  command_id: COMMAND_ID,
  command_hash: fixture.command_hash,
  job_id: 'job-video-fixture',
  status: 'succeeded',
  result_revision_hash: SHA_D,
  result_artifact_hash: SHA_E,
  result_refs: successfulRefs,
  hard_gates: passedGates,
  retryable: false,
  safe_code: null,
  started_at: NOW,
  finished_at: '2026-09-04T10:01:00.000Z',
  receipt_hash: SHA_A,
  receipt_signature: SHA_B,
}
const completeRequest = {
  schema_version: 1,
  runner_id: 'runner-one',
  lease_token: 'lease-token-that-is-long-enough',
  receipt: receiptBase,
}
assert.ok(parseRunnerCompleteRequest(completeRequest))
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...receiptBase, retryable: true },
}), null)
assert.equal(parseRunnerCompleteRequest({ ...completeRequest, raw_log: 'forbidden' }), null)
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...receiptBase, local_event_path: 'forbidden' },
}), null)

assert.ok(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: {
    ...receiptBase,
    result_revision_hash: SHA_E,
    result_artifact_hash: SHA_B,
    result_refs: { semantic_target_map_hash: SHA_D, comparison_alignment: 'unavailable' },
  },
}), 'decision receipts may return the rebound semantic target map')
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...receiptBase, result_refs: { ...successfulRefs, after_preview_object_key: undefined } },
}), null)
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: {
    ...receiptBase,
    result_refs: { semantic_target_map_hash: SHA_D, comparison_alignment: 'unavailable', comparison_start_ms: 0, comparison_end_ms: 1 },
  },
}), null)
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...receiptBase, result_refs: { ...successfulRefs, safe_summary: 'C:\\Users\\Krish\\raw.mov' } },
}), null)
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: {
    ...receiptBase,
    hard_gates: { ...passedGates, truth: { status: 'passed', detail: 'access_token=abcdefghijklmnop' } },
  },
}), null)
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...receiptBase, hard_gates: pendingGates },
}), null, 'review payload and signed hard-gate ledger must agree exactly')

const editorialReviewPayload = {
  ...reviewPayload,
  blocking_gates: pendingGates,
  editorial_note: 'This needs a human editorial route.',
}
const editorialReceipt = {
  ...receiptBase,
  status: 'requires_editorial_route',
  result_revision_hash: SHA_A,
  result_artifact_hash: SHA_B,
  result_refs: {
    safe_title: 'Editorial decision required',
    safe_summary: 'No candidate or preview was produced.',
    review_id: REVIEW_ID,
    review_payload: editorialReviewPayload,
    comparison_alignment: 'unavailable',
  },
  hard_gates: pendingGates,
  safe_code: 'requires_editorial_route',
}
assert.ok(parseRunnerCompleteRequest({ ...completeRequest, receipt: editorialReceipt }))
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...editorialReceipt, result_refs: { ...editorialReceipt.result_refs, candidate_hash: SHA_D } },
}), null)
assert.equal(parseRunnerCompleteRequest({
  ...completeRequest,
  receipt: { ...editorialReceipt, hard_gates: passedGates },
}), null)

const projectedRequest = {
  schema_version: 1,
  runner_id: 'runner-one',
  software_commit: 'unknown',
  idempotency_key: IDEMPOTENCY_ID,
  projection_hash: SHA_E,
  projection: {
    job: {
      job_id: 'job-video-fixture',
      series: 'money_of_ai',
      mode: 'solo',
      target_platforms: ['youtube_shorts', 'linkedin'],
      stage: 'treatment',
      status: 'active',
      safe_title: 'A safe title',
      safe_summary: 'A safe summary.',
    },
    platform_state: {
      platform: 'youtube_shorts',
      active_revision_hash: SHA_A,
      active_artifact_hash: SHA_B,
      active_candidate_hash: null,
      parent_revision_hash: null,
      parent_artifact_hash: null,
      parent_candidate_hash: null,
      semantic_target_map_hash: SHA_C,
      editorial_state: 'needs_visual_review',
      route_state: 'standard',
    },
    review: {
      id: REVIEW_ID,
      gate: 'treatment',
      safe_title: 'Review this treatment',
      safe_summary: 'The initial non-magic treatment remains candidate-free.',
      parent_revision_hash: SHA_A,
      parent_artifact_hash: SHA_B,
      revision_hash: SHA_D,
      artifact_hash: SHA_E,
      candidate_hash: null,
      route_state: 'standard',
      safe_payload: reviewPayload,
      hard_gates: passedGates,
      created_at: NOW,
    },
  },
}
assert.ok(parseRunnerProjectRequest(projectedRequest))
for (const gate of ['story', 'treatment', 'final', 'learning']) {
  assert.ok(parseRunnerProjectRequest({
    ...projectedRequest,
    projection: {
      ...projectedRequest.projection,
      review: { ...projectedRequest.projection.review, gate },
    },
  }), `runner may project the ${gate} gate`)
}
assert.equal(parseRunnerProjectRequest({
  ...projectedRequest,
  projection: { ...projectedRequest.projection, raw_transcript: 'forbidden' },
}), null)
assert.equal(parseRunnerProjectRequest({
  ...projectedRequest,
  projection: {
    ...projectedRequest.projection,
    job: { ...projectedRequest.projection.job, safe_summary: '/Users/krish/raw/video.mov' },
  },
}), null)
assert.equal(parseRunnerProjectRequest({
  ...projectedRequest,
  projection: {
    ...projectedRequest.projection,
    platform_state: { ...projectedRequest.projection.platform_state, parent_candidate_hash: SHA_D },
  },
}), null)
assert.ok(parseRunnerProjectRequest({
  ...projectedRequest,
  projection: {
    ...projectedRequest.projection,
    platform_state: {
      ...projectedRequest.projection.platform_state,
      parent_revision_hash: SHA_D,
      parent_artifact_hash: SHA_E,
      parent_candidate_hash: null,
    },
  },
}))

const reviewRow = {
  id: REVIEW_ID,
  job_id: 'job-video-fixture',
  source_command_id: null,
  preview_source_command_id: null,
  recovery_of_command_id: null,
  recovery_root_command_id: null,
  recovery_generation: 0,
  binding_state: 'ready',
  platform: 'youtube_shorts',
  gate: 'treatment',
  status: 'pending',
  safe_title: 'Review this treatment',
  safe_summary: 'The initial treatment is ready.',
  parent_revision_hash: SHA_A,
  parent_artifact_hash: SHA_B,
  revision_hash: SHA_D,
  artifact_hash: SHA_E,
  candidate_hash: null,
  semantic_target_map_hash: SHA_C,
  queues_activation: false,
  truth_gate: 'passed',
  rights_gate: 'passed',
  confidentiality_gate: 'passed',
  transcript_fidelity_gate: 'passed',
  naming_gate: 'passed',
  route_state: 'standard',
  safe_payload: reviewPayload,
  before_preview_object_key: null,
  after_preview_object_key: null,
  preview_expires_at: null,
  comparison_alignment: 'unavailable',
  comparison_start_ms: null,
  comparison_end_ms: null,
  created_at: NOW,
  expires_at: null,
}
const jobRow = {
  job_id: 'job-video-fixture',
  series: 'money_of_ai',
  mode: 'solo',
  target_platforms: ['youtube_shorts', 'linkedin'],
  stage: 'treatment',
  status: 'active',
  safe_title: 'A safe title',
  safe_summary: 'A safe summary.',
  platform: 'youtube_shorts',
  editorial_state: 'needs_visual_review',
  runner_state: 'idle',
  route_state: 'standard',
  active_revision_hash: SHA_A,
  active_artifact_hash: SHA_B,
  active_candidate_hash: null,
  active_parent_revision_hash: null,
  active_parent_artifact_hash: null,
  active_parent_candidate_hash: null,
  semantic_target_map_hash: SHA_C,
  updated_at: NOW,
}
const recoveryClone = {
  ...reviewRow,
  id: IDEMPOTENCY_ID,
  source_command_id: null,
  recovery_of_command_id: COMMAND_ID,
  recovery_root_command_id: COMMAND_ID,
  recovery_generation: 1,
  binding_state: 'ready',
  projection_hash: null,
  decision: null,
  decision_feedback: null,
  override_reason: null,
  decided_at: null,
  expires_at: '2026-10-04T10:00:00.000Z',
}
const recoveryCloneExpected = {
  recoveryReviewId: IDEMPOTENCY_ID,
  sourceCommandId: COMMAND_ID,
  rootCommandId: COMMAND_ID,
  generation: 1,
}
assert.ok(validRecoveryReviewClone(reviewRow, recoveryClone, 'succeeded', recoveryCloneExpected))
assert.equal(validRecoveryReviewClone(reviewRow, {
  ...recoveryClone,
  parent_artifact_hash: SHA_D,
}, 'succeeded', recoveryCloneExpected), false, 'forged recovery lineage is rejected')
assert.equal(validRecoveryReviewClone(reviewRow, {
  ...recoveryClone,
  safe_payload: { ...reviewPayload, raw_transcript: 'forbidden' },
}, 'succeeded', recoveryCloneExpected), false, 'forged recovery payload is rejected')
assert.equal(validRecoveryReviewClone(reviewRow, {
  ...recoveryClone,
  binding_state: 'ready',
}, 'failed', recoveryCloneExpected), false, 'failed bridge cannot expose a ready recovery review')
const candidateReviewRow = {
  ...reviewRow,
  source_command_id: COMMAND_ID,
  preview_source_command_id: COMMAND_ID,
  candidate_hash: SHA_D,
  queues_activation: true,
  before_preview_object_key: `commands/${COMMAND_ID}/previews/before/${SHA_A}.mp4`,
  after_preview_object_key: `commands/${COMMAND_ID}/previews/after/${SHA_B}.mp4`,
  preview_expires_at: '2099-10-04T10:00:00.000Z',
  comparison_alignment: 'exact',
  comparison_start_ms: 0,
  comparison_end_ms: 5_000,
}
const recoveredCandidateRow = {
  ...candidateReviewRow,
  id: IDEMPOTENCY_ID,
  source_command_id: null,
  recovery_of_command_id: BRIDGE_COMMAND_ID,
  recovery_root_command_id: BRIDGE_COMMAND_ID,
  recovery_generation: 1,
  projection_hash: null,
  decision: null,
  decision_feedback: null,
  override_reason: null,
  decided_at: null,
  expires_at: '2099-11-04T10:00:00.000Z',
}
assert.ok(reviewListProjection(candidateReviewRow, jobRow))
assert.ok(reviewListProjection(recoveredCandidateRow, jobRow), 'recovered candidate keeps exact preview provenance')
assert.equal(reviewListProjection({ ...candidateReviewRow, comparison_end_ms: null }, jobRow), null)
assert.equal(reviewListProjection({ ...reviewRow, safe_summary: 'C:\\Users\\Krish\\raw.mov' }, jobRow), null)
assert.equal(reviewListProjection({
  ...reviewRow,
  before_preview_object_key: `commands/${COMMAND_ID}/previews/before/${SHA_A}.mp4`,
}, jobRow), null, 'unavailable comparison cannot retain a hidden proxy reference')
assert.ok(reviewListProjection(reviewRow, jobRow), 'non-magic treatment review should be projectable')
assert.ok(reviewDetailProjection(reviewRow, jobRow))
assert.equal(reviewListProjection({ ...reviewRow, queues_activation: true }, jobRow), null)
assert.equal(reviewListProjection(reviewRow, { ...jobRow, mode: 'final' }), null)
assert.equal(reviewDetailProjection({ ...reviewRow, naming_gate: 'pending' }, jobRow), null)
assert.ok(activeJobProjection(jobRow))
assert.equal(activeJobProjection({ ...jobRow, active_parent_revision_hash: SHA_D }), null)

const migrationUrl = new URL('../supabase/migrations/20260904084240_video_studio_control_plane.sql', import.meta.url)
const migration = await readFile(migrationUrl, 'utf8')
const leastPrivilegeMigrationUrl = new URL('../supabase/migrations/20260905001000_video_studio_least_privilege.sql', import.meta.url)
const leastPrivilegeMigration = await readFile(leastPrivilegeMigrationUrl, 'utf8')
const heartbeatLeaseMigrationUrl = new URL('../supabase/migrations/20260905100000_video_studio_heartbeat_lease.sql', import.meta.url)
const heartbeatLeaseMigration = await readFile(heartbeatLeaseMigrationUrl, 'utf8')
const migrationNames = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((name) => name.includes('video_studio_control_plane'))
assert.deepEqual(migrationNames, ['20260904084240_video_studio_control_plane.sql'])
const createdIndexNames = [...migration.matchAll(/^create(?: unique)? index\s+([^\s]+).*$/gmi)]
  .map((match) => match[1])
assert.equal(new Set(createdIndexNames).size, createdIndexNames.length, 'migration index names must be unique')

const tables = [
  'video_studio_jobs', 'video_studio_job_platform_states', 'video_studio_review_requests',
  'video_studio_commands', 'video_studio_review_events', 'video_studio_command_receipts',
  'video_studio_preview_upload_slots', 'video_studio_runner_heartbeats',
  'video_studio_rate_limits', 'video_studio_projection_events',
  'video_studio_command_recoveries',
  'video_studio_preview_retention_events',
]
for (const table of tables) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`), `${table} RLS`)
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`), `${table} revoke`)
  assert.match(migration, new RegExp(`grant [^;]+ on public\\.${table} to service_role;`), `${table} grant`)
  assert.match(migration, new RegExp(`create policy [^\\n]+ on public\\.${table}`), `${table} policy`)
  const revoke = `revoke all on public.${table} from service_role;`
  const grant = new RegExp(`grant [^;]+ on public\\.${table} to service_role;`)
  assert.match(leastPrivilegeMigration, new RegExp(revoke.replaceAll('.', '\\.') ), `${table} service-role ACL reset`)
  assert.match(leastPrivilegeMigration, grant, `${table} narrow service-role grant`)
  assert.ok(leastPrivilegeMigration.indexOf(revoke) < leastPrivilegeMigration.search(grant), `${table} ACL reset must precede its narrow grant`)
}
for (const internalFunction of [
  'video_studio_touch_updated_at\\(\\)',
  'video_studio_reject_append_only_mutation\\(\\)',
  'video_studio_protect_command_core\\(\\)',
  'video_studio_protect_review_core\\(\\)',
]) {
  assert.match(leastPrivilegeMigration, new RegExp(`revoke execute on function public\\.${internalFunction} from service_role;`))
  assert.doesNotMatch(leastPrivilegeMigration, new RegExp(`grant execute on function public\\.${internalFunction} to service_role;`))
}
assert.doesNotMatch(leastPrivilegeMigration, /grant all/i)
assert.match(heartbeatLeaseMigration, /update public\.video_studio_commands as c/)
assert.match(heartbeatLeaseMigration, /where c\.id = p_active_command_id/)
assert.match(heartbeatLeaseMigration, /and c\.status = 'leased'/)
assert.match(heartbeatLeaseMigration, /and c\.lease_owner_hash = p_runner_id_hash/)
assert.match(heartbeatLeaseMigration, /and c\.lease_token_hash = p_lease_token_hash/)
assert.match(heartbeatLeaseMigration, /and c\.lease_expires_at > pg_catalog\.now\(\)/)
assert.match(heartbeatLeaseMigration, /returning c\.lease_expires_at into v_lease_expires_at/)
assert.doesNotMatch(heartbeatLeaseMigration, /\band lease_expires_at > pg_catalog\.now\(\)/)
assert.match(heartbeatLeaseMigration, /set search_path = ''/)
assert.match(heartbeatLeaseMigration, /revoke execute on function public\.video_studio_record_heartbeat[^;]+from public, anon, authenticated;/)
assert.match(heartbeatLeaseMigration, /grant execute on function public\.video_studio_record_heartbeat[^;]+to service_role;/)
assert.doesNotMatch(heartbeatLeaseMigration, /grant all/i)
assert.doesNotMatch(migration, /grant all/i)
assert.doesNotMatch(migration, /\bstorage\./i)
assert.doesNotMatch(
  migration,
  /pg_catalog\.(?:coalesce|extract|greatest|least|nullif|overlay|position|substring|trim)\s*\(/i,
  'PostgreSQL special-form syntax cannot be schema-qualified as a normal function call',
)
assert.match(migration, /extract\(epoch from pg_catalog\.now\(\)\)/)
assert.match(migration, /set search_path = ''/)
assert.match(migration, /interval '30 days'/)
assert.match(migration, /expires_at > pg_catalog\.now\(\)/)
assert.match(migration, /for update skip locked/i)
assert.match(migration, /set status = 'attention',[\s\S]+safe_code = 'command_expired'/)
assert.match(migration, /if p_decision = 'use_candidate' and not \(/)
assert.doesNotMatch(migration, /if p_decision = 'use_candidate' and v_review\.queues_activation\s+and not \(/)
assert.match(migration, /v_command_kind := 'review_decision_record'/)
assert.match(migration, /if p_runner_payload is distinct from v_runner_payload/)
assert.match(migration, /v_review\.candidate_hash, v_state\.active_revision_hash, v_state\.active_artifact_hash/)
assert.match(migration, /elsif v_command\.command_kind = 'review_decision_record'/)
const decisionFunction = migration.slice(
  migration.indexOf('create or replace function public.video_studio_record_decision'),
  migration.indexOf('create or replace function public.video_studio_claim_command'),
)
assert.doesNotMatch(decisionFunction, /editorial_state\s*=/, 'cloud decision cannot advance editorial state before local receipt')
assert.match(migration, /when v_command\.payload ->> 'gate' = 'story' then 'needs_visual_review'/)
assert.match(migration, /when v_command\.payload ->> 'gate' = 'treatment' then 'needs_final_review'/)
assert.match(migration, /when v_command\.payload ->> 'gate' in \('final', 'learning'\) then 'approved'/)
assert.match(migration, /p_result_refs ->> 'semantic_target_map_hash' !~ '\^\[a-f0-9\]\{64\}\$'/)
assert.match(migration, /if p_retryable then raise exception 'invalid_receipt'/)
assert.match(migration, /content_md5\s+text not null check \(content_md5 ~ '\^\[a-f0-9\]\{32\}\$'\)/)
assert.match(migration, /s\.slot_expires_at > pg_catalog\.now\(\)/)
assert.match(migration, /p_result_refs ->> 'review_id'/)
assert.match(migration, /active_revision_hash = p_result_revision_hash/)
assert.match(migration, /semantic_target_map_hash = p_result_refs ->> 'semantic_target_map_hash'/)
assert.match(migration, /p_receipt_status = 'succeeded'[\s\S]+p_result_revision_hash is distinct from \(p_result_refs ->> 'candidate_hash'\)/)
assert.match(migration, /p_receipt_status = 'requires_editorial_route'[\s\S]+p_result_revision_hash is distinct from v_command\.expected_parent_revision_hash/)
assert.match(migration, /v_effective_receipt_status = 'succeeded',/)
assert.match(migration, /when v_command\.command_kind = 'magic_edit_activate' then active_revision_hash\s+else null/)
assert.match(migration, /p_result_artifact_hash is distinct from \(v_command\.payload ->> 'target_parent_artifact_hash'\)/)
assert.doesNotMatch(migration, /p_result_revision_hash is distinct from \(v_command\.payload ->> 'target_parent_revision_hash'\)/)
assert.match(migration, /v_review\.projection_hash is distinct from p_projection_hash/)
assert.match(migration, /v_review\.status <> 'pending'/)
assert.match(migration, /video_studio_reviews_projection_idx/)
assert.match(migration, /preview_source_command_id\s+uuid/)
assert.match(migration, /video_studio_review_preview_source_command_fk/)
assert.match(migration, /video_studio_reviews_preview_source_idx/)
assert.match(migration, /review_row\.preview_source_command_id = s\.command_id/)
assert.match(migration, /video_studio_commands_prepare_source_review_idx/)
assert.match(
  migration,
  /where command_kind = 'magic_edit_prepare' and status in \('queued', 'leased', 'succeeded'\)/,
  'one live or successful prepare per source; failed, cancelled, and exhausted attention may retry',
)
const prepareUniquePredicate = migration.match(
  /create unique index video_studio_commands_prepare_source_review_idx[\s\S]+?where ([^;]+);/,
)?.[1] || ''
assert.doesNotMatch(prepareUniquePredicate, /'failed'|'cancelled'|'attention'/)
assert.match(migration, /v_source_review\.status <> 'pending'/)
assert.match(migration, /v_source_review\.binding_state <> 'ready'/)
assert.match(migration, /v_source_review\.expires_at is not null and v_source_review\.expires_at <= pg_catalog\.now\(\)/)
assert.match(migration, /v_source_review\.parent_revision_hash <> p_expected_parent_revision_hash/)
assert.match(migration, /c\.review_id = p_source_review_id[\s\S]+c\.status in \('queued', 'leased', 'succeeded'\)/)
assert.match(migration, /set status = 'superseded'\s+where id = v_command\.review_id/)
assert.match(migration, /p_result_refs ->> 'semantic_target_map_hash' = v_state\.semantic_target_map_hash/)
assert.match(migration, /p_result_artifact_hash is distinct from \(v_command\.payload ->> 'prepared_treatment_artifact_hash'\)/)
assert.match(migration, /v_existing\.candidate_hash is distinct from p_candidate_hash[\s\S]+v_existing\.command_hash <> p_command_hash/)
assert.match(migration, /video_studio_projection_events_review_idx/)
assert.match(migration, /video_studio_preview_slots_service_all/)
assert.match(migration, /video_studio_recoveries_service_all/)
assert.match(migration, /create or replace function public\.video_studio_recover_failed_review/)
assert.match(migration, /'review_decision_record', 'review_recovery_record'/)
assert.match(migration, /binding_state\s+text not null default 'ready' check \(binding_state in \('queued', 'ready', 'failed'\)\)/)
assert.match(migration, /v_command\.command_kind not in \('magic_edit_activate', 'review_decision_record'\)/)
assert.match(migration, /v_command\.status not in \('failed', 'attention'\)/)
assert.match(migration, /v_command\.safe_code, ''\) not in \('attempts_exhausted', 'command_expired'\)/)
assert.match(migration, /receipt\.receipt_hash = v_command\.result_receipt_hash[\s\S]+receipt\.receipt_status = 'failed'[\s\S]+receipt\.retryable = false/)
assert.match(migration, /v_state\.active_revision_hash is distinct from p_expected_parent_revision_hash/)
assert.match(migration, /if v_generation > 3 then raise exception 'recovery_limit_reached'/)
assert.match(migration, /'source_terminal_reason', case[\s\S]+when v_command\.status = 'failed' then 'runner_failed_receipt'[\s\S]+else v_command\.safe_code/)
assert.match(migration, /p_recovery_review_id is distinct from p_idempotency_key/)
assert.match(migration, /'review_recovery_record', v_source_review\.candidate_hash/)
assert.match(migration, /v_source_review\.preview_expires_at <= pg_catalog\.now\(\)[\s\S]+recovery_preview_expired/)
assert.match(migration, /v_review\.expires_at is not null and v_review\.expires_at <= pg_catalog\.now\(\)[\s\S]+review_expired/)
assert.match(migration, /source_command_id\s+uuid not null unique references public\.video_studio_commands/)
assert.match(migration, /window_started_at < pg_catalog\.now\(\) - interval '24 hours'/)
assert.match(migration, /create index video_studio_rate_limits_expiry_idx[\s\S]+window_started_at/)
assert.match(migration, /create or replace function public\.video_studio_preview_retention_candidates/)
assert.match(migration, /p_cutoff > pg_catalog\.now\(\) - interval '7 days'/)
assert.match(migration, /not exists \([\s\S]+video_studio_preview_retention_events/)
assert.match(migration, /coalesce\(r\.preview_expires_at, s\.slot_expires_at\)/)
assert.match(migration, /slot_id\s+uuid primary key references public\.video_studio_preview_upload_slots/)
assert.match(migration, /create or replace function public\.video_studio_record_preview_retention/)
assert.match(migration, /video_studio_preview_retention_events_append_only/)
assert.match(migration, /revoke execute on function public\.video_studio_reserve_preview_upload/)
assert.match(migration, /grant execute on function public\.video_studio_reserve_preview_upload/)
const recoveryCompletionStart = migration.indexOf("elsif v_command.command_kind = 'review_recovery_record' then")
const recoveryCompletionEnd = migration.indexOf("elsif v_command.command_kind in ('magic_edit_activate'", recoveryCompletionStart)
const recoveryCompletion = migration.slice(recoveryCompletionStart, recoveryCompletionEnd)
assert.ok(recoveryCompletionStart > 0 && recoveryCompletionEnd > recoveryCompletionStart)
assert.match(recoveryCompletion, /set binding_state = case[\s\S]+then 'ready'[\s\S]+else 'failed'/)
assert.doesNotMatch(recoveryCompletion, /active_revision_hash|active_artifact_hash/, 'bridge completion cannot move active lineage')
const recoveryReceiptValidation = migration.slice(
  migration.indexOf("if v_command.command_kind = 'review_recovery_record' then"),
  migration.indexOf("if v_command.command_kind = 'review_decision_record'", migration.indexOf("if v_command.command_kind = 'review_recovery_record' then")),
)
assert.match(recoveryReceiptValidation, /p_result_refs is distinct from pg_catalog\.jsonb_build_object\('comparison_alignment', 'unavailable'\)/)
assert.match(recoveryReceiptValidation, /p_hard_gates is distinct from v_source_review\.safe_payload -> 'blocking_gates'/)
assert.match(recoveryReceiptValidation, /source_terminal_reason' = 'runner_failed_receipt'/)
assert.match(recoveryReceiptValidation, /source_terminal_reason' in \('attempts_exhausted', 'command_expired'\)/)
const duplicateReceiptCheck = migration.indexOf('where receipt_hash = p_receipt_hash')
const liveLeaseCheck = migration.indexOf("if v_command.status <> 'leased'", duplicateReceiptCheck)
assert.ok(duplicateReceiptCheck > 0 && duplicateReceiptCheck < liveLeaseCheck, 'terminal duplicate must be checked before live lease')

type LeaseModel = {
  status: 'queued' | 'leased' | 'attention'
  attempt_count: number
  lease_expires_at: number | null
  completed_at: number | null
  lease_owner_hash: string | null
  lease_token_hash: string | null
}
function exhaustLeaseModel(command: LeaseModel, now: number): LeaseModel {
  const eligible = command.status === 'queued'
    || (command.status === 'leased' && command.lease_expires_at !== null && command.lease_expires_at < now)
  return eligible && command.attempt_count >= 5
    ? {
        ...command,
        status: 'attention',
        completed_at: now,
        lease_expires_at: null,
        lease_owner_hash: null,
        lease_token_hash: null,
      }
    : command
}
const liveFifthLease: LeaseModel = {
  status: 'leased', attempt_count: 5, lease_expires_at: 2_000, completed_at: null,
  lease_owner_hash: SHA_A, lease_token_hash: SHA_B,
}
assert.deepEqual(exhaustLeaseModel(liveFifthLease, 1_000), liveFifthLease, 'live fifth lease remains valid')
assert.deepEqual(exhaustLeaseModel({ ...liveFifthLease, lease_expires_at: 999 }, 1_000), {
  ...liveFifthLease,
  status: 'attention',
  lease_expires_at: null,
  completed_at: 1_000,
  lease_owner_hash: null,
  lease_token_hash: null,
})
const exhaustionSql = migration.slice(
  migration.indexOf('with exhausted as ('),
  migration.indexOf('select * into v_command', migration.indexOf('with exhausted as (')),
)
assert.match(exhaustionSql, /c\.status = 'queued'[\s\S]+c\.status = 'leased' and c\.lease_expires_at < pg_catalog\.now\(\)/)
assert.match(exhaustionSql, /completed_at = pg_catalog\.now\(\)/)
assert.match(exhaustionSql, /lease_owner_hash = null[\s\S]+lease_token_hash = null[\s\S]+lease_expires_at = null/)

const ownedApiFiles = [
  '../api/_videoStudioAuth.ts',
  '../api/video-studio/_contracts.ts',
  '../api/video-studio/_data.ts',
  '../api/video-studio/_previewStorage.ts',
  '../api/video-studio/_runnerContracts.ts',
  '../api/video-studio/jobs/[id]/commands.ts',
  '../api/video-studio/commands/[id].ts',
  '../api/video-studio/commands/[id]/recover.ts',
  '../api/video-studio/reviews/[id]/decision.ts',
  '../api/video-studio/runner/complete.ts',
  '../api/video-studio/runner/claim.ts',
  '../api/video-studio/runner/heartbeat.ts',
  '../api/video-studio/runner/preview-upload.ts',
  '../api/video-studio/runner/preview-retention.ts',
  '../api/video-studio/runner/project.ts',
]
const ownedSources = await Promise.all(ownedApiFiles.map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
for (const source of ownedSources) {
  assert.doesNotMatch(source, /Access-Control-Allow-Origin/i)
  assert.doesNotMatch(source, /Compound/)
  assert.doesNotMatch(source, /VIDEO_STUDIO_EXPORT_TOKEN/)
}
const decisionSource = await readFile(new URL('../api/video-studio/reviews/[id]/decision.ts', import.meta.url), 'utf8')
assert.match(decisionSource, /const shouldActivate = body\.decision === 'use_candidate' && queuesActivation/)
assert.match(decisionSource, /p_submitted_at: body\.submitted_at/)
assert.match(decisionSource, /runnerCommandKind = shouldActivate \? 'magic_edit_activate' : 'review_decision_record'/)
assert.match(decisionSource, /parent_revision_hash: body\.parent_revision_hash/)
assert.match(ownedSources[5], /platform: body\.platform/)
assert.match(ownedSources[5], /submitted_at: body\.submitted_at/)
assert.match(ownedSources[5], /p_source_review_id:/)
assert.match(ownedSources[6], /result_review_id: resultReviewId/)
assert.match(ownedSources[6], /sourceContext\?\.recovery\.recovery_review_id !== boundReviewId/)
assert.match(ownedSources[3], /Number\(sizeLimit\) !== VIDEO_STUDIO_PREVIEW_MAX_BYTES/)
assert.match(ownedSources[10], /expires_at: leaseExpiresAt/)
assert.match(ownedSources[11], /lease_expires_at: leaseExpiresAt/)
assert.match(ownedSources[12], /slot_expires_at: slotExpiresAt/)
const completeSource = await readFile(new URL('../api/video-studio/runner/complete.ts', import.meta.url), 'utf8')
assert.match(completeSource, /command_id: receipt\.command_id/)
assert.match(completeSource, /receipt_hash: receipt\.receipt_hash/)
assert.match(completeSource, /command_status: row\.command_status/)
const dataSource = await readFile(new URL('../api/video-studio/_data.ts', import.meta.url), 'utf8')
assert.match(dataSource, /prepare_command: RecordValue \| null/)
assert.match(dataSource, /\.eq\('command_kind', 'magic_edit_prepare'\)/)
assert.match(dataSource, /result_review_id: childId/)
assert.match(dataSource, /rawPrepare\.expected_parent_revision_hash !== review\.parent_revision_hash/)
assert.match(dataSource, /command\.expected_parent_artifact_hash !== review\.parent_artifact_hash/)
assert.match(dataSource, /status === 'actionable'/)
assert.match(dataSource, /video_studio_command_recoveries/)
assert.match(dataSource, /recovery_review_id: recoveryReviewId/)
assert.match(dataSource, /row\.safe_code === 'attempts_exhausted' \|\| row\.safe_code === 'command_expired'/)
assert.match(dataSource, /validRecoveryReviewClone/)
assert.match(dataSource, /bindingStatus === 'succeeded'[\s\S]+\? 'ready'/)
assert.match(dataSource, /const commandId = review\.preview_source_command_id/)
assert.match(dataSource, /data\.binding_state !== 'ready'/)
const reviewsIndexSource = await readFile(new URL('../api/video-studio/reviews/index.ts', import.meta.url), 'utf8')
assert.match(reviewsIndexSource, /status !== 'actionable'/)
assert.match(migration, /if not found or v_recovery_review\.status <> 'pending' then/)
const recoverSource = await readFile(new URL('../api/video-studio/commands/[id]/recover.ts', import.meta.url), 'utf8')
assert.match(recoverSource, /result_action: 'recovery_binding_requested'/)
assert.match(recoverSource, /kind: 'review_recovery_record'/)
assert.match(recoverSource, /source_terminal_reason: sourceTerminalReason/)
assert.match(recoverSource, /String\(row\.recovery_review_id\)\.toLowerCase\(\) !== recoveryReviewId/)

const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
for (const name of [
  'VITE_VIDEO_ENGINE_ENABLED', 'VIDEO_STUDIO_CSRF_SECRET', 'VIDEO_STUDIO_RUNNER_TOKEN',
  'VIDEO_STUDIO_RUNNER_SIGNING_KEY', 'VIDEO_STUDIO_PREVIEW_BUCKET',
]) assert.match(envExample, new RegExp(`^${name}=`, 'm'))
assert.match(envExample, /26214400-byte object limit/)

console.log('video studio control-plane invariants passed')
