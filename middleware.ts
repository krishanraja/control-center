// Edge gate for the Control Center web UI.
//
// A lightweight single-field "access code" curtain so the dashboard isn't
// publicly browsable. This is intentionally NOT full authentication: the
// Supabase data layer keeps its own model (anon key + RLS). The gate runs at
// Vercel's edge, before the app (and the JS bundle that carries the Supabase
// anon key) is ever served to an anonymous visitor.
//
// The expected code lives in the server-only `ACCESS_CODE` env var, so it is
// never shipped in the browser bundle. Change it in Vercel → Project Settings →
// Environment Variables and redeploy; no code change required.
//
// How it works: an un-unlocked request gets a branded one-field unlock page.
// Submitting the correct code sets an HttpOnly cookie whose value is the
// SHA-256 of the code (so the raw code never travels in the cookie and the
// cookie can't be forged without knowing the code), then redirects in. Every
// later request just checks that cookie.
//
// `/api/*` is intentionally NOT gated: external monitors hit `/api/health`, and
// the OS sync pipeline posts to `/api/sync` with its own shared secret.

export const config = {
  // Gate every route except the API surface. Static assets are gated too, so
  // the bundle isn't handed out before the code is entered.
  matcher: ['/((?!api/).*)'],
}

const COOKIE = 'cc_access'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const UNLOCK_PATH = '/__unlock'

// Static browser metadata that must be served ungated.
//
// The manifest is the one that actually broke: a `<link rel="manifest">` fetch
// is anonymous by default (no cookies unless the tag opts in with
// crossorigin="use-credentials"), so the gate answered it with the HTML unlock
// page under Content-Type: text/html and every page logged
// `Manifest: Line: 1, column: 1, Syntax error.` The icons are here for the same
// class of reason: apple-touch-icon and the maskable icons are fetched by the
// OS installer rather than the page, and the manifest itself references them,
// so a gated icon would break install even once the manifest parses.
//
// Nothing on this list carries data. The JS bundle (which does carry the
// Supabase anon key) stays gated.
const PUBLIC_STATIC = new Set([
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.png',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon-48.png',
  '/favicon-180.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/mindmake-mark.svg',
  '/mindmake-wordmark.svg',
  '/mindmake-og.png',
])

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function unlockPage(showError: boolean): Response {
  const error = showError
    ? '<p class="err">That code didn\'t match. Try again.</p>'
    : ''
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta property="og:title" content="Mindmake · Control Center" />
<meta property="og:description" content="Decisions without admin. An AI operations command centre." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://control-center-mindmaker.vercel.app/" />
<meta property="og:image" content="https://control-center-mindmaker.vercel.app/mindmake-og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Mindmake" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://control-center-mindmaker.vercel.app/mindmake-og.png" />
<title>Mindmake · Control Center</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #0a100d; color: #e6ede8;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    width: 100%; max-width: 360px; text-align: center; padding: 30px;
    background: #111a16; border: 1px solid #22322b; border-radius: 24px;
    box-shadow: 0 28px 80px -40px rgba(0,0,0,.9), inset 0 1px rgba(230,237,232,.04);
  }
  .logo {
    display: block; width: 58px; height: 52px; object-fit: contain; margin: 0 auto 22px;
    filter: drop-shadow(0 10px 22px rgba(0,0,0,.45));
  }
  h1 { font-size: 20px; letter-spacing: -.02em; font-weight: 700; margin: 0 0 6px; }
  .sub { color: #b0c0b7; font-size: 13px; margin: 0 0 24px; }
  input {
    width: 100%; padding: 12px 14px; border-radius: 10px;
    background: #0a100d; border: 1px solid #30463d; color: #e6ede8;
    font-size: 16px; outline: none; text-align: center;
  }
  input:focus-visible { border-color: #7fe3b4; box-shadow: 0 0 0 3px rgba(127,227,180,.14); }
  button {
    width: 100%; margin-top: 12px; padding: 12px 14px; border: 0; border-radius: 10px;
    background: #7fe3b4; color: #0a100d; font-size: 15px; font-weight: 700; cursor: pointer;
    transition: transform 120ms ease, filter 120ms ease;
  }
  button:hover { filter: brightness(1.04); }
  button:active { transform: translateY(1px) scale(.99); }
  button:focus-visible { outline: 2px solid #7fe3b4; outline-offset: 3px; }
  .err { color: #e0a44a; font-size: 13px; margin: 14px 0 0; }
</style>
</head>
<body>
  <form class="card" method="POST" action="${UNLOCK_PATH}">
    <img class="logo" src="/mindmake-mark.svg" alt="Mindmake" />
    <h1>Control Center</h1>
    <p class="sub">Enter your access code to continue.</p>
    <input name="code" type="password" autocomplete="current-password"
           autofocus placeholder="Access code" aria-label="Access code" />
    <button type="submit">Unlock</button>
    ${error}
  </form>
</body>
</html>`
  return new Response(html, {
    status: showError ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const code = process.env.ACCESS_CODE

  // Fail open when no code is configured, so a missing/dropped env var can't
  // lock Krish out of his own dashboard. Set ACCESS_CODE in Vercel to arm it.
  if (!code) return undefined

  const url = new URL(request.url)

  // Static browser metadata is served ungated (see PUBLIC_STATIC): the manifest
  // fetch carries no cookie, so gating it returned HTML where JSON was expected.
  if (PUBLIC_STATIC.has(url.pathname)) return undefined

  const token = await sha256Hex(code)

  // Unlock submission: check the code, set the cookie, redirect in.
  if (request.method === 'POST' && url.pathname === UNLOCK_PATH) {
    const form = new URLSearchParams(await request.text())
    if ((form.get('code') || '').trim() === code) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
          'Cache-Control': 'no-store',
        },
      })
    }
    return unlockPage(true)
  }

  // Already unlocked? (cookie value must equal the hash of the current code,
  // so rotating ACCESS_CODE automatically invalidates old cookies.)
  const cookies = (request.headers.get('cookie') || '').split(/;\s*/)
  if (cookies.includes(`${COOKIE}=${token}`)) return undefined

  // Otherwise, show the single-field unlock page.
  return unlockPage(false)
}
