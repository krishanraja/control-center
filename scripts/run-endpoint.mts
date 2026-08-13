/**
 * Run a Vercel serverless handler locally against the real environment.
 *
 * `vercel dev` needs an interactive login and a port; this needs neither, and it
 * exercises the exact handler module the platform would import. It exists
 * because the failure being fixed here (a scout that returned ok:true while
 * writing nothing) is only visible by running the thing and reading what it
 * actually did.
 *
 *   npx tsx scripts/run-endpoint.mts <path-to-handler.ts> [query] [jsonBody]
 *
 * Example:
 *   npx tsx scripts/run-endpoint.mts api/discover-guest-scout.ts 'dry=1&format=paid'
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.production.local (written by `vercel env pull`) without a dep.
for (const file of ['.env.production.local', '.env.local']) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), 'utf8')
    for (const line of raw.split('\n')) {
      const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
      if (!m) continue
      if (m[2] === '[SENSITIVE]') continue
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/\\n/g, '\n')
    }
  } catch { /* file may not exist */ }
}

const [, , handlerPath, queryStr = '', bodyStr = ''] = process.argv
if (!handlerPath) {
  console.error('usage: run-endpoint.mts <handler.ts> [query] [jsonBody]')
  process.exit(1)
}

const query: Record<string, string> = {}
for (const [k, v] of new URLSearchParams(queryStr)) query[k] = v

// CRON_SECRET is marked sensitive in Vercel so `env pull` will not return it.
// LENS_RADAR_SECRET is not, and the discovery handlers accept either, so use
// that as the local key rather than weakening the check in the handler.
if (!query.secret && process.env.LENS_RADAR_SECRET) query.secret = process.env.LENS_RADAR_SECRET

const mod = await import(resolve(process.cwd(), handlerPath))
const handler = mod.default

let statusCode = 200
let payload: unknown = null
const res = {
  setHeader() { return res },
  status(c: number) { statusCode = c; return res },
  json(p: unknown) { payload = p; return res },
  end() { return res },
}
const req = {
  method: bodyStr ? 'POST' : 'GET',
  query,
  headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
  body: bodyStr ? JSON.parse(bodyStr) : undefined,
}

const t0 = Date.now()
await handler(req as never, res as never)
console.log(JSON.stringify({ statusCode, ms: Date.now() - t0, payload }, null, 2))
