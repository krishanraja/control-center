import {
  VIDEO_PLATFORMS,
  UUID_RE,
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  type MagicEditSelectionV1,
  hardGatesPassed,
  isSha256,
  parseHardGates,
  parseReviewPayload,
  parseMagicEditSelection,
  safeRedactedText,
} from './_contracts.js'

type UnknownRecord = Record<string, unknown>

const RUNNER_ID_RE = /^[a-z0-9][a-z0-9_-]{1,95}$/i
const COMMIT_RE = /^(?:[a-f0-9]{40}|unknown)$/
const SAFE_CODE_RE = /^[a-z][a-z0-9_]{0,79}$/
const SIGNATURE_RE = /^[a-f0-9]{64}$/
const MD5_RE = /^[a-f0-9]{32}$/
export const VIDEO_STUDIO_PREVIEW_MAX_BYTES = 25 * 1024 * 1024
export const VIDEO_STUDIO_PREVIEW_CONTENT_TYPE = 'video/mp4' as const
export const VIDEO_STUDIO_PREVIEW_SIDES = ['before', 'after'] as const

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, max: number, min = 0): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\u0000/g, '').trim()
  return normalized.length >= min && normalized.length <= max ? normalized : null
}

function validDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
}

export function normalizeDatabaseTimestamp(value: unknown): string | null {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)
  ) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value)
}

function exactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function parsePreparePayload(value: UnknownRecord): UnknownRecord | null {
  if (!exactKeys(value, [
    'schema_version', 'direction_id', 'job_id', 'platform',
    'expected_parent_revision_hash', 'expected_parent_artifact_hash',
    'semantic_target_map_hash', 'selection', 'instruction', 'protections',
    'requested_profile', 'submitted_by', 'submitted_at',
  ])) return null
  if (
    value.schema_version !== 1
    || !UUID_RE.test(String(value.direction_id || ''))
    || !identifier(value.job_id)
    || !VIDEO_PLATFORMS.includes(value.platform as typeof VIDEO_PLATFORMS[number])
    || !isSha256(value.expected_parent_revision_hash)
    || !isSha256(value.expected_parent_artifact_hash)
    || !isSha256(value.semantic_target_map_hash)
    || !isRecord(value.protections)
    || !exactKeys(value.protections, [
      'preserve_spoken_words', 'preserve_spoken_order', 'preserve_claims',
      'preserve_evidence', 'preserve_rights',
    ])
    || Object.values(value.protections).some((item) => item !== true)
    || value.requested_profile !== 'preview'
    || value.submitted_by !== 'Krish'
    || !validDate(value.submitted_at)
  ) return null
  const instruction = safeRedactedText(value.instruction, 600, 3)
  const selection = parseMagicEditSelection(value.selection)
  if (!instruction || !selection) return null
  return {
    schema_version: 1,
    direction_id: String(value.direction_id).toLowerCase(),
    job_id: value.job_id,
    platform: value.platform,
    expected_parent_revision_hash: value.expected_parent_revision_hash,
    expected_parent_artifact_hash: value.expected_parent_artifact_hash,
    semantic_target_map_hash: value.semantic_target_map_hash,
    selection: selection as MagicEditSelectionV1,
    instruction,
    protections: {
      preserve_spoken_words: true,
      preserve_spoken_order: true,
      preserve_claims: true,
      preserve_evidence: true,
      preserve_rights: true,
    },
    requested_profile: 'preview',
    submitted_by: 'Krish',
    submitted_at: value.submitted_at,
  }
}

function parseActivationPayload(value: UnknownRecord): UnknownRecord | null {
  if (!exactKeys(value, [
    'schema_version', 'activation_id', 'job_id', 'platform', 'candidate_hash',
    'expected_parent_revision_hash', 'expected_parent_artifact_hash',
    'prepared_treatment_artifact_hash', 'decision', 'approved_by',
    'confirmation_ref', 'occurred_at',
  ])) return null
  if (
    value.schema_version !== 1
    || !UUID_RE.test(String(value.activation_id || ''))
    || !identifier(value.job_id)
    || !VIDEO_PLATFORMS.includes(value.platform as typeof VIDEO_PLATFORMS[number])
    || !isSha256(value.candidate_hash)
    || !isSha256(value.expected_parent_revision_hash)
    || !isSha256(value.expected_parent_artifact_hash)
    || !isSha256(value.prepared_treatment_artifact_hash)
    || value.decision !== 'activate'
    || value.approved_by !== 'Krish'
    || !validDate(value.occurred_at)
  ) return null
  const prefix = `control-center-confirmation:treatment:${value.prepared_treatment_artifact_hash}:`
  const suffix = typeof value.confirmation_ref === 'string' && value.confirmation_ref.startsWith(prefix)
    ? value.confirmation_ref.slice(prefix.length)
    : ''
  const expectedSuffix = new RegExp(
    `^review:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:decision:${String(value.activation_id)}$`,
    'i',
  )
  if (!expectedSuffix.test(suffix)) return null
  return { ...value, activation_id: String(value.activation_id).toLowerCase() }
}

function parseReturnPayload(value: UnknownRecord): UnknownRecord | null {
  if (!exactKeys(value, [
    'schema_version', 'return_id', 'job_id', 'platform',
    'expected_parent_revision_hash', 'expected_parent_artifact_hash',
    'target_parent_revision_hash', 'target_parent_artifact_hash',
    'returned_by', 'occurred_at',
  ])) return null
  if (
    value.schema_version !== 1
    || !UUID_RE.test(String(value.return_id || ''))
    || !identifier(value.job_id)
    || !VIDEO_PLATFORMS.includes(value.platform as typeof VIDEO_PLATFORMS[number])
    || !isSha256(value.expected_parent_revision_hash)
    || !isSha256(value.expected_parent_artifact_hash)
    || !isSha256(value.target_parent_revision_hash)
    || !isSha256(value.target_parent_artifact_hash)
    || value.returned_by !== 'Krish'
    || !validDate(value.occurred_at)
  ) return null
  return {
    schema_version: 1,
    return_id: String(value.return_id).toLowerCase(),
    job_id: value.job_id,
    platform: value.platform,
    expected_parent_revision_hash: value.expected_parent_revision_hash,
    expected_parent_artifact_hash: value.expected_parent_artifact_hash,
    target_parent_revision_hash: value.target_parent_revision_hash,
    target_parent_artifact_hash: value.target_parent_artifact_hash,
    returned_by: 'Krish',
    occurred_at: value.occurred_at,
  }
}

function parseDecisionRecordPayload(value: UnknownRecord): UnknownRecord | null {
  if (!exactKeys(value, [
    'schema_version', 'decision_id', 'job_id', 'platform', 'review_id', 'gate',
    'candidate_hash', 'semantic_target_map_hash', 'expected_parent_revision_hash',
    'expected_parent_artifact_hash', 'review_revision_hash', 'review_artifact_hash',
    'decision', 'feedback', 'override_reason', 'learning_confirmation',
    'decided_by', 'occurred_at',
  ])) return null
  const candidateHash = value.candidate_hash === null
    ? null
    : isSha256(value.candidate_hash) ? value.candidate_hash : undefined
  const feedback = value.feedback === null ? null : safeRedactedText(value.feedback, 1_600)
  const overrideReason = value.override_reason === null ? null : safeRedactedText(value.override_reason, 800)
  if (
    value.schema_version !== 1
    || !UUID_RE.test(String(value.decision_id || ''))
    || !UUID_RE.test(String(value.review_id || ''))
    || !identifier(value.job_id)
    || !VIDEO_PLATFORMS.includes(value.platform as typeof VIDEO_PLATFORMS[number])
    || !['story', 'treatment', 'final', 'learning'].includes(String(value.gate || ''))
    || candidateHash === undefined
    || !isSha256(value.semantic_target_map_hash)
    || !isSha256(value.expected_parent_revision_hash)
    || !isSha256(value.expected_parent_artifact_hash)
    || !isSha256(value.review_revision_hash)
    || !isSha256(value.review_artifact_hash)
    || !['use_candidate', 'keep_current'].includes(String(value.decision || ''))
    || (value.feedback !== null && !feedback)
    || (value.override_reason !== null && !overrideReason)
    || value.decided_by !== 'Krish'
    || !validDate(value.occurred_at)
  ) return null

  let learningConfirmation: UnknownRecord | null = null
  if (value.learning_confirmation !== null) {
    if (!isRecord(value.learning_confirmation)) return null
    const action = String(value.learning_confirmation.action || '')
    const keys = action === 'correct' ? ['action', 'correction'] : ['action']
    const correction = value.learning_confirmation.correction === undefined
      ? undefined
      : safeRedactedText(value.learning_confirmation.correction, 1_600, 1)
    if (
      !exactKeys(value.learning_confirmation, keys)
      || !['confirm', 'correct', 'observe_only'].includes(action)
      || (value.learning_confirmation.correction !== undefined && !correction)
      || (action === 'correct' && !correction)
    ) return null
    learningConfirmation = { action, ...(correction ? { correction } : {}) }
  }
  if (value.gate === 'learning' && learningConfirmation === null) return null
  if (value.gate !== 'learning' && learningConfirmation !== null) return null
  if (overrideReason !== null && value.decision !== 'use_candidate') return null

  return {
    schema_version: 1,
    decision_id: String(value.decision_id).toLowerCase(),
    job_id: value.job_id,
    platform: value.platform,
    review_id: String(value.review_id).toLowerCase(),
    gate: value.gate,
    candidate_hash: candidateHash,
    semantic_target_map_hash: value.semantic_target_map_hash,
    expected_parent_revision_hash: value.expected_parent_revision_hash,
    expected_parent_artifact_hash: value.expected_parent_artifact_hash,
    review_revision_hash: value.review_revision_hash,
    review_artifact_hash: value.review_artifact_hash,
    decision: value.decision,
    feedback,
    override_reason: overrideReason,
    learning_confirmation: learningConfirmation,
    decided_by: 'Krish',
    occurred_at: value.occurred_at,
  }
}

function parseRecoveryRecordPayload(value: UnknownRecord): UnknownRecord | null {
  if (!exactKeys(value, [
    'schema_version', 'recovery_id', 'job_id', 'platform', 'source_review_id',
    'recovery_review_id', 'source_command_id', 'source_command_hash',
    'source_terminal_reason', 'recovery_root_command_id', 'recovery_generation', 'gate',
    'expected_parent_revision_hash', 'expected_parent_artifact_hash',
    'review_revision_hash', 'review_artifact_hash', 'candidate_hash',
    'semantic_target_map_hash', 'recovered_by', 'occurred_at',
  ])) return null
  const candidateHash = value.candidate_hash === null
    ? null
    : isSha256(value.candidate_hash) ? value.candidate_hash : undefined
  const recoveryGeneration = Number(value.recovery_generation)
  if (
    value.schema_version !== 1
    || !UUID_RE.test(String(value.recovery_id || ''))
    || !UUID_RE.test(String(value.source_review_id || ''))
    || !UUID_RE.test(String(value.recovery_review_id || ''))
    || !UUID_RE.test(String(value.source_command_id || ''))
    || !UUID_RE.test(String(value.recovery_root_command_id || ''))
    || String(value.source_review_id).toLowerCase() === String(value.recovery_review_id).toLowerCase()
    || !identifier(value.job_id)
    || !VIDEO_PLATFORMS.includes(value.platform as typeof VIDEO_PLATFORMS[number])
    || !['story', 'treatment', 'final', 'learning'].includes(String(value.gate || ''))
    || !isSha256(value.source_command_hash)
    || !['runner_failed_receipt', 'attempts_exhausted', 'command_expired'].includes(String(value.source_terminal_reason || ''))
    || !Number.isSafeInteger(recoveryGeneration)
    || recoveryGeneration < 1
    || recoveryGeneration > 3
    || (
      recoveryGeneration === 1
      && String(value.source_command_id).toLowerCase() !== String(value.recovery_root_command_id).toLowerCase()
    )
    || !isSha256(value.expected_parent_revision_hash)
    || !isSha256(value.expected_parent_artifact_hash)
    || !isSha256(value.review_revision_hash)
    || !isSha256(value.review_artifact_hash)
    || candidateHash === undefined
    || !isSha256(value.semantic_target_map_hash)
    || value.recovered_by !== 'Krish'
    || !validDate(value.occurred_at)
  ) return null
  return {
    schema_version: 1,
    recovery_id: String(value.recovery_id).toLowerCase(),
    job_id: value.job_id,
    platform: value.platform,
    source_review_id: String(value.source_review_id).toLowerCase(),
    recovery_review_id: String(value.recovery_review_id).toLowerCase(),
    source_command_id: String(value.source_command_id).toLowerCase(),
    source_command_hash: value.source_command_hash,
    source_terminal_reason: value.source_terminal_reason,
    recovery_root_command_id: String(value.recovery_root_command_id).toLowerCase(),
    recovery_generation: recoveryGeneration,
    gate: value.gate,
    expected_parent_revision_hash: value.expected_parent_revision_hash,
    expected_parent_artifact_hash: value.expected_parent_artifact_hash,
    review_revision_hash: value.review_revision_hash,
    review_artifact_hash: value.review_artifact_hash,
    candidate_hash: candidateHash,
    semantic_target_map_hash: value.semantic_target_map_hash,
    recovered_by: 'Krish',
    occurred_at: value.occurred_at,
  }
}

export interface RunnerCommandHashInputV1 {
  schema_version: 1
  command_kind: 'magic_edit_prepare' | 'magic_edit_activate' | 'magic_edit_return_to_parent' | 'review_decision_record' | 'review_recovery_record'
  job_id: string
  platform: typeof VIDEO_PLATFORMS[number]
  candidate_hash: string | null
  expected_parent_revision_hash: string
  expected_parent_artifact_hash: string
  semantic_target_map_hash: string | null
  idempotency_key: string
  payload_hash: string
}

export function runnerCommandHashInputV1(value: RunnerCommandHashInputV1): RunnerCommandHashInputV1 {
  return {
    schema_version: value.schema_version,
    command_kind: value.command_kind,
    job_id: value.job_id,
    platform: value.platform,
    candidate_hash: value.candidate_hash,
    expected_parent_revision_hash: value.expected_parent_revision_hash,
    expected_parent_artifact_hash: value.expected_parent_artifact_hash,
    semantic_target_map_hash: value.semantic_target_map_hash,
    idempotency_key: value.idempotency_key,
    payload_hash: value.payload_hash,
  }
}

export function projectClaimedCommand(value: unknown): UnknownRecord | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      'command_id', 'schema_version', 'command_kind', 'job_id', 'platform',
      'candidate_hash', 'expected_parent_revision_hash', 'expected_parent_artifact_hash',
      'semantic_target_map_hash', 'payload_hash', 'command_hash', 'payload',
      'idempotency_key', 'issued_at', 'expires_at', 'lease_expires_at',
    ])
    || value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION
  ) return null
  if (!UUID_RE.test(String(value.command_id || '')) || !UUID_RE.test(String(value.idempotency_key || ''))) return null
  if (!identifier(value.job_id) || !VIDEO_PLATFORMS.includes(value.platform as typeof VIDEO_PLATFORMS[number])) return null
  if (!isSha256(value.expected_parent_revision_hash) || !isSha256(value.expected_parent_artifact_hash)) return null
  if (!isSha256(value.payload_hash) || !isSha256(value.command_hash) || !isRecord(value.payload)) return null
  const issuedAt = normalizeDatabaseTimestamp(value.issued_at)
  const expiresAt = normalizeDatabaseTimestamp(value.expires_at)
  const leaseExpiresAt = normalizeDatabaseTimestamp(value.lease_expires_at)
  if (!issuedAt || !expiresAt || !leaseExpiresAt) return null
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) return null
  const candidateHash = value.candidate_hash === null ? null : isSha256(value.candidate_hash) ? value.candidate_hash : undefined
  const semanticTargetMapHash = value.semantic_target_map_hash === null
    ? null
    : isSha256(value.semantic_target_map_hash) ? value.semantic_target_map_hash : undefined
  if (candidateHash === undefined || semanticTargetMapHash === undefined) return null

  const kind = String(value.command_kind || '')
  const payload = kind === 'magic_edit_prepare'
    ? parsePreparePayload(value.payload)
    : kind === 'magic_edit_activate'
      ? parseActivationPayload(value.payload)
      : kind === 'magic_edit_return_to_parent'
        ? parseReturnPayload(value.payload)
      : kind === 'review_decision_record'
          ? parseDecisionRecordPayload(value.payload)
        : kind === 'review_recovery_record'
          ? parseRecoveryRecordPayload(value.payload)
        : null
  if (!payload) return null
  if (kind === 'magic_edit_prepare' && (
    candidateHash !== null
    || semanticTargetMapHash !== payload.semantic_target_map_hash
    || value.job_id !== payload.job_id
    || value.platform !== payload.platform
    || value.expected_parent_revision_hash !== payload.expected_parent_revision_hash
    || value.expected_parent_artifact_hash !== payload.expected_parent_artifact_hash
  )) return null
  if (kind === 'magic_edit_activate' && (
    candidateHash !== payload.candidate_hash
    || semanticTargetMapHash === null
    || value.job_id !== payload.job_id
    || value.platform !== payload.platform
    || value.expected_parent_revision_hash !== payload.expected_parent_revision_hash
    || value.expected_parent_artifact_hash !== payload.expected_parent_artifact_hash
  )) return null
  if (kind === 'magic_edit_return_to_parent' && (
    value.job_id !== payload.job_id
    || value.platform !== payload.platform
    || value.expected_parent_revision_hash !== payload.expected_parent_revision_hash
    || value.expected_parent_artifact_hash !== payload.expected_parent_artifact_hash
    || semanticTargetMapHash !== null
  )) return null
  if (kind === 'review_decision_record' && (
    candidateHash !== payload.candidate_hash
    || semanticTargetMapHash !== payload.semantic_target_map_hash
    || value.idempotency_key !== payload.decision_id
    || value.job_id !== payload.job_id
    || value.platform !== payload.platform
    || value.expected_parent_revision_hash !== payload.expected_parent_revision_hash
    || value.expected_parent_artifact_hash !== payload.expected_parent_artifact_hash
    || (payload.decision === 'use_candidate' && candidateHash !== null)
  )) return null
  if (kind === 'review_recovery_record' && (
    candidateHash !== payload.candidate_hash
    || semanticTargetMapHash !== payload.semantic_target_map_hash
    || value.idempotency_key !== payload.recovery_id
    || value.job_id !== payload.job_id
    || value.platform !== payload.platform
    || value.expected_parent_revision_hash !== payload.expected_parent_revision_hash
    || value.expected_parent_artifact_hash !== payload.expected_parent_artifact_hash
  )) return null

  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    command_id: String(value.command_id).toLowerCase(),
    command_kind: kind,
    job_id: String(value.job_id),
    platform: value.platform,
    candidate_hash: candidateHash,
    expected_parent_revision_hash: value.expected_parent_revision_hash,
    expected_parent_artifact_hash: value.expected_parent_artifact_hash,
    semantic_target_map_hash: semanticTargetMapHash,
    idempotency_key: String(value.idempotency_key).toLowerCase(),
    payload_hash: value.payload_hash,
    command_hash: value.command_hash,
    issued_at: issuedAt,
    expires_at: expiresAt,
    payload,
  }
}

export function videoStudioPreviewObjectKey(
  commandId: string,
  side: typeof VIDEO_STUDIO_PREVIEW_SIDES[number],
  sha256: string,
): string {
  return `commands/${commandId}/previews/${side}/${sha256}.mp4`
}

export interface RunnerPreviewUploadRequestV1 {
  schema_version: 1
  runner_id: string
  command_id: string
  command_hash: string
  lease_token: string
  side: typeof VIDEO_STUDIO_PREVIEW_SIDES[number]
  sha256: string
  md5: string
  content_type: typeof VIDEO_STUDIO_PREVIEW_CONTENT_TYPE
  byte_size: number
}

export function parseRunnerPreviewUploadRequest(value: unknown): RunnerPreviewUploadRequestV1 | null {
  if (!isRecord(value) || !exactKeys(value, [
    'schema_version', 'runner_id', 'command_id', 'command_hash', 'lease_token',
    'side', 'sha256', 'md5', 'content_type', 'byte_size',
  ]) || value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  if (!RUNNER_ID_RE.test(String(value.runner_id || ''))) return null
  if (!UUID_RE.test(String(value.command_id || '')) || !isSha256(value.command_hash)) return null
  const leaseToken = boundedString(value.lease_token, 256, 24)
  if (!leaseToken || !VIDEO_STUDIO_PREVIEW_SIDES.includes(value.side as typeof VIDEO_STUDIO_PREVIEW_SIDES[number])) {
    return null
  }
  if (!isSha256(value.sha256) || !MD5_RE.test(String(value.md5 || '')) || value.content_type !== VIDEO_STUDIO_PREVIEW_CONTENT_TYPE) return null
  if (!Number.isSafeInteger(value.byte_size) || Number(value.byte_size) < 1 || Number(value.byte_size) > VIDEO_STUDIO_PREVIEW_MAX_BYTES) {
    return null
  }
  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    runner_id: String(value.runner_id),
    command_id: String(value.command_id).toLowerCase(),
    command_hash: value.command_hash,
    lease_token: leaseToken,
    side: value.side as RunnerPreviewUploadRequestV1['side'],
    sha256: value.sha256,
    md5: String(value.md5),
    content_type: VIDEO_STUDIO_PREVIEW_CONTENT_TYPE,
    byte_size: Number(value.byte_size),
  }
}

export interface RunnerPreviewRetentionRequestV1 {
  schema_version: 1
  runner_id: string
  limit: number
}

export function parseRunnerPreviewRetentionRequest(value: unknown): RunnerPreviewRetentionRequestV1 | null {
  if (!isRecord(value) || !exactKeys(value, ['schema_version', 'runner_id', 'limit'])) return null
  if (
    value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION
    || !RUNNER_ID_RE.test(String(value.runner_id || ''))
    || !Number.isSafeInteger(value.limit)
    || Number(value.limit) < 1
    || Number(value.limit) > 100
  ) return null
  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    runner_id: String(value.runner_id),
    limit: Number(value.limit),
  }
}

const PROJECT_STAGES = [
  'brief', 'script', 'recording_brief', 'ingest', 'normalize', 'transcript',
  'source_analysis', 'candidates', 'claims', 'visual_plan', 'assets',
  'styleframes', 'animatic', 'treatment', 'render', 'qa', 'package', 'complete',
] as const
const PROJECT_STATUSES = ['active', 'completed', 'blocked', 'archived'] as const
const PROJECT_EDITORIAL_STATES = [
  'ingesting', 'needs_story_review', 'needs_visual_review', 'needs_final_review',
  'needs_learning_confirmation', 'approved', 'blocked',
] as const

export interface RunnerProjectRequestV1 {
  schema_version: 1
  runner_id: string
  software_commit: string
  idempotency_key: string
  projection_hash: string
  projection: {
    job: UnknownRecord
    expected_platform_state?: UnknownRecord | null
    platform_state: UnknownRecord
    review: UnknownRecord
  }
}

export function parseRunnerProjectRequest(value: unknown): RunnerProjectRequestV1 | null {
  const hasExpectedState = isRecord(value)
    && isRecord(value.projection)
    && Object.prototype.hasOwnProperty.call(value.projection, 'expected_platform_state')
  const hasSourceEventCount = isRecord(value)
    && isRecord(value.projection)
    && isRecord(value.projection.job)
    && Object.prototype.hasOwnProperty.call(value.projection.job, 'source_event_count')
  const hasSourceEventChainHash = isRecord(value)
    && isRecord(value.projection)
    && isRecord(value.projection.job)
    && Object.prototype.hasOwnProperty.call(value.projection.job, 'source_event_chain_hash')
  const hasSourceRevisionHash = isRecord(value)
    && isRecord(value.projection)
    && isRecord(value.projection.job)
    && Object.prototype.hasOwnProperty.call(value.projection.job, 'source_revision_hash')
  if (!isRecord(value) || !exactKeys(value, [
    'schema_version', 'runner_id', 'software_commit', 'idempotency_key',
    'projection_hash', 'projection',
  ])) return null
  if (
    value.schema_version !== 1
    || !RUNNER_ID_RE.test(String(value.runner_id || ''))
    || !COMMIT_RE.test(String(value.software_commit || ''))
    || !UUID_RE.test(String(value.idempotency_key || ''))
    || !isSha256(value.projection_hash)
    || !isRecord(value.projection)
    || !exactKeys(value.projection, [
      'job', 'platform_state', 'review',
      ...(hasExpectedState ? ['expected_platform_state'] : []),
    ])
    || !isRecord(value.projection.job)
    || !isRecord(value.projection.platform_state)
    || !isRecord(value.projection.review)
    || hasSourceEventCount !== hasSourceEventChainHash
    || hasSourceEventCount !== hasSourceRevisionHash
    || (hasExpectedState && !hasSourceEventCount)
  ) return null

  const job = value.projection.job
  if (!exactKeys(job, [
    'job_id', 'series', 'mode', 'target_platforms', 'stage', 'status',
    'safe_title', 'safe_summary',
    ...(hasSourceEventCount ? ['source_event_count'] : []),
    ...(hasSourceEventChainHash ? ['source_event_chain_hash'] : []),
    ...(hasSourceRevisionHash ? ['source_revision_hash'] : []),
  ])) return null
  const safeJobTitle = safeRedactedText(job.safe_title, 200, 1)
  const safeJobSummary = safeRedactedText(job.safe_summary, 600, 1)
  if (
    !identifier(job.job_id)
    || !['money_of_ai', 'built_with_ai'].includes(String(job.series || ''))
    || !['extract', 'solo', 'short_native'].includes(String(job.mode || ''))
    || !Array.isArray(job.target_platforms)
    || job.target_platforms.length < 1
    || job.target_platforms.length > 4
    || new Set(job.target_platforms).size !== job.target_platforms.length
    || job.target_platforms.some((item) => !VIDEO_PLATFORMS.includes(item as typeof VIDEO_PLATFORMS[number]))
    || !PROJECT_STAGES.includes(job.stage as typeof PROJECT_STAGES[number])
    || !PROJECT_STATUSES.includes(job.status as typeof PROJECT_STATUSES[number])
    || (hasSourceEventCount && (
      !Number.isSafeInteger(job.source_event_count)
      || Number(job.source_event_count) < 1
    ))
    || (hasSourceEventChainHash && !isSha256(job.source_event_chain_hash))
    || (hasSourceRevisionHash && !isSha256(job.source_revision_hash))
    || !safeJobTitle
    || !safeJobSummary
  ) return null

  let expectedPlatformState: UnknownRecord | null | undefined
  if (hasExpectedState) {
    const expected = value.projection.expected_platform_state
    if (expected === null) {
      expectedPlatformState = null
    } else {
      if (!isRecord(expected) || !exactKeys(expected, [
        'platform', 'active_revision_hash', 'active_artifact_hash', 'active_candidate_hash',
        'parent_revision_hash', 'parent_artifact_hash', 'parent_candidate_hash',
        'semantic_target_map_hash', 'editorial_state', 'route_state',
      ])) return null
      if (
        expected.platform !== value.projection.platform_state.platform
        || !VIDEO_PLATFORMS.includes(expected.platform as typeof VIDEO_PLATFORMS[number])
        || !isSha256(expected.active_revision_hash)
        || !isSha256(expected.active_artifact_hash)
        || (expected.active_candidate_hash !== null && !isSha256(expected.active_candidate_hash))
        || !isSha256(expected.semantic_target_map_hash)
        || !PROJECT_EDITORIAL_STATES.includes(expected.editorial_state as typeof PROJECT_EDITORIAL_STATES[number])
        || !['standard', 'requires_editorial_route'].includes(String(expected.route_state || ''))
        || (expected.parent_revision_hash === null) !== (expected.parent_artifact_hash === null)
        || (expected.parent_revision_hash !== null && !isSha256(expected.parent_revision_hash))
        || (expected.parent_artifact_hash !== null && !isSha256(expected.parent_artifact_hash))
        || (expected.parent_candidate_hash !== null && !isSha256(expected.parent_candidate_hash))
        || (expected.parent_candidate_hash !== null && expected.parent_revision_hash === null)
        || (
          expected.active_candidate_hash === null
            ? expected.parent_revision_hash !== null
              || expected.parent_artifact_hash !== null
              || expected.parent_candidate_hash !== null
            : expected.parent_revision_hash === null || expected.parent_artifact_hash === null
        )
      ) return null
      expectedPlatformState = {
        platform: expected.platform,
        active_revision_hash: expected.active_revision_hash,
        active_artifact_hash: expected.active_artifact_hash,
        active_candidate_hash: expected.active_candidate_hash,
        parent_revision_hash: expected.parent_revision_hash,
        parent_artifact_hash: expected.parent_artifact_hash,
        parent_candidate_hash: expected.parent_candidate_hash,
        semantic_target_map_hash: expected.semantic_target_map_hash,
        editorial_state: expected.editorial_state,
        route_state: expected.route_state,
      }
    }
  }

  const state = value.projection.platform_state
  if (!exactKeys(state, [
    'platform', 'active_revision_hash', 'active_artifact_hash',
    'active_candidate_hash', 'parent_revision_hash', 'parent_artifact_hash',
    'parent_candidate_hash', 'semantic_target_map_hash', 'editorial_state',
    'route_state',
  ])) return null
  if (
    !VIDEO_PLATFORMS.includes(state.platform as typeof VIDEO_PLATFORMS[number])
    || !job.target_platforms.includes(state.platform)
    || !isSha256(state.active_revision_hash)
    || !isSha256(state.active_artifact_hash)
    || (state.active_candidate_hash !== null && !isSha256(state.active_candidate_hash))
    || !isSha256(state.semantic_target_map_hash)
    || !PROJECT_EDITORIAL_STATES.includes(state.editorial_state as typeof PROJECT_EDITORIAL_STATES[number])
    || !['standard', 'requires_editorial_route'].includes(String(state.route_state || ''))
    || (hasSourceRevisionHash && job.source_revision_hash !== state.active_revision_hash)
  ) return null
  if (
    (state.parent_revision_hash === null) !== (state.parent_artifact_hash === null)
    || (state.parent_revision_hash !== null && !isSha256(state.parent_revision_hash))
    || (state.parent_artifact_hash !== null && !isSha256(state.parent_artifact_hash))
    || (state.parent_candidate_hash !== null && !isSha256(state.parent_candidate_hash))
    || (state.parent_candidate_hash !== null && state.parent_revision_hash === null)
    || (
      state.active_candidate_hash === null
        ? state.parent_revision_hash !== null
          || state.parent_artifact_hash !== null
          || state.parent_candidate_hash !== null
        : state.parent_revision_hash === null || state.parent_artifact_hash === null
    )
  ) return null

  const review = value.projection.review
  if (!exactKeys(review, [
    'id', 'gate', 'safe_title', 'safe_summary', 'parent_revision_hash',
    'parent_artifact_hash', 'revision_hash', 'artifact_hash', 'candidate_hash',
    'route_state', 'safe_payload', 'hard_gates', 'created_at',
  ])) return null
  const safeReviewTitle = safeRedactedText(review.safe_title, 200, 1)
  const safeReviewSummary = safeRedactedText(review.safe_summary, 600, 1)
  const safePayload = parseReviewPayload(review.safe_payload)
  const hardGates = parseHardGates(review.hard_gates)
  if (
    !UUID_RE.test(String(review.id || ''))
    || !['story', 'treatment', 'final', 'learning'].includes(String(review.gate || ''))
    || !safeReviewTitle
    || !safeReviewSummary
    || review.parent_revision_hash !== state.active_revision_hash
    || review.parent_artifact_hash !== state.active_artifact_hash
    || !isSha256(review.revision_hash)
    || !isSha256(review.artifact_hash)
    || review.candidate_hash !== null
    || !['standard', 'requires_editorial_route'].includes(String(review.route_state || ''))
    || !safePayload
    || !hardGates
    || safePayload.semantic_target_map_hash !== state.semantic_target_map_hash
    || JSON.stringify(safePayload.blocking_gates) !== JSON.stringify(hardGates)
    || !validDate(review.created_at)
  ) return null

  return {
    schema_version: 1,
    runner_id: String(value.runner_id),
    software_commit: String(value.software_commit),
    idempotency_key: String(value.idempotency_key).toLowerCase(),
    projection_hash: value.projection_hash,
    projection: {
      job: {
        job_id: job.job_id,
        series: job.series,
        mode: job.mode,
        target_platforms: [...job.target_platforms],
        stage: job.stage,
        status: job.status,
        safe_title: safeJobTitle,
        safe_summary: safeJobSummary,
        ...(hasSourceEventCount ? { source_event_count: Number(job.source_event_count) } : {}),
        ...(hasSourceEventChainHash ? { source_event_chain_hash: job.source_event_chain_hash } : {}),
        ...(hasSourceRevisionHash ? { source_revision_hash: job.source_revision_hash } : {}),
      },
      ...(hasExpectedState ? { expected_platform_state: expectedPlatformState ?? null } : {}),
      platform_state: {
        platform: state.platform,
        active_revision_hash: state.active_revision_hash,
        active_artifact_hash: state.active_artifact_hash,
        active_candidate_hash: state.active_candidate_hash,
        parent_revision_hash: state.parent_revision_hash,
        parent_artifact_hash: state.parent_artifact_hash,
        parent_candidate_hash: state.parent_candidate_hash,
        semantic_target_map_hash: state.semantic_target_map_hash,
        editorial_state: state.editorial_state,
        route_state: state.route_state,
      },
      review: {
        id: String(review.id).toLowerCase(),
        gate: review.gate,
        safe_title: safeReviewTitle,
        safe_summary: safeReviewSummary,
        parent_revision_hash: review.parent_revision_hash,
        parent_artifact_hash: review.parent_artifact_hash,
        revision_hash: review.revision_hash,
        artifact_hash: review.artifact_hash,
        candidate_hash: null,
        route_state: review.route_state,
        safe_payload: safePayload,
        hard_gates: hardGates,
        created_at: review.created_at,
      },
    },
  }
}

function safeResultRefs(value: unknown, commandId: string): UnknownRecord | null {
  if (!isRecord(value)) return null
  const allowedKeys = [
    'review_id', 'candidate_hash', 'semantic_target_map_hash', 'safe_title', 'safe_summary', 'review_payload',
    'before_preview_object_key', 'before_preview_hash', 'before_preview_md5', 'before_preview_byte_size',
    'after_preview_object_key', 'after_preview_hash', 'after_preview_md5', 'after_preview_byte_size',
    'comparison_alignment', 'comparison_start_ms', 'comparison_end_ms',
    'result_source_event_count', 'result_source_event_chain_hash', 'result_source_revision_hash',
  ]
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return null
  const refs: UnknownRecord = {}
  const safeTitle = value.safe_title === undefined ? undefined : safeRedactedText(value.safe_title, 200, 1)
  const safeSummary = value.safe_summary === undefined ? undefined : safeRedactedText(value.safe_summary, 600, 1)
  if (value.safe_title !== undefined && !safeTitle) return null
  if (value.safe_summary !== undefined && !safeSummary) return null
  if (safeTitle) refs.safe_title = safeTitle
  if (safeSummary) refs.safe_summary = safeSummary
  if (value.review_id !== undefined) {
    if (!UUID_RE.test(String(value.review_id || ''))) return null
    refs.review_id = String(value.review_id).toLowerCase()
  }
  if (value.candidate_hash !== undefined) {
    if (!isSha256(value.candidate_hash)) return null
    refs.candidate_hash = value.candidate_hash
  }
  if (value.semantic_target_map_hash !== undefined) {
    if (!isSha256(value.semantic_target_map_hash)) return null
    refs.semantic_target_map_hash = value.semantic_target_map_hash
  }
  if (value.result_source_event_count !== undefined) {
    if (
      !Number.isSafeInteger(value.result_source_event_count)
      || Number(value.result_source_event_count) < 1
    ) return null
    refs.result_source_event_count = Number(value.result_source_event_count)
  }
  if (value.result_source_event_chain_hash !== undefined) {
    if (!isSha256(value.result_source_event_chain_hash)) return null
    refs.result_source_event_chain_hash = value.result_source_event_chain_hash
  }
  if (value.result_source_revision_hash !== undefined) {
    if (!isSha256(value.result_source_revision_hash)) return null
    refs.result_source_revision_hash = value.result_source_revision_hash
  }
  if (
    (refs.result_source_event_count === undefined)
    !== (refs.result_source_event_chain_hash === undefined)
    || (refs.result_source_event_count === undefined)
      !== (refs.result_source_revision_hash === undefined)
  ) return null
  if (value.review_payload !== undefined) {
    const reviewPayload = parseReviewPayload(value.review_payload)
    if (!reviewPayload) return null
    refs.review_payload = reviewPayload
  }

  for (const side of VIDEO_STUDIO_PREVIEW_SIDES) {
    const objectKeyName = `${side}_preview_object_key`
    const hashName = `${side}_preview_hash`
    const md5Name = `${side}_preview_md5`
    const byteSizeName = `${side}_preview_byte_size`
    const values = [value[objectKeyName], value[hashName], value[md5Name], value[byteSizeName]]
    const supplied = values.filter((item) => item !== undefined && item !== null).length
    if (supplied === 0) continue
    if (supplied !== values.length || !isSha256(value[hashName]) || !MD5_RE.test(String(value[md5Name] || ''))) return null
    if (
      !Number.isSafeInteger(value[byteSizeName])
      || Number(value[byteSizeName]) < 1
      || Number(value[byteSizeName]) > VIDEO_STUDIO_PREVIEW_MAX_BYTES
    ) return null
    const expectedKey = videoStudioPreviewObjectKey(commandId, side, String(value[hashName]))
    if (value[objectKeyName] !== expectedKey) return null
    refs[objectKeyName] = expectedKey
    refs[hashName] = value[hashName]
    refs[md5Name] = value[md5Name]
    refs[byteSizeName] = Number(value[byteSizeName])
  }

  if (value.comparison_alignment !== 'exact' && value.comparison_alignment !== 'unavailable') return null
  refs.comparison_alignment = value.comparison_alignment
  for (const key of ['comparison_start_ms', 'comparison_end_ms'] as const) {
    if (value[key] === undefined || value[key] === null) continue
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 86_400_000) return null
    refs[key] = Number(value[key])
  }
  if (
    typeof refs.comparison_start_ms === 'number'
    && typeof refs.comparison_end_ms === 'number'
    && refs.comparison_end_ms <= refs.comparison_start_ms
  ) return null
  if ((refs.comparison_start_ms === undefined) !== (refs.comparison_end_ms === undefined)) return null
  if (
    refs.comparison_alignment === 'exact'
    && (
      !refs.before_preview_object_key
      || !refs.after_preview_object_key
      || typeof refs.comparison_start_ms !== 'number'
      || typeof refs.comparison_end_ms !== 'number'
    )
  ) return null
  if (
    refs.comparison_alignment === 'unavailable'
    && (refs.comparison_start_ms !== undefined || refs.comparison_end_ms !== undefined)
  ) return null
  if (
    refs.candidate_hash
    && (
      !refs.review_id
      || !refs.review_payload
      || !refs.before_preview_object_key
      || !refs.after_preview_object_key
      || refs.comparison_alignment !== 'exact'
    )
  ) return null
  if (refs.review_payload && !refs.review_id) return null
  return refs
}

export interface RunnerClaimRequestV1 {
  schema_version: 1
  runner_id: string
  software_commit: string
  command_schema_versions: number[]
  lease_seconds: number
}

export function parseRunnerClaimRequest(value: unknown): RunnerClaimRequestV1 | null {
  if (!isRecord(value)) return null
  const claimKeys = value.lease_seconds === undefined
    ? ['schema_version', 'runner_id', 'software_commit', 'command_schema_versions']
    : ['schema_version', 'runner_id', 'software_commit', 'command_schema_versions', 'lease_seconds']
  if (!exactKeys(value, claimKeys) || value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  if (!RUNNER_ID_RE.test(String(value.runner_id || '')) || !COMMIT_RE.test(String(value.software_commit || ''))) return null
  if (!Array.isArray(value.command_schema_versions)) return null
  const versions = value.command_schema_versions
  if (versions.length !== 1 || versions[0] !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  const leaseSeconds = value.lease_seconds === undefined ? 120 : Number(value.lease_seconds)
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 300) return null
  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    runner_id: String(value.runner_id),
    software_commit: String(value.software_commit),
    command_schema_versions: [VIDEO_STUDIO_CONTROL_SCHEMA_VERSION],
    lease_seconds: leaseSeconds,
  }
}

export interface RunnerHeartbeatRequestV1 {
  schema_version: 1
  runner_id: string
  status: 'idle' | 'working' | 'degraded'
  software_commit: string
  command_schema_versions: number[]
  drive_state: 'ready' | 'unavailable' | 'not_configured'
  active_command_id: string | null
  pending_receipts: number
  occurred_at: string
  lease_token: string | null
}

export function parseRunnerHeartbeatRequest(value: unknown, now = Date.now()): RunnerHeartbeatRequestV1 | null {
  if (!isRecord(value)) return null
  const heartbeatKeys = [
    'schema_version', 'runner_id', 'status', 'software_commit',
    'command_schema_versions', 'drive_state', 'pending_receipts', 'occurred_at',
    ...(value.active_command_id === undefined ? [] : ['active_command_id']),
    ...(value.lease_token === undefined ? [] : ['lease_token']),
  ]
  if (!exactKeys(value, heartbeatKeys) || value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  if (!RUNNER_ID_RE.test(String(value.runner_id || '')) || !COMMIT_RE.test(String(value.software_commit || ''))) return null
  if (!['idle', 'working', 'degraded'].includes(String(value.status || ''))) return null
  if (!['ready', 'unavailable', 'not_configured'].includes(String(value.drive_state || ''))) return null
  if (!Array.isArray(value.command_schema_versions) || value.command_schema_versions.length !== 1 || value.command_schema_versions[0] !== 1) return null
  if (!Number.isSafeInteger(value.pending_receipts) || Number(value.pending_receipts) < 0 || Number(value.pending_receipts) > 10_000) return null
  if (!validDate(value.occurred_at) || Math.abs(Date.parse(value.occurred_at) - now) > 10 * 60 * 1000) return null
  const activeCommandId = value.active_command_id === undefined
    ? null
    : String(value.active_command_id)
  if (activeCommandId && !UUID_RE.test(activeCommandId)) return null
  const leaseToken = value.lease_token === null || value.lease_token === undefined
    ? null
    : boundedString(value.lease_token, 256, 24)
  if (activeCommandId && !leaseToken) return null
  if (!activeCommandId && leaseToken) return null
  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    runner_id: String(value.runner_id),
    status: value.status as RunnerHeartbeatRequestV1['status'],
    software_commit: String(value.software_commit),
    command_schema_versions: [VIDEO_STUDIO_CONTROL_SCHEMA_VERSION],
    drive_state: value.drive_state as RunnerHeartbeatRequestV1['drive_state'],
    active_command_id: activeCommandId,
    pending_receipts: Number(value.pending_receipts),
    occurred_at: value.occurred_at,
    lease_token: leaseToken,
  }
}

export interface RunnerCompleteRequestV1 {
  schema_version: 1
  runner_id: string
  lease_token: string
  receipt: {
    schema_version: 1
    command_id: string
    command_hash: string
    job_id: string
    status: 'succeeded' | 'requires_editorial_route' | 'failed'
    result_revision_hash: string | null
    result_artifact_hash: string | null
    result_refs?: UnknownRecord
    hard_gates: NonNullable<ReturnType<typeof parseHardGates>>
    retryable: boolean
    safe_code: string | null
    started_at: string
    finished_at: string
    receipt_hash: string
    receipt_signature: string
  }
}

export function parseRunnerCompleteRequest(value: unknown): RunnerCompleteRequestV1 | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ['schema_version', 'runner_id', 'lease_token', 'receipt'])
    || value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION
    || !isRecord(value.receipt)
  ) return null
  if (!RUNNER_ID_RE.test(String(value.runner_id || ''))) return null
  const leaseToken = boundedString(value.lease_token, 256, 24)
  if (!leaseToken) return null

  const receipt = value.receipt
  const receiptKeys = [
    'schema_version', 'command_id', 'command_hash', 'job_id', 'status',
    'result_revision_hash', 'result_artifact_hash',
    ...(receipt.result_refs === undefined ? [] : ['result_refs']),
    'hard_gates', 'retryable', 'safe_code', 'started_at', 'finished_at',
    'receipt_hash', 'receipt_signature',
  ]
  if (!exactKeys(receipt, receiptKeys)) return null
  if (receipt.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  if (!UUID_RE.test(String(receipt.command_id || '')) || !identifier(receipt.job_id)) return null
  if (!isSha256(receipt.command_hash) || !isSha256(receipt.receipt_hash)) return null
  if (!SIGNATURE_RE.test(String(receipt.receipt_signature || ''))) return null
  if (!['succeeded', 'requires_editorial_route', 'failed'].includes(String(receipt.status || ''))) return null
  if (receipt.retryable !== false) return null
  if (!validDate(receipt.started_at) || !validDate(receipt.finished_at) || Date.parse(receipt.finished_at) < Date.parse(receipt.started_at)) return null
  const safeCode = receipt.safe_code === null || receipt.safe_code === undefined ? null : String(receipt.safe_code)
  if (safeCode && !SAFE_CODE_RE.test(safeCode)) return null

  const resultRevisionHash = receipt.result_revision_hash === null || receipt.result_revision_hash === undefined
    ? null
    : String(receipt.result_revision_hash)
  const resultArtifactHash = receipt.result_artifact_hash === null || receipt.result_artifact_hash === undefined
    ? null
    : String(receipt.result_artifact_hash)
  if (resultRevisionHash && !isSha256(resultRevisionHash)) return null
  if (resultArtifactHash && !isSha256(resultArtifactHash)) return null
  if (receipt.status !== 'failed' && (!resultRevisionHash || !resultArtifactHash)) return null
  if (receipt.status === 'failed' && (resultRevisionHash || resultArtifactHash)) return null
  if (receipt.status === 'succeeded' && safeCode !== null) return null
  if (receipt.status === 'requires_editorial_route' && safeCode !== 'requires_editorial_route') return null

  const refs = receipt.result_refs === undefined
    ? undefined
    : safeResultRefs(receipt.result_refs, String(receipt.command_id))
  if (receipt.result_refs !== undefined && !refs) return null
  const hasResultSourceCursor = refs?.result_source_event_count !== undefined
  if (
    (receipt.status === 'failed' && hasResultSourceCursor)
    || (receipt.status !== 'failed' && !hasResultSourceCursor)
  ) return null
  const hardGates = parseHardGates(receipt.hard_gates)
  if (!hardGates) return null
  if (refs?.review_payload) {
    const payloadGates = parseHardGates((refs.review_payload as UnknownRecord).blocking_gates)
    if (!payloadGates || JSON.stringify(payloadGates) !== JSON.stringify(hardGates)) return null
  }
  if (
    receipt.status === 'requires_editorial_route'
    && (
      !refs
      || !refs.review_id
      || !refs.review_payload
      || refs.candidate_hash !== undefined
      || refs.before_preview_object_key !== undefined
      || refs.after_preview_object_key !== undefined
      || refs.comparison_alignment !== 'unavailable'
      || hardGatesPassed(hardGates)
    )
  ) return null

  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    runner_id: String(value.runner_id),
    lease_token: leaseToken,
    receipt: {
      schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
      command_id: String(receipt.command_id).toLowerCase(),
      command_hash: receipt.command_hash,
      job_id: String(receipt.job_id),
      status: receipt.status as RunnerCompleteRequestV1['receipt']['status'],
      result_revision_hash: resultRevisionHash,
      result_artifact_hash: resultArtifactHash,
      ...(refs ? { result_refs: refs } : {}),
      hard_gates: hardGates,
      retryable: receipt.retryable,
      safe_code: safeCode,
      started_at: receipt.started_at,
      finished_at: receipt.finished_at,
      receipt_hash: receipt.receipt_hash,
      receipt_signature: String(receipt.receipt_signature),
    },
  }
}

export function runnerReceiptHashInput(receipt: RunnerCompleteRequestV1['receipt']): UnknownRecord {
  return Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== 'receipt_hash' && key !== 'receipt_signature'),
  )
}
