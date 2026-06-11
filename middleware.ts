// Edge gate for the Control Center web UI.
//
// A lightweight HTTP Basic Auth curtain so the dashboard isn't publicly
// browsable. This is intentionally NOT full authentication: the Supabase data
// layer keeps its own model (anon key + RLS). The gate exists to keep casual /
// public eyes off the business OS — it runs at Vercel's edge, before the app
// (and the JS bundle that carries the Supabase anon key) is ever served to an
// anonymous visitor.
//
// The expected code lives in the server-only `ACCESS_CODE` env var, so it is
// never shipped in the browser bundle. Change it in Vercel → Project Settings →
// Environment Variables and redeploy; no code change required.
//
// `/api/*` is intentionally NOT gated: external monitors hit `/api/health`, and
// the OS sync pipeline posts to `/api/sync` with its own shared secret. Those
// endpoints carry their own auth and must stay reachable.

export const config = {
  // Gate every route except the API surface. Static assets are gated too, so
  // the bundle isn't handed out before the code is entered; once the browser
  // has authenticated it replays the Authorization header on every request.
  matcher: ['/((?!api/).*)'],
}

export default function middleware(request: Request): Response | undefined {
  const code = process.env.ACCESS_CODE

  // Fail open when no code is configured, so a missing/dropped env var can't
  // lock Krish out of his own dashboard. Set ACCESS_CODE in Vercel to arm it.
  if (!code) return undefined

  const header = request.headers.get('authorization') || ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6))
      const sep = decoded.indexOf(':')
      const user = sep === -1 ? decoded : decoded.slice(0, sep)
      const pass = sep === -1 ? '' : decoded.slice(sep + 1)
      // Accept the code in either field, so "just type the code" works whether
      // it lands in the username or the password box of the browser prompt.
      if (pass === code || user === code) return undefined
    } catch {
      // Malformed header — fall through to the 401 challenge below.
    }
  }

  return new Response('Access code required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mindmaker Control Center", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
