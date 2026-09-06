import { createHash } from 'node:crypto'
import type { VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  EDITORIAL_STATES,
  HARD_GATE_KEYS,
  MODES,
  PREVIEW_STATES,
  REVIEW_GATES,
  REVIEW_STATUSES,
  ROUTE_STATES,
  RUNNER_STATES,
  SERIES,
  VIDEO_PLATFORMS,
  UUID_RE,
  isSha256,
  parseHardGates,
  parseReviewPayload,
  safeRedactedText,
  sendVideoStudioError,
} from './_contracts.js'

type RecordValue = Record<string, unknown>

function databaseRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
}

const REVIEW_SELECT = [
  'id',
  'job_id',
  'source_command_id',
  'preview_source_command_id',
  'recovery_of_command_id',
  'recovery_root_command_id',
  'recovery_generation',
  'binding_state',
  'platform',
  'gate',
  'status',
  'safe_title',
  'safe_summary',
  'parent_revision_hash',
  'parent_artifact_hash',
  'revision_hash',
  'artifact_hash',
  'candidate_hash',
  'projection_hash',
  'semantic_target_map_hash',
  'queues_activation',
  'truth_gate',
  'rights_gate',
  'confidentiality_gate',
  'transcript_fidelity_gate',
  'naming_gate',
  'route_state',
  'safe_payload',
  'before_preview_object_key',
  'after_preview_object_key',
  'preview_expires_at',
  'comparison_alignment',
  'comparison_start_ms',
  'comparison_end_ms',
  'decision',
  'decision_feedback',
  'override_reason',
  'decided_at',
  'created_at',
  'expires_at',
].join(',')

const JOB_SELECT = [
  'job_id',
  'series',
  'mode',
  'target_platforms',
  'stage',
  'status',
  'safe_title',
  'safe_summary',
  'updated_at',
].join(',')

const PLATFORM_STATE_SELECT = [
  'job_id',
  'platform',
  'editorial_state',
  'runner_state',
  'route_state',
  'active_revision_hash',
  'active_artifact_hash',
  'active_candidate_hash',
  'active_parent_revision_hash',
  'active_parent_artifact_hash',
  'active_parent_candidate_hash',
  'semantic_target_map_hash',
  'updated_at',
].join(',')

function strictEnum(value: unknown, values: readonly string[]): string | null {
  return typeof value === 'string' && values.includes(value) ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined
}

function storedHardGates(review: RecordValue) {
  return parseHardGates({
    truth: { status: review.truth_gate },
    rights: { status: review.rights_gate },
    confidentiality: { status: review.confidentiality_gate },
    transcript_fidelity: { status: review.transcript_fidelity_gate },
    naming: { status: review.naming_gate },
  })
}

function nullableInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function validStoredComparison(review: RecordValue): boolean {
  if (review.comparison_alignment === 'unavailable') {
    return review.comparison_start_ms === null
      && review.comparison_end_ms === null
      && review.before_preview_object_key === null
      && review.after_preview_object_key === null
      && review.preview_expires_at === null
      && review.preview_source_command_id === null
  }
  const start = nullableInteger(review.comparison_start_ms)
  const end = nullableInteger(review.comparison_end_ms)
  return review.comparison_alignment === 'exact'
    && start !== null
    && end !== null
    && start <= 86_400_000
    && end <= 86_400_000
    && end > start
    && UUID_RE.test(String(review.preview_source_command_id || ''))
    && validPreviewObjectKey(review, 'before')
    && validPreviewObjectKey(review, 'after')
    && nullableDate(review.preview_expires_at) !== undefined
    && nullableDate(review.preview_expires_at) !== null
}

function previewState(row: RecordValue, now = Date.now()): string | null {
  const expiry = Date.parse(String(row.preview_expires_at || ''))
  if (Number.isFinite(expiry) && expiry <= now) return 'expired'
  if (row.after_preview_object_key && row.before_preview_object_key) return 'available'
  return row.preview_state === undefined
    ? 'unavailable'
    : strictEnum(row.preview_state, PREVIEW_STATES)
}

function comparisonRedirectUrl(reviewId: string, side: 'before' | 'after', available: boolean): string | null {
  return available
    ? `/api/video-studio/reviews/${encodeURIComponent(reviewId)}/comparison/${side}`
    : null
}

function validPreviewObjectKey(review: RecordValue, side: 'before' | 'after'): boolean {
  const commandId = review.preview_source_command_id
  const value = review[side === 'before' ? 'before_preview_object_key' : 'after_preview_object_key']
  if (typeof commandId !== 'string' || typeof value !== 'string') return false
  const match = /^commands\/([0-9a-f-]{36})\/previews\/(before|after)\/([a-f0-9]{64})\.mp4$/.exec(value)
  return Boolean(match)
    && match?.[1]?.toLowerCase() === commandId.toLowerCase()
    && match?.[2] === side
}

export function stablePayloadHash(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as RecordValue)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      )
    }
    return input
  }
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex')
}

export async function enforceVideoStudioRateLimit(
  res: VercelResponse,
  scope: string,
  identityHash: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('video_studio_take_rate_limit', {
    p_scope: scope,
    p_identity_hash: identityHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    sendVideoStudioError(res, 503, 'rate_limit_unavailable')
    return true
  }
  const result = Array.isArray(data) ? data[0] : data
  if (!result || result.allowed !== true) {
    const retryAfter = Math.max(1, Number(result?.retry_after_seconds) || windowSeconds)
    res.setHeader('Retry-After', String(retryAfter))
    sendVideoStudioError(res, 429, 'rate_limited')
    return true
  }
  return false
}

export async function fetchJob(jobId: string, platform: string): Promise<{ data: RecordValue | null; error: unknown }> {
  const jobResult = await supabase
    .from('video_studio_jobs')
    .select(JOB_SELECT)
    .eq('job_id', jobId)
    .maybeSingle()
  const job = databaseRecord(jobResult.data)
  if (jobResult.error || !job) return { data: job, error: jobResult.error }
  const stateResult = await supabase
    .from('video_studio_job_platform_states')
    .select(PLATFORM_STATE_SELECT)
    .eq('job_id', jobId)
    .eq('platform', platform)
    .maybeSingle()
  const state = databaseRecord(stateResult.data)
  if (stateResult.error || !state) return { data: null, error: stateResult.error }
  return { data: { ...job, ...state }, error: null }
}

export async function fetchReview(reviewId: string): Promise<{
  review: RecordValue | null
  job: RecordValue | null
  error: unknown
}> {
  const { data: review, error } = await supabase
    .from('video_studio_review_requests')
    .select(REVIEW_SELECT)
    .eq('id', reviewId)
    .maybeSingle()
  const reviewRecord = databaseRecord(review)
  if (error || !reviewRecord) return { review: null, job: null, error }
  const jobResult = await fetchJob(String(reviewRecord.job_id), String(reviewRecord.platform))
  return { review: reviewRecord, job: jobResult.data, error: jobResult.error }
}

const DECISION_COMMAND_KINDS = ['magic_edit_activate', 'review_decision_record'] as const
const COMMAND_STATUSES = ['queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled'] as const
const SAFE_CODE_RE = /^[a-z][a-z0-9_]{0,79}$/

export function validRecoveryReviewClone(
  sourceReview: RecordValue,
  recoveryReview: RecordValue,
  bindingStatus: string,
  expected: {
    recoveryReviewId: string
    sourceCommandId: string
    rootCommandId: string
    generation: number
  },
): boolean {
  if (!COMMAND_STATUSES.includes(bindingStatus as typeof COMMAND_STATUSES[number])) return false
  const sourcePayload = parseReviewPayload(sourceReview.safe_payload)
  const sourceGates = storedHardGates(sourceReview)
  const sourcePayloadGates = sourcePayload ? parseHardGates(sourcePayload.blocking_gates) : null
  const sourcePreviewExpiry = nullableDate(sourceReview.preview_expires_at)
  const sourceTitle = safeRedactedText(sourceReview.safe_title, 200, 1)
  const sourceSummary = safeRedactedText(sourceReview.safe_summary, 600, 1)
  if (
    !UUID_RE.test(String(sourceReview.id || ''))
    || typeof sourceReview.job_id !== 'string'
    || !strictEnum(sourceReview.platform, VIDEO_PLATFORMS)
    || !strictEnum(sourceReview.gate, REVIEW_GATES)
    || !strictEnum(sourceReview.status, REVIEW_STATUSES)
    || !strictEnum(sourceReview.route_state, ROUTE_STATES)
    || sourceReview.binding_state !== 'ready'
    || !sourceTitle
    || !sourceSummary
    || !isSha256(sourceReview.parent_revision_hash)
    || !isSha256(sourceReview.parent_artifact_hash)
    || !isSha256(sourceReview.revision_hash)
    || !isSha256(sourceReview.artifact_hash)
    || (sourceReview.candidate_hash !== null && !isSha256(sourceReview.candidate_hash))
    || !isSha256(sourceReview.semantic_target_map_hash)
    || !sourcePayload
    || !sourceGates
    || !sourcePayloadGates
    || sourcePayload.semantic_target_map_hash !== sourceReview.semantic_target_map_hash
    || HARD_GATE_KEYS.some((key) => sourcePayloadGates[key].status !== sourceGates[key].status)
    || typeof sourceReview.queues_activation !== 'boolean'
    || (sourceReview.candidate_hash !== null && sourceReview.queues_activation !== true)
    || (sourceReview.queues_activation === true && !UUID_RE.test(String(sourceReview.preview_source_command_id || '')))
    || (sourceReview.queues_activation === true && !validPreviewObjectKey(sourceReview, 'before'))
    || (sourceReview.queues_activation === true && !validPreviewObjectKey(sourceReview, 'after'))
    || nullableDate(sourceReview.created_at) === undefined
    || nullableDate(sourceReview.created_at) === null
    || sourcePreviewExpiry === undefined
    || !validStoredComparison(sourceReview)
  ) return false
  const expectedBindingState = bindingStatus === 'succeeded'
    ? 'ready'
    : ['failed', 'attention'].includes(bindingStatus) ? 'failed' : 'queued'
  const immutableCloneFields = [
    'job_id', 'platform', 'gate', 'route_state', 'safe_title', 'safe_summary',
    'parent_revision_hash', 'parent_artifact_hash', 'revision_hash', 'artifact_hash',
    'candidate_hash', 'semantic_target_map_hash', 'truth_gate', 'rights_gate',
    'confidentiality_gate', 'transcript_fidelity_gate', 'naming_gate',
    'queues_activation', 'before_preview_object_key', 'after_preview_object_key',
    'preview_source_command_id', 'preview_expires_at', 'comparison_alignment',
    'comparison_start_ms', 'comparison_end_ms',
  ] as const
  return recoveryReview.id === expected.recoveryReviewId
    && recoveryReview.source_command_id === null
    && recoveryReview.recovery_of_command_id === expected.sourceCommandId
    && recoveryReview.recovery_root_command_id === expected.rootCommandId
    && Number(recoveryReview.recovery_generation) === expected.generation
    && recoveryReview.binding_state === expectedBindingState
    && recoveryReview.status === 'pending'
    && recoveryReview.projection_hash === null
    && recoveryReview.decision === null
    && recoveryReview.decision_feedback === null
    && recoveryReview.override_reason === null
    && recoveryReview.decided_at === null
    && immutableCloneFields.every((field) => recoveryReview[field] === sourceReview[field])
    && stablePayloadHash(recoveryReview.safe_payload) === stablePayloadHash(sourceReview.safe_payload)
    && nullableDate(recoveryReview.created_at) !== undefined
    && nullableDate(recoveryReview.created_at) !== null
    && nullableDate(recoveryReview.expires_at) !== undefined
    && nullableDate(recoveryReview.expires_at) !== null
}

export async function reviewDecisionCommandContext(
  review: RecordValue,
  job: RecordValue,
): Promise<{
  prepare_command: RecordValue | null
  decision_command: RecordValue | null
  recovery: RecordValue
} | null> {
  const rawGeneration = review.recovery_generation
  const generation = Number.isSafeInteger(rawGeneration) && Number(rawGeneration) >= 0 && Number(rawGeneration) <= 3
    ? Number(rawGeneration)
    : null
  const recoveryOf = review.recovery_of_command_id === null
    ? null
    : UUID_RE.test(String(review.recovery_of_command_id || ''))
      ? String(review.recovery_of_command_id).toLowerCase()
      : undefined
  const recoveryRoot = review.recovery_root_command_id === null
    ? null
    : UUID_RE.test(String(review.recovery_root_command_id || ''))
      ? String(review.recovery_root_command_id).toLowerCase()
      : undefined
  if (
    generation === null
    || recoveryOf === undefined
    || recoveryRoot === undefined
    || (generation === 0) !== (recoveryOf === null && recoveryRoot === null)
  ) return null

  const prepareResult = await supabase
    .from('video_studio_commands')
    .select([
      'id', 'job_id', 'platform', 'review_id', 'command_kind', 'status', 'safe_code',
      'expected_parent_revision_hash', 'expected_parent_artifact_hash', 'created_at', 'completed_at',
    ].join(','))
    .eq('review_id', String(review.id))
    .eq('command_kind', 'magic_edit_prepare')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prepareResult.error) return null
  const rawPrepare = databaseRecord(prepareResult.data)
  let prepareCommand: RecordValue | null = null
  if (rawPrepare) {
    const prepareStatus = strictEnum(rawPrepare.status, COMMAND_STATUSES)
    const prepareCompletedAt = nullableDate(rawPrepare.completed_at)
    const prepareSafeCode = rawPrepare.safe_code === null
      ? null
      : typeof rawPrepare.safe_code === 'string' && SAFE_CODE_RE.test(rawPrepare.safe_code)
        ? rawPrepare.safe_code
        : undefined
    if (
      !UUID_RE.test(String(rawPrepare.id || ''))
      || rawPrepare.job_id !== review.job_id
      || rawPrepare.platform !== review.platform
      || rawPrepare.review_id !== review.id
      || rawPrepare.command_kind !== 'magic_edit_prepare'
      || !prepareStatus
      || prepareSafeCode === undefined
      || !isSha256(rawPrepare.expected_parent_revision_hash)
      || !isSha256(rawPrepare.expected_parent_artifact_hash)
      || rawPrepare.expected_parent_revision_hash !== review.parent_revision_hash
      || rawPrepare.expected_parent_artifact_hash !== review.parent_artifact_hash
      || !nullableDate(rawPrepare.created_at)
      || prepareCompletedAt === undefined
      || (['queued', 'leased'].includes(prepareStatus) && review.status !== 'pending')
    ) return null

    const childResult = await supabase
      .from('video_studio_review_requests')
      .select('id,job_id,platform,source_command_id')
      .eq('source_command_id', String(rawPrepare.id))
      .maybeSingle()
    if (childResult.error) return null
    const child = databaseRecord(childResult.data)
    const childId = child === null
      ? null
      : UUID_RE.test(String(child.id || ''))
        && child.job_id === review.job_id
        && child.platform === review.platform
        && child.source_command_id === rawPrepare.id
        ? String(child.id).toLowerCase()
        : undefined
    if (
      childId === undefined
      || (prepareStatus === 'succeeded' && childId === null)
      || (['queued', 'leased', 'failed', 'cancelled'].includes(prepareStatus) && childId !== null)
      || (childId !== null && review.status !== 'superseded')
    ) return null

    prepareCommand = {
      id: String(rawPrepare.id).toLowerCase(),
      kind: 'magic_edit_prepare',
      status: prepareStatus,
      safe_code: prepareSafeCode,
      parent_revision_hash: rawPrepare.expected_parent_revision_hash,
      parent_artifact_hash: rawPrepare.expected_parent_artifact_hash,
      result_review_id: childId,
      created_at: rawPrepare.created_at,
      completed_at: prepareCompletedAt,
    }
  }

  const commandResult = await supabase
    .from('video_studio_commands')
    .select([
      'id', 'job_id', 'platform', 'review_id', 'command_kind', 'status', 'safe_code',
      'expected_parent_revision_hash', 'expected_parent_artifact_hash', 'created_at', 'completed_at',
    ].join(','))
    .eq('review_id', String(review.id))
    .in('command_kind', [...DECISION_COMMAND_KINDS])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (commandResult.error) return null
  const command = databaseRecord(commandResult.data)
  if (!command) {
    return {
      prepare_command: prepareCommand,
      decision_command: null,
      recovery: {
        available: false,
        of_command_id: recoveryOf,
        current_generation: generation,
        max_generation: 3,
        recovery_review_id: null,
        recovered_review_id: null,
        binding_command: null,
      },
    }
  }

  const kind = strictEnum(command.command_kind, DECISION_COMMAND_KINDS)
  const status = strictEnum(command.status, COMMAND_STATUSES)
  const completedAt = nullableDate(command.completed_at)
  const safeCode = command.safe_code === null
    ? null
    : typeof command.safe_code === 'string' && SAFE_CODE_RE.test(command.safe_code)
      ? command.safe_code
      : undefined
  if (
    !UUID_RE.test(String(command.id || ''))
    || command.job_id !== review.job_id
    || command.platform !== review.platform
    || command.review_id !== review.id
    || !kind
    || !status
    || safeCode === undefined
    || !isSha256(command.expected_parent_revision_hash)
    || !isSha256(command.expected_parent_artifact_hash)
    || command.expected_parent_revision_hash !== review.parent_revision_hash
    || command.expected_parent_artifact_hash !== review.parent_artifact_hash
    || !nullableDate(command.created_at)
    || completedAt === undefined
  ) return null

  const recoveryResult = await supabase
    .from('video_studio_command_recoveries')
    .select([
      'source_command_id', 'source_review_id', 'recovery_review_id', 'binding_command_id',
      'root_command_id', 'recovery_generation', 'job_id', 'platform',
      'expected_parent_revision_hash', 'expected_parent_artifact_hash',
    ].join(','))
    .eq('source_command_id', String(command.id))
    .maybeSingle()
  if (recoveryResult.error) return null
  const existing = databaseRecord(recoveryResult.data)
  let bindingCommand: RecordValue | null = null
  let recoveryReviewId: string | null = null
  let recoveredReviewId: string | null | undefined = null
  if (existing) {
    if (
      !UUID_RE.test(String(existing.recovery_review_id || ''))
      || !UUID_RE.test(String(existing.binding_command_id || ''))
      || !UUID_RE.test(String(existing.root_command_id || ''))
      || existing.source_command_id !== command.id
      || existing.source_review_id !== review.id
      || existing.job_id !== review.job_id
      || existing.platform !== review.platform
      || existing.expected_parent_revision_hash !== review.parent_revision_hash
      || existing.expected_parent_artifact_hash !== review.parent_artifact_hash
      || existing.root_command_id !== (recoveryRoot || command.id)
      || Number(existing.recovery_generation) !== generation + 1
    ) return null
    const bindingResult = await supabase
      .from('video_studio_commands')
      .select([
        'id', 'job_id', 'platform', 'review_id', 'command_kind', 'status', 'safe_code',
        'expected_parent_revision_hash', 'expected_parent_artifact_hash', 'created_at', 'completed_at',
      ].join(','))
      .eq('id', String(existing.binding_command_id))
      .maybeSingle()
    if (bindingResult.error) return null
    const binding = databaseRecord(bindingResult.data)
    if (!binding) return null
    const bindingStatus = strictEnum(binding.status, COMMAND_STATUSES)
    const bindingSafeCode = binding.safe_code === null
      ? null
      : typeof binding.safe_code === 'string' && SAFE_CODE_RE.test(binding.safe_code)
        ? binding.safe_code
        : undefined
    const bindingCompletedAt = nullableDate(binding.completed_at)
    if (
      binding.id !== existing.binding_command_id
      || binding.job_id !== review.job_id
      || binding.platform !== review.platform
      || binding.review_id !== existing.recovery_review_id
      || binding.command_kind !== 'review_recovery_record'
      || !bindingStatus
      || bindingSafeCode === undefined
      || binding.expected_parent_revision_hash !== review.parent_revision_hash
      || binding.expected_parent_artifact_hash !== review.parent_artifact_hash
      || !nullableDate(binding.created_at)
      || bindingCompletedAt === undefined
    ) return null

    const recoveryReviewResult = await supabase
      .from('video_studio_review_requests')
      .select(REVIEW_SELECT)
      .eq('id', String(existing.recovery_review_id))
      .maybeSingle()
    if (recoveryReviewResult.error) return null
    const recoveryReview = databaseRecord(recoveryReviewResult.data)
    if (!recoveryReview || !validRecoveryReviewClone(review, recoveryReview, bindingStatus, {
      recoveryReviewId: String(existing.recovery_review_id),
      sourceCommandId: String(command.id),
      rootCommandId: String(existing.root_command_id),
      generation: Number(existing.recovery_generation),
    })) return null
    recoveryReviewId = String(existing.recovery_review_id).toLowerCase()
    recoveredReviewId = bindingStatus === 'succeeded'
      ? recoveryReviewId
      : null
    bindingCommand = {
      id: String(binding.id).toLowerCase(),
      kind: 'review_recovery_record',
      status: bindingStatus,
      safe_code: bindingSafeCode,
      parent_revision_hash: binding.expected_parent_revision_hash,
      parent_artifact_hash: binding.expected_parent_artifact_hash,
      source_review_id: String(review.id).toLowerCase(),
      result_review_id: recoveredReviewId,
      created_at: binding.created_at,
      completed_at: bindingCompletedAt,
    }
  }
  if (recoveredReviewId === undefined) return null
  const exactLineage = job.active_revision_hash === command.expected_parent_revision_hash
    && job.active_artifact_hash === command.expected_parent_artifact_hash
  const previewExpiry = Date.parse(String(review.preview_expires_at || ''))
  const recoveryMediaReady = review.queues_activation !== true || (
    Number.isFinite(previewExpiry)
    && previewExpiry > Date.now()
    && review.comparison_alignment === 'exact'
    && typeof review.before_preview_object_key === 'string'
    && typeof review.after_preview_object_key === 'string'
  )
  const recoverableTerminal = status === 'failed'
    || (status === 'attention' && (safeCode === 'attempts_exhausted' || safeCode === 'command_expired'))
  const available = recoverableTerminal
    && exactLineage
    && recoveryMediaReady
    && existing === null
    && generation < 3

  return {
    prepare_command: prepareCommand,
    decision_command: {
      id: String(command.id).toLowerCase(),
      kind,
      status,
      safe_code: safeCode,
      parent_revision_hash: command.expected_parent_revision_hash,
      parent_artifact_hash: command.expected_parent_artifact_hash,
      created_at: command.created_at,
      completed_at: completedAt,
    },
    recovery: {
      available,
      of_command_id: recoveryOf,
      current_generation: generation,
      max_generation: 3,
      recovery_review_id: recoveryReviewId,
      recovered_review_id: recoveredReviewId,
      binding_command: bindingCommand,
    },
  }
}

export async function listReviews(status: string, limit: number): Promise<{
  reviews: Array<{ review: RecordValue; job: RecordValue | null }>
  error: unknown
}> {
  const pendingStatus = status === 'actionable' ? 'pending' : status
  const { data, error } = await supabase
    .from('video_studio_review_requests')
    .select(REVIEW_SELECT)
    .eq('status', pendingStatus)
    .eq('binding_state', 'ready')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { reviews: [], error }

  let rows = (data || []).map(databaseRecord).filter((row): row is RecordValue => Boolean(row))
  if (status === 'actionable') {
    const commandsResult = await supabase
      .from('video_studio_commands')
      .select('id,review_id,status,safe_code')
      .in('command_kind', [...DECISION_COMMAND_KINDS])
      .in('status', ['failed', 'attention'])
      .not('review_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(limit * 2)
    if (commandsResult.error) return { reviews: [], error: commandsResult.error }
    const commands = (commandsResult.data || []).map(databaseRecord)
      .filter((row): row is RecordValue => Boolean(row))
      .filter((row) => UUID_RE.test(String(row.id || '')) && UUID_RE.test(String(row.review_id || '')))
      .filter((row) => row.status === 'failed' || (
        row.status === 'attention'
        && (row.safe_code === 'attempts_exhausted' || row.safe_code === 'command_expired')
      ))
    const commandIds = commands.map((command) => String(command.id))
    const recoveriesResult = commandIds.length
      ? await supabase
          .from('video_studio_command_recoveries')
          .select([
            'source_command_id', 'source_review_id', 'recovery_review_id',
            'binding_command_id', 'root_command_id', 'recovery_generation',
          ].join(','))
          .in('source_command_id', commandIds)
      : { data: [], error: null }
    if (recoveriesResult.error) return { reviews: [], error: recoveriesResult.error }
    const recoveries = (recoveriesResult.data || []).map(databaseRecord)
      .filter((row): row is RecordValue => Boolean(row))
      .filter((row) => UUID_RE.test(String(row.source_command_id || ''))
        && UUID_RE.test(String(row.source_review_id || ''))
        && UUID_RE.test(String(row.recovery_review_id || ''))
        && UUID_RE.test(String(row.binding_command_id || ''))
        && UUID_RE.test(String(row.root_command_id || ''))
        && Number.isSafeInteger(row.recovery_generation)
        && Number(row.recovery_generation) >= 1
        && Number(row.recovery_generation) <= 3)
    const bindingCommandIds = recoveries.map((row) => String(row.binding_command_id))
    const bindingResult = bindingCommandIds.length
      ? await supabase
          .from('video_studio_commands')
          .select('id,status')
          .in('id', bindingCommandIds)
      : { data: [], error: null }
    if (bindingResult.error) return { reviews: [], error: bindingResult.error }
    const succeededBindings = new Set((bindingResult.data || [])
      .filter((row) => row.status === 'succeeded')
      .map((row) => String(row.id)))
    const succeededRecoveryReviewIds = recoveries
      .filter((row) => succeededBindings.has(String(row.binding_command_id)))
      .map((row) => String(row.recovery_review_id))
    const readyRecoveryResult = succeededRecoveryReviewIds.length
      ? await supabase
          .from('video_studio_review_requests')
          .select(REVIEW_SELECT)
          .in('id', succeededRecoveryReviewIds)
          .eq('binding_state', 'ready')
      : { data: [], error: null }
    if (readyRecoveryResult.error) return { reviews: [], error: readyRecoveryResult.error }
    const readyRecoveryRows = (readyRecoveryResult.data || []).map(databaseRecord)
      .filter((row): row is RecordValue => Boolean(row))
    const sourceReviewIds = [...new Set(commands.map((command) => String(command.review_id)))]
    const sourceReviewsResult = sourceReviewIds.length
      ? await supabase
          .from('video_studio_review_requests')
          .select(REVIEW_SELECT)
          .in('id', sourceReviewIds)
          .eq('binding_state', 'ready')
      : { data: [], error: null }
    if (sourceReviewsResult.error) return { reviews: [], error: sourceReviewsResult.error }
    const sourceReviewRows = (sourceReviewsResult.data || []).map(databaseRecord)
      .filter((row): row is RecordValue => Boolean(row))
    const sourceReviewsById = new Map(sourceReviewRows.map((row) => [String(row.id), row]))
    const readyRecoveryById = new Map(readyRecoveryRows.map((row) => [String(row.id), row]))
    const readyRecoveryReviewIds = new Set(recoveries.flatMap((recovery) => {
      const sourceReview = sourceReviewsById.get(String(recovery.source_review_id))
      const recoveryReview = readyRecoveryById.get(String(recovery.recovery_review_id))
      return sourceReview && recoveryReview && validRecoveryReviewClone(sourceReview, recoveryReview, 'succeeded', {
        recoveryReviewId: String(recovery.recovery_review_id),
        sourceCommandId: String(recovery.source_command_id),
        rootCommandId: String(recovery.root_command_id),
        generation: Number(recovery.recovery_generation),
      }) ? [String(recovery.recovery_review_id)] : []
    }))
    const recoveredCommandIds = new Set(recoveries
      .filter((row) => succeededBindings.has(String(row.binding_command_id))
        && readyRecoveryReviewIds.has(String(row.recovery_review_id)))
      .map((row) => String(row.source_command_id)))
    const attentionReviewIds = [...new Set(commands
      .filter((command) => !recoveredCommandIds.has(String(command.id)))
      .map((command) => String(command.review_id)))]
    if (attentionReviewIds.length) {
      const attentionIds = new Set(attentionReviewIds)
      rows.push(...sourceReviewRows.filter((row) => attentionIds.has(String(row.id))))
    }
    const byId = new Map(rows.map((row) => [String(row.id), row]))
    for (const row of readyRecoveryRows) {
      if (row.status === 'pending') byId.set(String(row.id), row)
    }
    rows = [...byId.values()]
      .sort((left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)))
      .slice(0, limit)
  }
  const jobIds = [...new Set(rows.map((row) => String(row.job_id)))]
  if (!jobIds.length) return { reviews: [], error: null }
  const jobsResult = await supabase.from('video_studio_jobs').select(JOB_SELECT).in('job_id', jobIds)
  if (jobsResult.error) return { reviews: [], error: jobsResult.error }
  const statesResult = await supabase
    .from('video_studio_job_platform_states')
    .select(PLATFORM_STATE_SELECT)
    .in('job_id', jobIds)
  if (statesResult.error) return { reviews: [], error: statesResult.error }
  const jobRows = (jobsResult.data || []).map(databaseRecord).filter((row): row is RecordValue => Boolean(row))
  const stateRows = (statesResult.data || []).map(databaseRecord).filter((row): row is RecordValue => Boolean(row))
  const jobsById = new Map(jobRows.map((job) => [String(job.job_id), job]))
  const jobs = new Map(stateRows.flatMap((state) => {
    const job = jobsById.get(String(state.job_id))
    return job ? [[`${state.job_id}\u0000${state.platform}`, { ...job, ...state } as RecordValue] as const] : []
  }))
  return {
    reviews: rows
      .map((review) => ({ review, job: jobs.get(`${review.job_id}\u0000${review.platform}`) || null })),
    error: null,
  }
}

export function reviewListProjection(review: RecordValue, job: RecordValue): RecordValue | null {
  const gate = strictEnum(review.gate, REVIEW_GATES)
  const status = strictEnum(review.status, REVIEW_STATUSES)
  const series = strictEnum(job.series, SERIES)
  const mode = strictEnum(job.mode, MODES)
  const platform = strictEnum(review.platform, VIDEO_PLATFORMS)
  const routeState = strictEnum(review.route_state, ROUTE_STATES)
  const preview = previewState(review)
  const expiresAt = nullableDate(review.expires_at)
  const gates = storedHardGates(review)
  const targetPlatforms = Array.isArray(job.target_platforms) ? job.target_platforms : null
  const safeTitle = safeRedactedText(review.safe_title, 200, 1)
  const safeSummary = safeRedactedText(review.safe_summary, 600, 1)
  if (
    typeof review.id !== 'string'
    || typeof review.job_id !== 'string'
    || !safeTitle
    || !safeSummary
    || review.binding_state !== 'ready'
    || !gate
    || !status
    || !series
    || !mode
    || !platform
    || platform !== job.platform
    || !targetPlatforms
    || targetPlatforms.length < 1
    || targetPlatforms.length > VIDEO_PLATFORMS.length
    || new Set(targetPlatforms).size !== targetPlatforms.length
    || targetPlatforms.some((item) => !strictEnum(item, VIDEO_PLATFORMS))
    || !targetPlatforms.includes(platform)
    || !routeState
    || !preview
    || expiresAt === undefined
    || !gates
    || !validStoredComparison(review)
    || !isSha256(review.parent_revision_hash)
    || !isSha256(review.parent_artifact_hash)
    || !isSha256(review.revision_hash)
    || !isSha256(review.artifact_hash)
    || !isSha256(review.semantic_target_map_hash)
    || typeof review.queues_activation !== 'boolean'
    || (review.queues_activation === true && !isSha256(review.candidate_hash))
    || (review.candidate_hash !== null && review.queues_activation !== true)
    || (review.queues_activation === true && review.comparison_alignment !== 'exact')
    || (review.candidate_hash !== null && !isSha256(review.candidate_hash))
    || typeof review.created_at !== 'string'
    || !Number.isFinite(Date.parse(review.created_at))
  ) return null

  return {
    id: review.id,
    job_id: review.job_id,
    gate,
    status,
    series,
    mode,
    platform,
    safe_title: safeTitle,
    safe_summary: safeSummary,
    parent_revision_hash: review.parent_revision_hash,
    parent_artifact_hash: review.parent_artifact_hash,
    revision_hash: review.revision_hash,
    artifact_hash: review.artifact_hash,
    candidate_hash: isSha256(review.candidate_hash) ? review.candidate_hash : null,
    queues_activation: review.queues_activation,
    route_state: routeState,
    preview_state: preview,
    created_at: review.created_at,
    expires_at: expiresAt,
  }
}

export function activeJobProjection(job: RecordValue): RecordValue | null {
  const platform = strictEnum(job.platform, VIDEO_PLATFORMS)
  const parentRevision = job.active_parent_revision_hash === null
    ? null
    : isSha256(job.active_parent_revision_hash) ? job.active_parent_revision_hash : undefined
  const parentArtifact = job.active_parent_artifact_hash === null
    ? null
    : isSha256(job.active_parent_artifact_hash) ? job.active_parent_artifact_hash : undefined
  if (
    typeof job.job_id !== 'string'
    || !platform
    || !isSha256(job.active_revision_hash)
    || !isSha256(job.active_artifact_hash)
    || parentRevision === undefined
    || parentArtifact === undefined
    || (parentRevision === null) !== (parentArtifact === null)
    || (job.active_candidate_hash !== null && !isSha256(job.active_candidate_hash))
    || typeof job.updated_at !== 'string'
    || !Number.isFinite(Date.parse(job.updated_at))
  ) return null
  return {
    job_id: job.job_id,
    platform,
    active_revision_hash: job.active_revision_hash,
    active_artifact_hash: job.active_artifact_hash,
    active_candidate_hash: job.active_candidate_hash,
    parent_revision_hash: parentRevision,
    parent_artifact_hash: parentArtifact,
    updated_at: job.updated_at,
  }
}

export function reviewDetailProjection(review: RecordValue, job: RecordValue): RecordValue | null {
  const list = reviewListProjection(review, job)
  const editorialState = strictEnum(job.editorial_state, EDITORIAL_STATES)
  const runnerState = strictEnum(job.runner_state, RUNNER_STATES)
  const state = previewState(review)
  const reviewPayload = parseReviewPayload(review.safe_payload)
  const gates = storedHardGates(review)
  const payloadGates = reviewPayload ? parseHardGates(reviewPayload.blocking_gates) : null
  if (
    !list || !editorialState || !runnerState || !state || !reviewPayload || !gates || !payloadGates
    || reviewPayload.semantic_target_map_hash !== review.semantic_target_map_hash
    || HARD_GATE_KEYS.some((key) => payloadGates[key].status !== gates[key].status)
  ) return null
  const available = state === 'available'
  const beforeAvailable = available && Boolean(review.before_preview_object_key)
  const afterAvailable = available && Boolean(review.after_preview_object_key)
  const alignment = review.comparison_alignment === 'exact' && beforeAvailable && afterAvailable
    ? 'exact'
    : 'unavailable'
  const expiresAt = nullableDate(review.preview_expires_at)
  if (expiresAt === undefined) return null
  const reviewId = String(review.id)
  const beforeUrl = comparisonRedirectUrl(reviewId, 'before', beforeAvailable)
  const afterUrl = comparisonRedirectUrl(reviewId, 'after', afterAvailable)
  return {
    ...list,
    editorial_state: editorialState,
    runner_state: runnerState,
    review_payload: reviewPayload,
    preview: {
      state,
      url: afterUrl,
      expires_at: expiresAt,
    },
    comparison: {
      state,
      before: { url: beforeUrl, expires_at: beforeUrl ? expiresAt : null },
      after: { url: afterUrl, expires_at: afterUrl ? expiresAt : null },
      alignment,
      start_ms: alignment === 'exact' ? nullableInteger(review.comparison_start_ms) : null,
      end_ms: alignment === 'exact' ? nullableInteger(review.comparison_end_ms) : null,
    },
  }
}

export async function previewObjectForReview(
  reviewId: string,
  side: 'before' | 'after',
): Promise<{
  objectKey: string | null
  expiresAt: string | null
  sourceCommandId: string | null
  error: unknown
}> {
  const column = side === 'before' ? 'before_preview_object_key' : 'after_preview_object_key'
  const { data, error } = await supabase
    .from('video_studio_review_requests')
    .select(`${column},preview_expires_at,status,binding_state,preview_source_command_id`)
    .eq('id', reviewId)
    .maybeSingle()
  if (error || !data) return { objectKey: null, expiresAt: null, sourceCommandId: null, error }
  const expiresAt = nullableDate(data.preview_expires_at)
  if (expiresAt === undefined) {
    return { objectKey: null, expiresAt: null, sourceCommandId: null, error: new Error('malformed_preview_expiry') }
  }
  if (data.binding_state !== 'ready' || !expiresAt || Date.parse(expiresAt) <= Date.now()) {
    return { objectKey: null, expiresAt, sourceCommandId: null, error: null }
  }
  return {
    objectKey: nullableString(data[column]),
    expiresAt,
    sourceCommandId: nullableString(data.preview_source_command_id),
    error: null,
  }
}
