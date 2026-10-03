import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { supabase } from '../_supabase.js'
import { connectState, redirectUri } from './connect.js'
import { SELF } from '../_relationshipSync.js'

// GET /api/google/callback?code=...&state=...
//
// Finishes the one-time sign-in from /api/google/connect: swaps the code for a
// refresh token and stores it on google_accounts (service role only). Only
// Krish's own addresses are accepted, so a stray sign-in cannot attach someone
// else's mailbox to his network.

const TEN_MINUTES = 10 * 60_000

function validState(state: string, secret: string): boolean {
  const [ts] = state.split('.')
  const n = Number(ts)
  if (!Number.isFinite(n) || Date.now() - n > TEN_MINUTES) return false
  const expected = connectState(secret, n)
  return expected.length === state.length && crypto.timingSafeEqual(Buffer.from(expected) as unknown as Uint8Array, Buffer.from(state) as unknown as Uint8Array)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!id || !secret) return res.status(503).send('Google sign-in is not configured.')

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!code || !validState(state, secret)) return res.status(400).send('This sign-in link has expired. Start again from /api/google/connect.')

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j.refresh_token || !j.id_token) {
    return res.status(400).send(`Google did not return a refresh token (${j.error || r.status}). Start again from /api/google/connect.`)
  }

  // The id_token comes straight from Google over TLS in this exchange, so its
  // payload is read without re-verifying the signature.
  const claims = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString('utf8'))
  const email = String(claims.email || '').toLowerCase()
  if (!SELF.has(email)) return res.status(403).send(`${email || 'That account'} is not one of Krish's accounts, so it was not connected.`)

  const { error } = await supabase.from('google_accounts').upsert({
    email,
    auth_kind: 'oauth',
    refresh_token: j.refresh_token,
    scopes: String(j.scope || '').split(' '),
    connected_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: 'email' })
  if (error) return res.status(500).send(`Could not save the connection: ${error.message}`)

  return res.status(200).send(`${email} is connected. Its mail and calendar sync from three years back; the first run takes a while. You can close this tab.`)
}
