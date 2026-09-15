import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { verdict } from '../../src/lib/hunterPayloadAccess.js'

// Krish pressed Submit. Only his browser can know that.
//
// Hunter runs in the cloud and the click happens on his machine, so without this
// the sheet keeps saying "Not applied" on a role that is applied for, which is
// the exact silence the whole system exists to stop. The employer's receipt
// email closes the loop too, but it arrives minutes later and only where the
// employer sends one.
//
// Same capability as the payload route: the token AND the key. Marking an
// application submitted is not destructive, but it does move a row on his sheet,
// so it needs the same proof of who is asking. The write is idempotent: pressing
// twice, or the receipt arriving after this, changes nothing.

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}')
    : req.body) || {}
  const token = String(body.token || '')
  const key = String(body.key || '')
  const evidence = String(body.evidence || '').slice(0, 300)
  if (!token || !key) return res.status(400).json({ error: 'token and key required' })

  const { data, error } = await supabase
    .from('hunter_application_approvals')
    .select('token, state, open_key, fill_payload, submitted_at')
    .eq('token', token)
    .maybeSingle()

  const allowed = error ? 'no' : verdict(data, key)
  // A superseded row still belongs to whoever holds the key, and an application
  // he submitted from an older link is still an application he submitted.
  if (allowed !== 'ok' && allowed !== 'superseded') {
    return res.status(404).json({ error: 'not found' })
  }
  if (data?.submitted_at) {
    return res.status(200).json({ ok: true, already: true })
  }

  const { error: wrote } = await supabase
    .from('hunter_application_approvals')
    .update({
      state: 'submitted',
      submitted_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
      failure_reason: `pressed by Krish in his own browser: ${evidence}`,
    })
    .eq('token', token)
  if (wrote) return res.status(500).json({ error: 'could not record it' })

  return res.status(200).json({ ok: true })
}
