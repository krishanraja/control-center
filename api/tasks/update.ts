import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * POST /api/tasks/update
 * body: { id?, ids?, action, notes?, agent? }
 *
 * Consolidated service-role mutations for tasks. The anon client cannot write
 * to tasks under RLS (updates silently match 0 rows), so every Today-tab
 * action routes through here. One endpoint, not six — function count matters.
 *
 * Actions:
 *   approve            → status 'active', reviewed
 *   done               → status 'done', reviewed, completed_at stamped
 *   note               → krish_notes saved, reviewed
 *   push_tomorrow      → due_date pushed to tomorrow
 *   snooze_30d         → due_date pushed 30 days (bulk-capable)
 *   dismiss_superseded → status 'superseded', reviewed (bulk-capable)
 *   revision           → corrections row for the agent loop + reviewed
 */
const BULK_ACTIONS = new Set(['dismiss_superseded', 'snooze_30d'])

type Action =
  | 'approve' | 'done' | 'note' | 'push_tomorrow'
  | 'snooze_30d' | 'dismiss_superseded' | 'revision'

function payloadFor(action: Action, notes?: string): Record<string, unknown> | null {
  const now = new Date()
  switch (action) {
    case 'approve': return { status: 'active', krish_reviewed: true }
    case 'done': return { status: 'done', krish_reviewed: true, completed_at: now.toISOString() }
    case 'note': return { krish_notes: notes || '', krish_reviewed: true }
    case 'push_tomorrow': {
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
      return { due_date: tomorrow.toISOString() }
    }
    case 'snooze_30d':
      return { due_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() }
    case 'dismiss_superseded': return { status: 'superseded', krish_reviewed: true }
    case 'revision': return { krish_reviewed: true }
    default: return null
  }
}

async function logKrishAction(taskId: string, action: string, agent?: string, notes?: string) {
  await supabase.from('audit_log').insert({
    event_type: 'krish_action',
    actor: 'krish',
    target: taskId,
    details: JSON.stringify({ action, agent: agent || 'unknown', notes: notes || '' }),
  })
  fetch('https://krishraja10101.app.n8n.cloud/webhook/mindmaker-orchestrator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'krish_action', agent: agent || 'unknown', taskId, action, notes: notes || '', timestamp: new Date().toISOString() }),
  }).catch(() => {})
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = (req.body || {}) as {
    id?: string; ids?: string[]; action?: Action; notes?: string; agent?: string
  }
  const action = body.action
  if (!action) return res.status(400).json({ ok: false, error: 'action required' })

  const ids = body.ids?.length ? body.ids : body.id ? [body.id] : []
  if (!ids.length) return res.status(400).json({ ok: false, error: 'id or ids required' })
  if (ids.length > 1 && !BULK_ACTIONS.has(action)) {
    return res.status(400).json({ ok: false, error: `${action} does not support bulk ids` })
  }

  const updatePayload = payloadFor(action, body.notes)
  if (!updatePayload) return res.status(400).json({ ok: false, error: 'invalid action' })

  if (action === 'revision') {
    const { data: task } = await supabase
      .from('tasks').select('title, next_step, agent, owner').eq('id', ids[0]).maybeSingle()
    const { error: corrErr } = await supabase.from('corrections').insert({
      agent_id: body.agent || task?.agent || task?.owner || null,
      original_output: task?.next_step || task?.title || '',
      correction_instruction: body.notes || 'Needs revision',
      detection_source: 'krish-control-center',
      correction_type: 'revision_request',
      status: 'pending',
    })
    if (corrErr) return res.status(500).json({ ok: false, error: corrErr.message })
  }

  const { data: updated, error: upErr } = await supabase
    .from('tasks')
    .update({ ...updatePayload, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id')
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })
  if (!updated?.length) return res.status(404).json({ ok: false, error: 'no matching tasks' })

  for (const id of ids) await logKrishAction(id, action, body.agent, body.notes)

  return res.json({ ok: true, action, count: updated.length })
}
