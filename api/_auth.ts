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
const exportWindows = new Map<string, { openedAt: number; count: number }>()

export function consumeExportRateLimit(identity: string, now = Date.now(), limit = 60, windowMs = 60_000): number {
  const key = createHash('sha256').update(identity).digest('hex')
  const current = exportWindows.get(key)
  if (!current || now - current.openedAt >= windowMs) {
    exportWindows.set(key, { openedAt: now, count: 1 })
    return 0
  }
  current.count += 1
  if (current.count <= limit) return 0
  return Math.max(1, Math.ceil((windowMs - (now - current.openedAt)) / 1000))
}

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
  // Buffer is a Uint8Array at runtime; @types/node >=22 narrows the parameter
  // to Uint8Array<ArrayBuffer> while Buffer carries ArrayBufferLike, so the
  // assignment is rejected on a type that is structurally identical.
  return timingSafeEqual(ba as unknown as Uint8Array, bb as unknown as Uint8Array)
}

/** Fail-closed bearer guard for machine clients that must not inherit the
 * dashboard cookie's deliberate fail-open behaviour. It emits no CORS origin:
 * these exports are for server/CLI callers, never arbitrary browser pages. */
export function guardBearerExport(
  req: VercelRequest,
  res: VercelResponse,
  envName: string,
  methods = ['GET'],
): boolean {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', 'Authorization')
  res.setHeader('Allow', methods.join(', '))
  if (!methods.includes(req.method || '')) {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return true
  }
  const secret = process.env[envName] || ''
  const authorization = req.headers.authorization || ''
  if (!secret || !safeEqual(authorization, `Bearer ${secret}`)) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return true
  }
  const retryAfter = consumeExportRateLimit(secret)
  if (retryAfter > 0) {
    res.setHeader('Retry-After', String(retryAfter))
    res.status(429).json({ ok: false, error: 'rate_limited' })
    return true
  }
  return false
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

/** Fail-closed browser or operator bearer gate for service-role read routes.
 * Unlike the dashboard-wide guard, an absent ACCESS_CODE never grants access. */
export function guardSensitiveRead(req: VercelRequest, res: VercelResponse, methods = ['GET']): boolean {
  applyGatedHeaders(res)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(204).end(); return true }
  if (!methods.includes(req.method || '')) {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return true
  }
  const accessCode = process.env.ACCESS_CODE || ''
  const expectedCookie = accessCode ? createHash('sha256').update(accessCode).digest('hex') : ''
  const suppliedCookie = parseCookies(req.headers.cookie)[COOKIE] || ''
  const browserAllowed = Boolean(expectedCookie) && safeEqual(suppliedCookie, expectedCookie)
  const exportToken = process.env.VIDEO_STUDIO_EXPORT_TOKEN || ''
  const authorization = req.headers.authorization || ''
  const bearerAllowed = Boolean(exportToken) && safeEqual(authorization, `Bearer ${exportToken}`)
  if (!browserAllowed && !bearerAllowed) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return true
  }
  if (bearerAllowed) {
    const retryAfter = consumeExportRateLimit(exportToken)
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ ok: false, error: 'rate_limited' })
      return true
    }
  }
  return false
}

/** Guard for the cron-driven routes: `GET` from Vercel's scheduler with the
 *  CRON_SECRET, or a manual `POST` from someone who is already through the edge
 *  gate (or who holds the secret).
 *
 *  These routes were written GET-with-secret / POST-with-nothing, copied from
 *  each other. middleware.ts deliberately exempts /api/*, so the POST arm was
 *  reachable by anyone on the internet. Verified on production 2026-08-20:
 *  an unauthenticated POST to /api/content-ideas/archive-stale returned 200 and
 *  ran. On a route that only reads that is a nuisance; on /api/purge/run, which
 *  hard-deletes content_ideas, it is not.
 *
 *  Returns true when the handler should stop. Callers must return immediately.
 *
 *  Fail-open on ACCESS_CODE is inherited from hasAccess and is deliberate, but
 *  it is NOT the whole gate here: an unset ACCESS_CODE still leaves CRON_SECRET
 *  as the check for GET, and a POST still has to come from a browser that
 *  reached the app. */
export function guardCronRoute(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('Cache-Control', 'no-store')
  // Preflight is answered before any auth check. Callers that set their own
  // CORS headers do so before calling this, so those survive.
  if (req.method === 'OPTIONS') { res.status(204).end(); return true }
  const secret = process.env.CRON_SECRET || ''
  const auth = req.headers.authorization || ''
  const hasSecret = Boolean(secret) && safeEqual(auth, `Bearer ${secret}`)

  if (req.method === 'GET') {
    if (!hasSecret) { res.status(401).json({ ok: false, error: 'unauthorized' }); return true }
    return false
  }
  if (req.method === 'POST') {
    if (!hasSecret && !hasAccess(req)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return true }
    return false
  }
  res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })
  return true
}
