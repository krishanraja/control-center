import type { VercelRequest, VercelResponse } from '@vercel/node'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { supabase } from '../_supabase.js'
import { authenticateHarnessEmitter } from './_emitter-auth.js'
import type { HarnessEvent } from './_event.js'
import { createHarnessMcpServer } from './_mcp-server.js'

function jsonRpcError(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({
    jsonrpc: '2.0',
    error: { code: status === 401 ? -32001 : -32600, message },
    id: null,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', 'Authorization')
  res.setHeader('Allow', 'POST')
  if (req.method !== 'POST') return jsonRpcError(res, 405, 'Method not allowed')

  const auth = await authenticateHarnessEmitter(req.headers.authorization, {
    async findByTokenHash(tokenHash) {
      const { data, error } = await supabase
        .from('harness_emitter_clients')
        .select('emitter_id,surface,machine_scope,enabled,daily_limit,revoked_at')
        .eq('token_sha256', tokenHash)
        .maybeSingle()
      return { data, errorCode: error?.code || null }
    },
  })
  if ('error' in auth) {
    if (auth.error === 'lookup_failed') console.error('[harness/mcp] emitter lookup failed')
    res.setHeader('WWW-Authenticate', 'Bearer realm="harness-mcp"')
    return jsonRpcError(res, 401, 'Unauthorized')
  }

  const store = {
    async countToday(emitterId: string, since: string) {
      const { count, error } = await supabase
        .from('harness_event_inbox')
        .select('inbox_id', { count: 'exact', head: true })
        .eq('emitter_id', emitterId)
        .gte('received_at', since)
      return { count, errorCode: error?.code || null }
    },
    async insert(event: HarnessEvent, emitterId: string) {
      const { data, error } = await supabase
        .from('harness_event_inbox')
        .insert({ ...event, emitter_id: emitterId })
        .select('inbox_id,event_id,received_at,payload_sha256')
        .single()
      return { data, errorCode: error?.code || null }
    },
    async findByEventId(eventId: string) {
      const { data, error } = await supabase
        .from('harness_event_inbox')
        .select('inbox_id,event_id,received_at,payload_sha256')
        .eq('event_id', eventId)
        .single()
      return { data, errorCode: error?.code || null }
    },
  }
  const server = createHarnessMcpServer({ emitter: auth.emitter, store })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch {
    console.error('[harness/mcp] protocol request failed')
    if (!res.headersSent) return jsonRpcError(res, 500, 'Internal server error')
  }
}
