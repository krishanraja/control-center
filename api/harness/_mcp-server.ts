import { createHash } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v4'
import {
  HARNESS_EVENT_CONFIDENCES,
  HARNESS_EVENT_KINDS,
  HARNESS_EVENT_OUTCOMES,
  HARNESS_EVENT_SEVERITIES,
  parseHarnessEvent,
  type HarnessEvent,
} from './_event.js'
import type { HarnessEmitter } from './_emitter-auth.js'
import { persistHarnessEvent, type EventStoreReply } from './_store.js'

export type HarnessMcpStore = {
  countToday(emitterId: string, since: string): Promise<{ count: number | null; errorCode: string | null }>
  insert(event: HarnessEvent, emitterId: string): Promise<EventStoreReply>
  findByEventId(eventId: string): Promise<EventStoreReply>
}

type ServerOptions = {
  emitter: HarnessEmitter
  store: HarnessMcpStore
  now?: () => Date
}

const clientEventId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{15,95}$/)
const kind = z.enum(HARNESS_EVENT_KINDS)
const outcome = z.enum(HARNESS_EVENT_OUTCOMES)
const severity = z.enum(HARNESS_EVENT_SEVERITIES)
const confidence = z.enum(HARNESS_EVENT_CONFIDENCES)

function mcpEventId(emitterId: string, suppliedId: string): string {
  const digest = createHash('sha256').update(`${emitterId}\0${suppliedId}`, 'utf8').digest('hex').slice(0, 40)
  return `mcp:${digest}`
}

function startOfUtcDay(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString()
}

export function createHarnessMcpServer({ emitter, store, now = () => new Date() }: ServerOptions): McpServer {
  const server = new McpServer({ name: 'mindmake-harness-observer', version: '1.0.0' })

  server.registerTool('record_harness_observation', {
    title: 'Record harness observation',
    description: [
      'Record one small, redacted learning signal after an explicit correction, material failure,',
      'missed or false skill trigger, repeated manual step, contradiction, or genuinely reusable',
      'successful pattern. Never include prompts, transcripts, credentials, personal data, email',
      'addresses, machine names, absolute paths, or routine success. This stores evidence only and',
      'cannot change any skill, rule, contract, registry, or canonical memory.',
    ].join(' '),
    inputSchema: {
      client_event_id: clientEventId.describe('Stable retry key for this one observation, not a machine or user identifier.'),
      occurred_at: z.string().min(20).max(35).describe('ISO 8601 time when the observation occurred. Keep unchanged on retry.'),
      kind,
      summary: z.string().min(12).max(800).describe('Self-contained redacted observation.'),
      evidence_ref: z.string().min(3).max(300).describe('Privacy-safe reference such as a commit, issue, test, or session-local opaque ID.'),
      related_skill_or_rule: z.string().min(1).max(160).nullable().default(null),
      outcome,
      severity,
      confidence,
    },
  }, async (input) => {
    const observedAt = now()
    const parsed = parseHarnessEvent({
      event_id: mcpEventId(emitter.emitter_id, input.client_event_id),
      schema_version: 1,
      occurred_at: input.occurred_at,
      surface: emitter.surface,
      kind: input.kind,
      summary: input.summary,
      evidence_ref: input.evidence_ref,
      related_skill_or_rule: input.related_skill_or_rule,
      outcome: input.outcome,
      severity: input.severity,
      confidence: input.confidence,
    })
    if ('error' in parsed) {
      return { isError: true, content: [{ type: 'text', text: `Observation was not stored: ${parsed.error}.` }] }
    }

    const usage = await store.countToday(emitter.emitter_id, startOfUtcDay(observedAt))
    if (usage.errorCode || usage.count == null) {
      return { isError: true, content: [{ type: 'text', text: 'Observation was not stored because the rate-limit readback failed.' }] }
    }
    if (usage.count >= emitter.daily_limit) {
      const existing = await store.findByEventId(parsed.event.event_id)
      if (!existing.errorCode && existing.data?.payload_sha256 === parsed.event.payload_sha256) {
        return {
          content: [{ type: 'text', text: `Observation already recorded as inbox ${existing.data.inbox_id}.` }],
          structuredContent: {
            ok: true,
            duplicate: true,
            inbox_id: existing.data.inbox_id,
            event_id: existing.data.event_id,
          },
        }
      }
      return { isError: true, content: [{ type: 'text', text: 'Observation was not stored because this emitter reached its daily safety limit.' }] }
    }

    const result = await persistHarnessEvent({
      insert: (event) => store.insert(event, emitter.emitter_id),
      findByEventId: (eventId) => store.findByEventId(eventId),
    }, parsed.event)
    if (result.logCode) console.error('[harness/mcp] persistence failed', { code: result.logCode })
    if (result.status >= 400) {
      return { isError: true, content: [{ type: 'text', text: `Observation was not stored: ${String(result.body.error || 'write_failed')}.` }] }
    }
    const receipt = result.body.receipt as { inbox_id: number; event_id: string }
    return {
      content: [{
        type: 'text',
        text: result.body.duplicate === true
          ? `Observation already recorded as inbox ${receipt.inbox_id}.`
          : `Observation recorded as inbox ${receipt.inbox_id}.`,
      }],
      structuredContent: {
        ok: true,
        duplicate: result.body.duplicate === true,
        inbox_id: receipt.inbox_id,
        event_id: receipt.event_id,
      },
    }
  })

  return server
}
