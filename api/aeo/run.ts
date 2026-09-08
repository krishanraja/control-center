import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard, guardBearerExport } from '../_auth.js'
import { supabase } from '../_supabase.js'

// /api/aeo/run: Run now, and the ledger it reads its state from.
//
// The AEO engine is a GitHub Actions workflow in AEO_REPO. A press on the
// Growth tab queues a row in aeo_commands (the ledger the card renders) and
// fires repository_dispatch so the run starts within a minute. There is no
// drain: if the dispatch cannot be sent the row stays queued, the response
// says so, and the next scheduled packet supersedes it (api/aeo/ingest.ts).
// Copied from api/hunter/run.ts, which proved the shape.
//
//   GET   (cookie)  the last six commands, newest first.
//   POST  (cookie)  { subject_id? }  queue and dispatch; null means every
//                   active subject.
//   PATCH (bearer)  { command_id, state: 'running' | 'failed', error? }  the
//                   engine reporting on a command it was given.

export const config = { maxDuration: 30 }

const AEO_REPO = process.env.AEO_REPO || 'krishanraja/AEO-Engine'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function dispatch(commandId: number, subjectId: string | null): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.AEO_DISPATCH_TOKEN || ''
  if (!token) return { sent: false, error: 'no dispatch token configured' }
  try {
    const r = await fetch(`https://api.github.com/repos/${AEO_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'aeo-run', client_payload: { command_id: String(commandId), subject: subjectId ?? 'all' } }),
    })
    if (r.status === 204) return { sent: true }
    const text = await r.text().catch(() => '')
    return { sent: false, error: `github ${r.status}: ${text.slice(0, 120)}` }
  } catch (e: unknown) {
    return { sent: false, error: (e as Error)?.message?.slice(0, 120) || 'dispatch failed' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') {
    if (guardBearerExport(req, res, 'AEO_ENGINE_SECRET', ['PATCH'])) return
    const b = (req.body || {}) as Record<string, unknown>
    const id = Number(b.command_id)
    const state = b.state === 'running' || b.state === 'failed' ? b.state : null
    if (!Number.isInteger(id) || id < 1 || !state) return res.status(400).json({ ok: false, error: 'command_id and state (running or failed) required' })
    const patch: Record<string, unknown> = { state }
    if (state === 'running') patch.started_at = new Date().toISOString()
    if (state === 'failed') { patch.finished_at = new Date().toISOString(); patch.error = String(b.error || 'failed').slice(0, 600) }
    const { data, error } = await supabase.from('aeo_commands').update(patch).eq('id', id).in('state', ['queued', 'running']).select('id,state').maybeSingle()
    if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })
    return res.status(200).json({ ok: true, updated: !!data, command: data })
  }

  if (guard(req, res, ['POST', 'GET'])) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('aeo_commands')
      .select('id,subject_id,state,requested_at,started_at,finished_at,result,error')
      .order('requested_at', { ascending: false })
      .limit(6)
    if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })
    return res.status(200).json({ ok: true, commands: data ?? [] })
  }

  const raw = (req.body || {}) as Record<string, unknown>
  const subjectId = typeof raw.subject_id === 'string' && raw.subject_id ? raw.subject_id : null
  if (subjectId && !UUID.test(subjectId)) return res.status(400).json({ ok: false, error: 'subject_id must be a uuid' })

  // A second press while one waits is a no-op, not a second run. The unique
  // index enforces it; this makes the answer readable rather than a 409.
  let waitingQ = supabase.from('aeo_commands').select('id,requested_at,subject_id').eq('state', 'queued')
  waitingQ = subjectId ? waitingQ.eq('subject_id', subjectId) : waitingQ.is('subject_id', null)
  const { data: waiting } = await waitingQ.maybeSingle()
  if (waiting) return res.status(200).json({ ok: true, queued: false, command: waiting })

  const { data, error } = await supabase
    .from('aeo_commands')
    .insert({ command: 'run', subject_id: subjectId, requested_by: 'krish', state: 'queued' })
    .select()
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })

  const d = await dispatch(data.id as number, subjectId)
  return res.status(200).json({ ok: true, queued: true, dispatched: d.sent, dispatch_error: d.error, command: data })
}
