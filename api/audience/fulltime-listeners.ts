import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { resolveKey } from '../_connections.js'
import { FULLTIME_KEY_ENV, FULLTIME_URL_ENV, runListenerSync } from '../_fulltimeListeners.js'
import { PORTFOLIO } from '../../src/lib/portfolio.js'

// Full Time's pilot listeners, copied into Control Center every six hours.
// Ruling (Krish, 2026-10-06): "yes and 100". The definition, the row and the
// count: src/lib/pilotListeners.ts. The copy: api/_fulltimeListeners.ts.
//
//   GET (CRON_SECRET), every 6 hours   ·   POST, manual (app cookie)
//
// A run that cannot read Full Time answers 503 and writes a failed heartbeat,
// so Flows and Growth say "not connected" rather than showing 0 listeners.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  const target = PORTFOLIO.find(p => p.venture === 'full_time')?.goal?.target
  if (!target) return res.status(500).json({ ok: false, error: 'Full Time has no listener target in src/lib/portfolio.ts' })

  const [url, key] = await Promise.all([resolveKey(FULLTIME_URL_ENV), resolveKey(FULLTIME_KEY_ENV)])
  const result = await runListenerSync({
    db: supabase, fetch, url, key, target,
    trigger: req.method === 'GET' ? 'cron' : 'manual',
  })
  return res.status(result.ok ? 200 : result.status === 'not_configured' ? 503 : 502).json(result)
}
