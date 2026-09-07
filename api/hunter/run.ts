import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// The three buttons on the hunter card.
//
// Hunter is a Python program that runs on GitHub Actions. A press queues a
// row in hunter_commands (the ledger the card reads its state from) and then
// fires a repository_dispatch so the run starts within a minute. If the
// dispatch cannot be sent, the row stays queued and the hourly drain picks
// it up, so a press is never lost, only slower. The route says which of the
// two happened.

export const config = { maxDuration: 30 }

const COMMANDS = new Set(['process', 'source', 'packages'])
const HUNTER_REPO = process.env.HUNTER_REPO || 'krishanraja/hunter'

async function dispatch(command: string, commandId: number): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.HUNTER_DISPATCH_TOKEN || process.env.GITHUB_TOKEN || ''
  if (!token) return { sent: false, error: 'no dispatch token configured' }
  try {
    const r = await fetch(`https://api.github.com/repos/${HUNTER_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: `hunter-${command}`, client_payload: { command_id: String(commandId) } }),
    })
    if (r.status === 204) return { sent: true }
    const text = await r.text().catch(() => '')
    return { sent: false, error: `github ${r.status}: ${text.slice(0, 120)}` }
  } catch (e: unknown) {
    return { sent: false, error: (e as Error)?.message?.slice(0, 120) || 'dispatch failed' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // guard returns true when it has already answered the request.
  if (guard(req, res, ['POST', 'GET'])) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('hunter_commands')
      .select('id,command,state,requested_at,started_at,finished_at,result,error')
      .order('requested_at', { ascending: false })
      .limit(6)
    if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })
    return res.status(200).json({ ok: true, commands: data ?? [] })
  }

  const command = String((req.body || {}).command || '')
  if (!COMMANDS.has(command)) {
    return res.status(400).json({ ok: false, error: 'command must be process, source or packages' })
  }

  // A second press while one waits is a no-op, not a second run. The unique
  // index enforces it; this makes the answer readable rather than a 409.
  const { data: waiting } = await supabase
    .from('hunter_commands')
    .select('id,requested_at')
    .eq('command', command)
    .eq('state', 'queued')
    .maybeSingle()
  if (waiting) {
    return res.status(200).json({ ok: true, queued: false, command: waiting })
  }

  const { data, error } = await supabase
    .from('hunter_commands')
    .insert({ command, requested_by: 'krish', state: 'queued' })
    .select()
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })

  const d = await dispatch(command, data.id as number)
  return res.status(200).json({ ok: true, queued: true, dispatched: d.sent, dispatch_error: d.error, command: data })
}
