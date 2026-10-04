import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard, guardCronRoute } from '../_auth.js'
import { runWebInsights, readWebInsights, refreshAllowedAt, answerCanonRuling } from '../_webInsightsRun.js'

/**
 * /api/growth/web-insights - one honest read per site per day for the four
 * sites in src/lib/webProperties.ts, and the one thing only Krish can do on each.
 *
 *   GET with Authorization          - Vercel cron daily 13:20 UTC (Bearer
 *                                     CRON_SECRET), after Google has finished
 *                                     counting yesterday. ?dry_run=1 computes
 *                                     without writing or calling the model.
 *   GET (browser, cc_access cookie) - the stored reads for the Growth panel.
 *   POST { action:'refresh' }       - "Check now". Cookie or CRON_SECRET. At
 *                                     most one run per 10 minutes, 429 before.
 *   POST { action:'run', dry_run? } - manual run; Bearer CRON_SECRET only.
 *   POST { action:'answer', property, choice, job? }
 *                                   - Krish's answer to a site's open ruling
 *                                     (proof / measure / park on fulltime.fm,
 *                                     live + job / measure / retire on
 *                                     legibility.io). Cookie or CRON_SECRET.
 *                                     Stores one system_config key the next
 *                                     check reads, then returns the fresh
 *                                     read with that action already closed.
 *                                     400 on an answer the site does not
 *                                     accept, 409 when no ruling is owed.
 *
 * The rules live in api/_webInsightsCore.ts and the run in
 * api/_webInsightsRun.ts. A browser GET never sends an Authorization header,
 * so the header alone decides which GET path a request takes.
 */

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET' && req.headers.authorization) {          // Vercel cron sends Bearer CRON_SECRET
      if (guardCronRoute(req, res)) return                              // 401 on a wrong secret
      return res.json({ ok: true, run: await runWebInsights('cron', { dryRun: req.query.dry_run === '1' }) })
    }
    if (req.method === 'GET' || req.method === 'OPTIONS') {
      if (guard(req, res, ['GET', 'POST'])) return                      // cc_access cookie; fail-open like the rest of the app
      return res.json(await readWebInsights())
    }
    if (guardCronRoute(req, res)) return                                // POST: CRON_SECRET or cookie
    const body = (req.body || {}) as { action?: string; dry_run?: boolean }
    if (body.action === 'refresh') {
      const at = await refreshAllowedAt()
      if (at) {
        const s = Math.max(1, Math.ceil((Date.parse(at) - Date.now()) / 1000))
        res.setHeader('Retry-After', String(s))
        return res.status(429).json({ ok: false, error: 'too_soon', retry_after_s: s, can_refresh_at: at })
      }
      const run = await runWebInsights('refresh')
      return res.json({ ...(await readWebInsights()), run, refreshed: true })
    }
    if (body.action === 'run') {
      const secret = process.env.CRON_SECRET || ''
      if (!secret || (req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
      return res.json({ ok: true, run: await runWebInsights('run', { dryRun: !!body.dry_run }) })
    }
    if (body.action === 'answer') {
      const b = body as { property?: unknown; choice?: unknown; job?: unknown }
      const answered = await answerCanonRuling(b.property, b.choice, b.job)
      // `in` narrows here: this tree compiles without strictNullChecks, where `ok: false` does not.
      if ('error' in answered) return res.status(answered.status).json({ ok: false, error: answered.error })
      return res.json({ ...(await readWebInsights()), answered: { property: b.property, ...answered.ruling } })
    }
    return res.status(400).json({ ok: false, error: "action must be 'refresh', 'run' or 'answer'" })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
