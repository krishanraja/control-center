import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { supabase } from '../_supabase.js'

const MAX_LIMIT = 100

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'HARNESS_EVENT_EXPORT_TOKEN', ['GET'])) return

  const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
  const cursor = rawCursor == null ? 0 : Number(rawCursor)
  const limit = rawLimit == null ? MAX_LIMIT : Number(rawLimit)
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    return res.status(400).json({ ok: false, error: 'invalid_cursor' })
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return res.status(400).json({ ok: false, error: 'invalid_limit' })
  }

  const { data, error } = await supabase
    .from('harness_event_inbox')
    .select('inbox_id,event_id,schema_version,occurred_at,received_at,surface,kind,summary,evidence_ref,related_skill_or_rule,outcome,severity,confidence,payload_sha256')
    .gt('inbox_id', cursor)
    .order('inbox_id', { ascending: true })
    .limit(limit + 1)

  if (error) {
    console.error('[harness/export] read failed', { code: error.code })
    return res.status(500).json({ ok: false, error: 'read_failed' })
  }

  const rows = data || []
  const hasMore = rows.length > limit
  const events = rows.slice(0, limit)
  const nextCursor = events.length ? events[events.length - 1].inbox_id : cursor
  return res.json({ ok: true, events, next_cursor: nextCursor, has_more: hasMore })
}
