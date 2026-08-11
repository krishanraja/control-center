import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, timingSafeEqual } from 'node:crypto'

// Access gate for the routes that serve private judgments about named people.
//
// middleware.ts already runs an edge gate over the whole app, and deliberately
// exempts /api/* — external monitors hit /api/health and the OS sync pipeline
// posts to /api/sync with its own secret. That exemption is fine for ~150 routes
// that return tasks and metrics. It is not fine for /api/network/*, which
// returns `why_them` and `risk`: private assessments of real, named people,
// written for one reader.
//
// So these routes re-check the same cookie the edge gate issues. No new secret,
// no new login, nothing for Krish to do: if he can see the dashboard he can
// query his network, and if he cannot, neither can anyone who found the URL.
//
// KNOWN LIMIT, stated rather than implied: `contacts` carries an RLS policy
// `contacts_anon_select ... USING (true)`, so the anon key in the browser bundle
// can already read names, companies and titles straight from PostgREST. This
// gate does not change that. What it does protect is the judgment layer, which
// lives in contact_intelligence with no anon policy at all and is reachable only
// through these routes. Closing the contacts exposure is a separate change.

const COOKIE = 'cc_access'

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

/** Constant-time string compare. Lengths are compared first because
 *  timingSafeEqual throws on a length mismatch, and both sides here are
 *  fixed-length hex digests anyway. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** True when the caller presents the cookie the edge gate issues.
 *
 *  Fails OPEN when ACCESS_CODE is unset, matching middleware.ts exactly: its
 *  comment is explicit that a missing or dropped env var must not lock Krish out
 *  of his own dashboard. Diverging here would mean a deploy that drops the var
 *  leaves the UI reachable and the Network tab silently broken, which is a worse
 *  failure than the one the fail-open is protecting against. */
export function hasAccess(req: VercelRequest): boolean {
  const code = process.env.ACCESS_CODE
  if (!code) return true
  const expected = createHash('sha256').update(code).digest('hex')
  const got = parseCookies(req.headers.cookie)[COOKIE] || ''
  return safeEqual(got, expected)
}

/** Standard header block for the gated routes.
 *
 *  Origin is pinned rather than `*`. Every other route in this repo sends
 *  Access-Control-Allow-Origin: * , which is harmless when the payload is a task
 *  list and is not harmless here — a wildcard plus credentials is how a cookie
 *  gate gets read by any page the browser happens to be on. api/internal/
 *  sonnet-proxy.ts already pins its origin for the same reason. */
export function applyGatedHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'https://controlcenter.krishraja.com')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Cache-Control', 'no-store')
}

/** Guard + preflight in one call. Returns true when the handler should stop.
 *
 *  The 401 body says nothing about why. There is no signal here worth handing to
 *  someone probing the endpoint. */
export function guard(req: VercelRequest, res: VercelResponse, methods = ['POST']): boolean {
  applyGatedHeaders(res)
  if (req.method === 'OPTIONS') { res.status(200).end(); return true }
  if (!methods.includes(req.method || '')) {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return true
  }
  if (!hasAccess(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return true
  }
  return false
}
