import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { authenticateHarnessEmitter, type HarnessEmitter } from '../api/harness/_emitter-auth.js'
import { createHarnessMcpServer, type HarnessMcpStore } from '../api/harness/_mcp-server.js'
import type { HarnessEvent } from '../api/harness/_event.js'

let passed = 0
let failed = 0
function test(name: string, condition: boolean) {
  if (condition) passed += 1
  else failed += 1
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`)
}

const syntheticToken = `hmcp1_${'a'.repeat(40)}`
const emitter: HarnessEmitter = {
  emitter_id: 'fixture-client',
  surface: 'codex',
  machine_scope: 'fixture-machine',
  enabled: true,
  daily_limit: 30,
  revoked_at: null,
}

const lookup = {
  async findByTokenHash(tokenHash: string) {
    const expected = createHash('sha256').update(syntheticToken).digest('hex')
    return { data: tokenHash === expected ? emitter : null, errorCode: null }
  },
}

const missing = await authenticateHarnessEmitter(undefined, lookup)
test('missing bearer fails closed', 'error' in missing && missing.error === 'unauthorized')

const malformed = await authenticateHarnessEmitter('Bearer short', lookup)
test('malformed bearer fails before lookup', 'error' in malformed && malformed.error === 'unauthorized')

const acceptedAuth = await authenticateHarnessEmitter(`Bearer ${syntheticToken}`, lookup)
test('valid bearer resolves its server-owned identity', acceptedAuth.ok && acceptedAuth.emitter.surface === 'codex')

const revokedAuth = await authenticateHarnessEmitter(`Bearer ${syntheticToken}`, {
  async findByTokenHash() { return { data: { ...emitter, enabled: false, revoked_at: '2026-09-12T00:00:00Z' }, errorCode: null } },
})
test('revoked emitter fails closed', 'error' in revokedAuth && revokedAuth.error === 'unauthorized')

const rows = new Map<string, { inbox_id: number; event_id: string; payload_sha256: string }>()
const stored: Array<HarnessEvent & { emitter_id: string }> = []
const store: HarnessMcpStore = {
  async countToday() { return { count: stored.length, errorCode: null } },
  async insert(event, emitterId) {
    const existing = rows.get(event.event_id)
    if (existing) return { data: null, errorCode: '23505' }
    const receipt = { inbox_id: rows.size + 1, event_id: event.event_id, payload_sha256: event.payload_sha256 }
    rows.set(event.event_id, receipt)
    stored.push({ ...event, emitter_id: emitterId })
    return { data: receipt, errorCode: null }
  },
  async findByEventId(eventId) { return { data: rows.get(eventId) || null, errorCode: rows.has(eventId) ? null : 'not_found' } },
}

const server = createHarnessMcpServer({
  emitter,
  store,
  now: () => new Date('2026-09-12T16:00:00.000Z'),
})
const client = new Client({ name: 'harness-mcp-test', version: '1.0.0' })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
await server.connect(serverTransport)
await client.connect(clientTransport)

const listed = await client.listTools()
test('publishes exactly one write-only tool', listed.tools.length === 1 && listed.tools[0].name === 'record_harness_observation')

const args = {
  client_event_id: 'fixture:event:00000001',
  occurred_at: '2026-09-12T16:00:00.000Z',
  kind: 'explicit_correction',
  summary: 'Krish corrected a claimed success because the expected row was absent.',
  evidence_ref: 'session-local:fixture-1',
  related_skill_or_rule: 'krish-build.green-checkmark',
  outcome: 'corrected',
  severity: 'high',
  confidence: 'high',
}
const created = await client.callTool({ name: 'record_harness_observation', arguments: args })
test('stores one valid observation', created.isError !== true && stored.length === 1)
test('server derives the surface and hides emitter identity from the event payload', stored[0].surface === 'codex' && !('machine_scope' in stored[0]))

const duplicate = await client.callTool({ name: 'record_harness_observation', arguments: args })
const duplicateContent = duplicate.structuredContent as { duplicate?: boolean } | undefined
test('retry is idempotent', duplicate.isError !== true && stored.length === 1 && duplicateContent?.duplicate === true)

const conflict = await client.callTool({
  name: 'record_harness_observation',
  arguments: { ...args, summary: 'The same retry key cannot be reused for materially different evidence.' },
})
test('conflicting retry key is rejected', conflict.isError === true && stored.length === 1)

const sensitive = await client.callTool({
  name: 'record_harness_observation',
  arguments: { ...args, client_event_id: 'fixture:event:00000002', evidence_ref: 'C:\\Users\\person\\private.txt' },
})
test('sensitive path is rejected before persistence', sensitive.isError === true && stored.length === 1)

const limitedServer = createHarnessMcpServer({
  emitter: { ...emitter, daily_limit: 1 },
  store: { ...store, async countToday() { return { count: 1, errorCode: null } } },
})
const limitedClient = new Client({ name: 'harness-mcp-limit-test', version: '1.0.0' })
const [limitedClientTransport, limitedServerTransport] = InMemoryTransport.createLinkedPair()
await limitedServer.connect(limitedServerTransport)
await limitedClient.connect(limitedClientTransport)
const limited = await limitedClient.callTool({ name: 'record_harness_observation', arguments: { ...args, client_event_id: 'fixture:event:00000003' } })
test('daily safety limit fails closed', limited.isError === true && stored.length === 1)

const limitedRetry = await limitedClient.callTool({ name: 'record_harness_observation', arguments: args })
const limitedRetryContent = limitedRetry.structuredContent as { duplicate?: boolean } | undefined
test('idempotent retry still succeeds at the daily limit', limitedRetry.isError !== true && limitedRetryContent?.duplicate === true && stored.length === 1)

await client.close()
await server.close()
await limitedClient.close()
await limitedServer.close()

console.log(`\n${failed === 0 ? 'HARNESS MCP CONTRACT OK' : 'HARNESS MCP CONTRACT FAILURES'}: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
