import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/tasks-inbox/clarify
//   body: { id, answer }
// Appends Krish's answer to the inbox row's clarification_thread,
// flips status back to 'classifying', and re-fires the classifier
// webhook with the new context.

const N8N_WEBHOOK_ORIGIN = 'https://krishraja10101.app.n8n.cloud'
const CLASSIFY_WEBHOOK = `${N8N_WEBHOOK_ORIGIN}/webhook/idea-classify`

interface Body {
  id?: string
  answer?: string
}

interface ThreadEntry {
  by: 'krish' | 'agent'
  at: string
  text: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  const id = (body.id || '').trim()
  const answer = (body.answer || '').trim()
  if (!id)     return res.status(400).json({ ok: false, error: 'id required' })
  if (!answer) return res.status(400).json({ ok: false, error: 'answer required' })

  const { data: row, error: fetchErr } = await supabase
    .from('tasks_inbox')
    .select('id, status, clarification_thread')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr || !row) return res.status(404).json({ ok: false, error: fetchErr?.message || 'not found' })
  if (row.status === 'archived' || row.status === 'done') {
    return res.status(409).json({ ok: false, error: `inbox row is ${row.status}` })
  }

  const thread = Array.isArray(row.clarification_thread) ? (row.clarification_thread as ThreadEntry[]) : []
  thread.push({ by: 'krish', at: new Date().toISOString(), text: answer })

  const { error: upErr } = await supabase
    .from('tasks_inbox')
    .update({ clarification_thread: thread, status: 'classifying' })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  // Re-fire classifier with the new thread context. Best-effort await.
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort('classify_timeout'), 60_000)
  try {
    await fetch(CLASSIFY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inbox_id: id, with_clarification: true }),
      signal: ctrl.signal,
    })
  } catch { /* surfaced via inbox row status */ } finally {
    clearTimeout(tid)
  }

  return res.json({ ok: true, id })
}
