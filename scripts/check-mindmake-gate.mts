import middleware from '../middleware'

const previous = process.env.ACCESS_CODE
process.env.ACCESS_CODE = 'test-only-access-code'

function fail(message: string): never {
  throw new Error(`Mindmake gate check failed: ${message}`)
}

try {
  for (const path of [
    '/manifest.webmanifest',
    '/mindmake-mark.svg',
    '/mindmake-wordmark.svg',
    '/mindmake-og.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-512.png',
  ]) {
    const response = await middleware(new Request(`https://control-center-mindmaker.vercel.app${path}`))
    if (response !== undefined) fail(`${path} must remain public browser metadata`)
  }

  const gate = await middleware(new Request('https://control-center-mindmaker.vercel.app/'))
  if (!gate) fail('anonymous app request did not receive the access gate')
  if (gate.headers.get('content-type') !== 'text/html; charset=utf-8') fail('access gate did not return HTML')
  if (gate.headers.get('cache-control') !== 'no-store') fail('access gate must not be cached')

  const html = await gate.text()
  for (const expected of [
    'property="og:title"',
    'property="og:description"',
    'property="og:type"',
    'property="og:url"',
    'https://control-center-mindmaker.vercel.app/mindmake-og.png',
    'name="twitter:card"',
    'src="/mindmake-mark.svg"',
  ]) {
    if (!html.includes(expected)) fail(`access gate is missing ${expected}`)
  }

  const protectedBundle = await middleware(new Request('https://control-center-mindmaker.vercel.app/assets/app.js'))
  if (!protectedBundle || protectedBundle.headers.get('content-type') !== 'text/html; charset=utf-8') {
    fail('application bundles must stay behind the access gate')
  }
} finally {
  if (previous === undefined) delete process.env.ACCESS_CODE
  else process.env.ACCESS_CODE = previous
}

console.log('Mindmake access gate: public identity metadata reachable, application bundle protected.')
