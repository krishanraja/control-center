import { createHash, randomUUID } from 'node:crypto'
import { supabase } from '../_supabase.js'
import { listReviews, reviewListProjection } from './_data.js'
import {
  STUDIO_MCP_CAPABILITIES,
  type CloseStudioSessionInput,
  type OpenStudioSessionInput,
  type RecordStudioFeedbackInput,
} from './_sessionContracts.js'

type RecordValue = Record<string, unknown>

function stableHash(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input as RecordValue).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]))
    return input
  }
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex')
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function publicSession(row: RecordValue): RecordValue {
  return {
    schema_version: 1,
    session_id: row.id,
    client: row.client,
    actor: { actor_id: row.actor_id, display_name: row.display_name },
    capabilities: row.capabilities,
    repository: { name: 'krishanraja/mindmake-video-studio', revision: row.repository_revision },
    linked_job_ids: row.linked_job_ids,
    privacy_mode: row.privacy_mode,
    tracking_state: row.tracking_state,
    opened_at: row.opened_at,
    last_seen_at: row.last_seen_at,
    closed_at: row.closed_at,
  }
}

async function existingEvent(idempotencyKey: string): Promise<RecordValue | null> {
  const result = await supabase.from('mindmake_studio_interaction_events').select('event_id,request_hash,session_id,action,occurred_at').eq('idempotency_key', idempotencyKey).maybeSingle()
  if (result.error) throw new Error('studio_event_lookup_failed')
  return asRecord(result.data)
}

async function recordEvent(input: {
  idempotencyKey: string
  sessionId: string
  client: string
  action: string
  jobId?: string
  artifactId?: string
  beforeHash?: string
  afterHash?: string
  excerpt?: string
  differences?: unknown[]
  inference?: unknown
  confirmationState: string
  toolName: string
  occurredAt: string
  requestHashOverride?: string
}): Promise<{ event_id: string; duplicate: boolean; request_hash: string }> {
  const requestHash = input.requestHashOverride ?? stableHash(input)
  const prior = await existingEvent(input.idempotencyKey)
  if (prior) {
    if (prior.request_hash !== requestHash) throw new Error('idempotency_conflict')
    return { event_id: String(prior.event_id), duplicate: true, request_hash: requestHash }
  }

  const eventId = randomUUID()
  const result = await supabase.from('mindmake_studio_interaction_events').insert({
    event_id: eventId,
    idempotency_key: input.idempotencyKey,
    session_id: input.sessionId,
    client: input.client,
    action: input.action,
    job_id: input.jobId ?? null,
    artifact_id: input.artifactId ?? null,
    before_hash: input.beforeHash ?? null,
    after_hash: input.afterHash ?? null,
    explicit_feedback_excerpt: input.excerpt ?? null,
    detected_differences: input.differences ?? [],
    inference: input.inference ?? null,
    confirmation_state: input.confirmationState,
    tool_name: input.toolName,
    request_hash: requestHash,
    occurred_at: input.occurredAt,
  })
  if (result.error) {
    const raced = await existingEvent(input.idempotencyKey)
    if (raced?.request_hash === requestHash) return { event_id: String(raced.event_id), duplicate: true, request_hash: requestHash }
    throw new Error(raced ? 'idempotency_conflict' : 'studio_event_insert_failed')
  }
  const touch = await supabase.from('mindmake_studio_sessions').update({ last_seen_at: input.occurredAt }).eq('id', input.sessionId).is('closed_at', null)
  if (touch.error) throw new Error('studio_session_touch_failed')
  return { event_id: eventId, duplicate: false, request_hash: requestHash }
}

export async function openStudioSession(input: OpenStudioSessionInput): Promise<RecordValue> {
  const requestHash = stableHash(input)
  const existingResult = await supabase.from('mindmake_studio_sessions').select('*').eq('open_idempotency_key', input.idempotency_key).maybeSingle()
  if (existingResult.error) throw new Error('studio_session_lookup_failed')
  let row = asRecord(existingResult.data)
  let duplicate = Boolean(row)
  if (row && row.open_request_hash !== requestHash) throw new Error('idempotency_conflict')
  if (!row) {
    const now = new Date().toISOString()
    const insert = await supabase.from('mindmake_studio_sessions').insert({
      open_idempotency_key: input.idempotency_key,
      open_request_hash: requestHash,
      client: input.client,
      actor_id: 'krish',
      display_name: 'Krish',
      capabilities: [...STUDIO_MCP_CAPABILITIES],
      repository_revision: input.repository_revision,
      privacy_mode: 'structured_events_only',
      tracking_state: 'tracked',
      linked_job_ids: [],
      opened_at: now,
      last_seen_at: now,
    }).select('*').single()
    if (insert.error || !insert.data) {
      const raced = await supabase.from('mindmake_studio_sessions').select('*').eq('open_idempotency_key', input.idempotency_key).maybeSingle()
      row = asRecord(raced.data)
      duplicate = Boolean(row)
      if (!row || row.open_request_hash !== requestHash) throw new Error('studio_session_insert_failed')
    } else row = asRecord(insert.data)
  }
  if (!row) throw new Error('studio_session_insert_failed')
  await recordEvent({
    idempotencyKey: input.idempotency_key,
    sessionId: String(row.id),
    client: input.client,
    action: 'session_opened',
    confirmationState: 'not_applicable',
    toolName: 'studio.session.open',
    occurredAt: String(row.opened_at),
  })
  return { ok: true, duplicate, session: publicSession(row) }
}

export async function getStudioSession(sessionId: string): Promise<RecordValue> {
  const result = await supabase.from('mindmake_studio_sessions').select('*').eq('id', sessionId).maybeSingle()
  const row = asRecord(result.data)
  if (result.error) throw new Error('studio_session_lookup_failed')
  if (!row) throw new Error('studio_session_not_found')
  return { ok: true, session: publicSession(row) }
}

export async function requireTrackedSession(sessionId: string): Promise<RecordValue> {
  const result = await getStudioSession(sessionId)
  const session = asRecord(result.session)
  if (!session || session.tracking_state !== 'tracked' || session.closed_at) throw new Error('studio_session_not_active')
  return session
}

export async function closeStudioSession(input: CloseStudioSessionInput): Promise<RecordValue> {
  const sessionResult = await getStudioSession(input.session_id)
  const session = asRecord(sessionResult.session)
  if (!session || session.tracking_state !== 'tracked') throw new Error('studio_session_not_active')
  const closeRequestHash = stableHash({
    action: 'session_closed',
    idempotency_key: input.idempotency_key,
    session_id: input.session_id,
  })
  const prior = await existingEvent(input.idempotency_key)
  if (prior) {
    if (prior.session_id !== input.session_id || prior.action !== 'session_closed' || prior.request_hash !== closeRequestHash) throw new Error('idempotency_conflict')
    const closedAt = String(prior.occurred_at)
    await finaliseSessionClose(input.session_id, closedAt)
    return buildSessionReceipt(input.session_id, closedAt, true)
  }
  if (session.closed_at) throw new Error('studio_session_not_active')
  const now = new Date().toISOString()
  const event = await recordEvent({
    idempotencyKey: input.idempotency_key,
    sessionId: input.session_id,
    client: String(session.client),
    action: 'session_closed',
    confirmationState: 'not_applicable',
    toolName: 'studio.session.close',
    occurredAt: now,
    requestHashOverride: closeRequestHash,
  })
  await finaliseSessionClose(input.session_id, now)
  return buildSessionReceipt(input.session_id, now, event.duplicate)
}

async function finaliseSessionClose(sessionId: string, closedAt: string): Promise<void> {
  const close = await supabase.from('mindmake_studio_sessions')
    .update({ last_seen_at: closedAt, closed_at: closedAt })
    .eq('id', sessionId)
    .is('closed_at', null)
  if (close.error) throw new Error('studio_session_close_failed')
  const current = await getStudioSession(sessionId)
  const session = asRecord(current.session)
  if (!session?.closed_at) throw new Error('studio_session_close_failed')
}

async function buildSessionReceipt(sessionId: string, closedAt: string, duplicate: boolean): Promise<RecordValue> {
  const events = await supabase.from('mindmake_studio_interaction_events').select('request_hash,confirmation_state').eq('session_id', sessionId).order('sequence_id', { ascending: true })
  if (events.error) throw new Error('studio_session_receipt_failed')
  const rows = Array.isArray(events.data) ? events.data : []
  return {
    ok: true,
    duplicate,
    receipt: {
      schema_version: 1,
      session_id: sessionId,
      event_count: rows.length,
      learning_observation_count: rows.filter((row) => ['pending', 'confirmed', 'corrected', 'observation_only'].includes(String(row.confirmation_state))).length,
      pending_confirmation_count: rows.filter((row) => row.confirmation_state === 'pending').length,
      event_chain_hash: stableHash(rows.map((row) => row.request_hash)),
      closed_at: closedAt,
    },
  }
}

export async function recordStudioFeedback(input: RecordStudioFeedbackInput): Promise<RecordValue> {
  const session = await requireTrackedSession(input.session_id)
  if (session.client !== input.client) throw new Error('studio_session_client_mismatch')
  const event = await recordEvent({
    idempotencyKey: input.idempotency_key,
    sessionId: input.session_id,
    client: input.client,
    action: input.action,
    jobId: input.job_id,
    artifactId: input.artifact?.artifact_id,
    beforeHash: input.artifact?.before_hash,
    afterHash: input.artifact?.after_hash,
    excerpt: input.explicit_feedback_excerpt,
    differences: input.detected_differences,
    inference: input.inference,
    confirmationState: input.confirmation_state,
    toolName: 'studio.feedback.record',
    occurredAt: input.occurred_at,
  })
  return { ok: true, ...event, confirmation_state: input.confirmation_state }
}

export async function listStudioJobs(sessionId: string): Promise<RecordValue> {
  await requireTrackedSession(sessionId)
  const result = await supabase.from('video_studio_jobs').select('job_id,series,mode,target_platforms,stage,status,safe_title,safe_summary,updated_at').order('updated_at', { ascending: false }).limit(50)
  if (result.error) throw new Error('studio_jobs_lookup_failed')
  return { ok: true, jobs: result.data ?? [] }
}

export async function listStudioReviews(sessionId: string): Promise<RecordValue> {
  await requireTrackedSession(sessionId)
  const result = await listReviews('actionable', 50)
  if (result.error) throw new Error('studio_reviews_lookup_failed')
  const reviews = result.reviews
    .map(({ review, job }) => job ? reviewListProjection(review, job) : null)
    .filter((review): review is RecordValue => review !== null)
  return { ok: true, reviews }
}

export async function listStudioLearning(sessionId: string): Promise<RecordValue> {
  await requireTrackedSession(sessionId)
  const result = await supabase.from('mindmake_studio_learning_proposals').select('id,weekly_batch_id,proposal_class,assertion,scope,evidence_event_ids,independent_session_count,independent_job_count,counterexamples,regression_cases,proposed_change,status,decided_at,decided_by,created_at').order('created_at', { ascending: false }).limit(100)
  if (result.error) throw new Error('studio_learning_lookup_failed')
  return { ok: true, proposals: result.data ?? [] }
}
