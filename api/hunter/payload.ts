import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { mayRead } from '../../src/lib/hunterPayloadAccess.js'

// What the Hunter browser extension fetches to fill one application.
//
// Krish is on Windows with no Python, and everything hunter built before this
// asked him for a terminal. A page may not read his disk, but it MAY put bytes
// it already has into a file input, so a content script can fill the whole form
// and attach the CV. It just needs the payload, and this is where it gets it.
//
// The capability is the token AND the key, and the key is the point: the payload
// carries his CV and every answer he gave, so knowing a job id must never be
// enough to read it. The key is 32 hex characters, generated per application,
// and it travels in the URL FRAGMENT of the email link, which browsers never
// send to a server. Compared in constant time, because a timing oracle on a
// secret is still a way to read the secret.
//
// Deliberately NOT behind the cc_access cookie: this is called from a
// chrome-extension:// origin with no cookies, and the capability is the whole
// point of a capability.

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // The extension calls cross-origin from chrome-extension://, which is opaque,
  // so the wildcard is the only thing that works. Nothing here is readable
  // without the key, which is what actually protects it.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const token = String(req.query.token || '')
  const key = String(req.query.key || '')
  if (!token || !key) return res.status(400).json({ error: 'token and key required' })

  const { data, error } = await supabase
    .from('hunter_application_approvals')
    .select('token, state, open_key, fill_payload')
    .eq('token', token)
    .maybeSingle()

  // One answer for every failure: a wrong key, an unknown token and a token
  // that has been cancelled all read the same from outside, so this cannot be
  // used to find out which applications exist.
  if (error || !mayRead(data, key)) {
    return res.status(404).json({ error: 'not found' })
  }

  await supabase
    .from('hunter_application_approvals')
    .update({ opened_at: new Date().toISOString() })
    .eq('token', token)

  return res.status(200).json(data.fill_payload)
}
