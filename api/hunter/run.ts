import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// The two buttons on the hunter card.
//
// Hunter is a Python program that runs inside a scheduled cloud session, so a
// web request cannot execute it. This queues the command; a Routine on the
// hour picks it up and runs it. The old play button wrote into `tasks`, which
// is Krish's own to-do inbox and drains nowhere, so it looked like a trigger
// and was a note. This one tells the truth about what it did.

export const config = { maxDuration: 30 }

const COMMANDS = new Set(['source', 'packages'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // guard returns true when it has already answered the request.
  if (guard(req, res, ['POST', 'GET'])) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('hunter_commands')
      .select('id,command,state,requested_at,started_at,finished_at,result,error')
      .order('requested_at', { ascending: false })
      .limit(5)
    if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })
    return res.status(200).json({ ok: true, commands: data ?? [] })
  }

  const command = String((req.body || {}).command || '')
  if (!COMMANDS.has(command)) {
    return res.status(400).json({ ok: false, error: 'command must be source or packages' })
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
  return res.status(200).json({ ok: true, queued: true, command: data })
}
