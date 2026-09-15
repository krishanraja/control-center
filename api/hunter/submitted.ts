import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { OPEN_STATES, maySubmit } from '../../src/lib/hunterPayloadAccess.js'

// Krish pressed Submit. Only his browser can know that.
//
// Hunter runs in the cloud and the click happens on his machine, so without this
// the sheet keeps saying "Not applied" on a role that is applied for, which is
// the exact silence the whole system exists to stop. The employer's receipt
// email closes the loop too, but it arrives minutes later and only where the
// employer sends one.
//
// Same capability as the payload route: the token AND the key. Marking an
// application submitted is not destructive, but it moves a row on his sheet, so
// it needs the same proof of who is asking.
//
// It does NOT use verdict(). That function answers a read question, and its
// 'superseded' means "not awaiting or approved", which includes 'cancelled'. A
// cancelled token is one approval.supersede() killed so a stale APPROVE could
// not land later, and accepting a submit on it would flip it back to submitted,
// archive the role off his Pipeline tab into Applied, and make hunter skip the
// APPROVE he sends for the rebuilt application. So the state is a gate here,
// checked directly, and the write itself is conditional so a race cannot get
// past it either.

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let body: Record<string, unknown> = {}
  try {
    body = ((typeof req.body === 'string' ? JSON.parse(req.body || '{}')
      : req.body) || {}) as Record<string, unknown>
  } catch {
    // A malformed body is a bad request, not a crash.
    return res.status(400).json({ error: 'body is not JSON' })
  }
  const token = String(body.token || '')
  const key = String(body.key || '')
  // What the form itself said, quoted verbatim into the receipt email. Never a
  // manufactured claim: the caller sends this only when it matched a real
  // confirmation in the page, and an empty one stays empty so the receipt says
  // "no confirmation" rather than inventing one.
  const evidence = String(body.evidence || '').slice(0, 300).trim()
  if (!token || !key) return res.status(400).json({ error: 'token and key required' })

  const { data, error } = await supabase
    .from('hunter_application_approvals')
    .select('token, state, open_key, submitted_at')
    .eq('token', token)
    .maybeSingle()
  if (error) {
    console.error('hunter/submitted: select failed', token, error.message)
    return res.status(404).json({ error: 'not found' })
  }

  const allowed = maySubmit(data, key)
  // One answer for every failure, as on the payload route: a wrong key and an
  // unknown token read identically from outside, so this cannot be used to find
  // out which applications exist.
  if (allowed === 'no') return res.status(404).json({ error: 'not found' })
  // Pressing twice, or the employer's receipt landing first, changes nothing.
  if (allowed === 'already') return res.status(200).json({ ok: true, already: true })
  if (allowed === 'gone') {
    // Cancelled, failed, amending. He holds the right key, so saying so is safe
    // and saves him a silent no-op on a tab he left open.
    return res.status(410).json({
      error: 'no longer open',
      message: 'This application was replaced or cancelled, so pressing Submit '
        + 'on it was not recorded. Open the most recent email for this role.',
    })
  }

  const { data: wroteRows, error: wrote } = await supabase
    .from('hunter_application_approvals')
    .update({
      state: 'submitted',
      submitted_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
      failure_reason: evidence,
    })
    .eq('token', token)
    // The same two conditions again, in the write, so a supersede landing
    // between the read and the write still wins.
    .is('submitted_at', null)
    .in('state', OPEN_STATES)
    .select('token')
  if (wrote) {
    console.error('hunter/submitted: update failed', token, wrote.message)
    return res.status(500).json({ error: 'could not record it' })
  }
  if (!wroteRows || wroteRows.length === 0) {
    // Something changed the row underneath us. Not an error to the caller, but
    // it must not report success either.
    console.error('hunter/submitted: nothing written, row moved', token)
    return res.status(409).json({ error: 'the application changed, not recorded' })
  }

  return res.status(200).json({ ok: true })
}
