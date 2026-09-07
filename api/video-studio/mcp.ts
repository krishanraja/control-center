import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioMcp, videoStudioMcpIdentity } from '../_videoStudioMcpAuth.js'
import { enforceVideoStudioRateLimit } from './_data.js'
import {
  STUDIO_CLIENTS,
  STUDIO_MCP_CAPABILITIES,
  parseCloseStudioSessionInput,
  parseOpenStudioSessionInput,
  parseRecordStudioFeedbackInput,
  parseSessionReferenceInput,
} from './_sessionContracts.js'
import {
  closeStudioSession,
  getStudioSession,
  listStudioJobs,
  listStudioLearning,
  listStudioReviews,
  openStudioSession,
  recordStudioFeedback,
} from './_sessionData.js'

type JsonRpcId = string | number | null
type JsonObject = Record<string, unknown>

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: JsonObject
}

const SESSION_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id'],
  properties: { session_id: { type: 'string', format: 'uuid' } },
}

const TOOLS = [
  {
    name: 'studio.capabilities',
    title: 'Studio capabilities',
    description: 'Report this gateway release, privacy contract, and the operations available to a tracked Mindmake Studio session.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.session.open',
    title: 'Open tracked Studio session',
    description: 'Open an idempotent, client-neutral session for Krish. Only structured engine actions and explicit feedback excerpts are retained, never the whole chat transcript.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['client', 'repository_revision', 'idempotency_key'],
      properties: {
        client: { type: 'string', enum: STUDIO_CLIENTS },
        repository_revision: { type: 'string', pattern: '^[a-f0-9]{40}$' },
        idempotency_key: { type: 'string', format: 'uuid' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.session.status',
    title: 'Read Studio session',
    description: 'Return the tracking state, client, repository revision, and exact capability set for a Studio session.',
    inputSchema: SESSION_REFERENCE_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.session.close',
    title: 'Close Studio session',
    description: 'Close a tracked session and return a content-addressed receipt of its structured learning evidence.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['session_id', 'idempotency_key'],
      properties: { session_id: { type: 'string', format: 'uuid' }, idempotency_key: { type: 'string', format: 'uuid' } },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.jobs.list',
    title: 'List Studio jobs',
    description: 'List safe Video and Carousel Studio job projections. No media, full transcript, local path, secret, or raw command output is returned.',
    inputSchema: SESSION_REFERENCE_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.reviews.list',
    title: 'List actionable Studio reviews',
    description: 'List safe actionable review projections for a tracked Studio session.',
    inputSchema: SESSION_REFERENCE_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.feedback.record',
    title: 'Record Studio feedback',
    description: 'Record one explicit feedback event with bounded differences, inference, scope, and confirmation state. Never send the surrounding chat transcript.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['session_id', 'idempotency_key', 'client', 'action', 'detected_differences', 'confirmation_state', 'occurred_at'],
      properties: {
        session_id: { type: 'string', format: 'uuid' },
        idempotency_key: { type: 'string', format: 'uuid' },
        client: { type: 'string', enum: STUDIO_CLIENTS },
        action: { type: 'string', enum: ['feedback_praised', 'feedback_recorded', 'feedback_confirmed', 'feedback_corrected', 'review_rejected', 'revision_requested'] },
        job_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{1,95}$' },
        artifact: {
          type: 'object', additionalProperties: false, required: ['artifact_id'],
          properties: {
            artifact_id: { type: 'string', minLength: 1, maxLength: 160 },
            before_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            after_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
        explicit_feedback_excerpt: { type: 'string', minLength: 1, maxLength: 1600 },
        detected_differences: {
          type: 'array', maxItems: 32, items: {
            type: 'object', additionalProperties: false, required: ['feature', 'summary'],
            properties: { feature: { type: 'string', minLength: 1, maxLength: 160 }, summary: { type: 'string', minLength: 1, maxLength: 600 } },
          },
        },
        inference: {
          type: 'object', additionalProperties: false, required: ['rationale', 'confidence', 'scope'],
          properties: {
            rationale: { type: 'string', minLength: 1, maxLength: 1600 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            scope: {
              type: 'object', additionalProperties: false, required: ['level', 'key'],
              properties: { level: { type: 'string', enum: ['global', 'series', 'mode', 'treatment', 'platform', 'job'] }, key: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{1,95}$' } },
            },
          },
        },
        confirmation_state: { type: 'string', enum: ['pending', 'confirmed', 'corrected', 'observation_only'] },
        occurred_at: { type: 'string', format: 'date-time' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'studio.learning.list',
    title: 'List Studio learning proposals',
    description: 'List governed weekly learning proposals and their evidence state. This tool cannot activate a preference or merge code.',
    inputSchema: SESSION_REFERENCE_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const

function parseRequest(body: unknown): JsonRpcRequest | null {
  let value = body
  if (typeof body === 'string') {
    try { value = JSON.parse(body) } catch { return null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as JsonObject
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') return null
  if (request.id !== undefined && request.id !== null && typeof request.id !== 'string' && typeof request.id !== 'number') return null
  if (request.params !== undefined && (!request.params || typeof request.params !== 'object' || Array.isArray(request.params))) return null
  return request as unknown as JsonRpcRequest
}

function rpcResult(id: JsonRpcId, result: unknown): JsonObject {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: JsonObject): JsonObject {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return [
    'idempotency_conflict', 'studio_session_not_found', 'studio_session_not_active',
    'studio_session_client_mismatch', 'studio_session_lookup_failed', 'studio_session_insert_failed',
    'studio_event_lookup_failed', 'studio_event_insert_failed', 'studio_session_touch_failed',
    'studio_session_close_failed', 'studio_session_receipt_failed',
    'studio_jobs_lookup_failed', 'studio_reviews_lookup_failed', 'studio_learning_lookup_failed',
  ].includes(message) ? message : 'studio_gateway_unavailable'
}

function toolResponse(value: unknown, isError = false): JsonObject {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  }
}

async function callTool(name: string, args: unknown): Promise<JsonObject> {
  if (name === 'studio.capabilities') return toolResponse({
    ok: true,
    schema_version: 1,
    privacy_mode: 'structured_events_only',
    actor: { actor_id: 'krish', display_name: 'Krish' },
    capabilities: STUDIO_MCP_CAPABILITIES,
    media_execution: 'windows_runner',
    whole_chat_transcript_storage: false,
  })
  if (name === 'studio.session.open') {
    const input = parseOpenStudioSessionInput(args)
    return input ? toolResponse(await openStudioSession(input)) : toolResponse({ ok: false, error: { code: 'invalid_session_open' } }, true)
  }
  if (name === 'studio.session.status') {
    const input = parseSessionReferenceInput(args)
    return input ? toolResponse(await getStudioSession(input.session_id)) : toolResponse({ ok: false, error: { code: 'invalid_session_reference' } }, true)
  }
  if (name === 'studio.session.close') {
    const input = parseCloseStudioSessionInput(args)
    return input ? toolResponse(await closeStudioSession(input)) : toolResponse({ ok: false, error: { code: 'invalid_session_close' } }, true)
  }
  if (name === 'studio.jobs.list') {
    const input = parseSessionReferenceInput(args)
    return input ? toolResponse(await listStudioJobs(input.session_id)) : toolResponse({ ok: false, error: { code: 'invalid_session_reference' } }, true)
  }
  if (name === 'studio.reviews.list') {
    const input = parseSessionReferenceInput(args)
    return input ? toolResponse(await listStudioReviews(input.session_id)) : toolResponse({ ok: false, error: { code: 'invalid_session_reference' } }, true)
  }
  if (name === 'studio.feedback.record') {
    const input = parseRecordStudioFeedbackInput(args)
    return input ? toolResponse(await recordStudioFeedback(input)) : toolResponse({ ok: false, error: { code: 'invalid_feedback_event' } }, true)
  }
  if (name === 'studio.learning.list') {
    const input = parseSessionReferenceInput(args)
    return input ? toolResponse(await listStudioLearning(input.session_id)) : toolResponse({ ok: false, error: { code: 'invalid_session_reference' } }, true)
  }
  return toolResponse({ ok: false, error: { code: 'tool_not_found' } }, true)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioMcp(req, res)) return
  if (await enforceVideoStudioRateLimit(res, 'mcp:request', videoStudioMcpIdentity(req), 180, 60)) return
  const request = parseRequest(req.body)
  if (!request) return res.status(400).json(rpcError(null, -32600, 'Invalid Request'))
  const id = request.id ?? null

  if (request.method === 'initialize') {
    return res.status(200).json(rpcResult(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'mindmake-studio', version: '1.0.0' },
      instructions: 'Open a tracked session before reading jobs or recording feedback. Never send a whole chat transcript.',
    }))
  }
  if (request.method === 'notifications/initialized') return res.status(202).end()
  if (request.method === 'ping') return res.status(200).json(rpcResult(id, {}))
  if (request.method === 'tools/list') return res.status(200).json(rpcResult(id, { tools: TOOLS }))
  if (request.method === 'tools/call') {
    const params = request.params
    if (!params || typeof params.name !== 'string') return res.status(200).json(rpcError(id, -32602, 'Invalid params'))
    try {
      const result = await callTool(params.name, params.arguments ?? {})
      return res.status(200).json(rpcResult(id, result))
    } catch (error) {
      return res.status(200).json(rpcResult(id, toolResponse({ ok: false, error: { code: safeError(error) } }, true)))
    }
  }
  return res.status(200).json(rpcError(id, -32601, 'Method not found'))
}
