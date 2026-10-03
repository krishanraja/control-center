import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { guard } from '../_auth.js'
import { MAIL_SCOPE, CALENDAR_SCOPE } from '../_relationshipSync.js'

// GET /api/google/connect  -> Google's consent screen
//
// One-time sign-in for a Google account the service account cannot reach:
// hello@krishraja.com and krishanraja@gmail.com (2026-10-03). Read-only mail
// and calendar. The sync reads headers only; see api/_relationshipSync.ts.
//
// `state` is an HMAC of a timestamp under the OAuth client secret, so the
// callback only accepts a sign-in this route started.

export function connectState(secret: string, ts = Date.now()): string {
  const mac = crypto.createHmac('sha256', secret).update(String(ts)).digest('hex').slice(0, 32)
  return `${ts}.${mac}`
}

export function redirectUri(req: VercelRequest): string {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `https://${host}/api/google/callback`
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!id || !secret) return res.status(503).json({ ok: false, error: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set' })

  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    // offline + consent is what returns a refresh token, every time.
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    scope: ['openid', 'email', MAIL_SCOPE, CALENDAR_SCOPE].join(' '),
    state: connectState(secret),
  })
  res.setHeader('Cache-Control', 'no-store')
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
