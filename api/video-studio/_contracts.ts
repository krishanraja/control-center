import type { VercelResponse } from '@vercel/node'

export const VIDEO_STUDIO_CONTROL_SCHEMA_VERSION = 1 as const
export const SHA256_RE = /^[a-f0-9]{64}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const SERIES = ['money_of_ai', 'built_with_ai'] as const
export const MODES = ['extract', 'solo', 'short_native'] as const
export const VIDEO_PLATFORMS = ['youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels'] as const
export const REVIEW_GATES = ['story', 'treatment', 'final', 'learning'] as const
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested', 'superseded'] as const
export const EDITORIAL_STATES = [
  'ingesting',
  'needs_story_review',
  'needs_visual_review',
  'needs_final_review',
  'needs_learning_confirmation',
  'approved',
  'blocked',
] as const
export const RUNNER_STATES = ['offline', 'idle', 'queued', 'working', 'attention'] as const
export const ROUTE_STATES = ['standard', 'requires_editorial_route'] as const
export const PREVIEW_STATES = ['processing', 'available', 'unavailable', 'expired'] as const
export const TARGET_KINDS = ['moment', 'range', 'caption_block', 'overlay', 'speaker', 'beat'] as const
export const HARD_GATE_KEYS = ['truth', 'rights', 'confidentiality', 'transcript_fidelity', 'naming'] as const
export const HARD_GATE_STATUSES = ['passed', 'blocked', 'pending'] as const

type UnknownRecord = Record<string, unknown>

export interface CommandTargetV1 {
  kind: typeof TARGET_KINDS[number]
  ref?: string
  start_ms?: number
  end_ms?: number
}

export type MagicEditSelectionV1 =
  | { kind: 'moment'; at_ms: number }
  | { kind: 'range'; start_ms: number; end_ms: number }
  | { kind: 'target'; target_ids: string[] }

export interface PrepareMagicEditBodyV1 {
  schema_version: 1
  idempotency_key: string
  source_review_id: string
  platform: typeof VIDEO_PLATFORMS[number]
  submitted_at: string
  parent_revision_hash: string
  parent_artifact_hash: string
  kind: 'magic_edit_prepare'
  intent: {
    instruction: string
    target: CommandTargetV1
    semantic_target_map_hash: string
  }
}

export interface ReturnToParentBodyV1 {
  schema_version: 1
  idempotency_key: string
  platform: typeof VIDEO_PLATFORMS[number]
  submitted_at: string
  parent_revision_hash: string
  parent_artifact_hash: string
  kind: 'magic_edit_return_to_parent'
  intent: {
    target_parent_revision_hash: string
    target_parent_artifact_hash: string
  }
}

export type BrowserCommandBodyV1 = PrepareMagicEditBodyV1 | ReturnToParentBodyV1

export interface ReviewDecisionBodyV1 {
  schema_version: 1
  idempotency_key: string
  submitted_at: string
  parent_revision_hash: string
  parent_artifact_hash: string
  revision_hash: string
  artifact_hash: string
  decision: 'use_candidate' | 'keep_current'
  feedback?: string
  override_reason?: string
  learning_confirmation?: {
    action: 'confirm' | 'correct' | 'observe_only'
    correction?: string
  }
}

export interface RecoverFailedCommandBodyV1 {
  schema_version: 1
  idempotency_key: string
  submitted_at: string
  job_id: string
  platform: typeof VIDEO_PLATFORMS[number]
  parent_revision_hash: string
  parent_artifact_hash: string
}

export interface HardGateResultV1 {
  status: typeof HARD_GATE_STATUSES[number]
  detail?: string
}

export type HardGateSetV1 = Record<typeof HARD_GATE_KEYS[number], HardGateResultV1>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function oneOf<T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === 'string' && choices.includes(value as T[number])
}

function boundedString(value: unknown, max: number, min = 0): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\u0000/g, '').trim()
  if (normalized.length < min || normalized.length > max) return null
  return normalized
}

const UNSAFE_REDACTED_TEXT = [
  /(?:[a-z]:\\|\\\\[^\s\\]+\\)/i,
  /\bfile:\/\/\S+/i,
  /(?:^|[\s"'(])\/(?:users|home|var|tmp|private|volumes)\/\S+/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|service[_-]?role[_-]?key)\s*[:=]\s*["']?\S{12,}/i,
  /\bauthorization\s*[:=]\s*(?:bearer\s+)?["']?\S{12,}/i,
  /\b(?:sb_secret_|sk_(?:live|test)_|gh[pousr]_)[a-z0-9_-]{12,}/i,
  /\beyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]

/** Allows ordinary editorial prose while rejecting likely paths and credential material. */
export function safeRedactedText(value: unknown, max: number, min = 0): string | null {
  const text = boundedString(value, max, min)
  if (!text || UNSAFE_REDACTED_TEXT.some((pattern) => pattern.test(text))) return null
  return text
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : null
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value)
}

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value) ? value : null
}

function exactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function parseMagicEditSelection(value: unknown): MagicEditSelectionV1 | null {
  if (!isRecord(value)) return null
  if (value.kind === 'moment') {
    if (!exactKeys(value, ['kind', 'at_ms'])) return null
    const at = boundedInteger(value.at_ms, 0, 86_400_000)
    return at === null ? null : { kind: 'moment', at_ms: at }
  }
  if (value.kind === 'range') {
    if (!exactKeys(value, ['kind', 'start_ms', 'end_ms'])) return null
    const start = boundedInteger(value.start_ms, 0, 86_400_000)
    const end = boundedInteger(value.end_ms, 1, 86_400_000)
    return start === null || end === null || end <= start
      ? null
      : { kind: 'range', start_ms: start, end_ms: end }
  }
  if (value.kind === 'target') {
    if (!exactKeys(value, ['kind', 'target_ids'])) return null
    if (!Array.isArray(value.target_ids) || value.target_ids.length < 1 || value.target_ids.length > 8) return null
    const targetIds = value.target_ids.map(identifier)
    if (targetIds.some((item) => !item) || new Set(targetIds).size !== targetIds.length) return null
    return { kind: 'target', target_ids: targetIds as string[] }
  }
  return null
}

function parseCommandTarget(value: unknown): CommandTargetV1 | null {
  if (!isRecord(value) || !oneOf(value.kind, TARGET_KINDS)) return null
  if (value.kind === 'moment' && !exactKeys(value, ['kind', 'start_ms'])) return null
  if (value.kind === 'range' && !exactKeys(value, ['kind', 'start_ms', 'end_ms'])) return null
  if (!['moment', 'range'].includes(value.kind) && !exactKeys(value, ['kind', 'ref'])) return null
  const ref = value.ref === undefined ? undefined : identifier(value.ref)
  if (value.ref !== undefined && !ref) return null
  const start = value.start_ms === undefined ? undefined : boundedInteger(value.start_ms, 0, 86_400_000)
  const end = value.end_ms === undefined ? undefined : boundedInteger(value.end_ms, 1, 86_400_000)
  if (value.start_ms !== undefined && start === null) return null
  if (value.end_ms !== undefined && end === null) return null
  if (start !== undefined && end !== undefined && end <= start) return null
  if (value.kind === 'moment' && start === undefined) return null
  if (value.kind === 'range' && (start === undefined || end === undefined)) return null
  if (!['moment', 'range'].includes(value.kind) && !ref) return null
  return {
    kind: value.kind,
    ...(ref ? { ref } : {}),
    ...(start !== undefined ? { start_ms: start } : {}),
    ...(end !== undefined ? { end_ms: end } : {}),
  }
}

export function commandTargetToSelection(target: CommandTargetV1): MagicEditSelectionV1 {
  if (target.kind === 'moment') return { kind: 'moment', at_ms: target.start_ms as number }
  if (target.kind === 'range') {
    return { kind: 'range', start_ms: target.start_ms as number, end_ms: target.end_ms as number }
  }
  return { kind: 'target', target_ids: [target.ref as string] }
}

function parseSharedCommand(value: UnknownRecord): {
  schema_version: 1
  idempotency_key: string
  platform: typeof VIDEO_PLATFORMS[number]
  submitted_at: string
  parent_revision_hash: string
  parent_artifact_hash: string
} | null {
  if (value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  if (!UUID_RE.test(String(value.idempotency_key || ''))) return null
  if (!oneOf(value.platform, VIDEO_PLATFORMS) || !validIsoDate(value.submitted_at)) return null
  if (!isSha256(value.parent_revision_hash) || !isSha256(value.parent_artifact_hash)) return null
  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    idempotency_key: String(value.idempotency_key).toLowerCase(),
    platform: value.platform,
    submitted_at: value.submitted_at,
    parent_revision_hash: value.parent_revision_hash,
    parent_artifact_hash: value.parent_artifact_hash,
  }
}

export function parseBrowserCommandBody(value: unknown): BrowserCommandBodyV1 | null {
  if (!isRecord(value) || !isRecord(value.intent)) return null
  const sharedOuterKeys = [
    'schema_version', 'idempotency_key', 'platform', 'submitted_at',
    'parent_revision_hash', 'parent_artifact_hash', 'kind', 'intent',
  ]

  if (value.kind === 'magic_edit_prepare') {
    if (!exactKeys(value, [...sharedOuterKeys, 'source_review_id'])) return null
    const shared = parseSharedCommand(value)
    if (!shared || !UUID_RE.test(String(value.source_review_id || ''))) return null
    if (!exactKeys(value.intent, ['instruction', 'target', 'semantic_target_map_hash'])) return null
    const instruction = safeRedactedText(value.intent.instruction, 600, 3)
    const target = parseCommandTarget(value.intent.target)
    const semanticTargetMapHash = value.intent.semantic_target_map_hash
    if (!instruction || !target || !isSha256(semanticTargetMapHash)) return null
    return {
      ...shared,
      source_review_id: String(value.source_review_id).toLowerCase(),
      kind: 'magic_edit_prepare',
      intent: {
        instruction,
        target,
        semantic_target_map_hash: semanticTargetMapHash,
      },
    }
  }

  if (value.kind === 'magic_edit_return_to_parent') {
    if (!exactKeys(value, sharedOuterKeys)) return null
    const shared = parseSharedCommand(value)
    if (!shared) return null
    if (!exactKeys(value.intent, ['target_parent_revision_hash', 'target_parent_artifact_hash'])) return null
    if (!isSha256(value.intent.target_parent_revision_hash) || !isSha256(value.intent.target_parent_artifact_hash)) {
      return null
    }
    return {
      ...shared,
      kind: 'magic_edit_return_to_parent',
      intent: {
        target_parent_revision_hash: value.intent.target_parent_revision_hash,
        target_parent_artifact_hash: value.intent.target_parent_artifact_hash,
      },
    }
  }
  return null
}

export function parseReviewDecisionBody(value: unknown): ReviewDecisionBodyV1 | null {
  if (!isRecord(value) || value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION) return null
  const requiredKeys = [
    'schema_version', 'idempotency_key', 'submitted_at', 'parent_revision_hash',
    'parent_artifact_hash', 'revision_hash', 'artifact_hash', 'decision',
  ]
  const optionalKeys = ['feedback', 'override_reason', 'learning_confirmation']
    .filter((key) => value[key] !== undefined)
  if (!exactKeys(value, [...requiredKeys, ...optionalKeys])) return null
  if (!UUID_RE.test(String(value.idempotency_key || ''))) return null
  if (!validIsoDate(value.submitted_at)) return null
  if (!['use_candidate', 'keep_current'].includes(String(value.decision || ''))) return null
  for (const field of ['parent_revision_hash', 'parent_artifact_hash', 'revision_hash', 'artifact_hash'] as const) {
    if (!isSha256(value[field])) return null
  }

  const feedback = value.feedback === undefined ? undefined : safeRedactedText(value.feedback, 1_600, 1)
  const overrideReason = value.override_reason === undefined ? undefined : safeRedactedText(value.override_reason, 800, 1)
  if (value.feedback !== undefined && feedback === null) return null
  if (value.override_reason !== undefined && overrideReason === null) return null

  let learningConfirmation: ReviewDecisionBodyV1['learning_confirmation']
  if (value.learning_confirmation !== undefined) {
    if (!isRecord(value.learning_confirmation)) return null
    const action = String(value.learning_confirmation.action || '')
    if (!['confirm', 'correct', 'observe_only'].includes(action)) return null
    const confirmationKeys = action === 'correct' ? ['action', 'correction'] : ['action']
    if (!exactKeys(value.learning_confirmation, confirmationKeys)) return null
    const correction = value.learning_confirmation.correction === undefined
      ? undefined
      : safeRedactedText(value.learning_confirmation.correction, 1_600, 1)
    if (value.learning_confirmation.correction !== undefined && !correction) return null
    if (action === 'correct' && !correction) return null
    learningConfirmation = {
      action: action as 'confirm' | 'correct' | 'observe_only',
      ...(correction ? { correction } : {}),
    }
  }
  if (overrideReason !== undefined && value.decision !== 'use_candidate') return null

  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    idempotency_key: String(value.idempotency_key).toLowerCase(),
    submitted_at: value.submitted_at,
    parent_revision_hash: String(value.parent_revision_hash),
    parent_artifact_hash: String(value.parent_artifact_hash),
    revision_hash: String(value.revision_hash),
    artifact_hash: String(value.artifact_hash),
    decision: value.decision as ReviewDecisionBodyV1['decision'],
    ...(feedback !== undefined ? { feedback } : {}),
    ...(overrideReason !== undefined ? { override_reason: overrideReason } : {}),
    ...(learningConfirmation ? { learning_confirmation: learningConfirmation } : {}),
  }
}

export function parseRecoverFailedCommandBody(value: unknown): RecoverFailedCommandBodyV1 | null {
  if (!isRecord(value) || !exactKeys(value, [
    'schema_version', 'idempotency_key', 'submitted_at', 'job_id', 'platform',
    'parent_revision_hash', 'parent_artifact_hash',
  ])) return null
  if (
    value.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION
    || !UUID_RE.test(String(value.idempotency_key || ''))
    || !validIsoDate(value.submitted_at)
    || !identifier(value.job_id)
    || !oneOf(value.platform, VIDEO_PLATFORMS)
    || !isSha256(value.parent_revision_hash)
    || !isSha256(value.parent_artifact_hash)
  ) return null
  return {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    idempotency_key: String(value.idempotency_key).toLowerCase(),
    submitted_at: value.submitted_at,
    job_id: String(value.job_id),
    platform: value.platform,
    parent_revision_hash: value.parent_revision_hash,
    parent_artifact_hash: value.parent_artifact_hash,
  }
}

export function parseHardGates(value: unknown): HardGateSetV1 | null {
  if (!isRecord(value) || !exactKeys(value, HARD_GATE_KEYS)) return null
  const output = {} as HardGateSetV1
  for (const key of HARD_GATE_KEYS) {
    const gate = value[key]
    if (!isRecord(gate) || !oneOf(gate.status, HARD_GATE_STATUSES)) return null
    const allowedKeys = gate.detail === undefined ? ['status'] : ['status', 'detail']
    if (!exactKeys(gate, allowedKeys)) return null
    const detail = gate.detail === undefined ? undefined : safeRedactedText(gate.detail, 240, 1)
    if (gate.detail !== undefined && !detail) return null
    output[key] = { status: gate.status, ...(detail ? { detail } : {}) }
  }
  return output
}

export function hardGatesPassed(gates: HardGateSetV1): boolean {
  return HARD_GATE_KEYS.every((key) => gates[key].status === 'passed')
}

export function parseReviewPayload(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) return null
  const required = [
    'direction', 'change_title', 'change_summary', 'range_label', 'changes',
    'blocking_gates', 'target', 'semantic_target_map_hash',
  ]
  const allowed = value.editorial_note === undefined ? required : [...required, 'editorial_note']
  if (!exactKeys(value, allowed)) return null
  const direction = safeRedactedText(value.direction, 600, 1)
  const title = safeRedactedText(value.change_title, 200, 1)
  const summary = safeRedactedText(value.change_summary, 600, 1)
  const rangeLabel = safeRedactedText(value.range_label, 120, 1)
  const editorialNote = value.editorial_note === undefined
    ? undefined
    : safeRedactedText(value.editorial_note, 600, 1)
  const gates = parseHardGates(value.blocking_gates)
  const target = parseCommandTarget(value.target)
  if (
    !direction || !title || !summary || !rangeLabel || !gates || !target
    || !isSha256(value.semantic_target_map_hash)
    || (value.editorial_note !== undefined && !editorialNote)
    || !Array.isArray(value.changes)
    || value.changes.length > 4
  ) return null
  const changes = value.changes.map((item) => safeRedactedText(item, 240, 1))
  if (changes.some((item) => !item)) return null
  return {
    direction,
    change_title: title,
    change_summary: summary,
    range_label: rangeLabel,
    changes: changes as string[],
    blocking_gates: gates,
    target,
    semantic_target_map_hash: value.semantic_target_map_hash,
    ...(editorialNote ? { editorial_note: editorialNote } : {}),
  }
}

export function sendVideoStudioError(
  res: VercelResponse,
  status: number,
  code: string,
  extras: Record<string, unknown> = {},
): VercelResponse {
  return res.status(status).json({ ok: false, error: { code, ...extras } })
}

export function safeErrorCode(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : ''
  for (const code of [
    'stale_parent',
    'invalid_lineage',
    'idempotency_conflict',
    'review_in_progress',
    'review_not_pending',
    'review_expired',
    'review_binding_pending',
    'hard_gate_blocked',
    'lease_conflict',
    'lease_expired',
    'receipt_conflict',
    'preview_slot_conflict',
    'preview_slot_missing',
    'invalid_preview_refs',
    'invalid_receipt',
    'invalid_editorial_route',
    'projection_conflict',
    'platform_mismatch',
    'source_review_conflict',
    'candidate_missing',
    'invalid_activation_payload',
    'invalid_decision_payload',
    'invalid_command_shape',
    'command_not_found',
    'review_not_found',
    'job_not_found',
    'invalid_recovery_request',
    'invalid_recovery_receipt',
    'invalid_review_binding_transition',
    'recovery_not_available',
    'recovery_exists',
    'recovery_conflict',
    'recovery_limit_reached',
    'recovery_preview_expired',
    'invalid_retention_request',
    'retention_conflict',
  ]) {
    if (raw.includes(code)) return code
  }
  return 'internal_error'
}
