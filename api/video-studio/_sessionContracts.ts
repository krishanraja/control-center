import {
  SHA256_RE,
  UUID_RE,
  isSha256,
  safeRedactedText,
} from './_contracts.js'

export const STUDIO_CLIENTS = [
  'control_center', 'codex_desktop', 'codex_cli', 'codex_cloud',
  'claude_desktop', 'claude_code', 'claude_ai', 'chatgpt', 'other_mcp',
] as const

export type StudioClient = typeof STUDIO_CLIENTS[number]

export const STUDIO_MCP_CAPABILITIES = [
  'session_read', 'job_read', 'review_read', 'feedback_write', 'learning_read',
] as const

export const STUDIO_ACTIONS = [
  'session_opened', 'session_closed', 'job_linked', 'job_created_from_drive',
  'artifact_viewed', 'direction_submitted', 'review_approved', 'review_rejected',
  'revision_requested', 'feedback_praised', 'feedback_recorded',
  'feedback_confirmed', 'feedback_corrected', 'learning_approved', 'learning_rejected',
] as const

export type StudioAction = typeof STUDIO_ACTIONS[number]

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: UnknownRecord, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => value[key] !== undefined)
    && Object.keys(value).every((key) => allowed.has(key))
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === 'string' && values.includes(value as T[number]) ? value as T[number] : null
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(value) ? value : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
}

function isoDate(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && /Z$/.test(value) ? value : null
}

export interface OpenStudioSessionInput {
  client: StudioClient
  repository_revision: string
  idempotency_key: string
}

export function parseOpenStudioSessionInput(value: unknown): OpenStudioSessionInput | null {
  if (!isRecord(value) || !exactKeys(value, ['client', 'repository_revision', 'idempotency_key'])) return null
  const client = enumValue(value.client, STUDIO_CLIENTS)
  const idempotencyKey = uuid(value.idempotency_key)
  if (!client || !idempotencyKey || typeof value.repository_revision !== 'string' || !/^[a-f0-9]{40}$/.test(value.repository_revision)) return null
  return { client, repository_revision: value.repository_revision, idempotency_key: idempotencyKey }
}

export interface SessionReferenceInput {
  session_id: string
}

export function parseSessionReferenceInput(value: unknown): SessionReferenceInput | null {
  if (!isRecord(value) || !exactKeys(value, ['session_id'])) return null
  const sessionId = uuid(value.session_id)
  return sessionId ? { session_id: sessionId } : null
}

export interface CloseStudioSessionInput extends SessionReferenceInput {
  idempotency_key: string
}

export function parseCloseStudioSessionInput(value: unknown): CloseStudioSessionInput | null {
  if (!isRecord(value) || !exactKeys(value, ['session_id', 'idempotency_key'])) return null
  const sessionId = uuid(value.session_id)
  const idempotencyKey = uuid(value.idempotency_key)
  return sessionId && idempotencyKey ? { session_id: sessionId, idempotency_key: idempotencyKey } : null
}

export interface StudioDifference {
  feature: string
  summary: string
}

export interface StudioInference {
  rationale: string
  confidence: number
  scope: { level: 'global' | 'series' | 'mode' | 'treatment' | 'platform' | 'job'; key: string }
}

export interface RecordStudioFeedbackInput extends SessionReferenceInput {
  idempotency_key: string
  client: StudioClient
  action: 'feedback_praised' | 'feedback_recorded' | 'feedback_confirmed' | 'feedback_corrected' | 'review_rejected' | 'revision_requested'
  job_id?: string
  artifact?: { artifact_id: string; before_hash?: string; after_hash?: string }
  explicit_feedback_excerpt?: string
  detected_differences: StudioDifference[]
  inference?: StudioInference
  confirmation_state: 'pending' | 'confirmed' | 'corrected' | 'observation_only'
  occurred_at: string
}

export function parseRecordStudioFeedbackInput(value: unknown): RecordStudioFeedbackInput | null {
  if (!isRecord(value) || !exactKeys(value, [
    'session_id', 'idempotency_key', 'client', 'action', 'detected_differences',
    'confirmation_state', 'occurred_at',
  ], ['job_id', 'artifact', 'explicit_feedback_excerpt', 'inference'])) return null
  const sessionId = uuid(value.session_id)
  const idempotencyKey = uuid(value.idempotency_key)
  const client = enumValue(value.client, STUDIO_CLIENTS)
  const action = enumValue(value.action, ['feedback_praised', 'feedback_recorded', 'feedback_confirmed', 'feedback_corrected', 'review_rejected', 'revision_requested'] as const)
  const confirmationState = enumValue(value.confirmation_state, ['pending', 'confirmed', 'corrected', 'observation_only'] as const)
  const occurredAt = isoDate(value.occurred_at)
  if (!sessionId || !idempotencyKey || !client || !action || !confirmationState || !occurredAt) return null

  const jobId = value.job_id === undefined ? undefined : identifier(value.job_id)
  if (value.job_id !== undefined && !jobId) return null

  let artifact: RecordStudioFeedbackInput['artifact']
  if (value.artifact !== undefined) {
    if (!isRecord(value.artifact) || !exactKeys(value.artifact, ['artifact_id'], ['before_hash', 'after_hash'])) return null
    const artifactId = safeRedactedText(value.artifact.artifact_id, 160, 1)
    if (!artifactId) return null
    if (value.artifact.before_hash !== undefined && !isSha256(value.artifact.before_hash)) return null
    if (value.artifact.after_hash !== undefined && !isSha256(value.artifact.after_hash)) return null
    if (value.artifact.after_hash !== undefined && value.artifact.before_hash === undefined) return null
    artifact = {
      artifact_id: artifactId,
      ...(typeof value.artifact.before_hash === 'string' ? { before_hash: value.artifact.before_hash } : {}),
      ...(typeof value.artifact.after_hash === 'string' ? { after_hash: value.artifact.after_hash } : {}),
    }
  }

  const excerpt = value.explicit_feedback_excerpt === undefined ? undefined : safeRedactedText(value.explicit_feedback_excerpt, 1_600, 1)
  if (value.explicit_feedback_excerpt !== undefined && !excerpt) return null

  if (!Array.isArray(value.detected_differences) || value.detected_differences.length > 32) return null
  const differences: StudioDifference[] = []
  for (const difference of value.detected_differences) {
    if (!isRecord(difference) || !exactKeys(difference, ['feature', 'summary'])) return null
    const feature = safeRedactedText(difference.feature, 160, 1)
    const summary = safeRedactedText(difference.summary, 600, 1)
    if (!feature || !summary || !/^[a-z0-9_.-]+$/i.test(feature)) return null
    differences.push({ feature, summary })
  }

  let inference: StudioInference | undefined
  if (value.inference !== undefined) {
    if (!isRecord(value.inference) || !exactKeys(value.inference, ['rationale', 'confidence', 'scope'])) return null
    if (!isRecord(value.inference.scope) || !exactKeys(value.inference.scope, ['level', 'key'])) return null
    const rationale = safeRedactedText(value.inference.rationale, 1_600, 1)
    const level = enumValue(value.inference.scope.level, ['global', 'series', 'mode', 'treatment', 'platform', 'job'] as const)
    const key = identifier(value.inference.scope.key)
    const confidence = Number(value.inference.confidence)
    if (!rationale || !level || !key || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null
    inference = { rationale, confidence, scope: { level, key } }
  }

  if (confirmationState === 'pending' && !inference) return null
  if (['confirmed', 'corrected'].includes(confirmationState) && (!inference || !excerpt)) return null

  return {
    session_id: sessionId,
    idempotency_key: idempotencyKey,
    client,
    action,
    ...(jobId ? { job_id: jobId } : {}),
    ...(artifact ? { artifact } : {}),
    ...(excerpt ? { explicit_feedback_excerpt: excerpt } : {}),
    detected_differences: differences,
    ...(inference ? { inference } : {}),
    confirmation_state: confirmationState,
    occurred_at: occurredAt,
  }
}

export function validRequestHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value)
}
