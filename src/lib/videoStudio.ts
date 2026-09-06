export const VIDEO_STUDIO_SCHEMA_VERSION = 1 as const

/** Fail closed until the secure routes, migration and runtime config are live. */
export function videoEngineEnabled(): boolean {
  return import.meta.env.VITE_VIDEO_ENGINE_ENABLED === 'true'
}

export type VideoStudioSeries = 'money_of_ai' | 'built_with_ai'
export type VideoStudioMode = 'extract' | 'solo' | 'short_native'
export type VideoStudioPlatform = 'youtube_shorts' | 'linkedin' | 'tiktok' | 'instagram_reels'
export type VideoStudioGate = 'story' | 'treatment' | 'final' | 'learning'
export type VideoStudioReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'superseded'
export type VideoStudioPreviewState = 'processing' | 'available' | 'unavailable' | 'expired'
export type VideoStudioEditorialState =
  | 'ingesting'
  | 'needs_story_review'
  | 'needs_visual_review'
  | 'needs_final_review'
  | 'needs_learning_confirmation'
  | 'approved'
  | 'blocked'
export type VideoStudioRunnerState = 'offline' | 'idle' | 'queued' | 'working' | 'attention'
export type VideoStudioRouteState = 'standard' | 'requires_editorial_route'

const SERIES = ['money_of_ai', 'built_with_ai'] as const
const MODES = ['extract', 'solo', 'short_native'] as const
const PLATFORMS = ['youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels'] as const
const REVIEW_GATES = ['story', 'treatment', 'final', 'learning'] as const
const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested', 'superseded'] as const
const PREVIEW_STATES = ['processing', 'available', 'unavailable', 'expired'] as const
const ROUTE_STATES = ['standard', 'requires_editorial_route'] as const
const EDITORIAL_STATES = ['ingesting', 'needs_story_review', 'needs_visual_review', 'needs_final_review', 'needs_learning_confirmation', 'approved', 'blocked'] as const
const RUNNER_STATES = ['offline', 'idle', 'queued', 'working', 'attention'] as const
const BLOCKING_GATES = ['truth', 'rights', 'confidentiality', 'transcript_fidelity', 'naming'] as const
const BLOCKING_GATE_STATUSES = ['passed', 'blocked', 'pending'] as const
const COMMAND_STATUSES = ['queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled'] as const
const DECISION_COMMAND_KINDS = ['magic_edit_activate', 'review_decision_record'] as const

export interface VideoStudioReviewListItem {
  id: string
  job_id: string
  gate: VideoStudioGate
  status: VideoStudioReviewStatus
  series: VideoStudioSeries
  mode: VideoStudioMode
  platform: VideoStudioPlatform
  safe_title: string
  safe_summary: string
  revision_hash: string
  parent_revision_hash: string
  parent_artifact_hash: string
  artifact_hash: string
  candidate_hash: string | null
  preview_state: VideoStudioPreviewState
  route_state: VideoStudioRouteState
  queues_activation: boolean
  created_at: string
  expires_at: string | null
}

export interface VideoStudioProxy {
  url: string | null
  expires_at: string | null
}

export interface VideoStudioComparison {
  state: VideoStudioPreviewState
  before: VideoStudioProxy
  after: VideoStudioProxy
  alignment: 'exact' | 'unavailable'
  start_ms: number | null
  end_ms: number | null
}

export type VideoStudioCommandStatus = typeof COMMAND_STATUSES[number]

export interface VideoStudioDecisionCommand {
  id: string
  kind: typeof DECISION_COMMAND_KINDS[number]
  status: VideoStudioCommandStatus
  safe_code: string | null
  parent_revision_hash: string
  parent_artifact_hash: string
  created_at: string
  completed_at: string | null
}

export interface VideoStudioPrepareCommand {
  id: string
  kind: 'magic_edit_prepare'
  status: VideoStudioCommandStatus
  safe_code: string | null
  parent_revision_hash: string
  parent_artifact_hash: string
  result_review_id: string | null
  created_at: string
  completed_at: string | null
}

export interface VideoStudioRecoveryBindingCommand {
  id: string
  kind: 'review_recovery_record'
  status: VideoStudioCommandStatus
  safe_code: string | null
  parent_revision_hash: string
  parent_artifact_hash: string
  source_review_id: string
  result_review_id: string | null
  created_at: string
  completed_at: string | null
}

export interface VideoStudioRecoveryState {
  available: boolean
  of_command_id: string | null
  current_generation: 0 | 1 | 2 | 3
  max_generation: 3
  recovery_review_id: string | null
  recovered_review_id: string | null
  binding_command: VideoStudioRecoveryBindingCommand | null
}

export interface VideoStudioReview extends VideoStudioReviewListItem {
  editorial_state: VideoStudioEditorialState
  runner_state: VideoStudioRunnerState
  review_payload: Record<string, unknown>
  preview: VideoStudioProxy & { state: VideoStudioPreviewState }
  comparison: VideoStudioComparison
  prepare_command: VideoStudioPrepareCommand | null
  decision_command: VideoStudioDecisionCommand | null
  recovery: VideoStudioRecoveryState
}

const REVIEW_LIST_KEYS = [
  'id', 'job_id', 'gate', 'status', 'series', 'mode', 'platform', 'safe_title',
  'safe_summary', 'revision_hash', 'parent_revision_hash', 'parent_artifact_hash',
  'artifact_hash', 'candidate_hash', 'preview_state', 'route_state',
  'queues_activation', 'created_at', 'expires_at',
] as const

const REVIEW_DETAIL_KEYS = [
  ...REVIEW_LIST_KEYS,
  'editorial_state', 'runner_state', 'review_payload', 'preview', 'comparison',
  'prepare_command', 'decision_command', 'recovery',
] as const

export interface VideoStudioActiveJob {
  job_id: string
  platform: VideoStudioPlatform
  active_revision_hash: string
  active_artifact_hash: string
  active_candidate_hash: string | null
  parent_revision_hash: string | null
  parent_artifact_hash: string | null
  updated_at: string
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function inSet(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value)
}

function exactHash(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function exactUuid(value: unknown): boolean {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function exactIdentifier(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value)
}

function exactObjectKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function boundedText(value: unknown, max: number): boolean {
  if (typeof value !== 'string' || value.includes('\u0000')) return false
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= max
}

function validTimestamp(value: unknown): boolean {
  return typeof value === 'string'
    && value.length <= 64
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function validOptionalTimestamp(value: unknown): boolean {
  return value === null || validTimestamp(value)
}

function validTargetTime(value: unknown, min: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= 86_400_000
}

export function normaliseVideoStudioTarget(value: unknown): VideoStudioTarget | null {
  const target = recordValue(value)
  if (!target) return null
  if (target.kind === 'moment') {
    return exactObjectKeys(target, ['kind', 'start_ms']) && validTargetTime(target.start_ms, 0)
      ? { kind: 'moment', start_ms: target.start_ms }
      : null
  }
  if (target.kind === 'range') {
    return exactObjectKeys(target, ['kind', 'start_ms', 'end_ms'])
      && validTargetTime(target.start_ms, 0)
      && validTargetTime(target.end_ms, 1)
      && target.end_ms > target.start_ms
      ? { kind: 'range', start_ms: target.start_ms, end_ms: target.end_ms }
      : null
  }
  if ((target.kind === 'caption_block' || target.kind === 'overlay' || target.kind === 'speaker' || target.kind === 'beat')
    && exactObjectKeys(target, ['kind', 'ref'])
    && typeof target.ref === 'string'
    && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(target.ref)) {
    return { kind: target.kind, ref: target.ref }
  }
  return null
}

export function videoStudioTargetIsWellFormed(value: unknown): value is VideoStudioTarget {
  return normaliseVideoStudioTarget(value) !== null
}

/**
 * Individual malformed rows stay visible so a broken projection can never look
 * like an empty queue. The UI opens them in a fail-closed state instead.
 */
function videoStudioListFieldsAreWellFormed(row: Record<string, unknown>): boolean {
  return Boolean(exactUuid(row.id)
    && exactIdentifier(row.job_id)
    && inSet(SERIES, row.series)
    && inSet(MODES, row.mode)
    && inSet(PLATFORMS, row.platform)
    && inSet(REVIEW_GATES, row.gate)
    && inSet(REVIEW_STATUSES, row.status)
    && inSet(PREVIEW_STATES, row.preview_state)
    && inSet(ROUTE_STATES, row.route_state)
    && typeof row.queues_activation === 'boolean'
    && boundedText(row.safe_title, 200)
    && boundedText(row.safe_summary, 600)
    && exactHash(row.revision_hash)
    && exactHash(row.parent_revision_hash)
    && exactHash(row.parent_artifact_hash)
    && exactHash(row.artifact_hash)
    && (row.candidate_hash === null || exactHash(row.candidate_hash))
    && (row.queues_activation === false || exactHash(row.candidate_hash))
    && validTimestamp(row.created_at)
    && validOptionalTimestamp(row.expires_at))
}

export function videoStudioListItemIsWellFormed(value: unknown): value is VideoStudioReviewListItem {
  const row = recordValue(value)
  return Boolean(row
    && exactObjectKeys(row, REVIEW_LIST_KEYS)
    && videoStudioListFieldsAreWellFormed(row))
}

function proxyIsWellFormed(
  value: unknown,
  reviewId: string,
  side: 'before' | 'after',
): value is VideoStudioProxy {
  const proxy = recordValue(value)
  if (!proxy || !exactObjectKeys(proxy, ['url', 'expires_at'])) return false
  const expectedUrl = `/api/video-studio/reviews/${encodeURIComponent(reviewId)}/comparison/${side}`
  const safeUrl = proxy.url === null
    || (typeof proxy.url === 'string'
      && safeVideoProxyUrl(proxy.url) === proxy.url
      && proxy.url === expectedUrl)
  return safeUrl && validOptionalTimestamp(proxy.expires_at)
}

function decisionCommandIsWellFormed(
  value: unknown,
  review: Record<string, unknown>,
): value is VideoStudioDecisionCommand {
  const command = recordValue(value)
  if (!command
    || !exactObjectKeys(command, [
      'id', 'kind', 'status', 'safe_code', 'parent_revision_hash',
      'parent_artifact_hash', 'created_at', 'completed_at',
    ])
    || !exactUuid(command.id)
    || !inSet(DECISION_COMMAND_KINDS, command.kind)
    || !inSet(COMMAND_STATUSES, command.status)
    || (command.safe_code !== null
      && (typeof command.safe_code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(command.safe_code)))
    || command.parent_revision_hash !== review.parent_revision_hash
    || command.parent_artifact_hash !== review.parent_artifact_hash
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || !validTimestamp(command.created_at)
    || !validOptionalTimestamp(command.completed_at)) return false

  if (review.status === 'approved') {
    const expectedKind = review.queues_activation === true ? 'magic_edit_activate' : 'review_decision_record'
    if (command.kind !== expectedKind) return false
  } else if (review.status === 'rejected' && command.kind !== 'review_decision_record') {
    return false
  }
  return true
}

function prepareCommandIsWellFormed(
  value: unknown,
  review: Record<string, unknown>,
): value is VideoStudioPrepareCommand {
  const command = recordValue(value)
  if (!command
    || !exactObjectKeys(command, [
      'id', 'kind', 'status', 'safe_code', 'parent_revision_hash',
      'parent_artifact_hash', 'result_review_id', 'created_at', 'completed_at',
    ])
    || !exactUuid(command.id)
    || command.kind !== 'magic_edit_prepare'
    || !inSet(COMMAND_STATUSES, command.status)
    || (command.safe_code !== null
      && (typeof command.safe_code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(command.safe_code)))
    || command.parent_revision_hash !== review.parent_revision_hash
    || command.parent_artifact_hash !== review.parent_artifact_hash
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || (command.result_review_id !== null && !exactUuid(command.result_review_id))
    || command.result_review_id === review.id
    || !validTimestamp(command.created_at)
    || !validOptionalTimestamp(command.completed_at)) return false

  const hasChild = command.result_review_id !== null
  if (hasChild) {
    return (command.status === 'succeeded' || command.status === 'attention')
      && review.status === 'superseded'
  }
  if (command.status === 'succeeded') return false
  if (command.status === 'queued' || command.status === 'leased') return review.status === 'pending'
  return true
}

function recoveryStateIsWellFormed(
  value: unknown,
  reviewId: unknown,
  decisionCommand: VideoStudioDecisionCommand | null,
  parentRevisionHash?: unknown,
  parentArtifactHash?: unknown,
): value is VideoStudioRecoveryState {
  const recovery = recordValue(value)
  if (!recovery
    || !exactObjectKeys(recovery, [
      'available', 'of_command_id', 'current_generation', 'max_generation', 'recovery_review_id',
      'recovered_review_id', 'binding_command',
    ])
    || typeof recovery.available !== 'boolean'
    || (recovery.of_command_id !== null && !exactUuid(recovery.of_command_id))
    || !Number.isSafeInteger(recovery.current_generation)
    || Number(recovery.current_generation) < 0
    || Number(recovery.current_generation) > 3
    || recovery.max_generation !== 3
    || (Number(recovery.current_generation) === 0) !== (recovery.of_command_id === null)
    || (recovery.recovery_review_id !== null && !exactUuid(recovery.recovery_review_id))
    || recovery.recovery_review_id === reviewId
    || recovery.recovery_review_id === decisionCommand?.id
    || (recovery.recovered_review_id !== null && !exactUuid(recovery.recovered_review_id))
    || recovery.recovered_review_id === reviewId) return false

  const binding = recovery.binding_command === null ? null : recordValue(recovery.binding_command)
  if (recovery.binding_command !== null && !binding) return false
  if (binding !== null && (
    !exactObjectKeys(binding, [
      'id', 'kind', 'status', 'safe_code', 'parent_revision_hash', 'parent_artifact_hash',
      'source_review_id', 'result_review_id', 'created_at', 'completed_at',
    ])
    || !exactUuid(binding.id)
    || binding.id === reviewId
    || binding.id === decisionCommand?.id
    || binding.kind !== 'review_recovery_record'
    || !inSet(COMMAND_STATUSES, binding.status)
    || (binding.safe_code !== null
      && (typeof binding.safe_code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(binding.safe_code)))
    || binding.parent_revision_hash !== parentRevisionHash
    || binding.parent_artifact_hash !== parentArtifactHash
    || !exactHash(binding.parent_revision_hash)
    || !exactHash(binding.parent_artifact_hash)
    || binding.source_review_id !== reviewId
    || !exactUuid(binding.source_review_id)
    || (binding.result_review_id !== null && !exactUuid(binding.result_review_id))
    || binding.result_review_id === binding.id
    || recovery.recovery_review_id === null
    || binding.id === recovery.recovery_review_id
    || (binding.status === 'succeeded'
      ? recovery.recovered_review_id !== recovery.recovery_review_id
        || binding.result_review_id !== recovery.recovery_review_id
      : binding.result_review_id !== null || recovery.recovered_review_id !== null)
    || !validTimestamp(binding.created_at)
    || !validOptionalTimestamp(binding.completed_at)
  )) return false

  if (!binding && (recovery.recovery_review_id !== null || recovery.recovered_review_id !== null)) return false

  if (!decisionCommand && recovery.available) return false
  if (binding && recovery.available) return false
  if (recovery.available && (
    (decisionCommand?.status !== 'failed'
      && !(decisionCommand?.status === 'attention'
        && (decisionCommand.safe_code === 'attempts_exhausted'
          || decisionCommand.safe_code === 'command_expired')))
    || recovery.recovery_review_id !== null
    || recovery.recovered_review_id !== null
    || Number(recovery.current_generation) >= recovery.max_generation
  )) return false
  return true
}

export function videoStudioReviewIsWellFormed(value: unknown): value is VideoStudioReview {
  const row = recordValue(value)
  if (!row
    || !exactObjectKeys(row, REVIEW_DETAIL_KEYS)
    || !videoStudioListFieldsAreWellFormed(row)) return false
  if (!inSet(EDITORIAL_STATES, row.editorial_state) || !inSet(RUNNER_STATES, row.runner_state)) return false
  const payload = recordValue(row.review_payload)
  if (!payload) return false
  const requiredPayloadKeys = [
    'direction', 'change_title', 'change_summary', 'range_label', 'changes',
    'blocking_gates', 'target', 'semantic_target_map_hash',
  ]
  const allowedPayloadKeys = payload.editorial_note === undefined
    ? requiredPayloadKeys
    : [...requiredPayloadKeys, 'editorial_note']
  if (!exactObjectKeys(payload, allowedPayloadKeys)
    || !boundedText(payload.direction, 600)
    || !boundedText(payload.change_title, 200)
    || !boundedText(payload.change_summary, 600)
    || !boundedText(payload.range_label, 120)
    || (payload.editorial_note !== undefined && !boundedText(payload.editorial_note, 600))
    || !Array.isArray(payload.changes)
    || payload.changes.length > 4
    || payload.changes.some(change => !boundedText(change, 240))) return false
  const gates = recordValue(payload?.blocking_gates)
  if (!gates || !videoStudioTargetIsWellFormed(payload?.target) || !exactHash(payload?.semantic_target_map_hash)) return false
  const keys = Object.keys(gates)
  if (keys.some(key => !BLOCKING_GATES.includes(key as typeof BLOCKING_GATES[number]))) return false
  if (!BLOCKING_GATES.every(key => {
    const gate = recordValue(gates[key])
    if (!gate || !inSet(BLOCKING_GATE_STATUSES, gate.status)) return false
    const allowedKeys = gate.detail === undefined ? ['status'] : ['status', 'detail']
    return exactObjectKeys(gate, allowedKeys)
      && (gate.detail === undefined || boundedText(gate.detail, 240))
  })) return false

  const prepareCommand = row.prepare_command === null
    ? null
    : prepareCommandIsWellFormed(row.prepare_command, row)
      ? row.prepare_command
      : undefined
  if (prepareCommand === undefined) return false

  const decisionCommand = row.decision_command === null
    ? null
    : decisionCommandIsWellFormed(row.decision_command, row)
      ? row.decision_command
      : undefined
  if (decisionCommand === undefined
    || (row.status === 'pending' && decisionCommand !== null)
    || ((row.status === 'approved' || row.status === 'rejected') && decisionCommand === null)
    || !recoveryStateIsWellFormed(
      row.recovery,
      row.id,
      decisionCommand,
      row.parent_revision_hash,
      row.parent_artifact_hash,
    )) return false

  const preview = recordValue(row.preview)
  const comparison = recordValue(row.comparison)
  if (!preview
    || !exactObjectKeys(preview, ['state', 'url', 'expires_at'])
    || preview.state !== row.preview_state
    || !proxyIsWellFormed({ url: preview.url, expires_at: preview.expires_at }, row.id as string, 'after')
    || !comparison
    || !exactObjectKeys(comparison, ['state', 'before', 'after', 'alignment', 'start_ms', 'end_ms'])
    || comparison.state !== row.preview_state
    || !proxyIsWellFormed(comparison.before, row.id as string, 'before')
    || !proxyIsWellFormed(comparison.after, row.id as string, 'after')) return false

  const before = comparison.before as VideoStudioProxy
  const after = comparison.after as VideoStudioProxy
  if (after.url !== preview.url || after.expires_at !== preview.expires_at) return false
  if (row.preview_state === 'available') {
    if (typeof preview.url !== 'string') return false
  } else if (preview.url !== null || before.url !== null || after.url !== null) {
    return false
  }

  if (comparison.alignment === 'exact') {
    return row.preview_state === 'available'
      && typeof before.url === 'string'
      && typeof after.url === 'string'
      && validTargetTime(comparison.start_ms, 0)
      && validTargetTime(comparison.end_ms, 1)
      && comparison.end_ms > comparison.start_ms
  }
  return comparison.alignment === 'unavailable'
    && comparison.start_ms === null
    && comparison.end_ms === null
}

export function videoStudioActiveJobIsWellFormed(value: unknown): value is VideoStudioActiveJob {
  const job = recordValue(value)
  return Boolean(job
    && exactObjectKeys(job, [
      'job_id', 'platform', 'active_revision_hash', 'active_artifact_hash',
      'active_candidate_hash', 'parent_revision_hash', 'parent_artifact_hash', 'updated_at',
    ])
    && exactIdentifier(job.job_id)
    && inSet(PLATFORMS, job.platform)
    && exactHash(job.active_revision_hash)
    && exactHash(job.active_artifact_hash)
    && (job.active_candidate_hash === null || exactHash(job.active_candidate_hash))
    && ((job.parent_revision_hash === null && job.parent_artifact_hash === null)
      || (exactHash(job.parent_revision_hash) && exactHash(job.parent_artifact_hash)))
    && validTimestamp(job.updated_at))
}

export type VideoStudioTarget =
  | { kind: 'moment'; start_ms: number }
  | { kind: 'range'; start_ms: number; end_ms: number }
  | { kind: 'caption_block' | 'overlay' | 'speaker' | 'beat'; ref: string }

export interface MagicEditCommandInput {
  idempotency_key: string
  submitted_at: string
  source_review_id: string
  platform: VideoStudioPlatform
  parent_revision_hash: string
  parent_artifact_hash: string
  instruction: string
  target: VideoStudioTarget
  semantic_target_map_hash: string
}

export interface VideoStudioDecisionInput {
  idempotency_key: string
  submitted_at: string
  job_id: string
  platform: VideoStudioPlatform
  expected_command_kind: 'magic_edit_activate' | 'review_decision_record'
  revision_hash: string
  parent_revision_hash: string
  parent_artifact_hash: string
  artifact_hash: string
  decision: 'use_candidate' | 'keep_current'
  learning_confirmation?: {
    action: 'confirm' | 'correct' | 'observe_only'
    correction?: string
  }
}

export interface VideoStudioRecoveryInput {
  idempotency_key: string
  submitted_at: string
  /** Client-only identity binding; deliberately omitted from the wire body. */
  source_review_id: string
  job_id: string
  platform: VideoStudioPlatform
  /** Client-only expected generation; omitted from the wire body. */
  recovery_generation: 1 | 2 | 3
  parent_revision_hash: string
  parent_artifact_hash: string
}

interface ApiErrorBody {
  ok?: false
  error?: {
    code?: string
    message?: string
    current_parent_artifact_hash?: string
    current_revision_hash?: string
  }
}

export class VideoStudioApiError extends Error {
  readonly code: string
  readonly status: number
  readonly currentParentArtifactHash?: string
  readonly currentRevisionHash?: string

  constructor(status: number, body?: ApiErrorBody) {
    const detail = body?.error
    super(detail?.message || detail?.code || `video_studio_http_${status}`)
    this.name = 'VideoStudioApiError'
    this.code = detail?.code || `http_${status}`
    this.status = status
    this.currentParentArtifactHash = detail?.current_parent_artifact_hash
    this.currentRevisionHash = detail?.current_revision_hash
  }
}

type SessionResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  csrf_token: string
  expires_at: string
}

type ReviewListResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  reviews: VideoStudioReviewListItem[]
  warnings?: Array<{ code: 'malformed_review_projection'; count: number }>
  server_time: string
}

type ReviewResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  review: VideoStudioReview
}

type ActiveJobResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  job: VideoStudioActiveJob
  server_time: string
}

type CommandResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  duplicate: boolean
  result_action: 'edit_queued' | 'return_to_parent_queued'
  command: {
    id: string
    job_id: string
    platform: VideoStudioPlatform
    kind: 'magic_edit_prepare' | 'magic_edit_return_to_parent'
    status: typeof COMMAND_STATUSES[number]
    parent_revision_hash: string
    parent_artifact_hash: string
    source_review_id: string | null
    created_at: string
  }
}

export interface VideoStudioCommandReadback {
  id: string
  job_id: string
  platform: VideoStudioPlatform
  kind: 'magic_edit_prepare' | 'magic_edit_return_to_parent' | 'magic_edit_activate' | 'review_decision_record' | 'review_recovery_record'
  status: typeof COMMAND_STATUSES[number]
  parent_revision_hash: string
  parent_artifact_hash: string
  source_review_id: string | null
  result_review_id: string | null
  safe_code: string | null
  created_at: string
  completed_at: string | null
  recovery: VideoStudioRecoveryState
}

type DecisionResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  duplicate: boolean
  result_action: 'use_candidate' | 'keep_current'
  review: {
    id: string
    job_id: string
    platform: VideoStudioPlatform
    status: 'approved' | 'rejected'
    parent_revision_hash: string
    parent_artifact_hash: string
    revision_hash: string
    artifact_hash: string
    decided_at: string
  }
  command: {
    id: string
    job_id: string
    platform: VideoStudioPlatform
    kind: 'magic_edit_activate' | 'review_decision_record'
    status: typeof COMMAND_STATUSES[number]
    parent_revision_hash: string
    parent_artifact_hash: string
    created_at: string
  }
}

export type VideoStudioRecoveryResponse = {
  ok: true
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  duplicate: boolean
  result_action: 'recovery_binding_requested'
  source_command_id: string
  source_review_id: string
  recovery_review_id: string
  recovery_generation: 1 | 2 | 3
  command: {
    id: string
    job_id: string
    platform: VideoStudioPlatform
    kind: 'review_recovery_record'
    status: VideoStudioCommandStatus
    parent_revision_hash: string
    parent_artifact_hash: string
    source_review_id: string
    result_review_id: string | null
    created_at: string
  }
}

let session: SessionResponse | null = null
let sessionPromise: Promise<SessionResponse> | null = null

function assertSchema(body: { schema_version?: number }): void {
  if (body.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION) {
    throw new VideoStudioApiError(422, {
      error: { code: 'unsupported_schema', message: 'This Video Engine response needs a newer Control Center.' },
    })
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const parsed = await response.json().catch(() => null) as unknown
  const body = recordValue(parsed)
  if (!body) {
    throw new VideoStudioApiError(response.ok ? 502 : response.status, {
      error: { code: 'malformed_response', message: 'The Video Engine returned an invalid response.' },
    })
  }
  if (!response.ok || body.ok === false) throw new VideoStudioApiError(response.status, body as ApiErrorBody)
  assertSchema(body)
  return parsed as T
}

async function getSession(force = false): Promise<SessionResponse> {
  if (!force && session && Date.parse(session.expires_at) > Date.now() + 30_000) return session
  if (!force && sessionPromise) return sessionPromise
  sessionPromise = fetch('/api/video-studio/session', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).then(readJson<SessionResponse>).then(value => {
    const envelope = recordValue(value)
    if (!envelope
      || !exactObjectKeys(envelope, ['ok', 'schema_version', 'csrf_token', 'expires_at'])
      || envelope.ok !== true
      || envelope.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
      || !boundedText(envelope.csrf_token, 512)
      || !validTimestamp(envelope.expires_at)) {
      throw new VideoStudioApiError(502, { error: { code: 'malformed_response', message: 'The secure Video Engine session was incomplete.' } })
    }
    session = value
    return value
  }).finally(() => { sessionPromise = null })
  return sessionPromise
}

async function mutate<T>(path: string, body: unknown): Promise<T> {
  const current = await getSession()
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Video-Studio-CSRF': current.csrf_token,
    },
    body: JSON.stringify(body),
  })
  if (response.status === 401 || response.status === 403) session = null
  return readJson<T>(response)
}

export async function listVideoStudioReviews(signal?: AbortSignal): Promise<VideoStudioReviewListItem[]> {
  const response = await fetch('/api/video-studio/reviews?status=actionable&limit=20', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  })
  const body = await readJson<ReviewListResponse>(response)
  const envelope = recordValue(body)
  const envelopeKeys = envelope?.warnings === undefined
    ? ['ok', 'schema_version', 'reviews', 'server_time']
    : ['ok', 'schema_version', 'reviews', 'warnings', 'server_time']
  const warnings = envelope?.warnings
  if (!envelope
    || !exactObjectKeys(envelope, envelopeKeys)
    || envelope.ok !== true
    || envelope.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || !Array.isArray(envelope.reviews)
    || envelope.reviews.some(item => !recordValue(item))
    || (warnings !== undefined && (
      !Array.isArray(warnings)
      || warnings.length !== 1
      || warnings.some(value => {
        const warning = recordValue(value)
        return !warning
          || !exactObjectKeys(warning, ['code', 'count'])
          || warning.code !== 'malformed_review_projection'
          || !Number.isSafeInteger(warning.count)
          || Number(warning.count) < 1
          || Number(warning.count) > 50
      })
    ))
    || !validTimestamp(envelope.server_time)) {
    throw new VideoStudioApiError(502, { error: { code: 'malformed_response', message: 'The Video Engine review queue was incomplete.' } })
  }
  return body.reviews
}

export async function getVideoStudioReview(id: string, signal?: AbortSignal): Promise<VideoStudioReview> {
  const response = await fetch(`/api/video-studio/reviews/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  })
  const body = await readJson<ReviewResponse>(response)
  const envelope = recordValue(body)
  if (!envelope
    || !exactObjectKeys(envelope, ['ok', 'schema_version', 'review'])
    || envelope.ok !== true
    || envelope.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || !videoStudioReviewIsWellFormed(envelope.review)
    || envelope.review.id !== id) {
    throw new VideoStudioApiError(502, { error: { code: 'malformed_response', message: 'The Video Engine review was incomplete.' } })
  }
  return envelope.review
}

export async function getVideoStudioActiveJob(
  jobId: string,
  platform: VideoStudioPlatform,
  signal?: AbortSignal,
): Promise<VideoStudioActiveJob> {
  const response = await fetch(
    `/api/video-studio/jobs/${encodeURIComponent(jobId)}/active?platform=${encodeURIComponent(platform)}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    },
  )
  const body = await readJson<ActiveJobResponse>(response)
  const envelope = recordValue(body)
  if (!envelope
    || !exactObjectKeys(envelope, ['ok', 'schema_version', 'job', 'server_time'])
    || envelope.ok !== true
    || envelope.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || !validTimestamp(envelope.server_time)
    || !videoStudioActiveJobIsWellFormed(envelope.job)
    || envelope.job.job_id !== jobId
    || envelope.job.platform !== platform) {
    throw new VideoStudioApiError(502, { error: { code: 'malformed_response', message: 'The active Video Engine version was incomplete.' } })
  }
  return envelope.job
}

function malformedMutationResponse(message: string): never {
  throw new VideoStudioApiError(502, { error: { code: 'malformed_response', message } })
}

function boundCommandResponse(
  value: unknown,
  expected: {
    jobId: string
    platform: VideoStudioPlatform
    kind: CommandResponse['command']['kind']
    resultAction: CommandResponse['result_action']
    parentRevisionHash: string
    parentArtifactHash: string
    sourceReviewId: string | null
  },
): CommandResponse {
  const response = recordValue(value)
  const command = recordValue(response?.command)
  if (!response
    || !exactObjectKeys(response, ['ok', 'schema_version', 'duplicate', 'result_action', 'command'])
    || response.ok !== true
    || response.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || typeof response.duplicate !== 'boolean'
    || response.result_action !== expected.resultAction
    || !command
    || !exactObjectKeys(command, [
      'id', 'job_id', 'platform', 'kind', 'status', 'parent_revision_hash',
      'parent_artifact_hash', 'source_review_id', 'created_at',
    ])
    || !exactUuid(command.id)
    || command.job_id !== expected.jobId
    || command.platform !== expected.platform
    || command.kind !== expected.kind
    || !inSet(COMMAND_STATUSES, command.status)
    || command.parent_revision_hash !== expected.parentRevisionHash
    || command.parent_artifact_hash !== expected.parentArtifactHash
    || command.source_review_id !== expected.sourceReviewId
    || (command.source_review_id !== null && !exactUuid(command.source_review_id))
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || !validTimestamp(command.created_at)) {
    return malformedMutationResponse('The runner response did not match the exact requested video version.')
  }
  return value as CommandResponse
}

function boundDecisionResponse(
  value: unknown,
  reviewId: string,
  input: VideoStudioDecisionInput,
): DecisionResponse {
  const response = recordValue(value)
  const review = recordValue(response?.review)
  const command = recordValue(response?.command)
  const expectedStatus = input.decision === 'use_candidate' ? 'approved' : 'rejected'
  if (!response
    || !exactObjectKeys(response, ['ok', 'schema_version', 'duplicate', 'result_action', 'review', 'command'])
    || response.ok !== true
    || response.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || typeof response.duplicate !== 'boolean'
    || response.result_action !== input.decision
    || !review
    || !exactObjectKeys(review, [
      'id', 'job_id', 'platform', 'status', 'parent_revision_hash',
      'parent_artifact_hash', 'revision_hash', 'artifact_hash', 'decided_at',
    ])
    || !exactUuid(review.id)
    || review.id !== reviewId
    || review.job_id !== input.job_id
    || review.platform !== input.platform
    || review.status !== expectedStatus
    || review.parent_revision_hash !== input.parent_revision_hash
    || review.parent_artifact_hash !== input.parent_artifact_hash
    || review.revision_hash !== input.revision_hash
    || review.artifact_hash !== input.artifact_hash
    || !exactHash(review.parent_revision_hash)
    || !exactHash(review.parent_artifact_hash)
    || !exactHash(review.revision_hash)
    || !exactHash(review.artifact_hash)
    || !validTimestamp(review.decided_at)
    || !command
    || !exactObjectKeys(command, [
      'id', 'job_id', 'platform', 'kind', 'status', 'parent_revision_hash',
      'parent_artifact_hash', 'created_at',
    ])
    || !exactUuid(command.id)
    || command.job_id !== input.job_id
    || command.platform !== input.platform
    || command.kind !== input.expected_command_kind
    || !inSet(COMMAND_STATUSES, command.status)
    || command.parent_revision_hash !== input.parent_revision_hash
    || command.parent_artifact_hash !== input.parent_artifact_hash
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || !validTimestamp(command.created_at)) {
    return malformedMutationResponse('The review receipt did not match the exact candidate and job that were decided.')
  }
  return value as DecisionResponse
}

export async function directVideoStudioEdit(jobId: string, input: MagicEditCommandInput): Promise<CommandResponse> {
  const value = await mutate<unknown>(`/api/video-studio/jobs/${encodeURIComponent(jobId)}/commands`, {
    schema_version: VIDEO_STUDIO_SCHEMA_VERSION,
    idempotency_key: input.idempotency_key,
    submitted_at: input.submitted_at,
    source_review_id: input.source_review_id,
    platform: input.platform,
    parent_revision_hash: input.parent_revision_hash,
    parent_artifact_hash: input.parent_artifact_hash,
    kind: 'magic_edit_prepare',
    intent: {
      instruction: input.instruction,
      target: input.target,
      semantic_target_map_hash: input.semantic_target_map_hash,
    },
  })
  return boundCommandResponse(value, {
    jobId,
    platform: input.platform,
    kind: 'magic_edit_prepare',
    resultAction: 'edit_queued',
    parentRevisionHash: input.parent_revision_hash,
    parentArtifactHash: input.parent_artifact_hash,
    sourceReviewId: input.source_review_id,
  })
}

export async function returnVideoStudioToParent(jobId: string, input: {
  idempotency_key: string
  submitted_at: string
  platform: VideoStudioPlatform
  parent_revision_hash: string
  parent_artifact_hash: string
  target_parent_revision_hash: string
  target_parent_artifact_hash: string
}): Promise<CommandResponse> {
  const value = await mutate<unknown>(`/api/video-studio/jobs/${encodeURIComponent(jobId)}/commands`, {
    schema_version: VIDEO_STUDIO_SCHEMA_VERSION,
    idempotency_key: input.idempotency_key,
    submitted_at: input.submitted_at,
    platform: input.platform,
    parent_revision_hash: input.parent_revision_hash,
    parent_artifact_hash: input.parent_artifact_hash,
    kind: 'magic_edit_return_to_parent',
    intent: {
      target_parent_revision_hash: input.target_parent_revision_hash,
      target_parent_artifact_hash: input.target_parent_artifact_hash,
    },
  })
  return boundCommandResponse(value, {
    jobId,
    platform: input.platform,
    kind: 'magic_edit_return_to_parent',
    resultAction: 'return_to_parent_queued',
    parentRevisionHash: input.parent_revision_hash,
    parentArtifactHash: input.parent_artifact_hash,
    sourceReviewId: null,
  })
}

export async function getVideoStudioCommand(
  commandId: string,
  jobId: string,
  platform: VideoStudioPlatform,
  sourceReviewId: string,
  parentRevisionHash: string,
  parentArtifactHash: string,
  signal?: AbortSignal,
): Promise<VideoStudioCommandReadback> {
  const query = new URLSearchParams({ job_id: jobId, platform })
  const response = await fetch(
    `/api/video-studio/commands/${encodeURIComponent(commandId)}?${query.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    },
  )
  const body = await readJson<unknown>(response)
  const envelope = recordValue(body)
  const command = recordValue(envelope?.command)
  if (!envelope
    || !exactObjectKeys(envelope, ['ok', 'schema_version', 'command', 'server_time'])
    || envelope.ok !== true
    || envelope.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || !validTimestamp(envelope.server_time)
    || !command
    || !exactObjectKeys(command, [
      'id', 'job_id', 'platform', 'kind', 'status', 'parent_revision_hash',
      'parent_artifact_hash', 'source_review_id', 'result_review_id', 'safe_code',
      'created_at', 'completed_at', 'recovery',
    ])
    || command.id !== commandId
    || !exactUuid(command.id)
    || command.job_id !== jobId
    || command.platform !== platform
    || command.kind !== 'magic_edit_prepare'
    || !inSet(COMMAND_STATUSES, command.status)
    || command.parent_revision_hash !== parentRevisionHash
    || command.parent_artifact_hash !== parentArtifactHash
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || command.source_review_id !== sourceReviewId
    || !exactUuid(command.source_review_id)
    || (command.result_review_id !== null && !exactUuid(command.result_review_id))
    || (command.safe_code !== null
      && (typeof command.safe_code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(command.safe_code)))
    || !validTimestamp(command.created_at)
    || !validOptionalTimestamp(command.completed_at)
    || !recoveryStateIsWellFormed(command.recovery, sourceReviewId, null)
    || (command.recovery as VideoStudioRecoveryState).available !== false
    || (command.recovery as VideoStudioRecoveryState).of_command_id !== null
    || (command.recovery as VideoStudioRecoveryState).current_generation !== 0
    || (command.recovery as VideoStudioRecoveryState).recovery_review_id !== null
    || (command.recovery as VideoStudioRecoveryState).recovered_review_id !== null
    || (command.status === 'succeeded' && command.result_review_id === null)
    || (['queued', 'leased', 'failed', 'cancelled'].includes(String(command.status))
      && command.result_review_id !== null)) {
    return malformedMutationResponse('The edit status did not match the exact queued command and source review.')
  }
  return command as unknown as VideoStudioCommandReadback
}

export async function getVideoStudioRecoveryCommand(
  commandId: string,
  jobId: string,
  platform: VideoStudioPlatform,
  sourceReviewId: string,
  parentRevisionHash: string,
  parentArtifactHash: string,
  expectedRecoveryReviewId: string,
  signal?: AbortSignal,
): Promise<VideoStudioCommandReadback> {
  const query = new URLSearchParams({ job_id: jobId, platform })
  const response = await fetch(
    `/api/video-studio/commands/${encodeURIComponent(commandId)}?${query.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    },
  )
  const body = await readJson<unknown>(response)
  const envelope = recordValue(body)
  const command = recordValue(envelope?.command)
  const resultReviewId = command?.result_review_id
  if (!envelope
    || !exactObjectKeys(envelope, ['ok', 'schema_version', 'command', 'server_time'])
    || envelope.ok !== true
    || envelope.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || !validTimestamp(envelope.server_time)
    || !command
    || !exactObjectKeys(command, [
      'id', 'job_id', 'platform', 'kind', 'status', 'parent_revision_hash',
      'parent_artifact_hash', 'source_review_id', 'result_review_id', 'safe_code',
      'created_at', 'completed_at', 'recovery',
    ])
    || command.id !== commandId
    || !exactUuid(command.id)
    || command.job_id !== jobId
    || command.platform !== platform
    || command.kind !== 'review_recovery_record'
    || !inSet(COMMAND_STATUSES, command.status)
    || command.parent_revision_hash !== parentRevisionHash
    || command.parent_artifact_hash !== parentArtifactHash
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || command.source_review_id !== sourceReviewId
    || !exactUuid(command.source_review_id)
    || !exactUuid(expectedRecoveryReviewId)
    || expectedRecoveryReviewId === sourceReviewId
    || expectedRecoveryReviewId === commandId
    || (resultReviewId !== null && !exactUuid(resultReviewId))
    || resultReviewId === sourceReviewId
    || (resultReviewId !== null && resultReviewId !== expectedRecoveryReviewId)
    || (command.safe_code !== null
      && (typeof command.safe_code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(command.safe_code)))
    || !validTimestamp(command.created_at)
    || !validOptionalTimestamp(command.completed_at)
    || !recoveryStateIsWellFormed(command.recovery, sourceReviewId, null)
    || (command.recovery as VideoStudioRecoveryState).available !== false
    || (command.recovery as VideoStudioRecoveryState).of_command_id !== null
    || (command.recovery as VideoStudioRecoveryState).current_generation !== 0
    || (command.recovery as VideoStudioRecoveryState).recovery_review_id !== null
    || (command.recovery as VideoStudioRecoveryState).recovered_review_id !== null
    || (command.recovery as VideoStudioRecoveryState).binding_command !== null
    || (command.status === 'succeeded'
      ? resultReviewId === null
      : resultReviewId !== null)) {
    return malformedMutationResponse('The recovery binding status did not match the exact source review and parent version.')
  }
  return command as unknown as VideoStudioCommandReadback
}

export async function decideVideoStudioReview(id: string, input: VideoStudioDecisionInput): Promise<DecisionResponse> {
  const value = await mutate<unknown>(`/api/video-studio/reviews/${encodeURIComponent(id)}/decision`, {
    schema_version: VIDEO_STUDIO_SCHEMA_VERSION,
    idempotency_key: input.idempotency_key,
    submitted_at: input.submitted_at,
    parent_revision_hash: input.parent_revision_hash,
    parent_artifact_hash: input.parent_artifact_hash,
    revision_hash: input.revision_hash,
    artifact_hash: input.artifact_hash,
    decision: input.decision,
    ...(input.learning_confirmation ? { learning_confirmation: input.learning_confirmation } : {}),
  })
  return boundDecisionResponse(value, id, input)
}

export async function recoverVideoStudioDecisionCommand(
  commandId: string,
  input: VideoStudioRecoveryInput,
): Promise<VideoStudioRecoveryResponse> {
  const value = await mutate<unknown>(`/api/video-studio/commands/${encodeURIComponent(commandId)}/recover`, {
    schema_version: VIDEO_STUDIO_SCHEMA_VERSION,
    idempotency_key: input.idempotency_key,
    submitted_at: input.submitted_at,
    job_id: input.job_id,
    platform: input.platform,
    parent_revision_hash: input.parent_revision_hash,
    parent_artifact_hash: input.parent_artifact_hash,
  })
  const response = recordValue(value)
  const command = recordValue(response?.command)
  if (!response
    || !exactObjectKeys(response, [
      'ok', 'schema_version', 'duplicate', 'result_action', 'source_command_id',
      'source_review_id', 'recovery_review_id', 'recovery_generation', 'command',
    ])
    || response.ok !== true
    || response.schema_version !== VIDEO_STUDIO_SCHEMA_VERSION
    || typeof response.duplicate !== 'boolean'
    || response.result_action !== 'recovery_binding_requested'
    || response.source_command_id !== commandId
    || !exactUuid(response.source_command_id)
    || response.source_review_id !== input.source_review_id
    || !exactUuid(response.source_review_id)
    || !exactUuid(response.recovery_review_id)
    || response.recovery_review_id === input.source_review_id
    || response.recovery_review_id === response.source_command_id
    || response.recovery_generation !== input.recovery_generation
    || !command
    || !exactObjectKeys(command, [
      'id', 'job_id', 'platform', 'kind', 'status', 'parent_revision_hash',
      'parent_artifact_hash', 'source_review_id', 'result_review_id', 'created_at',
    ])
    || !exactUuid(command.id)
    || command.id === response.source_command_id
    || command.id === response.source_review_id
    || command.id === response.recovery_review_id
    || command.job_id !== input.job_id
    || command.platform !== input.platform
    || command.kind !== 'review_recovery_record'
    || !inSet(COMMAND_STATUSES, command.status)
    || command.parent_revision_hash !== input.parent_revision_hash
    || command.parent_artifact_hash !== input.parent_artifact_hash
    || !exactHash(command.parent_revision_hash)
    || !exactHash(command.parent_artifact_hash)
    || command.source_review_id !== input.source_review_id
    || !exactUuid(command.source_review_id)
    || (command.status === 'succeeded'
      ? command.result_review_id !== response.recovery_review_id
      : command.result_review_id !== null)
    || !validTimestamp(command.created_at)) {
    return malformedMutationResponse('The recovery receipt did not match the exact failed decision command and parent version.')
  }
  return value as VideoStudioRecoveryResponse
}

export function videoStudioIdempotencyKey(): string {
  if (typeof crypto === 'undefined') throw new Error('secure_random_unavailable')
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function videoStudioSubmittedAt(): string {
  return new Date().toISOString()
}

let videoStudioReturnFocus: HTMLElement | null = null

/** Capture the queue trigger before App makes the background inert. */
export function rememberVideoStudioReturnFocus(element: Element | null): void {
  videoStudioReturnFocus = element instanceof HTMLElement ? element : null
}

/** The reviewer consumes the captured trigger once and owns restoration. */
export function takeVideoStudioReturnFocus(): HTMLElement | null {
  const element = videoStudioReturnFocus
  videoStudioReturnFocus = null
  return element
}

export const VIDEO_SERIES_LABEL: Record<VideoStudioSeries, string> = {
  money_of_ai: 'The Money of AI',
  built_with_ai: 'Built With AI',
}

export const VIDEO_GATE_LABEL: Record<VideoStudioGate, string> = {
  story: 'Story',
  treatment: 'Visual treatment',
  final: 'Final',
  learning: 'Learning',
}

/** Proxy URLs are deliberately same-origin and opaque. Never accept a bucket,
 * local path or third-party URL from presentation metadata. */
export function safeVideoProxyUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const base = typeof window === 'undefined' ? 'https://control-center.invalid' : window.location.origin
    const parsed = new URL(value, base)
    if (parsed.origin !== base || !parsed.pathname.startsWith('/api/video-studio/')) return null
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}
