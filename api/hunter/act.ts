import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { dispatchHunter } from '../_hunterDispatch.js'
import { checkAction } from '../../src/lib/hunterActions.js'

// POST /api/hunter/act   a button Krish pressed for hunter: a verdict, prepare
// an application, or an outcome. GET lists the recent presses and what hunter
// did with each.
//
// The press is queued in hunter_actions and hunter is woken at once. Hunter,
// the only writer of his sheet, applies it and records the result, which the
// card reads back. Nothing here sends, submits or posts: "prepare" builds the
// filled application and mails it to him to press himself.

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST', 'GET'])) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('hunter_actions')
      .select('id,kind,job_id,payload,status,result,requested_at,processed_at')
      .order('requested_at', { ascending: false })
      .limit(60)
    if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })
    return res.status(200).json({ ok: true, actions: data ?? [] })
  }

  const checked = checkAction(req.body)
  if ('error' in checked) return res.status(400).json({ ok: false, error: checked.error })
  const a = checked.action

  const { data, error } = await supabase
    .from('hunter_actions')
    .insert({ kind: a.kind, job_id: a.job_id, payload: a.payload, requested_by: 'krish' })
    .select('id,kind,job_id,payload,status,requested_at')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message.slice(0, 200) })

  // A bare drain runs the hourly upkeep, which applies the press. If the
  // dispatch is refused the press waits for the next hourly tick: slower,
  // never lost.
  const d = await dispatchHunter('hunter-drain')
  return res.status(200).json({ ok: true, action: data, dispatched: d.sent, dispatch_error: d.error })
}
