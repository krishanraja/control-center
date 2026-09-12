import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { parseHarnessEvent } from './_event.js'
import { persistHarnessEvent } from './_store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'HARNESS_EVENT_INGEST_TOKEN', ['POST'])) return

  const parsed = parseHarnessEvent(req.body)
  if ('error' in parsed) return res.status(400).json({ ok: false, error: parsed.error })

  const store = {
    async insert(event: typeof parsed.event) {
      const { data, error } = await supabase
        .from('harness_event_inbox')
        .insert(event)
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
  const result = await persistHarnessEvent(store, parsed.event)
  if (result.logCode) console.error('[harness/events] persistence failed', { code: result.logCode })
  return res.status(result.status).json(result.body)
}
